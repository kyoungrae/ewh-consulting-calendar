import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '../server/app.mjs';
import { ensureIndexes } from '../server/db.mjs';

const uri = process.env.MONGODB_TEST_URI;
test('Firebase-only accounts log in without MongoDB users and retain Firebase roles', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_auth_test_${randomUUID().replaceAll('-', '')}`);
    const origin = 'https://ewha-consulting.web.app';
    const accounts = new Map([
        ['admin', { uid: 'admin', email: 'admin@example.test', password: 'admin-password', disabled: false, tokensValidAfterTime: 'v1' }],
        ['firebase-only', { uid: 'firebase-only', email: 'solo@example.test', password: 'solo-password', disabled: false, tokensValidAfterTime: 'v1' }],
    ]);
    const profiles = new Map([['admin', { userId: '805246', name: '관리자', role: 'admin', status: 'approved', authVersion: 0 }]]);
    let failUpdate = false;
    const firebaseAuth = {
        async signIn(email, password) { return [...accounts.values()].find(u => u.email === email && u.password === password && !u.disabled)?.uid || null; },
        async createUser(user) { accounts.set(user.uid, { ...user, tokensValidAfterTime: 'v1' }); },
        async updateUser(uid, patch) { if (failUpdate) throw Error('unavailable'); Object.assign(accounts.get(uid), patch); },
        async deleteUser(uid) { accounts.delete(uid); },
    };
    const directory = {
        async get(uid) {
            const identity = accounts.get(uid); if (!identity) return null;
            const profile = profiles.get(uid);
            return { ...profile, _id: uid, uid, email: identity.email, name: profile?.name || identity.displayName || identity.email, role: profile?.role || 'consultant', status: profile ? (profile.status || 'pending') : 'approved', hasProfile: Boolean(profile), disabled: identity.disabled, tokensValidAfterTime: identity.tokensValidAfterTime };
        },
        async lookup(value, byName) {
            if (!byName && value.includes('@')) return { email: value, uid: null };
            const matches = [...profiles].filter(([, p]) => byName ? p.name === value && p.role === 'consultant' : p.userId === value);
            if (matches.length !== 1) return null;
            return { uid: matches[0][0], email: accounts.get(matches[0][0])?.email };
        },
        async list() { return Promise.all([...accounts.keys()].map(uid => this.get(uid))); },
        async idExists(id) { return [...profiles.values()].some(p => p.userId === id); },
        async create(uid, fields) { profiles.set(uid, { ...fields }); },
        async lock(user) { const previous = profiles.get(user.uid) || { role: user.role, status: user.status }; if (previous.authSyncPending) throw Error('locked'); profiles.set(user.uid, { ...previous, authSyncPending: true, authVersion: (previous.authVersion || 0) + 1 }); },
        async finish(uid, patch) { const next = { ...profiles.get(uid), ...patch }; delete next.authSyncPending; profiles.set(uid, next); },
        async update(user, patch) { profiles.set(user.uid, { role: user.role, status: user.status, ...profiles.get(user.uid), ...patch }); },
        async remove(uid) { profiles.delete(uid); },
    };
    let server;
    try {
        await ensureIndexes(db);
        // A stale MongoDB role must not grant privileges to a Firebase-only account.
        await db.collection('users').insertOne({ _id: 'firebase-only', uid: 'firebase-only', role: 'admin', status: 'approved' });
        server = createApp({ db, client, firebaseAuth, firebaseDirectory: directory, config: { origin, secure: true, sessionTransport: 'bearer', authProvider: 'firebase' } }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        let token, csrf;
        const request = async (path, method = 'GET', body) => {
            const response = await fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: response.status, data: await response.json() };
        };
        const bootstrap = async () => { token = csrf = undefined; const result = await request('/auth/session'); token = result.data.sessionToken; csrf = result.data.csrfToken; };
        await bootstrap();
        const solo = await request('/auth/login', 'POST', { identifier: 'solo@example.test', password: 'solo-password' });
        assert.equal(solo.status, 200); assert.equal(solo.data.profile.role, 'consultant');
        token = solo.data.sessionToken; csrf = solo.data.csrfToken;
        assert.equal((await request('/users')).status, 200);
        assert.equal((await request('/users', 'POST', { userId: 'x', name: 'x', email: 'x@example.test', password: '12345678' })).status, 403);
        accounts.get('firebase-only').disabled = true;
        assert.equal((await request('/users')).status, 401);
        accounts.get('firebase-only').disabled = false;
        await bootstrap();
        assert.equal((await request('/auth/login', 'POST', { identifier: '805246', password: 'wrong' })).status, 401);
        const login = await request('/auth/login', 'POST', { identifier: '805246', password: 'admin-password' });
        assert.equal(login.status, 200); assert.equal(login.data.profile.role, 'admin'); token = login.data.sessionToken; csrf = login.data.csrfToken;
        const created = await request('/users', 'POST', { userId: 'consultant', name: '컨설턴트', email: 'consultant@example.test', password: 'initial-password' });
        assert.equal(created.status, 201);
        const uid = created.data.uid;
        assert.equal(accounts.get(uid).email, 'consultant@example.test');
        assert.equal(profiles.get(uid).password, undefined);
        assert.equal(await db.collection('users').findOne({ uid }), null);
        assert.equal((await request('/users', 'POST', { userId: 'consultant', name: '중복', email: 'other@example.test', password: 'initial-password' })).status, 409);
        const changed = await request(`/users/${uid}`, 'PATCH', { email: 'new@example.test', password: 'changed-password' });
        assert.equal(changed.status, 200); assert.equal(accounts.get(uid).email, 'new@example.test'); assert.equal(accounts.get(uid).password, 'changed-password');
        failUpdate = true;
        assert.equal((await request(`/users/${uid}`, 'PATCH', { password: 'another-password' })).status, 500);
        assert.equal(profiles.get(uid).authSyncPending, true);
        await bootstrap();
        assert.equal((await request('/auth/login', 'POST', { identifier: 'new@example.test', password: 'changed-password' })).status, 401);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.dropDatabase();
        await client.close();
    }
});
