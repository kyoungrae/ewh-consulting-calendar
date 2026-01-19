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
    serverTimestamp,
    where
} from 'firebase/firestore';
import { db } from '../firebase/config';

// 데모 모드 (Firebase 설정 전에는 true)
const DEMO_MODE = true;

// 데모용 샘플 데이터 (localStorage에서 관리)
const getInitialSchedules = () => {
    const saved = localStorage.getItem('demo_schedules');
    if (saved) return JSON.parse(saved);

    return [
        {
            id: 'demo-schedule-1',
            studentName: '홍길동',
            date: '2026-01-20T10:00',
            endDate: '2026-01-20T11:00',
            location: '이화캠퍼스복합단지 301호',
            consultantId: 'demo-admin-001',
            typeCode: '01',
            memo: '진로 상담 예정',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-schedule-2',
            studentName: '김영희',
            date: '2026-01-20T14:00',
            endDate: '2026-01-20T15:00',
            location: '학생문화관 2층',
            consultantId: 'demo-consultant-001',
            typeCode: '02',
            memo: '취업 면접 준비',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-schedule-3',
            studentName: '이철수',
            date: '2026-01-21T09:00',
            endDate: '2026-01-21T10:00',
            location: '진로취업센터',
            consultantId: 'demo-admin-001',
            typeCode: '03',
            memo: '학업 상담',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-schedule-4',
            studentName: '박민수',
            date: '2026-01-22T11:00',
            endDate: '2026-01-22T12:00',
            location: '이화캠퍼스복합단지 502호',
            consultantId: 'demo-consultant-001',
            typeCode: '01',
            memo: '진로 설계 상담',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-schedule-5',
            studentName: '정수진',
            date: '2026-01-19T15:00',
            endDate: '2026-01-19T16:00',
            location: '학생문화관 3층',
            consultantId: 'demo-admin-001',
            typeCode: '02',
            memo: '이력서 첨삭',
            createdAt: new Date().toISOString()
        }
    ];
};

const getInitialCodes = () => {
    const saved = localStorage.getItem('demo_codes');
    if (saved) return JSON.parse(saved);

    return [
        { id: 'demo-code-1', code: '01', name: '진로 컨설팅', description: '진로 탐색 및 설계 상담', createdAt: new Date().toISOString() },
        { id: 'demo-code-2', code: '02', name: '취업 컨설팅', description: '취업 준비 및 면접 코칭', createdAt: new Date().toISOString() },
        { id: 'demo-code-3', code: '03', name: '학업 컨설팅', description: '학업 관련 고민 상담', createdAt: new Date().toISOString() }
    ];
};

const getInitialUsers = () => {
    const saved = localStorage.getItem('demo_users');
    if (saved) return JSON.parse(saved);

    return [
        {
            id: 'demo-admin-001',
            uid: 'demo-admin-001',
            email: 'admin@ewha.ac.kr',
            name: '관리자',
            tel: '02-3277-0000',
            role: 'admin',
            status: 'approved',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-consultant-001',
            uid: 'demo-consultant-001',
            email: 'consultant@ewha.ac.kr',
            name: '김컨설턴트',
            tel: '010-1234-5678',
            role: 'consultant',
            status: 'approved',
            createdAt: new Date().toISOString()
        },
        {
            id: 'demo-consultant-002',
            uid: 'demo-consultant-002',
            email: 'consultant2@ewha.ac.kr',
            name: '이상담사',
            tel: '010-9876-5432',
            role: 'consultant',
            status: 'pending',
            createdAt: new Date().toISOString()
        }
    ];
};

/**
 * 스케줄 관리 훅
 */
export function useSchedules() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (DEMO_MODE) {
            setSchedules(getInitialSchedules());
            setLoading(false);
            return;
        }

        const schedulesRef = collection(db, 'schedules');
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
        if (DEMO_MODE) {
            const newSchedule = {
                ...scheduleData,
                id: `demo-schedule-${Date.now()}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const updated = [...schedules, newSchedule];
            setSchedules(updated);
            localStorage.setItem('demo_schedules', JSON.stringify(updated));
            return { id: newSchedule.id };
        }

        const schedulesRef = collection(db, 'schedules');
        return await addDoc(schedulesRef, {
            ...scheduleData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 수정
    const updateSchedule = async (id, scheduleData) => {
        if (DEMO_MODE) {
            const updated = schedules.map(s =>
                s.id === id ? { ...s, ...scheduleData, updatedAt: new Date().toISOString() } : s
            );
            setSchedules(updated);
            localStorage.setItem('demo_schedules', JSON.stringify(updated));
            return;
        }

        const scheduleRef = doc(db, 'schedules', id);
        return await updateDoc(scheduleRef, {
            ...scheduleData,
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 삭제
    const deleteSchedule = async (id) => {
        if (DEMO_MODE) {
            const updated = schedules.filter(s => s.id !== id);
            setSchedules(updated);
            localStorage.setItem('demo_schedules', JSON.stringify(updated));
            return;
        }

        const scheduleRef = doc(db, 'schedules', id);
        return await deleteDoc(scheduleRef);
    };

    return {
        schedules,
        loading,
        error,
        addSchedule,
        updateSchedule,
        deleteSchedule
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
        if (DEMO_MODE) {
            setCodes(getInitialCodes());
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
        if (DEMO_MODE) {
            const newCode = {
                ...codeData,
                id: `demo-code-${Date.now()}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const updated = [...codes, newCode];
            setCodes(updated);
            localStorage.setItem('demo_codes', JSON.stringify(updated));
            return { id: newCode.id };
        }

        const codesRef = collection(db, 'common_codes');
        return await addDoc(codesRef, {
            ...codeData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 코드 수정
    const updateCode = async (id, codeData) => {
        if (DEMO_MODE) {
            const updated = codes.map(c =>
                c.id === id ? { ...c, ...codeData, updatedAt: new Date().toISOString() } : c
            );
            setCodes(updated);
            localStorage.setItem('demo_codes', JSON.stringify(updated));
            return;
        }

        const codeRef = doc(db, 'common_codes', id);
        return await updateDoc(codeRef, {
            ...codeData,
            updatedAt: serverTimestamp()
        });
    };

    // 코드 삭제
    const deleteCode = async (id) => {
        if (DEMO_MODE) {
            const updated = codes.filter(c => c.id !== id);
            setCodes(updated);
            localStorage.setItem('demo_codes', JSON.stringify(updated));
            return;
        }

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
        if (DEMO_MODE) {
            setUsers(getInitialUsers());
            setLoading(false);
            return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('createdAt', 'desc'));

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
        if (DEMO_MODE) {
            const updated = users.map(u =>
                u.id === id ? { ...u, ...userData, updatedAt: new Date().toISOString() } : u
            );
            setUsers(updated);
            localStorage.setItem('demo_users', JSON.stringify(updated));
            return;
        }

        const userRef = doc(db, 'users', id);
        return await updateDoc(userRef, {
            ...userData,
            updatedAt: serverTimestamp()
        });
    };

    // 사용자 삭제 (Firestore에서만 삭제, Auth는 별도 처리 필요)
    const deleteUser = async (id) => {
        if (DEMO_MODE) {
            const updated = users.filter(u => u.id !== id);
            setUsers(updated);
            localStorage.setItem('demo_users', JSON.stringify(updated));
            return;
        }

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

        if (DEMO_MODE) {
            const allSchedules = getInitialSchedules();
            setSchedules(allSchedules.filter(s => s.consultantId === consultantId));
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
