// Read-only diagnosis. Passwords cannot be compared or recovered here.
// In particular, never clear either pending lock automatically after a partial
// create, delete or password change: the other system's result may be unknown.
import { parseArgs } from 'node:util';
import { MongoClient } from 'mongodb';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readConfig } from '../server/config.mjs';
import { createFirebaseAuth } from '../server/firebase-auth.mjs';
import { suspendAndReconcile } from '../server/firebase-user-recovery.mjs';
import { assertLegacyRecoveryAvailable, BOOTSTRAP_ID, METADATA_COLLECTION, STATE_COLLECTION } from './bootstrap-firebase-user-states.mjs';

const { values } = parseArgs({ options: {
    'user-id': { type: 'string' }, uid: { type: 'string' }, apply: { type: 'boolean', default: false },
    suspend: { type: 'boolean', default: false },
} });
if (Boolean(values.uid) === Boolean(values['user-id'])) throw new Error('Provide exactly one of --uid or --user-id.');
if (values.suspend && !values.apply) throw new Error('Use --suspend --apply only after reviewing the read-only diagnosis.');
const config = readConfig();
if (config.authProvider !== 'firebase') throw new Error('Firebase authentication configuration is required.');
const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
try {
    await client.connect();
    const db = client.db(config.database);
    if (values.suspend) {
        if (process.env.FIREBASE_USER_STATES_QUIESCED !== '1') throw new Error('Stop both APIs and confirm all account writes have settled before setting FIREBASE_USER_STATES_QUIESCED=1.');
        const matches = await db.collection(STATE_COLLECTION).find(values.uid ? { uid: values.uid } : { userId: values['user-id'] }).limit(2).toArray();
        if (matches.length !== 1) throw new Error('Expected exactly one local account.');
        const firebase = createFirebaseAuth(config.firebase);
        await suspendAndReconcile({ db, firestore: getFirestore(), auth: firebase.adminAuth, uid: matches[0].uid });
        console.log('Account reconciled and suspended. Password was not checked; an administrator must explicitly reset it and re-enable the account.');
    } else if (values.apply) {
        // Preserve the old Firebase-only recovery only while no local-state
        // cutover has started. Once local state exists, clearing Firebase alone
        // could re-enable access in only one system and is never safe.
        const metadata = await db.collection(METADATA_COLLECTION).findOne({ _id: BOOTSTRAP_ID });
        const localCount = await db.collection(STATE_COLLECTION).countDocuments({}, { limit: 1 });
        assertLegacyRecoveryAvailable(metadata, localCount);
        if (!values['user-id']) throw new Error('Legacy recovery requires --user-id.');
        const firebase = createFirebaseAuth(config.firebase);
        const docs = await getFirestore().collection('users').where('userId', '==', values['user-id']).limit(2).get();
        if (docs.size !== 1) throw new Error('Expected exactly one matching Firebase profile.');
        const doc = docs.docs[0], profile = doc.data();
        if (!profile.authSyncPending || !profile.email) throw new Error('Pending profile with email not found.');
        const remote = await firebase.adminAuth.getUser(doc.id);
        const desired = { email: profile.email, displayName: profile.name, disabled: profile.status !== 'approved' };
        const mismatches = Object.keys(desired).filter(key => remote[key] !== desired[key]);
        if (mismatches.length) await firebase.adminAuth.updateUser(doc.id, desired);
        await doc.ref.update({ authSyncPending: FieldValue.delete(), authVersion: FieldValue.increment(1) });
        console.log('Legacy Firebase recovery completed. If a password change was involved, reset it separately.');
        process.exitCode = 0;
    } else {
    const matches = await db.collection('firebase_user_states').find(values.uid ? { uid: values.uid } : { userId: values['user-id'] }).limit(2).toArray();
    if (matches.length !== 1) throw new Error('Expected exactly one local account. Search by UID and inspect manually if the local record is missing.');
    const local = matches[0];
    const firebase = createFirebaseAuth(config.firebase);
    let remote;
    try { remote = await firebase.adminAuth.getUser(local.uid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    const doc = await getFirestore().collection('users').doc(local.uid).get();
    const profile = doc.exists ? doc.data() : null;
    const differences = [];
    if (remote && (local.email || '').toLowerCase() !== (remote.email || '').toLowerCase()) differences.push('email');
    if (remote && Boolean(local.disabled) !== Boolean(remote.disabled)) differences.push('disabled');
    if (profile && local.role !== profile.role) differences.push('role');
    if (profile && local.status !== profile.status) differences.push('status');
    if (profile && (local.authVersion || 0) !== (profile.authVersion || 0)) differences.push('authVersion');
    console.log(JSON.stringify({ mode: 'read-only', localPending: Boolean(local.authSyncPending),
        firebaseAccountExists: Boolean(remote), firebaseProfileExists: Boolean(profile),
        firebasePending: Boolean(profile?.authSyncPending), differences, passwordComparable: false }, null, 2));
    console.log('No data was changed. Account recovery requires explicit reconciliation of both systems.');
    }
} finally { await client.close(); }
