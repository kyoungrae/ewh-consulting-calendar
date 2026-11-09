// Dry-run by default. Firebase passwords are never displayed or changed.
import { parseArgs } from 'node:util';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const { values } = parseArgs({ options: { 'user-id': { type: 'string' }, apply: { type: 'boolean', default: false } } });
const { FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_BASE64 } = process.env;
if (!values['user-id'] || !FIREBASE_PROJECT_ID || !FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('Provide --user-id and Firebase configuration.');
const serviceAccount = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) throw new Error('Firebase service account project mismatch.');
const app = initializeApp({ credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID });
const auth = getAuth(app);
const docs = await getFirestore(app).collection('users').where('userId', '==', values['user-id']).limit(2).get();
if (docs.size !== 1) throw new Error('Expected exactly one matching profile.');
const doc = docs.docs[0], profile = doc.data();
if (!profile.authSyncPending || !profile.email) throw new Error('Pending profile with email not found.');
const remote = await auth.getUser(doc.id);
const desired = { email: profile.email, displayName: profile.name, disabled: profile.status !== 'approved' };
const mismatches = Object.keys(desired).filter(key => remote[key] !== desired[key]);
console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', userId: profile.userId, mismatches, passwordChanged: false }));
if (values.apply) {
    if (mismatches.length) await auth.updateUser(doc.id, desired);
    await doc.ref.update({ authSyncPending: FieldValue.delete(), authVersion: FieldValue.increment(1) });
    console.log('Account sync recovered. If password was part of the failed request, reset it in Firebase.');
}
