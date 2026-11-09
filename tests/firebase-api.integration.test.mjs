import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '../server/app.mjs';
import { ensureIndexes } from '../server/db.mjs';

const uri = process.env.MONGODB_TEST_URI;
test('Firebase authentication and account synchronization', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_auth_test_${randomUUID().replaceAll('-', '')}`);
    const origin = 'https://ewha-consulting.web.app';
    const accounts = new Map([['admin', { uid: 'admin', email: 'admin@example.test', password: 'admin-password', disabled: false }]]);
    let failUpdate = false;
    const firebaseAuth = {
        async signIn(email, password) { return [...accounts.values()].find(u => u.email === email && u.password === password && !u.disabled)?.uid || null; },
        async createUser(user) { accounts.set(user.uid, { ...user }); },
        async updateUser(uid, patch) { if (failUpdate) throw Error('unavailable'); Object.assign(accounts.get(uid), patch); },
        async deleteUser(uid) { accounts.delete(uid); },
    };
    let server;
    try {
        await ensureIndexes(db);
        await db.collection('users').insertOne({ _id: 'admin', uid: 'admin', userId: '805246', email: 'admin@example.test', name: '관리자', role: 'admin', status: 'approved', authVersion: 0 });
        server = createApp({ db, client, firebaseAuth, config: { origin, secure: true, sessionTransport: 'bearer', authProvider: 'firebase' } }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        let token, csrf;
        const request = async (path, method = 'GET', body) => {
            const response = await fetch(base + path, { method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: response.status, data: await response.json() };
        };
        const bootstrap = await request('/auth/session'); token = bootstrap.data.sessionToken; csrf = bootstrap.data.csrfToken;
        assert.equal((await request('/auth/login', 'POST', { identifier: '805246', password: 'wrong' })).status, 401);
        const login = await request('/auth/login', 'POST', { identifier: '805246', password: 'admin-password' });
        assert.equal(login.status, 200); token = login.data.sessionToken; csrf = login.data.csrfToken;
        const created = await request('/users', 'POST', { userId: 'consultant', name: '컨설턴트', email: 'consultant@example.test', password: 'initial-password' });
        assert.equal(created.status, 201);
        const uid = created.data.uid;
        assert.equal(accounts.get(uid).email, 'consultant@example.test');
        assert.equal((await db.collection('users').findOne({ uid })).passwordHash, undefined);
        const beforeCount = accounts.size;
        assert.equal((await request('/users', 'POST', { userId: 'consultant', name: '중복', email: 'another@example.test', password: 'initial-password' })).status, 409);
        assert.equal(accounts.size, beforeCount, 'failed MongoDB insert removes the newly created Firebase user');
        const adminToken = token, adminCsrf = csrf;
        token = csrf = undefined;
        const newGuest = await request('/auth/session'); token = newGuest.data.sessionToken; csrf = newGuest.data.csrfToken;
        accounts.get(uid).uid = 'wrong-uid';
        assert.equal((await request('/auth/login', 'POST', { identifier: 'consultant', password: 'initial-password' })).status, 401);
        accounts.get(uid).uid = uid;
        assert.equal((await request('/auth/login', 'POST', { identifier: 'consultant', password: 'initial-password' })).status, 200);
        token = adminToken; csrf = adminCsrf;
        const changed = await request(`/users/${uid}`, 'PATCH', { email: 'new@example.test', password: 'changed-password' });
        assert.equal(changed.status, 200);
        assert.equal(accounts.get(uid).email, 'new@example.test');
        assert.equal(accounts.get(uid).password, 'changed-password');
        const disposable = await request('/users', 'POST', { userId: 'disposable', name: '삭제', email: 'delete@example.test', password: 'initial-password' });
        assert.equal(disposable.status, 201);
        assert.equal((await request(`/users/${disposable.data.uid}`, 'DELETE')).status, 200);
        assert.equal(accounts.has(disposable.data.uid), false);
        assert.equal(await db.collection('users').findOne({ uid: disposable.data.uid }), null);
        failUpdate = true;
        assert.equal((await request(`/users/${uid}`, 'PATCH', { password: 'another-password' })).status, 500);
        assert.equal((await db.collection('users').findOne({ uid })).authSyncPending, true);
        const guest = await request('/auth/session'); token = guest.data.sessionToken; csrf = guest.data.csrfToken;
        assert.equal((await request('/auth/login', 'POST', { identifier: 'consultant', password: 'changed-password' })).status, 401);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.dropDatabase();
        await client.close();
    }
});
