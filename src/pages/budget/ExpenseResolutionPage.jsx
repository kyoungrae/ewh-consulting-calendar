import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import { useData } from '../../contexts/DataContext';
import {
    Download,
    ChevronLeft,
    ChevronRight,
    RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    BUCKET_IDS,
    aggregateBudgetByBucket,
    findUserByConsultantId
} from '../../utils/budgetAggregation';

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function getRange(periodMode, anchorYear, anchorMonth, customStartStr, customEndStr) {
    if (periodMode === 'year') {
        return {
            start: startOfDay(new Date(anchorYear, 0, 1)),
            end: endOfDay(new Date(anchorYear, 11, 31)),
            label: `${anchorYear}년 (연간)`
        };
    }
    if (periodMode === 'month') {
        const start = startOfDay(new Date(anchorYear, anchorMonth - 1, 1));
        const end = endOfDay(new Date(anchorYear, anchorMonth, 0));
        return {
            start,
            end,
            label: `${anchorYear}년 ${String(anchorMonth).padStart(2, '0')}월`
        };
    }
    return {
        start: startOfDay(new Date(customStartStr)),
        end: endOfDay(new Date(customEndStr)),
        label: `${customStartStr} ~ ${customEndStr}`
    };
}

/** 예산 버킷별 집계를 강사 단위 지출결의 행으로 합칩니다. */
function aggregateExpenseRows(bucketCounts, users) {
    const byConsultant = new Map();

    Object.entries(bucketCounts || {}).forEach(([bucketId, counts]) => {
        if (bucketId === BUCKET_IDS.UNMAPPED) return;
        Object.entries(counts || {}).forEach(([consultantId, st]) => {
            if (!st || !st.count) return;
            const prev = byConsultant.get(consultantId) || {
                consultantId,
                count: 0,
                subtotal: 0,
                minFee: null,
                maxFee: null
            };
            prev.count += st.count;
            prev.subtotal += st.subtotal;
            prev.minFee = prev.minFee == null ? st.minFee : Math.min(prev.minFee, st.minFee);
            prev.maxFee = prev.maxFee == null ? st.maxFee : Math.max(prev.maxFee, st.maxFee);
            byConsultant.set(consultantId, prev);
        });
    });

    return Array.from(byConsultant.values())
        .map((st) => {
            const u = findUserByConsultantId(users, st.consultantId);
            const sameRate = st.minFee === st.maxFee;
            return {
                consultantId: st.consultantId,
                name: u?.name || u?.userId || st.consultantId,
                count: st.count,
                feePerSession: sameRate ? st.minFee : 0,
                feePerSessionMixed: !sameRate,
                subtotal: st.subtotal
            };
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
}

export default function ExpenseResolutionPage() {
    const { openSidebar } = useOutletContext();
    const { schedules, schedulesLoading, users, codes, fetchSchedules, fetchUsers } = useData();

    const now = new Date();
    const [periodMode, setPeriodMode] = useState('month');
    const [anchorYear, setAnchorYear] = useState(now.getFullYear());
    const [anchorMonth, setAnchorMonth] = useState(now.getMonth() + 1);
    const [customStart, setCustomStart] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    );
    const [customEnd, setCustomEnd] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    );
    const [refreshing, setRefreshing] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const range = useMemo(
        () => getRange(periodMode, anchorYear, anchorMonth, customStart, customEnd),
        [periodMode, anchorYear, anchorMonth, customStart, customEnd]
    );

    useEffect(() => {
        Promise.allSettled([fetchSchedules(), fetchUsers()]);
    }, [fetchSchedules, fetchUsers]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.allSettled([fetchSchedules(), fetchUsers()]);
        } finally {
            setRefreshing(false);
        }
    }, [fetchSchedules, fetchUsers]);

    const bucketCounts = useMemo(
        () => aggregateBudgetByBucket(schedules, users, codes, range),
        [schedules, users, codes, range]
    );

    const rows = useMemo(() => aggregateExpenseRows(bucketCounts, users), [bucketCounts, users]);

    const sortedRows = useMemo(() => {
        const list = [...rows];
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            if (sortConfig.key === 'count') return dir * ((a.count || 0) - (b.count || 0));
            if (sortConfig.key === 'subtotal') return dir * ((a.subtotal || 0) - (b.subtotal || 0));
            return dir * (a.name || '').localeCompare(b.name || '', 'ko');
        });
        return list;
    }, [rows, sortConfig]);

    const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + (r.subtotal || 0), 0), [rows]);
    const grandCount = useMemo(() => rows.reduce((sum, r) => sum + (r.count || 0), 0), [rows]);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

    const handlePrevMonth = () => {
        if (anchorMonth <= 1) {
            setAnchorYear((y) => y - 1);
            setAnchorMonth(12);
        } else {
            setAnchorMonth((m) => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (anchorMonth >= 12) {
            setAnchorYear((y) => y + 1);
            setAnchorMonth(1);
        } else {
            setAnchorMonth((m) => m + 1);
        }
    };

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const handleExportExcel = () => {
        const exportRows = [
            { 항목: '기간', 내용: range.label },
            { 항목: '총 건수', 내용: grandCount },
            { 항목: '총 지급액', 내용: grandTotal },
            {},
            ...sortedRows.map((r, index) => ({
                연번: index + 1,
                강사: r.name,
                건수: r.count,
                '1회 강사료': r.feePerSessionMixed ? '유형별' : r.feePerSession,
                지급액: r.subtotal
            }))
        ];
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '지출결의');
        XLSX.writeFile(wb, `지출결의_${range.label.replace(/\s/g, '_')}.xlsx`);
    };

    const loading = schedulesLoading || refreshing;

    const sortMark = (key) => {
        if (sortConfig.key !== key) return '';
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    return (
        <>
            <Header title="지출결의" onMenuClick={openSidebar} />
            <div
                className="page-content table-container"
                style={{ padding: '24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 16,
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 24
                    }}
                >
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
                            지출결의
                        </h2>
                        <p style={{ color: '#64748b', fontSize: 14, maxWidth: 560, lineHeight: 1.5 }}>
                            예산 산정과 같은 기준으로 기간 내 미취소 일정을 강사별로 묶어, 지출결의용 지급 내역을
                            확인·엑셀 저장합니다.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl font-bold text-sm"
                            style={{ cursor: loading ? 'wait' : 'pointer', alignItems: 'center', gap: 8 }}
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                            새로고침
                        </button>
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-xl font-bold text-sm"
                            style={{ cursor: 'pointer', alignItems: 'center', gap: 8 }}
                        >
                            <Download size={18} />
                            엑셀
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 24
                    }}
                >
                    <div style={{ fontWeight: 800, marginBottom: 14, color: '#334155' }}>집계 기간</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                        {[
                            { id: 'year', label: '연간' },
                            { id: 'month', label: '월별' },
                            { id: 'custom', label: '직접 선택' }
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setPeriodMode(t.id)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: 999,
                                    border: periodMode === t.id ? 'none' : '1px solid #e5e7eb',
                                    background: periodMode === t.id ? '#00462A' : '#fff',
                                    color: periodMode === t.id ? '#fff' : '#64748b',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {periodMode === 'year' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontWeight: 600, color: '#475569' }}>연도</span>
                            <input
                                type="number"
                                value={anchorYear}
                                onChange={(e) => setAnchorYear(Number(e.target.value))}
                                style={{ width: 100, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                            />
                        </label>
                    )}

                    {periodMode === 'month' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                                <button
                                    type="button"
                                    onClick={handlePrevMonth}
                                    style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span style={{ minWidth: 120, textAlign: 'center', fontWeight: 800 }}>
                                    {anchorYear}.{String(anchorMonth).padStart(2, '0')}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNextMonth}
                                    style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    {periodMode === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <input
                                type="date"
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                            />
                            <span style={{ color: '#94a3b8' }}>~</span>
                            <input
                                type="date"
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                            />
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                        marginBottom: 24
                    }}
                >
                    <div style={{ background: '#F9FAFB', borderTop: '4px solid #00462A', borderRadius: 12, padding: 18 }}>
                        <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>대상 기간</div>
                        <div style={{ color: '#00462A', fontWeight: 800, fontSize: 18 }}>{range.label}</div>
                    </div>
                    <div style={{ background: '#F9FAFB', borderTop: '4px solid #00462A', borderRadius: 12, padding: 18 }}>
                        <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>강사 수</div>
                        <div style={{ color: '#00462A', fontWeight: 800, fontSize: 28 }}>{rows.length}</div>
                    </div>
                    <div style={{ background: '#F9FAFB', borderTop: '4px solid #00462A', borderRadius: 12, padding: 18 }}>
                        <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>총 건수</div>
                        <div style={{ color: '#00462A', fontWeight: 800, fontSize: 28 }}>{grandCount}</div>
                    </div>
                    <div style={{ background: '#F9FAFB', borderTop: '4px solid #00462A', borderRadius: 12, padding: 18 }}>
                        <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>총 지급액</div>
                        <div style={{ color: '#00462A', fontWeight: 800, fontSize: 22 }}>{formatCurrency(grandTotal)}</div>
                    </div>
                </div>

                <section
                    style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16,
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#0f172a' }}>
                        강사별 지급 내역
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                            <thead>
                                <tr style={{ background: '#00462A', color: '#fff' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: 72 }}>연번</th>
                                    <th
                                        style={{ padding: '12px 16px', textAlign: 'left', cursor: 'pointer' }}
                                        onClick={() => handleSort('name')}
                                    >
                                        강사{sortMark('name')}
                                    </th>
                                    <th
                                        style={{ padding: '12px 16px', textAlign: 'right', cursor: 'pointer' }}
                                        onClick={() => handleSort('count')}
                                    >
                                        건수{sortMark('count')}
                                    </th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>1회 강사료</th>
                                    <th
                                        style={{ padding: '12px 16px', textAlign: 'right', cursor: 'pointer' }}
                                        onClick={() => handleSort('subtotal')}
                                    >
                                        지급액{sortMark('subtotal')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                                            불러오는 중…
                                        </td>
                                    </tr>
                                ) : sortedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                                            해당 기간에 지출결의 대상 일정이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedRows.map((r, index) => (
                                        <tr key={r.consultantId} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b' }}>
                                                {index + 1}
                                            </td>
                                            <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1e293b' }}>
                                                {r.name}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {r.count}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {r.feePerSessionMixed ? (
                                                    <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>유형별</span>
                                                ) : (
                                                    formatCurrency(r.feePerSession)
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: '#00462A' }}>
                                                {formatCurrency(r.subtotal)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f1f5f9' }}>
                                    <td
                                        colSpan={4}
                                        style={{ padding: '14px 16px', fontWeight: 800, color: '#334155', textAlign: 'right' }}
                                    >
                                        합계 ({grandCount}건)
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#00462A' }}>
                                        {formatCurrency(grandTotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>
            </div>
        </>
    );
}
