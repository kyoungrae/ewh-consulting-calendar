import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';

/**
 * 스케줄 관리 훅 (Global DataContext 사용)
 */
export function useSchedules() {
    const context = useData();
    return {
        schedules: context.schedules,
        loading: context.schedulesLoading,
        error: context.schedulesError,
        changeLog: context.changeLog,
        addSchedule: context.addSchedule,
        updateSchedule: context.updateSchedule,
        deleteSchedule: context.deleteSchedule,
        batchAddSchedules: context.batchAddSchedules,
        mergeSchedules: context.mergeSchedules,
        clearAllSchedules: context.clearAllSchedules,
        setSchedules: context.setSchedules,
        fetchSchedules: context.fetchSchedules,
        fetchMonthSchedules: context.fetchMonthSchedules
    };
}

/**
 * 공통 코드 관리 훅 (Global DataContext 사용)
 */
export function useCommonCodes() {
    const context = useData();
    return {
        codes: context.codes,
        loading: context.codesLoading,
        error: context.codesError,
        addCode: context.addCode,
        updateCode: context.updateCode,
        deleteCode: context.deleteCode
    };
}

/**
 * 사용자 관리 훅 (Global DataContext 사용)
 */
export function useUsers() {
    const context = useData();
    return {
        users: context.users,
        loading: context.usersLoading,
        error: context.usersError,
        updateUser: context.updateUser,
        deleteUser: context.deleteUser
    };
}

/**
 * 특정 컨설턴트의 스케줄만 조회하는 훅 (최적화: 전역 데이터에서 필터링)
 */
export function useConsultantSchedules(consultantId) {
    const { schedules, schedulesLoading, schedulesError } = useData();

    // 전역 schedules에서 해당 컨설턴트 것만 필터링 (추가 읽기 발생 안함)
    const consultantSchedules = schedules.filter(s => s.consultantId === consultantId);

    return {
        schedules: consultantSchedules,
        loading: schedulesLoading,
        error: schedulesError
    };
}
