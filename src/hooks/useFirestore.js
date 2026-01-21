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
const DISABLE_FIRESTORE = true;

/**
 * 스케줄 고유 키 생성 (날짜+시간+컨설턴트로 중복 체크용)
 */
function generateScheduleKey(schedule) {
    const date = schedule.date ? new Date(schedule.date).toISOString() : '';
    return `${date}_${schedule.consultantId || schedule.consultantName}_${schedule.typeCode || schedule.type}`;
}

/**
 * 스케줄 관리 훅 (개발 모드: 휘발성 데이터 + 머지 지원)
 */
export function useSchedules() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // 변경 이력 추적
    const [changeLog, setChangeLog] = useState([]);

    useEffect(() => {
        if (DISABLE_FIRESTORE) {
            console.log('🛑 Firestore disabled (dev mode) - 휘발성 데이터 사용');
            // 개발용 더미 데이터 셋팅
            const dummySchedules = [
                {
                    id: 'dev_1',
                    date: '2026-01-05T10:30:00',
                    consultantId: 'user_kjh',
                    typeCode: 'EDU', // 진로개발
                    location: '비대면 (Zoom)',
                    memo: '진로 설정 상담'
                },
                {
                    id: 'dev_2',
                    date: '2026-01-05T13:30:00',
                    consultantId: 'user_lhj',
                    typeCode: 'RES', // 서류면접
                    location: 'ECC B215',
                    memo: '자기소개서 첨삭'
                },
                {
                    id: 'dev_3',
                    date: '2026-01-07T14:00:00',
                    consultantId: 'user_sys',
                    typeCode: 'PUB', // 공기업
                    location: '비대면 (Zoom)',
                    memo: 'NCS 기반 면접 준비'
                },
                {
                    id: 'dev_4',
                    date: '2026-01-12T11:00:00',
                    consultantId: 'user_kjh',
                    typeCode: 'CON', // 콘텐츠엔터
                    location: '학생문화관 203호',
                    memo: '엔터테인먼트 마케팅 직무 상담'
                },
                {
                    id: 'dev_5',
                    date: '2026-01-15T15:30:00',
                    consultantId: 'user_lhj',
                    typeCode: 'SCI', // 이공계
                    location: '비대면 (줌)',
                    memo: '반도체 공정 기술 면접'
                },
                {
                    id: 'dev_6',
                    date: '2026-01-20T10:00:00',
                    consultantId: 'user_sys',
                    typeCode: 'GLO', // 외국계
                    location: 'ECC B216',
                    memo: '영문 레쥬메 검토'
                },
                {
                    id: 'dev_7',
                    date: '2026-01-21T13:00:00',
                    consultantId: 'user_kjh',
                    typeCode: 'EXE', // 임원면접
                    location: '비대면 (Zoom)',
                    memo: '모의 면접 실전'
                },
                {
                    id: 'dev_8',
                    date: '2026-01-21T15:00:00',
                    consultantId: 'user_lhj',
                    typeCode: 'JOB', // 취업상담
                    location: '학생문화관 204호',
                    memo: '채용 공고 분석'
                },
                {
                    id: 'dev_9',
                    date: '2026-02-02T10:30:00',
                    consultantId: 'user_sys',
                    typeCode: 'EDU',
                    location: '비대면 (줌)',
                    memo: '신학기 진로 로드맵'
                },
                {
                    id: 'dev_10',
                    date: '2026-02-05T14:00:00',
                    consultantId: 'user_kjh',
                    typeCode: 'RES',
                    location: 'ECC B215',
                    memo: '실전 면접 코칭'
                }
            ];
            setSchedules(dummySchedules.sort((a, b) => new Date(a.date) - new Date(b.date)));
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

    // 스케줄 추가 (개발 모드: 상태에 직접 추가)
    const addSchedule = async (scheduleData) => {
        if (DISABLE_FIRESTORE) {
            const newSchedule = {
                ...scheduleData,
                id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setSchedules(prev => [...prev, newSchedule].sort((a, b) =>
                new Date(a.date) - new Date(b.date)
            ));
            setChangeLog(prev => [...prev, { type: 'ADD', schedule: newSchedule, timestamp: new Date().toISOString() }]);
            return newSchedule;
        }
        const schedulesRef = collection(db, 'schedules');
        return await addDoc(schedulesRef, {
            ...scheduleData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 수정 (개발 모드: 상태에서 직접 수정)
    const updateSchedule = async (id, scheduleData) => {
        if (DISABLE_FIRESTORE) {
            setSchedules(prev => prev.map(s =>
                s.id === id ? { ...s, ...scheduleData, updatedAt: new Date().toISOString() } : s
            ));
            setChangeLog(prev => [...prev, { type: 'UPDATE', id, changes: scheduleData, timestamp: new Date().toISOString() }]);
            return { id, ...scheduleData };
        }
        const scheduleRef = doc(db, 'schedules', id);
        return await updateDoc(scheduleRef, {
            ...scheduleData,
            updatedAt: serverTimestamp()
        });
    };

    // 스케줄 삭제 (개발 모드: 상태에서 직접 삭제)
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

    // 일괄 추가 (엑셀 업로드용 - 개발 모드: 상태에 직접 추가)
    const batchAddSchedules = async (schedulesArray) => {
        if (DISABLE_FIRESTORE) {
            const newSchedules = schedulesArray.map(s => ({
                ...s,
                id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
            setSchedules(prev => [...prev, ...newSchedules].sort((a, b) =>
                new Date(a.date) - new Date(b.date)
            ));
            setChangeLog(prev => [...prev, { type: 'BATCH_ADD', count: newSchedules.length, timestamp: new Date().toISOString() }]);
            return newSchedules;
        }
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

    /**
     * 엑셀 데이터 머지 (기존 데이터와 비교하여 추가/수정/삭제 추적)
     * @param {Array} newSchedules - 새로 파싱한 스케줄 배열
     * @param {boolean} replaceAll - true: 전체 교체, false: 머지
     * @returns {Object} 변경 결과 { added, updated, deleted, unchanged }
     */
    const mergeSchedules = (newSchedules, replaceAll = false) => {
        const result = {
            added: [],
            updated: [],
            deleted: [],
            unchanged: []
        };

        if (replaceAll) {
            // 전체 교체 모드
            result.deleted = [...schedules];
            result.added = newSchedules.map(s => ({
                ...s,
                id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));

            setSchedules(result.added.sort((a, b) => new Date(a.date) - new Date(b.date)));
        } else {
            // 머지 모드: 기존 스케줄의 키 맵 생성
            const existingMap = new Map();
            schedules.forEach(s => {
                existingMap.set(generateScheduleKey(s), s);
            });

            const newMap = new Map();
            const processedSchedules = [];

            newSchedules.forEach(newSched => {
                const key = generateScheduleKey(newSched);
                newMap.set(key, newSched);

                if (existingMap.has(key)) {
                    // 기존 스케줄이 있음 - 변경 여부 확인
                    const existing = existingMap.get(key);
                    const hasChanges =
                        existing.location !== newSched.location ||
                        existing.memo !== newSched.memo;

                    if (hasChanges) {
                        const updated = { ...existing, ...newSched, updatedAt: new Date().toISOString() };
                        result.updated.push({ before: existing, after: updated });
                        processedSchedules.push(updated);
                    } else {
                        result.unchanged.push(existing);
                        processedSchedules.push(existing);
                    }
                } else {
                    // 새로운 스케줄
                    const added = {
                        ...newSched,
                        id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    result.added.push(added);
                    processedSchedules.push(added);
                }
            });

            // 삭제된 스케줄 찾기 (기존에는 있었는데 새 데이터에 없는 것)
            schedules.forEach(existing => {
                const key = generateScheduleKey(existing);
                if (!newMap.has(key)) {
                    result.deleted.push(existing);
                }
            });

            setSchedules(processedSchedules.sort((a, b) => new Date(a.date) - new Date(b.date)));
        }

        // 변경 이력 기록 (상세 내역 포함) - 단, 전체 교체(초기 업로드)가 아닐 때만 기록
        if (!replaceAll) {
            setChangeLog(prev => [{
                id: Date.now(),
                type: 'MERGE',
                summary: {
                    added: result.added.length,
                    updated: result.updated.length,
                    deleted: result.deleted.length,
                    unchanged: result.unchanged.length
                },
                details: {
                    added: result.added,
                    updated: result.updated, // { before, after } 구조
                    deleted: result.deleted
                },
                timestamp: new Date().toISOString()
            }, ...prev]);
        }

        return result;
    };

    // 모든 일정 삭제 (초기화용)
    const clearAllSchedules = async () => {
        if (DISABLE_FIRESTORE) {
            const deletedCount = schedules.length;
            setSchedules([]);
            setChangeLog(prev => [...prev, { type: 'CLEAR_ALL', count: deletedCount, timestamp: new Date().toISOString() }]);
            return { deletedCount };
        }
        const schedulesRef = collection(db, 'schedules');
        const snapshot = await getDocs(schedulesRef);

        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        return await batch.commit();
    };

    // 변경 이력 초기화
    const clearChangeLog = () => {
        setChangeLog([]);
    };

    return {
        schedules,
        loading,
        error,
        changeLog,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        mergeSchedules,
        clearAllSchedules,
        clearChangeLog,
        setSchedules // 직접 설정용 (엑셀 파싱 후 사용)
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
