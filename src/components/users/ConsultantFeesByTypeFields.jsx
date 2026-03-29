import { Plus, Trash2 } from 'lucide-react';
import { CONSULTING_FEE_ALL_TYPES_CODE } from '../../utils/budgetAggregation';

function sortCodes(codes) {
    return [...(codes || [])].sort((a, b) => String(a.code).localeCompare(String(b.code), 'ko'));
}

/**
 * @param {{ typeCode: string, amount: string }[]} value
 * @param {function} onChange
 * @param {{ code: string, name: string }[]} codes common_codes
 * @param {boolean} disabled
 */
export default function ConsultantFeesByTypeFields({ value, onChange, codes, disabled = false }) {
    const sorted = sortCodes(codes);

    const addRow = () => {
        onChange([...value, { typeCode: '', amount: '' }]);
    };

    const removeRow = (index) => {
        onChange(value.filter((_, i) => i !== index));
    };

    const updateRow = (index, patch) => {
        onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const usedCodes = new Set(value.map((r) => r.typeCode).filter(Boolean));

    /* padding은 인라인으로만 지정 — 전역 * { padding:0 } 이 유틸 px/py를 먹는 경우 대비 */
    const controlCls =
        'box-border min-h-[48px] h-12 w-full max-w-full rounded-lg border border-gray-300 bg-white ' +
        'text-sm leading-snug text-gray-900 shadow-sm outline-none transition ' +
        'placeholder:text-gray-400 focus:border-[#00462A] focus:ring-2 focus:ring-[#00462A]/15 ' +
        'disabled:bg-gray-100 disabled:text-gray-500';

    const controlPadStyle = {
        boxSizing: 'border-box',
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 18,
        paddingRight: 18,
        minHeight: 48
    };

    return (
        <div className="space-y-5 overflow-visible">
            {!sorted.length ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    코드 관리에 유형이 없습니다. 아래에서 「모든유형」만 지정할 수 있으며, 유형을 추가한 후에는
                    코드별 단가도 함께 등록할 수 있습니다.
                </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-sm font-semibold text-gray-800 leading-snug">유형별 1회 강사료</span>
                <button
                    type="button"
                    onClick={addRow}
                    disabled={disabled}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-bold leading-snug text-[#00462A] bg-white border-2 border-solid border-[#00462A] hover:bg-[#ecfdf5] disabled:pointer-events-none disabled:opacity-40"
                    style={{
                        padding: '12px 24px',
                        minHeight: 48,
                        boxSizing: 'border-box'
                    }}
                >
                    <Plus size={18} strokeWidth={2.5} className="shrink-0" aria-hidden />
                    추가
                </button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed pb-1 border-b border-gray-100">
                <strong>모든유형</strong>: 해당 줄에서 지정한 금액은, 다른 줄에 <strong>별도 단가가 없는</strong> 유형
                일정에 적용됩니다. 예) 외국계만 25,000원, 모든유형 60,000원 → 외국계는 25,000원, 그 외 코드는
                60,000원. 같은 코드(모든유형 포함)는 한 줄만 지정할 수 있습니다.
            </p>

            {value.length === 0 ? (
                <p className="text-sm text-gray-400 pt-1">「추가」로 유형을 등록하세요.</p>
            ) : (
                <ul
                    className="m-0 list-none flex flex-col gap-6 p-0 pt-2"
                    style={{ listStyle: 'none' }}
                >
                    {value.map((row, index) => (
                        <li
                            key={index}
                            className="consultant-fee-row m-0 rounded-xl border border-gray-200 bg-white shadow-sm"
                            style={{
                                padding:
                                    'clamp(22px, 5vw, 32px) clamp(20px, 4vw, 36px)',
                                boxSizing: 'border-box',
                                listStyle: 'none'
                            }}
                        >
                            <div
                                className="m-0 grid grid-cols-1 sm:grid-cols-12 sm:items-end"
                                style={{
                                    gap: 'clamp(20px, 4vw, 32px)',
                                    rowGap: 24,
                                    columnGap: 'clamp(16px, 3vw, 28px)'
                                }}
                            >
                                <div
                                    className="m-0 flex min-w-0 flex-col sm:col-span-7"
                                    style={{ gap: 14 }}
                                >
                                    <label
                                        htmlFor={`consult-fee-type-${index}`}
                                        className="m-0 text-xs font-semibold uppercase tracking-wide text-gray-600 leading-normal"
                                        style={{ margin: 0, lineHeight: 1.4 }}
                                    >
                                        유형
                                    </label>
                                    <select
                                        id={`consult-fee-type-${index}`}
                                        className={controlCls}
                                        style={controlPadStyle}
                                        value={row.typeCode}
                                        disabled={disabled}
                                        onChange={(e) => updateRow(index, { typeCode: e.target.value })}
                                    >
                                        <option value="">선택</option>
                                        <option
                                            value={CONSULTING_FEE_ALL_TYPES_CODE}
                                            disabled={
                                                usedCodes.has(CONSULTING_FEE_ALL_TYPES_CODE) &&
                                                row.typeCode !== CONSULTING_FEE_ALL_TYPES_CODE
                                            }
                                            title="별도 단가가 없는 유형 일정에 적용"
                                        >
                                            모든유형 (별도 단가 없을 때)
                                            {usedCodes.has(CONSULTING_FEE_ALL_TYPES_CODE) &&
                                            row.typeCode !== CONSULTING_FEE_ALL_TYPES_CODE
                                                ? ' — 이미 지정됨'
                                                : ''}
                                        </option>
                                        {sorted.map((c) => {
                                            const taken = usedCodes.has(c.code) && c.code !== row.typeCode;
                                            return (
                                                <option key={c.code} value={c.code} disabled={taken}>
                                                    {c.code} — {c.name}
                                                    {taken ? ' (이미 지정됨)' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div
                                    className="m-0 flex min-w-0 flex-col sm:col-span-3"
                                    style={{ gap: 14 }}
                                >
                                    <label
                                        htmlFor={`consult-fee-amt-${index}`}
                                        className="m-0 text-xs font-semibold uppercase tracking-wide text-gray-600 leading-normal"
                                        style={{ margin: 0, lineHeight: 1.4 }}
                                    >
                                        강사료(원)
                                    </label>
                                    <input
                                        id={`consult-fee-amt-${index}`}
                                        type="number"
                                        className={controlCls}
                                        style={controlPadStyle}
                                        min={0}
                                        step={1}
                                        disabled={disabled}
                                        value={row.amount}
                                        onChange={(e) => updateRow(index, { amount: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="m-0 flex justify-end pt-3 pl-1 sm:col-span-2 sm:justify-end sm:self-end sm:pt-0 sm:pl-8">
                                    <button
                                        type="button"
                                        onClick={() => removeRow(index)}
                                        disabled={disabled}
                                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                        title="이 줄 삭제"
                                        aria-label="이 줄 삭제"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * UI 행 → Firestore 저장용 배열 (검증은 호출 측)
 * @param {{ typeCode: string, amount: string }[]} rows
 * @returns {{ typeCode: string, amount: number }[]}
 */
export function consultantFeeRowsToPayload(rows) {
    const out = [];
    const seen = new Set();
    for (const r of rows || []) {
        const code = (r.typeCode || '').trim();
        if (!code) continue;
        const n = parseInt(String(r.amount ?? '').replace(/,/g, ''), 10);
        if (!Number.isFinite(n) || n < 0) continue;
        if (seen.has(code)) continue;
        seen.add(code);
        out.push({ typeCode: code, amount: n });
    }
    return out;
}

export function payloadToConsultingFeeRows(user) {
    const raw = user?.consultingFeesByType;
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((r) => ({
            typeCode: (r.typeCode || '').trim(),
            amount: r.amount !== undefined && r.amount !== null ? String(r.amount) : ''
        }));
    }
    return [];
}

export function validateConsultingFeeRows(rows) {
    const effective = (rows || []).filter(
        (r) => (r.typeCode || '').trim() || String(r.amount ?? '').trim()
    );
    const codes = [];
    for (const r of effective) {
        const code = (r.typeCode || '').trim();
        if (!code) {
            return { ok: false, message: '유형을 모두 선택해 주세요.' };
        }
        codes.push(code);
        const n = parseInt(String(r.amount ?? '').replace(/,/g, ''), 10);
        if (!Number.isFinite(n) || n < 0) {
            return { ok: false, message: '강사료는 0 이상의 숫자로 입력해 주세요.' };
        }
    }
    const uniq = new Set(codes);
    if (uniq.size !== codes.length) {
        return { ok: false, message: '같은 유형이 중복되었습니다.' };
    }
    return { ok: true };
}
