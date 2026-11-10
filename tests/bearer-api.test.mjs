import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '../server/app.mjs';
import { ensureIndexes } from '../server/db.mjs';
import { hashPassword, derivePiiKey } from '../server/security.mjs';

const uri = process.env.MONGODB_TEST_URI;
const origin = 'https://ewha-consulting.web.app';
const digest = token => createHash('sha256').update(token).digest('hex');

test('Firebase Hosting can authenticate to a separate API without third-party cookies', { skip: !uri }, async t => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_bearer_test_${randomUUID().replaceAll('-', '')}`);
    let server;
    try {
        await ensureIndexes(db);
        await db.collection('users').insertOne({ _id: 'admin', uid: 'admin', userId: 'admin', name: '관리자', role: 'admin', status: 'approved', passwordHash: await hashPassword('test-password'), authVersion: 0 });
        server = createApp({ db, client, config: { origin, production: false, secure: true, database: db.databaseName, sessionTransport: 'bearer', piiEncryptionKey: derivePiiKey('test-pii-encryption-key-32chars!!') } }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        let sessionToken, csrfToken;
        const request = async (path, method = 'GET', body, headers = {}) => {
            const response = await fetch(base + path, {
                method, credentials: 'omit',
                headers: { Origin: origin, ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            const data = response.status === 204 ? null : await response.json();
            return { response, data, status: response.status };
        };
        const establish = async () => {
            const bootstrap = await request('/auth/session');
            sessionToken = bootstrap.data.sessionToken;
            csrfToken = bootstrap.data.csrfToken;
            const login = await request('/auth/login', 'POST', { identifier: 'admin', password: 'test-password' });
            assert.equal(login.status, 200);
            sessionToken = login.data.sessionToken;
            csrfToken = login.data.csrfToken;
            return login;
        };
        await t.test('preflight allows only the Hosting origin and explicit API headers', async () => {
            const preflight = await request('/auth/login', 'OPTIONS', undefined, { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-csrf-token' });
            assert.equal(preflight.status, 204);
            assert.equal(preflight.response.headers.get('Access-Control-Allow-Origin'), origin);
            assert.match(preflight.response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
            assert.equal((await request('/auth/login', 'OPTIONS', undefined, { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'POST' })).status, 403);
            assert.equal((await request('/auth/login', 'OPTIONS', undefined, { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-arbitrary' })).status, 403);
        });
        let anonymousToken;
        await t.test('bootstrap and login rotate opaque tokens; MongoDB stores only their hashes', async () => {
            const bootstrap = await request('/auth/session');
            assert.equal(bootstrap.status, 200);
            assert.equal(bootstrap.data.user, null);
            assert.equal(bootstrap.response.headers.get('set-cookie'), null);
            sessionToken = anonymousToken = bootstrap.data.sessionToken;
            csrfToken = bootstrap.data.csrfToken;
            assert.match(sessionToken, /^[a-f0-9]{64}$/);
            const record = await db.collection('api_sessions').findOne({ _id: digest(sessionToken) });
            assert.ok(record);
            assert.equal(record.sessionToken, undefined);
            assert.ok(!JSON.stringify(record).includes(sessionToken));
            const login = await request('/auth/login', 'POST', { identifier: 'admin', password: 'test-password' });
            assert.equal(login.status, 200);
            assert.notEqual(login.data.sessionToken, anonymousToken);
            sessionToken = login.data.sessionToken;
            csrfToken = login.data.csrfToken;
            assert.equal(login.response.headers.get('set-cookie'), null);
            assert.equal(await db.collection('api_sessions').findOne({ _id: digest(anonymousToken) }), null);
            assert.equal((await request('/users')).status, 200);
            assert.equal((await request('/users', 'GET', undefined, { Authorization: `Bearer ${anonymousToken}` })).status, 401);
            assert.equal((await request('/users', 'GET', undefined, { Authorization: 'Bearer admin' })).status, 401);
        });
        await t.test('cross-origin mutations still require CSRF and the approved Origin', async () => {
            assert.equal((await request('/codes', 'POST', { code: 'A', name: '분류' }, { 'X-CSRF-Token': 'wrong' })).status, 403);
            assert.equal((await request('/codes', 'POST', { code: 'A', name: '분류' }, { Origin: 'https://evil.test' })).status, 403);
            assert.equal((await request('/codes', 'POST', { code: 'A', name: '분류' })).status, 201);
            assert.equal((await request('/auth/extend', 'POST', {})).status, 200);
        });
        await t.test('reload restores server-verified identity and logout invalidates the token', async () => {
            const restored = await request('/auth/session');
            assert.equal(restored.data.user.uid, 'admin');
            assert.equal(restored.data.sessionToken, sessionToken);
            assert.equal((await request('/auth/logout', 'POST', {})).status, 200);
            assert.equal((await request('/users')).status, 401);
            assert.equal(await db.collection('api_sessions').findOne({ _id: digest(sessionToken) }), null);
        });
        await t.test('expired tokens fail immediately, before MongoDB TTL cleanup', async () => {
            sessionToken = csrfToken = undefined;
            await establish();
            await db.collection('api_sessions').updateOne({ _id: digest(sessionToken) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
            assert.equal((await request('/users')).status, 401);
            assert.equal((await request('/auth/extend', 'POST', {})).status, 401);
        });
        await t.test('account password changes revoke bearer sessions too', async () => {
            sessionToken = csrfToken = undefined;
            await establish();
            await db.collection('users').updateOne({ uid: 'admin' }, { $inc: { authVersion: 1 } });
            assert.equal((await request('/users')).status, 401);
        });
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.dropDatabase();
        await client.close();
    }
});
