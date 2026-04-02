/**
 * 예산 산정: 세션 유형 → 진로/취업 하위 그룹 분류
 * 공통코드 code·이름(시드·더미·Firestore) 모두 고려
 */

/** 코드 관리에 없음. 회원 강사료에서만 쓰는 구분값 — 특정 유형으로 등록되지 않은 일정에 적용 */
export const CONSULTING_FEE_ALL_TYPES_CODE = '__ALL_TYPES__';

export const BUCKET_IDS = {
    CAREER_DEV: 'career_dev',
    WELCOME: 'welcome',
    CAREER_LINK: 'career_link',
    EMP_DOC: 'emp_doc',
    EMP_SCI: 'emp_sci',
    EMP_PUB: 'emp_pub',
    EMP_GLO: 'emp_glo',
    EMP_CON: 'emp_con',
    UNMAPPED: 'unmapped'
};

/**
 * @param {string} typeCode
 * @param {string} typeName 이미 풀린 한글명 권장
 */
export function resolveBudgetBucket(typeCode, typeName) {
    const c = (typeCode || '').trim();
    const nameRaw = (typeName || '').trim();
    const compact = nameRaw.replace(/\s/g, '');

    const sciCodes = new Set(['SCI', 'C06']);
    const pubCodes = new Set(['PUB', 'C01']);
    const gloCodes = new Set(['GLO', 'C05']);
    const conCodes = new Set(['CON', 'C03']);

    if (sciCodes.has(c) || nameRaw.includes('이공계')) {
        return BUCKET_IDS.EMP_SCI;
    }
    if (pubCodes.has(c) || nameRaw.includes('공기업')) {
        return BUCKET_IDS.EMP_PUB;
    }
    if (gloCodes.has(c) || nameRaw.includes('외국계')) {
        return BUCKET_IDS.EMP_GLO;
    }
    if (conCodes.has(c) || compact.includes('콘텐츠') || compact.includes('엔터')) {
        return BUCKET_IDS.EMP_CON;
    }

    const docCodes = new Set(['RES', 'C02']);
    if (docCodes.has(c) || (nameRaw.includes('서류') && nameRaw.includes('면접'))) {
        return BUCKET_IDS.EMP_DOC;
    }

    if (c === 'WELCOME' || nameRaw.includes('웰컴')) {
        return BUCKET_IDS.WELCOME;
    }
    if (nameRaw.includes('진로연계')) {
        return BUCKET_IDS.CAREER_LINK;
    }

    const devCodes = new Set(['EDU', 'C08', 'C04']);
    if (devCodes.has(c) || nameRaw.includes('진로개발') || nameRaw.includes('진로취업')) {
        return BUCKET_IDS.CAREER_DEV;
    }

    return BUCKET_IDS.UNMAPPED;
}

export function isScheduleBillable(schedule) {
    if (!schedule || !schedule.date) return false;
    if (schedule.isCancelled) return false;
    if (schedule.status === '취소') return false;
    return true;
}

/**
 * 달력 화면과 동일한 기준으로 일정 중복을 제거합니다.
 * - 같은 슬롯(일시+담당)에 여러 행이 있으면 updatedAt -> createdAt 기준 최신 1건만 유지
 * - 타임스탬프가 동일하면 취소 상태를 우선 반영
 */
export function dedupeSchedulesLikeCalendar(schedules) {
    const slotKey = (s) => {
        const dateKey = s?.date ? String(s.date).slice(0, 16) : '';
        const consultantKey = (s?.consultantId || s?.consultantName || '').toString().trim();
        return `${dateKey}_${consultantKey}`;
    };
    const isCancelled = (s) => s?.isCancelled === true || s?.status === '취소';
    const ts = (s) => new Date(s?.updatedAt || s?.createdAt || 0).getTime() || 0;

    const uniqueMap = new Map();
    (schedules || []).forEach((s) => {
        if (!s) return;
        const key = slotKey(s) || s.id;
        if (!key) return;

        const prev = uniqueMap.get(key);
        if (!prev) {
            uniqueMap.set(key, s);
            return;
        }

        const tPrev = ts(prev);
        const tCurr = ts(s);
        if (tCurr > tPrev) {
            uniqueMap.set(key, s);
        } else if (tCurr === tPrev) {
            if (isCancelled(s) && !isCancelled(prev)) uniqueMap.set(key, s);
        }
    });

    return Array.from(uniqueMap.values());
}

function scheduleTimestamp(schedule) {
    const d = new Date(schedule.date);
    return d.getTime();
}

export function scheduleInRange(schedule, rangeStart, rangeEnd) {
    const t = scheduleTimestamp(schedule);
    if (Number.isNaN(t)) return false;
    return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
}

export function findUserByConsultantId(users, consultantId) {
    if (!consultantId || !users?.length) return null;
    const id = String(consultantId).trim();
    return (
        users.find(u => u.uid === id || u.userId === id || u.id === id) || null
    );
}

/** @returns {Map<string, number>} typeCode -> amount */
export function parseConsultingFeesByTypeMap(user) {
    const map = new Map();
    const raw = user?.consultingFeesByType;
    if (Array.isArray(raw)) {
        for (const row of raw) {
            const c = (row?.typeCode || '').trim();
            if (!c) continue;
            const n =
                typeof row.amount === 'number'
                    ? row.amount
                    : parseInt(String(row.amount ?? '').replace(/,/g, ''), 10);
            if (Number.isFinite(n) && n >= 0) {
                map.set(c, n);
            }
        }
    }
    return map;
}

/**
 * 일정의 typeCode에 대응하는 강사료.
 * 1) 해당 typeCode로 등록된 단가
 * 2) 「모든유형」(CONSULTING_FEE_ALL_TYPES_CODE) 단가 — 특정 유형 제외 나머지
 * 3) 구 단일 필드 consultingFeePerSession
 */
export function getConsultantFeeForType(user, typeCode) {
    if (!user || user.role !== 'consultant') return 0;
    const c = (typeCode || '').trim();
    const map = parseConsultingFeesByTypeMap(user);
    if (c && map.has(c)) {
        return map.get(c);
    }
    if (map.has(CONSULTING_FEE_ALL_TYPES_CODE)) {
        return map.get(CONSULTING_FEE_ALL_TYPES_CODE);
    }
    const legacy = user.consultingFeePerSession;
    const n =
        typeof legacy === 'number'
            ? legacy
            : parseInt(String(legacy ?? '').replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n >= 0) {
        return n;
    }
    return 0;
}

/**
 * @param {object[]} schedules
 * @param {object[]} users
 * @param {object[]} codes common_codes
 * @param {{ start: Date, end: Date }} range
 * @returns {Record<string, Record<string, { count: number, subtotal: number, minFee: number, maxFee: number }>>}
 */
export function aggregateBudgetByBucket(schedules, users, codes, range) {
    const codeMap = new Map((codes || []).map(x => [x.code, x]));
    const dedupedSchedules = dedupeSchedulesLikeCalendar(schedules);

    const stats = {};
    Object.values(BUCKET_IDS).forEach(k => {
        stats[k] = {};
    });

    for (const s of dedupedSchedules) {
        if (!isScheduleBillable(s)) continue;
        if (!scheduleInRange(s, range.start, range.end)) continue;

        // 달력과 동일하게 typeCode -> 공통코드명 기준으로만 분류한다.
        // (원본 schedule.typeName 문자열 직접 매칭은 과집계를 유발할 수 있음)
        const resolvedTypeName = s.typeCode ? (codeMap.get(s.typeCode)?.name || '') : '';
        const bucket = resolveBudgetBucket(s.typeCode, resolvedTypeName);
        const cid = (s.consultantId || '').trim();
        if (!cid) continue;

        const u = findUserByConsultantId(users, cid);
        const fee = getConsultantFeeForType(u, s.typeCode);

        if (!stats[bucket][cid]) {
            stats[bucket][cid] = {
                count: 0,
                subtotal: 0,
                minFee: null,
                maxFee: null
            };
        }
        const st = stats[bucket][cid];
        st.count += 1;
        st.subtotal += fee;
        st.minFee = st.minFee == null ? fee : Math.min(st.minFee, fee);
        st.maxFee = st.maxFee == null ? fee : Math.max(st.maxFee, fee);
    }

    return stats;
}

/**
 * @returns {{ consultantId, name, count, feePerSession: number, feePerSessionMixed: boolean, subtotal }[]}
 */
export function bucketToRows(countsForBucket, users) {
    const entries = Object.entries(countsForBucket || {}).filter(([, st]) => st && st.count > 0);
    entries.sort((a, b) => b[1].count - a[1].count);

    return entries.map(([consultantId, st]) => {
        const u = findUserByConsultantId(users, consultantId);
        const name = u?.name || u?.userId || consultantId;
        const sameRate = st.minFee === st.maxFee;
        return {
            consultantId,
            name,
            count: st.count,
            feePerSession: sameRate ? st.minFee : 0,
            feePerSessionMixed: !sameRate,
            subtotal: st.subtotal
        };
    });
}

export function sumRows(rows) {
    return (rows || []).reduce((a, r) => a + (r.subtotal || 0), 0);
}
