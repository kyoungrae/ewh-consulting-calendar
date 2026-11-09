import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { httpError } from './security.mjs';

// Password verification happens over HTTPS directly with Firebase, never against MongoDB.
export function createFirebaseAuth({ apiKey, projectId, serviceAccount }, { fetchImpl = fetch, adminAuth } = {}) {
    const auth = adminAuth || getAuth(initializeApp({ credential: cert(serviceAccount), projectId }));
    return {
        adminAuth: auth,
        async signIn(email, password) {
            if (typeof password !== 'string' || !password || password.length > 256 || !email) return null;
            let response;
            try {
                response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email, password, returnSecureToken: true }),
                    signal: AbortSignal.timeout(10000),
                });
            } catch { throw httpError(503, '인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const code = result.error?.message;
                if (['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED', 'INVALID_EMAIL'].includes(code)) return null;
                throw httpError(503, '인증 서버에서 요청을 처리하지 못했습니다. 관리자에게 문의하세요.');
            }
            if (typeof result.localId !== 'string' || typeof result.idToken !== 'string') throw httpError(503, '인증 서버의 응답을 확인할 수 없습니다.');
            try {
                // Verify issuer, project, signature and revocation before trusting the UID.
                const claims = await auth.verifyIdToken(result.idToken, true);
                return claims.uid === result.localId ? claims.uid : null;
            } catch { throw httpError(503, '인증 서버의 응답을 확인할 수 없습니다.'); }
        },
        createUser: fields => auth.createUser(fields),
        updateUser: (uid, fields) => auth.updateUser(uid, fields),
        async deleteUser(uid) {
            try { await auth.deleteUser(uid); }
            catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        },
    };
}
