import { FieldValue } from 'firebase-admin/firestore';

const PROFILE_FIELDS = [
    'userId', 'name', 'tel',
    'uniqueNumber', 'place', 'birthDate', 'affiliation', 'address', 'bankAccount',
    'consultingFeePerSession', 'consultingFeesByType', 'createdAt'
];

// Explicit offline recovery never guesses whether an interrupted password,
// create or deletion succeeded. It leaves the account suspended and requires
// an administrator to decide when to re-enable it and reset the password.
export async function suspendAndReconcile({ db, firestore, auth, uid, now = () => new Date() }) {
    const states = db.collection('firebase_user_states');
    const metadata = await db.collection('local_state_metadata').findOne({ _id: 'firebase-user-states-v1', status: 'ready' });
    if (!metadata) throw new Error('Local user-state initialization is not ready.');
    const local = await states.findOne({ _id: uid, uid, authSyncPending: true });
    if (!local || !['admin', 'tester', 'consultant'].includes(local.role) || !Number.isSafeInteger(local.authVersion) || local.authVersion < 0) {
        throw new Error('Expected one locked local user with a valid role and version.');
    }
    // A missing account could reflect a completed delete or an uncertain create.
    // Do not recreate it or delete local evidence without an explicit decision.
    const identity = await auth.getUser(uid);
    if (!identity || identity.uid !== uid || typeof identity.email !== 'string' || !identity.email) throw new Error('Firebase account or email is missing; manual investigation is required.');
    const profileRef = firestore.collection('users').doc(uid);
    const email = identity.email.toLowerCase();
    const profileFields = Object.fromEntries(PROFILE_FIELDS.filter(key => local[key] !== undefined).map(key => [key, local[key]]));
    const updatedAt = now().toISOString();
    let version;
    await firestore.runTransaction(async tx => {
        const snapshot = await tx.get(profileRef);
        const data = snapshot.exists ? snapshot.data() : {};
        if (data.uid && data.uid !== uid) throw new Error('Firebase profile UID mismatch.');
        const remoteVersion = data.authVersion ?? 0;
        if (!Number.isSafeInteger(remoteVersion) || remoteVersion < 0) throw new Error('Firebase profile version is invalid.');
        version = Math.max(local.authVersion, remoteVersion) + 1;
        if (!Number.isSafeInteger(version)) throw new Error('User version cannot be incremented.');
        tx.set(profileRef, { ...profileFields, uid, email, role: local.role, status: 'suspended', authVersion: version, authSyncPending: true, updatedAt }, { merge: true });
    });
    await auth.updateUser(uid, { disabled: true });
    const disabledIdentity = await auth.getUser(uid);
    if (!disabledIdentity?.disabled || disabledIdentity.uid !== uid || (disabledIdentity.email || '').toLowerCase() !== email) throw new Error('Firebase account suspension could not be verified.');
    await firestore.runTransaction(async tx => {
        const snapshot = await tx.get(profileRef);
        const data = snapshot.exists ? snapshot.data() : null;
        if (!data || !data.authSyncPending || data.authVersion !== version || data.status !== 'suspended') throw new Error('Firebase recovery lock changed.');
        tx.update(profileRef, { authSyncPending: FieldValue.delete() });
    });
    const result = await states.updateOne(
        { _id: uid, uid, authSyncPending: true, authVersion: local.authVersion },
        { $set: { email, status: 'suspended', disabled: true, hasProfile: true, authVersion: version,
            tokensValidAfterTime: disabledIdentity.tokensValidAfterTime || '', authSyncPending: false, updatedAt } },
    );
    if (!result.matchedCount) throw new Error('Local recovery lock changed; the Firebase account remains suspended.');
    return { status: 'suspended', passwordVerified: false };
}
