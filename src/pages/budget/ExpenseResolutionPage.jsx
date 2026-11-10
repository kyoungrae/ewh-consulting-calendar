import { useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Download, Eye, FileSpreadsheet, Upload } from 'lucide-react';
import { parseCareerBudgetWorkbook, emptyCareerModel } from '../../utils/expense/careerBudgetParser.js';
import { parseEmploymentBudgetWorkbook, emptyEmploymentModel } from '../../utils/expense/employmentBudgetParser.js';
import { toConsultantMaster } from '../../utils/expense/consultantMaster.js';
import { downloadCareerExpenseDoc } from '../../utils/expense/careerExpenseDoc.js';
import { downloadEmploymentExpenseDoc } from '../../utils/expense/employmentExpenseDoc.js';
import { downloadCareerReceiptDoc } from '../../utils/expense/careerReceiptDoc.js';
import { downloadEmploymentReceiptDoc } from '../../utils/expense/employmentReceiptDoc.js';
import { formatCurrency } from '../../utils/expenseFormat.js';

function readFileBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

function BlockPreview({ title, blocks }) {
    if (!blocks?.length) {
        return (
            <div style={{ padding: '16px 18px', color: '#94a3b8', fontSize: 14 }}>
                {title}: 없음
            </div>
        );
    }
    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ padding: '10px 18px', fontWeight: 800, color: '#00462A' }}>{title}</div>
            {blocks.map((block, index) => (
                <div
                    key={`${title}-${block.consultant}-${index}`}
                    style={{
                        padding: '12px 18px',
                        borderTop: '1px solid #f1f5f9',
                        display: 'grid',
                        gap: 6
                    }}
                >
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                        ({index + 1}) {block.displayName} 강사
                        {block.missingProfile ? (
                            <span style={{ marginLeft: 8, color: '#B45309', fontSize: 12, fontWeight: 700 }}>
                                마스터 없음
                            </span>
                        ) : null}
                    </div>
                    <div style={{ color: '#334155', fontSize: 14 }}>
                        총 {block.sessionCount}세션 * 세션당 ₩{formatCurrency(block.rate)} = ₩{formatCurrency(block.amount)}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                        {block.days.map((day) => (
                            <div key={`${block.consultant}-${day.dayKey}`}>
                                {day.dayKey} – {(day.times || []).join(', ') || '-'} ({day.count}세션)
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ExpenseResolutionPage() {
    const { openSidebar } = useOutletContext();
    const [programName, setProgramName] = useState('혁신');
    const [careerFile, setCareerFile] = useState(null);
    const [employmentFile, setEmploymentFile] = useState(null);
    const [careerModel, setCareerModel] = useState(emptyCareerModel());
    const [employmentModel, setEmploymentModel] = useState(emptyEmploymentModel());
    const [masters, setMasters] = useState([]);
    const [previewMode, setPreviewMode] = useState('career-detail');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const hasCareer = careerModel.sessionCount > 0;
    const hasEmployment = employmentModel.sessionCount > 0;

    const summary = useMemo(() => ([
        { label: '진로 세션', value: careerModel.sessionCount },
        { label: '진로 지급액', value: `₩${formatCurrency(careerModel.totalAmount)}` },
        { label: '취업 세션', value: employmentModel.sessionCount },
        { label: '취업 지급액', value: `₩${formatCurrency(employmentModel.totalAmount)}` }
    ]), [careerModel, employmentModel]);

    const handleParse = useCallback(async () => {
        if (!careerFile && !employmentFile) {
            setError('진로출석부 또는 취업출석부 엑셀을 선택해 주세요.');
            return;
        }
        setBusy('parse');
        setError('');
        try {
            // 로그인 후 consultants 마스터(인적/계좌·장소·단가)를 브라우저에서만 사용. 출석 파일은 서버로 올리지 않음.
            const rawMasters = await api('/auth/consultants');
            const nextMasters = (Array.isArray(rawMasters) ? rawMasters : []).map((user) => toConsultantMaster(user));
            setMasters(nextMasters);

            if (careerFile) {
                const buffer = await readFileBuffer(careerFile);
                setCareerModel(parseCareerBudgetWorkbook(buffer, nextMasters));
            } else {
                setCareerModel(emptyCareerModel());
            }
            if (employmentFile) {
                const buffer = await readFileBuffer(employmentFile);
                setEmploymentModel(parseEmploymentBudgetWorkbook(buffer, nextMasters));
            } else {
                setEmploymentModel(emptyEmploymentModel());
            }
            setPreviewMode(careerFile ? 'career-detail' : 'employment-detail');
        } catch (err) {
            console.error(err);
            setError(err?.message || '출석부 엑셀을 처리하지 못했습니다.');
        } finally {
            setBusy('');
        }
    }, [careerFile, employmentFile]);

    const handleDownload = async (kind) => {
        setBusy(kind);
        setError('');
        try {
            const options = { programName: programName.trim() || '혁신' };
            if (kind === 'career-detail') await downloadCareerExpenseDoc(careerModel, options);
            if (kind === 'career-receipt') await downloadCareerReceiptDoc(careerModel, masters, options);
            if (kind === 'employment-detail') await downloadEmploymentExpenseDoc(employmentModel, options);
            if (kind === 'employment-receipt') await downloadEmploymentReceiptDoc(employmentModel, masters, options);
        } catch (err) {
            console.error(err);
            setError(err?.message || '워드 파일을 만들지 못했습니다.');
        } finally {
            setBusy('');
        }
    };

    const uploadCard = (label, hint, file, onChange) => (
        <label style={{
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
                {label}
            </div>
            <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>{hint}</div>
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
                accept=".xlsx,.xls"
                onChange={(event) => onChange(event.target.files?.[0] || null)}
                style={{ display: 'none' }}
            />
        </label>
    );

    return (
        <>
            <Header title="지출결의" onMenuClick={openSidebar} />
            <div className="page-content table-container" style={{ padding: 24, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>지출결의</h2>
                    <p style={{ color: '#64748b', fontSize: 14, maxWidth: 760, lineHeight: 1.6 }}>
                        진로/취업 출석부 엑셀은 브라우저에서만 읽고, 상세내역·영수증 미리보기와 워드(.docx) 다운로드를 만듭니다.
                        영수증 인적/계좌는 로그인 후 상담사 마스터(`GET /api/auth/consultants`)만 사용합니다.
                    </p>
                </div>

                <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>사업 구분(파일명 접두)</span>
                        <input
                            value={programName}
                            onChange={(e) => setProgramName(e.target.value)}
                            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1' }}
                        />
                    </label>
                </section>

                <section style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 14,
                    marginBottom: 16
                }}
                >
                    {uploadCard('진로출석부', '진로 전용 엑셀 (.xlsx) — 서버 미업로드', careerFile, setCareerFile)}
                    {uploadCard('취업출석부', '취업 전용 엑셀 (.xlsx) — 서류면접/서면첨삭 시트', employmentFile, setEmploymentFile)}
                </section>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    <button
                        type="button"
                        onClick={handleParse}
                        disabled={Boolean(busy)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            background: '#00462A', color: '#fff', border: 'none', borderRadius: 12,
                            padding: '11px 18px', fontWeight: 800, cursor: busy ? 'wait' : 'pointer'
                        }}
                    >
                        <Eye size={18} />
                        {busy === 'parse' ? '집계 중…' : '미리보기 생성'}
                    </button>
                    {[
                        { id: 'career-detail', label: '진로 상세 Word', enabled: hasCareer },
                        { id: 'career-receipt', label: '진로 영수증 Word', enabled: hasCareer },
                        { id: 'employment-detail', label: '취업 상세 Word', enabled: hasEmployment },
                        { id: 'employment-receipt', label: '취업 영수증 Word', enabled: hasEmployment }
                    ].map((action) => (
                        <button
                            key={action.id}
                            type="button"
                            disabled={!action.enabled || Boolean(busy)}
                            onClick={() => handleDownload(action.id)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: '#fff', color: '#334155', border: '1px solid #cbd5e1',
                                borderRadius: 12, padding: '11px 14px', fontWeight: 700,
                                cursor: action.enabled ? 'pointer' : 'not-allowed'
                            }}
                        >
                            <Download size={16} />
                            {busy === action.id ? '저장 중…' : action.label}
                        </button>
                    ))}
                </div>

                {error && (
                    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#FEF2F2', color: '#B91C1C', fontWeight: 600 }}>
                        {error}
                    </div>
                )}

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginBottom: 18
                }}
                >
                    {summary.map((card) => (
                        <div key={card.label} style={{ background: '#F9FAFB', borderTop: '4px solid #00462A', borderRadius: 12, padding: 16 }}>
                            <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{card.label}</div>
                            <div style={{ color: '#00462A', fontWeight: 800, fontSize: 22 }}>{card.value}</div>
                        </div>
                    ))}
                </div>

                <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 16px',
                        borderBottom: '1px solid #f1f5f9', justifyContent: 'space-between', alignItems: 'center'
                    }}
                    >
                        <div style={{ fontWeight: 800 }}>미리보기</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[
                                { id: 'career-detail', label: '진로 상세내역' },
                                { id: 'career-receipt', label: '진로 영수증' },
                                { id: 'employment-detail', label: '취업 상세내역' },
                                { id: 'employment-receipt', label: '취업 영수증' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setPreviewMode(tab.id)}
                                    style={{
                                        padding: '8px 12px',
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

                    {previewMode.startsWith('career') && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                기간 {careerModel.periodLabel || '-'} · 상담사 마스터 {masters.length}명
                            </div>
                            <BlockPreview title="[진로개발 컨설팅]" blocks={careerModel.interviewBlocks} />
                        </>
                    )}
                    {previewMode.startsWith('employment') && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                기간 {employmentModel.periodLabel || '-'} · 상담사 마스터 {masters.length}명
                            </div>
                            <BlockPreview title="[서류면접 컨설팅]" blocks={employmentModel.interviewBlocks} />
                            <BlockPreview title="[서면첨삭 · 국문]" blocks={employmentModel.correctionBlocks.korean} />
                            <BlockPreview title="[서면첨삭 · 영문]" blocks={employmentModel.correctionBlocks.english} />
                        </>
                    )}
                </section>
            </div>
        </>
    );
}
