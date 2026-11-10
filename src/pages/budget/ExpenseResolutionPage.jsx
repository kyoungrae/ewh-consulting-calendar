import { useMemo, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import { useData } from '../../contexts/DataContext';
import { Download, FileSpreadsheet, Upload, Eye } from 'lucide-react';
import {
    parseAttendanceWorkbook,
    enrichAttendanceSessions,
    buildExpensePreview
} from '../../utils/attendanceExcel.js';
import { downloadExpenseWord } from '../../utils/expenseWordDocs.js';
import { formatCurrency } from '../../utils/expenseFormat.js';

const SOURCE_META = {
    career: {
        key: 'career',
        label: '진로출석부',
        hint: '진로 관련 출석부 엑셀 (.xlsx)'
    },
    employment: {
        key: 'employment',
        label: '취업출석부',
        hint: '취업 관련 출석부 엑셀 (.xlsx)'
    }
};

function todayLabel() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

export default function ExpenseResolutionPage() {
    const { openSidebar } = useOutletContext();
    const { users, codes } = useData();

    const [title, setTitle] = useState('컨설팅 강사료');
    const [periodLabel, setPeriodLabel] = useState('');
    const [files, setFiles] = useState({ career: null, employment: null });
    const [sessions, setSessions] = useState([]);
    const [parseError, setParseError] = useState('');
    const [parsing, setParsing] = useState(false);
    const [previewMode, setPreviewMode] = useState('detail');
    const [downloading, setDownloading] = useState('');

    const preview = useMemo(() => buildExpensePreview(sessions), [sessions]);

    const meta = useMemo(() => ({
        title: title.trim() || '컨설팅 강사료',
        periodLabel: periodLabel.trim() || '업로드 출석부 기준',
        createdAt: todayLabel()
    }), [title, periodLabel]);

    const handleFileChange = (source) => (event) => {
        const file = event.target.files?.[0] || null;
        setFiles((prev) => ({ ...prev, [source]: file }));
        setParseError('');
    };

    const handleParse = useCallback(async () => {
        if (!files.career && !files.employment) {
            setParseError('진로출석부 또는 취업출석부 엑셀을 하나 이상 선택해 주세요.');
            return;
        }
        setParsing(true);
        setParseError('');
        try {
            const collected = [];
            for (const source of ['career', 'employment']) {
                const file = files[source];
                if (!file) continue;
                const buffer = await readFileAsArrayBuffer(file);
                const parsed = parseAttendanceWorkbook(buffer, source, file.name);
                collected.push(...parsed);
            }
            if (!collected.length) {
                setSessions([]);
                setParseError('출석부에서 세션 행을 찾지 못했습니다. 헤더에 일자·강사·구분 열이 있는지 확인해 주세요.');
                return;
            }
            const enriched = enrichAttendanceSessions(collected, users, codes);
            setSessions(enriched);
            if (!periodLabel.trim()) {
                const dates = enriched.map((row) => row.date).filter(Boolean).sort();
                if (dates.length) {
                    setPeriodLabel(dates[0] === dates[dates.length - 1]
                        ? dates[0]
                        : `${dates[0]} ~ ${dates[dates.length - 1]}`);
                }
            }
        } catch (error) {
            console.error(error);
            setSessions([]);
            setParseError(error?.message || '출석부 엑셀을 읽지 못했습니다.');
        } finally {
            setParsing(false);
        }
    }, [files, users, codes, periodLabel]);

    const handleDownload = async (kind) => {
        if (!preview.detailRows.length) {
            setParseError('먼저 출석부를 업로드하고 미리보기를 생성해 주세요.');
            return;
        }
        setDownloading(kind);
        try {
            await downloadExpenseWord(kind, {
                meta,
                detailRows: preview.detailRows,
                receiptRows: preview.receiptRows,
                totals: preview.totals
            });
        } catch (error) {
            console.error(error);
            setParseError(error?.message || '워드 파일을 만들지 못했습니다.');
        } finally {
            setDownloading('');
        }
    };

    const uploadBox = (source) => {
        const conf = SOURCE_META[source];
        const file = files[source];
        return (
            <label
                key={source}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: 18,
                    borderRadius: 16,
                    border: '1px dashed #cbd5e1',
                    background: '#fff',
                    cursor: 'pointer',
                    minHeight: 140
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a' }}>
                    <FileSpreadsheet size={18} color="#00462A" />
                    {conf.label}
                </div>
                <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>{conf.hint}</div>
                <div style={{
                    marginTop: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: file ? '#00462A' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: 13
                }}
                >
                    <Upload size={16} />
                    {file ? file.name : '파일 선택'}
                </div>
                <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleFileChange(source)}
                    style={{ display: 'none' }}
                />
            </label>
        );
    };

    return (
        <>
            <Header title="지출결의" onMenuClick={openSidebar} />
            <div
                className="page-content table-container"
                style={{ padding: '24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}
            >
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
                        지출결의
                    </h2>
                    <p style={{ color: '#64748b', fontSize: 14, maxWidth: 720, lineHeight: 1.6 }}>
                        진로출석부·취업출석부 엑셀을 업로드하면 세션을 읽어
                        <strong style={{ color: '#334155' }}> 상세내역</strong>과
                        <strong style={{ color: '#334155' }}> 영수증</strong> 미리보기를 만들고,
                        워드(.docx)로 내려받을 수 있습니다.
                    </p>
                </div>

                <section
                    style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 20
                    }}
                >
                    <div style={{ fontWeight: 800, marginBottom: 14, color: '#334155' }}>문서 정보</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>사업명</span>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
                            />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>지급 대상 기간</span>
                            <input
                                value={periodLabel}
                                onChange={(e) => setPeriodLabel(e.target.value)}
                                placeholder="예: 2026년 3월"
                                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
                            />
                        </label>
                    </div>
                </section>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 14,
                        marginBottom: 16
                    }}
                >
                    {uploadBox('career')}
                    {uploadBox('employment')}
                </section>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={handleParse}
                        disabled={parsing}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#00462A',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 12,
                            padding: '11px 18px',
                            fontWeight: 800,
                            cursor: parsing ? 'wait' : 'pointer'
                        }}
                    >
                        <Eye size={18} />
                        {parsing ? '읽는 중…' : '미리보기 생성'}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDownload('detail')}
                        disabled={!preview.detailRows.length || Boolean(downloading)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#fff',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: 12,
                            padding: '11px 16px',
                            fontWeight: 700,
                            cursor: preview.detailRows.length ? 'pointer' : 'not-allowed'
                        }}
                    >
                        <Download size={18} />
                        {downloading === 'detail' ? '저장 중…' : '상세내역 워드'}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDownload('receipt')}
                        disabled={!preview.detailRows.length || Boolean(downloading)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#fff',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: 12,
                            padding: '11px 16px',
                            fontWeight: 700,
                            cursor: preview.detailRows.length ? 'pointer' : 'not-allowed'
                        }}
                    >
                        <Download size={18} />
                        {downloading === 'receipt' ? '저장 중…' : '영수증 워드'}
                    </button>
                </div>

                {parseError && (
                    <div style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: '#FEF2F2',
                        color: '#B91C1C',
                        fontWeight: 600,
                        fontSize: 14
                    }}
                    >
                        {parseError}
                    </div>
                )}

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginBottom: 20
                }}
                >
                    {[
                        { label: '총 건수', value: preview.totals.count },
                        { label: '진로', value: preview.totals.careerCount },
                        { label: '취업', value: preview.totals.employmentCount },
                        { label: '총 지급액', value: `₩${formatCurrency(preview.totals.amount)}` }
                    ].map((card) => (
                        <div
                            key={card.label}
                            style={{
                                background: '#F9FAFB',
                                borderTop: '4px solid #00462A',
                                borderRadius: 12,
                                padding: 16
                            }}
                        >
                            <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                                {card.label}
                            </div>
                            <div style={{ color: '#00462A', fontWeight: 800, fontSize: 22 }}>{card.value}</div>
                        </div>
                    ))}
                </div>

                {preview.totals.unmatchedFeeCount > 0 && (
                    <div style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: '#FFFBEB',
                        color: '#92400E',
                        fontSize: 13,
                        lineHeight: 1.5
                    }}
                    >
                        강사료를 찾지 못한 세션이 {preview.totals.unmatchedFeeCount}건 있습니다.
                        엑셀에 금액 열이 없거나 회원관리의 강사명·강사료와 일치하지 않을 수 있습니다.
                    </div>
                )}

                <section style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    overflow: 'hidden'
                }}
                >
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        padding: '14px 16px',
                        borderBottom: '1px solid #f1f5f9',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}
                    >
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>미리보기</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[
                                { id: 'detail', label: '상세내역' },
                                { id: 'receipt', label: '영수증' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setPreviewMode(tab.id)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 999,
                                        border: previewMode === tab.id ? 'none' : '1px solid #e5e7eb',
                                        background: previewMode === tab.id ? '#00462A' : '#fff',
                                        color: previewMode === tab.id ? '#fff' : '#64748b',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        {previewMode === 'detail' ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                                <thead>
                                    <tr style={{ background: '#00462A', color: '#fff' }}>
                                        {['연번', '구분', '일자', '시간', '유형', '강사', '학생', '금액'].map((h) => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: h === '금액' ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {!preview.detailRows.length ? (
                                        <tr>
                                            <td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                                                출석부 엑셀을 업로드한 뒤 미리보기를 생성해 주세요.
                                            </td>
                                        </tr>
                                    ) : (
                                        preview.detailRows.map((row) => (
                                            <tr key={`${row.no}-${row.date}-${row.consultantName}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 14px' }}>{row.no}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.sourceLabel}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.date}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.time || '-'}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.typeName}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 700 }}>{row.consultantName}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.studentName || '-'}</td>
                                                <td style={{
                                                    padding: '12px 14px',
                                                    textAlign: 'right',
                                                    fontWeight: 800,
                                                    color: row.feeMatched ? '#00462A' : '#B45309'
                                                }}
                                                >
                                                    ₩{formatCurrency(row.amount)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                                <thead>
                                    <tr style={{ background: '#00462A', color: '#fff' }}>
                                        {['연번', '강사', '진로', '취업', '합계 건수', '지급액'].map((h) => (
                                            <th key={h} style={{ padding: '12px 14px', textAlign: h === '지급액' ? 'right' : 'left' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {!preview.receiptRows.length ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                                                출석부 엑셀을 업로드한 뒤 미리보기를 생성해 주세요.
                                            </td>
                                        </tr>
                                    ) : (
                                        preview.receiptRows.map((row, index) => (
                                            <tr key={row.consultantName} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 14px' }}>{index + 1}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 700 }}>{row.consultantName}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.careerCount}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.employmentCount}</td>
                                                <td style={{ padding: '12px 14px' }}>{row.count}</td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#00462A' }}>
                                                    ₩{formatCurrency(row.amount)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {preview.receiptRows.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            <td colSpan={4} style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>
                                                합계
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 800 }}>{preview.totals.count}</td>
                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#00462A' }}>
                                                ₩{formatCurrency(preview.totals.amount)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
