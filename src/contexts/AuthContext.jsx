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

    // 개발용 더미 유저 데이터 (useFirestore.js와 동기화)
    const DUMMY_USERS = [
        { uid: 'admin_user', name: '관리자', role: 'admin', userId: 'admin', status: 'approved' },
        { uid: 'user_lhj', name: '이희영', role: 'consultant', userId: 'lhy', status: 'approved' },
        { uid: 'user_sys', name: '심영섭', role: 'consultant', userId: 'sys', status: 'approved' },
        { uid: 'user_hn', name: '한 나', role: 'consultant', userId: 'hana', status: 'approved' },
        { uid: 'user_lsh', name: '이상환', role: 'consultant', userId: 'lsh', status: 'approved' },
        { uid: 'user_ksh', name: '김세희', role: 'consultant', userId: 'ksh', status: 'approved' },
        { uid: 'user_kmk', name: '김민경', role: 'consultant', userId: 'kmk', status: 'approved' },
        { uid: 'user_jsh', name: '장신혜', role: 'consultant', userId: 'jsh', status: 'approved' },
        { uid: 'user_kny', name: '김나영', role: 'consultant', userId: 'kny', status: 'approved' },
        { uid: 'user_sjw', name: '성지우', role: 'consultant', userId: 'sjw', status: 'approved' },
        { uid: 'user_smi', name: '신민이', role: 'consultant', userId: 'smi', status: 'approved' },
        { uid: 'user_ksh2', name: '김선화', role: 'consultant', userId: 'sunhwa', status: 'approved' },
        { uid: 'user_yws', name: '양우석', role: 'consultant', userId: 'yws', status: 'approved' },
        { uid: 'user_kj', name: '강 진', role: 'consultant', userId: 'kangjin', status: 'approved' },
        { uid: 'user_kjh', name: '김지현', role: 'consultant', userId: 'kjh', status: 'approved' },
        { uid: 'user_jjs', name: '정지선', role: 'consultant', userId: 'jjs', status: 'approved' },
        { uid: 'user_wmy', name: '원미영', role: 'consultant', userId: 'wmy', status: 'approved' },
        { uid: 'user_jms', name: '지명선', role: 'consultant', userId: 'jms', status: 'approved' },
        { uid: 'user_mhj', name: '민현정', role: 'consultant', userId: 'mhj', status: 'approved' }
    ];

    // 로그인 (ID 또는 이메일로 로그인)
    async function login(userIdOrEmail, password) {
        // 1. 더미 유저 체크 (개발 모드)
        const dummyUser = DUMMY_USERS.find(u => u.userId === userIdOrEmail);
        if (dummyUser) {
            console.log('⚡️ Dev Login with Dummy User:', dummyUser.name);
            const fakeUser = {
                uid: dummyUser.uid,
                email: `${dummyUser.userId}@ewha.dev`,
                displayName: dummyUser.name
            };

            // 로컬 스토리지에 더미 세션 저장 (새로고침 유지용)
            localStorage.setItem('ewh_dummy_user', JSON.stringify({ user: fakeUser, profile: dummyUser }));

            setCurrentUser(fakeUser);
            setUserProfile(dummyUser);
            return { user: fakeUser };
        }

        // 2. 실제 Firebase 로그인 진행
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
        localStorage.removeItem('ewh_dummy_user'); // 더미 세션 삭제
        setCurrentUser(null);
        setUserProfile(null);
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
            if (user) {
                setCurrentUser(user);
                try {
                    const profile = await fetchUserProfile(user.uid);
                    setUserProfile(profile);
                } catch (err) {
                    console.error('Failed to fetch user profile:', err);
                }
            } else {
                // Firebase 유저가 없을 때, 더미 세션 확인
                const storedDummy = localStorage.getItem('ewh_dummy_user');
                if (storedDummy) {
                    try {
                        const { user: fakeUser } = JSON.parse(storedDummy);
                        // 최신 더미 프로필 정보로 업데이트 (status 등 최신화)
                        const latestDummyProfile = DUMMY_USERS.find(u => u.uid === fakeUser.uid);

                        setCurrentUser(fakeUser);
                        setUserProfile(latestDummyProfile || null);

                        // 세션 정보 업데이트 (선택 사항)
                        if (latestDummyProfile) {
                            localStorage.setItem('ewh_dummy_user', JSON.stringify({
                                user: fakeUser,
                                profile: latestDummyProfile
                            }));
                        }
                    } catch (e) {
                        console.error('Failed to restore dummy session', e);
                        setCurrentUser(null);
                        setUserProfile(null);
                    }
                } else {
                    setCurrentUser(null);
                    setUserProfile(null);
                }
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
