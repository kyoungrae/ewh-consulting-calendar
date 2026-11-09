// Read-only inventory; never prints passwords, hashes, tokens or email addresses.
import { MongoClient } from 'mongodb';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { MONGODB_URI, MONGODB_DB = 'ewh_consulting', FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_BASE64 } = process.env;
if (!MONGODB_URI || !FIREBASE_PROJECT_ID || !FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('MongoDB URI, Firebase project ID and Firebase service account are required.');
const serviceAccount = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error('Firebase service account project mismatch.');
const auth = getAuth(initializeApp({ credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID }));
const client = new MongoClient(MONGODB_URI);
try {
    await client.connect();
    const users = await client.db(MONGODB_DB).collection('users').find({}, { projection: { uid: 1, userId: 1, email: 1, status: 1, authSyncPending: 1 } }).toArray();
    const firebase = new Map();
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        for (const user of page.users) firebase.set(user.uid, user);
        pageToken = page.pageToken;
    } while (pageToken);
    const problems = [];
    const mongoIds = new Set();
    for (const user of users) {
        mongoIds.add(user.uid);
        const match = firebase.get(user.uid);
        const issues = [];
        if (!match) issues.push('firebase_uid_missing');
        else {
            if (!user.email || (match.email || '').toLowerCase() !== user.email.toLowerCase()) issues.push('email_mismatch');
            if (match.disabled !== (user.status !== 'approved')) issues.push('disabled_status_mismatch');
        }
        if (user.authSyncPending) issues.push('sync_pending');
        if (issues.length) problems.push({ userId: user.userId || '(missing)', uid: user.uid, issues });
    }
    console.log(JSON.stringify({ mongoUsers: users.length, firebaseUsers: firebase.size, firebaseOnly: [...firebase.keys()].filter(uid => !mongoIds.has(uid)).length, problems }, null, 2));
    if (problems.length) process.exitCode = 2;
} finally { await client.close(); }
