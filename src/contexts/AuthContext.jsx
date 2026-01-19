import { createContext, useContext, useState, useEffect } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

// 데모 모드 활성화 여부 (Firebase 설정 전에는 true로 설정)
const DEMO_MODE = true;

// 데모용 사용자 데이터
const DEMO_USERS = {
    admin: {
        uid: 'demo-admin-001',
        email: 'admin@ewha.ac.kr',
        name: '관리자',
        tel: '02-3277-0000',
        role: 'admin',
        status: 'approved'
    },
    consultant: {
        uid: 'demo-consultant-001',
        email: 'consultant@ewha.ac.kr',
        name: '김컨설턴트',
        tel: '010-1234-5678',
        role: 'consultant',
        status: 'approved'
    }
};

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(DEMO_MODE);

    // 데모 로그인
    async function demoLogin(role = 'admin') {
        const demoUser = DEMO_USERS[role];
        setCurrentUser({ uid: demoUser.uid, email: demoUser.email });
        setUserProfile(demoUser);
        localStorage.setItem('demoUser', JSON.stringify(demoUser));
        return demoUser;
    }

    // 로그인
    async function login(email, password) {
        // 데모 모드일 경우
        if (isDemoMode) {
            // admin@ewha.ac.kr 또는 'admin' 입력 시 관리자로 로그인
            if (email.includes('admin')) {
                return demoLogin('admin');
            }
            // 그 외에는 컨설턴트로 로그인
            return demoLogin('consultant');
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // 사용자 프로필 조회
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

        if (!userDoc.exists()) {
            await signOut(auth);
            throw new Error('등록되지 않은 사용자입니다. 관리자에게 문의하세요.');
        }

        const userData = userDoc.data();

        // 승인되지 않은 사용자 체크
        if (userData.status !== 'approved') {
            await signOut(auth);
            throw new Error('계정이 아직 승인되지 않았습니다. 관리자에게 문의하세요.');
        }

        return userCredential;
    }

    // 로그아웃
    function logout() {
        if (isDemoMode) {
            setCurrentUser(null);
            setUserProfile(null);
            localStorage.removeItem('demoUser');
            return Promise.resolve();
        }
        return signOut(auth);
    }

    // 회원가입 (관리자만 사용 가능)
    async function registerUser(email, password, userData) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Firestore에 사용자 정보 저장
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            email: email,
            name: userData.name,
            tel: userData.tel || '',
            role: userData.role || 'consultant',
            status: userData.status || 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        return userCredential;
    }

    // 사용자 프로필 조회
    async function fetchUserProfile(uid) {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            return { id: userDoc.id, ...userDoc.data() };
        }
        return null;
    }

    useEffect(() => {
        // 데모 모드일 경우
        if (isDemoMode) {
            const savedDemoUser = localStorage.getItem('demoUser');
            if (savedDemoUser) {
                const demoUser = JSON.parse(savedDemoUser);
                setCurrentUser({ uid: demoUser.uid, email: demoUser.email });
                setUserProfile(demoUser);
            }
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);

            if (user) {
                const profile = await fetchUserProfile(user.uid);
                setUserProfile(profile);
            } else {
                setUserProfile(null);
            }

            setLoading(false);
        });

        return unsubscribe;
    }, [isDemoMode]);

    const value = {
        currentUser,
        userProfile,
        login,
        logout,
        registerUser,
        isAdmin: userProfile?.role === 'admin',
        isConsultant: userProfile?.role === 'consultant'
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
