import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { BOOTSTRAP_ID, METADATA_COLLECTION, STATE_COLLECTION, assertLegacyRecoveryAvailable, invalidateUserStates, prepareUserStates, seedUserStates } from './bootstrap-firebase-user-states.mjs';

const user = { uid: 'u1', email: 'u@example.test', name: 'test', role: 'consultant', status: 'approved',
    authVersion: 4, disabled: false, tokensValidAfterTime: '2026-01-01', hasProfile: true,
    password: 'must-not-be-copied', passwordHash: 'must-not-be-copied' };

test('bootstrap copies only permitted identity state and rejects unsafe snapshots', () => {
    const [result] = prepareUserStates([user]);
    assert.equal(result._id, 'u1');
    assert.equal(result.authVersion, 4);
    assert.equal(result.tokensValidAfterTime, '2026-01-01');
    assert.equal(prepareUserStates([{ ...user, email: 'USER@EXAMPLE.TEST' }])[0].email, 'user@example.test');
    assert.ok(!('password' in result));
    assert.ok(!('passwordHash' in result));
    for (const bad of [[], [user, user], [{ ...user, role: 'superuser' }], [{ ...user, email: 42 }], [{ ...user, authSyncPending: true }], [{ ...user, authVersion: -1 }]]) {
        assert.throws(() => prepareUserStates(bad));
    }
});

test('legacy recovery is blocked as soon as local-state cutover has begun', () => {
    assert.doesNotThrow(() => assertLegacyRecoveryAvailable(null, 0));
    assert.throws(() => assertLegacyRecoveryAvailable({ status: 'ready' }, 0), /disabled/);
    assert.throws(() => assertLegacyRecoveryAvailable(null, 1), /disabled/);
});

const uri = process.env.MONGODB_TEST_URI;
test('bootstrap atomically seeds once and never overwrites authoritative state', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db(`ewh_user_seed_${randomUUID().replaceAll('-', '')}`);
    try {
        assert.equal(await seedUserStates({ db, client, users: [user] }), 'initialized');
        const states = db.collection(STATE_COLLECTION);
        const marker = await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID });
        assert.equal(marker.status, 'ready');
        await states.updateOne({ _id: user.uid }, { $set: { role: 'admin' } });
        assert.equal(await seedUserStates({ db, client, users: [user] }), 'already-initialized');
        assert.equal((await states.findOne({ _id: user.uid })).role, 'admin');
        await states.updateOne({ _id: user.uid }, { $set: { authSyncPending: true } });
        await assert.rejects(invalidateUserStates(db, client), /legacy rollback is blocked/);
        assert.equal((await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID })).status, 'ready');
        await states.updateOne({ _id: user.uid }, { $unset: { authSyncPending: '' } });
        await invalidateUserStates(db, client);
        await assert.rejects(invalidateUserStates(db, client), /not ready/);
        await states.updateOne({ _id: user.uid }, { $set: { authSyncPending: true } });
        await assert.rejects(seedUserStates({ db, client, users: [user] }), /unfinished synchronization/);
        assert.equal((await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID })).status, 'invalidated');
        assert.equal((await states.findOne({ _id: user.uid })).authSyncPending, true);
        await states.updateOne({ _id: user.uid }, { $unset: { authSyncPending: '' } });
        assert.equal(await seedUserStates({ db, client, users: [user] }), 'reinitialized');
        assert.equal((await states.findOne({ _id: user.uid })).role, 'consultant');
        await db.collection(METADATA_COLLECTION).deleteOne({ _id: BOOTSTRAP_ID });
        await assert.rejects(seedUserStates({ db, client, users: [user] }), /refusing to overwrite/);
        assert.equal((await states.findOne({ _id: user.uid })).role, 'consultant');
    } finally { await db.dropDatabase(); await client.close(); }
});
