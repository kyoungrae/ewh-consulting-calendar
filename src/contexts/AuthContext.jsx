import { createContext, useContext, useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    getAuth,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../firebase/config';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // ID로 사용자 이메일 조회
    async function getEmailByUserId(userId) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return null;
        }

        return querySnapshot.docs[0].data().email;
    }

    // ID 중복 체크
    async function checkUserIdExists(userId) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        return !querySnapshot.empty;
    }

    // 로그인 (ID 또는 이메일로 로그인)
    async function login(userIdOrEmail, password) {
        let email;

        // 이메일 형식인지 체크
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userIdOrEmail);

        if (isEmail) {
            // 이메일로 직접 로그인
            email = userIdOrEmail;
        } else {
            // ID로 이메일 조회
            email = await getEmailByUserId(userIdOrEmail);

            if (!email) {
                throw new Error('등록되지 않은 아이디입니다.');
            }
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
        return signOut(auth);
    }

    // 회원가입 (관리자만 사용 가능)
    // 보조 Firebase 앱을 사용하여 현재 관리자 세션이 변경되지 않도록 함
    async function registerUser(email, password, userData) {
        // ID 중복 체크
        if (userData.userId) {
            const exists = await checkUserIdExists(userData.userId);
            if (exists) {
                throw new Error('이미 사용 중인 아이디입니다.');
            }
        }

        // 임시 보조 앱 초기화
        const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);

        try {
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const uid = userCredential.user.uid;

            // Firestore에 사용자 정보 저장 (기본 db 인스턴스 사용)
            await setDoc(doc(db, 'users', uid), {
                uid: uid,
                userId: userData.userId || '',  // 사용자 ID 저장
                email: email,
                name: userData.name,
                tel: userData.tel || '',
                role: userData.role || 'consultant',
                status: userData.status || 'approved',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // 보조 앱의 로그아웃 및 삭제
            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);

            return userCredential;
        } catch (error) {
            // 에러 발생 시에도 보조 앱 정리
            await deleteApp(secondaryApp);
            throw error;
        }
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
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);

            if (user) {
                try {
                    const profile = await fetchUserProfile(user.uid);
                    setUserProfile(profile);
                } catch (err) {
                    console.error('Failed to fetch user profile:', err);
                }
            } else {
                setUserProfile(null);
            }

            setLoading(false);
        }, (error) => {
            console.error('Firebase Auth Error:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const value = {
        currentUser,
        userProfile,
        login,
        logout,
        registerUser,
        checkUserIdExists,
        isAdmin: userProfile?.role === 'admin',
        isConsultant: userProfile?.role === 'consultant'
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
