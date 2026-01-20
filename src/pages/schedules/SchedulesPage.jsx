import { useState, useRef } from 'react';
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
    Loader2
} from 'lucide-react';

export default function SchedulesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const { openSidebar } = useOutletContext();

    const {
        schedules,
        loading: schedulesLoading,
        addSchedule,
        updateSchedule,
        deleteSchedule,
        batchAddSchedules,
        clearAllSchedules
    } = useSchedules();
    const { codes, loading: codesLoading } = useCommonCodes();
    const { users, loading: usersLoading } = useUsers();

    const loading = schedulesLoading || codesLoading || usersLoading;

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

    // 엑셀 업로드 처리
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmClear = window.confirm('새로운 일정을 업로드하기 전에 기존 일정을 모두 삭제하시겠습니까?');

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                if (confirmClear) {
                    await clearAllSchedules();
                }

                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const allSchedules = [];
                const missingConsultants = new Set();
                const missingTypes = new Set();
                let totalAttempted = 0;

                // 이름 정규화 함수 (심영섭 T -> 심영섭 매칭용)
                const normalize = (str) => {
                    if (!str) return '';
                    return str.toString().trim()
                        .split(' ')[0] // 첫 공백 전까지만 (심영섭 T -> 심영섭)
                        .replace(/\(취소\)$/, '') // '(취소)' 제거
                        .replace(/컨설턴트$/, ''); // '컨설턴트' 제거
                };

                console.log('--- Database Status ---');
                console.log('Codes:', codes.map(c => c.name));
                console.log('Consultants:', users.map(u => u.name));

                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (rawRows.length === 0) return;

                    let headerIndex = -1;
                    for (let i = 0; i < Math.min(15, rawRows.length); i++) {
                        const row = rawRows[i];
                        if (row && (row.includes('컨설턴트명') || row.includes('구분') || row.includes('일자'))) {
                            headerIndex = i;
                            break;
                        }
                    }

                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        range: headerIndex >= 0 ? headerIndex : 0
                    });

                    jsonData.forEach((row, idx) => {
                        const rowDate = row['일자'];
                        const rowTypeName = (row['구분'] || '').toString().trim();
                        const rowConsultantName = (row['컨설턴트명'] || '').toString().trim();

                        if (!rowDate && !rowTypeName && !rowConsultantName) return;
                        totalAttempted++;

                        const fullDateStr = parseExcelDate(rowDate, row['시간']);
                        if (!fullDateStr) return;

                        // 정규화 매칭
                        const normType = normalize(rowTypeName);
                        const normUser = normalize(rowConsultantName);

                        const typeCodeObj = codes.find(c =>
                            normalize(c.name) === normType || normalize(c.name).includes(normType)
                        );

                        const consultantObj = users.find(u =>
                            normalize(u.name) === normUser || normalize(u.name).includes(normUser)
                        );

                        if (typeCodeObj && consultantObj) {
                            allSchedules.push({
                                date: fullDateStr,
                                typeCode: typeCodeObj.code,
                                consultantId: consultantObj.uid,
                                location: (row['방식'] || '').toString().trim(),
                                memo: (row['비고'] || row['메모'] || '').toString().trim()
                            });
                        } else {
                            if (!typeCodeObj && rowTypeName) missingTypes.add(rowTypeName);
                            if (!consultantObj && rowConsultantName) missingConsultants.add(rowConsultantName);
                        }
                    });
                });

                if (allSchedules.length > 0) {
                    const chunks = [];
                    for (let i = 0; i < allSchedules.length; i += 500) {
                        chunks.push(allSchedules.slice(i, i + 500));
                    }
                    for (const chunk of chunks) {
                        await batchAddSchedules(chunk);
                    }

                    let resultMsg = `업로드 완료: ${allSchedules.length}건 등록됨.`;
                    if (missingTypes.size > 0) resultMsg += `\n\n[미등록 구분]: ${Array.from(missingTypes).join(', ')}`;
                    if (missingConsultants.size > 0) resultMsg += `\n\n[미등록 컨설턴트]: ${Array.from(missingConsultants).join(', ')}`;
                    alert(resultMsg);
                } else {
                    let failMsg = `등록 가능한 유효한 데이터가 없습니다. (분석행 수: ${totalAttempted})`;
                    if (codes.length === 0) {
                        failMsg += '\n\n⚠️ 현재 시스템에 [컨설팅 구분 코드]가 하나도 없습니다. 설정 메뉴에서 코드를 먼저 생성해 주세요.';
                    }
                    if (missingTypes.size > 0) failMsg += `\n\n[확인 필요 구분]: ${Array.from(missingTypes).join(', ')}`;
                    if (missingConsultants.size > 0) failMsg += `\n\n[확인 필요 컨설턴트]: ${Array.from(missingConsultants).join(', ')}`;
                    failMsg += '\n\n위 이름들이 시스템에 정확히 등록되어 있는지 확인해 주세요.';
                    alert(failMsg);
                }
            } catch (error) {
                console.error('Excel upload error:', error);
                alert('엑셀 파일 처리에 실패했습니다.');
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
                <div className="page-header flex justify-between items-center mb-8">
                    <div>
                        <h1 className="page-title">일정 관리</h1>
                        <p className="page-description">컨설팅 일정을 통합 관리합니다</p>
                    </div>
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
                        <h3 className="font-semibold text-gray-900">전체 일정 목록 ({schedules.length}건)</h3>
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
                                {schedules.length === 0 ? (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="empty-state py-20">
                                                <Calendar size={48} className="empty-state-icon mx-auto opacity-20" />
                                                <h3 className="mt-4 text-gray-400">등록된 일정이 없습니다</h3>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    schedules.map(schedule => (
                                        <tr key={schedule.id}>
                                            <td className="whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 text-gray-900 font-medium">
                                                        <Calendar size={14} className="text-gray-400" />
                                                        {schedule.date ? new Date(schedule.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }) : '-'}
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
                </div>

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
            </div>
        </>
    );
}
