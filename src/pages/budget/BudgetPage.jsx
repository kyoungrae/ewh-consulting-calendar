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
        allConsultantFees,
        consultantFeesLoading,
        fetchConsultantFees,
        fetchAllConsultantFees,
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
        status: 'pending',
        memo: '',
        paymentDate: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    });

    // View/Tab State
    const [viewMode, setViewMode] = useState('monthly'); // 'all' or 'monthly'
    const [activeTab, setActiveTab] = useState('all-consultants'); // 'all-consultants' or consultantId

    // Search State
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch Data on Date Change
    useEffect(() => {
        fetchConsultantFees(currentDate.getFullYear(), currentDate.getMonth() + 1);
    }, [currentDate, fetchConsultantFees]);

    // Initial Fetch All for History/Tabs
    useEffect(() => {
        fetchAllConsultantFees();
    }, [fetchAllConsultantFees]);

    // Data Processing
    // 1. Get consultants (role === 'consultant')
    const consultants = useMemo(() => {
        return users.filter(u => u.role === 'consultant');
    }, [users]);

    // 2. Map fees to consultants for display
    const feeList = useMemo(() => {
        // We mainly use allConsultantFees to support cross-month views accurately
        const fees = allConsultantFees || [];

        return fees.map(fee => {
            const consultant = users.find(u => u.userId === fee.consultantId || u.uid === fee.consultantId);
            return {
                ...fee,
                consultantName: consultant ? consultant.name : (fee.consultantName || 'Unknown'),
                consultantUserId: consultant ? consultant.userId : fee.consultantId
            };
        })
            .filter(item => {
                const matchesSearch = item.consultantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.memo && item.memo.toLowerCase().includes(searchTerm.toLowerCase()));

                // Consultant Filter
                const matchesConsultant = activeTab === 'all-consultants' ? true : (item.consultantId === activeTab);

                // Time Filter
                const matchesTime = viewMode === 'all'
                    ? true
                    : (item.year === currentDate.getFullYear() && item.month === currentDate.getMonth() + 1);

                return matchesSearch && matchesConsultant && matchesTime;
            })
            .sort((a, b) => {
                // Latest first
                const dateA = a.paymentDate || `${a.year}-${String(a.month).padStart(2, '0')}-01`;
                const dateB = b.paymentDate || `${b.year}-${String(b.month).padStart(2, '0')}-01`;
                return dateB.localeCompare(dateA);
            });
    }, [allConsultantFees, users, searchTerm, activeTab, currentDate, viewMode]);

    // 2.5 Get list of consultants who have records EVER for tabs
    const registeredConsultants = useMemo(() => {
        const uniqueIds = [...new Set((allConsultantFees || []).map(f => f.consultantId))];
        return uniqueIds.map(id => {
            const consultant = users.find(u => u.userId === id || u.uid === id);
            return {
                id,
                name: consultant ? consultant.name : 'Unknown'
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [allConsultantFees, users]);

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
                memo: fee.memo || '',
                paymentDate: fee.paymentDate || new Date().toISOString().split('T')[0]
            });
        } else {
            setEditingFee(null);
            setFormData({
                consultantId: consultants.length > 0 ? (activeTab !== 'all-consultants' ? activeTab : consultants[0].userId) : '',
                amount: 0,
                status: 'pending',
                memo: '',
                paymentDate: ''
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

            const isPaid = formData.status === 'paid';
            const pDate = isPaid && formData.paymentDate
                ? new Date(formData.paymentDate)
                : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

            const feeData = {
                ...formData,
                paymentDate: isPaid ? formData.paymentDate : '',
                amount: Number(formData.amount),
                year: pDate.getFullYear(),
                month: pDate.getMonth() + 1
            };

            // If we are editing, we preserve the ID if provided by the context logic, 
            // but updateConsultantFee usually takes feeData. 
            // My DataContext implementation of updateConsultantFee handles 'items' array.
            // But wait, updateConsultantFee in DataContext uses findIndex by consultantId?
            // Let's check DataContext implementation.
            // "const index = currentItems.findIndex(f => f.consultantId === feeData.consultantId);"
            // This implies ONLY ONE fee record per consultant per month.
            // If so, I should enforce one record per consultant.

            await updateConsultantFee(feeData.year, feeData.month, feeData);
            fetchAllConsultantFees(); // History 리프레시
            setIsModalOpen(false);
        } catch (error) {
            console.error("Save failed:", error);
            alert("저장에 실패했습니다.");
        }
    };

    const handleDelete = async (fee) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            try {
                await deleteConsultantFee(fee.year, fee.month, fee.consultantId);
                fetchAllConsultantFees(); // History 리프레시
            } catch (error) {
                console.error("Delete failed:", error);
                alert("삭제에 실패했습니다.");
            }
        }
    };

    const handleToggleStatus = async (fee) => {
        const newStatus = fee.status === 'paid' ? 'pending' : 'paid';
        const actionName = newStatus === 'paid' ? '지급완료' : '지급대기';

        if (!window.confirm(`'${fee.consultantName}'님의 상태를 [${actionName}]로 변경하시겠습니까?`)) {
            return;
        }

        try {
            const updatedFee = {
                ...fee,
                status: newStatus,
                paymentDate: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : ''
            };
            await updateConsultantFee(fee.year, fee.month, updatedFee);
            fetchAllConsultantFees(); // History 리프레시
        } catch (error) {
            console.error("Status toggle failed:", error);
            alert("상태 변경에 실패했습니다.");
        }
    };

    const handleExportExcel = () => {
        // 엑셀에 들어갈 데이터 포맷팅 및 통계 추가 헬퍼 함수
        const prepareSheetData = (fees) => {
            const dataRows = fees.map(item => {
                const consultant = users.find(u => u.userId === item.consultantId || u.uid === item.consultantId);
                return {
                    '년도': item.year,
                    '월': item.month,
                    '지급일': item.paymentDate || '-',
                    '컨설턴트': consultant ? consultant.name : (item.consultantName || 'Unknown'),
                    '강사비/세션': Number(item.amount || 0).toLocaleString(),
                    '상태': item.status === 'paid' ? '지급완료' : '지급대기',
                    '비고': item.memo
                };
            }).sort((a, b) => {
                // 지급일 기준 내림차순 (최신순)
                const dateA = a.지급일 !== '-' ? a.지급일 : `${a.년도}-${String(a.월).padStart(2, '0')}-01`;
                const dateB = b.지급일 !== '-' ? b.지급일 : `${b.년도}-${String(b.월).padStart(2, '0')}-01`;
                return dateB.localeCompare(dateA);
            });

            const statsPaid = fees
                .filter(item => item.status === 'paid')
                .reduce((sum, item) => sum + Number(item.amount || 0), 0);
            const statsPending = fees
                .filter(item => item.status !== 'paid')
                .reduce((sum, item) => sum + Number(item.amount || 0), 0);

            return [
                ...dataRows,
                {}, // 빈 줄
                { '컨설턴트': '----------', '강사비/세션': '----------', '상태': '----------' },
                { '컨설턴트': '총 지급액 (지급완료 기준)', '강사비/세션': statsPaid.toLocaleString() },
                { '컨설턴트': '지급 완료 합계', '강사비/세션': statsPaid.toLocaleString() },
                { '컨설턴트': '지급 대기 합계', '강사비/세션': statsPending.toLocaleString() }
            ];
        };

        const wb = XLSX.utils.book_new();

        // 검색어 및 현재 탭(강사 선택 여부)에 따른 기본 필터링 데이터
        const baseFees = (allConsultantFees || []).filter(item => {
            const consultant = users.find(u => u.userId === item.consultantId || u.uid === item.consultantId);
            const name = consultant ? consultant.name : (item.consultantName || 'Unknown');
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.memo && item.memo.toLowerCase().includes(searchTerm.toLowerCase()));

            if (activeTab === 'all-consultants') {
                return matchesSearch;
            } else {
                return (item.consultantId === activeTab) && matchesSearch;
            }
        });

        // 1. 전체 시트 추가
        const totalWs = XLSX.utils.json_to_sheet(prepareSheetData(baseFees));
        XLSX.utils.book_append_sheet(wb, totalWs, '전체');

        // 2. 월별 시트 추가
        // 데이터를 월별로 그룹화
        const monthsGroups = {};
        baseFees.forEach(f => {
            const key = `${f.year}-${String(f.month).padStart(2, '0')}`;
            if (!monthsGroups[key]) monthsGroups[key] = [];
            monthsGroups[key].push(f);
        });

        // 월별 리스트 정렬 (오름차순) 하여 시트 추가
        Object.keys(monthsGroups).sort((a, b) => a.localeCompare(b)).forEach(monthKey => {
            const monthWs = XLSX.utils.json_to_sheet(prepareSheetData(monthsGroups[monthKey]));
            XLSX.utils.book_append_sheet(wb, monthWs, monthKey);
        });

        // 파일명 설정
        const consultantName = activeTab !== 'all-consultants' ? (registeredConsultants.find(c => c.id === activeTab)?.name || '강사') : '종합';
        const fileName = `강사료지급현황_${consultantName}_${new Date().toISOString().split('T')[0]}.xlsx`;

        XLSX.writeFile(wb, fileName);
    };

    // Formatter
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
    };

    const cssStyles = `
        .budget-page-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
            margin-bottom: 32px;
        }
        @media (min-width: 768px) {
            .budget-page-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        .budget-controls-wrapper {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 32px;
        }
        @media (min-width: 768px) {
            .budget-controls-wrapper {
                flex-direction: row;
                justify-content: space-between;
                align-items: center;
            }
        }
        @media (max-width: 767px) {
            .hide-mobile {
                display: none !important;
            }
            .table-container {
                padding: 12px !important;
            }
            .mobile-p-2 {
                padding: 8px 12px !important;
            }
        }
        .tab-scroll-container {
            display: flex;
            overflow-x: auto;
            gap: 8px;
            padding-bottom: 8px;
            margin-bottom: 24px;
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .tab-scroll-container::-webkit-scrollbar {
            display: none;
        }
        .tab-item {
            padding: 8px 16px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: bold;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid #e5e7eb;
            background-color: white;
            color: #6b7280;
        }
        .tab-item.active {
            background-color: #00462A;
            color: white;
            border-color: #00462A;
        }
    `;

    return (
        <>
            <style>{cssStyles}</style>
            <Header title="예산 관리" onMenuClick={openSidebar} />
            <div className="page-content table-container" style={{ padding: '24px' }}>
                {/* Top Controls */}
                <div className="budget-controls-wrapper">
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight" style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '16px' }}>강사료 관리</h2>
                        <div className="flex items-center gap-4 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            {/* View Mode Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-xl" style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '12px' }}>
                                <button
                                    onClick={() => setViewMode('all')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'all' ? 'bg-white shadow-sm text-[#00462A]' : 'text-gray-500 hover:text-gray-700'}`}
                                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'all' ? 'white' : 'transparent', color: viewMode === 'all' ? '#00462A' : '#6b7280', boxShadow: viewMode === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                                >전체현황</button>
                                <button
                                    onClick={() => setViewMode('monthly')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'monthly' ? 'bg-white shadow-sm text-[#00462A]' : 'text-gray-500 hover:text-gray-700'}`}
                                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: viewMode === 'monthly' ? 'white' : 'transparent', color: viewMode === 'monthly' ? '#00462A' : '#6b7280', boxShadow: viewMode === 'monthly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
                                >월별현황</button>
                            </div>

                            {/* Month Selector (Only in monthly mode) */}
                            {viewMode === 'monthly' && (
                                <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1 shadow-sm" style={{ display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: 'white' }}>
                                    <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-md" style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                        <ChevronLeft size={20} />
                                    </button>
                                    <span className="px-4 font-bold text-gray-700 min-w-[100px] text-center" style={{ padding: '0 16px', minWidth: '100px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold', color: '#374151' }}>
                                        {currentDate.getFullYear()}. {String(currentDate.getMonth() + 1).padStart(2, '0')}
                                    </span>
                                    <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-md" style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <button
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm"
                            style={{ padding: '10px 16px', borderRadius: '12px', gap: '8px', display: 'inline-flex', alignItems: 'center', border: '1px solid #d1d5db', backgroundColor: 'white', cursor: 'pointer' }}
                        >
                            <Download size={18} />
                            <span className="hide-mobile">엑셀 다운로드</span>
                        </button>
                        <button
                            onClick={() => openModal()}
                            className="inline-flex items-center gap-2 bg-[#00462A] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-[#00462A]/20 hover:bg-[#003620] hover:scale-[1.02] transition-all text-sm"
                            style={{ padding: '10px 24px', borderRadius: '12px', gap: '8px', display: 'inline-flex', alignItems: 'center', backgroundColor: '#00462A', color: 'white', border: 'none', cursor: 'pointer' }}
                        >
                            <Plus size={20} strokeWidth={3} />
                            <span>등록</span>
                        </button>
                    </div>
                </div>

                {/* Consultant Tabs - Repositioned below main controls */}
                <div className="tab-scroll-container" style={{ marginTop: '0px', marginBottom: '32px' }}>
                    <div
                        className={`tab-item ${activeTab === 'all-consultants' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all-consultants')}
                    >
                        {viewMode === 'all' ? '전체 강사 내역' : '전체 월별 현황'}
                    </div>
                    {registeredConsultants.map(c => (
                        <div
                            key={c.id}
                            className={`tab-item ${activeTab === c.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(c.id)}
                        >
                            {c.name}
                        </div>
                    ))}
                </div>

                {/* Summary Cards */}
                <div className="budget-page-grid">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 mobile-p-2" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <Wallet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-bold" style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'bold' }}>총 지급액</p>
                            <p className="text-2xl font-black text-gray-800" style={{ fontSize: '24px', fontWeight: '900', color: '#1f2937' }}>{formatCurrency(totalAmount)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 mobile-p-2" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-bold" style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 'bold' }}>지급 완료</p>
                            <p className="text-2xl font-black text-gray-800" style={{ fontSize: '24px', fontWeight: '900', color: '#1f2937' }}>{formatCurrency(totalPaid)}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 mobile-p-2" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
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
                    <div className="overflow-x-auto" style={{ overflowX: 'auto' }}>
                        <table className="w-full text-left border-collapse" style={{ width: '100%', minWidth: '450px', borderCollapse: 'collapse' }}>
                            <thead className="bg-[#F8F9FA] border-b border-gray-200" style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #e5e7eb' }}>
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>지급일</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>컨설턴트</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>강사비</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-center" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest hide-mobile" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>비고</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right" style={{ padding: '16px 24px', fontSize: '11px', fontWeight: '900', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {consultantFeesLoading && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-10 text-center text-gray-400" style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>
                                            데이터를 불러오는 중...
                                        </td>
                                    </tr>
                                )}
                                {!consultantFeesLoading && feeList.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-10 text-center text-gray-400" style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>
                                            {viewMode === 'monthly' ? '등록된 강사료 데이터가 없습니다.' : '지급된 내역이 없습니다.'}
                                        </td>
                                    </tr>
                                )}
                                {!consultantFeesLoading && feeList.length > 0 && (
                                    feeList.map((fee, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-500" style={{ padding: '16px 24px', fontSize: '13px' }}>
                                                {fee.paymentDate || '-'}
                                            </td>
                                            <td className="px-6 py-4 mobile-p-2" style={{ padding: '16px 24px' }}>
                                                <div className="font-bold text-gray-900" style={{ fontWeight: 'bold', color: '#111827' }}>{fee.consultantName}</div>
                                                <div className="text-xs text-gray-400" style={{ fontSize: '12px', color: '#9ca3af' }}>{fee.consultantUserId}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-gray-800 mobile-p-2" style={{ padding: '16px 24px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', color: '#1f2937' }}>
                                                {formatCurrency(fee.amount)}
                                            </td>
                                            <td className="px-6 py-4 text-center mobile-p-2" style={{ padding: '16px 24px', textAlign: 'center' }}>
                                                <div className="flex items-center justify-center gap-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <div
                                                        onClick={() => handleToggleStatus(fee)}
                                                        className={`relative w-11 h-6 transition-colors rounded-full cursor-pointer ${fee.status === 'paid' ? 'bg-[#00462A]' : 'bg-gray-200'}`}
                                                        style={{
                                                            position: 'relative',
                                                            width: '44px',
                                                            height: '24px',
                                                            borderRadius: '9999px',
                                                            cursor: 'pointer',
                                                            transition: 'background-color 0.2s',
                                                            backgroundColor: fee.status === 'paid' ? '#00462A' : '#e5e7eb'
                                                        }}
                                                    >
                                                        <div
                                                            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${fee.status === 'paid' ? 'left-[calc(100%-1.25rem)]' : 'left-1'}`}
                                                            style={{
                                                                position: 'absolute',
                                                                top: '4px',
                                                                width: '16px',
                                                                height: '16px',
                                                                backgroundColor: 'white',
                                                                borderRadius: '50%',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                                                transition: 'transform 0.2s, left 0.2s',
                                                                left: fee.status === 'paid' ? 'calc(100% - 20px)' : '4px'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-bold hide-mobile ${fee.status === 'paid' ? 'text-[#00462A]' : 'text-gray-400'}`} style={{
                                                        fontSize: '12px',
                                                        fontWeight: 'bold',
                                                        color: fee.status === 'paid' ? '#00462A' : '#9ca3af'
                                                    }}>
                                                        {fee.status === 'paid' ? '지급완료' : '지급대기'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 hide-mobile" style={{ padding: '16px 24px', fontSize: '14px', color: '#6b7280' }}>
                                                {fee.memo}
                                            </td>
                                            <td className="px-6 py-4 text-right mobile-p-2" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                <div className="flex justify-end gap-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    <button
                                                        onClick={() => openModal(fee)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        style={{ padding: '6px', color: '#9ca3af', borderRadius: '8px', cursor: 'pointer', border: 'none', background: 'transparent' }}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(fee)}
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

                    {formData.status === 'paid' && (
                        <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label className="block text-sm font-bold text-gray-700" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>지급일 *</label>
                            <input
                                type="date"
                                value={formData.paymentDate}
                                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                                className="w-full h-10 border border-gray-300 rounded-md px-3 focus:outline-none focus:ring-1 focus:ring-[#00462A]"
                                style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                required
                            />
                        </div>
                    )}

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
                                    onChange={(e) => {
                                        const newStatus = e.target.value;
                                        setFormData({
                                            ...formData,
                                            status: newStatus,
                                            paymentDate: formData.paymentDate || new Date().toISOString().split('T')[0]
                                        });
                                    }}
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
