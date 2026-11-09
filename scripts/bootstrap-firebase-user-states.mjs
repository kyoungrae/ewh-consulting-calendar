// Initial cutover only: copy the Firebase identity/profile snapshot to a new,
// isolated collection. The old API must be quiesced before the snapshot and
// remain stopped until the new API is serving traffic. Never run this as an
// automatic startup reconciliation: MongoDB is authoritative after cutover.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { readConfig } from '../server/config.mjs';
import { createFirebaseAuth } from '../server/firebase-auth.mjs';
import { createFirebaseDirectory } from '../server/firebase-directory.mjs';

export const STATE_COLLECTION = 'firebase_user_states';
export const METADATA_COLLECTION = 'local_state_metadata';
export const BOOTSTRAP_ID = 'firebase-user-states-v1';
export function assertLegacyRecoveryAvailable(marker, localCount) {
    if (marker || localCount) throw new Error('Automatic recovery is disabled after local-state cutover. Inspect both systems and reconcile explicitly; do not clear pending locks blindly.');
}
const FIELDS = [
    'userId', 'email', 'name', 'tel', 'consultingFeePerSession',
    'consultingFeesByType', 'createdAt', 'updatedAt',
];

export function prepareUserStates(users) {
    if (!Array.isArray(users) || users.length === 0) throw new Error('Firebase returned no accounts; refusing to initialize user states.');
    const seen = new Set();
    return users.map(user => {
        if (!user || typeof user.uid !== 'string' || !user.uid || seen.has(user.uid)) throw new Error('Firebase returned an invalid or duplicate UID.');
        if (!['admin', 'tester', 'consultant'].includes(user.role)) throw new Error('Firebase returned an invalid role.');
        if (typeof user.status !== 'string' || !user.status) throw new Error('Firebase returned an invalid approval status.');
        if (user.authSyncPending) throw new Error('Firebase has an account with an unfinished synchronization.');
        const version = user.authVersion ?? 0;
        if (!Number.isSafeInteger(version) || version < 0) throw new Error('Firebase returned an invalid authentication version.');
        seen.add(user.uid);
        const allowed = Object.fromEntries(FIELDS.filter(field => user[field] !== undefined).map(field => [field, user[field]]));
        if (allowed.email !== undefined) {
            if (typeof allowed.email !== 'string') throw new Error('Firebase returned an invalid email.');
            allowed.email = allowed.email.toLowerCase();
        }
        return { _id: user.uid, uid: user.uid, ...allowed, role: user.role, status: user.status,
            disabled: Boolean(user.disabled), hasProfile: Boolean(user.hasProfile), authVersion: version,
            tokensValidAfterTime: user.tokensValidAfterTime || '' };
    });
}

export async function seedUserStates({ db, client, users }) {
    const documents = prepareUserStates(users);
    const states = db.collection(STATE_COLLECTION);
    const metadata = db.collection(METADATA_COLLECTION);
    const session = client.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const marker = await metadata.findOne({ _id: BOOTSTRAP_ID }, { session });
            if (marker?.status === 'ready') {
                result = 'already-initialized';
                return;
            }
            if (marker && marker.status !== 'invalidated') throw new Error('Unexpected user-state initialization marker; manual inspection required.');
            if (!marker && await states.countDocuments({}, { session, limit: 1 })) throw new Error('Existing user states without a completed marker; refusing to overwrite them.');
            if (marker?.status === 'invalidated') {
                // A locally locked user may reflect an uncertain Firebase write.
                // Never erase such evidence or unlock it from a remote snapshot.
                if (await states.countDocuments({ authSyncPending: true }, { session, limit: 1 })) {
                    throw new Error('A local account has an unfinished synchronization; reconcile it before reseeding.');
                }
                await states.deleteMany({}, { session });
            }
            // Batches share a transaction, so an interrupted or rejected seed
            // cannot leave a partial collection that appears ready.
            for (let i = 0; i < documents.length; i += 500) {
                await states.insertMany(documents.slice(i, i + 500), { session, ordered: true });
            }
            if (marker) {
                const updated = await metadata.updateOne({ _id: BOOTSTRAP_ID, status: 'invalidated' }, { $set: { status: 'ready', initializedAt: new Date(), count: documents.length } }, { session });
                if (updated.modifiedCount !== 1) throw new Error('User-state marker changed during initialization.');
                result = 'reinitialized';
            } else {
                await metadata.insertOne({ _id: BOOTSTRAP_ID, status: 'ready', initializedAt: new Date(), count: documents.length }, { session });
                result = 'initialized';
            }
        });
        return result;
    } finally { await session.endSession(); }
}

export async function invalidateUserStates(db, client) {
    // Offline operation required: do this before restarting an older API that
    // can mutate Firebase without updating MongoDB. A stale replica must never
    // make the new API start merely because a marker was left behind.
    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            if (await db.collection(STATE_COLLECTION).countDocuments({ authSyncPending: true }, { session, limit: 1 })) {
                throw new Error('A local account has an unfinished synchronization; legacy rollback is blocked.');
            }
            const updated = await db.collection(METADATA_COLLECTION).updateOne(
                { _id: BOOTSTRAP_ID, status: 'ready' },
                { $set: { status: 'invalidated', invalidatedAt: new Date() } }, { session },
            );
            if (updated.modifiedCount !== 1) throw new Error('User-state initialization is not ready; no marker was changed.');
        });
    } finally { await session.endSession(); }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !['--apply', '--check', '--status', '--invalidate', '--verify-no-pending', '--verify-seedable'].includes(args[0]))) throw new Error('Usage: bootstrap-firebase-user-states.mjs [--apply | --check | --status | --invalidate | --verify-no-pending | --verify-seedable]');
    const apply = args[0] === '--apply';
    if ((apply || args[0] === '--invalidate') && process.env.FIREBASE_USER_STATES_QUIESCED !== '1') throw new Error('Quiesce both APIs and verify the backup before setting FIREBASE_USER_STATES_QUIESCED=1.');
    const config = readConfig();
    if (config.authProvider !== 'firebase') throw new Error('Firebase authentication configuration is required.');
    const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    try {
        await client.connect();
        const db = client.db(config.database);
        if (args[0] === '--verify-seedable') {
            const marker = await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID });
            if (marker && marker.status !== 'invalidated') throw new Error('User states are already initialized or have an unexpected marker.');
            if (await db.collection(STATE_COLLECTION).countDocuments({ authSyncPending: true }, { limit: 1 })) throw new Error('A local account has an unfinished synchronization; cutover is blocked.');
            if (!marker && await db.collection(STATE_COLLECTION).countDocuments({}, { limit: 1 })) throw new Error('Existing user states without a completed marker; cutover is blocked.');
            console.log('User-state collection can be seeded after the API is quiesced.');
            return;
        }
        if (args[0] === '--status') {
            const marker = await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID });
            if (marker && !['ready', 'invalidated'].includes(marker.status)) throw new Error('Unexpected user-state marker.');
            console.log(marker?.status || 'missing');
            return;
        }
        if (args[0] === '--invalidate') {
            await invalidateUserStates(db, client);
            console.log('User-state marker invalidated; the new API cannot start until offline reconciliation.');
            return;
        }
        if (args[0] === '--verify-no-pending') {
            if (await db.collection(STATE_COLLECTION).countDocuments({ authSyncPending: true }, { limit: 1 })) throw new Error('A local account has an unfinished synchronization; legacy rollback is blocked.');
            console.log('No local account has a pending synchronization.');
            return;
        }
        if (args[0] === '--check') {
            const marker = await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID });
            if (marker?.status !== 'ready') throw new Error('User-state initialization is not complete.');
            console.log('User-state initialization is complete.');
            return;
        }
        const auth = createFirebaseAuth(config.firebase);
        const users = await createFirebaseDirectory(auth.adminAuth).list();
        const states = prepareUserStates(users);
        if (!apply) { console.log(`Dry run: ${states.length} Firebase accounts can be initialized. No data was written.`); return; }
        const result = await seedUserStates({ db, client, users });
        console.log(`User-state initialization: ${result}.`);
    } finally { await client.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(`User-state initialization failed: ${error.message}`); process.exitCode = 1; });
}
