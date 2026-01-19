import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useSchedules, useCommonCodes, useUsers } from '../../hooks/useFirestore';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Calendar,
    Filter
} from 'lucide-react';

export default function SchedulesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('');
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
        studentName: '',
        date: '',
        endDate: '',
        location: '',
        consultantId: '',
        typeCode: '',
        memo: ''
    });

    // 컨설턴트 목록 (role이 consultant인 사용자)
    const consultants = users.filter(u => u.role === 'consultant' || u.role === 'admin');

    // 검색 및 필터링
    const filteredSchedules = schedules.filter(schedule => {
        const matchSearch = schedule.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            schedule.location?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchFilter = !filterType || schedule.typeCode === filterType;
        return matchSearch && matchFilter;
    });

    // 모달 열기 (등록/수정)
    const openModal = (schedule = null) => {
        if (schedule) {
            setEditingSchedule(schedule);
            setFormData({
                studentName: schedule.studentName || '',
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
                studentName: '',
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
                <div className="page-header flex justify-between items-start">
                    <div>
                        <h1 className="page-title">일정 등록</h1>
                        <p className="page-description">컨설팅 일정을 등록하고 관리합니다</p>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="btn btn-primary"
                    >
                        <Plus size={18} />
                        새 일정 등록
                    </button>
                </div>

                {/* Search & Filter */}
                <div className="card mb-6">
                    <div className="card-body">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[200px]">
                                <div className="relative">
                                    <Search
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                    />
                                    <input
                                        type="text"
                                        placeholder="학생 이름 또는 장소로 검색..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="form-input pl-10"
                                    />
                                </div>
                            </div>
                            <div className="w-48">
                                <div className="relative">
                                    <Filter
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                    />
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                        className="form-select pl-10"
                                    >
                                        <option value="">전체 구분</option>
                                        {codes.map(code => (
                                            <option key={code.id} value={code.code}>
                                                {code.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Schedules Table */}
                <div className="card">
                    <div className="card-header flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">일정 목록</h3>
                        <span className="text-sm text-gray-500">
                            총 {filteredSchedules.length}건
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>날짜</th>
                                    <th>학생 이름</th>
                                    <th>컨설팅 구분</th>
                                    <th>담당 컨설턴트</th>
                                    <th>장소</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSchedules.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="empty-state">
                                                <Calendar size={48} className="empty-state-icon mx-auto" />
                                                <h3>등록된 일정이 없습니다</h3>
                                                <p>새 일정을 등록해주세요</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSchedules.map(schedule => (
                                        <tr key={schedule.id}>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={16} className="text-gray-400" />
                                                    {schedule.date ? new Date(schedule.date).toLocaleDateString('ko-KR') : '-'}
                                                </div>
                                            </td>
                                            <td className="font-medium text-gray-900">
                                                {schedule.studentName}
                                            </td>
                                            <td>
                                                <span className="badge badge-green">
                                                    {getTypeName(schedule.typeCode)}
                                                </span>
                                            </td>
                                            <td>{getConsultantName(schedule.consultantId)}</td>
                                            <td>{schedule.location || '-'}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openModal(schedule)}
                                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(schedule.id)}
                                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                        <div className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">학생 이름 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="학생 이름을 입력하세요"
                                    value={formData.studentName}
                                    onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">시작일 *</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">종료일</label>
                                    <input
                                        type="datetime-local"
                                        className="form-input"
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

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

                            <div className="form-group">
                                <label className="form-label">장소</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="컨설팅 장소를 입력하세요"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">메모</label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    placeholder="추가 메모를 입력하세요"
                                    value={formData.memo}
                                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="modal-footer mt-6 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
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
                            <button type="submit" className="btn btn-primary">
                                {editingSchedule ? '수정' : '등록'}
                            </button>
                        </div>
                    </form>
                </Modal>
            </div>
        </>
    );
}
