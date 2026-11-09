import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseAuth } from '../server/firebase-auth.mjs';
import { readConfig } from '../server/config.mjs';
import { createFirebaseDirectory } from '../server/firebase-directory.mjs';

test('Firebase password verification uses the returned UID and handles bad credentials and outages', async () => {
    const replies = [
        new Response(JSON.stringify({ localId: 'uid-1', idToken: 'secret' }), { status: 200 }),
        new Response(JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }), { status: 400 }),
        new Response(JSON.stringify({ error: { message: 'API_KEY_INVALID' } }), { status: 400 }),
    ];
    const calls = [];
    const adminAuth = { async verifyIdToken(token, checkRevoked) { assert.equal(token, 'secret'); assert.equal(checkRevoked, true); return { uid: 'uid-1' }; } };
    const auth = createFirebaseAuth({ apiKey: 'key' }, { adminAuth, fetchImpl: async (url, options) => { calls.push({ url, options }); return replies.shift(); } });
    assert.equal(await auth.signIn('one@example.test', 'secret-password'), 'uid-1');
    assert.equal(JSON.parse(calls[0].options.body).email, 'one@example.test');
    assert.equal(await auth.signIn('one@example.test', 'wrong'), null);
    await assert.rejects(auth.signIn('one@example.test', 'wrong'), { status: 503 });
    assert.equal(await auth.signIn('', 'password'), null);
});

test('production Firebase mode requires matching runtime credentials', () => {
    const env = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) };
    assert.throws(() => readConfig(env), /Firebase authentication requires/);
    const account = { project_id: 'expected', client_email: 'svc@example.test', private_key: 'key' };
    const encoded = Buffer.from(JSON.stringify(account)).toString('base64');
    assert.throws(() => readConfig({ ...env, FIREBASE_PROJECT_ID: 'other', FIREBASE_WEB_API_KEY: 'key', FIREBASE_SERVICE_ACCOUNT_BASE64: encoded }), /does not match/);
    assert.equal(readConfig({ ...env, FIREBASE_PROJECT_ID: 'expected', FIREBASE_WEB_API_KEY: 'key', FIREBASE_SERVICE_ACCOUNT_BASE64: encoded }).authProvider, 'firebase');
});

test('Firebase-only identity receives consultant role; existing Firebase profiles retain roles and approval', async () => {
    const documents = new Map([['admin-uid', { role: 'admin', status: 'approved', userId: '805246', name: '관리자' }], ['pending-uid', { role: 'admin', status: 'pending' }]]);
    const identities = new Map([['admin-uid', { uid: 'admin-uid', email: 'admin@example.test', disabled: false }], ['pending-uid', { uid: 'pending-uid', email: 'pending@example.test', disabled: false }], ['new-uid', { uid: 'new-uid', email: 'new@example.test', disabled: false }]]);
    const auth = { async getUser(uid) { if (!identities.has(uid)) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); return identities.get(uid); } };
    const firestore = { collection() { return { doc(uid) { return { async get() { return { exists: documents.has(uid), data: () => documents.get(uid) }; } }; } }; } };
    const directory = createFirebaseDirectory(auth, firestore);
    assert.equal((await directory.get('new-uid')).role, 'consultant');
    assert.equal((await directory.get('new-uid')).status, 'approved');
    assert.equal((await directory.get('admin-uid')).role, 'admin');
    assert.equal((await directory.get('pending-uid')).status, 'pending');
    assert.equal(await directory.get('missing'), null);
    assert.deepEqual(await directory.lookup('new@example.test', false), { email: 'new@example.test', uid: null });
});
