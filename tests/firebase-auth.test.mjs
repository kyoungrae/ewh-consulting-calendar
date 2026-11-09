import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseAuth } from '../server/firebase-auth.mjs';
import { readConfig } from '../server/config.mjs';

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
