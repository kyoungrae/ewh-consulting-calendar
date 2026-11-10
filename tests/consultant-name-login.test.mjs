import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createFirebaseAuth } from '../server/firebase-auth.mjs';
import { createFirebaseDirectory } from '../server/firebase-directory.mjs';
import { derivePiiKey } from '../server/security.mjs';

test('consultant name login verifies the linked Firebase password and account status', async () => {
    const profile = { name: '김테스트', role: 'consultant', status: 'approved' };
    const identity = { uid: 'consultant-uid', email: 'consultant@example.test', disabled: false, tokensValidAfterTime: 'v1' };
    const observedEmails = [];
    const auth = {
        async getUser(uid) { assert.equal(uid, identity.uid); return { ...identity }; },
        async verifyIdToken(token, checkRevoked) { assert.equal(token, 'test-token'); assert.equal(checkRevoked, true); return { uid: identity.uid }; },
    };
    const firestore = { collection(name) {
        assert.equal(name, 'users');
        return {
            doc(uid) { return { async get() { assert.equal(uid, identity.uid); return { exists: true, data: () => ({ ...profile }) }; } }; },
            where(field, operator, value) {
                assert.equal(field, 'name'); assert.equal(operator, '==');
                return { limit(n) { assert.equal(n, 2); return { async get() {
                    const docs = value === profile.name ? [{ id: identity.uid, data: () => ({ ...profile }) }] : [];
                    return { size: docs.length, docs };
                } }; } };
            },
        };
    } };
    const firebaseDirectory = createFirebaseDirectory(auth, firestore);
    const firebaseAuth = createFirebaseAuth({ apiKey: 'test-key' }, { adminAuth: auth, fetchImpl: async (_url, options) => {
        const { email, password } = JSON.parse(options.body);
        observedEmails.push(email);
        if (identity.disabled || email !== identity.email || password !== 'firebase-password') {
            return new Response(JSON.stringify({ error: { message: identity.disabled ? 'USER_DISABLED' : 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 });
        }
        return new Response(JSON.stringify({ localId: identity.uid, idToken: 'test-token' }), { status: 200 });
    } });
    const records = new Map();
    const sessions = {
        async findOne(query) { const record = records.get(query._id); return record?.expiresAt > query.expiresAt.$gt ? record : null; },
        async insertOne(document) { records.set(document._id, document); },
        async deleteOne(query) { records.delete(query._id); },
        async updateOne(query, update) {
            const record = records.get(query._id);
            if (!record || record.expiresAt <= query.expiresAt.$gt) return { matchedCount: 0 };
            Object.assign(record, update.$set);
            return { matchedCount: 1 };
        },
    };
    const localUser = {
        _id: identity.uid, uid: identity.uid, name: profile.name,
        email: identity.email, role: profile.role, status: profile.status,
        disabled: false, hasProfile: true, tokensValidAfterTime: 'v1', authVersion: 0,
    };
    const users = {
        find(filter) {
            const matches = Object.entries(filter).every(([key, value]) => localUser[key] === value);
            return { limit() { return { async toArray() { return matches ? [{ ...localUser }] : []; } }; } };
        },
        async findOne(query) { return query.uid === localUser.uid ? { ...localUser } : null; },
    };
    const db = { collection(name) {
        if (name === 'api_sessions') return sessions;
        if (name === 'firebase_user_states') return users;
        throw new Error(`Unexpected collection ${name}`);
    } };
    const origin = 'http://localhost:5173';
    const server = createApp({
        db, client: {}, firebaseAuth, firebaseDirectory,
        config: { origin, authProvider: 'firebase', sessionTransport: 'bearer', secure: false, piiEncryptionKey: derivePiiKey('test-pii-encryption-key-32chars!!') },
    }).listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        async function login(name, password) {
            const initial = await fetch(`${base}/auth/session`, { headers: { Origin: origin } });
            const { csrfToken, sessionToken } = await initial.json();
            const response = await fetch(`${base}/auth/login`, {
                method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ identifier: name, password, loginByName: true }),
            });
            return { response, data: await response.json() };
        }

        const success = await login('김테스트', 'firebase-password');
        assert.equal(success.response.status, 200);
        assert.equal(success.data.profile.name, '김테스트');
        assert.equal(success.data.profile.role, 'consultant');
        assert.deepEqual(observedEmails, ['consultant@example.test']);
        const sessionResponse = await fetch(`${base}/auth/session`, { headers: { Origin: origin, Authorization: `Bearer ${success.data.sessionToken}` } });
        assert.equal((await sessionResponse.json()).profile.name, '김테스트');

        assert.equal((await login('김테스트', 'wrong-password')).response.status, 401);
        identity.disabled = true;
        assert.equal((await login('김테스트', 'firebase-password')).response.status, 401);
        identity.disabled = false;
        profile.status = 'pending';
        assert.equal((await login('김테스트', 'firebase-password')).response.status, 401);
        profile.status = 'approved';
        assert.equal((await login('등록되지 않은 이름', 'firebase-password')).response.status, 401);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
