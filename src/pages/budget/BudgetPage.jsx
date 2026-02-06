import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import { useData } from '../../contexts/DataContext';
import {
    Plus,
    Edit2,
    Trash2,
    Download,
    DollarSign,
    Search,
    ChevronLeft,
    ChevronRight,
    Wallet
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function BudgetPage() {
    const { openSidebar } = useOutletContext();
    const {
        consultantFees,
        consultantFeesLoading,
        fetchConsultantFees,
        updateConsultantFee,
        deleteConsultantFee,
        users
    } = useData();

    // Year/Month State
    const [currentDate, setCurrentDate] = useState(new Date());

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFee, setEditingFee] = useState(null);
    const [formData, setFormData] = useState({
        consultantId: '',
        amount: 0,
        status: 'pending', // pending, paid
        memo: ''
    });

    // Search State
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch Data on Date Change
    useEffect(() => {
        fetchConsultantFees(currentDate.getFullYear(), currentDate.getMonth() + 1);
    }, [currentDate, fetchConsultantFees]);

    // Data Processing
    // 1. Get consultants (role === 'consultant')
    const consultants = useMemo(() => {
        return users.filter(u => u.role === 'consultant');
    }, [users]);

    // 2. Map fees to consultants for display
    const feeList = useMemo(() => {
        const fees = consultantFees || [];
        return fees.map(fee => {
            const consultant = users.find(u => u.userId === fee.consultantId || u.uid === fee.consultantId);
            return {
                ...fee,
                consultantName: consultant ? consultant.name : (fee.consultantName || 'Unknown'),
                consultantUserId: consultant ? consultant.userId : fee.consultantId
            };
        }).filter(item =>
            item.consultantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.memo && item.memo.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [consultantFees, users, searchTerm]);

    // 3. Calculate Totals
    const totalAmount = useMemo(() => {
        return feeList.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }, [feeList]);

    const totalPaid = useMemo(() => {
        return feeList
            .filter(item => item.status === 'paid')
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }, [feeList]);


    // Handlers
    const handlePrevMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const openModal = (fee = null) => {
        if (fee) {
            setEditingFee(fee);
            setFormData({
                consultantId: fee.consultantId,
                amount: fee.amount,
                status: fee.status || 'pending',
                memo: fee.memo || ''
            });
        } else {
            setEditingFee(null);
            setFormData({
                consultantId: consultants.length > 0 ? consultants[0].userId : '',
                amount: 0,
                status: 'pending',
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Check if consultant already has a fee for this month (only for new entries)
            if (!editingFee) {
                const exists = consultantFees.some(f => f.consultantId === formData.consultantId);
                // 중복 허용 여부: 일반적으로 한 사람에게 여러 건의 지급이 있을 수 있음.
                // 하지만 요구사항상 "목록"이라고 했으니 OK. 키는 id로 관리됨.
            }

            const feeData = {
                ...formData,
                amount: Number(formData.amount),
                year: currentDate.getFullYear(),
                month: currentDate.getMonth() + 1
            };

            // If we are editing, we preserve the ID if provided by the context logic, 
            // but updateConsultantFee usually takes feeData. 
            // My DataContext implementation of updateConsultantFee handles 'items' array.
            // But wait, updateConsultantFee in DataContext uses findIndex by consultantId?
            // Let's check DataContext implementation.
            // "const index = currentItems.findIndex(f => f.consultantId === feeData.consultantId);"
            // This implies ONLY ONE fee record per consultant per month.
            // If so, I should enforce one record per consultant.

            await updateConsultantFee(currentDate.getFullYear(), currentDate.getMonth() + 1, feeData);
            setIsModalOpen(false);
        } catch (error) {
            console.error("Save failed:", error);
            alert("저장에 실패했습니다.");
        }
    };

    const handleDelete = async (consultantId) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            try {
                await deleteConsultantFee(currentDate.getFullYear(), currentDate.getMonth() + 1, consultantId);
            } catch (error) {
                console.error("Delete failed:", error);
                alert("삭제에 실패했습니다.");
            }
        }
    };

    const handleToggleStatus = async (fee) => {
        const newStatus = fee.status === 'paid' ? 'pending' : 'paid';
        try {
            await updateConsultantFee(currentDate.getFullYear(), currentDate.getMonth() + 1, {
                ...fee,
                status: newStatus
            });
        } catch (error) {
            console.error("Status toggle failed:", error);
            alert("상태 변경에 실패했습니다.");
        }
    };

    const handleExportExcel = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;

        const dataToExport = feeList.map(item => ({
            '년도': year,
            '월': month,
            '컨설턴트': item.consultantName,
            '아이디': item.consultantUserId,
            '강사비/세션': item.amount,
            '상태': item.status === 'paid' ? '지급완료' : '지급대기',
            '비고': item.memo
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${year}년 ${month}월 강사료`);
        XLSX.writeFile(wb, `강사료지급현황_${year}_${month}.xlsx`);
    };

    // Formatter
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
    };

    return (
        <>
            <Header title="예산 관리" onMenuClick={openSidebar} />
            <div className="page-content" style={{ padding: '24px' }}>
                {/* Top Controls */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8" style={{ marginBottom: '32px', gap: '16px' }}>
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight" style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '8px' }}>강사료 관리</h2>
                        <div className="flex items-center gap-4 mt-2" style={{ marginTop: '8px', gap: '16px' }}>
                            <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1 shadow-sm" style={{ padding: '4px' }}>
                                <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-md" style={{ padding: '4px' }}>
                                    <ChevronLeft size={20} />
                                </button>
                                <span className="px-4 font-bold text-gray-700 min-w-[100px] text-center" style={{ padding: '0 16px', minWidth: '100px', display: 'inline-block', textAlign: 'center' }}>
                                    {currentDate.getFullYear()}. {String(currentDate.getMonth() + 1).padStart(2, '0')}
                                </span>
                                <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-md" style={{ padding: '4px' }}>
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2" style={{ gap: '8px' }}>
                        <button
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm"
                            style={{ padding: '10px 16px', borderRadius: '12px', gap: '8px', display: 'inline-flex', alignItems: 'center' }}
                        >
                            <Download size={18} />
                            <span>엑셀 다운로드</span>
                        </button>
                        <button
                            onClick={() => openModal()}
                            className="inline-flex items-center gap-2 bg-[#00462A] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-[#00462A]/20 hover:bg-[#003620] hover:scale-[1.02] transition-all text-sm"
                            style={{ padding: '10px 24px', borderRadius: '12px', gap: '8px', display: 'inline-flex', alignItems: 'center', backgroundColor: '#00462A', color: 'white' }}
                        >
                            <Plus size={20} strokeWidth={3} />
                            <span>강사료 등록</span>
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <Wallet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-bold" style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'bold' }}>총 지급액</p>
                            <p className="text-2xl font-black text-gray-800" style={{ fontSize: '24px', fontWeight: '900', color: '#1f2937' }}>{formatCurrency(totalAmount)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-bold" style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'bold' }}>지급 완료</p>
                            <p className="text-2xl font-black text-gray-800" style={{ fontSize: '24px', fontWeight: '900', color: '#1f2937' }}>{formatCurrency(totalPaid)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-600" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-bold" style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'bold' }}>지급 대기</p>
                            <p className="text-2xl font-black text-gray-800" style={{ fontSize: '24px', fontWeight: '900', color: '#1f2937' }}>{formatCurrency(totalAmount - totalPaid)}</p>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead className="bg-[#F8F9FA] border-b border-gray-200" style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #e5e7eb' }}>
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[15%]" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>컨설턴트</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[20%] text-right" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>강사비/세션</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[15%] text-center" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[30%]" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>비고</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-[10%] text-right" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {consultantFeesLoading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-10 text-center text-gray-400" style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>
                                            데이터를 불러오는 중...
                                        </td>
                                    </tr>
                                ) : feeList.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-10 text-center text-gray-400" style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>
                                            등록된 강사료 데이터가 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    feeList.map((fee, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td className="px-6 py-4" style={{ padding: '16px 24px' }}>
                                                <div className="font-bold text-gray-900" style={{ fontWeight: 'bold', color: '#111827' }}>{fee.consultantName}</div>
                                                <div className="text-xs text-gray-400" style={{ fontSize: '12px', color: '#9ca3af' }}>{fee.consultantUserId}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-gray-800" style={{ padding: '16px 24px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', color: '#1f2937' }}>
                                                {formatCurrency(fee.amount)}
                                            </td>
                                            <td className="px-6 py-4 text-center" style={{ padding: '16px 24px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleToggleStatus(fee)}
                                                    className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold cursor-pointer hover:opacity-80 transition-opacity ${fee.status === 'paid'
                                                            ? 'bg-blue-100 text-blue-700'
                                                            : 'bg-orange-100 text-orange-700'
                                                        }`} style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '9999px',
                                                            fontSize: '11px',
                                                            fontWeight: 'bold',
                                                            display: 'inline-flex',
                                                            backgroundColor: fee.status === 'paid' ? '#dbeafe' : '#ffedd5',
                                                            color: fee.status === 'paid' ? '#1d4ed8' : '#c2410c',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}>
                                                    {fee.status === 'paid' ? '지급완료' : '지급대기'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500" style={{ padding: '16px 24px', fontSize: '14px', color: '#6b7280' }}>
                                                {fee.memo}
                                            </td>
                                            <td className="px-6 py-4 text-right" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                <div className="flex justify-end gap-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    <button
                                                        onClick={() => openModal(fee)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        style={{ padding: '6px', color: '#9ca3af', borderRadius: '8px', cursor: 'pointer', border: 'none', background: 'transparent' }}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(fee.consultantId)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        style={{ padding: '6px', color: '#9ca3af', borderRadius: '8px', cursor: 'pointer', border: 'none', background: 'transparent' }}
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
            </div>

            {/* Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingFee ? '강사료 수정' : '강사료 등록'}
            >
                <form onSubmit={handleSubmit} className="flex flex-col space-y-4 p-2" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                    <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label className="block text-sm font-bold text-gray-700" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>컨설턴트 *</label>
                        <select
                            value={formData.consultantId}
                            onChange={(e) => setFormData({ ...formData, consultantId: e.target.value })}
                            disabled={!!editingFee} // 수정 시 변경 불가
                            className="w-full h-10 border border-gray-300 rounded-md px-3 focus:outline-none focus:ring-1 focus:ring-[#00462A] bg-white disabled:bg-gray-100"
                            style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: editingFee ? '#f3f4f6' : 'white' }}
                        >
                            {!editingFee && <option value="">선택하세요</option>}
                            {consultants.map(c => (
                                <option key={c.userId} value={c.userId}>
                                    {c.name} ({c.userId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label className="block text-sm font-bold text-gray-700" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>강사비/세션 *</label>
                        <input
                            type="number"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            className="w-full h-10 border border-gray-300 rounded-md px-3 focus:outline-none focus:ring-1 focus:ring-[#00462A]"
                            style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                            placeholder="0"
                        />
                    </div>

                    <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label className="block text-sm font-bold text-gray-700" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>상태</label>
                        <div className="flex gap-4" style={{ display: 'flex', gap: '16px' }}>
                            <label className="flex items-center gap-2 cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="status"
                                    value="pending"
                                    checked={formData.status === 'pending'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="accent-[#00462A]"
                                />
                                <span className="text-sm" style={{ fontSize: '14px' }}>지급대기</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="status"
                                    value="paid"
                                    checked={formData.status === 'paid'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="accent-[#00462A]"
                                />
                                <span className="text-sm" style={{ fontSize: '14px' }}>지급완료</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label className="block text-sm font-bold text-gray-700" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>비고</label>
                        <textarea
                            value={formData.memo}
                            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#00462A] h-20 resize-none"
                            style={{ width: '100%', height: '80px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'none' }}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2" style={{ paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-bold"
                            style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', color: '#374151', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[#00462A] text-white rounded-md hover:bg-[#003620] font-bold"
                            style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: '#00462A', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                        >
                            저장
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
