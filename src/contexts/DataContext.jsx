import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

const DataContext = createContext();

export function useData() {
    return useContext(DataContext);
}

function useApiList(path, scope, enabled) {
    const [snapshot, setSnapshot] = useState({ scope: null, items: [], error: null });
    const inFlight = useRef(null);

    const reload = useCallback((force = false) => {
        if (!enabled) return Promise.resolve([]);
        if (!force && inFlight.current?.scope === scope) return inFlight.current.promise;
        const promise = api(path)
            .then((data) => {
                if (inFlight.current?.promise === promise) {
                    setSnapshot({ scope, items: data, error: null });
                }
                return data;
            })
            .catch((err) => {
                if (inFlight.current?.promise === promise) {
                    setSnapshot((previous) => ({ scope, items: previous.scope === scope ? previous.items : [], error: err.message }));
                }
                throw err;
            })
            .finally(() => {
                if (inFlight.current?.promise === promise) inFlight.current = null;
            });
        inFlight.current = { scope, promise };
        return promise;
    }, [enabled, path, scope]);

    useEffect(() => {
        if (enabled) reload().catch(() => {});
    }, [enabled, reload]);

    return {
        items: enabled && snapshot.scope === scope ? snapshot.items : [],
        loading: enabled && snapshot.scope !== scope,
        error: enabled && snapshot.scope === scope ? snapshot.error : null,
        reload
    };
}

export function DataProvider({ children }) {
    const { currentUser, userProfile, isAdmin } = useAuth();
    const scope = `${currentUser?.uid || ''}:${userProfile?.role || ''}`;
    const enabled = Boolean(currentUser && userProfile?.status === 'approved');
    const schedulesList = useApiList('/schedules', scope, enabled);
    const usersList = useApiList('/users', scope, enabled);
    const codesList = useApiList('/codes', scope, enabled);
    const specialsList = useApiList('/special-schedules', scope, enabled);
    const logsList = useApiList('/change-logs', scope, enabled && isAdmin);
    const fetchSchedules = schedulesList.reload;
    const fetchUsers = usersList.reload;
    const fetchCodes = codesList.reload;
    const fetchSpecialSchedules = specialsList.reload;
    const fetchLogs = logsList.reload;

    // 서버에서 권한에 맞게 필터링한 데이터를 다시 읽어 다른 사용자의 변경을 반영한다.
    useEffect(() => {
        if (!enabled) return;
        const refresh = () => {
            if (document.visibilityState === 'hidden') return;
            Promise.allSettled([
                fetchSchedules(), fetchUsers(), fetchCodes(), fetchSpecialSchedules(), fetchLogs()
            ]);
        };
        const onUsersChanged = () => fetchUsers(true).catch(() => {});
        const interval = window.setInterval(refresh, 30000);
        window.addEventListener('focus', refresh);
        window.addEventListener('ewh-users-changed', onUsersChanged);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('ewh-users-changed', onUsersChanged);
        };
    }, [enabled, fetchSchedules, fetchUsers, fetchCodes, fetchSpecialSchedules, fetchLogs]);

    const fetchMonthSchedules = useCallback(() => fetchSchedules().catch(() => []), [fetchSchedules]);

    const refreshSchedules = async () => {
        await Promise.all([fetchSchedules(true), fetchLogs(true)]);
    };

    const mutate = async (path, method, body, refresh) => {
        const result = await api(path, { method, body });
        // 성공한 저장을 재조회 실패로 오인해 다시 실행하지 않도록 조회 오류는 목록에 표시한다.
        await refresh().catch(() => {});
        return result;
    };

    const addSchedule = (data) => mutate('/schedules', 'POST', data, refreshSchedules);
    const updateSchedule = (id, data) => mutate(`/schedules/${encodeURIComponent(id)}`, 'PATCH', data, refreshSchedules);
    const deleteSchedule = (id) => mutate(`/schedules/${encodeURIComponent(id)}`, 'DELETE', undefined, refreshSchedules);
    const batchAddSchedules = (schedules) => mutate('/schedules/import', 'POST', { schedules, mode: 'append' }, refreshSchedules);
    const mergeSchedules = (schedules, isReplace = false, targetMonths = null) => (
        mutate('/schedules/import', 'POST', { schedules, isReplace, targetMonths }, refreshSchedules)
    );
    const rollbackChangeLog = (log) => mutate(`/change-logs/${encodeURIComponent(log.id)}/rollback`, 'POST', {}, refreshSchedules);
    const clearAllSchedules = () => mutate('/schedules', 'DELETE', undefined, refreshSchedules);
    const updateUser = (id, data) => mutate(`/users/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchUsers(true));
    const deleteUser = (id) => mutate(`/users/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchUsers(true));
    const addCode = (data) => mutate('/codes', 'POST', data, () => fetchCodes(true));
    const updateCode = (id, data) => mutate(`/codes/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchCodes(true));
    const deleteCode = (id) => mutate(`/codes/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchCodes(true));
    const addSpecialSchedule = (data) => mutate('/special-schedules', 'POST', data, () => fetchSpecialSchedules(true));
    const updateSpecialSchedule = (id, data) => mutate(`/special-schedules/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchSpecialSchedules(true));
    const deleteSpecialSchedule = (id) => mutate(`/special-schedules/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchSpecialSchedules(true));

    const errors = [schedulesList.error, usersList.error, codesList.error, specialsList.error, logsList.error].filter(Boolean);

    return (
        <DataContext.Provider value={{
            schedules: schedulesList.items,
            schedulesLoading: schedulesList.loading,
            schedulesError: schedulesList.error,
            users: usersList.items,
            usersLoading: usersList.loading,
            usersError: usersList.error,
            codes: codesList.items,
            codesLoading: codesList.loading,
            codesError: codesList.error,
            specialSchedules: specialsList.items,
            specialSchedulesLoading: specialsList.loading,
            specialSchedulesError: specialsList.error,
            changeLog: logsList.items,
            logsLoading: logsList.loading,
            fetchSchedules,
            // 전체 목록을 유지하므로 월 이동 시에도 최신 전체 목록을 다시 조회한다.
            fetchMonthSchedules,
            fetchUsers,
            fetchCodes,
            fetchSpecialSchedules,
            fetchLogs,
            addSchedule,
            updateSchedule,
            deleteSchedule,
            batchAddSchedules,
            mergeSchedules,
            rollbackChangeLog,
            clearAllSchedules,
            updateUser,
            deleteUser,
            addCode,
            updateCode,
            deleteCode,
            addSpecialSchedule,
            updateSpecialSchedule,
            deleteSpecialSchedule
        }}>
            {enabled && errors.length > 0 && (
                <div role="alert" className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-lg">
                    데이터를 새로 불러오지 못했습니다. {Array.from(new Set(errors)).join(' ')}
                    <button type="button" className="ml-3 font-semibold underline" onClick={() => {
                        Promise.allSettled([fetchSchedules(), fetchUsers(), fetchCodes(), fetchSpecialSchedules(), fetchLogs()]);
                    }}>다시 시도</button>
                </div>
            )}
            {children}
        </DataContext.Provider>
    );
}
