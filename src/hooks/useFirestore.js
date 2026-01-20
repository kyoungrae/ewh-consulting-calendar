import { useState, useEffect } from 'react';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    serverTimestamp,
    where,
    writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/config';

// 개발 중 Firebase 읽기 차단 여부 (true: 연결 안함, false: 연결 함)
const DISABLE_FIRESTORE = false;

/**
 * 스케줄 관리 훅
 */
export function useSchedules() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (DISABLE_FIRESTORE) {
            console.log('🛑 Firestore disabled (dev mode)');

            // 현재 날짜 기준 더미 데이터 생성
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth(); // 0-indexed

            const dummySchedules = [
                {
                    id: 'dummy1',
                    date: new Date(year, month, 5, 10, 30).toISOString(),
                    type: 'EDU',
                    typeName: '진로개발',
                    consultantId: 'user1',
                    consultantName: '김지현',
                    location: '상담실 A'
                },
                {
                    id: 'dummy2',
                    date: new Date(year, month, 5, 11, 30).toISOString(),
                    type: 'EDU',
                    typeName: '진로개발',
                    consultantId: 'user1',
                    consultantName: '김지현',
                    location: '상담실 A'
                },
                {
                    id: 'dummy3',
                    date: new Date(year, month, 6, 10, 0).toISOString(), // 다음날
                    type: 'JOB',
                    typeName: '공기업',
                    consultantId: 'user2',
                    consultantName: '심영섭',
                    location: '상담실 B'
                },
                {
                    id: 'dummy4',
                    date: new Date(year, month, 6, 11, 0).toISOString(),
                    type: 'RES',
                    typeName: '서류면접',
                    consultantId: 'user2',
                    consultantName: '심영섭',
                    location: '상담실 B'
                },
                {
                    id: 'dummy5',
                    date: new Date(year, month, 7, 11, 0).toISOString(), // 다다음날
                    type: 'EDU',
                    typeName: '진로개발',
                    consultantId: 'user3',
                    consultantName: '범하나',
                    location: '줌(Zoom)'
                },
                {
                    id: 'dummy6',
                    date: new Date(year, month, 7, 12, 0).toISOString(),
                    type: 'EDU',
                    typeName: '진로개발',
                    consultantId: 'user3',
                    consultantName: '범하나',
                    location: '줌(Zoom)'
                },
                {
                    id: 'dummy7',
                    date: new Date(year, month, 8, 11, 0).toISOString(),
                    type: 'EDU',
                    typeName: '진로개발',
                    consultantId: 'user4',
                    consultantName: '김나영',
                    location: '상담실 C'
                },
                {
                    id: 'dummy8',
                    date: new Date(year, month, 9, 10, 0).toISOString(),
                    type: 'INT',
                    typeName: '서류면접',
                    consultantId: 'user5',
                    consultantName: '장신혜',
                    location: '상담실 D'
                },
                {
                    id: 'dummy9',
                    date: new Date(year, month, 20, 10, 0).toISOString(), // 20일
                    type: 'JOB',
                    typeName: '공기업',
                    consultantId: 'user6',
                    consultantName: '심영섭',
                    location: '상담실 B'
                },
                {
                    id: 'dummy10',
                    date: new Date(year, month, 20, 11, 0).toISOString(),
                    type: 'RES',
                    typeName: '서류면접',
                    consultantId: 'user6',
                    consultantName: '심영섭',
                    location: '상담실 B'
                }
            ];

            setSchedules(dummySchedules);
            setLoading(false);
            return;
        }

        const schedulesRef = collection(db, 'schedules');
        // 날짜순 정렬 (데이터가 없으면 비어있는 배열 반환)
        const q = query(schedulesRef, orderBy('date', 'asc'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setSchedules(docs);
                setLoading(false);
            },
            (err) => {
                console.error('Schedules error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // 스케줄 추가
    const addSchedule = async (scheduleData) => {
        if (DISABLE_FIRESTORE) { console.warn('Firestore write disabled'); return null; }
        const schedulesRef = collection(db, 'schedules');
        return await addDoc(schedulesRef, {
            ...scheduleData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 수정
    const updateSchedule = async (id, scheduleData) => {
        if (DISABLE_FIRESTORE) { console.warn('Firestore write disabled'); return null; }
        const scheduleRef = doc(db, 'schedules', id);
        return await updateDoc(scheduleRef, {
            ...scheduleData,
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 삭제
    const deleteSchedule = async (id) => {
        if (DISABLE_FIRESTORE) { console.warn('Firestore write disabled'); return null; }
        const scheduleRef = doc(db, 'schedules', id);
        return await deleteDoc(scheduleRef);
    };

    // 일괄 추가 (엑셀 업로드용)
    const batchAddSchedules = async (schedulesArray) => {
        if (DISABLE_FIRESTORE) { console.warn('Firestore write disabled'); return null; }
        const batch = writeBatch(db);
        const schedulesRef = collection(db, 'schedules');

        schedulesArray.forEach(scheduleData => {
            const newDocRef = doc(schedulesRef);
            batch.set(newDocRef, {
                ...scheduleData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        return await batch.commit();
    };

    // 모든 일정 삭제 (초기화용)
    const clearAllSchedules = async () => {
        if (DISABLE_FIRESTORE) { console.warn('Firestore write disabled'); return null; }
        const schedulesRef = collection(db, 'schedules');
        const snapshot = await getDocs(schedulesRef);

        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        return await batch.commit();
    };

    return {
        schedules,
        loading,
        error,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        clearAllSchedules
    };
}

/**
 * 공통 코드 관리 훅
 */
export function useCommonCodes() {
    const [codes, setCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (DISABLE_FIRESTORE) {
            console.log('🛑 Firestore disabled (dev mode)');
            // 기본 더미 코드 제공 (화면 깨짐 방지)
            setCodes([
                { code: 'EDU', name: '진로개발', color: '#B3E5FC' },
                { code: 'JOB', name: '취업상담', color: '#C8E6C9' },
                { code: 'RES', name: '서류첨삭', color: '#FFF9C4' },
                { code: 'INT', name: '면접지도', color: '#F8BBD0' }
            ]);
            setLoading(false);
            return;
        }

        const codesRef = collection(db, 'common_codes');
        const q = query(codesRef, orderBy('code', 'asc'));

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setCodes(docs);
                setLoading(false);
            },
            (err) => {
                console.error('Common codes error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // 코드 추가
    const addCode = async (codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codesRef = collection(db, 'common_codes');
        return await addDoc(codesRef, {
            ...codeData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 코드 수정
    const updateCode = async (id, codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        return await updateDoc(codeRef, {
            ...codeData,
            updatedAt: serverTimestamp()
        });
    };

    // 코드 삭제
    const deleteCode = async (id) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        return await deleteDoc(codeRef);
    };

    return {
        codes,
        loading,
        error,
        addCode,
        updateCode,
        deleteCode
    };
}

/**
 * 사용자 관리 훅
 */
export function useUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (DISABLE_FIRESTORE) {
            console.log('🛑 Firestore disabled (dev mode)');
            // 기본 더미 유저 제공
            setUsers([
                { uid: 'user1', name: '김컨설', role: 'consultant' },
                { uid: 'user2', name: '이관리', role: 'admin' }
            ]);
            setLoading(false);
            return;
        }

        const usersRef = collection(db, 'users');
        // orderBy('createdAt')를 제거하여 필드가 없는 문서도 모두 나오게 함
        const q = query(usersRef);

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(docs);
                setLoading(false);
            },
            (err) => {
                console.error('Users error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // 사용자 정보 수정
    const updateUser = async (id, userData) => {
        if (DISABLE_FIRESTORE) return null;
        const userRef = doc(db, 'users', id);
        return await updateDoc(userRef, {
            ...userData,
            updatedAt: serverTimestamp()
        });
    };

    // 사용자 삭제
    const deleteUser = async (id) => {
        if (DISABLE_FIRESTORE) return null;
        const userRef = doc(db, 'users', id);
        return await deleteDoc(userRef);
    };

    return {
        users,
        loading,
        error,
        updateUser,
        deleteUser
    };
}

/**
 * 특정 컨설턴트의 스케줄만 조회하는 훅
 */
export function useConsultantSchedules(consultantId) {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (DISABLE_FIRESTORE) {
            setLoading(false);
            return;
        }

        if (!consultantId) {
            setLoading(false);
            return;
        }

        const schedulesRef = collection(db, 'schedules');
        const q = query(
            schedulesRef,
            where('consultantId', '==', consultantId),
            orderBy('date', 'asc')
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setSchedules(docs);
                setLoading(false);
            },
            (err) => {
                console.error('Consultant schedules error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [consultantId]);

    return { schedules, loading, error };
}
