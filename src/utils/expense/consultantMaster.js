import { compact, normalizeName } from './excelCommon.js';

function feeRows(user) {
    return Array.isArray(user?.consultingFeesByType) ? user.consultingFeesByType : [];
}

function classifyRate(typeCode = '', typeName = '', amount) {
    if (!Number.isFinite(amount) || amount < 0) return null;
    const blob = `${typeCode} ${typeName}`.toLowerCase();
    if (/영문|english|eng/.test(blob) && /첨삭|correction|서면/.test(blob)) {
        return ['correctionEnglish', amount];
    }
    if (/국문|korean|kor/.test(blob) && /첨삭|correction|서면/.test(blob)) {
        return ['correctionKorean', amount];
    }
    if (/첨삭|correction|서면/.test(blob)) {
        return ['correctionKorean', amount];
    }
    if (/서류|면접|interview|진로|컨설팅|개발/.test(blob) || typeCode) {
        return ['interview', amount];
    }
    return ['default', amount];
}

export function buildConsultantRates(user, codeNameByCode = new Map()) {
    const rates = { interview: 0, correctionKorean: 0, correctionEnglish: 0, default: 0 };
    for (const row of feeRows(user)) {
        const typeName = codeNameByCode.get(row.typeCode) || row.typeName || row.remark || '';
        const classified = classifyRate(row.typeCode, typeName, row.amount);
        if (!classified) continue;
        const [key, amount] = classified;
        if (!rates[key]) rates[key] = amount;
    }
    const legacy = Number(user?.consultingFeePerSession);
    if (Number.isFinite(legacy) && legacy > 0) {
        if (!rates.interview) rates.interview = legacy;
        if (!rates.default) rates.default = legacy;
    }
    return rates;
}

export function toConsultantMaster(user, codeNameByCode = new Map()) {
    if (!user) return null;
    return {
        uid: user.uid,
        name: user.name || '',
        uniqueNumber: user.uniqueNumber || '',
        birthDate: user.birthDate || '',
        tel: user.tel || '',
        affiliation: user.affiliation || '',
        address: user.address || '',
        bankAccount: user.bankAccount || '',
        placeInterview: user.placeInterview || user.place || '',
        placeCorrection: user.placeCorrection || user.place || '',
        consultingFeePerSession: Number(user.consultingFeePerSession) || 0,
        rates: buildConsultantRates(user, codeNameByCode),
        remark: user.remark || ''
    };
}

export function indexConsultantMasters(masters = []) {
    const byName = new Map();
    for (const master of masters) {
        const key = normalizeName(master.name);
        if (!key) continue;
        byName.set(key, master);
        const compactKey = compact(master.name);
        if (compactKey) byName.set(compactKey, master);
    }
    return byName;
}

export function findConsultantProfile(mastersByName, displayName) {
    const key = normalizeName(displayName);
    if (!key) return null;
    return mastersByName.get(key) || mastersByName.get(compact(displayName)) || null;
}

export function formatBankAccount(value) {
    const text = String(value || '').trim();
    if (!text) return { bank: '-', account: '-', holder: '-' };
    const parts = text.split(/[·|/,\s]+/).filter(Boolean);
    if (parts.length >= 3) {
        return { bank: parts[0], account: parts[1], holder: parts.slice(2).join(' ') };
    }
    if (parts.length === 2) {
        return { bank: parts[0], account: parts[1], holder: '-' };
    }
    return { bank: '-', account: text, holder: '-' };
}
