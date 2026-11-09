import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '../server/app.mjs';
import { ensureIndexes } from '../server/db.mjs';

const uri = process.env.MONGODB_TEST_URI;
test('Firebase login and MongoDB user state enforce roles, revoke sessions and fail closed', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_auth_test_${randomUUID().replaceAll('-', '')}`);
    const origin = 'https://ewha-consulting.web.app';
    const accounts = new Map([
        ['admin', { uid: 'admin', email: 'admin@example.test', password: 'admin-password', disabled: false, tokensValidAfterTime: 'v1' }],
        ['firebase-only', { uid: 'firebase-only', email: 'Solo@Example.test', password: 'solo-password', disabled: false, tokensValidAfterTime: 'v1' }],
    ]);
    const profiles = new Map([['admin', { userId: '805246', name: '관리자', role: 'admin', status: 'approved', authVersion: 0 }]]);
    let failUpdate = false;
    let failRead = false;
    let directoryReads = 0;
    let signInGate, updateGate, profileGate;
    const gate = () => {
        let started, release;
        const entered = new Promise(resolve => { started = resolve; });
        const wait = new Promise(resolve => { release = resolve; });
        return { entered, started, wait, release };
    };
    const firebaseAuth = {
        async signIn(email, password) {
            const held = signInGate;
            if (held) { signInGate = null; held.started(); await held.wait; }
            return [...accounts.values()].find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password && !u.disabled)?.uid || null;
        },
        async createUser(user) { accounts.set(user.uid, { ...user, tokensValidAfterTime: 'v1' }); },
        async updateUser(uid, patch) {
            const held = updateGate;
            if (held) { updateGate = null; held.started(); await held.wait; }
            if (failUpdate) throw Error('unavailable');
            Object.assign(accounts.get(uid), patch);
        },
        async deleteUser(uid) { accounts.delete(uid); },
    };
    const directory = {
        async get(uid) {
            directoryReads += 1;
            if (failRead) throw Error('Firebase unavailable');
            const identity = accounts.get(uid); if (!identity) return null;
            const profile = profiles.get(uid);
            return { ...profile, _id: uid, uid, email: identity.email.toLowerCase(), name: profile?.name || identity.displayName || identity.email, role: profile?.role || 'consultant', status: profile ? (profile.status || 'pending') : 'approved', hasProfile: Boolean(profile), disabled: identity.disabled, tokensValidAfterTime: identity.tokensValidAfterTime };
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
        async update(user, patch) {
            const held = profileGate;
            if (held) { profileGate = null; held.started(); await held.wait; }
            profiles.set(user.uid, { role: user.role, status: user.status, ...profiles.get(user.uid), ...patch });
        },
        async remove(uid) { profiles.delete(uid); },
    };
    let server;
    try {
        await ensureIndexes(db);
        // A stale MongoDB role must not grant privileges to a Firebase-only account.
        await db.collection('users').insertOne({ _id: 'firebase-only', uid: 'firebase-only', role: 'admin', status: 'approved' });
        for (const uid of accounts.keys()) {
            const user = await directory.get(uid);
            await db.collection('firebase_user_states').insertOne({ ...user, _id: uid, uid, authVersion: user.authVersion || 0 });
        }
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
        await bootstrap();
        const mixedCaseSolo = await request('/auth/login', 'POST', { identifier: 'SOLO@EXAMPLE.TEST', password: 'solo-password' });
        assert.equal(mixedCaseSolo.status, 200);
        token = mixedCaseSolo.data.sessionToken; csrf = mixedCaseSolo.data.csrfToken;
        assert.equal((await request('/users')).status, 200);
        assert.equal((await request('/users', 'POST', { userId: 'x', name: 'x', email: 'x@example.test', password: '12345678' })).status, 403);
        const beforeRead = directoryReads;
        failRead = true;
        assert.equal((await request('/schedules')).status, 200);
        assert.equal((await request('/users')).status, 200);
        assert.equal((await request('/auth/session')).status, 200);
        assert.equal(directoryReads, beforeRead, 'protected API must not re-read Firebase user status');
        failRead = false;
        await db.collection('firebase_user_states').updateOne({ _id: 'firebase-only' }, { $set: { disabled: true } });
        assert.equal((await request('/schedules')).status, 401);
        await db.collection('firebase_user_states').updateOne({ _id: 'firebase-only' }, { $set: { disabled: false } });
        await bootstrap();
        assert.equal((await request('/auth/login', 'POST', { identifier: '805246', password: 'wrong' })).status, 401);
        const login = await request('/auth/login', 'POST', { identifier: '805246', password: 'admin-password' });
        assert.equal(login.status, 200); assert.equal(login.data.profile.role, 'admin'); token = login.data.sessionToken; csrf = login.data.csrfToken;
        const created = await request('/users', 'POST', { userId: 'consultant', name: '컨설턴트', email: 'consultant@example.test', password: 'initial-password' });
        assert.equal(created.status, 201);
        const uid = created.data.uid;
        assert.equal(accounts.get(uid).email, 'consultant@example.test');
        assert.equal(profiles.get(uid).password, undefined);
        const localUser = await db.collection('firebase_user_states').findOne({ _id: uid });
        assert.equal(localUser.uid, uid);
        assert.equal(localUser.role, 'consultant');
        assert.equal(localUser.status, 'approved');
        assert.equal(localUser.password, undefined);
        assert.equal(localUser.passwordHash, undefined);
        assert.equal((await request('/users', 'POST', { userId: 'consultant', name: '중복', email: 'other@example.test', password: 'initial-password' })).status, 409);
        const adminToken = token, adminCsrf = csrf;
        await bootstrap();
        const consultantLogin = await request('/auth/login', 'POST', { identifier: 'consultant', password: 'initial-password' });
        assert.equal(consultantLogin.status, 200);
        let consultantToken = consultantLogin.data.sessionToken, consultantCsrf = consultantLogin.data.csrfToken;
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${uid}`, 'PATCH', { role: 'tester' })).status, 200);
        token = consultantToken; csrf = consultantCsrf;
        assert.equal((await request('/schedules')).status, 401, 'role changes invalidate the previous session');
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${uid}`, 'PATCH', { role: 'consultant' })).status, 200);
        await bootstrap();
        const relogin = await request('/auth/login', 'POST', { identifier: 'consultant', password: 'initial-password' });
        assert.equal(relogin.status, 200);
        consultantToken = relogin.data.sessionToken; consultantCsrf = relogin.data.csrfToken;
        token = adminToken; csrf = adminCsrf;
        const changed = await request(`/users/${uid}`, 'PATCH', { email: 'new@example.test', password: 'changed-password' });
        assert.equal(changed.status, 200); assert.equal(accounts.get(uid).email, 'new@example.test'); assert.equal(accounts.get(uid).password, 'changed-password');
        token = consultantToken; csrf = consultantCsrf;
        assert.equal((await request('/schedules')).status, 401, 'password change must invalidate existing sessions');
        await bootstrap();
        const currentLogin = await request('/auth/login', 'POST', { identifier: 'new@example.test', password: 'changed-password' });
        assert.equal(currentLogin.status, 200);
        const currentToken = currentLogin.data.sessionToken, currentCsrf = currentLogin.data.csrfToken;
        token = adminToken; csrf = adminCsrf;
        failUpdate = true;
        assert.equal((await request(`/users/${uid}`, 'PATCH', { password: 'another-password' })).status, 500);
        assert.equal(profiles.get(uid).authSyncPending, true);
        assert.equal((await db.collection('firebase_user_states').findOne({ _id: uid })).authSyncPending, true);
        token = currentToken; csrf = currentCsrf;
        assert.equal((await request('/schedules')).status, 503, 'a failed account change must block the previously active session');
        await bootstrap();
        assert.equal((await request('/auth/login', 'POST', { identifier: 'new@example.test', password: 'changed-password' })).status, 401);

        // Administrative suspension/deletion revoke an already issued session,
        // and a later re-approval does not make that old session valid again.
        failUpdate = false;
        token = adminToken; csrf = adminCsrf;
        const second = await request('/users', 'POST', { userId: 'second', name: '두번째', email: 'second@example.test', password: 'initial-password' });
        assert.equal(second.status, 201);
        const secondUid = second.data.uid;
        await bootstrap();
        const secondLogin = await request('/auth/login', 'POST', { identifier: 'second', password: 'initial-password' });
        assert.equal(secondLogin.status, 200);
        const secondToken = secondLogin.data.sessionToken, secondCsrf = secondLogin.data.csrfToken;
        token = adminToken; csrf = adminCsrf;
        const profileHold = profileGate = gate();
        const pendingProfile = request(`/users/${secondUid}`, 'PATCH', { tel: '010-1111-2222' });
        await profileHold.entered;
        token = secondToken; csrf = secondCsrf;
        assert.equal((await request('/auth/session')).status, 503, 'a temporary profile lock must not regenerate the session');
        profileHold.release();
        assert.equal((await pendingProfile).status, 200);
        assert.equal((await request('/schedules')).status, 200, 'non-security profile edits preserve the session');
        token = adminToken; csrf = adminCsrf;
        const updateHold = updateGate = gate();
        const pendingSuspend = request(`/users/${secondUid}`, 'PATCH', { status: 'suspended' });
        await updateHold.entered;
        token = secondToken; csrf = secondCsrf;
        assert.equal((await request('/schedules')).status, 503, 'a pending change locks the old session before Firebase finishes');
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${secondUid}`, 'PATCH', { tel: '010-3333-4444' })).status, 409, 'concurrent edits must not bypass the lock');
        updateHold.release();
        assert.equal((await pendingSuspend).status, 200);
        assert.equal(accounts.get(secondUid).disabled, true);
        assert.equal((await db.collection('firebase_user_states').findOne({ _id: secondUid })).status, 'suspended');
        token = secondToken; csrf = secondCsrf;
        assert.equal((await request('/schedules')).status, 401);
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${secondUid}`, 'PATCH', { status: 'approved' })).status, 200);
        token = secondToken; csrf = secondCsrf;
        assert.equal((await request('/schedules')).status, 401, 're-approval must not revive a revoked session');
        await bootstrap();
        const signInHold = signInGate = gate();
        const pendingLogin = request('/auth/login', 'POST', { identifier: 'second', password: 'initial-password' });
        await signInHold.entered;
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${secondUid}`, 'PATCH', { status: 'suspended' })).status, 200);
        signInHold.release();
        assert.equal((await pendingLogin).status, 401, 'a concurrent suspension must prevent issuing a valid login');
        assert.equal((await request(`/users/${secondUid}`, 'PATCH', { status: 'approved' })).status, 200);
        await bootstrap();
        const renewed = await request('/auth/login', 'POST', { identifier: 'second', password: 'initial-password' });
        assert.equal(renewed.status, 200);
        const renewedToken = renewed.data.sessionToken, renewedCsrf = renewed.data.csrfToken;
        token = adminToken; csrf = adminCsrf;
        assert.equal((await request(`/users/${secondUid}`, 'DELETE')).status, 200);
        assert.equal(await db.collection('firebase_user_states').findOne({ _id: secondUid }), null);
        token = renewedToken; csrf = renewedCsrf;
        assert.equal((await request('/schedules')).status, 401);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.dropDatabase();
        await client.close();
    }
});
