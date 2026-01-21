import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useCommonCodes } from '../../hooks/useFirestore';
import {
    Plus,
    Edit2,
    Trash2,
    Settings,
    Hash
} from 'lucide-react';

export default function CodesPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCode, setEditingCode] = useState(null);
    const { openSidebar } = useOutletContext();

    const {
        codes,
        loading,
        addCode,
        updateCode,
        deleteCode
    } = useCommonCodes();

    // 폼 상태
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        description: '',
        color: '#e0f2f1',
        borderColor: '#00695c'
    });

    // 모달 열기 (등록/수정)
    const openModal = (code = null) => {
        if (code) {
            setEditingCode(code);
            setFormData({
                code: code.code || '',
                name: code.name || '',
                description: code.description || '',
                color: code.color || '#e0f2f1',
                borderColor: code.borderColor || '#00695c'
            });
        } else {
            setEditingCode(null);
            setFormData({
                code: '',
                name: '',
                description: '',
                color: '#e0f2f1',
                borderColor: '#00695c'
            });
        }
        setIsModalOpen(true);
    };

    // 폼 제출
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingCode) {
                await updateCode(editingCode.id, formData);
            } else {
                // 코드 중복 체크
                const isDuplicate = codes.some(c => c.code === formData.code);
                if (isDuplicate) {
                    alert('이미 존재하는 코드입니다.');
                    return;
                }
                await addCode(formData);
            }
            setIsModalOpen(false);
            setEditingCode(null);
        } catch (error) {
            console.error('코드 저장 실패:', error);
            alert('코드 저장에 실패했습니다.');
        }
    };

    // 코드 삭제
    const handleDelete = async (id) => {
        if (window.confirm('정말 이 코드를 삭제하시겠습니까?\n이 코드를 사용하는 일정에 영향을 줄 수 있습니다.')) {
            try {
                await deleteCode(id);
            } catch (error) {
                console.error('코드 삭제 실패:', error);
                alert('코드 삭제에 실패했습니다.');
            }
        }
    };

    if (loading) {
        return (
            <>
                <Header title="코드 관리" onMenuClick={openSidebar} />
                <div className="page-content">
                    <LoadingSpinner message="코드 정보를 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="코드 관리" onMenuClick={openSidebar} />
            <div className="page-content">
                <div className="page-header flex justify-between items-start">
                    <div>
                        <h1 className="page-title">공통 코드 관리</h1>
                        <p className="page-description">컨설팅 구분 등 시스템에서 사용하는 공통 코드를 관리합니다</p>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="btn btn-primary"
                    >
                        <Plus size={18} />
                        새 코드 등록
                    </button>
                </div>

                {/* Info Card */}
                <div
                    className="card mb-6 border-l-4"
                    style={{ borderLeftColor: '#00462A', marginBottom: '10px' }}
                >
                    <div className="card-body flex items-start gap-3">
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: '#e6f7ef' }}
                        >
                            <Settings size={20} style={{ color: '#00462A' }} />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900 mb-1">공통 코드란?</h4>
                            <p className="text-sm text-gray-600">
                                공통 코드는 시스템 전반에서 사용되는 분류 체계입니다.
                                예를 들어 컨설팅 구분(진로, 취업, 학업 등)을 코드로 관리하여
                                일관된 데이터 관리가 가능합니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Codes Table */}
                <div className="card">
                    <div className="card-header flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">코드 목록</h3>
                        <span className="text-sm text-gray-500">
                            총 {codes.length}건
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>코드</th>
                                    <th>코드명</th>
                                    <th>색상 프리뷰</th>
                                    <th>설명</th>
                                    <th>등록일</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {codes.length === 0 ? (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="empty-state">
                                                <Hash size={48} className="empty-state-icon mx-auto" />
                                                <h3>등록된 코드가 없습니다</h3>
                                                <p>새 코드를 등록해주세요</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    codes.map(code => (
                                        <tr key={code.id}>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                                                        style={{
                                                            backgroundColor: '#e6f7ef',
                                                            color: '#00462A'
                                                        }}
                                                    >
                                                        {code.code}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="font-medium text-gray-900">
                                                {code.name}
                                            </td>
                                            <td>
                                                <div
                                                    className="px-3 py-1 rounded text-xs font-bold border"
                                                    style={{
                                                        backgroundColor: code.color || '#e0f2f1',
                                                        borderColor: code.borderColor || '#00695c',
                                                        color: '#222'
                                                    }}
                                                >
                                                    Chip Preview
                                                </div>
                                            </td>
                                            <td className="text-gray-600">
                                                {code.description || '-'}
                                            </td>
                                            <td className="text-gray-500 text-sm">
                                                {code.createdAt?.toDate
                                                    ? code.createdAt.toDate().toLocaleDateString('ko-KR')
                                                    : '-'}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openModal(code)}
                                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(code.id)}
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
                        setEditingCode(null);
                    }}
                    title={editingCode ? '코드 수정' : '새 코드 등록'}
                >
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">코드 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="예: 01, 02, A1"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    required
                                    disabled={!!editingCode}
                                    maxLength={10}
                                />
                                {editingCode && (
                                    <p className="text-xs text-gray-500 mt-1">코드는 수정할 수 없습니다</p>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">코드명 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="예: 진로 컨설팅, 취업 컨설팅"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">설명</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    placeholder="코드에 대한 상세 설명을 입력하세요"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">배경색</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            className="h-10 w-12 rounded border p-1 cursor-pointer"
                                            value={formData.color}
                                            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            className="form-input flex-1"
                                            value={formData.color}
                                            onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                            placeholder="#FFFFFF"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">테두리색</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            className="h-10 w-12 rounded border p-1 cursor-pointer"
                                            value={formData.borderColor}
                                            onChange={(e) => setFormData({ ...formData, borderColor: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            className="form-input flex-1"
                                            value={formData.borderColor}
                                            onChange={(e) => setFormData({ ...formData, borderColor: e.target.value })}
                                            placeholder="#000000"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer mt-6 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingCode(null);
                                }}
                                className="btn btn-secondary"
                            >
                                취소
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {editingCode ? '수정' : '등록'}
                            </button>
                        </div>
                    </form>
                </Modal>
            </div>
        </>
    );
}
