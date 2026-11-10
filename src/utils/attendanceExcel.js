import * as XLSX from 'xlsx';
import {
    resolveBudgetBucket,
    findUserByConsultantId,
    getConsultantFeeForType
} from './budgetAggregation.js';

const HEADER_ALIASES = {
    date: ['일자', '날짜', '일시', '상담일', '세션일', 'date'],
    time: ['시간', '시작시간', '상담시간', 'time'],
    consultant: ['컨설턴트명', '컨설턴트', '강사명', '강사', '상담사', '담당', 'consultant'],
    type: ['구분', '유형', '상담유형', '세션유형', '컨설팅구분', 'type'],
    method: ['방식', '대면여부', '진행방식', 'method'],
    student: ['학생명', '학생', '성명', '이름', '내담자', 'student'],
    studentId: ['학번', '학생번호', 'studentid', 'student_id'],
    cancel: ['취소여부', '취소', '상태', 'cancel', 'status'],
    amount: ['금액', '강사료', '지급액', '단가', 'amount', 'fee']
};

const SESSION_CELL_RE = /^(\d{1,2}:\d{2})\s+(.+?)\s*\(([^)]+)\)(.*)$/;

function normalizeHeader(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[_-]/g, '');
}

function compactName(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/T$/i, '');
}

function excelSerialToDate(serial) {
    if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
    const utc = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function formatDateValue(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (typeof value === 'number') {
        const d = excelSerialToDate(value);
        return d ? formatDateValue(d) : '';
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    if (/^\d{4}[./]\d{1,2}[./]\d{1,2}/.test(text)) {
        const [y, m, d] = text.split(/[./]/);
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return formatDateValue(parsed);
    return text;
}

function formatTimeValue(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    if (typeof value === 'number' && value > 0 && value < 1) {
        const minutes = Math.round(value * 24 * 60);
        return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
    return text;
}

function parseAmount(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function isCancelledValue(value) {
    const text = String(value ?? '').trim();
    if (!text || text === '-' || text === '정상' || text === 'N' || text === 'n') return false;
    return text.includes('취소') || text === 'Y' || text === 'y' || text === 'true';
}

function mapHeaderIndexes(headerRow) {
    const indexes = {};
    headerRow.forEach((cell, index) => {
        const normalized = normalizeHeader(cell);
        if (!normalized) return;
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
            if (indexes[field] != null) continue;
            if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
                indexes[field] = index;
            }
        }
    });
    return indexes;
}

function findHeaderRow(matrix) {
    for (let i = 0; i < Math.min(matrix.length, 30); i += 1) {
        const indexes = mapHeaderIndexes(matrix[i] || []);
        const hits = ['date', 'consultant', 'type', 'time', 'student'].filter((key) => indexes[key] != null).length;
        if (hits >= 2 && (indexes.date != null || indexes.consultant != null)) {
            return { rowIndex: i, indexes };
        }
    }
    return null;
}

function cell(row, index) {
    if (index == null || !row) return '';
    return row[index] ?? '';
}

function parseTabularSheet(matrix, source, fileName, sheetName) {
    const header = findHeaderRow(matrix);
    if (!header) return [];
    const { rowIndex, indexes } = header;
    const rows = [];
    for (let i = rowIndex + 1; i < matrix.length; i += 1) {
        const row = matrix[i] || [];
        if (!row.some((value) => String(value ?? '').trim() !== '')) continue;
        const date = formatDateValue(cell(row, indexes.date));
        const time = formatTimeValue(cell(row, indexes.time));
        const consultantName = String(cell(row, indexes.consultant) ?? '').trim();
        const typeName = String(cell(row, indexes.type) ?? '').trim();
        const studentName = String(cell(row, indexes.student) ?? '').trim();
        if (!date && !consultantName && !typeName && !studentName) continue;
        const amountFromFile = parseAmount(cell(row, indexes.amount));
        rows.push({
            source,
            fileName,
            sheetName,
            date,
            time,
            consultantName,
            typeName,
            method: String(cell(row, indexes.method) ?? '').trim(),
            studentName,
            studentId: String(cell(row, indexes.studentId) ?? '').trim(),
            cancelled: isCancelledValue(cell(row, indexes.cancel)),
            amountFromFile
        });
    }
    return rows;
}

function parseSessionCell(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const match = text.match(SESSION_CELL_RE);
    if (!match) return null;
    const [, time, typeName, consultantName, suffix] = match;
    return {
        time: formatTimeValue(time),
        typeName: typeName.trim(),
        consultantName: consultantName.replace(/_/g, ' ').replace(/\*대면|\*/g, '').trim(),
        method: /대면/.test(suffix) || /대면/.test(consultantName) ? '대면' : '',
        cancelled: false
    };
}

function parseCalendarGridSheet(matrix, source, fileName, sheetName) {
    if (!matrix.length) return [];
    const first = matrix[0]?.[0];
    const monthStart = first instanceof Date
        ? first
        : typeof first === 'number'
            ? excelSerialToDate(first)
            : /^\d{4}-\d{2}/.test(String(first || ''))
                ? new Date(String(first).slice(0, 10))
                : null;
    if (!monthStart || Number.isNaN(monthStart.getTime())) return [];
    if (!String(matrix[1]?.[0] || '').includes('요일') && !String(matrix[1]?.[0] || '').includes('월')) {
        // still allow if row 1 looks like weekday headers
        const weekdays = (matrix[1] || []).slice(0, 6).join('');
        if (!/월|화|수|목|금|토/.test(weekdays)) return [];
    }

    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const dayRow = matrix[2] || [];
    const dayColumns = [];
    for (let col = 0; col < 6; col += 1) {
        const dayNum = Number(dayRow[col]);
        if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
            dayColumns.push({ col, day: dayNum });
        }
    }
    if (!dayColumns.length) return [];

    const rows = [];
    for (let r = 3; r < matrix.length; r += 1) {
        const row = matrix[r] || [];
        for (const { col, day } of dayColumns) {
            const parsed = parseSessionCell(row[col]);
            if (!parsed) continue;
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            rows.push({
                source,
                fileName,
                sheetName,
                date,
                ...parsed,
                studentName: '',
                studentId: '',
                amountFromFile: null
            });
        }
    }
    return rows;
}

function sheetMatrix(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
}

/**
 * 진로/취업 출석부 엑셀을 세션 행으로 파싱합니다.
 * 1) 헤더형 표 (일자·강사·구분 등)
 * 2) 월간 캘린더형 그리드 (시간 유형(강사) 셀)
 */
export function parseAttendanceWorkbook(buffer, source, fileName = 'attendance.xlsx') {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sessions = [];
    for (const sheetName of workbook.SheetNames) {
        const matrix = sheetMatrix(workbook.Sheets[sheetName]);
        const tabular = parseTabularSheet(matrix, source, fileName, sheetName);
        if (tabular.length) {
            sessions.push(...tabular);
            continue;
        }
        sessions.push(...parseCalendarGridSheet(matrix, source, fileName, sheetName));
    }
    return sessions;
}

export function findConsultantUserByName(users, consultantName) {
    const target = compactName(consultantName);
    if (!target || !users?.length) return null;
    return (
        users.find((user) => compactName(user.name) === target)
        || users.find((user) => compactName(user.name).includes(target) || target.includes(compactName(user.name)))
        || null
    );
}

function resolveTypeCode(codes, typeName) {
    const compact = compactName(typeName);
    if (!compact) return '';
    const found = (codes || []).find((code) => compactName(code.name) === compact || compactName(code.name).includes(compact));
    return found?.code || '';
}

/**
 * 출석 세션에 회원 강사료·예산 버킷을 붙입니다.
 */
export function enrichAttendanceSessions(sessions, users, codes) {
    return (sessions || []).map((session) => {
        const user = findConsultantUserByName(users, session.consultantName)
            || findUserByConsultantId(users, session.consultantId);
        const typeCode = resolveTypeCode(codes, session.typeName);
        const bucket = resolveBudgetBucket(typeCode, session.typeName);
        const feeFromUser = getConsultantFeeForType(user, typeCode);
        const amount = session.amountFromFile != null ? session.amountFromFile : feeFromUser;
        return {
            ...session,
            consultantId: user?.uid || session.consultantId || '',
            typeCode,
            bucket,
            amount: Number.isFinite(amount) ? amount : 0,
            feeMatched: session.amountFromFile != null || feeFromUser > 0
        };
    });
}

export function filterBillableSessions(sessions) {
    return (sessions || []).filter((session) => !session.cancelled);
}

export function buildExpensePreview(sessions) {
    const billable = filterBillableSessions(sessions)
        .slice()
        .sort((a, b) => {
            const byDate = String(a.date).localeCompare(String(b.date));
            if (byDate) return byDate;
            const byTime = String(a.time).localeCompare(String(b.time));
            if (byTime) return byTime;
            return String(a.consultantName).localeCompare(String(b.consultantName), 'ko');
        });

    const detailRows = billable.map((session, index) => ({
        no: index + 1,
        sourceLabel: session.source === 'employment' ? '취업' : '진로',
        date: session.date,
        time: session.time,
        typeName: session.typeName || '-',
        consultantName: session.consultantName || '-',
        studentName: session.studentName || '',
        method: session.method || '',
        amount: session.amount || 0,
        feeMatched: session.feeMatched
    }));

    const byConsultant = new Map();
    for (const row of detailRows) {
        const key = row.consultantName;
        const prev = byConsultant.get(key) || {
            consultantName: key,
            careerCount: 0,
            employmentCount: 0,
            count: 0,
            amount: 0
        };
        if (row.sourceLabel === '취업') prev.employmentCount += 1;
        else prev.careerCount += 1;
        prev.count += 1;
        prev.amount += row.amount;
        byConsultant.set(key, prev);
    }

    const receiptRows = Array.from(byConsultant.values()).sort((a, b) =>
        a.consultantName.localeCompare(b.consultantName, 'ko')
    );

    return {
        detailRows,
        receiptRows,
        totals: {
            count: detailRows.length,
            amount: detailRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            careerCount: detailRows.filter((row) => row.sourceLabel === '진로').length,
            employmentCount: detailRows.filter((row) => row.sourceLabel === '취업').length,
            unmatchedFeeCount: detailRows.filter((row) => !row.feeMatched).length
        }
    };
}
