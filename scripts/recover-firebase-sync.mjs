// Dry-run by default. Never changes a password or creates a missing Firebase account.
import { parseArgs } from 'node:util';
import { MongoClient } from 'mongodb';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { values } = parseArgs({ options: { 'user-id': { type: 'string' }, apply: { type: 'boolean', default: false } } });
const { MONGODB_URI, MONGODB_DB = 'ewh_consulting', FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_BASE64 } = process.env;
if (!values['user-id'] || !MONGODB_URI || !FIREBASE_PROJECT_ID || !FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('Provide --user-id and MongoDB/Firebase configuration.');
const serviceAccount = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error('Firebase service account project mismatch.');
const auth = getAuth(initializeApp({ credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID }));
const client = new MongoClient(MONGODB_URI);
try {
    await client.connect();
    const users = client.db(MONGODB_DB).collection('users');
    const user = await users.findOne({ userId: values['user-id'], authSyncPending: true });
    if (!user || !user.email || !user.uid) throw new Error('Pending account with UID and email not found.');
    const remote = await auth.getUser(user.uid);
    const desired = { email: user.email, displayName: user.name, disabled: user.status !== 'approved' };
    const mismatches = Object.keys(desired).filter(key => remote[key] !== desired[key]);
    console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', userId: user.userId, mismatches, passwordChanged: false }));
    if (values.apply) {
        if (mismatches.length) await auth.updateUser(user.uid, desired);
        const result = await users.updateOne({ _id: user._id, authSyncPending: true }, { $unset: { authSyncPending: '' }, $inc: { authVersion: 1 } });
        if (result.modifiedCount !== 1) throw new Error('Account changed concurrently; check again.');
        console.log('Account sync recovered. If password was part of the failed request, reset it in Firebase.');
    }
} finally { await client.close(); }
