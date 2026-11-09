import { getFirestore } from 'firebase-admin/firestore';
import { httpError } from './security.mjs';

const PROFILE_FIELDS = ['userId', 'name', 'tel', 'consultingFeePerSession', 'consultingFeesByType', 'createdAt', 'updatedAt', 'authVersion', 'authSyncPending'];
const DIRECTORY_FIELDS = [...PROFILE_FIELDS, 'role', 'status'];
const PROFILE_BATCH_SIZE = 100;

// The legacy Firebase users collection holds application roles and profile data;
// Firebase Authentication remains the sole password and identity authority.
export function createFirebaseDirectory(auth, firestore = getFirestore()) {
    const profiles = firestore.collection('users');
    const account = async uid => {
        try { return await auth.getUser(uid); }
        catch (error) { if (error.code === 'auth/user-not-found') return null; throw error; }
    };
    const profileFrom = (uid, identity, snapshot) => {
        const data = snapshot.exists ? snapshot.data() : null;
        const profile = Object.fromEntries(PROFILE_FIELDS.filter(key => data?.[key] !== undefined).map(key => [key, data[key]]));
        return { ...profile, _id: uid, uid, hasProfile: snapshot.exists, email: identity.email || '', name: profile.name || identity.displayName || identity.email || uid,
            role: ['admin', 'tester', 'consultant'].includes(data?.role) ? data.role : 'consultant',
            status: data ? (data.status || 'pending') : 'approved', disabled: identity.disabled,
            tokensValidAfterTime: identity.tokensValidAfterTime || '' };
    };
    return {
        async get(uid) {
            // The account and profile are independent reads. Start both at
            // once while retaining the account-first error behavior: missing
            // Firebase users still return null even if their profile read fails.
            const identityRead = account(uid);
            const profileRead = Promise.resolve()
                .then(() => profiles.doc(uid).get())
                .then(snapshot => ({ snapshot }), error => ({ error }));
            const identity = await identityRead;
            if (!identity) return null;
            const result = await profileRead;
            if ('error' in result) throw result.error;
            return profileFrom(uid, identity, result.snapshot);
        },
        async lookup(identifier, byName) {
            if (!byName && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return { email: identifier.toLowerCase(), uid: null };
            const snapshot = await profiles.where(byName ? 'name' : 'userId', '==', identifier).limit(2).get();
            if (snapshot.size !== 1) return null;
            const doc = snapshot.docs[0];
            const data = doc.data();
            if (byName && data.role !== 'consultant') return null;
            const identity = await account(doc.id);
            return identity?.email ? { uid: doc.id, email: identity.email } : null;
        },
        async list() {
            const identities = [];
            let next;
            do { const page = await auth.listUsers(1000, next); identities.push(...page.users); next = page.pageToken; } while (next);
            if (!identities.length) return [];
            // Batch profile reads instead of opening one Firestore read per
            // identity. Keep the Firebase Auth ordering, and read only fields
            // used by profileFrom (legacy password fields are not needed).
            const batches = [];
            for (let start = 0; start < identities.length; start += PROFILE_BATCH_SIZE) {
                const slice = identities.slice(start, start + PROFILE_BATCH_SIZE);
                batches.push(firestore.getAll(...slice.map(identity => profiles.doc(identity.uid)), { fieldMask: DIRECTORY_FIELDS }));
            }
            const snapshots = (await Promise.all(batches)).flat();
            return identities.map((identity, index) => profileFrom(identity.uid, identity, snapshots[index]));
        },
        async idExists(userId) { return !(await profiles.where('userId', '==', userId).limit(1).get()).empty; },
        async create(uid, fields) {
            await profiles.doc(uid).create({ ...fields, uid });
        },
        async lock(user) {
            const ref = profiles.doc(user.uid);
            return firestore.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                if (snapshot.exists && snapshot.data().authSyncPending) throw httpError(409, '계정 동기화가 진행 중이거나 관리자 확인이 필요합니다.');
                const version = (snapshot.exists ? snapshot.data().authVersion : user.authVersion) || 0;
                if (version !== (user.authVersion || 0)) throw httpError(409, '계정 정보가 변경되었습니다. 다시 시도해 주세요.');
                tx.set(ref, { uid: user.uid, email: user.email, name: user.name, role: user.role, status: user.status, authSyncPending: true, authVersion: version + 1 }, { merge: true });
            });
        },
        async finish(uid, patch) {
            const { FieldValue } = await import('firebase-admin/firestore');
            await profiles.doc(uid).set({ ...patch, authSyncPending: FieldValue.delete() }, { merge: true });
        },
        async update(user, patch) {
            const uid = user.uid;
            const ref = profiles.doc(uid);
            await firestore.runTransaction(async tx => {
                const snapshot = await tx.get(ref);
                if (snapshot.exists && snapshot.data().authSyncPending) throw httpError(409, '계정 동기화가 진행 중이거나 관리자 확인이 필요합니다.');
                const defaults = snapshot.exists ? {} : { role: user.role, status: user.status, name: user.name, email: user.email };
                tx.set(ref, { ...defaults, ...patch, uid }, { merge: true });
            });
        },
        async remove(uid) { await profiles.doc(uid).delete(); },
    };
}
