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
    const env = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: 'test-pii-encryption-key-32chars!!' };
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

test('directory lists Firebase accounts with batched profiles, preserving roles and account state', async () => {
    const identities = Array.from({ length: 103 }, (_, i) => ({ uid: `uid-${i}`, email: `user-${i}@example.test`, disabled: i === 2 }));
    const docs = new Map([
        ['uid-0', { name: '관리자', role: 'admin', status: 'approved', userId: 'admin', password: 'legacy-secret' }],
        ['uid-2', { name: '대기', role: 'consultant', status: 'pending', authSyncPending: true }],
        ['uid-102', { name: '끝', role: 'tester', status: 'approved', authVersion: 3 }],
    ]);
    const calls = [];
    const auth = { async listUsers(_limit, token) { return token ? { users: identities.slice(70) } : { users: identities.slice(0, 70), pageToken: 'next' }; } };
    const firestore = {
        collection() { return { doc(id) { return { id }; } }; },
        async getAll(...args) {
            const options = args.pop();
            calls.push({ ids: args.map(ref => ref.id), fields: options.fieldMask });
            return args.map(ref => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) }));
        },
    };
    const result = await createFirebaseDirectory(auth, firestore).list();
    assert.equal(result.length, identities.length);
    assert.deepEqual(result.map(user => user.uid), identities.map(user => user.uid));
    assert.deepEqual(calls.map(call => call.ids.length), [100, 3]);
    assert.ok(calls.every(call => call.fields.includes('role') && call.fields.includes('status') && !call.fields.includes('password')));
    assert.equal(result[0].role, 'admin');
    assert.equal(result[0].password, undefined);
    assert.equal(result[1].hasProfile, false);
    assert.equal(result[1].status, 'approved');
    assert.equal(result[2].disabled, true);
    assert.equal(result[2].status, 'pending');
    assert.equal(result[2].authSyncPending, true);
    assert.equal(result[102].authVersion, 3);
});

test('directory returns an empty list without a Firestore batch read', async () => {
    const firestore = { collection() { return {}; }, async getAll() { throw new Error('unexpected Firestore read'); } };
    const auth = { async listUsers() { return { users: [] }; } };
    assert.deepEqual(await createFirebaseDirectory(auth, firestore).list(), []);
});

test('account and profile reads start together and keep disabled, pending and revocation state', async () => {
    let releaseIdentity, releaseProfile;
    let startedIdentity = false, startedProfile = false;
    const identity = { uid: 'u', email: 'user@example.test', disabled: true, tokensValidAfterTime: 'revoked-after' };
    const profile = { name: '사용자', role: 'consultant', status: 'pending', authSyncPending: true, authVersion: 5 };
    const auth = { getUser() { startedIdentity = true; return new Promise(resolve => { releaseIdentity = resolve; }); } };
    const firestore = { collection() { return { doc() { return { get() { startedProfile = true; return new Promise(resolve => { releaseProfile = resolve; }); } }; } }; } };
    const result = createFirebaseDirectory(auth, firestore).get('u');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(startedIdentity, true);
    assert.equal(startedProfile, true);
    releaseIdentity(identity);
    releaseProfile({ exists: true, data: () => profile });
    const user = await result;
    assert.equal(user.disabled, true);
    assert.equal(user.status, 'pending');
    assert.equal(user.authSyncPending, true);
    assert.equal(user.authVersion, 5);
    assert.equal(user.tokensValidAfterTime, 'revoked-after');
});

test('concurrent profile errors preserve account-first error behavior', async () => {
    const firestore = { collection() { return { doc() { return { async get() { throw new Error('profile unavailable'); } }; } }; } };
    const missing = { async getUser() { throw Object.assign(new Error('account missing'), { code: 'auth/user-not-found' }); } };
    assert.equal(await createFirebaseDirectory(missing, firestore).get('missing'), null);
    const authError = { async getUser() { throw new Error('account unavailable'); } };
    await assert.rejects(createFirebaseDirectory(authError, firestore).get('u'), /account unavailable/);
    const existing = { async getUser() { return { uid: 'u', email: 'user@example.test' }; } };
    await assert.rejects(createFirebaseDirectory(existing, firestore).get('u'), /profile unavailable/);
});
