import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { runListMutation } from '../lib/list-mutation';

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
        // A request from a previous user/session must not update this list after
        // logout or a scope change, even if it completes later.
        return () => { inFlight.current = null; };
    }, [enabled, reload]);

    const upsert = useCallback((item) => {
        if (!enabled || snapshot.scope !== scope || !item || typeof item.id !== 'string') return false;
        setSnapshot(previous => {
            if (previous.scope !== scope) return previous;
            const index = previous.items.findIndex(existing => existing.id === item.id);
            const items = [...previous.items];
            if (index < 0) items.push(item);
            else items[index] = item;
            return { ...previous, items };
        });
        return true;
    }, [enabled, scope, snapshot.scope]);

    const remove = useCallback((id) => {
        if (!enabled || snapshot.scope !== scope || typeof id !== 'string') return false;
        setSnapshot(previous => previous.scope === scope
            ? { ...previous, items: previous.items.filter(item => item.id !== id) }
            : previous);
        return true;
    }, [enabled, scope, snapshot.scope]);

    return {
        items: enabled && snapshot.scope === scope ? snapshot.items : [],
        loading: enabled && snapshot.scope !== scope,
        error: enabled && snapshot.scope === scope ? snapshot.error : null,
        reload,
        upsert,
        remove
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

    // Individual writes return the saved item: show that immediately while the
    // server list refreshes. Bulk changes still wait for the full refreshed list.
    const mutate = (path, method, body, refresh, apply) => runListMutation({
        request: () => api(path, { method, body }), refresh, apply
    });

    const addSchedule = (data) => mutate('/schedules', 'POST', data, refreshSchedules, schedulesList.upsert);
    const updateSchedule = (id, data) => mutate(`/schedules/${encodeURIComponent(id)}`, 'PATCH', data, refreshSchedules, schedulesList.upsert);
    const deleteSchedule = (id) => mutate(`/schedules/${encodeURIComponent(id)}`, 'DELETE', undefined, refreshSchedules, result => result?.ok === true && schedulesList.remove(id));
    const batchAddSchedules = (schedules) => mutate('/schedules/import', 'POST', { schedules, mode: 'append' }, refreshSchedules);
    const mergeSchedules = (schedules, isReplace = false, targetMonths = null) => (
        mutate('/schedules/import', 'POST', { schedules, isReplace, targetMonths }, refreshSchedules)
    );
    const rollbackChangeLog = (log) => mutate(`/change-logs/${encodeURIComponent(log.id)}/rollback`, 'POST', {}, refreshSchedules);
    const clearAllSchedules = () => mutate('/schedules', 'DELETE', undefined, refreshSchedules);
    const updateUser = (id, data) => mutate(`/users/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchUsers(true), usersList.upsert);
    const deleteUser = (id) => mutate(`/users/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchUsers(true), result => result?.ok === true && usersList.remove(id));
    const addCode = (data) => mutate('/codes', 'POST', data, () => fetchCodes(true), codesList.upsert);
    const updateCode = (id, data) => mutate(`/codes/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchCodes(true), codesList.upsert);
    const deleteCode = (id) => mutate(`/codes/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchCodes(true), result => result?.ok === true && codesList.remove(id));
    const addSpecialSchedule = (data) => mutate('/special-schedules', 'POST', data, () => fetchSpecialSchedules(true), specialsList.upsert);
    const updateSpecialSchedule = (id, data) => mutate(`/special-schedules/${encodeURIComponent(id)}`, 'PATCH', data, () => fetchSpecialSchedules(true), specialsList.upsert);
    const deleteSpecialSchedule = (id) => mutate(`/special-schedules/${encodeURIComponent(id)}`, 'DELETE', undefined, () => fetchSpecialSchedules(true), result => result?.ok === true && specialsList.remove(id));

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
