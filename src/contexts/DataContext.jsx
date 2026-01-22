import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
    collection,
    query,
    orderBy,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    serverTimestamp,
    where,
    writeBatch,
    limit
} from 'firebase/firestore';
import { db, DISABLE_FIRESTORE } from '../firebase/config';

const DataContext = createContext();

export function useData() {
    return useContext(DataContext);
}

/**
 * 스케줄 고유 키 생성 (날짜+컨설턴트+구분으로 중복 체크용)
 * 날짜는 'YYYY-MM-DDTHH:mm' 형식으로 정규화하여 초/밀리초 차이로 인한 매칭 실패 방지
 */
function generateScheduleKey(schedule) {
    if (!schedule.date) return '';
    const d = new Date(schedule.date);
    const dateStr = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
    const consultant = (schedule.consultantId || schedule.consultantName || '').toString().trim();
    const type = (schedule.typeCode || schedule.type || '').toString().trim();
    return `${dateStr}_${consultant}_${type}`;
}

export function DataProvider({ children }) {
    // DataProvider State
    const [schedules, setSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(true);
    const [schedulesError, setSchedulesError] = useState(null);
    const [changeLog, setChangeLog] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);

    // 2. Users State
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState(null);

    // 3. Common Codes State
    const [codes, setCodes] = useState([]);
    const [codesLoading, setCodesLoading] = useState(true);
    const [codesError, setCodesError] = useState(null);

    // --- Fetch Functions (getDocs) ---

    // 1. Fetch Schedules
    const fetchSchedules = useCallback(async () => {
        setSchedulesLoading(true);
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
            // 더미 데이터가 계속 추가되는 것을 막기 위해 초기 로딩 시에만 설정하거나, 
            // setSchedules(prev => prev.length ? prev : dummySchedules); 같은 처리가 필요하지만
            // 여기선 단순화를 위해 항상 초기화 (로컬 개발용)
            if (schedules.length === 0) {
                setSchedules(dummySchedules.sort((a, b) => new Date(a.date) - new Date(b.date)));
            }
            setSchedulesLoading(false);
        } else {
            try {
                // 필요하다면 여기서 where('date', '>=', '2026-01-01') 등을 추가하여 범위를 제한할 수 있음
                const q = query(collection(db, 'schedules'), orderBy('date', 'asc'));
                const snapshot = await getDocs(q);
                setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setSchedulesLoading(false);
            } catch (err) {
                setSchedulesError(err.message);
                setSchedulesLoading(false);
            }
        }
    }, []); // 의존성 없음 (최초 정의)

    // 2. Fetch Logs
    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        if (DISABLE_FIRESTORE) {
            setLogsLoading(false);
        } else {
            try {
                // 최신 30개만 가져오도록 제한 (읽기 비용 절감 핵심)
                const q = query(collection(db, 'change_logs'), orderBy('timestamp', 'desc'), limit(30));
                const snapshot = await getDocs(q);
                setChangeLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLogsLoading(false);
            } catch (err) {
                console.error('Logs Error:', err);
                setLogsLoading(false);
            }
        }
    }, []);

    // 3. Fetch Users
    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        if (DISABLE_FIRESTORE) {
            setUsers([
                { uid: 'admin_user', name: '관리자', role: 'admin', userId: 'admin' },
                { uid: 'user_lhj', name: '이희영', role: 'consultant', userId: 'lhy' },
                { uid: 'user_sys', name: '심영섭', role: 'consultant', userId: 'sys' },
                { uid: 'user_hn', name: '한 나', role: 'consultant', userId: 'hana' },
                { uid: 'user_bhn', name: '범하나', role: 'consultant', userId: 'bhan' },
                { uid: 'user_lsh', name: '이상환', role: 'consultant', userId: 'lsh' },
                { uid: 'user_ksh', name: '김세희', role: 'consultant', userId: 'ksh' },
                { uid: 'user_kmk', name: '김민경', role: 'consultant', userId: 'kmk' },
                { uid: 'user_jsh', name: '장신혜', role: 'consultant', userId: 'jsh' },
                { uid: 'user_kny', name: '김나영', role: 'consultant', userId: 'kny' },
                { uid: 'user_sjw', name: '성지우', role: 'consultant', userId: 'sjw' },
                { uid: 'user_smi', name: '신민이', role: 'consultant', userId: 'smi' },
                { uid: 'user_ksh2', name: '김선화', role: 'consultant', userId: 'sunhwa' },
                { uid: 'user_ywh', name: '최윤호', role: 'consultant', userId: 'ywh' },
                { uid: 'user_yws', name: '양우석', role: 'consultant', userId: 'yws' },
                { uid: 'user_kj', name: '강 진', role: 'consultant', userId: 'kangjin', status: 'approved' },
                { uid: 'user_kjh', name: '김지현', role: 'consultant', userId: 'kjh' },
                { uid: 'user_jjs', name: '정지선', role: 'consultant', userId: 'jjs' },
                // { uid: 'user_wmy', name: '원미영', role: 'consultant', userId: 'wmy' },
                // { uid: 'user_jms', name: '지명선', role: 'consultant', userId: 'jms' },
                { uid: 'user_mhj', name: '민현정', role: 'consultant', userId: 'mhj' }
            ]);
            setUsersLoading(false);
        } else {
            try {
                const usersRef = collection(db, 'users');
                const snapshot = await getDocs(query(usersRef));
                setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setUsersLoading(false);
            } catch (err) {
                setUsersError(err.message);
                setUsersLoading(false);
            }
        }
    }, []);

    // 4. Fetch Codes
    const fetchCodes = useCallback(async () => {
        setCodesLoading(true);
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
            try {
                const codesRef = collection(db, 'common_codes');
                const q = query(codesRef, orderBy('code', 'asc'));
                const snapshot = await getDocs(q);
                setCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setCodesLoading(false);
            } catch (err) {
                setCodesError(err.message);
                setCodesLoading(false);
            }
        }
    }, []);

    // --- Effects (Initial Load) ---
    useEffect(() => {
        fetchSchedules();
        fetchLogs();
        fetchUsers();
        fetchCodes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 최초 1회만 실행

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
        const res = await addDoc(schedulesRef, { ...scheduleData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        fetchSchedules(); // 데이터 갱신
        return res;
    };

    const updateSchedule = async (id, scheduleData) => {
        if (DISABLE_FIRESTORE) {
            setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...scheduleData, updatedAt: new Date().toISOString() } : s));
            setChangeLog(prev => [...prev, { type: 'UPDATE', id, changes: scheduleData, timestamp: new Date().toISOString() }]);
            return { id, ...scheduleData };
        }
        const scheduleRef = doc(db, 'schedules', id);
        const res = await updateDoc(scheduleRef, { ...scheduleData, updatedAt: serverTimestamp() });
        fetchSchedules(); // 데이터 갱신
        return res;
    };

    const deleteSchedule = async (id) => {
        if (DISABLE_FIRESTORE) {
            const deletedSchedule = schedules.find(s => s.id === id);
            setSchedules(prev => prev.filter(s => s.id !== id));
            setChangeLog(prev => [...prev, { type: 'DELETE', schedule: deletedSchedule, timestamp: new Date().toISOString() }]);
            return { id };
        }
        const scheduleRef = doc(db, 'schedules', id);
        const res = await deleteDoc(scheduleRef);
        fetchSchedules(); // 데이터 갱신
        return res;
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
        const res = await batch.commit();
        fetchSchedules(); // 데이터 갱신
        return res;
    };

    const mergeSchedules = async (newSchedules, replaceAll = false) => {
        const result = { added: [], updated: [], deleted: [], unchanged: [] };
        const schedulesRef = collection(db, 'schedules');
        const batch = DISABLE_FIRESTORE ? null : writeBatch(db);

        // 중요: fetchSchedules를 통해 최신 데이터를 가져온 후 병합 로직 수행 권장하지만, 
        // 성능을 위해 현재 state인 schedules를 기준으로 판단 (동시성 이슈 가능성 있음)

        if (replaceAll) {
            result.deleted = [...schedules];
            result.added = newSchedules.map(s => ({
                ...s,
                id: DISABLE_FIRESTORE ? `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));

            if (DISABLE_FIRESTORE) {
                setSchedules(result.added.sort((a, b) => new Date(a.date) - new Date(b.date)));
            } else if (batch) {
                // 현재 로드된 schedules를 모두 삭제
                schedules.forEach(s => {
                    batch.delete(doc(db, 'schedules', s.id));
                });

                newSchedules.forEach(data => {
                    const newDocRef = doc(schedulesRef);
                    batch.set(newDocRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
                });

                await batch.commit();
            }
        } else {
            const existingMap = new Map();
            schedules.forEach(s => existingMap.set(generateScheduleKey(s), s));
            const newMap = new Map();
            const processed = [];

            // 1. 업로드된 데이터가 커버하는 '년-월' 집합 추출 (범위 밖 데이터 보존용)
            // 예: 2026-03 데이터가 올라오면, 2026-03에 해당하는 기존 데이터 중 엑셀에 없는 것만 삭제.
            // 2025년 데이터나 2026-04 데이터는 건드리지 않음.
            const affectedMonths = new Set();
            newSchedules.forEach(s => {
                if (s.date) {
                    const d = new Date(s.date);
                    // YYYY-MM 형식 키
                    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                    affectedMonths.add(key);
                }
            });

            newSchedules.forEach(newSched => {
                const key = generateScheduleKey(newSched);
                newMap.set(key, newSched);

                if (existingMap.has(key)) {
                    const existing = existingMap.get(key);
                    const normalizeStr = (s) => (s || '').toString().trim();

                    const hasChanges =
                        normalizeStr(existing.location) !== normalizeStr(newSched.location) ||
                        normalizeStr(existing.memo) !== normalizeStr(newSched.memo) ||
                        normalizeStr(existing.consultantName) !== normalizeStr(newSched.consultantName) ||
                        normalizeStr(existing.typeName) !== normalizeStr(newSched.typeName) ||
                        normalizeStr(existing.endDate) !== normalizeStr(newSched.endDate);

                    if (hasChanges) {
                        const updated = {
                            ...existing,
                            ...newSched,
                            updatedAt: new Date().toISOString()
                        };
                        result.updated.push({ before: existing, after: updated });
                        processed.push(updated);

                        if (batch) {
                            const ref = doc(db, 'schedules', existing.id);
                            const cleanUpdate = { ...newSched, updatedAt: serverTimestamp() };
                            batch.update(ref, cleanUpdate);
                        }
                    } else {
                        result.unchanged.push(existing);
                        processed.push(existing);
                    }
                } else {
                    const added = {
                        ...newSched,
                        id: DISABLE_FIRESTORE ? `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    result.added.push(added);
                    processed.push(added);

                    if (batch) {
                        const newDocRef = doc(schedulesRef);
                        batch.set(newDocRef, { ...newSched, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
                    }
                }
            });

            // 2. 기존 데이터 처리 (삭제 여부 결정)
            schedules.forEach(existing => {
                const key = generateScheduleKey(existing);

                // 엑셀에 없는 데이터인 경우
                if (!newMap.has(key)) {
                    let shouldDelete = false;

                    if (existing.date) {
                        const d = new Date(existing.date);
                        const existingMonthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
                        // 업로드된 파일에 포함된 월(Month)에 속하는 데이터라면 삭제 대상
                        if (affectedMonths.has(existingMonthKey)) {
                            shouldDelete = true;
                        }
                    }

                    if (shouldDelete) {
                        result.deleted.push(existing);
                        if (batch) {
                            batch.delete(doc(db, 'schedules', existing.id));
                        }
                    } else {
                        // 업로드된 범위 밖의 데이터는 안전하게 보존
                        processed.push(existing);
                        // result.unchanged에는 넣지 않음 (로그가 너무 길어짐 + 실제 변경 대상이 아니었음)
                    }
                }
            });

            if (DISABLE_FIRESTORE) {
                setSchedules(processed.sort((a, b) => new Date(a.date) - new Date(b.date)));
            } else if (batch) {
                await batch.commit();
            }
        }

        // 변경 이력 기록 (상세 내역 포함) - replaceAll 모드에서도 저장
        if (result.added.length > 0 || result.updated.length > 0 || result.deleted.length > 0) {
            const logData = {
                type: replaceAll ? 'REPLACE' : 'MERGE',
                summary: {
                    added: result.added.length,
                    updated: result.updated.length,
                    deleted: result.deleted.length,
                    unchanged: result.unchanged.length
                },
                details: {
                    added: result.added,
                    updated: result.updated,
                    deleted: result.deleted
                },
                timestamp: new Date().toISOString()
            };

            if (DISABLE_FIRESTORE) {
                setChangeLog(prev => [{ id: Date.now(), ...logData }, ...prev]);
            } else {
                await addDoc(collection(db, 'change_logs'), {
                    ...logData,
                    createdAt: serverTimestamp()
                });
            }
        }

        if (!DISABLE_FIRESTORE) {
            fetchSchedules(); // 스케줄 목록 갱신
            fetchLogs();      // 로그 목록 갱신
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
        const res = await batch.commit();
        fetchSchedules(); // 데이터 갱신
        return res;
    };

    const updateUser = async (id, userData) => {
        if (DISABLE_FIRESTORE) {
            setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u));
            return null;
        }
        const userRef = doc(db, 'users', id);
        const res = await updateDoc(userRef, { ...userData, updatedAt: serverTimestamp() });
        fetchUsers(); // 유저 목록 갱신
        return res;
    };

    const deleteUser = async (id) => {
        if (DISABLE_FIRESTORE) {
            setUsers(prev => prev.filter(u => u.id !== id));
            return null;
        }
        const userRef = doc(db, 'users', id);
        const res = await deleteDoc(userRef);
        fetchUsers(); // 유저 목록 갱신
        return res;
    };

    const addCode = async (codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codesRef = collection(db, 'common_codes');
        const res = await addDoc(codesRef, { ...codeData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        fetchCodes(); // 코드 목록 갱신
        return res;
    };

    const updateCode = async (id, codeData) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        const res = await updateDoc(codeRef, { ...codeData, updatedAt: serverTimestamp() });
        fetchCodes(); // 코드 목록 갱신
        return res;
    };

    const deleteCode = async (id) => {
        if (DISABLE_FIRESTORE) return null;
        const codeRef = doc(db, 'common_codes', id);
        const res = await deleteDoc(codeRef);
        fetchCodes(); // 코드 목록 갱신
        return res;
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
        deleteCode,

        logsLoading,

        // 수동 리프레시 필요시 사용할 함수들 노출
        fetchSchedules,
        fetchLogs,
        fetchUsers,
        fetchCodes
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}
