import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import { useSpecialSchedules } from '../../hooks/useFirestore';
import {
    Plus,
    Edit2,
    Trash2,
    Calendar,
    Tag,
    Info,
    AlertCircle
} from 'lucide-react';

export default function EventsPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const { openSidebar } = useOutletContext();

    const {
        specialSchedules: events,
        loading,
        addSpecialSchedule,
        updateSpecialSchedule,
        deleteSpecialSchedule
    } = useSpecialSchedules();

    const [formData, setFormData] = useState({
        title: '',
        date: '',
        endDate: '',
        type: 'holiday',
        color: '#ffeb3b',
        textColor: '#000000',
        memo: ''
    });

    const eventTypes = [
        { value: 'holiday', label: '공휴일', defaultColor: '#ffebee', defaultTextColor: '#d32f2f' },
        { value: 'exam', label: '시험 기간', defaultColor: '#e3f2fd', defaultTextColor: '#1976d2' },
        { value: 'vacation', label: '휴가/방학', defaultColor: '#e8f5e9', defaultTextColor: '#388e3c' },
        { value: 'meeting', label: '간담회/회의', defaultColor: '#f3e5f5', defaultTextColor: '#7b1fa2' },
        { value: 'other', label: '기타 발전 사항', defaultColor: '#fff3e0', defaultTextColor: '#e65100' },
    ];

    const openModal = (event = null) => {
        if (event) {
            setEditingEvent(event);
            setFormData({
                title: event.title || '',
                date: event.date || '',
                endDate: event.endDate || '',
                type: event.type || 'holiday',
                color: event.color || '#ffeb3b',
                textColor: event.textColor || '#000000',
                memo: event.memo || ''
            });
        } else {
            setEditingEvent(null);
            setFormData({
                title: '',
                date: '',
                endDate: '',
                type: 'holiday',
                color: '#ffebee',
                textColor: '#d32f2f',
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleTypeChange = (typeValue) => {
        const selectedType = eventTypes.find(t => t.value === typeValue);
        setFormData(prev => ({
            ...prev,
            type: typeValue,
            color: selectedType?.defaultColor || prev.color,
            textColor: selectedType?.defaultTextColor || prev.textColor
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingEvent) {
                await updateSpecialSchedule(editingEvent.id, formData);
            } else {
                await addSpecialSchedule(formData);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('일정 저장 실패:', error);
            alert('일정 저장에 실패했습니다.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            try {
                await deleteSpecialSchedule(id);
            } catch (error) {
                console.error('일정 삭제 실패:', error);
                alert('일정 삭제에 실패했습니다.');
            }
        }
    };

    return (
        <>
            <Header title="일반 일정 관리" onMenuClick={openSidebar} />
            <div className="page-content max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">일반 일정 목록</h2>
                        <p className="mt-1 text-sm text-gray-500" style={{ margin: "10px 0px" }}>공휴일, 시험 기간, 간담회 등 달력에 표시될 공통 일정을 관리합니다.</p>
                    </div>
                    <button
                        onClick={() => openModal()}
                        className="inline-flex items-center gap-2 bg-[#00462A] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-[#00462A]/20 hover:bg-[#003620] hover:scale-[1.02] transition-all"
                        style={{ padding: "10px" }}
                    >
                        <Plus size={20} strokeWidth={3} />
                        <span>일정 추가</span>
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-[#00462A]/20 border-t-[#00462A] rounded-full animate-spin"></div>
                            <p className="text-gray-400 font-medium">데이터를 불러오는 중...</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto overflow-y-visible">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#F8F9FA] border-b border-gray-200">
                                    <tr>
                                        <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[25%] font-mono" style={{ padding: "10px" }}>일정명</th>
                                        <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[25%] font-mono" style={{ padding: "10px" }}>기간</th>
                                        <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[15%] font-mono" style={{ padding: "10px" }}>구분</th>
                                        <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[20%] font-mono" style={{ padding: "10px" }}>비고</th>
                                        <th className="px-8 py-5 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[15%] text-right font-mono" style={{ padding: "10px" }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {events.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-8 py-20 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Calendar size={40} className="text-gray-200 mb-2" />
                                                    <p className="text-gray-400 font-medium">등록된 일반 일정이 없습니다.</p>
                                                    <button onClick={() => openModal()} className="text-[#00462A] text-sm font-bold hover:underline">첫 일정 등록하기</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        events.map((event) => (
                                            <tr key={event.id} className="hover:bg-gray-50/80 transition-colors group">
                                                <td className="px-8 py-6" style={{ padding: "10px" }}>
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-4 h-4 rounded-full shadow-inner ring-2 ring-white"
                                                            style={{ backgroundColor: event.color }}
                                                        />
                                                        <span className="font-bold text-gray-900 text-[15px]">{event.title}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6" style={{ padding: "10px" }}>
                                                    <div className="flex items-center gap-2.5 text-gray-600 font-medium text-[14px]">
                                                        <div className="p-1.5 rounded-lg bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-[#00462A] transition-colors">
                                                            <Calendar size={14} />
                                                        </div>
                                                        <span>{event.date}</span>
                                                        {event.endDate && event.endDate !== event.date && (
                                                            <>
                                                                <span className="text-gray-300">~</span>
                                                                <span>{event.endDate}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6" style={{ padding: "10px" }}>
                                                    <span
                                                        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black border tracking-tighter"
                                                        style={{
                                                            backgroundColor: event.color + '22',
                                                            color: event.textColor,
                                                            borderColor: event.color + '44'
                                                        }}
                                                    >
                                                        {eventTypes.find(t => t.value === event.type)?.label || event.type}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6" style={{ padding: "10px" }}>
                                                    <p className="text-sm text-gray-500 max-w-[200px] truncate group-hover:text-gray-700 transition-colors">
                                                        {event.memo || <span className="text-gray-300 italic">없음</span>}
                                                    </p>
                                                </td>
                                                <td className="px-8 py-6 text-right" style={{ padding: "10px" }}>
                                                    <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => openModal(event)}
                                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                            title="수정"
                                                        >
                                                            <Edit2 size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(event.id)}
                                                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                            title="삭제"
                                                        >
                                                            <Trash2 size={18} />
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
                )}


                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={editingEvent ? '일반 일정 수정' : '일반 일정 등록'}
                >
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-gray-700 ml-1">일정명</label>
                            <input
                                type="text"
                                required
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#00462A]/10 focus:border-[#00462A] outline-none transition-all placeholder:text-gray-300 font-medium"
                                placeholder="예: 삼일절, 중간고사 기간"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-700 ml-1">시작일</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.date}
                                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#00462A]/10 focus:border-[#00462A] outline-none transition-all font-medium"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-700 ml-1">종료일 (선택)</label>
                                <input
                                    type="date"
                                    value={formData.endDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#00462A]/10 focus:border-[#00462A] outline-none transition-all font-medium"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-gray-700 ml-1">구분</label>
                            <div className="relative">
                                <select
                                    value={formData.type}
                                    onChange={(e) => handleTypeChange(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#00462A]/10 focus:border-[#00462A] outline-none transition-all font-medium appearance-none bg-white cursor-pointer"
                                >
                                    {eventTypes.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <Tag size={18} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-700 ml-1">배경색</label>
                                <div className="flex gap-2">
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        <input
                                            type="color"
                                            value={formData.color}
                                            onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div
                                            className="w-full h-full rounded-xl border-2 border-white shadow-sm ring-1 ring-gray-200"
                                            style={{ backgroundColor: formData.color }}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.color}
                                        onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-4 focus:ring-[#00462A]/10 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-bold text-gray-700 ml-1">글자색</label>
                                <div className="flex gap-2">
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        <input
                                            type="color"
                                            value={formData.textColor}
                                            onChange={(e) => setFormData(prev => ({ ...prev, textColor: e.target.value }))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div
                                            className="w-full h-full rounded-xl border-2 border-white shadow-sm ring-1 ring-gray-200"
                                            style={{ backgroundColor: formData.textColor }}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.textColor}
                                        onChange={(e) => setFormData(prev => ({ ...prev, textColor: e.target.value }))}
                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono focus:ring-4 focus:ring-[#00462A]/10 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-gray-700 ml-1">비고</label>
                            <textarea
                                value={formData.memo}
                                onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#00462A]/10 focus:border-[#00462A] outline-none transition-all placeholder:text-gray-300 font-medium resize-none"
                                rows="3"
                                placeholder="메모가 필요한 경우 입력하세요."
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 sm:flex-none px-6 py-3 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                className="flex-1 sm:flex-none px-10 py-3 bg-[#00462A] text-white font-bold rounded-xl shadow-lg shadow-[#00462A]/20 hover:bg-[#003620] hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                {editingEvent ? '수정 완료' : '등록'}
                            </button>
                        </div>
                    </form>
                </Modal>

            </div>
        </>
    );
}
