// Read-only Firebase inventory; never prints emails, passwords, hashes or tokens.
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_BASE64 } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('Firebase project ID and service account are required.');
const serviceAccount = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error('Firebase service account project mismatch.');
const app = initializeApp({ credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID });
const auth = getAuth(app);
const snapshot = await getFirestore(app).collection('users').get();
const authUsers = new Map();
let pageToken;
do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) authUsers.set(user.uid, user);
    pageToken = page.pageToken;
} while (pageToken);
const issues = [];
const identifiers = new Map();
for (const doc of snapshot.docs) {
    const profile = doc.data();
    const problems = [];
    if (!authUsers.has(doc.id)) problems.push('firebase_auth_uid_missing');
    if (profile.uid && profile.uid !== doc.id) problems.push('profile_uid_mismatch');
    if (profile.authSyncPending) problems.push('sync_pending');
    if (profile.role && !['admin', 'consultant', 'tester'].includes(profile.role)) problems.push('invalid_role');
    if (profile.userId) {
        const id = String(profile.userId);
        if (identifiers.has(id)) problems.push('duplicate_user_id');
        else identifiers.set(id, doc.id);
    }
    if (problems.length) issues.push({ uid: doc.id, userId: profile.userId || '(missing)', problems });
}
const profileIds = new Set(snapshot.docs.map(doc => doc.id));
console.log(JSON.stringify({ firebaseAccounts: authUsers.size, profiles: snapshot.size, firebaseOnly: [...authUsers.keys()].filter(uid => !profileIds.has(uid)).length, issues }, null, 2));
if (issues.length) process.exitCode = 2;
