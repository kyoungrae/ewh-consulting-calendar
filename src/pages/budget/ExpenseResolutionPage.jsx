import { useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Download, Eye, FileSpreadsheet, Upload } from 'lucide-react';
import { parseCareerBudgetWorkbook, emptyCareerModel } from '../../utils/expense/careerBudgetParser.js';
import { parseEmploymentBudgetWorkbook, emptyEmploymentModel } from '../../utils/expense/employmentBudgetParser.js';
import {
    toConsultantMaster,
    indexConsultantMasters,
    instructorSortName,
    compareInstructorNames,
    findConsultantProfile,
    formatBankAccount
} from '../../utils/expense/consultantMaster.js';
import { downloadCareerExpenseDoc } from '../../utils/expense/careerExpenseDoc.js';
import { downloadEmploymentExpenseDoc } from '../../utils/expense/employmentExpenseDoc.js';
import { downloadCareerReceiptDoc } from '../../utils/expense/careerReceiptDoc.js';
import {
    downloadEmploymentReceiptDoc,
    blocksToItems as employmentReceiptBlocksToItems
} from '../../utils/expense/employmentReceiptDoc.js';
import { dayLines, moneyLine, formatBirthDate } from '../../utils/expense/docCommon.js';
import { formatCurrency } from '../../utils/expenseFormat.js';
import ewhaLogo from '../../assets/ewha-career-logo.png';

const PREVIEW_TABS = [
    { id: 'career-detail', label: '진로 상세내역', downloadLabel: '상세내역 Word 다운로드', kind: 'career' },
    { id: 'career-receipt', label: '진로 영수증', downloadLabel: '영수증 Word 다운로드', kind: 'career' },
    { id: 'employment-detail', label: '취업 상세내역', downloadLabel: '상세내역 Word 다운로드', kind: 'employment' },
    { id: 'employment-receipt', label: '취업 영수증', downloadLabel: '영수증 Word 다운로드', kind: 'employment' }
];

function readFileBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

function sortBlocks(blocks, mastersByName) {
    return [...(blocks || [])].sort((a, b) => compareInstructorNames(
        instructorSortName(mastersByName, a.displayName, a.consultant),
        instructorSortName(mastersByName, b.displayName, b.consultant)
    ));
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
                                회원정보 없음
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

function receiptLabel(text) {
    return text.split('\n').map((line) => (
        <div key={line}>{line}</div>
    ));
}

function ReceiptPage({ item, programLabel, pageIndex, totalPages }) {
    const bank = formatBankAccount(item.profile?.bankAccount);
    const unique = item.profile?.uniqueNumber ? ` (${item.profile.uniqueNumber})` : '';
    const nameLine = `${item.name}${unique}`;
    const rows = [
        { label: '내       용', value: item.content },
        { label: '지  급  액', value: item.paymentLine },
        { label: '강 의 일 시', value: (item.scheduleLines || []).length ? item.scheduleLines : ['-'] },
        { label: '장       소', value: item.place || '-' },
        { label: '성       명\n(고유번호)', value: nameLine },
        { label: '생년월일', value: item.birthDate || '-' },
        { label: '핸드폰번호', value: item.tel || '-' },
        { label: '소속 및 주소', value: item.affiliationAddress || '-' },
        {
            label: '통 장 번 호',
            value: [
                `은 행 명: ${bank.bank}`,
                `계좌번호: ${bank.account}`,
                `예 금 주: ${bank.holder}`
            ]
        }
    ];

    return (
        <article
            style={{
                position: 'relative',
                background: '#fff',
                border: '1px solid #cbd5e1',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
                padding: '48px 40px',
                maxWidth: 720,
                margin: '0 auto',
                minHeight: 920,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
            }}
        >
            <div style={{
                position: 'absolute',
                top: 14,
                right: 18,
                color: '#94a3b8',
                fontSize: 12
            }}
            >
                {pageIndex + 1} / {totalPages}장
            </div>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{programLabel}</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginTop: 4 }}>강사비 지급내역</div>
            </div>
            {!item.profile ? (
                <div style={{
                    marginBottom: 12,
                    padding: '8px 10px',
                    background: '#FFFBEB',
                    color: '#B45309',
                    fontSize: 13,
                    fontWeight: 700
                }}
                >
                    회원관리에 해당 강사 정보가 없습니다. 성명·계좌 등을 등록해 주세요.
                </div>
            ) : null}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '72%' }} />
                </colgroup>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <th
                                style={{
                                    border: '1px solid #111827',
                                    background: '#F3F4F6',
                                    padding: '10px 8px',
                                    fontWeight: 800,
                                    fontSize: 12,
                                    color: '#111827',
                                    textAlign: 'center',
                                    verticalAlign: 'middle',
                                    whiteSpace: 'pre-line',
                                    lineHeight: 1.35,
                                    minHeight: 36
                                }}
                            >
                                {receiptLabel(row.label)}
                            </th>
                            <td
                                style={{
                                    border: '1px solid #111827',
                                    padding: '10px 12px',
                                    fontSize: 12,
                                    color: '#111827',
                                    verticalAlign: 'middle',
                                    lineHeight: 1.55,
                                    wordBreak: 'keep-all',
                                    minHeight: 36
                                }}
                            >
                                {Array.isArray(row.value)
                                    ? row.value.map((line) => <div key={line}>{line}</div>)
                                    : row.value}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div style={{
                paddingTop: 28,
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}
            >
                <img
                    src={ewhaLogo}
                    alt="이화여자대학교 인재개발원"
                    style={{
                        width: 280,
                        maxWidth: '80%',
                        height: 'auto',
                        display: 'block',
                        margin: '0 auto'
                    }}
                />
            </div>
        </article>
    );
}

function ReceiptPreview({ items, programLabel }) {
    if (!items.length) {
        return (
            <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                영수증으로 만들 세션이 없습니다.
            </div>
        );
    }
    return (
        <div style={{ background: '#EEF2F7', padding: '20px 16px 28px', display: 'grid', gap: 28 }}>
            {items.map((item, index) => (
                <ReceiptPage
                    key={`${item.content}-${item.consultantKey}-${index}`}
                    item={item}
                    programLabel={programLabel}
                    pageIndex={index}
                    totalPages={items.length}
                />
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

    const mastersByName = useMemo(() => indexConsultantMasters(masters), [masters]);
    const activeTab = PREVIEW_TABS.find((tab) => tab.id === previewMode) || PREVIEW_TABS[0];
    const canDownload = activeTab.kind === 'career'
        ? careerModel.sessionCount > 0
        : employmentModel.sessionCount > 0;

    const summary = useMemo(() => ([
        { label: '진로 세션', value: careerModel.sessionCount },
        { label: '진로 지급액', value: `₩${formatCurrency(careerModel.totalAmount)}` },
        { label: '취업 세션', value: employmentModel.sessionCount },
        { label: '취업 지급액', value: `₩${formatCurrency(employmentModel.totalAmount)}` }
    ]), [careerModel, employmentModel]);

    const careerBlocks = useMemo(
        () => sortBlocks(careerModel.interviewBlocks, mastersByName),
        [careerModel.interviewBlocks, mastersByName]
    );
    const employmentInterview = useMemo(
        () => sortBlocks(employmentModel.interviewBlocks, mastersByName),
        [employmentModel.interviewBlocks, mastersByName]
    );
    const employmentKorean = useMemo(
        () => sortBlocks(employmentModel.correctionBlocks?.korean, mastersByName),
        [employmentModel.correctionBlocks, mastersByName]
    );
    const employmentEnglish = useMemo(
        () => sortBlocks(employmentModel.correctionBlocks?.english, mastersByName),
        [employmentModel.correctionBlocks, mastersByName]
    );

    const careerReceiptItems = useMemo(() => careerBlocks.map((block) => {
        const profile = findConsultantProfile(mastersByName, block.displayName)
            || findConsultantProfile(mastersByName, block.consultant);
        return {
            content: '진로컨설팅(진로개발)',
            paymentLine: moneyLine(block.sessionCount, block.rate, block.amount, { spaced: true }),
            scheduleLines: dayLines(block.days),
            consultantKey: block.consultant,
            name: profile?.name || block.displayName,
            profile,
            place: profile?.placeInterview || profile?.place || '온라인 ZOOM',
            birthDate: formatBirthDate(profile?.birthDate),
            tel: profile?.tel || '-',
            affiliationAddress: [profile?.affiliation, profile?.address].filter(Boolean).join(' / ') || '-'
        };
    }), [careerBlocks, mastersByName]);

    const employmentReceiptItems = useMemo(() => (
        employmentReceiptBlocksToItems(employmentModel, mastersByName).map((item) => {
            const profile = findConsultantProfile(mastersByName, item.displayName)
                || findConsultantProfile(mastersByName, item.consultantKey);
            return {
                content: item.content,
                paymentLine: item.paymentLine,
                scheduleLines: item.scheduleLines,
                consultantKey: item.consultantKey,
                name: profile?.name || item.displayName,
                profile,
                place: item.placeKey === 'correction'
                    ? (profile?.placeCorrection || profile?.place || '온라인 접수')
                    : (profile?.placeInterview || profile?.place || '온라인 ZOOM'),
                birthDate: formatBirthDate(profile?.birthDate),
                tel: profile?.tel || '-',
                affiliationAddress: [profile?.affiliation, profile?.address].filter(Boolean).join(' / ') || '-'
            };
        })
    ), [employmentModel, mastersByName]);

    const handleParse = useCallback(async () => {
        if (!careerFile && !employmentFile) {
            setError('진로출석부 또는 취업출석부 엑셀을 선택해 주세요.');
            return;
        }
        setBusy('parse');
        setError('');
        try {
            const rawUsers = await api('/users');
            const nextMasters = (Array.isArray(rawUsers) ? rawUsers : [])
                .filter((user) => user.role === 'consultant')
                .map((user) => toConsultantMaster(user));
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

    const handleDownload = async () => {
        if (!canDownload) {
            setError('먼저 출석부를 업로드하고 미리보기를 생성해 주세요.');
            return;
        }
        setBusy('download');
        setError('');
        try {
            const options = { programName: programName.trim() || '혁신' };
            if (previewMode === 'career-detail') await downloadCareerExpenseDoc(careerModel, options);
            if (previewMode === 'career-receipt') await downloadCareerReceiptDoc(careerModel, masters, options);
            if (previewMode === 'employment-detail') await downloadEmploymentExpenseDoc(employmentModel, options);
            if (previewMode === 'employment-receipt') await downloadEmploymentReceiptDoc(employmentModel, masters, options);
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
                        출석부 엑셀에서 지급액·강의일시를 만들고, 장소·성명·생년월일·핸드폰·소속·주소·통장은 회원관리 정보로 채웁니다.
                        영수증은 강사 가나다순이며, 미리보기 탭에서 바로 Word를 내려받습니다.
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
                    {uploadCard('취업출석부', '취업 전용 엑셀 (.xlsx) — 서버 미업로드', employmentFile, setEmploymentFile)}
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
                        display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 16px',
                        borderBottom: '1px solid #f1f5f9', justifyContent: 'space-between', alignItems: 'center'
                    }}
                    >
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ fontWeight: 800, marginRight: 4 }}>미리보기</div>
                            {PREVIEW_TABS.map((tab) => (
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
                        <button
                            type="button"
                            disabled={!canDownload || Boolean(busy)}
                            onClick={handleDownload}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: canDownload ? '#00462A' : '#e2e8f0',
                                color: canDownload ? '#fff' : '#94a3b8',
                                border: 'none',
                                borderRadius: 12,
                                padding: '10px 14px',
                                fontWeight: 800,
                                cursor: canDownload ? 'pointer' : 'not-allowed'
                            }}
                        >
                            <Download size={16} />
                            {busy === 'download' ? '저장 중…' : activeTab.downloadLabel}
                        </button>
                    </div>

                    {previewMode === 'career-detail' && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                기간 {careerModel.periodLabel || '-'} · 회원관리 상담사 {masters.length}명
                            </div>
                            <BlockPreview title="[진로개발 컨설팅]" blocks={careerBlocks} />
                        </>
                    )}
                    {previewMode === 'career-receipt' && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                한 사람당 1장 · 지급액·강의일시=출석부 · 인적/계좌=회원관리 · 가나다순
                            </div>
                            <ReceiptPreview items={careerReceiptItems} programLabel="[진로컨설팅]" />
                        </>
                    )}
                    {previewMode === 'employment-detail' && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                기간 {employmentModel.periodLabel || '-'} · 회원관리 상담사 {masters.length}명
                            </div>
                            <BlockPreview title="[서류면접 컨설팅]" blocks={employmentInterview} />
                            <BlockPreview title="[서면첨삭 · 국문]" blocks={employmentKorean} />
                            <BlockPreview title="[서면첨삭 · 영문]" blocks={employmentEnglish} />
                        </>
                    )}
                    {previewMode === 'employment-receipt' && (
                        <>
                            <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 13 }}>
                                한 사람당 1장 · 지급액·강의일시=출석부 · 인적/계좌=회원관리 · 가나다순
                            </div>
                            <ReceiptPreview items={employmentReceiptItems} programLabel="[취업컨설팅]" />
                        </>
                    )}
                </section>
            </div>
        </>
    );
}
