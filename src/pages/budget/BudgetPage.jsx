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
    bucketToRows,
    sumRows
} from '../../utils/budgetAggregation';

const CAREER_BLOCKS = [
    { bucket: BUCKET_IDS.CAREER_DEV, title: '진로개발', letter: 'A' },
    { bucket: BUCKET_IDS.WELCOME, title: '웰컴세션', letter: 'B' },
    { bucket: BUCKET_IDS.CAREER_LINK, title: '진로연계', letter: 'C' }
];

const EMP_BASE = { bucket: BUCKET_IDS.EMP_DOC, title: '서류면접', letter: 'D' };

const EMP_SPEC = [
    { bucket: BUCKET_IDS.EMP_SCI, title: '이공계', letter: 'E' },
    { bucket: BUCKET_IDS.EMP_PUB, title: '공기업', letter: 'F' },
    { bucket: BUCKET_IDS.EMP_GLO, title: '외국계', letter: 'G' },
    { bucket: BUCKET_IDS.EMP_CON, title: '콘텐츠·엔터', letter: 'H' }
];

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
    const start = startOfDay(new Date(customStartStr));
    const end = endOfDay(new Date(customEndStr));
    return {
        start,
        end,
        label: `${customStartStr} ~ ${customEndStr}`
    };
}

function BudgetSection({ title, letter, rows, total }) {
    const formatCurrency = (n) =>
        new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);

    return (
        <section
            style={{
                marginBottom: 28,
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#fff'
            }}
        >
            <div
                style={{
                    padding: '14px 18px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: 800,
                    fontSize: 15,
                    color: '#0f172a'
                }}
            >
                {title}
                {letter ? (
                    <span style={{ marginLeft: 8, fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                        (소계 {letter})
                    </span>
                ) : null}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#fafafa' }}>
                        <th
                            style={{
                                textAlign: 'left',
                                padding: '12px 18px',
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#94a3b8',
                                letterSpacing: '0.06em'
                            }}
                        >
                            강사
                        </th>
                        <th
                            style={{
                                textAlign: 'right',
                                padding: '12px 18px',
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#94a3b8'
                            }}
                        >
                            건수
                        </th>
                        <th
                            style={{
                                textAlign: 'right',
                                padding: '12px 18px',
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#94a3b8'
                            }}
                        >
                            1회 강사료
                        </th>
                        <th
                            style={{
                                textAlign: 'right',
                                padding: '12px 18px',
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#94a3b8'
                            }}
                        >
                            강사료 합계
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                해당 기간 일정 없음
                            </td>
                        </tr>
                    ) : (
                        rows.map((r) => (
                            <tr key={r.consultantId} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1e293b' }}>{r.name}</td>
                                <td style={{ padding: '14px 18px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {r.count}
                                </td>
                                <td style={{ padding: '14px 18px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    {r.feePerSessionMixed ? (
                                        <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>유형별</span>
                                    ) : (
                                        formatCurrency(r.feePerSession)
                                    )}
                                </td>
                                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, color: '#00462A' }}>
                                    {formatCurrency(r.subtotal)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
                <tfoot>
                    <tr style={{ background: '#f1f5f9' }}>
                        <td
                            colSpan={3}
                            style={{ padding: '14px 18px', fontWeight: 800, color: '#334155', textAlign: 'right' }}
                        >
                            = 총 강사료 ({letter})
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 900, color: '#00462A' }}>
                            {formatCurrency(total)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </section>
    );
}

export default function BudgetPage() {
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

    const range = useMemo(
        () => getRange(periodMode, anchorYear, anchorMonth, customStart, customEnd),
        [periodMode, anchorYear, anchorMonth, customStart, customEnd]
    );

    useEffect(() => {
        fetchSchedules();
        fetchUsers();
    }, [fetchSchedules, fetchUsers]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchSchedules(), fetchUsers()]);
        } finally {
            setRefreshing(false);
        }
    }, [fetchSchedules, fetchUsers]);

    const bucketCounts = useMemo(
        () => aggregateBudgetByBucket(schedules, users, codes, range),
        [schedules, users, codes, range]
    );

    const careerParts = useMemo(() => {
        return CAREER_BLOCKS.map((block) => {
            const rows = bucketToRows(bucketCounts[block.bucket], users);
            return { ...block, rows, total: sumRows(rows) };
        });
    }, [bucketCounts, users]);

    const empDocPart = useMemo(() => {
        const rows = bucketToRows(bucketCounts[BUCKET_IDS.EMP_DOC], users);
        return { ...EMP_BASE, rows, total: sumRows(rows) };
    }, [bucketCounts, users]);

    const empSpecParts = useMemo(() => {
        return EMP_SPEC.map((block) => {
            const rows = bucketToRows(bucketCounts[block.bucket], users);
            return { ...block, rows, total: sumRows(rows) };
        });
    }, [bucketCounts, users]);

    const careerGrand = useMemo(() => careerParts.reduce((a, p) => a + p.total, 0), [careerParts]);
    const employmentGrand = useMemo(
        () => empDocPart.total + empSpecParts.reduce((a, p) => a + p.total, 0),
        [empDocPart, empSpecParts]
    );

    const unmappedRows = useMemo(() => bucketToRows(bucketCounts[BUCKET_IDS.UNMAPPED], users), [bucketCounts, users]);
    const unmappedTotal = useMemo(() => sumRows(unmappedRows), [unmappedRows]);

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

    const handleExportExcel = () => {
        const rows = [];
        const pushRows = (section, letter, blockRows) => {
            blockRows.forEach((r) => {
                rows.push({
                    구분: section,
                    소계: letter,
                    강사: r.name,
                    건수: r.count,
                    '1회 강사료': r.feePerSessionMixed ? '유형별' : r.feePerSession,
                    '강사료 합계': r.subtotal
                });
            });
        };

        rows.push({ 구분: '기간', 소계: '', 강사: range.label });
        rows.push({});

        rows.push({ 구분: '[진로 예산]', 소계: '', 강사: formatCurrency(careerGrand) });
        careerParts.forEach((p) => {
            pushRows('진로', p.letter, p.rows);
            rows.push({
                구분: '소계',
                소계: p.letter,
                강사: '합계',
                건수: '',
                '1회 강사료': '',
                '강사료 합계': p.total
            });
            rows.push({});
        });

        rows.push({ 구분: '[취업 예산]', 소계: '', 강사: formatCurrency(employmentGrand) });
        pushRows('취업', empDocPart.letter, empDocPart.rows);
        rows.push({
            구분: '소계',
            소계: empDocPart.letter,
            강사: '합계',
            '강사료 합계': empDocPart.total
        });
        rows.push({});
        rows.push({ 구분: '서류면접 특화', 소계: '', 강사: '(이공계·공기업·외국계·콘텐츠·엔터)' });
        empSpecParts.forEach((p) => {
            pushRows('특화', p.letter, p.rows);
            rows.push({
                구분: '소계',
                소계: p.letter,
                강사: '합계',
                '강사료 합계': p.total
            });
        });

        if (unmappedRows.length > 0) {
            rows.push({});
            rows.push({ 구분: '미분류(공통코드 확인)', 소계: '', 강사: formatCurrency(unmappedTotal) });
            pushRows('미분류', '-', unmappedRows);
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '예산산정');
        XLSX.writeFile(wb, `예산산정_${range.label.replace(/\s/g, '_')}.xlsx`);
    };

    const loading = schedulesLoading || refreshing;

    return (
        <>
            <Header title="예산 관리" onMenuClick={openSidebar} />
            <div
                className="page-content table-container"
                style={{ padding: '24px', maxWidth: 1680, width: '100%', margin: '0 auto' }}
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
                            예산 산정
                        </h2>
                        <p style={{ color: '#64748b', fontSize: 14, maxWidth: 560, lineHeight: 1.5 }}>
                            일정의 <strong>유형(typeCode)</strong>·강사·건수를 읽어 강사료를 건별 합산합니다. 적용
                            순서는 <strong>해당 유형 단가</strong> → <strong>모든유형</strong> 기본가 → 구 단일 단가(
                            <code className="text-xs">consultingFeePerSession</code>)입니다.
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
                                    {anchorYear}. {String(anchorMonth).padStart(2, '0')}
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
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>시작일</span>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                                />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>종료일</span>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                                />
                            </label>
                        </div>
                    )}

                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontWeight: 800, color: '#00462A' }}>
                        적용 기간: {range.label}
                    </div>
                </div>

                {loading && (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>불러오는 중…</div>
                )}

                {!loading && (
                    <>
                        <div className="budget-detail-grid">
                            {/* 왼쪽: 진로 예산 요약 + A·B·C */}
                            <div>
                                <div
                                    style={{
                                        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                                        border: '1px solid #bbf7d0',
                                        borderRadius: 16,
                                        padding: 22,
                                        marginBottom: 20
                                    }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', marginBottom: 6 }}>
                                        [진로 예산]
                                    </div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: '#00462A' }}>
                                        {formatCurrency(careerGrand)}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#15803d' }}>
                                        소계 A+B+C (진로개발·웰컴세션·진로연계)
                                    </div>
                                </div>

                                {careerParts.map((p) => (
                                    <BudgetSection
                                        key={p.bucket}
                                        title={p.title}
                                        letter={p.letter}
                                        rows={p.rows}
                                        total={p.total}
                                    />
                                ))}
                            </div>

                            {/* 오른쪽: 취업 예산 요약 + D 및 특화 */}
                            <div>
                                <div
                                    style={{
                                        background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: 16,
                                        padding: 22,
                                        marginBottom: 20
                                    }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', marginBottom: 6 }}>
                                        [취업 예산]
                                    </div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: '#1e3a8a' }}>
                                        {formatCurrency(employmentGrand)}
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#2563eb' }}>
                                        소계 D+E+F+G+H (서류면접 + 특화: 이공계·공기업·외국계·콘텐츠·엔터)
                                    </div>
                                </div>

                                <BudgetSection
                                    title={empDocPart.title}
                                    letter={empDocPart.letter}
                                    rows={empDocPart.rows}
                                    total={empDocPart.total}
                                />

                                <div style={{ margin: '8px 0 20px', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                                    서류면접 특화 (이공계, 공기업, 외국계, 콘텐츠·엔터)
                                </div>

                                {empSpecParts.map((p) => (
                                    <BudgetSection
                                        key={p.bucket}
                                        title={p.title}
                                        letter={p.letter}
                                        rows={p.rows}
                                        total={p.total}
                                    />
                                ))}
                            </div>
                        </div>

                        {unmappedRows.length > 0 && (
                            <div style={{ marginTop: 36, padding: 20, background: '#fffbeb', borderRadius: 16, border: '1px solid #fde68a' }}>
                                <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
                                    미분류 세션 (공통 코드명·코드 확인 필요)
                                </div>
                                <div style={{ fontSize: 13, color: '#78350f', marginBottom: 12 }}>
                                    아래 건은 진로/취업 예산 합계에 포함되지 않습니다. 코드 관리에서 유형 이름을 점검해 주세요.
                                </div>
                                <BudgetSection title="미분류" letter="-" rows={unmappedRows} total={unmappedTotal} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

