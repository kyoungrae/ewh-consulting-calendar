import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    limit,
    runTransaction,
    getDoc
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
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [schedulesError, setSchedulesError] = useState(null);

    // 캐싱: 이미 불러온 연-월 정보를 저장 (예: "2026-03")
    const [loadedMonths, setLoadedMonths] = useState(new Set());
    // 중복 요청 방지용 (동시에 같은 달을 요청하면 무시)
    const fetchingRef = useRef(new Set());

    const [changeLog, setChangeLog] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);

    // Debug: Firebase Read Counter
    const [totalReads, setTotalReads] = useState(0);
    const resetReads = () => setTotalReads(0);
    const incrementReads = (count) => {
        if (count > 0) setTotalReads(prev => prev + count);
    };

    // 2. Users State
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState(null);

    // 3. Common Codes State
    const [codes, setCodes] = useState([]);
    const [codesLoading, setCodesLoading] = useState(true);
    const [codesError, setCodesError] = useState(null);

    // --- Fetch Functions ---

    // 1. Fetch Schedules by Month (Range) -> Monthly Doc 방식 (비용 절감)
    // year: number (YYYY), month: number (1-12)
    const fetchMonthSchedules = useCallback(async (year, month) => {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        // 1. Cache Check
        if (loadedMonths.has(monthKey)) {
            return;
        }

        // 2. Deduping
        if (fetchingRef.current.has(monthKey)) return;

        fetchingRef.current.add(monthKey);
        setSchedulesLoading(true);

        if (DISABLE_FIRESTORE) {
            // ... Dummy Logic

            // [Simulation] 실제라면 월별 문서 1개를 읽었을 것임
            incrementReads(1);

            setSchedulesLoading(false);
            setLoadedMonths(prev => new Set(prev).add(monthKey));
            fetchingRef.current.delete(monthKey);
        } else {
            try {
                // [구조 변경] schedules 컬렉션 쿼리 -> schedules_by_month 문서 단건 조회
                // 읽기 비용: N개 -> 1개
                const docRef = doc(db, 'schedules_by_month', monthKey);
                const docSnap = await getDoc(docRef);

                let newSchedules = [];
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    newSchedules = data.items || []; // 배열 통째로 가져옴
                    incrementReads(1); // 문서는 딱 1개 읽었음!
                } else {
                    incrementReads(1); // 없는 것을 확인하는 것도 읽기 1회
                }

                setSchedules(prev => {
                    // 기존 데이터에서 '해당 월'의 데이터는 모두 제거하고 (덮어쓰기 위해)
                    // 새로 가져온 데이터로 교체해야 함. 
                    // 하지만 사용자 경험을 위해 id 기반 병합을 하되, 
                    // 월별 문서 방식은 "그 달의 전체"를 가져오므로, 그 달의 기존 데이터는 날리고 새로 넣는게 안전함.

                    // 해당 월에 속하는 기존 데이터 제거 (YYYY-MM 문자열 매칭)
                    const filteredPrev = prev.filter(s => {
                        if (!s.date) return true;
                        const d = new Date(s.date);
                        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        return k !== monthKey;
                    });

                    return [...filteredPrev, ...newSchedules].sort((a, b) => new Date(a.date) - new Date(b.date));
                });

                setLoadedMonths(prev => new Set(prev).add(monthKey));
            } catch (err) {
                console.error("Fetch Error:", err);
                setSchedulesError(err.message);
            } finally {
                setSchedulesLoading(false);
                fetchingRef.current.delete(monthKey);
            }
        }
    }, [loadedMonths, incrementReads]);

    // 0. Fetch ALL Schedules (Restore full list view)
    const fetchSchedules = useCallback(async () => {
        setSchedulesLoading(true);
        if (DISABLE_FIRESTORE) {
            // 더미 모드: 약 12개월치 데이터가 있다고 가정
            incrementReads(12);

            // 더미 데이터 생성 (현재 월 기준)
            const dummyList = [];
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth(); // 0-indexed

            // 예시: 이번 달에 3개, 다음 달에 2개
            dummyList.push({ id: 'dummy_1', date: new Date(year, month, 5, 10, 0).toISOString(), consultantId: 'user_kjh', typeCode: 'EDU', memo: '더미 데이터 1' });
            dummyList.push({ id: 'dummy_2', date: new Date(year, month, 12, 14, 0).toISOString(), consultantId: 'user_lhj', typeCode: 'RES', memo: '더미 데이터 2' });
            dummyList.push({ id: 'dummy_3', date: new Date(year, month, 20, 16, 0).toISOString(), consultantId: 'user_sys', typeCode: 'PUB', memo: '더미 데이터 3' });
            dummyList.push({ id: 'dummy_4', date: new Date(year, month + 1, 3, 11, 0).toISOString(), consultantId: 'user_kjh', typeCode: 'CON', memo: '다음달 데이터' });

            setSchedules(dummyList);
            // 모든 달이 로드된 것으로 간주 (캐시 회피 등 복잡한 로직 없이 단순화)
            setSchedulesLoading(false);
            return;
        }

        try {
            // 전체 월 문서 조회
            const q = query(collection(db, 'schedules_by_month'));
            const snapshot = await getDocs(q);
            incrementReads(snapshot.size);

            let allSchedules = [];
            const newLoadedMonths = new Set();

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.items && Array.isArray(data.items)) {
                    allSchedules.push(...data.items);
                }
                newLoadedMonths.add(doc.id); // 'YYYY-MM'
            });

            // 날짜순 정렬
            allSchedules.sort((a, b) => new Date(a.date) - new Date(b.date));

            setSchedules(allSchedules);
            setLoadedMonths(newLoadedMonths);

        } catch (err) {
            console.error("Fetch All Error:", err);
            setSchedulesError(err.message);
        } finally {
            setSchedulesLoading(false);
        }
    }, [incrementReads]);

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
                incrementReads(snapshot.size); // 카운트 증가
                setChangeLog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLogsLoading(false);
            } catch (err) {
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
                incrementReads(snapshot.size); // 카운트 증가
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
                incrementReads(snapshot.size); // 카운트 증가
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
        fetchSchedules(); // 전체 로드 (월별 문서 구조 유지하면서 전체 가져오기)
        // 앱 시작 시 "오늘" 기준 이번 달 데이터만 로드 -> 전체 로드로 변경
        // const now = new Date();
        // fetchMonthSchedules(now.getFullYear(), now.getMonth() + 1);

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
            setChangeLog(prev => [{
                type: 'ADD',
                summary: { added: 1, updated: 0, deleted: 0 },
                details: { added: [newSchedule], updated: [], deleted: [] },
                timestamp: new Date().toISOString()
            }, ...prev]);
            return newSchedule;
        }

        const d = new Date(scheduleData.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const docRef = doc(db, 'schedules_by_month', monthKey);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                let currentItems = [];
                if (sfDoc.exists()) {
                    currentItems = sfDoc.data().items || [];
                }
                const newId = doc(collection(db, 'temp')).id;
                const newSchedule = { ...scheduleData, id: newId };
                currentItems.push(newSchedule);
                currentItems.sort((a, b) => new Date(a.date) - new Date(b.date));
                transaction.set(docRef, { items: currentItems }, { merge: true });
            });

            // [Log] 변경 이력 기록
            await addDoc(collection(db, 'change_logs'), {
                type: 'ADD',
                schedule: scheduleData,
                timestamp: new Date().toISOString(),
                createdAt: serverTimestamp()
            });

            // 로컬 상태 업데이트 (전체 로드 모드를 가정하여 새로고침 대신 추가)
            // 하지만 ID를 정확히 모르므로(트랜잭션 내부 생성), 전체 리로드나 fetchSchedules 호출 권장
            // 여기선 fetchSchedules 호출
            fetchSchedules();

            return { result: 'success' };
        } catch (error) {
            console.error("Error adding document: ", error);
            throw error;
        }
    };



    // 4. Batch Add Schedules (Monthly)
    const batchAddSchedules = useCallback(async (newSchedules) => {
        if (DISABLE_FIRESTORE) {
            setSchedules(prev => [...prev, ...newSchedules].sort((a, b) => new Date(a.date) - new Date(b.date)));
            return;
        }

        // 월별로 그룹화
        const groups = {};
        newSchedules.forEach(s => {
            const d = new Date(s.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });

        const promises = Object.keys(groups).map(async (monthKey) => {
            const itemsToAdd = groups[monthKey];
            const docRef = doc(db, 'schedules_by_month', monthKey);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                let currentItems = [];
                if (sfDoc.exists()) {
                    currentItems = sfDoc.data().items || [];
                }

                // 병합
                currentItems.push(...itemsToAdd);
                currentItems.sort((a, b) => new Date(a.date) - new Date(b.date));

                transaction.set(docRef, { items: currentItems }, { merge: true });
            });
        });

        try {
            await Promise.all(promises);
        } catch (error) {
            console.error("Batch Add Error", error);
            throw error;
        }
    }, []);

    // 고유 키 생성 유틸
    const generateScheduleKey = (s) => {
        return `${s.date}_${s.consultantId}_${s.typeCode}`;
    };

    // 8. Merge Schedules (Excel Upload - Monthly Structure)
    const mergeSchedules = useCallback(async (newSchedules) => {
        if (DISABLE_FIRESTORE) {
            // 1. 업로드된 데이터를 월별로 그룹화
            const uploadGroups = {};
            newSchedules.forEach(s => {
                if (!s.date) return;
                const d = new Date(s.date);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (!uploadGroups[key]) uploadGroups[key] = [];
                uploadGroups[key].push(s);
            });
            const uploadedMonths = new Set(Object.keys(uploadGroups));

            const summary = { added: 0, updated: 0, deleted: 0, unchanged: 0 };
            const details = { added: [], updated: [], deleted: [] };

            setSchedules(prev => {
                const finalSchedules = [];

                // A. 업로드된 파일에 해당하지 않는 월의 데이터는 그대로 유지
                prev.forEach(s => {
                    const d = new Date(s.date);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (!uploadedMonths.has(key)) {
                        finalSchedules.push(s);
                    }
                });

                // B. 업로드된 파일에 포함된 각 월별로 병합 로직 수행
                Object.keys(uploadGroups).forEach(monthKey => {
                    const uploadedItems = uploadGroups[monthKey];
                    const existingInMonth = prev.filter(s => {
                        const d = new Date(s.date);
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === monthKey;
                    });

                    const newMap = new Map();
                    uploadedItems.forEach(item => newMap.set(generateScheduleKey(item), item));

                    // 기존 데이터 대조
                    existingInMonth.forEach(existing => {
                        const key = generateScheduleKey(existing);
                        if (newMap.has(key)) {
                            const newItem = newMap.get(key);
                            const isChanged = JSON.stringify(existing) !== JSON.stringify({ ...existing, ...newItem, id: existing.id });

                            if (isChanged) {
                                summary.updated++;
                                const merged = { ...existing, ...newItem };
                                details.updated.push({ before: existing, after: merged });
                                finalSchedules.push(merged);
                            } else {
                                summary.unchanged++;
                                finalSchedules.push(existing);
                            }
                            newMap.delete(key);
                        } else {
                            // 엑셀에 없으므로 삭제
                            summary.deleted++;
                            details.deleted.push(existing);
                        }
                    });

                    // 신규 데이터 추가
                    newMap.forEach(newItem => {
                        summary.added++;
                        const itemWithId = { ...newItem, id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` };
                        details.added.push(itemWithId);
                        finalSchedules.push(itemWithId);
                    });
                });

                return finalSchedules.sort((a, b) => new Date(a.date) - new Date(b.date));
            });

            // [Simulation] 정확한 수치가 포함된 더미 로그 생성
            const dummyLog = {
                id: `dev_log_${Date.now()}`,
                type: 'MERGE',
                summary,
                details,
                timestamp: new Date().toISOString()
            };
            setChangeLog(prev => [dummyLog, ...prev]);

            return { added: details.added, updated: details.updated, deleted: details.deleted, unchanged: summary.unchanged };
        }

        // 1. Group by Month
        const groups = {};
        newSchedules.forEach(s => {
            if (!s.date) return;
            const d = new Date(s.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });

        const result = {
            processed: [],
            added: [],
            updated: [],
            deleted: [],
            unchanged: []
        };

        // 2. Process each month
        const promises = Object.keys(groups).map(async (monthKey) => {
            const uploadedItems = groups[monthKey]; // 엑셀에서 올라온 이 달의 목록
            const docRef = doc(db, 'schedules_by_month', monthKey);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                let existingItems = [];
                if (sfDoc.exists()) {
                    existingItems = sfDoc.data().items || [];
                }

                const newMap = new Map();
                uploadedItems.forEach(s => newMap.set(generateScheduleKey(s), s));

                const finalItems = [];

                // A. 기존 아이템 처리 (수정 or 삭제 or 유지)
                existingItems.forEach(existing => {
                    const key = generateScheduleKey(existing);
                    if (newMap.has(key)) {
                        // 엑셀에도 있음 -> 변경사항 체크
                        const newItem = newMap.get(key);
                        const isChanged = JSON.stringify(existing) !== JSON.stringify({ ...existing, ...newItem, id: existing.id });

                        if (isChanged) {
                            result.updated.push({ before: existing, after: { ...existing, ...newItem } });
                            finalItems.push({ ...existing, ...newItem });
                        } else {
                            result.unchanged.push(existing); // Count unchanged for log
                            finalItems.push(existing);
                        }
                        newMap.delete(key);
                    } else {
                        // 엑셀에 없음 -> 삭제 대상
                        result.deleted.push(existing);
                    }
                });

                // B. 신규 아이템 처리 (나머지)
                newMap.forEach((newItem) => {
                    const itemWithId = { ...newItem, id: newItem.id || doc(collection(db, 'temp')).id };
                    result.added.push(itemWithId);
                    finalItems.push(itemWithId);
                });

                // 정렬
                finalItems.sort((a, b) => new Date(a.date) - new Date(b.date));

                // 저장
                transaction.set(docRef, { items: finalItems }, { merge: true });
            });
        });

        try {
            await Promise.all(promises);

            // 변경 이력 기록
            if (result.added.length > 0 || result.updated.length > 0 || result.deleted.length > 0) {
                const logData = {
                    type: 'MERGE',
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
                await addDoc(collection(db, 'change_logs'), {
                    ...logData,
                    createdAt: serverTimestamp()
                });
            }

            // 로컬 캐시 초기화 (다음 조회 시 다시 읽도록)
            setLoadedMonths(new Set());
            // UI 갱신을 위해 현재 뷰 갱신 필요 (여기선 단순화)
            fetchMonthSchedules(new Date().getFullYear(), new Date().getMonth() + 1);

            return result;
        } catch (error) {
            console.error("Merge Error", error);
            throw error;
        }
    }, [loadedMonths, fetchMonthSchedules]);

    // 9. Clear All Schedules (Monthly Doc Deletion)
    // *주의: 월별 문서 전체를 삭제하는 것은 위험하므로, 여기서는 구현 생략하거나 신중히 처리해야 함.
    // 관리자 기능으로만 사용.
    const clearAllSchedules = useCallback(async () => {
        if (DISABLE_FIRESTORE) {
            setSchedules([]);
            return { deletedCount: schedules.length };
        }
        // 모든 월별 문서를 지우는 것은 비효율적/위험함.
        // 필요하다면 컬렉션 전체 삭제 스크립트 사용 권장.
        console.warn("Clear All Schedules is disabled for Monthly Aggregation mode.");
        return { deletedCount: 0 };
    }, []);

    // 6. Update Schedule (Monthly Doc Transaction)
    const updateSchedule = useCallback(async (id, updatedData) => {
        // 1. 기존 스케줄 찾기 (Old Date 확인용 및 더미 로그용)
        const oldSchedule = schedules.find(s => s.id === id);
        if (!oldSchedule) {
            console.error("Schedule not found in local state");
            if (DISABLE_FIRESTORE) return;
            throw new Error("Schedule not found in local state");
        }

        if (DISABLE_FIRESTORE) {
            setSchedules(prev => prev.map(schedule =>
                schedule.id === id ? { ...schedule, ...updatedData } : schedule
            ).sort((a, b) => new Date(a.date) - new Date(b.date)));

            // [Simulation] 더미 로그 생성
            setChangeLog(prev => [{
                type: 'UPDATE',
                summary: { added: 0, updated: 1, deleted: 0 },
                details: { added: [], updated: [{ before: oldSchedule, after: { ...oldSchedule, ...updatedData } }], deleted: [] },
                timestamp: new Date().toISOString()
            }, ...prev]);

            return;
        }

        const oldDate = new Date(oldSchedule.date);
        const newDate = new Date(updatedData.date);

        const oldMonthKey = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}`;
        const newMonthKey = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;

        const oldDocRef = doc(db, 'schedules_by_month', oldMonthKey);
        const newDocRef = doc(db, 'schedules_by_month', newMonthKey);

        try {
            await runTransaction(db, async (transaction) => {
                // Case A: 같은 달 내에서 수정
                if (oldMonthKey === newMonthKey) {
                    const sfDoc = await transaction.get(oldDocRef);
                    if (!sfDoc.exists()) throw new Error("Document does not exist!");

                    const items = sfDoc.data().items || [];
                    const index = items.findIndex(s => s.id === id);
                    if (index === -1) throw new Error("Schedule not found in document");

                    // 업데이트
                    items[index] = { ...items[index], ...updatedData };
                    items.sort((a, b) => new Date(a.date) - new Date(b.date)); // 정렬 유지

                    transaction.set(oldDocRef, { items }, { merge: true });
                }
                // Case B: 날짜가 변경되어 달이 바뀌는 경우 (이동)
                else {
                    const oldSFDoc = await transaction.get(oldDocRef);
                    const newSFDoc = await transaction.get(newDocRef);

                    // 1. Remove from Old
                    let oldItems = [];
                    if (oldSFDoc.exists()) {
                        oldItems = oldSFDoc.data().items || [];
                        const index = oldItems.findIndex(s => s.id === id);
                        if (index !== -1) {
                            oldItems.splice(index, 1);
                        }
                    }

                    // 2. Add to New
                    let newItems = [];
                    if (newSFDoc.exists()) {
                        newItems = newSFDoc.data().items || [];
                    }
                    // ID는 유지, 데이터는 업데이트
                    const movedSchedule = { ...oldSchedule, ...updatedData };
                    newItems.push(movedSchedule);
                    newItems.sort((a, b) => new Date(a.date) - new Date(b.date));

                    transaction.set(oldDocRef, { items: oldItems }, { merge: true });
                    transaction.set(newDocRef, { items: newItems }, { merge: true });
                }
            });

            // [Log] 변경 이력 기록
            await addDoc(collection(db, 'change_logs'), {
                type: 'UPDATE',
                id,
                changes: updatedData,
                timestamp: new Date().toISOString(),
                createdAt: serverTimestamp()
            });

            // Local Update
            setSchedules(prev => prev.map(schedule =>
                schedule.id === id ? { ...schedule, ...updatedData } : schedule
            ).sort((a, b) => new Date(a.date) - new Date(b.date)));

        } catch (error) {
            console.error("Error updating document: ", error);
            throw error;
        }
    }, [schedules]); // schedules 의존성 필요 (oldSchedule 찾기 위해)

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

    // 7. Delete Schedule (Monthly Doc Transaction)
    const deleteSchedule = useCallback(async (id) => {
        const scheduleToDelete = schedules.find(s => s.id === id);
        if (!scheduleToDelete) {
            console.error("Schedule not found in local state");
            return;
        }

        if (DISABLE_FIRESTORE) {
            setSchedules(prev => prev.filter(schedule => schedule.id !== id));

            // [Simulation] 더미 로그 생성
            setChangeLog(prev => [{
                type: 'DELETE',
                summary: { added: 0, updated: 0, deleted: 1 },
                details: { added: [], updated: [], deleted: [scheduleToDelete] },
                timestamp: new Date().toISOString()
            }, ...prev]);

            return;
        }

        const d = new Date(scheduleToDelete.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const docRef = doc(db, 'schedules_by_month', monthKey);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                if (!sfDoc.exists()) throw new Error("Document does not exist!");

                const items = sfDoc.data().items || [];
                const newItems = items.filter(s => s.id !== id);

                transaction.set(docRef, { items: newItems }, { merge: true });
            });

            // [Log] 변경 이력 기록
            await addDoc(collection(db, 'change_logs'), {
                type: 'DELETE',
                id,
                schedule: scheduleToDelete,
                timestamp: new Date().toISOString(),
                createdAt: serverTimestamp()
            });

            setSchedules(prev => prev.filter(schedule => schedule.id !== id));
        } catch (error) {
            console.error("Error deleting document: ", error);
            // throw error; // UI 멈춤 방지 위해 에러 던지지 않음
        }
    }, [schedules]);

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
        fetchMonthSchedules,
        fetchLogs,
        fetchUsers,
        fetchCodes,

        // Debug
        totalReads,
        resetReads
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}
