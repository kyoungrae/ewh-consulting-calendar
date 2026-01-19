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
import { Calendar, Users, Clock, MapPin } from 'lucide-react';

export default function CalendarPage() {
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { openSidebar } = useOutletContext();

    const { userProfile, isAdmin } = useAuth();
    const { schedules, loading: schedulesLoading } = useSchedules();
    const { codes } = useCommonCodes();
    const { users } = useUsers();

    // 컨설턴트인 경우 자신의 스케줄만 필터링
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
                title: `${schedule.studentName} - ${typeCode?.name || '미분류'}`,
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
        // 관리자만 날짜 클릭으로 일정 추가 가능
        if (isAdmin) {
            // TODO: 일정 추가 모달 열기
            console.log('Date clicked:', info.dateStr);
        }
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
                <div className="page-header">
                    <h1 className="page-title">컨설팅 일정</h1>
                    <p className="page-description">
                        {isAdmin ? '전체 컨설팅 일정을 확인하세요' : '나의 컨설팅 일정을 확인하세요'}
                    </p>
                </div>

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon green">
                            <Calendar size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>오늘 예정된 일정</h3>
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

                {/* Calendar */}
                <div className="card">
                    <div className="card-body">
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
                            height="auto"
                            dayMaxEvents={3}
                            buttonText={{
                                today: '오늘',
                                month: '월',
                                week: '주',
                                day: '일'
                            }}
                        />
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
                                    <Calendar size={24} style={{ color: '#00462A' }} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-900">
                                        {selectedEvent.studentName}
                                    </h4>
                                    <span className="badge badge-green">
                                        {selectedEvent.typeName || '미분류'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm">
                                    <Clock size={18} className="text-gray-400" />
                                    <span className="text-gray-700">
                                        {new Date(selectedEvent.date).toLocaleDateString('ko-KR', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            weekday: 'long'
                                        })}
                                    </span>
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
                                        담당: {selectedEvent.consultantName || '미배정'}
                                    </span>
                                </div>
                            </div>

                            {selectedEvent.memo && (
                                <div className="pt-4 border-t border-gray-200">
                                    <h5 className="text-sm font-medium text-gray-700 mb-2">메모</h5>
                                    <p className="text-sm text-gray-600">{selectedEvent.memo}</p>
                                </div>
                            )}

                            <div className="pt-4 border-t border-gray-200 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="btn btn-secondary"
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
