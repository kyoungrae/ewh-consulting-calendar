import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { verifyPassword } from '../server/security.mjs';

const runFile = promisify(execFile);
const uri = process.env.MONGODB_TEST_URI;

test('real migration is dry-run by default, hashes legacy passwords and is idempotent', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_migration_test_${randomUUID().replaceAll('-', '')}`);
    const directory = await mkdtemp(join(tmpdir(), 'ewh-migration-test-'));
    const file = join(directory, 'export.json');
    const data = {
        version: 1, collections: {
            users: [
                { id: 'legacy', data: { uid: 'legacy', userId: 'legacy', email: 'legacy@test.local', name: '이전 사용자', role: 'consultant', status: 'approved', password: '123456' } },
                { id: 'reset', data: { uid: 'reset', userId: 'reset', email: 'reset@test.local', name: '비밀번호 재설정', role: 'admin', status: 'approved' } },
            ],
            schedules_by_month: [{ id: '2026-11', data: { items: [{ id: 'old-schedule', date: '2026-11-01T00:30', consultantId: 'legacy', memo: '유지할 메모' }] } }],
            common_codes: [{ id: 'code', data: { code: 'TEST', name: '테스트' } }],
        },
    };
    const run = (...args) => runFile(process.execPath, ['scripts/import-firestore.mjs', '--file', file, ...args], { env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: db.databaseName } });
    try {
        await writeFile(file, JSON.stringify(data), { mode: 0o600 });
        const dry = await run();
        assert.match(dry.stdout, /dry-run/);
        assert.equal(await db.collection('users').countDocuments(), 0);
        await run('--apply');
        const user = await db.collection('users').findOne({ _id: 'legacy' });
        assert.equal(await verifyPassword('123456', user.passwordHash), true);
        assert.equal(user.password, undefined);
        assert.equal(user._migrationPassword, undefined);
        const reset = await db.collection('users').findOne({ _id: 'reset' });
        assert.equal(reset.mustResetPassword, true);
        assert.equal(reset.passwordHash, null);
        const schedule = await db.collection('schedules').findOne({ _id: 'old-schedule' });
        assert.equal(schedule.consultantId, 'legacy');
        assert.equal(schedule.month, '2026-11');
        assert.equal(schedule.date, '2026-10-31T15:30:00.000Z');
        await db.collection('schedules').updateOne({ _id: 'old-schedule' }, { $set: { memo: '서버에서 수정함' } });
        await run('--apply');
        assert.equal(await db.collection('users').countDocuments(), 2);
        assert.equal(await db.collection('schedules').countDocuments(), 1);
        assert.equal((await db.collection('schedules').findOne({ _id: 'old-schedule' })).memo, '서버에서 수정함');
        data.collections.users.push({ id: 'new-user', data: { uid: 'new-user', userId: 'new-user', name: '신규', role: 'consultant', status: 'approved' } });
        data.collections.schedules_by_month[0].data.items[0].id = 'conflicting-slot';
        await writeFile(file, JSON.stringify(data), { mode: 0o600 });
        await assert.rejects(run('--apply'));
        assert.equal(await db.collection('users').countDocuments(), 2);
        assert.equal(await db.collection('schedules').countDocuments(), 1);
    } finally {
        await db.dropDatabase();
        await client.close();
        await rm(directory, { recursive: true, force: true });
    }
});
