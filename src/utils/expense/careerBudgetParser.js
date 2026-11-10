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
    normalizeName
} from './excelCommon.js';
import { indexConsultantMasters } from './consultantMaster.js';

const ATTENDANCE_ALIASES = {
    no: ['no', '번호', '연번'],
    consultant: ['상담사', '강사', '컨설턴트', '컨설턴트명'],
    datetime: ['컨설팅일자', '상담일시', '일시', '일자', '날짜'],
    category: ['상담분류', '분류', '구분', '유형'],
    student: ['이름', '학생', '학생명', '성명'],
    university: ['대학'],
    major: ['학과'],
    grade: ['학년'],
    studentId: ['학번']
};

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
        // Stop when we likely reached a payment summary section.
        const first = cellText(row[0]);
        if (/^(합계|지급|단가|1세션)/.test(first) && !consultant) break;

        const parsed = parseDateTime(rawDate, yearMonth);
        if (!consultant || !parsed?.dayKey) continue;
        const time = parsed.time || extractTime(cellText(rawDate));
        sessions.push({
            consultant,
            displayName: consultant,
            dayKey: parsed.dayKey,
            time,
            category: cellText(row[header.indexes.category]),
            student: cellText(row[header.indexes.student]),
            studentId: cellText(row[header.indexes.studentId])
        });
    }
    return sessions;
}

/**
 * 진로출석부 엑셀 → interviewBlocks 모델
 */
export function parseCareerBudgetWorkbook(buffer, masters = []) {
    const workbook = readWorkbook(buffer);
    const mastersByName = indexConsultantMasters(masters);
    const allSessions = [];
    let yearMonth = null;
    let paymentRates = new Map();

    for (const sheetName of workbook.SheetNames) {
        const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
        if (!matrix.length) continue;
        yearMonth ||= estimateYearMonth(matrix);
        const sheetPayments = parsePaymentRates(matrix);
        for (const [key, value] of sheetPayments) paymentRates.set(key, value);
        allSessions.push(...parseAttendanceSessions(matrix, yearMonth));
    }

    const interviewBlocks = buildConsultantBlocks(allSessions, paymentRates, mastersByName, {
        kind: 'interview',
        remark: '진로개발'
    });

    return {
        kind: 'career',
        yearMonth: yearMonth?.label || '',
        periodLabel: yearMonth?.label || '',
        interviewBlocks,
        correctionBlocks: { korean: [], english: [] },
        sessionCount: interviewBlocks.reduce((sum, block) => sum + block.sessionCount, 0),
        totalAmount: interviewBlocks.reduce((sum, block) => sum + block.amount, 0)
    };
}

export function emptyCareerModel(periodLabel = '') {
    return {
        kind: 'career',
        yearMonth: periodLabel,
        periodLabel,
        interviewBlocks: [],
        correctionBlocks: { korean: [], english: [] },
        sessionCount: 0,
        totalAmount: 0
    };
}

export function mergeCareerModels(models) {
    const map = new Map();
    let periodLabel = '';
    for (const model of models) {
        periodLabel = periodLabel || model.periodLabel;
        for (const block of model.interviewBlocks || []) {
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
                if (!existing) {
                    target.days.push({ ...day, times: [...day.times] });
                } else {
                    existing.count += day.count;
                    existing.times = [...new Set([...existing.times, ...day.times])].sort();
                }
            }
        }
    }
    const interviewBlocks = Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
    return {
        kind: 'career',
        yearMonth: periodLabel,
        periodLabel,
        interviewBlocks,
        correctionBlocks: { korean: [], english: [] },
        sessionCount: interviewBlocks.reduce((sum, block) => sum + block.sessionCount, 0),
        totalAmount: interviewBlocks.reduce((sum, block) => sum + block.amount, 0)
    };
}
