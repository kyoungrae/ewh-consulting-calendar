/**
 * UI 행 → 서버 저장용 배열 (검증은 호출 측)
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
