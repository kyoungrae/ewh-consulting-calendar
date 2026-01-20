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

/**
 * 스케줄 관리 훅
 */
export function useSchedules() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
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
        const schedulesRef = collection(db, 'schedules');
        return await addDoc(schedulesRef, {
            ...scheduleData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 수정
    const updateSchedule = async (id, scheduleData) => {
        const scheduleRef = doc(db, 'schedules', id);
        return await updateDoc(scheduleRef, {
            ...scheduleData,
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 삭제
    const deleteSchedule = async (id) => {
        const scheduleRef = doc(db, 'schedules', id);
        return await deleteDoc(scheduleRef);
    };

    // 일괄 추가 (엑셀 업로드용)
    const batchAddSchedules = async (schedulesArray) => {
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
        const codesRef = collection(db, 'common_codes');
        return await addDoc(codesRef, {
            ...codeData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 코드 수정
    const updateCode = async (id, codeData) => {
        const codeRef = doc(db, 'common_codes', id);
        return await updateDoc(codeRef, {
            ...codeData,
            updatedAt: serverTimestamp()
        });
    };

    // 코드 삭제
    const deleteCode = async (id) => {
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
        const userRef = doc(db, 'users', id);
        return await updateDoc(userRef, {
            ...userData,
            updatedAt: serverTimestamp()
        });
    };

    // 사용자 삭제
    const deleteUser = async (id) => {
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
