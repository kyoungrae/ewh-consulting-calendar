import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { ensureIndexes } from '../server/db.mjs';
import { seedUserStates, BOOTSTRAP_ID, METADATA_COLLECTION, STATE_COLLECTION } from '../scripts/bootstrap-firebase-user-states.mjs';

const uri = process.env.MONGODB_TEST_URI;
const execFileAsync = promisify(execFile);
const sampleUser = (uid, extra = {}) => ({
    uid, email: `${uid}@example.test`, name: uid, role: 'consultant', status: 'approved',
    hasProfile: true, disabled: false, authVersion: 0, tokensValidAfterTime: 'v1', ...extra,
});

test('controlled Firebase state initialization is atomic and never overwrites an existing snapshot', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_seed_test_${randomUUID().replaceAll('-', '')}`);
    const states = db.collection(STATE_COLLECTION), metadata = db.collection(METADATA_COLLECTION);
    try {
        await ensureIndexes(db);
        await assert.rejects(seedUserStates({ db, client, users: [sampleUser('one'), sampleUser('one')] }), /duplicate UID/);
        assert.equal(await states.countDocuments(), 0);
        assert.equal(await metadata.findOne({ _id: BOOTSTRAP_ID }), null);

        // Duplicate email is rejected by a Mongo index inside the transaction.
        // Neither the earlier inserted document nor the ready marker may survive.
        await assert.rejects(seedUserStates({ db, client, users: [sampleUser('one'), sampleUser('two', { email: 'one@example.test' })] }));
        assert.equal(await states.countDocuments(), 0);
        assert.equal(await metadata.findOne({ _id: BOOTSTRAP_ID }), null);

        await states.insertOne({ _id: 'partial', uid: 'partial' });
        await assert.rejects(seedUserStates({ db, client, users: [sampleUser('one')] }), /refusing to overwrite/);
        assert.equal((await states.findOne({ _id: 'partial' })).uid, 'partial');
        assert.equal(await metadata.findOne({ _id: BOOTSTRAP_ID }), null);
        await states.deleteOne({ _id: 'partial' });

        assert.equal(await seedUserStates({ db, client, users: [sampleUser('one', { role: 'admin', password: 'must-not-be-copied' })] }), 'initialized');
        const seeded = await states.findOne({ _id: 'one' });
        assert.equal(seeded.role, 'admin');
        assert.equal(seeded.password, undefined);
        assert.equal((await metadata.findOne({ _id: BOOTSTRAP_ID })).status, 'ready');
        assert.equal(await seedUserStates({ db, client, users: [sampleUser('one', { role: 'consultant' })] }), 'already-initialized');
        assert.equal((await states.findOne({ _id: 'one' })).role, 'admin', 'reruns must not overwrite locally managed state');
    } finally {
        await db.dropDatabase();
        await client.close();
    }
});

test('Firebase API startup fails closed before user-state cutover is marked ready', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_guard_test_${randomUUID().replaceAll('-', '')}`);
    const env = {
        ...process.env,
        MONGODB_URI: uri,
        MONGODB_DB: db.databaseName,
        AUTH_PROVIDER: 'firebase',
        SESSION_TRANSPORT: 'bearer',
        PII_ENCRYPTION_KEY: 'test-pii-encryption-key-32chars!!',
        FIREBASE_WEB_API_KEY: 'test',
        FIREBASE_PROJECT_ID: 'test-project',
        FIREBASE_SERVICE_ACCOUNT_BASE64: Buffer.from(JSON.stringify({ project_id: 'test-project', client_email: 'test@example.test', private_key: 'unused' })).toString('base64'),
    };
    try {
        const run = () => execFileAsync(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], { env, timeout: 10000 });
        await assert.rejects(run(), error => /Firebase user state initialization is required before startup/.test(error.stderr));
        await db.collection(METADATA_COLLECTION).insertOne({ _id: BOOTSTRAP_ID, status: 'in-progress' });
        await assert.rejects(run(), error => /Firebase user state initialization is required before startup/.test(error.stderr));
    } finally {
        await db.dropDatabase();
        await client.close();
    }
});
