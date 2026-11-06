import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { ensureIndexes } from '../server/db.mjs';
import { hashPassword, SESSION_MS } from '../server/security.mjs';

const uri = process.env.MONGODB_TEST_URI;
let client, db, server, base;
const origin = 'http://localhost:5173';
before(async () => {
    if (!uri) return;
    client = await MongoClient.connect(uri);
    db = client.db(`ewh_test_${randomUUID().replaceAll('-', '')}`);
    await ensureIndexes(db);
    const passwordHash = await hashPassword('test-password');
    await db.collection('users').insertMany(['admin', 'consultant', 'other', 'tester'].map(role => ({
        _id: role, uid: role, userId: role, name: role, email: `${role}@test.local`, role: role === 'other' ? 'consultant' : role,
        status: 'approved', passwordHash, authVersion: 0, consultingFeesByType: [{ typeCode: 'TEST', amount: 50000 }],
    })));
    server = createApp({ db, client, config: { origin, sessionSecret: 'test-secret'.repeat(6), database: db.databaseName, secure: false, production: false } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
    if (!uri) return;
    await new Promise(resolve => server.close(resolve));
    await db.dropDatabase();
    await client.close();
});

function browser() {
    let cookie = '', token = '';
    return {
        async request(path, method = 'GET', body, headers = {}) {
            const response = await fetch(base + path, {
                method, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin, 'X-CSRF-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            for (const value of response.headers.getSetCookie()) if (value.startsWith('ewh.sid=')) cookie = value.split(';')[0];
            const data = await response.json();
            if (data.csrfToken) token = data.csrfToken;
            return { status: response.status, data, response };
        },
        async login(id) {
            await this.request('/auth/session');
            const result = await this.request('/auth/login', 'POST', { identifier: id, password: 'test-password' });
            assert.equal(result.status, 200);
            return result;
        },
    };
}

test('Mongo-backed API authentication, scope, imports and safe rollback', { skip: !uri }, async t => {
    const admin = browser(), consultant = browser(), tester = browser();
    await t.test('unauthenticated clients only see public names; CSRF and password are required', async () => {
        const guest = browser();
        assert.equal((await guest.request('/users')).status, 401);
        const directory = await guest.request('/auth/consultants');
        assert.equal(directory.status, 200);
        assert.equal(directory.data[0].email, undefined);
        assert.equal(directory.data[0].consultingFeesByType, undefined);
        await guest.request('/auth/session');
        assert.equal((await guest.request('/auth/login', 'POST', { identifier: 'admin', password: 'wrong' })).status, 401);
        assert.equal((await guest.request('/auth/login', 'POST', { identifier: 'admin', password: 'test-password' }, { Origin: 'https://evil.test' })).status, 403);
        assert.equal((await guest.request('/auth/login', 'POST', { identifier: 'admin', password: 'test-password' }, { 'X-CSRF-Token': 'wrong' })).status, 403);
        const login = await admin.login('admin');
        assert.equal(login.data.profile.passwordHash, undefined);
        assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
        assert.match(login.response.headers.get('set-cookie'), /SameSite=Strict/);
        assert.ok(login.data.expiresAt <= Date.now() + SESSION_MS);
        await consultant.login('consultant');
        await tester.login('tester');
    });
    let first;
    await t.test('server filters consultant schedules and enforces every write permission', async () => {
        first = (await admin.request('/schedules', 'POST', { date: '2026-11-01T10:00', consultantId: 'consultant', memo: 'initial' })).data;
        assert.ok(first.id);
        assert.equal((await admin.request('/schedules', 'POST', { date: '2026-11-01T10:00', consultantId: 'consultant' })).status, 409);
        assert.equal((await admin.request('/schedules', 'POST', { date: '2026-11-01T11:00', consultantId: 'other' })).status, 201);
        assert.equal((await consultant.request('/schedules')).data.length, 1);
        assert.equal((await tester.request('/schedules')).data.length, 2);
        assert.equal((await consultant.request('/schedules', 'POST', { date: '2026-11-01T12:00', consultantId: 'consultant' })).status, 403);
        assert.equal((await tester.request('/schedules/' + first.id, 'DELETE')).status, 403);
        assert.equal((await consultant.request('/users/consultant', 'PATCH', { role: 'admin' })).status, 403);
        assert.equal((await consultant.request('/users/other', 'PATCH', { consultingFeesByType: [] })).status, 403);
        assert.equal((await consultant.request('/users/consultant', 'PATCH', { consultingFeesByType: [{ typeCode: 'TEST', amount: 60000 }] })).status, 200);
        assert.equal((await admin.request('/users/other', 'PATCH', { consultingFeesByType: [], consultingFeePerSession: null })).status, 200);
        assert.equal((await tester.request('/users')).data.find(user => user.uid === 'other').consultingFeesByType, undefined);
    });
    await t.test('replace rollback restores original IDs in occupied replacement slots', async () => {
        const before = (await admin.request('/schedules')).data;
        const replaced = await admin.request('/schedules/import', 'POST', { schedules: [{ date: '2026-11-01T10:00', consultantId: 'consultant', memo: 'replacement' }], isReplace: true, targetMonths: ['2026-11'] });
        assert.equal(replaced.status, 200);
        assert.equal(replaced.data.deleted.length, 2);
        const log = (await admin.request('/change-logs')).data.find(log => log.type === 'REPLACE');
        assert.equal((await admin.request(`/change-logs/${log.id}/rollback`, 'POST', {})).status, 200);
        assert.deepEqual((await admin.request('/schedules')).data, before);
        assert.equal((await admin.request(`/change-logs/${log.id}/rollback`, 'POST', {})).status, 409);
    });
    await t.test('merge is authoritative within uploaded months; changed rows prevent rollback', async () => {
        const result = await admin.request('/schedules/import', 'POST', { schedules: [{ date: '2026-11-01T10:00', consultantId: 'consultant', memo: 'upload' }], targetMonths: null });
        assert.equal(result.status, 200);
        assert.equal(result.data.updated.length, 1);
        assert.equal(result.data.deleted.length, 1);
        const log = (await admin.request('/change-logs')).data.find(log => log.type === 'MERGE');
        await admin.request('/schedules/' + first.id, 'PATCH', { memo: 'newer edit' });
        assert.equal((await admin.request(`/change-logs/${log.id}/rollback`, 'POST', {})).status, 409);
        assert.equal((await admin.request('/schedules')).data[0].memo, 'newer edit');
        const current = (await admin.request('/schedules')).data;
        assert.equal((await admin.request('/schedules/import', 'POST', { schedules: [{ date: '2026-11-01T10:00', consultantId: 'consultant' }, { date: '2026-11-01T10:00', consultantId: 'consultant' }] })).status, 409);
        assert.deepEqual((await admin.request('/schedules')).data, current);
    });
    await t.test('password resets revoke old sessions and logout revokes cookie access', async () => {
        assert.equal((await consultant.request('/auth/extend', 'POST', {})).status, 200);
        assert.equal((await admin.request('/users/consultant', 'PATCH', { password: 'new-password' })).status, 200);
        assert.equal((await consultant.request('/schedules')).status, 401);
        assert.equal((await tester.request('/auth/logout', 'POST')).status, 200);
        assert.equal((await tester.request('/schedules')).status, 401);
    });
});
