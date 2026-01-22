import { useState, useMemo, useRef, useEffect } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, Users, Clock, MapPin, Tag, Download, ChevronDown } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export default function CalendarPage() {
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [viewMode, setViewMode] = useState('calendar');
    const [mainTab, setMainTab] = useState('schedules');
    const [periodTab, setPeriodTab] = useState('h1');
    const [selectedConsultant, setSelectedConsultant] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedWeek, setSelectedWeek] = useState('all');
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
    const [currentDay, setCurrentDay] = useState(new Date().getDate());
    const [currentView, setCurrentView] = useState('dayGridMonth');

    // List View State
    const [downloadPeriod, setDownloadPeriod] = useState('monthly'); // 'monthly', 'yearly', 'custom'
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPeriodSelectorOpen, setIsPeriodSelectorOpen] = useState(false);
    const periodSelectorRef = useRef(null);

    // 정렬 상태 추가
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'ascending' });

    const [searchParams] = useSearchParams();
    const urlConsultantId = searchParams.get('consultantId');

    // URL 파라미터(consultantId)가 있을 경우 해당 컨설턴트 뷰로 전환
    useEffect(() => {
        if (urlConsultantId) {
            setSelectedConsultant(urlConsultantId);
            setMainTab('consultants');
        }
    }, [urlConsultantId]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'ascending') {
                direction = 'descending';
            } else if (sortConfig.direction === 'descending') {
                setSortConfig({ key: null, direction: 'ascending' });
                return;
            }
        }
        setSortConfig({ key, direction });
    };

    const calendarRef = useRef(null);
    const { openSidebar } = useOutletContext();
    const navigate = useNavigate();

    // Close Dropdown on Outside Click
    useEffect(() => {
        function handleClickOutside(event) {
            if (periodSelectorRef.current && !periodSelectorRef.current.contains(event.target)) {
                setIsPeriodSelectorOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const { userProfile, isAdmin } = useAuth();
    const { schedules, loading: schedulesLoading } = useSchedules();
    const { codes } = useCommonCodes();
    const { users } = useUsers();

    // 관리자가 아니면 'consultants' 탭을 기본으로 설정
    useEffect(() => {
        if (!isAdmin) {
            setMainTab('consultants');
        }
    }, [isAdmin]);

    // 컨설턴터인 경우 자신의 스케줄만 필터링 (+ 주차 필터)
    const filteredSchedules = useMemo(() => {
        let result = schedules;

        const getWeekNumber = (date) => {
            const d = new Date(date);
            const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
            const dayOfWeek = firstDay.getDay();
            return Math.ceil((d.getDate() + dayOfWeek) / 7);
        };

        if (!isAdmin) {
            result = result.filter(s => s.consultantId === userProfile?.uid);
        }
        if (selectedConsultant !== 'all') {
            result = result.filter(s => s.consultantId === selectedConsultant);
        }
        if (selectedType !== 'all') {
            result = result.filter(s => s.typeCode === selectedType);
        }
        if (viewMode === 'list' && selectedWeek !== 'all') {
            result = result.filter(s => getWeekNumber(s.date) === parseInt(selectedWeek));
        }
        return result;
    }, [schedules, isAdmin, userProfile?.uid, selectedConsultant, selectedType, selectedWeek, viewMode]);

    // 칩 배경색 + 테두리색 (원본 HTML의 .event-chip 스타일)
    // 칩 배경색 + 테두리색 (Common Codes에서 가져오거나 기본값 반환)
    const getChipStyle = (typeCodeId, typeName) => {
        const code = codes.find(c => c.code === typeCodeId);
        if (code && code.color) {
            return { bg: code.color, border: code.borderColor || code.color };
        }

        // 폴백 (기존 하드코딩 로직 유지)
        if (typeName?.includes('웰컴세션')) return { bg: '#e1f5fe', border: '#03a9f4' };
        if (typeName?.includes('진로개발') || typeName?.includes('진로취업')) return { bg: '#e3f2fd', border: '#0277bd' };
        if (typeName?.includes('서류면접')) return { bg: '#fffde7', border: '#fbc02d' };
        if (typeName?.includes('공기업')) return { bg: '#f5f5f5', border: '#616161' };
        if (typeName?.includes('이공계')) return { bg: '#e8f5e9', border: '#2e7d32' };
        if (typeName?.includes('외국계')) return { bg: '#f3e5f5', border: '#7b1fa2' };
        if (typeName?.includes('콘텐츠엔터')) return { bg: '#fff3e0', border: '#ef6c00' };
        return { bg: '#e0f2f1', border: '#00695c' };
    };

    // FullCalendar 이벤트 형식으로 변환
    const calendarEvents = useMemo(() => {
        // 1. 날짜별로 그룹화
        const eventsByDate = {};
        filteredSchedules.forEach(schedule => {
            if (!schedule.date) return;
            const dateKey = schedule.date.split('T')[0];
            if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
            eventsByDate[dateKey].push(schedule);
        });

        const sortedEventObjects = [];

        // 2. 각 날짜별로 정렬 및 구분선 로직 적용
        Object.keys(eventsByDate).forEach(dateKey => {
            const dailySchedules = eventsByDate[dateKey];

            // 정렬: 이름(가나다) -> 시간
            dailySchedules.sort((a, b) => {
                const consultantA = users.find(u => u.uid === a.consultantId)?.name || a.consultantName || '미배정';
                const consultantB = users.find(u => u.uid === b.consultantId)?.name || b.consultantName || '미배정';

                // 이름 비교
                if (consultantA < consultantB) return -1;
                if (consultantA > consultantB) return 1;

                // 이름이 같으면 시간 비교
                return new Date(a.date) - new Date(b.date);
            });

            // 구분선 마킹
            dailySchedules.forEach((schedule, index) => {
                let needsSeparator = false;
                if (index > 0) {
                    const prev = dailySchedules[index - 1];
                    const prevName = users.find(u => u.uid === prev.consultantId)?.name || prev.consultantName || '미배정';
                    const currName = users.find(u => u.uid === schedule.consultantId)?.name || schedule.consultantName || '미배정';

                    if (prevName !== currName) {
                        needsSeparator = true;
                    }
                }

                sortedEventObjects.push({
                    schedule,
                    sortIndex: index, // 같은 날짜 내에서의 정렬 순서
                    needsSeparator
                });
            });
        });

        // 3. FC 이벤트 객체로 변환
        return sortedEventObjects.map(({ schedule, sortIndex, needsSeparator }) => {
            const typeCode = codes.find(c => c.code === schedule.typeCode);
            const consultant = users.find(u => u.uid === schedule.consultantId);
            const consultantName = consultant?.name || schedule.consultantName || '미배정';
            const chipStyle = getChipStyle(schedule.typeCode, typeCode?.name);

            const date = new Date(schedule.date);
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            return {
                id: schedule.id,
                title: `${timeStr} ${typeCode?.name || '미분류'} (${consultantName})`,
                start: schedule.date,
                end: schedule.endDate || schedule.date,
                backgroundColor: chipStyle.bg,
                textColor: '#222',
                borderColor: chipStyle.border,
                extendedProps: {
                    ...schedule,
                    typeName: typeCode?.name,
                    consultantName: consultantName,
                    chipStyle: chipStyle,
                    sortIndex: sortIndex,      // 정렬용 인덱스
                    needsSeparator: needsSeparator // 구분선 표시 여부
                }
            };
        });
    }, [filteredSchedules, codes, users]);

    // 선택된 날짜의 일정 필터링
    const selectedDateSchedules = useMemo(() => {
        if (!selectedDate) return [];
        // 시간 정보가 포함되어 있어도 날짜 부분만 사용하여 해당 날짜 전체 일정을 보여줌
        const datePart = selectedDate.split('T')[0];
        return filteredSchedules
            .filter(s => s.date?.startsWith(datePart))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredSchedules, selectedDate]);

    // 요약 바에 표시할 포맷팅된 날짜/시간
    const getDisplayDate = useMemo(() => {
        if (!selectedDate) return '';
        const datePart = selectedDate.split('T')[0];
        if (!selectedDate.includes('T')) return datePart;

        const date = new Date(selectedDate);
        if (isNaN(date.getTime())) return selectedDate;
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${datePart} ${hh}:${mm}`;
    }, [selectedDate]);

    // 선택된 날짜 통계
    const selectedDateStats = useMemo(() => {
        const byType = {};
        const byConsultant = {};

        selectedDateSchedules.forEach(schedule => {
            const typeCode = codes.find(c => c.code === schedule.typeCode);
            const consultant = users.find(u => u.uid === schedule.consultantId);

            const typeName = typeCode?.name || '미분류';
            const consultantName = consultant?.name || '미배정';

            byType[typeName] = (byType[typeName] || 0) + 1;
            byConsultant[consultantName] = (byConsultant[consultantName] || 0) + 1;
        });

        return {
            total: selectedDateSchedules.length,
            byType: Object.entries(byType),
            byConsultant: Object.entries(byConsultant)
        };
    }, [selectedDateSchedules, codes, users]);

    // 목록 다운로드용 데이터 필터링
    const downloadTargetSchedules = useMemo(() => {
        if (downloadPeriod === 'monthly') {
            const targetPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
            return filteredSchedules
                .filter(s => s.date && s.date.startsWith(targetPrefix))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } else if (downloadPeriod === 'yearly') {
            return filteredSchedules
                .filter(s => s.date && s.date.startsWith(`${currentYear}-`))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        } else if (downloadPeriod === 'custom') {
            return filteredSchedules
                .filter(s => {
                    if (!s.date) return false;
                    const date = s.date.split('T')[0];
                    return date >= customStartDate && date <= customEndDate;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));
        }
        return [];
    }, [filteredSchedules, downloadPeriod, currentYear, currentMonth, customStartDate, customEndDate]);

    // 화면 표시용 정렬 데이터
    const sortedSchedules = useMemo(() => {
        let sortableItems = [...downloadTargetSchedules];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue, bValue;

                if (sortConfig.key === 'consultant') {
                    const consultantA = users.find(u => u.uid === a.consultantId)?.name || '미배정';
                    const consultantB = users.find(u => u.uid === b.consultantId)?.name || '미배정';
                    aValue = consultantA;
                    bValue = consultantB;
                } else if (sortConfig.key === 'type') {
                    const typeA = codes.find(c => c.code === a.typeCode)?.name || '미분류';
                    const typeB = codes.find(c => c.code === b.typeCode)?.name || '미분류';
                    aValue = typeA;
                    bValue = typeB;
                } else if (sortConfig.key === 'date') {
                    aValue = new Date(a.date);
                    bValue = new Date(b.date);
                } else if (sortConfig.key === 'time') {
                    // 시간 비교 (날짜는 무시하고 시간만 비교하거나, 날짜 포함 비교하거나. 보통 리스트에서는 날짜별 시간 정렬을 원할 수 있지만 여기선 단순 Time 컬럼 정렬 요청)
                    // 하지만 사용자는 "시간" 컬럼을 정렬하길 원함.
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    aValue = dateA.getHours() * 60 + dateA.getMinutes();
                    bValue = dateB.getHours() * 60 + dateB.getMinutes();
                } else {
                    aValue = a[sortConfig.key];
                    bValue = b[sortConfig.key];
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [downloadTargetSchedules, sortConfig, users, codes]);

    // 목록 뷰용 이번달 데이터 필터링 (기존 로직 유지 - 캘린더/목록 전환 시 초기 데이터)
    const currentMonthSchedules = useMemo(() => {
        const targetPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        return filteredSchedules
            .filter(s => s.date && s.date.startsWith(targetPrefix))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [filteredSchedules, currentYear, currentMonth]);

    const handleDateClick = (info) => {
        setSelectedDate(info.dateStr);
    };

    const changeYear = (delta) => {
        const newYear = currentYear + delta;
        setCurrentYear(newYear);
        if (calendarRef.current) {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.gotoDate(new Date(newYear, currentMonth - 1, 1));
        }
    };

    const handlePrev = () => {
        if (calendarRef.current) {
            calendarRef.current.getApi().prev();
        } else {
            // 목록 보기 모드에서는 수동으로 월 변경
            if (currentMonth === 1) {
                setCurrentYear(prev => prev - 1);
                setCurrentMonth(12);
            } else {
                setCurrentMonth(prev => prev - 1);
            }
        }
    };

    const handleNext = () => {
        if (calendarRef.current) {
            calendarRef.current.getApi().next();
        } else {
            // 목록 보기 모드에서는 수동으로 월 변경
            if (currentMonth === 12) {
                setCurrentYear(prev => prev + 1);
                setCurrentMonth(1);
            } else {
                setCurrentMonth(prev => prev + 1);
            }
        }
    };

    const handleDatesSet = (arg) => {
        const date = arg.view.currentStart;
        setCurrentYear(date.getFullYear());
        setCurrentMonth(date.getMonth() + 1);
        setCurrentDay(date.getDate());
        setCurrentView(arg.view.type);

        // 오늘 날짜가 현재 달력 보기 범위 내에 있는지 확인
        const today = new Date();
        const start = arg.view.currentStart;
        const end = arg.view.currentEnd;

        // 시간 정보를 제외하고 날짜만 비교하기 위해 00:00:00으로 설정
        const todayReset = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startReset = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endReset = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        if (todayReset >= startReset && todayReset < endReset) {
            // 오늘이 현재 기간 내에 있으면 오늘을 자동 선택
            const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            setSelectedDate(todayStr);
        } else {
            // 오늘이 기간 내에 없으면 선택을 해제 (내비게이션 시 1일이 자동 선택되는 현상 방지)
            setSelectedDate('');
        }
    };

    // 엑셀 다운로드 핸들러
    const handleExcelDownload = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('일정 목록');

        // 컬럼 정의 (순서 변경: 일자, 시간, 컨설턴트명, 구분, 방식)
        worksheet.columns = [
            { header: '일자', key: 'date', width: 15 },
            { header: '시간', key: 'time', width: 10 },
            { header: '컨설턴트명', key: 'consultant', width: 15 },
            { header: '구분', key: 'type', width: 30 },
            { header: '방식', key: 'method', width: 10 },
        ];

        // 데이터 추가
        downloadTargetSchedules.forEach(schedule => {
            const typeCode = codes.find(c => c.code === schedule.typeCode);
            const consultant = users.find(u => u.uid === schedule.consultantId);
            const dateObj = new Date(schedule.date);
            const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            const isRemote = !schedule.location?.includes('대면');

            worksheet.addRow({
                date: dateStr,
                time: timeStr,
                consultant: consultant ? consultant.name + 'T' : '-',
                type: typeCode ? typeCode.name : '미분류',
                method: isRemote ? '비대면' : '대면'
            });
        });

        // 스타일 적용
        // 1. 헤더 스타일 (행 1)
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD3D3D3' } // 연한 회색
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // 2. 데이터 행 스타일 (행 2부터)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // 헤더 제외

            row.eachCell((cell, colNumber) => {
                // 공통 스타일: 테두리, 중앙 정렬
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };

                // '구분' 컬럼 (열 4) 배경색 적용 (달력과 매칭)
                if (colNumber === 4) {
                    const typeName = row.getCell(4).value;
                    const typeCodeId = downloadTargetSchedules[rowNumber - 2]?.typeCode;
                    const chipStyle = getChipStyle(typeCodeId, typeName);
                    // hex (#ffffff) -> ARGB (FFFFFFFF) 변환
                    const argbColor = 'FF' + chipStyle.bg.replace('#', '').toUpperCase();

                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: argbColor }
                    };
                }
            });
        });

        // 파일명 생성
        let consultantLabel = '전체';
        if (!isAdmin && userProfile) {
            consultantLabel = userProfile.name;
        } else if (selectedConsultant !== 'all') {
            const u = users.find(user => user.uid === selectedConsultant);
            if (u) consultantLabel = u.name;
        }

        let fileName = '컨설팅일정.xlsx';
        if (downloadPeriod === 'monthly') fileName = `${currentYear}년_${currentMonth}월_${consultantLabel} 컨설턴트 일정.xlsx`;
        else if (downloadPeriod === 'yearly') fileName = `${currentYear}년_${consultantLabel} 컨설턴트 연간 일정.xlsx`;
        else if (downloadPeriod === 'custom') fileName = `${consultantLabel} 컨설턴트 일정_${customStartDate}~${customEndDate}.xlsx`;

        // 파일 생성 및 다운로드
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, fileName);
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
            <div className="ewh-calendar-page">
                {/* Header */}
                <header className="ewh-header">
                    <div className="ewh-branded-title" onClick={() => navigate('/')}>
                        📅 컨설팅 일정 관리
                    </div>
                </header>

                {/* Sub Tabs */}
                {/* View/Filter Bar Combined */}
                <div className="ewh-view-bar">
                    {/* Left: Period Tabs */}
                    <div className="ewh-sub-tabs-inline">
                        <div
                            className={`ewh-sub-tab-item ${periodTab === 'h1' ? 'active' : ''}`}
                            onClick={() => setPeriodTab('h1')}
                        >
                            상반기 (3월~8월)
                        </div>
                        <div
                            className={`ewh-sub-tab-item ${periodTab === 'h2' ? 'active' : ''}`}
                            onClick={() => setPeriodTab('h2')}
                        >
                            하반기/익년 (9월~2월)
                        </div>
                    </div>

                    {/* Center: Main Tabs */}
                    <div className="ewh-main-tabs">
                        {isAdmin && (
                            <button
                                className={`ewh-main-tab-btn ${mainTab === 'schedules' ? 'active' : ''}`}
                                onClick={() => {
                                    setMainTab('schedules');
                                    setSelectedConsultant('all');
                                    navigate('/calendar');
                                }}
                            >
                                전체 일정
                            </button>
                        )}
                        <button
                            className={`ewh-main-tab-btn ${mainTab === 'consultants' ? 'active' : ''}`}
                            onClick={() => {
                                if (isAdmin) {
                                    navigate('/select-consultant?mode=admin');
                                } else {
                                    setMainTab('consultants');
                                }
                            }}
                        >
                            컨설턴트
                        </button>
                    </div>

                    {/* Right: View Toggle */}
                    <div className="ewh-view-toggle">
                        <button
                            className={`ewh-view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                            onClick={() => setViewMode('calendar')}
                        >
                            📅 달력 보기
                        </button>
                        <button
                            className={`ewh-view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => {
                                setViewMode('list');
                                setCurrentView('dayGridMonth');
                            }}
                        >
                            📋 목록 보기
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="ewh-filter-bar">
                    {/* Year Nav */}
                    <div className="ewh-year-nav">
                        <button className="ewh-btn ewh-btn-outline small" onClick={() => changeYear(-1)}>◀</button>
                        <select
                            className="ewh-nav-select"
                            value={currentYear}
                            onChange={(e) => {
                                const year = parseInt(e.target.value);
                                setCurrentYear(year);
                                if (calendarRef.current) {
                                    calendarRef.current.getApi().gotoDate(new Date(year, currentMonth - 1, 1));
                                }
                            }}
                        >
                            {[2024, 2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y}>{y}년</option>
                            ))}
                        </select>
                        <button className="ewh-btn ewh-btn-outline small" onClick={() => changeYear(1)}>▶</button>
                    </div>

                    {/* Period Nav (Central) */}
                    <div className="ewh-month-nav">
                        <button onClick={handlePrev}>◀</button>

                        <div className="ewh-period-selectors">
                            {/* Month Selector (Always) */}
                            <select
                                className="ewh-nav-select"
                                value={currentMonth - 1}
                                onChange={(e) => {
                                    const month = parseInt(e.target.value) + 1;
                                    setCurrentMonth(month);
                                    if (calendarRef.current) {
                                        calendarRef.current.getApi().gotoDate(new Date(currentYear, month - 1, 1));
                                    }
                                }}
                            >
                                {['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>

                            {/* Week Selector (Only in Week View and Calendar Perspective) */}
                            {currentView === 'timeGridWeek' && viewMode === 'calendar' && (
                                <select
                                    className="ewh-nav-select"
                                    value={Math.ceil(currentDay / 7)}
                                    onChange={(e) => {
                                        const week = parseInt(e.target.value);
                                        const day = (week - 1) * 7 + 1;
                                        if (calendarRef.current) {
                                            calendarRef.current.getApi().gotoDate(new Date(currentYear, currentMonth - 1, day));
                                        }
                                    }}
                                >
                                    {[1, 2, 3, 4, 5, 6].map(w => (
                                        <option key={w} value={w}>{w}주</option>
                                    ))}
                                </select>
                            )}

                            {/* Day Selector (Only in Day View and Calendar Perspective) */}
                            {currentView === 'timeGridDay' && viewMode === 'calendar' && (
                                <select
                                    className="ewh-nav-select"
                                    value={currentDay}
                                    onChange={(e) => {
                                        const day = parseInt(e.target.value);
                                        if (calendarRef.current) {
                                            calendarRef.current.getApi().gotoDate(new Date(currentYear, currentMonth - 1, day));
                                        }
                                    }}
                                >
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                        <option key={d} value={d}>{d}일</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <button onClick={handleNext}>▶</button>
                    </div>

                    <div className="ewh-right-controls">
                        {/* View Type Nav (목록 보기에서는 숨김) */}
                        {viewMode === 'calendar' && (
                            <div className="ewh-view-type-nav">
                                <button
                                    className="ewh-today-btn"
                                    onClick={() => calendarRef.current?.getApi().today()}
                                >
                                    오늘
                                </button>
                                <div className="ewh-view-type-group">
                                    <button
                                        className={`ewh-view-type-btn ${currentView === 'dayGridMonth' ? 'active' : ''}`}
                                        onClick={() => calendarRef.current?.getApi().changeView('dayGridMonth')}
                                    >
                                        월
                                    </button>
                                    <button
                                        className={`ewh-view-type-btn ${currentView === 'timeGridWeek' ? 'active' : ''}`}
                                        onClick={() => calendarRef.current?.getApi().changeView('timeGridWeek')}
                                    >
                                        주
                                    </button>
                                    <button
                                        className={`ewh-view-type-btn ${currentView === 'timeGridDay' ? 'active' : ''}`}
                                        onClick={() => calendarRef.current?.getApi().changeView('timeGridDay')}
                                    >
                                        일
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Filters */}
                        <div className="ewh-filters">
                            <div className="ewh-filter-item">
                                <label>컨설턴트:</label>
                                <select
                                    value={selectedConsultant}
                                    onChange={(e) => setSelectedConsultant(e.target.value)}
                                >
                                    <option value="all">전체 보기</option>
                                    {users.filter(u => u.role === 'consultant').map(user => (
                                        <option key={user.uid} value={user.uid}>{user.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ewh-filter-item">
                                <label>유형:</label>
                                <select
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                >
                                    <option value="all">전체 유형</option>
                                    {codes.map(code => (
                                        <option key={code.code} value={code.code}>{code.name}</option>
                                    ))}
                                </select>
                            </div>
                            {viewMode === 'list' && (
                                <div className="ewh-filter-item">
                                    <label>주차:</label>
                                    <select
                                        value={selectedWeek}
                                        onChange={(e) => setSelectedWeek(e.target.value)}
                                    >
                                        <option value="all">전체 주차</option>
                                        {[1, 2, 3, 4, 5, 6].map(w => (
                                            <option key={w} value={w}>{w}주차</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Calendar Layout */}
                <div className="ewh-calendar-layout">
                    <div className="ewh-calendar-main">
                        {viewMode === 'calendar' ? (
                            <FullCalendar
                                ref={calendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                headerToolbar={false}
                                slotMinTime="09:00:00"
                                slotMaxTime="22:00:00"
                                allDaySlot={false}
                                locale="ko"
                                events={calendarEvents}
                                eventOrder="extendedProps.sortIndex"
                                eventContent={(eventInfo) => {
                                    const { chipStyle, needsSeparator } = eventInfo.event.extendedProps;
                                    return (
                                        <div className="w-full">
                                            {needsSeparator && (
                                                <div style={{
                                                    borderTop: '1px dashed #9ca3af',
                                                    margin: '4px 0 2px 0',
                                                    width: '100%'
                                                }} />
                                            )}
                                            <div
                                                className="ewh-event-chip"
                                                style={{
                                                    backgroundColor: chipStyle?.bg || '#e0f2f1',
                                                    borderLeft: `3px solid ${chipStyle?.border || '#00695c'}`,
                                                }}
                                            >
                                                {eventInfo.event.title}
                                            </div>
                                        </div>
                                    );
                                }}
                                dateClick={handleDateClick}
                                eventClick={(info) => {
                                    // 이벤트 클릭 시 해당 날짜 선택
                                    const eventDate = info.event.start;
                                    const y = eventDate.getFullYear();
                                    const m = String(eventDate.getMonth() + 1).padStart(2, '0');
                                    const d = String(eventDate.getDate()).padStart(2, '0');
                                    setSelectedDate(`${y}-${m}-${d}`);
                                }}
                                datesSet={handleDatesSet}
                                height="100%"
                                dayMaxEvents={false}
                                fixedWeekCount={false}
                                dayCellClassNames={(arg) => {
                                    const y = arg.date.getFullYear();
                                    const m = String(arg.date.getMonth() + 1).padStart(2, '0');
                                    const d = String(arg.date.getDate()).padStart(2, '0');
                                    const dateStr = `${y}-${m}-${d}`;
                                    const classes = [];
                                    if (dateStr === selectedDate.split("T")[0]) classes.push('ewh-selected');
                                    return classes;
                                }}
                                dayHeaderContent={(arg) => {
                                    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                                    return dayNames[arg.date.getDay()];
                                }}
                                dayCellContent={(arg) => {
                                    return arg.dayNumberText.replace('일', '');
                                }}
                            />
                        ) : (
                            <div className="ewh-list-view w-full px-6 pb-10">
                                {/* Control Header - Exact User Design */}
                                <div className="flex justify-between items-center mb-[15px] bg-[#f8f9fa] p-[15px] rounded-[8px] border border-[#eee]" style={{ padding: "15px", marginBottom: "15px" }}>
                                    <div className="flex items-center gap-[15px] flex-wrap">
                                        <div className="flex items-center gap-[8px]">
                                            <label htmlFor="downloadPeriod" className="font-medium text-[0.95rem]">다운로드 기간:</label>
                                            <select
                                                style={{ padding: "5px" }}
                                                id="downloadPeriod"
                                                className="px-4 py-2 text-sm font-bold text-[#00462A] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#00462A] cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
                                                value={downloadPeriod}
                                                onChange={(e) => setDownloadPeriod(e.target.value)}
                                            >
                                                <option value="monthly">월별 (현재 화면)</option>
                                                <option value="yearly">년별 (전체 연도)</option>
                                                <option value="custom">사용자 지정 기간</option>
                                            </select>
                                        </div>

                                        {downloadPeriod === 'custom' && (
                                            <div className="flex items-center gap-2 ml-2">
                                                <input
                                                    type="date"
                                                    style={{ padding: "5px 12px" }}
                                                    className="h-[38px] text-sm font-bold text-[#00462A] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#00462A] shadow-sm uppercase"
                                                    value={customStartDate}
                                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                                />
                                                <span className="text-gray-400 font-bold">~</span>
                                                <input
                                                    type="date"
                                                    style={{ padding: "5px 12px" }}
                                                    className="h-[38px] text-sm font-bold text-[#00462A] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#00462A] shadow-sm uppercase"
                                                    value={customEndDate}
                                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-[15px]">
                                        <div className="font-semibold text-[#555]">
                                            {downloadPeriod === 'monthly' && `${currentYear}년 ${currentMonth}월`}
                                            {downloadPeriod === 'yearly' && `${currentYear}년 전체`}
                                            {downloadPeriod === 'custom' && '선택 기간'}
                                            - 총 {downloadTargetSchedules.length}건
                                        </div>
                                        <button
                                            onClick={handleExcelDownload}
                                            className="px-[16px] py-[8px] text-[0.9rem] bg-[#006633] text-white border-none rounded-[4px] cursor-pointer flex items-center gap-[5px] hover:bg-[#00552b] transition-colors"
                                            style={{ padding: "6px", fontWeight: "bold" }}
                                        >
                                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                            </svg>
                                            Excel 다운로드
                                        </button>
                                    </div>
                                </div>

                                {/* Summary Container Box */}
                                <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-wrap gap-6 items-center" style={{ padding: "16px", marginBottom: "16px" }}>
                                    {/* Total Count Card */}
                                    <div className="w-[180px] h-[110px] bg-[#F9FAFB] rounded-xl flex flex-col items-center justify-center border-t-4 border-[#00462A] shadow-sm relative overflow-hidden group">
                                        <div className="text-gray-500 text-sm font-bold mb-1">전체 세션</div>
                                        <div className="text-[#00462A] text-3xl font-extrabold">{downloadTargetSchedules.length}</div>
                                    </div>

                                    {/* Divider */}
                                    {downloadTargetSchedules.length > 0 && <div className="w-[1px] h-[60px] bg-gray-100"></div>}

                                    {/* Breakdown Cards */}
                                    {Object.entries(downloadTargetSchedules.reduce((acc, curr) => {
                                        const name = codes.find(c => c.code === curr.typeCode)?.name || '미분류';
                                        acc[name] = (acc[name] || 0) + 1;
                                        return acc;
                                    }, {})).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, count]) => (
                                        <div key={name} className="w-[180px] h-[110px] bg-[#F9FAFB] rounded-xl flex flex-col items-center justify-center border-t-4 border-transparent shadow-sm hover:shadow-md transition-all">
                                            <div className="text-gray-500 text-sm font-bold mb-1">{name}</div>
                                            <div className="text-[#00462A] text-3xl font-extrabold">{count}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* List Table */}
                                <div className="ewh-list-table-container rounded-t-lg overflow-hidden border-t-0">
                                    <table className="ewh-list-table w-full">
                                        <thead>
                                            <tr className="bg-[#00462A] text-white h-[50px]">
                                                <th className="py-2 text-center font-bold text-sm w-[15%] cursor-pointer hover:bg-[#00331F] transition-colors" onClick={() => requestSort('date')}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        일자 {sortConfig.key === 'date' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕'}
                                                    </div>
                                                </th>
                                                <th className="py-2 text-center font-bold text-sm w-[10%] cursor-pointer hover:bg-[#00331F] transition-colors" onClick={() => requestSort('time')}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        시간 {sortConfig.key === 'time' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕'}
                                                    </div>
                                                </th>
                                                <th className="py-2 text-center font-bold text-sm w-[15%] cursor-pointer hover:bg-[#00331F] transition-colors" onClick={() => requestSort('consultant')}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        컨설턴트 {sortConfig.key === 'consultant' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕'}
                                                    </div>
                                                </th>
                                                <th className="py-2 text-left px-8 font-bold text-sm w-[25%] cursor-pointer hover:bg-[#00331F] transition-colors" onClick={() => requestSort('type')}>
                                                    <div className="flex items-center gap-1">
                                                        구분 {sortConfig.key === 'type' ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕'}
                                                    </div>
                                                </th>
                                                <th className="py-2 text-center font-bold text-sm w-[15%]">방식</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedSchedules.length > 0 ? (
                                                sortedSchedules.map(schedule => {
                                                    const typeCode = codes.find(c => c.code === schedule.typeCode);
                                                    const consultant = users.find(u => u.uid === schedule.consultantId);
                                                    const dateObj = new Date(schedule.date);
                                                    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                                                    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                                                    const isRemote = !schedule.location?.includes('대면');
                                                    const chipStyle = getChipStyle(schedule.typeCode, typeCode?.name);

                                                    return (
                                                        <tr key={schedule.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors h-[60px]">
                                                            <td className="text-center font-bold text-gray-800 text-sm">{dateStr}</td>
                                                            <td className="text-center text-gray-600 text-sm font-medium">{timeStr}</td>
                                                            <td className="text-center text-gray-700 text-sm font-medium">{consultant ? consultant.name + 'T' : '-'}</td>
                                                            <td className="px-8 text-left">
                                                                <span
                                                                    className="font-bold text-gray-800 text-[13px] px-3 py-1 rounded-md border"
                                                                    style={{
                                                                        backgroundColor: chipStyle.bg,
                                                                        borderColor: chipStyle.border,
                                                                        padding: '5px 10px',
                                                                    }}
                                                                >
                                                                    {typeCode ? typeCode.name : '미분류'}
                                                                </span>
                                                            </td>
                                                            <td className="text-center">
                                                                <span style={{ padding: "5px 12px", borderRadius: "15px" }} className={`inline-flex px-3 py-1 rounded-md text-xs font-bold ${isRemote ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                                                    {isRemote ? '비대면' : '대면'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan="5" className="py-24 text-center text-gray-400">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <Calendar size={40} className="text-gray-200 mb-2" />
                                                            <span>조건에 맞는 일정이 없습니다.</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Summary Sidebar */}
                    {viewMode === 'calendar' && (
                        <div className="ewh-summary-sidebar">
                            <div className="ewh-sidebar-title">{getDisplayDate} 요약</div>

                            {selectedDateStats.total > 0 ? (
                                <>
                                    <div className="ewh-stat-total">총 일정: {selectedDateStats.total}건</div>
                                    <hr className="ewh-stat-divider" />

                                    {selectedDateStats.byType.length > 0 && (
                                        <>
                                            <div className="ewh-stat-section-title">컨설팅 유형별</div>
                                            {selectedDateStats.byType.map(([name, count]) => (
                                                <div key={name} className="ewh-stat-item">
                                                    <span className="ewh-stat-label">{name}</span>
                                                    <span className="ewh-stat-val">{count}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {isAdmin && selectedDateStats.byConsultant.length > 0 && (
                                        <>
                                            <hr className="ewh-stat-divider" />
                                            <div className="ewh-stat-section-title">컨설턴트별</div>
                                            {selectedDateStats.byConsultant.map(([name, count]) => (
                                                <div key={name} className="ewh-stat-item">
                                                    <span className="ewh-stat-label">{name}T</span>
                                                    <span className="ewh-stat-val">{count}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </>
                            ) : (
                                <p className="ewh-no-data">일정이 없습니다.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title="일정 상세"
                >
                    {selectedEvent && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#e8f5e9' }}>
                                    <Tag size={24} style={{ color: '#00462A' }} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-900 text-lg">{selectedEvent.typeName || '미분류 일정'}</h4>
                                    <p className="text-sm text-gray-500">컨설팅 상세 정보</p>
                                </div>
                            </div>
                            <div className="space-y-3 px-1">
                                <div className="flex items-center gap-3 text-sm">
                                    <Clock size={18} className="text-gray-400" />
                                    <span className="text-gray-700 font-medium">
                                        {new Date(selectedEvent.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <MapPin size={18} className="text-gray-400" />
                                    <span className="text-gray-700">{selectedEvent.location || '장소 미정'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <Users size={18} className="text-gray-400" />
                                    <span className="text-gray-700">담당: <span className="font-medium">{selectedEvent.consultantName || '미배정'}</span></span>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-gray-100 flex justify-end">
                                <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary px-6">닫기</button>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>

            <style>{`
                /* === EWH CALENDAR STYLES === */
                .ewh-calendar-page {
                    display: flex;
                    flex-direction: column;
                    height: calc(100vh - 65px);
                    overflow: hidden;
                    background: #f7f9f8;
                }

                /* Header */
                /* Header */
                .ewh-header {
                    padding: 12px 24px;
                    border-bottom: 1px solid #ddd;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #fff;
                }

                .ewh-branded-title {
                    font-size: 1.2rem;
                    font-weight: 800;
                    color: #00462A;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }

                .ewh-main-tabs {
                    display: flex;
                    gap: 4px;
                    background: #f0f0f0;
                    padding: 3px;
                    border-radius: 8px;
                    /* 중앙 정렬 */
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 10;
                }

                .ewh-main-tab-btn {
                    padding: 6px 14px;
                    border: none;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    color: #666;
                    background: transparent;
                    transition: all 0.2s;
                }

                .ewh-main-tab-btn.active {
                    background: #fff;
                    color: #00462A;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .ewh-controls {
                    display: flex;
                    gap: 10px;
                }

                .ewh-btn {
                    background: #00462A;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                }

                .ewh-btn:hover {
                    opacity: 0.9;
                }

                .ewh-btn-outline {
                    background: transparent;
                    border: 1px solid #00462A;
                    color: #00462A;
                }

                .ewh-btn-outline:hover {
                    background: #e8f5e9;
                }

                .ewh-btn-outline.small {
                    padding: 4px 8px;
                }

                /* Sub Tab Nav */
                .ewh-sub-tab-nav {
                    display: flex;
                    background: #f4f4f4;
                    padding: 0 20px;
                    border-bottom: 1px solid #ddd;
                }

                .ewh-sub-tab-item {
                    padding: 10px 24px;
                    cursor: pointer;
                    font-weight: 600;
                    color: #888;
                    border-bottom: 3px solid transparent;
                    font-size: 0.95rem;
                    transition: all 0.3s;
                }

                .ewh-sub-tab-item.active {
                    color: #00462A;
                    border-bottom-color: #00462A;
                    background: linear-gradient(to top, rgba(0,102,70,0.05), transparent);
                }

                /* View Bar */
                .ewh-view-bar {
                    padding: 6px 24px;
                    background: #fdfdfd;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between; /* 양 끝 정렬 */
                    gap: 8px;
                    position: relative; /* 중앙 정렬 기준점 */
                    height: 46px; /* 높이 확보 */
                    align-items: center;
                }

                .ewh-sub-tabs-inline {
                    display: flex;
                    gap: 16px;
                }

                .ewh-sub-tab-item {
                    font-size: 0.9rem;
                    color: #666;
                    cursor: pointer;
                    font-weight: 500;
                    padding: 4px 8px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }

                .ewh-sub-tab-item.active {
                    color: #00462A;
                    font-weight: 700;
                    background: rgba(0, 70, 42, 0.08);
                }

                .ewh-view-toggle {
                    display: flex;
                    gap: 8px;
                }

                .ewh-view-toggle-btn {
                    background: transparent;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #666;
                    padding: 4px 12px;
                    font-weight: 500;
                    font-size: 0.85rem;
                }

                .ewh-view-toggle-btn:hover {
                    background: #e8f5e9;
                    border-color: #00462A;
                    color: #00462A;
                }

                .ewh-view-toggle-btn.active {
                    background: #00462A;
                    border-color: #00462A;
                    color: #fff;
                }

                /* Filter Bar */
                .ewh-filter-bar {
                    padding: 10px 24px;
                    background: #fff;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #ddd;
                    position: relative; /* 중앙 정렬 기준점 */
                }

                .ewh-year-nav {
                    display: flex;
                    align-items: center;
                    margin-right: 20px;
                }

                .ewh-month-nav {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    /* 중앙 정렬 */
                    position: absolute;
                    left: 50%;
                    transform: translateX(-50%);
                }

                .ewh-period-selectors {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .ewh-month-nav button {
                    background: none;
                    border: none;
                    font-size: 1.1rem;
                    cursor: pointer;
                    color: #00462A;
                    padding: 0 6px;
                }

                .ewh-month-nav button:hover {
                    opacity: 0.6;
                }

                /* Right Side Controls Group */
                .ewh-right-controls {
                    display: flex;
                    align-items: center;
                    gap: 32px;
                }

                /* View Type Nav Styles */
                .ewh-view-type-nav {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .ewh-today-btn {
                    padding: 4px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    background: #fff;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #555;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .ewh-today-btn:hover {
                    border-color: #00462A;
                    color: #00462A;
                    background: #f0f7f4;
                }

                .ewh-view-type-group {
                    display: flex;
                    background: #f1f3f5;
                    padding: 2px;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                }

                .ewh-view-type-btn {
                    padding: 4px 12px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #666;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .ewh-view-type-btn:hover {
                    color: #00462A;
                }

                .ewh-view-type-btn.active {
                    background: #fff;
                    color: #00462A;
                    font-weight: 700;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .ewh-nav-select {
                    font-weight: 700;
                    font-size: 1rem;
                    margin: 0 4px;
                    padding: 0;
                    border: none;
                    background: none;
                    cursor: pointer;
                    color: #00462A;
                    transition: all 0.2s;
                    outline: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    appearance: none;
                }

                .ewh-nav-select:hover {
                    opacity: 0.8;
                }

                .ewh-nav-select.large {
                    width: 100px;
                    text-align: center;
                }

                .ewh-filters {
                    display: flex;
                    gap: 24px;
                    align-items: center;
                }

                .ewh-filter-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .ewh-filters label {
                    font-weight: 700;
                    font-size: 0.85rem;
                    color: #222;
                    margin-right: 0;
                    white-space: nowrap;
                }

                .ewh-filters select {
                    padding: 4px 8px;
                    border-radius: 6px;
                    border: 1px solid #ddd;
                    background-color: #eef1f4;
                    font-size: 0.8rem;
                    color: #333;
                    cursor: pointer;
                    font-weight: 500;
                    min-width: 100px;
                }
                
                .ewh-filters select:hover {
                    background-color: #e8ebee;
                }

                /* Calendar Layout */
                .ewh-calendar-layout {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }

                .ewh-calendar-main {
                    flex: 1;
                    padding: 16px 32px;
                    overflow-y: auto;
                    background: #fff;
                }

                /* Summary Sidebar */
                .ewh-summary-sidebar {
                    width: 240px;
                    background: #fff;
                    border-left: 1px solid #ddd;
                    padding: 16px;
                    overflow-y: auto;
                    font-size: 0.9rem;
                }

                .ewh-sidebar-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #00462A;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #e8f5e9;
                    margin-bottom: 10px;
                }

                .ewh-stat-total {
                    margin-top: 10px;
                    font-weight: 700;
                    color: #555;
                }

                .ewh-stat-divider {
                    margin: 15px 0;
                    border: 0;
                    border-top: 1px solid #eee;
                }

                .ewh-stat-section-title {
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #00462A;
                }

                .ewh-stat-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px dashed #eee;
                    font-size: 0.95rem;
                }

                .ewh-stat-item:last-child {
                    border-bottom: none;
                }

                .ewh-stat-label {
                    color: #666;
                }

                .ewh-stat-val {
                    font-weight: 700;
                    color: #333;
                }

                .ewh-no-data {
                    color: #888;
                    margin-top: 10px;
                }

                /* ========== FULLCALENDAR OVERRIDES ========== */
                .ewh-calendar-main .fc {
                    height: 100% !important;
                    font-family: inherit !important;
                }

                .ewh-calendar-main .fc-scrollgrid {
                    border: none !important;
                }

                /* 사용자 요청: 테이블 자체 보더 숨김 (이중선 방지) */
                .ewh-calendar-main .fc .fc-scrollgrid table {
                    border-left-style: hidden;
                    border-right-style: hidden;
                    border-top-style: hidden;
                    border-bottom: hidden !important;
                }

                /* List View Styles */
                .ewh-list-view {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .ewh-list-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }

                .ewh-list-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #333;
                }

                .ewh-excel-btn {
                    background: #006633;
                    color: white;
                    border: none;
                    padding: 5px 12px;
                    border-radius: 6px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    font-size: 0.8rem;
                    transition: all 0.2s;
                }
                
                .ewh-excel-btn:hover {
                    background: #004d26;
                }

                .ewh-list-table-container {
                    flex: 1;
                    overflow-y: auto;
                    border: 1px solid #eee;
                    border-radius: 8px;
                }

                .ewh-list-table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                }

                .ewh-list-table th {
                    background: #00462A;
                    color: white;
                    padding: 12px 16px;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                    font-size: 0.95rem;
                }

                .ewh-list-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #eee;
                    color: #444;
                    font-size: 0.95rem;
                }

                .ewh-list-table tr:hover {
                    background: #f8fcf9;
                }

                .ewh-list-table .fw-bold {
                    font-weight: 700;
                    color: #222;
                }
                
                .ewh-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .ewh-badge.remote {
                    background: #e3f2fd;
                    color: #1976d2;
                }
                
                .ewh-no-list-data {
                    text-align: center;
                    padding: 40px;
                    color: #888;
                }
                    border: hidden;
                }

                /* 컨테이너에 둥근 모서리와 외곽선 적용 */
                .ewh-calendar-main .fc-view-harness {
                    border-bottom: hidden !important;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    overflow: hidden;
                }

                /* 내부 셀 보더: 오른쪽과 아래쪽만 1px */
                .ewh-calendar-main .fc-theme-standard td,
                .ewh-calendar-main .fc-theme-standard th {
                    border: none !important;
                    border-right: 1px solid #ddd !important;
                    border-bottom: 1px solid #ddd !important;
                }

                /* 마지막 열의 오른쪽 보더 제거 (외곽선과 겹침 방지) */
                .ewh-calendar-main .fc-theme-standard td:last-child,
                .ewh-calendar-main .fc-theme-standard th:last-child {
                    border-right: none !important;
                }

                /* 마지막 행의 아래쪽 보더 제거 (강력한 선택자 사용) */
                .ewh-calendar-main .fc-daygrid-body table tbody > tr:last-child td,
                .ewh-calendar-main .fc-daygrid-body > table > tbody > tr:last-child > td {
                    border-bottom: none !important;
                }

                /* 헤더 셀 스타일 */
                .ewh-calendar-main .fc-col-header-cell {
                    background: #fff;
                    padding: 8px;
                    text-align: center;
                    font-weight: 700;
                    color: #555;
                }

                /* 일요일 색상 (헤더 & 날짜) */
                .ewh-calendar-main .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion,
                .ewh-calendar-main .fc-daygrid-day.fc-day-sun .fc-daygrid-day-number {
                    color: #E53935 !important;
                }

                /* 토요일 색상 (헤더 & 날짜) */
                .ewh-calendar-main .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion,
                .ewh-calendar-main .fc-daygrid-day.fc-day-sat .fc-daygrid-day-number {
                    color: #1E88E5 !important;
                }

                /* 날짜 셀 */
                .ewh-calendar-main .fc-daygrid-day {
                    min-height: 100px !important;
                    cursor: pointer;
                }

                /* 지난달/다음달 날짜 배경색 */
                .ewh-calendar-main .fc-day-other {
                    background-color: #eee !important;
                }

                .ewh-calendar-main .fc-daygrid-day-frame {
                    min-height: 100px !important;
                    padding: 4px;
                    display: flex;
                    flex-direction: column;
                }
                
                /* 이번달 날짜만 호버 효과 (지난달/다음달 날짜 제외) */
                .ewh-calendar-main .fc-daygrid-day:not(.fc-day-other):hover {
                    background-color: #f0f7f4;
                }

                .ewh-calendar-main .fc-daygrid-day.ewh-selected {
                    background-color: #e0f2f1 !important;
                    box-shadow: inset 0 0 0 2px #00462A;
                }

                /* 날짜 숫자 기본값 */
                .ewh-calendar-main .fc-daygrid-day-number {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #555;
                    padding: 4px !important;
                    text-align: right;
                }

                .ewh-calendar-main .fc-daygrid-day-top {
                    justify-content: flex-end;
                }

                /* 다른 월의 날짜 */
                .ewh-calendar-main .fc-daygrid-day.fc-day-other {
                    background: #fcfcfc;
                    opacity: 0.5;
                }

                /* 오늘 */
                .ewh-calendar-main .fc-daygrid-day.fc-day-today {
                    background: #fff !important;
                }

                /* 불릿 점 완전 제거 */
                .ewh-calendar-main .fc-daygrid-event-dot,
                .ewh-calendar-main .fc-event-dot,
                .ewh-calendar-main .fc-list-event-dot {
                    display: none !important;
                }

                /* 커스텀 이벤트 칩 스타일 */
                /* 커스텀 이벤트 칩 스타일 */
                .ewh-event-chip {
                    display: block;
                    width: 100%;
                    box-sizing: border-box;
                    font-size: 0.75rem;
                    padding: 2px 4px;
                    border-radius: 3px;
                    color: #222;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.3;
                    cursor: pointer;
                }

                .ewh-calendar-main .fc-event {
                    background: transparent !important;
                    border: none !important;
                    padding: 0 !important;
                    margin: 0 0 2px 0 !important;
                    width: 100% !important;
                }

                .ewh-calendar-main .fc-event-main {
                    padding: 0 !important;
                    width: 100%;
                }

                .ewh-calendar-main .fc-daygrid-event-harness {
                    margin: 0 0 2px 0 !important;
                    width: 100% !important;
                }

                .ewh-calendar-main .fc-daygrid-day-events {
                    padding: 0 4px !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 2px !important;
                }

                /* Responsive */
                @media (max-width: 1024px) {
                    .ewh-calendar-layout {
                        flex-direction: column;
                    }

                    .ewh-summary-sidebar {
                        width: 100%;
                        border-left: none;
                        border-top: 1px solid #ddd;
                        min-height: 200px;
                    }
                }

                @media (max-width: 768px) {
                    .ewh-header {
                        flex-direction: column;
                        gap: 15px;
                        padding: 16px;
                    }

                    .ewh-main-tabs {
                        width: 100%;
                        justify-content: center;
                        position: static;
                        transform: none;
                    }

                    .ewh-controls {
                        width: 100%;
                        justify-content: center;
                    }

                    .ewh-filter-bar {
                        flex-direction: column;
                        gap: 15px;
                        padding: 16px;
                    }

                    .ewh-month-nav {
                        position: static;
                        transform: none;
                    }

                    .ewh-filters {
                        width: 100%;
                        flex-wrap: wrap;
                    }

                    .ewh-sub-tab-nav {
                        padding: 0;
                        overflow-x: auto;
                        white-space: nowrap;
                    }

                    .ewh-sub-tab-item {
                        padding: 12px 20px;
                        font-size: 0.95rem;
                    }

                    .ewh-calendar-main {
                        padding: 10px;
                    }

                    .ewh-calendar-main .fc-daygrid-day {
                        min-height: 100px !important;
                    }

                    .ewh-calendar-main .fc-daygrid-day-frame {
                        min-height: 100px !important;
                        padding: 4px;
                    }

                    .ewh-calendar-main .fc-event {
                        font-size: 0.7rem !important;
                        padding: 2px 4px !important;
                    }
                }
            `}</style>
        </>
    );
}
