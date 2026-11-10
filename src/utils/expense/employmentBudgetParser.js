import {
    readWorkbook,
    sheetToMatrix,
    estimateYearMonth,
    parseDateTime,
    extractTime,
    findHeaderRow,
    parsePaymentRates,
    buildConsultantBlocks,
    cellText,
    normalizeName,
    compact
} from './excelCommon.js';
import { indexConsultantMasters } from './consultantMaster.js';

const ATTENDANCE_ALIASES = {
    no: ['no', '번호', '연번'],
    consultant: ['상담사', '강사', '컨설턴트', '컨설턴트명'],
    datetime: ['컨설팅일자', '상담일시', '일시', '일자', '날짜', '일자열'],
    category: ['상담분류', '분류', '구분', '유형']
};

function sheetKind(sheetName, matrix) {
    const hint = `${sheetName} ${cellText(matrix?.[0]?.[0])} ${cellText(matrix?.[1]?.[0])}`.toLowerCase();
    const compactHint = compact(hint);
    if (/서면첨삭|첨삭/.test(compactHint)) {
        if (/영문|english|eng/.test(compactHint)) return 'correctionEnglish';
        if (/국문|korean|kor/.test(compactHint)) return 'correctionKorean';
        return 'correctionKorean';
    }
    if (/서류면접|면접|서류/.test(compactHint)) return 'interview';
    // default employment attendance sheet → interview
    return 'interview';
}

function parseAttendanceSessions(matrix, yearMonth) {
    const header = findHeaderRow(matrix, ATTENDANCE_ALIASES, 2);
    if (!header || header.indexes.consultant == null || header.indexes.datetime == null) {
        return [];
    }
    const sessions = [];
    for (let i = header.rowIndex + 1; i < matrix.length; i += 1) {
        const row = matrix[i] || [];
        const consultant = cellText(row[header.indexes.consultant]);
        const rawDate = row[header.indexes.datetime];
        if (!consultant && (rawDate == null || rawDate === '')) continue;
        const first = cellText(row[0]);
        if (/^(합계|지급|단가|1세션)/.test(first) && !consultant) break;
        const parsed = parseDateTime(rawDate, yearMonth);
        if (!consultant || !parsed?.dayKey) continue;
        sessions.push({
            consultant,
            displayName: consultant,
            dayKey: parsed.dayKey,
            time: parsed.time || extractTime(cellText(rawDate)),
            category: cellText(row[header.indexes.category])
        });
    }
    return sessions;
}

/**
 * 취업출석부 엑셀 → interviewBlocks + correctionBlocks
 */
export function parseEmploymentBudgetWorkbook(buffer, masters = []) {
    const workbook = readWorkbook(buffer);
    const mastersByName = indexConsultantMasters(masters);
    let yearMonth = null;

    const buckets = {
        interview: { sessions: [], payments: new Map() },
        correctionKorean: { sessions: [], payments: new Map() },
        correctionEnglish: { sessions: [], payments: new Map() }
    };

    for (const sheetName of workbook.SheetNames) {
        const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
        if (!matrix.length) continue;
        yearMonth ||= estimateYearMonth(matrix);
        const kind = sheetKind(sheetName, matrix);
        const payments = parsePaymentRates(matrix);
        for (const [key, value] of payments) buckets[kind].payments.set(key, value);
        buckets[kind].sessions.push(...parseAttendanceSessions(matrix, yearMonth));
    }

    const interviewBlocks = buildConsultantBlocks(
        buckets.interview.sessions,
        buckets.interview.payments,
        mastersByName,
        { kind: 'interview', remark: '서류면접' }
    );
    const correctionKorean = buildConsultantBlocks(
        buckets.correctionKorean.sessions,
        buckets.correctionKorean.payments,
        mastersByName,
        { kind: 'correctionKorean', remark: '서면첨삭·국문' }
    );
    const correctionEnglish = buildConsultantBlocks(
        buckets.correctionEnglish.sessions,
        buckets.correctionEnglish.payments,
        mastersByName,
        { kind: 'correctionEnglish', remark: '서면첨삭·영문' }
    );

    const all = [...interviewBlocks, ...correctionKorean, ...correctionEnglish];
    return {
        kind: 'employment',
        yearMonth: yearMonth?.label || '',
        periodLabel: yearMonth?.label || '',
        interviewBlocks,
        correctionBlocks: {
            korean: correctionKorean,
            english: correctionEnglish
        },
        sessionCount: all.reduce((sum, block) => sum + block.sessionCount, 0),
        totalAmount: all.reduce((sum, block) => sum + block.amount, 0)
    };
}

export function emptyEmploymentModel(periodLabel = '') {
    return {
        kind: 'employment',
        yearMonth: periodLabel,
        periodLabel,
        interviewBlocks: [],
        correctionBlocks: { korean: [], english: [] },
        sessionCount: 0,
        totalAmount: 0
    };
}

function mergeBlockLists(lists) {
    const map = new Map();
    for (const list of lists) {
        for (const block of list || []) {
            const key = normalizeName(block.consultant || block.displayName);
            if (!map.has(key)) {
                map.set(key, {
                    ...block,
                    days: block.days.map((day) => ({ ...day, times: [...day.times] }))
                });
                continue;
            }
            const target = map.get(key);
            target.sessionCount += block.sessionCount;
            target.amount += block.amount;
            if (!target.rate && block.rate) target.rate = block.rate;
            for (const day of block.days) {
                const existing = target.days.find((item) => item.dayKey === day.dayKey);
                if (!existing) target.days.push({ ...day, times: [...day.times] });
                else {
                    existing.count += day.count;
                    existing.times = [...new Set([...existing.times, ...day.times])].sort();
                }
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
}

export function mergeEmploymentModels(models) {
    const interviewBlocks = mergeBlockLists(models.map((model) => model.interviewBlocks));
    const korean = mergeBlockLists(models.map((model) => model.correctionBlocks?.korean));
    const english = mergeBlockLists(models.map((model) => model.correctionBlocks?.english));
    const periodLabel = models.find((model) => model.periodLabel)?.periodLabel || '';
    const all = [...interviewBlocks, ...korean, ...english];
    return {
        kind: 'employment',
        yearMonth: periodLabel,
        periodLabel,
        interviewBlocks,
        correctionBlocks: { korean, english },
        sessionCount: all.reduce((sum, block) => sum + block.sessionCount, 0),
        totalAmount: all.reduce((sum, block) => sum + block.amount, 0)
    };
}
