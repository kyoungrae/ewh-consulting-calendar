import * as XLSX from 'xlsx';

export function readWorkbook(buffer) {
    return XLSX.read(buffer, { type: 'array', cellDates: true });
}

export function sheetToMatrix(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
}

export function compact(value) {
    return String(value ?? '').replace(/\s+/g, '').trim();
}

export function normalizeName(value) {
    return compact(value).replace(/강사$/u, '').replace(/T$/i, '');
}

export function cellText(value) {
    if (value == null) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        const hh = String(value.getHours()).padStart(2, '0');
        const mm = String(value.getMinutes()).padStart(2, '0');
        return value.getHours() || value.getMinutes()
            ? `${y}-${m}-${d} ${hh}:${mm}`
            : `${y}-${m}-${d}`;
    }
    return String(value).trim();
}

export function parseAmount(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const n = Number(String(value).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
}

export function estimateYearMonth(matrix) {
    const joined = (matrix || []).slice(0, 12).flat().map(cellText).join(' | ');
    const patterns = [
        /(\d{2})\.(\d{1,2})\b/,
        /(\d{4})\s*[./년]\s*(\d{1,2})/,
        /(\d{2})년\s*(\d{1,2})월/,
        /(\d{4})-(\d{2})/
    ];
    for (const re of patterns) {
        const match = joined.match(re);
        if (!match) continue;
        let year = Number(match[1]);
        const month = Number(match[2]);
        if (!month || month > 12) continue;
        if (year < 100) year += 2000;
        return {
            year,
            month,
            label: `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
        };
    }
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        label: `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, '0')}`
    };
}

export function parseDateTime(value, yearMonth) {
    const text = cellText(value);
    if (!text) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const dayKey = `${value.getMonth() + 1}/${value.getDate()}`;
        const time = (value.getHours() || value.getMinutes())
            ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
            : '';
        return { dayKey, time, date: value };
    }

    const full = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (full) {
        const [, y, m, d, hh, mm] = full;
        const dayKey = `${Number(m)}/${Number(d)}`;
        const time = hh != null ? `${String(hh).padStart(2, '0')}:${mm}` : '';
        return { dayKey, time, date: new Date(Number(y), Number(m) - 1, Number(d)) };
    }

    const md = text.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})(?:일)?(?:\s+(\d{1,2}):(\d{2}))?/);
    if (md) {
        const [, m, d, hh, mm] = md;
        const year = yearMonth?.year || new Date().getFullYear();
        const dayKey = `${Number(m)}/${Number(d)}`;
        const time = hh != null ? `${String(hh).padStart(2, '0')}:${mm}` : extractTime(text);
        return { dayKey, time, date: new Date(year, Number(m) - 1, Number(d)) };
    }

    const timeOnly = extractTime(text);
    if (timeOnly) return { dayKey: '', time: timeOnly, date: null };
    return null;
}

export function extractTime(text) {
    const match = String(text || '').match(/(\d{1,2}):(\d{2})/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function headerIndexMap(row, aliasGroups) {
    const indexes = {};
    (row || []).forEach((cell, index) => {
        const key = compact(cell).toLowerCase();
        if (!key) return;
        for (const [field, aliases] of Object.entries(aliasGroups)) {
            if (indexes[field] != null) continue;
            if (aliases.some((alias) => key === compact(alias).toLowerCase() || key.includes(compact(alias).toLowerCase()))) {
                indexes[field] = index;
            }
        }
    });
    return indexes;
}

export function findHeaderRow(matrix, aliasGroups, minHits = 2) {
    for (let i = 0; i < Math.min(matrix.length, 40); i += 1) {
        const indexes = headerIndexMap(matrix[i], aliasGroups);
        const hits = Object.keys(indexes).length;
        if (hits >= minHits) return { rowIndex: i, indexes };
    }
    return null;
}

function isRateHeader(value) {
    const key = compact(value);
    if (!key) return false;
    if (/지급액|총합|합계/.test(key)) return false;
    return /1세션당|건당첨삭비|세션당.*비|첨삭비|단가/.test(key);
}

function isNameHeader(value) {
    const key = compact(value);
    return /^(이름|행레이블|상담사|강사|성명)$/.test(key);
}

function isCountHeader(value) {
    const key = compact(value);
    if (!key || /지급액/.test(key)) return false;
    return /개수|횟수|건수|세션수|서류면접\(건\)|특화\(건\)|첨삭횟수/.test(key) || /\(건\)$/.test(key);
}

function isAmountHeader(value) {
    const key = compact(value);
    return /지급액/.test(key);
}

/**
 * 실제 출석부 양식: 단가 헤더(1세션당/건당 첨삭비)를 찾고,
 * 그 왼쪽의 이름/행레이블을 상담사명으로 사용 (학생 이름 열과 분리).
 */
export function findPaymentHeader(matrix) {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex += 1) {
        const row = matrix[rowIndex] || [];
        for (let rateCol = 0; rateCol < row.length; rateCol += 1) {
            if (!isRateHeader(row[rateCol])) continue;
            let nameCol = null;
            for (let col = rateCol - 1; col >= Math.max(0, rateCol - 4); col -= 1) {
                if (isNameHeader(row[col])) {
                    nameCol = col;
                    break;
                }
            }
            if (nameCol == null) {
                for (let col = rateCol - 1; col >= Math.max(0, rateCol - 2); col -= 1) {
                    if (cellText(row[col]) === '') continue;
                    nameCol = col;
                    break;
                }
            }
            if (nameCol == null) continue;

            let countCol;
            let amountCol;
            for (let col = rateCol + 1; col < Math.min(row.length, rateCol + 5); col += 1) {
                if (countCol == null && isCountHeader(row[col])) countCol = col;
                if (amountCol == null && isAmountHeader(row[col])) amountCol = col;
            }
            // 진로 양식: 개수가 단가 왼쪽(행레이블 옆)인 경우
            if (countCol == null) {
                for (let col = nameCol + 1; col < rateCol; col += 1) {
                    if (isCountHeader(row[col])) {
                        countCol = col;
                        break;
                    }
                }
            }
            return { rowIndex, indexes: { name: nameCol, rate: rateCol, count: countCol, amount: amountCol } };
        }
    }
    return null;
}

export function parsePaymentRates(matrix) {
    const header = findPaymentHeader(matrix);
    if (!header) return new Map();
    const rates = new Map();
    for (let i = header.rowIndex + 1; i < matrix.length; i += 1) {
        const row = matrix[i] || [];
        const rawName = cellText(row[header.indexes.name]);
        const name = normalizeName(rawName);
        if (!name || /^(총합계|합계|계)$/.test(name)) continue;
        const rate = parseAmount(row[header.indexes.rate]);
        if (rate == null || rate <= 0) continue;
        const count = header.indexes.count != null ? parseAmount(row[header.indexes.count]) : null;
        const amount = header.indexes.amount != null ? parseAmount(row[header.indexes.amount]) : null;
        rates.set(name, { rate, count, amount, displayName: rawName });
    }
    return rates;
}

/**
 * 지급표 단가 우선, 없으면 마스터 rates.
 * kind: 'interview' | 'correctionKorean' | 'correctionEnglish'
 */
export function pickRate({ excelRate, master, kind = 'interview' }) {
    if (excelRate != null && excelRate > 0) return excelRate;
    const rates = master?.rates || {};
    if (kind === 'correctionKorean' && rates.correctionKorean > 0) return rates.correctionKorean;
    if (kind === 'correctionEnglish' && rates.correctionEnglish > 0) return rates.correctionEnglish;
    if (kind === 'interview' && rates.interview > 0) return rates.interview;
    if (rates.default > 0) return rates.default;
    if (master?.consultingFeePerSession > 0) return master.consultingFeePerSession;
    return 0;
}

export function buildConsultantBlocks(sessions, paymentRates, mastersByName, { kind = 'interview', remark = '' } = {}) {
    const grouped = new Map();
    for (const session of sessions) {
        const key = normalizeName(session.consultant);
        if (!key) continue;
        if (!grouped.has(key)) {
            grouped.set(key, {
                consultant: key,
                displayName: session.displayName || session.consultant,
                daysMap: new Map(),
                remark
            });
        }
        const block = grouped.get(key);
        const dayKey = session.dayKey || '-';
        if (!block.daysMap.has(dayKey)) block.daysMap.set(dayKey, { dayKey, times: [], count: 0 });
        const day = block.daysMap.get(dayKey);
        if (session.time) day.times.push(session.time);
        day.count += 1;
    }

    return Array.from(grouped.values()).map((block) => {
        const payment = paymentRates.get(block.consultant);
        const master = mastersByName.get(block.consultant) || null;
        const sessionCount = Array.from(block.daysMap.values()).reduce((sum, day) => sum + day.count, 0);
        const rate = pickRate({ excelRate: payment?.rate, master, kind });
        const amount = payment?.amount != null && payment.amount > 0
            ? payment.amount
            : sessionCount * rate;
        const days = Array.from(block.daysMap.values())
            .map((day) => ({
                dayKey: day.dayKey,
                times: [...new Set(day.times)].sort(),
                count: day.count
            }))
            .sort((a, b) => {
                const [am, ad] = a.dayKey.split('/').map(Number);
                const [bm, bd] = b.dayKey.split('/').map(Number);
                return (am - bm) || (ad - bd);
            });
        return {
            consultant: block.consultant,
            displayName: payment?.displayName || master?.name || block.displayName,
            sessionCount,
            rate,
            amount,
            remark: remark || master?.remark || '',
            days,
            missingProfile: !master
        };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
}
