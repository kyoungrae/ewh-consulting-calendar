import { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import * as XLSX from 'xlsx';
import {
    Plus,
    Edit2,
    Trash2,
    Calendar,
    Clock,
    MapPin,
    Upload,
    FileText,
    Loader2,
    Filter,
    ChevronLeft,
    ChevronRight,
    ArrowUp,
} from 'lucide-react';

// 날짜 포맷팅 유틸리티
// 날짜 포맷팅 유틸리티
const formatters = {
    fullDate: (iso) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
    time: (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    timestamp: (iso) => new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    scheduleDate: (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
    }
};

// 변경 이력 아이템 컴포넌트 (개선된 UI)
function LogItem({ log, index }) {
    const [isExpanded, setIsExpanded] = useState(index === 0);
    const { summary, details } = log;
    const totalChanges = summary.added + summary.updated + summary.deleted;

    // 변경 유형별 아이콘 및 컬러 매핑
    const getChangeTypeInfo = (type) => {
        switch (type) {
            case 'added': return { label: '추가됨', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: '🟢' };
            case 'updated': return { label: '수정됨', color: 'text-amber-600 bg-amber-50 border-amber-100', icon: '🟠' };
            case 'deleted': return { label: '삭제됨', color: 'text-rose-600 bg-rose-50 border-rose-100', icon: '🔴' };
            default: return { label: '', color: 'text-gray-500', icon: '' };
        }
    };

    return (
        <div className={`group border transition-all duration-200 rounded-xl bg-white overflow-hidden mb-8 ${isExpanded ? 'border-[#00462A] shadow-md ring-1 ring-[#00462A]/10' : 'border-gray-200 shadow-sm hover:border-gray-300'}`} style={{ padding: "10px" }}>
            {/* Header */}
            <div
                className={`flex items-center justify-between p-5 cursor-pointer select-none ${isExpanded ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isExpanded ? 'bg-[#00462A] text-white shadow-lg shadow-[#00462A]/20' : 'bg-gray-100 text-gray-500 group-hover:bg-[#00462A]/10 group-hover:text-[#00462A]'}`}>
                        <FileText size={20} className={isExpanded ? 'scale-110' : ''} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-gray-900 text-lg">엑셀 일정 업로드</h3>
                            {index === 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold tracking-tight">NEW</span>}
                        </div>
                        <p className="text-sm text-gray-500 font-medium">{formatters.timestamp(log.timestamp)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex gap-2">
                        {summary.added > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                +{summary.added} 추가
                            </div>
                        )}
                        {summary.updated > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                {summary.updated} 수정
                            </div>
                        )}
                        {summary.deleted > 0 && (
                            <div className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                -{summary.deleted} 삭제
                            </div>
                        )}
                        {totalChanges === 0 && (
                            <span className="text-sm text-gray-400 font-medium bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">변경사항 없음</span>
                        )}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-gray-200 rotate-180 text-gray-800' : 'bg-transparent text-gray-400 group-hover:bg-gray-100'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>

            {/* Details Content */}
            {isExpanded && totalChanges > 0 && (
                <div className="border-t border-gray-100 bg-white animate-fade-in divide-y divide-gray-100">

                    {/* 1. Added Section */}
                    {details?.added?.length > 0 && (
                        <div className="p-6">
                            <h4 className="flex items-center gap-2.5 text-sm font-bold text-gray-800 mb-4 px-1" style={{ padding: "22px" }}>
                                <div className="p-1 rounded bg-emerald-100 text-emerald-600"><Plus size={14} strokeWidth={3} /></div>
                                새로 추가된 일정 <span className="text-emerald-600 text-xs bg-emerald-50 px-2 py-0.5 rounded-full ml-1 font-bold">{details.added.length}건</span>
                            </h4>
                            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50/50" style={{ padding: "22px" }}>
                                <table className="w-full text-sm text-gray-600">
                                    <thead className="bg-gray-100/80 text-xs text-gray-500 uppercase font-semibold">
                                        <tr>
                                            <th className="px-6 py-4 text-left min-w-[160px] whitespace-nowrap" style={{ padding: "10px" }}>일자</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>시간</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>구분</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>담당</th>
                                            <th className="px-6 py-4 text-left min-w-[150px]" style={{ padding: "10px" }}>장소/메모</th>
                                            <th className="px-6 py-4 text-left min-w-[200px]" style={{ padding: "10px" }}>사유</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {details.added.map((s, i) => {
                                            const isMissingConsultant = s.consultantId?.startsWith('unknown_');
                                            const isMissingType = s.typeName === s.typeCode;
                                            const isMissingInfo = isMissingConsultant || isMissingType;

                                            let message = '';
                                            let messageColor = '';

                                            if (isMissingInfo) {
                                                messageColor = 'text-orange-600';
                                                if (isMissingConsultant && isMissingType) message = '담당자 및 구분 등록 정보 확인 필요';
                                                else if (isMissingConsultant) message = '담당자 등록 정보 확인 필요(회원 관리 메뉴에 존재 하지 않음)';
                                                else if (isMissingType) message = '구분 등록 정보 확인 필요(코드 관리 메뉴에 해당 구분이 존재 하지 않음)';
                                            } else {
                                                message = '정상 등록';
                                                messageColor = 'text-emerald-600';
                                            }

                                            return (
                                                <tr key={i} className={`transition-colors ${isMissingInfo ? 'bg-orange-50 hover:bg-orange-100' : 'bg-emerald-50 hover:bg-emerald-100'}`}>
                                                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap" style={{ padding: "10px" }}>{formatters.scheduleDate(s.date)}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>{formatters.time(s.date)}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-medium border ${isMissingType ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                            {s.typeName || s.typeCode}
                                                        </span>
                                                    </td>
                                                    <td className={`px-6 py-4 font-medium whitespace-nowrap ${isMissingConsultant ? 'text-orange-600 font-bold' : 'text-gray-800'}`}>
                                                        {s.consultantName}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500 truncate max-w-xs">{s.location || s.memo || '-'}</td>
                                                    <td className={`px-6 py-4 text-xs font-medium ${messageColor}`}>
                                                        {message}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 2. Updated Section */}
                    {details?.updated?.length > 0 && (
                        <div className="p-6 bg-amber-50/10">
                            <h4 className="flex items-center gap-2.5 text-sm font-bold text-gray-800 mb-4 px-1">
                                <div className="p-1 rounded bg-amber-100 text-amber-600"><Edit2 size={14} strokeWidth={3} /></div>
                                변경된 일정 <span className="text-amber-600 text-xs bg-amber-50 px-2 py-0.5 rounded-full ml-1 font-bold">{details.updated.length}건</span>
                            </h4>
                            <div className="grid gap-3">
                                {details.updated.map((u, i) => {
                                    const { before, after } = u;
                                    const changedFields = [];
                                    const normalize = (s) => (s || '').toString().trim();

                                    if (normalize(before.location) !== normalize(after.location))
                                        changedFields.push({ label: '장소', before: before.location, after: after.location });
                                    if (normalize(before.memo) !== normalize(after.memo))
                                        changedFields.push({ label: '메모', before: before.memo, after: after.memo });
                                    if (normalize(before.consultantName) !== normalize(after.consultantName))
                                        changedFields.push({ label: '담당자명', before: before.consultantName, after: after.consultantName });
                                    if (normalize(before.typeName) !== normalize(after.typeName))
                                        changedFields.push({ label: '구분명', before: before.typeName, after: after.typeName });
                                    if (normalize(before.endDate) !== normalize(after.endDate))
                                        changedFields.push({ label: '종료시간', before: before.endDate, after: after.endDate });

                                    return (
                                        <div key={i} className="bg-white rounded-xl border border-amber-200 p-6 shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 pb-4 border-b border-gray-100">
                                                <div className="flex items-center gap-2 font-bold text-gray-900">
                                                    <Calendar size={14} className="text-amber-500" />
                                                    {formatters.fullDate(after.date)} {formatters.time(after.date)}
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                                        {after.consultantName.charAt(0)}
                                                    </span>
                                                    {after.consultantName}
                                                </div>
                                                <div className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-100 ml-auto">
                                                    {after.typeName}
                                                </div>
                                            </div>
                                            <div className="space-y-3 pl-2">
                                                {changedFields.map((field, idx) => (
                                                    <div key={idx} className="flex items-start gap-5 text-sm">
                                                        <span className="text-gray-400 text-xs font-bold uppercase tracking-wide w-10 pt-1.5">{field.label}</span>
                                                        <div className="flex-1 flex items-center gap-4 flex-wrap">
                                                            <span className="text-rose-600/70 bg-rose-50 px-2.5 py-1.5 rounded line-through decoration-rose-300/50 text-xs">
                                                                {field.before || '(비어있음)'}
                                                            </span>
                                                            <div className="text-gray-300"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg></div>
                                                            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded font-medium border border-emerald-100 shadow-sm">
                                                                {field.after || '(지워짐)'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 3. Deleted Section */}
                    {details?.deleted?.length > 0 && (
                        <div className="p-6">
                            <h4 className="flex items-center gap-2.5 text-sm font-bold text-gray-800 mb-4 px-1" style={{ padding: "22px" }}>
                                <div className="p-1 rounded bg-rose-100 text-rose-600"><Trash2 size={14} strokeWidth={3} /></div>
                                삭제된 일정 <span className="text-rose-600 text-xs bg-rose-50 px-2 py-0.5 rounded-full ml-1 font-bold">{details.deleted.length}건</span>
                            </h4>
                            <div className="overflow-x-auto rounded-xl border border-rose-100 bg-rose-50/30" style={{ padding: "22px" }}>
                                <table className="w-full text-sm text-gray-600">
                                    <thead className="bg-rose-50/80 text-xs text-rose-600 uppercase font-semibold border-b border-rose-100">
                                        <tr>
                                            <th className="px-6 py-4 text-left min-w-[160px] whitespace-nowrap" style={{ padding: "10px" }}>일자</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>시간</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>구분</th>
                                            <th className="px-6 py-4 text-left min-w-[100px] whitespace-nowrap" style={{ padding: "10px" }}>담당</th>
                                            <th className="px-6 py-4 text-left min-w-[200px]" style={{ padding: "10px" }}>사유</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rose-100 bg-white">
                                        {details.deleted.map((s, i) => (
                                            <tr key={i} className="hover:bg-rose-50/50 transition-colors group">
                                                <td className="px-6 py-4 font-medium text-rose-800 decoration-rose-300 line-through group-hover:no-underline whitespace-nowrap" style={{ padding: "10px" }}>{formatters.scheduleDate(s.date)}</td>
                                                <td className="px-6 py-4 text-rose-600/70 whitespace-nowrap" style={{ padding: "10px" }}>{formatters.time(s.date)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap" style={{ padding: "10px" }}>
                                                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-600 border border-rose-100">
                                                        {s.typeName || s.typeCode}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 whitespace-nowrap" style={{ padding: "10px" }}>{s.consultantName}</td>
                                                <td className="px-6 py-4 text-rose-400 text-xs italic" style={{ padding: "10px" }}>엑셀 명단에 없음</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function SchedulesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('list'); // 'list' | 'log'
    const fileInputRef = useRef(null);
    const { openSidebar } = useOutletContext();

    const {
        schedules,
        loading: schedulesLoading,
        changeLog,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        mergeSchedules,
        clearAllSchedules,
        clearChangeLog
    } = useSchedules();
    const { codes, loading: codesLoading } = useCommonCodes();
    const { users, loading: usersLoading } = useUsers();

    // 스크롤 맨 위로 버튼 상태
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 스크롤 이벤트 감지
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // 맨 위로 스크롤
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const loading = schedulesLoading || codesLoading || usersLoading;

    // --- 페이지네이션 및 필터 상태 ---
    const [selectedYear, setSelectedYear] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // 필터 변경 시 페이지 초기화
    if (selectedYear !== 'all' && currentPage !== 1) {
        // useEffect 대신 렌더링 중 상태 변경 방지를 위해 로직 내에서 처리하거나, 
        // 여기서는 단순화를 위해 useEffect를 쓰거나 렌더링 로직에서 처리.
        // React 렌더링 사이클을 고려해 useEffect로 처리하는 것이 안전함.
    }

    // 년도 목록 추출
    const availableYears = [...new Set(schedules.map(s => {
        if (!s.date) return null;
        return new Date(s.date).getFullYear();
    }).filter(y => y !== null))].sort((a, b) => b - a);

    // 필터링 및 정렬
    const filteredSchedules = schedules.filter(s => {
        if (selectedYear === 'all') return true;
        if (!s.date) return false;
        return new Date(s.date).getFullYear() === parseInt(selectedYear);
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    // 페이지네이션 로직
    const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
    const paginatedSchedules = filteredSchedules.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // 페이지 변경 핸들러
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    // 년도 변경 핸들러
    const handleYearChange = (e) => {
        setSelectedYear(e.target.value);
        setCurrentPage(1);
    };

    // 폼 상태
    const [formData, setFormData] = useState({
        date: '',
        endDate: '',
        location: '',
        consultantId: '',
        typeCode: '',
        memo: ''
    });

    // 컨설턴트 목록 (role이 consultant인 사용자)
    const consultants = users.filter(u => u.role === 'consultant' || u.role === 'admin');

    // 모달 열기 (등록/수정)
    const openModal = (schedule = null) => {
        if (schedule) {
            setEditingSchedule(schedule);
            setFormData({
                date: schedule.date || '',
                endDate: schedule.endDate || '',
                location: schedule.location || '',
                consultantId: schedule.consultantId || '',
                typeCode: schedule.typeCode || '',
                memo: schedule.memo || ''
            });
        } else {
            setEditingSchedule(null);
            setFormData({
                date: '',
                endDate: '',
                location: '',
                consultantId: '',
                typeCode: '',
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    // 폼 제출
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingSchedule) {
                await updateSchedule(editingSchedule.id, formData);
            } else {
                await addSchedule(formData);
            }
            setIsModalOpen(false);
            setEditingSchedule(null);
        } catch (error) {
            console.error('일정 저장 실패:', error);
            alert('일정 저장에 실패했습니다.');
        }
    };

    // 엑셀 날짜 변환 헬퍼 (스크린샷 형식 대응)
    const parseExcelDate = (dateVal, timeVal) => {
        let date;

        // 1. 날짜 처리
        if (typeof dateVal === 'number') {
            // 엑셀 시리얼 넘버
            date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        } else if (typeof dateVal === 'string') {
            // '2025년 11월 15일 토요일' 형식 처리
            const match = dateVal.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
            if (match) {
                date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            } else {
                date = new Date(dateVal);
            }
        }

        if (!date || isNaN(date.getTime())) return '';

        // 2. 시간 처리
        if (timeVal !== undefined && timeVal !== null) {
            if (typeof timeVal === 'number') {
                // 엑셀 시간 시리얼 (0 ~ 1 사이의 소수)
                const totalSeconds = Math.round(timeVal * 86400);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                date.setHours(hours, minutes, 0, 0);
            } else if (typeof timeVal === 'string') {
                // '9:30' 또는 '09:30' 형식 처리
                const timeMatch = timeVal.match(/(\d{1,2}):(\d{1,2})/);
                if (timeMatch) {
                    date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                }
            }
        } else {
            date.setHours(9, 0, 0, 0);
        }

        // 로컬 시간 기준으로 ISO 포맷 생성 (YYYY-MM-DDTHH:mm)
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    // 엑셀 업로드 처리 (새 형식: 월별 시트, 요일 헤더, 셀 형식: "HH:MM 상담종류(컨설턴트)*비고")
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 업로드 방식 선택
        const uploadMode = window.confirm(
            '업로드 방식을 선택하세요:\n\n' +
            '✅ 확인: 기존 데이터와 머지 (변경/삭제 추적)\n' +
            '❌ 취소: 기존 데이터 삭제 후 새로 업로드'
        ) ? 'merge' : 'replace';

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const allSchedules = [];
                const missingConsultants = new Set();
                const missingTypes = new Set();
                let totalParsed = 0;

                // 스케줄 셀 파싱 정규식: "HH:MM 상담종류(컨설턴트)*비고" 형식
                const schedulePattern = /^(\d{1,2}:\d{2})\s+(.+?)\((.+?)\)(\*.*)?$/;

                // 이름 정규화 함수
                const normalize = (str) => {
                    if (!str) return '';
                    return str.toString().trim()
                        .replace(/\s+T$/, '')      // "심영섭 T" -> "심영섭"
                        .replace(/\s+/g, '')       // 공백 제거
                        .replace(/[()]/g, '');     // 괄호 제거
                };

                console.log('📊 엑셀 파싱 시작...');
                console.log('시트 목록:', workbook.SheetNames);

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                    if (rawRows.length < 3) return;

                    // Row 0: 기준 날짜 (엑셀 시리얼 넘버)
                    // Row 1: 요일 헤더 (월요일, 화요일, ...)
                    // Row 2+: 데이터 행 (0~5열에 날짜 or 스케줄)

                    // 시트명에서 년/월 추출 시도 (예: 2027-1월, 1월 등)
                    let fallbackYear = new Date().getFullYear();
                    let fallbackMonth = new Date().getMonth();

                    const yearMatch = sheetName.match(/(\d{4})/);
                    if (yearMatch) fallbackYear = parseInt(yearMatch[1]);

                    const monthMatch = sheetName.match(/(\d{1,2})월/);
                    if (monthMatch) fallbackMonth = parseInt(monthMatch[1]) - 1;

                    // Row 0의 모든 셀을 검사하여 년/월 정보 추출 (엑셀 내 텍스트가 시트명보다 우선순위 높음)
                    let baseYear = fallbackYear;
                    let baseMonth = fallbackMonth;
                    let headerFound = false;

                    const firstRow = rawRows[0] || [];
                    for (let i = 0; i < firstRow.length; i++) {
                        const cell = firstRow[i];
                        if (!cell) continue;

                        if (typeof cell === 'number' && cell > 40000) {
                            // 엑셀 시리얼 날짜 (예: 46082 -> 2026-03-01)
                            const d = new Date((cell - 25569) * 86400 * 1000);
                            baseYear = d.getFullYear();
                            baseMonth = d.getMonth();
                            headerFound = true;
                            break;
                        } else if (typeof cell === 'string') {
                            // 문자열 검색 (예: "2026년 3월")
                            const ymMatch = cell.match(/(\d{4})년\s*(\d{1,2})월/);
                            if (ymMatch) {
                                baseYear = parseInt(ymMatch[1]);
                                baseMonth = parseInt(ymMatch[2]) - 1;
                                headerFound = true;
                                break;
                            }
                            // 년도만 있는 경우
                            const yMatch = cell.match(/(\d{4})년/);
                            if (yMatch) {
                                baseYear = parseInt(yMatch[1]);
                                headerFound = true;
                            }
                            // 월만 있는 경우
                            const mMatch = cell.match(/(\d{1,2})월/);
                            if (mMatch) {
                                baseMonth = parseInt(mMatch[1]) - 1;
                                headerFound = true;
                            }
                            if (headerFound) break;
                        }
                    }

                    const baseDate = new Date(baseYear, baseMonth, 1);

                    if (!baseDate || isNaN(baseDate.getTime())) {
                        console.log(`⚠️ ${sheetName}: 기준 날짜를 찾을 수 없음 (A1 셀이 날짜 형식이 아니고 시트명에도 '월'이 포함되지 않음), 스킵`);
                        return;
                    }

                    const confirmedMonth = baseDate.getMonth();
                    const confirmedYear = baseDate.getFullYear();

                    console.log(`📅 ${sheetName}: 스케줄 기준 년월 확정 -> ${confirmedYear}년 ${confirmedMonth + 1}월 (출처: ${headerFound ? '헤더셀' : '시트명/현재시간'})`);

                    // 현재 주의 날짜 정보 (0~5열이 월~토에 해당)
                    let currentWeekDates = [null, null, null, null, null, null];

                    // Row 2부터 데이터 파싱
                    for (let rowIdx = 2; rowIdx < rawRows.length; rowIdx++) {
                        const row = rawRows[rowIdx];
                        if (!row || row.every(cell => cell === '' || cell === null)) continue;

                        // 각 열(0~5: 월~토) 처리
                        for (let colIdx = 0; colIdx < 6; colIdx++) {
                            const cellValue = row[colIdx];
                            if (cellValue === '' || cellValue === null || cellValue === undefined) continue;

                            // 숫자인 경우: 날짜(일)
                            if (typeof cellValue === 'number' && cellValue >= 1 && cellValue <= 31) {
                                currentWeekDates[colIdx] = cellValue;
                                continue;
                            }

                            // 문자열인 경우: 스케줄 또는 공휴일 표시
                            if (typeof cellValue === 'string') {
                                const cellStr = cellValue.trim();

                                // 스케줄 패턴 매칭 (시간과 상담유형 사이 공백 유무에 유연하게 대응)
                                // 형식: "10:00 상담종류(담당자)" 또는 "10:00상담종류(담당자)"
                                const match = cellStr.match(/^(\d{1,2}:\d{2})\s*(.+?)\((.+?)\)(\*.*)?$/);
                                if (match && currentWeekDates[colIdx]) {
                                    const [, timeStr, typeName, consultantName, noteRaw] = match;
                                    const day = currentWeekDates[colIdx];

                                    // 시간 파싱
                                    const timeParts = timeStr.split(':').map(Number);
                                    const hours = timeParts[0];
                                    const minutes = timeParts[1];

                                    // 날짜 생성 (확정된 년, 월 사용)
                                    const scheduleDate = new Date(confirmedYear, confirmedMonth, day, hours, minutes, 0, 0);

                                    // ISO 문자열로 변환 (로컬 시간 기준 정규화)
                                    // 분 단위까지만 저장하여 매칭 정확도 향상
                                    const dateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

                                    // 비고 처리
                                    const note = noteRaw ? noteRaw.replace(/^\*/, '').trim() : '';

                                    // 코드 매칭 (더미 코드 사용)
                                    const normType = normalize(typeName);
                                    const typeCodeObj = codes.find(c =>
                                        normalize(c.name) === normType ||
                                        normalize(c.name).includes(normType) ||
                                        normType.includes(normalize(c.name))
                                    );

                                    // 컨설턴트 매칭 (더미 유저 사용)
                                    const normUser = normalize(consultantName);
                                    const consultantObj = users.find(u =>
                                        normalize(u.name) === normUser ||
                                        normalize(u.name).includes(normUser) ||
                                        normUser.includes(normalize(u.name))
                                    );

                                    totalParsed++;

                                    if (typeCodeObj) {
                                        allSchedules.push({
                                            date: dateStr,
                                            typeCode: typeCodeObj.code,
                                            typeName: typeCodeObj.name,
                                            consultantId: consultantObj?.uid || `unknown_${normalize(consultantName)}`,
                                            consultantName: consultantName.trim(),
                                            location: note || '',
                                            memo: note || ''
                                        });
                                    } else {
                                        // 코드는 없지만 일정은 추가 (typeName으로 저장)
                                        allSchedules.push({
                                            date: dateStr,
                                            typeCode: typeName.trim(),
                                            typeName: typeName.trim(),
                                            consultantId: consultantObj?.uid || `unknown_${normalize(consultantName)}`,
                                            consultantName: consultantName.trim(),
                                            location: note || '',
                                            memo: note || ''
                                        });
                                        missingTypes.add(typeName.trim());
                                    }

                                    if (!consultantObj) {
                                        missingConsultants.add(consultantName.trim());
                                    }
                                }
                            }
                        }
                    }
                });

                console.log(`📊 파싱 완료: ${allSchedules.length}건`);

                if (allSchedules.length > 0) {
                    let resultMsg = '';

                    if (uploadMode === 'merge') {
                        // 머지 모드: 변경 추적
                        const mergeResult = await mergeSchedules(allSchedules, false);
                        resultMsg = `📊 엑셀 업로드 완료!\n\n` +
                            `✅ 새로 추가: ${mergeResult.added.length}건\n` +
                            `🔄 변경됨: ${mergeResult.updated.length}건\n` +
                            `❌ 삭제됨: ${mergeResult.deleted.length}건\n` +
                            `⬜ 변경없음: ${mergeResult.unchanged.length}건`;

                        // 삭제된 항목 상세 표시
                        if (mergeResult.deleted.length > 0 && mergeResult.deleted.length <= 10) {
                            resultMsg += `\n\n[삭제된 일정]\n`;
                            mergeResult.deleted.forEach(s => {
                                const d = new Date(s.date);
                                resultMsg += `- ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} ${s.consultantName || s.typeName}\n`;
                            });
                        }

                        // 탭 전환
                        setActiveTab('log');
                    } else {
                        // 전체 교체 모드
                        const mergeResult = await mergeSchedules(allSchedules, true);
                        resultMsg = `📊 엑셀 업로드 완료!\n\n` +
                            `✅ 새로 등록: ${mergeResult.added.length}건\n` +
                            `🗑️ 기존 삭제: ${mergeResult.deleted.length}건`;

                        // 목록 탭 유지 (초기화 시에는 로그 불필요)
                        setActiveTab('list');
                    }

                    if (missingTypes.size > 0) {
                        resultMsg += `\n\n⚠️ [미등록 상담유형]: ${Array.from(missingTypes).join(', ')}`;
                    }
                    if (missingConsultants.size > 0) {
                        resultMsg += `\n\n⚠️ [미등록 컨설턴트]: ${Array.from(missingConsultants).join(', ')}`;
                    }

                    alert(resultMsg);
                } else {
                    alert(`유효한 스케줄을 찾을 수 없습니다.\n\n분석된 셀 수: ${totalParsed}\n\n엑셀 형식을 확인해주세요:\n- 각 시트가 월별로 구성되어 있는지\n- 첫 행에 기준 날짜가 있는지\n- 스케줄 형식: "10:00 서류면접(심영섭)"`);
                }
            } catch (error) {
                console.error('Excel upload error:', error);
                alert('엑셀 파일 처리에 실패했습니다.\n\n' + error.message);
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // 일정 삭제
    const handleDelete = async (id) => {
        if (window.confirm('정말 이 일정을 삭제하시겠습니까?')) {
            try {
                await deleteSchedule(id);
            } catch (error) {
                console.error('일정 삭제 실패:', error);
                alert('일정 삭제에 실패했습니다.');
            }
        }
    };

    // 코드명 조회
    const getTypeName = (typeCode) => {
        const code = codes.find(c => c.code === typeCode);
        return code?.name || '-';
    };

    // 컨설턴트명 조회
    const getConsultantName = (consultantId) => {
        const consultant = users.find(u => u.uid === consultantId);
        return consultant?.name || '-';
    };

    if (loading) {
        return (
            <>
                <Header title="일정 관리" onMenuClick={openSidebar} />
                <div className="page-content">
                    <LoadingSpinner message="일정을 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="일정 관리" onMenuClick={openSidebar} />
            <div className="page-content">
                <div className="page-header flex justify-between items-center mb-6">
                    <div>
                        <h1 className="page-title">일정 관리</h1>
                        <p className="page-description">컨설팅 일정을 통합 관리합니다</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                {/* Tab Navigation (Modern Pill Style) */}
                <div className="flex items-center gap-1 bg-gray-100/80 p-1.5 rounded-xl w-fit mb-8 shadow-inner" style={{ padding: "10px" }}>
                    <button
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'list'
                            ? 'bg-white text-[#00462A] shadow-sm ring-1 ring-gray-200'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`} style={{ padding: "10px", cursor: "pointer" }}
                        onClick={() => setActiveTab('list')}
                    >
                        <Calendar size={16} strokeWidth={2.5} />
                        전체 일정 목록
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'list' ? 'bg-[#00462A]/10 text-[#00462A]' : 'bg-gray-200 text-gray-500'}`}>
                            {schedules.length}
                        </span>
                    </button>
                    <button
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === 'log'
                            ? 'bg-white text-[#00462A] shadow-sm ring-1 ring-gray-200'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                            }`} style={{ padding: "10px", cursor: "pointer" }}
                        onClick={() => setActiveTab('log')}
                    >
                        <FileText size={16} strokeWidth={2.5} />
                        업로드/변경 이력
                        {changeLog.length > 0 && (
                            <span className={`px-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] ${activeTab === 'log' ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-300 text-white'
                                }`}>
                                {changeLog.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'list' ? (
                    <div className="animate-fade-in">
                        {/* Action Toolbar */}
                        <div className="flex justify-between items-center mb-4" style={{ paddingBottom: "10px" }}>
                            {/* Filter */}
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <select
                                        className="min-w-[150px] pl-12 pr-12 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00462A] focus:border-transparent appearance-none cursor-pointer hover:border-gray-300"
                                        value={selectedYear}
                                        onChange={handleYearChange}
                                        style={{ paddingLeft: '45px' }}
                                    >
                                        <option value="all">전체 년도</option>
                                        {availableYears.map(year => (
                                            <option key={year} value={year}>{year}년</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                                <span className="text-sm text-gray-500 font-medium ml-2">
                                    총 <span className="text-[#00462A] font-bold">{filteredSchedules.length}</span>건
                                </span>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleExcelUpload}
                                    accept=".xlsx, .xls "
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="btn btn-secondary shadow-sm hover:border-[#00462A] hover:text-[#00462A]"
                                >
                                    {isUploading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Upload size={18} />
                                    )}
                                    엑셀 업로드
                                </button>
                                <button
                                    onClick={() => openModal()}
                                    className="btn btn-primary shadow-md"
                                >
                                    <Plus size={18} />
                                    새 일정 등록
                                </button>
                            </div>
                        </div>

                        {/* Schedules Table */}
                        <div className="card w-full shadow-sm">
                            <div className="card-header border-b border-gray-100 bg-gray-50/30 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-900">
                                    {selectedYear === 'all' ? '전체 일정 목록' : `${selectedYear}년 일정 목록`}
                                    <span className="text-gray-400 font-normal ml-1">({filteredSchedules.length}건)</span>
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>일시</th>
                                            <th>구분</th>
                                            <th>담당 컨설턴트</th>
                                            <th>장소</th>
                                            <th className="text-right">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSchedules.length === 0 ? (
                                            <tr>
                                                <td colSpan="5">
                                                    <div className="empty-state py-20">
                                                        <Calendar size={48} className="empty-state-icon mx-auto opacity-20" />
                                                        <h3 className="mt-4 text-gray-400">
                                                            {selectedYear === 'all' ? '등록된 일정이 없습니다' : `${selectedYear}년도 일정이 없습니다`}
                                                        </h3>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedSchedules.map(schedule => (
                                                <tr key={schedule.id}>
                                                    <td className="whitespace-nowrap" style={{ padding: '0.4rem' }}>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                                <Calendar size={14} className="text-gray-400" />
                                                                {schedule.date ? new Date(schedule.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : '-'}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                                <Clock size={12} />
                                                                {schedule.date ? new Date(schedule.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="badge badge-green font-semibold">
                                                            {getTypeName(schedule.typeCode)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                                {getConsultantName(schedule.consultantId).charAt(0)}
                                                            </div>
                                                            <span className="text-gray-700">{getConsultantName(schedule.consultantId)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-1.5 text-gray-600 text-sm">
                                                            <MapPin size={14} className="text-gray-400" />
                                                            {schedule.location || '-'}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => openModal(schedule)}
                                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                                title="수정"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(schedule.id)}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                title="삭제"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="relative border-t border-gray-100 bg-gray-50/30 px-6 py-4 flex items-center justify-center" style={{ padding: '10px' }}>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            // Simple pagination logic: show around current page
                                            let pageNum;
                                            if (totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (currentPage <= 3) {
                                                pageNum = i + 1;
                                            } else if (currentPage >= totalPages - 2) {
                                                pageNum = totalPages - 4 + i;
                                            } else {
                                                pageNum = currentPage - 2 + i;
                                            }

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => handlePageChange(pageNum)}
                                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${currentPage === pageNum
                                                        ? 'bg-[#00462A] text-white border border-[#00462A] shadow-sm'
                                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                                        }`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}

                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                    <div className="absolute right-6 text-sm text-gray-500">
                                        <span className="font-medium">{filteredSchedules.length}</span>개 중 <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredSchedules.length)}</span> 표시
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in space-y-4">
                        <div className="flex justify-between items-center mb-4 px-1" style={{ padding: "10px" }}>
                            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                최근 업로드 및 변경 이력
                            </div>
                        </div>

                        {changeLog.length === 0 ? (
                            <div className="empty-state py-24 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 text-gray-300">
                                    <FileText size={32} />
                                </div>
                                <h3 className="text-gray-900 font-semibold mb-1">변경 이력이 없습니다</h3>
                                <p className="text-sm text-gray-500 max-w-xs mx-auto">엑셀 파일을 업로드하면 변경 사항이 이곳에 자동으로 기록됩니다.</p>
                            </div>
                        ) : (
                            changeLog.map((log, index) => (
                                <LogItem key={log.id || index} log={log} index={index} />
                            ))
                        )}
                    </div>
                )}

                {/* Add/Edit Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingSchedule(null);
                    }}
                    title={editingSchedule ? '일정 수정' : '새 일정 등록'}
                    size="lg"
                >
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">시작 일시 *</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">종료 일시</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">컨설팅 구분 *</label>
                                    <select
                                        className="form-select"
                                        value={formData.typeCode}
                                        onChange={(e) => setFormData({ ...formData, typeCode: e.target.value })}
                                        required
                                    >
                                        <option value="">선택하세요</option>
                                        {codes.map(code => (
                                            <option key={code.id} value={code.code}>
                                                {code.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">담당 컨설턴트 *</label>
                                    <select
                                        className="form-select"
                                        value={formData.consultantId}
                                        onChange={(e) => setFormData({ ...formData, consultantId: e.target.value })}
                                        required
                                    >
                                        <option value="">선택하세요</option>
                                        {consultants.map(consultant => (
                                            <option key={consultant.id} value={consultant.uid}>
                                                {consultant.name} ({consultant.role === 'admin' ? '관리자' : '컨설턴트'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">장소</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        className="form-input pl-10"
                                        placeholder="컨설팅 장소를 입력하세요"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">메모</label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    placeholder="상세 내용을 입력하세요 (자유 양식)"
                                    value={formData.memo}
                                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="modal-footer mt-8 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingSchedule(null);
                                }}
                                className="btn btn-secondary"
                            >
                                취소
                            </button>
                            <button type="submit" className="btn btn-primary px-8">
                                {editingSchedule ? '수정 완료' : '일정 등록'}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* Scroll to Top Button */}
                <button
                    onClick={scrollToTop}
                    className={`fixed bottom-8 right-8 p-3 rounded-full bg-[#00462A] text-white shadow-lg hover:bg-[#00331F] transition-all duration-300 z-50 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
                        }`}
                    aria-label="맨 위로 스크롤"
                >
                    <ArrowUp size={24} />
                </button>
            </div >
        </>
    );
}
