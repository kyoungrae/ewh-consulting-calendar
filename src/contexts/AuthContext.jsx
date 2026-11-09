import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearCsrfToken } from '../lib/api';
import LoadingSpinner from '../components/common/LoadingSpinner';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

function sessionExpiry(value) {
    if (typeof value === 'number') return value;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : 0;
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [connectionError, setConnectionError] = useState('');
    const [expiresAt, setExpiresAt] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);

    const applySession = useCallback((session) => {
        const expiry = sessionExpiry(session.expiresAt);
        setCurrentUser(session.user || null);
        setUserProfile(session.profile || null);
        setExpiresAt(expiry);
        setRemainingTime(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)));
    }, []);

    const clearSession = useCallback(() => {
        clearCsrfToken();
        setCurrentUser(null);
        setUserProfile(null);
        setExpiresAt(0);
        setRemainingTime(0);
    }, []);

    useEffect(() => {
        let active = true;
        api('/auth/session')
            .then((session) => {
                if (active) applySession(session);
            })
            .catch((error) => {
                if (active && error.name !== 'AbortError') setConnectionError(error.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [applySession]);

    useEffect(() => {
        const onExpired = () => clearSession();
        window.addEventListener('ewh-auth-expired', onExpired);
        return () => window.removeEventListener('ewh-auth-expired', onExpired);
    }, [clearSession]);

    useEffect(() => {
        if (!currentUser || !expiresAt) return;
        const updateTimer = () => {
            const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            setRemainingTime(seconds);
            if (seconds === 0) {
                clearSession();
                alert('로그인 세션(30분)이 만료되어 자동 로그아웃되었습니다.');
            }
        };
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [currentUser, expiresAt, clearSession]);

    // 다른 탭에서 로그아웃하거나 세션을 연장한 경우 서버 상태를 다시 확인합니다.
    useEffect(() => {
        if (!currentUser) return;
        let active = true;
        const checkSession = () => {
            api('/auth/session')
                .then((session) => { if (active) applySession(session); })
                .catch(() => { /* 일시적인 연결 오류는 다음 API 요청에서 다시 확인합니다. */ });
        };
        window.addEventListener('focus', checkSession);
        return () => {
            active = false;
            window.removeEventListener('focus', checkSession);
        };
    }, [currentUser, applySession]);

    async function retryConnection() {
        setLoading(true);
        setConnectionError('');
        try {
            applySession(await api('/auth/session'));
        } catch (error) {
            if (error.name !== 'AbortError') setConnectionError(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function login(identifier, password, loginByName = false) {
        const session = await api('/auth/login', {
            method: 'POST',
            body: { identifier: identifier.trim(), password, loginByName }
        });
        applySession(session);
        return { user: session.user };
    }

    async function logout() {
        await api('/auth/logout', { method: 'POST' });
        clearSession();
    }

    async function registerUser(email, password, userData) {
        const user = await api('/users', {
            method: 'POST',
            body: { ...userData, email, password }
        });
        window.dispatchEvent(new Event('ewh-users-changed'));
        return { user };
    }

    async function checkUserIdExists(userId) {
        const result = await api(`/users/check-id?userId=${encodeURIComponent(userId)}`);
        return result.exists;
    }

    async function resetTimer() {
        try {
            applySession(await api('/auth/extend', { method: 'POST' }));
        } catch (error) {
            if (error.name !== 'AbortError') alert(error.message || '로그인 시간을 연장하지 못했습니다.');
        }
    }

    const value = {
        currentUser,
        userProfile,
        login,
        logout,
        registerUser,
        checkUserIdExists,
        remainingTime,
        resetTimer,
        isAdmin: userProfile?.role === 'admin' || userProfile?.role === 'tester',
        isStrictAdmin: userProfile?.role === 'admin',
        isConsultant: userProfile?.role === 'consultant',
        isTester: userProfile?.role === 'tester'
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <LoadingSpinner message="인증 정보를 확인하는 중..." />
                </div>
            ) : connectionError ? (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                    <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md" role="alert">
                        <h1 className="text-xl font-semibold mb-3">서버에 연결할 수 없습니다</h1>
                        <p className="text-gray-600 mb-6">{connectionError}</p>
                        <button className="btn btn-primary" onClick={retryConnection}>다시 연결</button>
                    </div>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}
