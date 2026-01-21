import { createContext, useContext, useState, useEffect, useMemo } from 'react';
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

const DataContext = createContext();

// 개발 중 Firebase 읽기 차단 여부 (useFirestore.js와 동기화)
const DISABLE_FIRESTORE = true;

export function useData() {
    return useContext(DataContext);
}

/**
 * 스케줄 고유 키 생성 (날짜+시간+컨설턴트로 중복 체크용)
 */
function generateScheduleKey(schedule) {
    const date = schedule.date ? new Date(schedule.date).toISOString() : '';
    return `${date}_${schedule.consultantId || schedule.consultantName}_${schedule.typeCode || schedule.type}`;
}

export function DataProvider({ children }) {
    // 1. Schedules State
    const [schedules, setSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(true);
    const [schedulesError, setSchedulesError] = useState(null);
    const [changeLog, setChangeLog] = useState([]);

    // 2. Users State
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState(null);

    // 3. Common Codes State
    const [codes, setCodes] = useState([]);
    const [codesLoading, setCodesLoading] = useState(true);
    const [codesError, setCodesError] = useState(null);

    // --- Listeners Setup ---

    useEffect(() => {
        // --- Schedules Listener ---
        if (DISABLE_FIRESTORE) {
            const dummySchedules = [
                { id: 'dev_1', date: '2026-01-05T10:30:00', consultantId: 'user_kjh', typeCode: 'EDU', location: '비대면 (Zoom)', memo: '진로 설정 상담' },
                { id: 'dev_2', date: '2026-01-05T13:30:00', consultantId: 'user_lhj', typeCode: 'RES', location: 'ECC B215', memo: '자기소개서 첨삭' },
                { id: 'dev_3', date: '2026-01-07T14:00:00', consultantId: 'user_sys', typeCode: 'PUB', location: '비대면 (Zoom)', memo: 'NCS 기반 면접 준비' },
                { id: 'dev_4', date: '2026-01-12T11:00:00', consultantId: 'user_kjh', typeCode: 'CON', location: '학생문화관 203호', memo: '엔터테인먼트 마케팅 직무 상담' },
                { id: 'dev_5', date: '2026-01-15T15:30:00', consultantId: 'user_lhj', typeCode: 'SCI', location: '비대면 (줌)', memo: '반도체 공정 기술 면접' },
                { id: 'dev_6', date: '2026-01-20T10:00:00', consultantId: 'user_sys', typeCode: 'GLO', location: 'ECC B216', memo: '영문 레쥬메 검토' },
                { id: 'dev_7', date: '2026-01-21T13:00:00', consultantId: 'user_kjh', typeCode: 'EXE', location: '비대면 (Zoom)', memo: '모의 면접 실전' },
                { id: 'dev_8', date: '2026-01-21T15:00:00', consultantId: 'user_lhj', typeCode: 'JOB', location: '학생문화관 204호', memo: '채용 공고 분석' },
                { id: 'dev_9', date: '2026-02-02T10:30:00', consultantId: 'user_sys', typeCode: 'EDU', location: '비대면 (줌)', memo: '신학기 진로 로드맵' },
                { id: 'dev_10', date: '2026-02-05T14:00:00', consultantId: 'user_kjh', typeCode: 'RES', location: 'ECC B215', memo: '실전 면접 코칭' }
            ];
            setSchedules(dummySchedules.sort((a, b) => new Date(a.date) - new Date(b.date)));
            setSchedulesLoading(false);
        } else {
            const schedulesRef = collection(db, 'schedules');
            const q = query(schedulesRef, orderBy('date', 'asc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setSchedulesLoading(false);
            }, (err) => {
                setSchedulesError(err.message);
                setSchedulesLoading(false);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        // --- Users Listener ---
        if (DISABLE_FIRESTORE) {
            setUsers([
                { uid: 'admin_user', name: '관리자', role: 'admin', userId: 'admin' },
                { uid: 'user_lhj', name: '이희영', role: 'consultant', userId: 'lhy' },
                { uid: 'user_sys', name: '심영섭', role: 'consultant', userId: 'sys' },
                { uid: 'user_hn', name: '한 나', role: 'consultant', userId: 'hana' },
                { uid: 'user_lsh', name: '이상환', role: 'consultant', userId: 'lsh' },
                { uid: 'user_ksh', name: '김세희', role: 'consultant', userId: 'ksh' },
                { uid: 'user_kmk', name: '김민경', role: 'consultant', userId: 'kmk' },
                { uid: 'user_jsh', name: '장신혜', role: 'consultant', userId: 'jsh' },
                { uid: 'user_kny', name: '김나영', role: 'consultant', userId: 'kny' },
                { uid: 'user_sjw', name: '성지우', role: 'consultant', userId: 'sjw' },
                { uid: 'user_smi', name: '신민이', role: 'consultant', userId: 'smi' },
                { uid: 'user_ksh2', name: '김선화', role: 'consultant', userId: 'sunhwa' },
                { uid: 'user_yws', name: '양우석', role: 'consultant', userId: 'yws' },
                { uid: 'user_kj', name: '강 진', role: 'consultant', userId: 'kangjin', status: 'approved' },
                { uid: 'user_kjh', name: '김지현', role: 'consultant', userId: 'kjh' },
                { uid: 'user_jjs', name: '정지선', role: 'consultant', userId: 'jjs' },
                { uid: 'user_wmy', name: '원미영', role: 'consultant', userId: 'wmy' },
                { uid: 'user_jms', name: '지명선', role: 'consultant', userId: 'jms' },
                { uid: 'user_mhj', name: '민현정', role: 'consultant', userId: 'mhj' }
            ]);
            setUsersLoading(false);
        } else {
            const usersRef = collection(db, 'users');
            const unsubscribe = onSnapshot(query(usersRef), (snapshot) => {
                setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setUsersLoading(false);
            }, (err) => {
                setUsersError(err.message);
                setUsersLoading(false);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        // --- Codes Listener ---
        if (DISABLE_FIRESTORE) {
            setCodes([
                { code: 'WELCOME', name: '웰컴세션', color: '#e1f5fe', borderColor: '#03a9f4' },
                { code: 'EDU', name: '진로개발', color: '#e3f2fd', borderColor: '#0277bd' },
                { code: 'RES', name: '서류면접', color: '#fffde7', borderColor: '#fbc02d' },
                { code: 'PUB', name: '공기업', color: '#f5f5f5', borderColor: '#616161' },
                { code: 'CON', name: '콘텐츠엔터', color: '#fff3e0', borderColor: '#ef6c00' },
                { code: 'SCI', name: '이공계', color: '#e8f5e9', borderColor: '#2e7d32' },
                { code: 'GLO', name: '외국계', color: '#f3e5f5', borderColor: '#7b1fa2' },
                { code: 'EXE', name: '임원면접', color: '#D7CCC8', borderColor: '#8D6E63' },
                { code: 'JOB', name: '취업상담', color: '#e0f2f1', borderColor: '#00695c' }
            ]);
            setCodesLoading(false);
        } else {
            const codesRef = collection(db, 'common_codes');
            const q = query(codesRef, orderBy('code', 'asc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setCodesLoading(false);
            }, (err) => {
                setCodesError(err.message);
                setCodesLoading(false);
            });
            return () => unsubscribe();
        }
    }, []);

    // --- Actions ---

    const addSchedule = async (scheduleData) => {
        if (DISABLE_FIRESTORE) {
            const newSchedule = {
                ...scheduleData,
                id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setSchedules(prev => [...prev, newSchedule].sort((a, b) => new Date(a.date) - new Date(b.date)));
            setChangeLog(prev => [...prev, { type: 'ADD', schedule: newSchedule, timestamp: new Date().toISOString() }]);
            return newSchedule;
        }
        const schedulesRef = collection(db, 'schedules');
        return await addDoc(schedulesRef, { ...scheduleData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    };

    const updateSchedule = async (id, scheduleData) => {
        if (DISABLE_FIRESTORE) {
            setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...scheduleData, updatedAt: new Date().toISOString() } : s));
            setChangeLog(prev => [...prev, { type: 'UPDATE', id, changes: scheduleData, timestamp: new Date().toISOString() }]);
            return { id, ...scheduleData };
        }
        const scheduleRef = doc(db, 'schedules', id);
        return await updateDoc(scheduleRef, { ...scheduleData, updatedAt: serverTimestamp() });
    };

    const deleteSchedule = async (id) => {
        if (DISABLE_FIRESTORE) {
            const deletedSchedule = schedules.find(s => s.id === id);
            setSchedules(prev => prev.filter(s => s.id !== id));
            setChangeLog(prev => [...prev, { type: 'DELETE', schedule: deletedSchedule, timestamp: new Date().toISOString() }]);
            return { id };
        }
        const scheduleRef = doc(db, 'schedules', id);
        return await deleteDoc(scheduleRef);
    };

    const batchAddSchedules = async (schedulesArray) => {
        if (DISABLE_FIRESTORE) {
            const newSchedules = schedulesArray.map(s => ({
                ...s, id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            }));
            setSchedules(prev => [...prev, ...newSchedules].sort((a, b) => new Date(a.date) - new Date(b.date)));
            return newSchedules;
        }
        const batch = writeBatch(db);
        const schedulesRef = collection(db, 'schedules');
        schedulesArray.forEach(data => {
            const newDocRef = doc(schedulesRef);
            batch.set(newDocRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
        return await batch.commit();
    };

    const mergeSchedules = (newSchedules, replaceAll = false) => {
        const result = { added: [], updated: [], deleted: [], unchanged: [] };
        if (replaceAll) {
            result.deleted = [...schedules];
            result.added = newSchedules.map(s => ({
                ...s, id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            }));
            setSchedules(result.added.sort((a, b) => new Date(a.date) - new Date(b.date)));
        } else {
            const existingMap = new Map();
            schedules.forEach(s => existingMap.set(generateScheduleKey(s), s));
            const newMap = new Map();
            const processed = [];
            newSchedules.forEach(newSched => {
                const key = generateScheduleKey(newSched);
                newMap.set(key, newSched);
                if (existingMap.has(key)) {
                    const existing = existingMap.get(key);
                    const hasChanges = existing.location !== newSched.location || existing.memo !== newSched.memo;
                    if (hasChanges) {
                        const updated = { ...existing, ...newSched, updatedAt: new Date().toISOString() };
                        result.updated.push({ before: existing, after: updated });
                        processed.push(updated);
                    } else {
                        result.unchanged.push(existing);
                        processed.push(existing);
                    }
                } else {
                    const added = { ...newSched, id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                    result.added.push(added);
                    processed.push(added);
                }
            });
            schedules.forEach(existing => {
                if (!newMap.has(generateScheduleKey(existing))) result.deleted.push(existing);
            });
            setSchedules(processed.sort((a, b) => new Date(a.date) - new Date(b.date)));
        }
        return result;
    };

    const clearAllSchedules = async () => {
        if (DISABLE_FIRESTORE) {
            setSchedules([]);
            return { deletedCount: schedules.length };
        }
        const snapshot = await getDocs(collection(db, 'schedules'));
        if (snapshot.empty) return;
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        return await batch.commit();
    };

    const updateUser = async (id, userData) => {
        if (DISABLE_FIRESTORE) {
            setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u));
            return null;
        }
        const userRef = doc(db, 'users', id);
        return await updateDoc(userRef, { ...userData, updatedAt: serverTimestamp() });
    };

    const deleteUser = async (id) => {
        if (DISABLE_FIRESTORE) {
            setUsers(prev => prev.filter(u => u.id !== id));
            return null;
        }
        const userRef = doc(db, 'users', id);
        return await deleteDoc(userRef);
    };

    const addCode = async (codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codesRef = collection(db, 'common_codes');
        return await addDoc(codesRef, { ...codeData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    };

    const updateCode = async (id, codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        return await updateDoc(codeRef, { ...codeData, updatedAt: serverTimestamp() });
    };

    const deleteCode = async (id) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        return await deleteDoc(codeRef);
    };

    const value = {
        schedules,
        schedulesLoading,
        schedulesError,
        changeLog,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        mergeSchedules,
        clearAllSchedules,
        setSchedules,

        users,
        usersLoading,
        usersError,
        updateUser,
        deleteUser,

        codes,
        codesLoading,
        codesError,
        addCode,
        updateCode,
        deleteCode
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}
