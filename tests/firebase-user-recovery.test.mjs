import test from 'node:test';
import assert from 'node:assert/strict';
import { suspendAndReconcile } from '../server/firebase-user-recovery.mjs';

function fixture({ missing = false, failDisable = false, lostLock = false } = {}) {
    const local = { _id: 'u', uid: 'u', role: 'consultant', status: 'approved', email: 'old@example.test', authVersion: 2, authSyncPending: true };
    const identity = { uid: 'u', email: 'New@Example.test', disabled: false, tokensValidAfterTime: 'old' };
    let profile = { uid: 'u', role: 'consultant', status: 'approved', authVersion: 4, authSyncPending: true };
    const states = {
        async findOne(query) { return query._id === local._id && local.authSyncPending ? { ...local } : null; },
        async updateOne(query, update) {
            if (lostLock || !local.authSyncPending || local.authVersion !== query.authVersion) return { matchedCount: 0 };
            Object.assign(local, update.$set);
            return { matchedCount: 1 };
        },
    };
    const db = { collection(name) { return name === 'firebase_user_states' ? states : { async findOne() { return { status: 'ready' }; } }; } };
    const ref = {};
    const firestore = {
        collection() { return { doc() { return ref; } }; },
        async runTransaction(fn) {
            await fn({
                async get() { return { exists: Boolean(profile), data: () => ({ ...profile }) }; },
                set(_ref, fields) { profile = { ...profile, ...fields }; },
                update() { delete profile.authSyncPending; },
            });
        },
    };
    const auth = {
        async getUser() { if (missing) throw new Error('not found'); return { ...identity }; },
        async updateUser(_uid, fields) { if (failDisable) throw new Error('unavailable'); Object.assign(identity, fields, { tokensValidAfterTime: 'revoked' }); },
    };
    return { local, identity, getProfile: () => profile, args: { db, firestore, auth, uid: 'u' } };
}

test('explicit recovery leaves a suspended account and revokes old sessions', async () => {
    const f = fixture();
    assert.deepEqual(await suspendAndReconcile(f.args), { status: 'suspended', passwordVerified: false });
    assert.equal(f.identity.disabled, true);
    assert.equal(f.local.authSyncPending, false);
    assert.equal(f.local.status, 'suspended');
    assert.equal(f.local.authVersion, 5);
    assert.equal(f.local.email, 'new@example.test');
    assert.equal(f.local.tokensValidAfterTime, 'revoked');
    assert.equal(f.getProfile().status, 'suspended');
    assert.equal(f.getProfile().authSyncPending, undefined);
});

test('missing Firebase identity or failed suspension never clears the local lock', async () => {
    for (const options of [{ missing: true }, { failDisable: true }]) {
        const f = fixture(options);
        await assert.rejects(suspendAndReconcile(f.args));
        assert.equal(f.local.authSyncPending, true);
        assert.equal(f.local.authVersion, 2);
    }
});

test('a changed local lock leaves the Firebase identity safely suspended', async () => {
    const f = fixture({ lostLock: true });
    await assert.rejects(suspendAndReconcile(f.args), /Local recovery lock changed/);
    assert.equal(f.identity.disabled, true);
    assert.equal(f.local.authSyncPending, true);
});
