import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Users, Clock, MapPin, Tag } from 'lucide-react';

export default function CalendarPage() {
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const { openSidebar } = useOutletContext();

    const { userProfile, isAdmin } = useAuth();
    const { schedules, loading: schedulesLoading } = useSchedules();
    const { codes } = useCommonCodes();
    const { users } = useUsers();

    // 컨설턴터인 경우 자신의 스케줄만 필터링
    const filteredSchedules = useMemo(() => {
        if (isAdmin) {
            return schedules;
        }
        return schedules.filter(s => s.consultantId === userProfile?.uid);
    }, [schedules, isAdmin, userProfile?.uid]);

    // FullCalendar 이벤트 형식으로 변환
    const calendarEvents = useMemo(() => {
        return filteredSchedules.map(schedule => {
            const typeCode = codes.find(c => c.code === schedule.typeCode);
            const consultant = users.find(u => u.uid === schedule.consultantId);

            // 컨설팅 구분에 따른 색상
            const colorMap = {
                '01': '#00462A', // 진로 - 그린
                '02': '#3b82f6', // 취업 - 블루
                '03': '#8b5cf6', // 학업 - 퍼플
            };

            return {
                id: schedule.id,
                title: typeCode?.name || '미분류 일정',
                start: schedule.date,
                end: schedule.endDate || schedule.date,
                backgroundColor: colorMap[schedule.typeCode] || '#00462A',
                extendedProps: {
                    ...schedule,
                    typeName: typeCode?.name,
                    consultantName: consultant?.name
                }
            };
        });
    }, [filteredSchedules, codes, users]);

    // 선택된 날짜의 일정 필터링
    const selectedDateSchedules = useMemo(() => {
        if (!selectedDate) return [];
        return filteredSchedules
            .filter(s => s.date?.startsWith(selectedDate))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredSchedules, selectedDate]);

    // 오늘의 일정 통계
    const todayStats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const todaySchedules = filteredSchedules.filter(s => s.date?.startsWith(today));

        return {
            total: todaySchedules.length,
            byType: codes.map(code => ({
                code: code.code,
                name: code.name,
                count: todaySchedules.filter(s => s.typeCode === code.code).length
            }))
        };
    }, [filteredSchedules, codes]);

    const handleEventClick = (info) => {
        setSelectedEvent(info.event.extendedProps);
        setIsModalOpen(true);
    };

    const handleDateClick = (info) => {
        setSelectedDate(info.dateStr);
    };

    if (schedulesLoading) {
        return (
            <>
                <Header title="달력" onMenuClick={openSidebar} />
                <div className="page-content">
                    <LoadingSpinner message="일정을 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="달력" onMenuClick={openSidebar} />
            <div className="page-content">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-bold text-gray-800">컨설팅 일정</h1>
                </div>

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon green">
                            <Calendar size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>오늘 비정된 일정</h3>
                            <p>{todayStats.total}</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue">
                            <Users size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>전체 일정 수</h3>
                            <p>{filteredSchedules.length}</p>
                        </div>
                    </div>
                    {todayStats.byType.slice(0, 2).map(type => (
                        <div key={type.code} className="stat-card">
                            <div className="stat-icon purple">
                                <Clock size={24} />
                            </div>
                            <div className="stat-info">
                                <h3>오늘 {type.name}</h3>
                                <p>{type.count}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Layout: Calendar + Side Summary - Stretched to fill height */}
                <div className="flex flex-col xl:flex-row gap-6 items-stretch flex-1">
                    {/* Calendar Card */}
                    <div className="flex-1 card w-full min-w-0 flex flex-col">
                        <div className="card-body flex-1 h-full min-h-[500px]">
                            <FullCalendar
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                headerToolbar={{
                                    left: 'prev,next today',
                                    center: 'title',
                                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                                }}
                                locale="ko"
                                events={calendarEvents}
                                eventClick={handleEventClick}
                                dateClick={handleDateClick}
                                height="100%"
                                dayMaxEvents={3}
                                buttonText={{
                                    today: '오늘',
                                    month: '월',
                                    week: '주',
                                    day: '일'
                                }}
                                dayCellClassNames={(arg) => {
                                    const y = arg.date.getFullYear();
                                    const m = String(arg.date.getMonth() + 1).padStart(2, '0');
                                    const d = String(arg.date.getDate()).padStart(2, '0');
                                    const dateStr = `${y}-${m}-${d}`;
                                    return dateStr === selectedDate ? 'selected-day-cell' : '';
                                }}
                            />
                        </div>
                    </div>

                    {/* Summary Side Panel */}
                    <div className="w-full xl:w-80 flex flex-col animate-fade-in shrink-0">
                        <div className="card h-full flex flex-col overflow-hidden">
                            <div className="card-header bg-gray-50/50 py-4 border-b border-gray-100 shrink-0">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-[#00462A]">
                                        {selectedDate.replace(/-/g, '. ')} 요약
                                    </h2>
                                    <span className="bg-[#00462A]/10 text-[#00462A] text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {selectedDateSchedules.length}건
                                    </span>
                                </div>
                            </div>
                            <div className="card-body p-0 overflow-y-auto flex-1 h-0">
                                {selectedDateSchedules.length > 0 ? (
                                    <div className="divide-y divide-gray-50">
                                        {selectedDateSchedules.map(schedule => {
                                            const typeCode = codes.find(c => c.code === schedule.typeCode);
                                            const consultant = users.find(u => u.uid === schedule.consultantId);
                                            return (
                                                <div
                                                    key={schedule.id}
                                                    onClick={() => {
                                                        setSelectedEvent({
                                                            ...schedule,
                                                            typeName: typeCode?.name,
                                                            consultantName: consultant?.name
                                                        });
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="p-4 hover:bg-gray-50 cursor-pointer transition-all duration-200 group border-l-4 border-transparent hover:border-[#00462A]"
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-bold text-gray-800 group-hover:text-[#00462A] transition-colors">
                                                            {typeCode?.name}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-medium">상세보기</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                                            <Clock size={14} className="text-gray-400" />
                                                            <span>
                                                                {new Date(schedule.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        {isAdmin && (
                                                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                                                <Users size={14} />
                                                                <span>{consultant?.name || '관리자'}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-gray-200">
                                            <Calendar size={28} className="text-gray-200" />
                                        </div>
                                        <h4 className="text-gray-400 font-bold text-sm">일정이 없습니다</h4>
                                        <p className="text-gray-300 text-[11px] mt-1">다른 날짜를 선택해 보세요</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Event Detail Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title="일정 상세"
                >
                    {selectedEvent && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                                <div
                                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: '#e6f7ef' }}
                                >
                                    <Tag size={24} style={{ color: '#00462A' }} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-900 text-lg">
                                        {selectedEvent.typeName || '미분류 일정'}
                                    </h4>
                                    <p className="text-sm text-gray-500">컨설팅 상세 정보</p>
                                </div>
                            </div>

                            <div className="space-y-3 px-1">
                                <div className="flex items-center gap-3 text-sm">
                                    <Clock size={18} className="text-gray-400" />
                                    <div className="flex flex-col">
                                        <span className="text-gray-700 font-medium">
                                            {new Date(selectedEvent.date).toLocaleDateString('ko-KR', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                weekday: 'long'
                                            })}
                                        </span>
                                        <span className="text-gray-500 text-xs mt-0.5">
                                            {new Date(selectedEvent.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                            {selectedEvent.endDate ? ` ~ ${new Date(selectedEvent.endDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 text-sm">
                                    <MapPin size={18} className="text-gray-400" />
                                    <span className="text-gray-700">
                                        {selectedEvent.location || '장소 미정'}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 text-sm">
                                    <Users size={18} className="text-gray-400" />
                                    <span className="text-gray-700">
                                        담당: <span className="font-medium">{selectedEvent.consultantName || '미배정'}</span>
                                    </span>
                                </div>
                            </div>

                            {selectedEvent.memo && (
                                <div className="pt-4 border-t border-gray-100">
                                    <h5 className="text-sm font-semibold text-gray-900 mb-2">상세 메모</h5>
                                    <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                        {selectedEvent.memo}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="btn btn-secondary px-6"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>
        </>
    );
}
