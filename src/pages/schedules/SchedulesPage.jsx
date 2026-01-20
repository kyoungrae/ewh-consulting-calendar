import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import {
    Plus,
    Edit2,
    Trash2,
    Calendar,
    Clock,
    MapPin
} from 'lucide-react';

export default function SchedulesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const { openSidebar } = useOutletContext();

    const {
        schedules,
        loading,
        addSchedule,
        updateSchedule,
        deleteSchedule
    } = useSchedules();
    const { codes } = useCommonCodes();
    const { users } = useUsers();

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
                    <button
                        onClick={() => openModal()}
                        className="btn btn-primary shadow-md"
                    >
                        <Plus size={18} />
                        새 일정 등록
                    </button>
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
