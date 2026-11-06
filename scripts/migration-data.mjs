import { normalizeSchedule } from '../server/schedules.mjs';
import { createHash } from 'node:crypto';

const COLLECTIONS = ['users', 'schedules', 'special_schedules', 'common_codes', 'change_logs'];

function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
        throw new Error(`${label}: 올바른 문자열 식별자가 필요합니다.`);
    }
    return value;
}

function stableJson(value) {
    if (Array.isArray(value)) return JSON.stringify(value.map(entry => JSON.parse(stableJson(entry))));
    if (plainObject(value)) return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, JSON.parse(stableJson(entry))])));
    return JSON.stringify(value);
}

export function prepareMigration(exportData, { currentLayout = false } = {}) {
    if (exportData?.version !== 1 || !plainObject(exportData.collections)) {
        throw new Error('지원하는 version:1 Firestore JSON 내보내기 파일이 아닙니다.');
    }
    const collectionNames = currentLayout ? [...COLLECTIONS, 'migration_schedule_archive'] : COLLECTIONS;
    const maps = Object.fromEntries(collectionNames.map(name => [name, new Map()]));
    const report = {
        duplicates: 0, generatedIds: 0, passwordResetRequired: 0,
        archivedLegacySchedules: 0, archivedDuplicateSchedules: 0,
        authoritativeSource: currentLayout ? null : 'combined-strict',
    };
    const source = name => {
        const entries = exportData.collections[name] || [];
        if (!Array.isArray(entries)) throw new Error(`${name}: 컬렉션은 배열이어야 합니다.`);
        return entries;
    };
    const add = (name, document) => {
        identifier(document._id, name);
        if (maps[name].has(document._id)) {
            if (stableJson(maps[name].get(document._id)) !== stableJson(document)) {
                throw new Error(`${name}: 서로 다른 문서의 식별자가 충돌합니다. 기존/월별 컬렉션을 확인하세요.`);
            }
            report.duplicates += 1;
            return;
        }
        maps[name].set(document._id, document);
    };
    const documentData = entry => {
        if (!plainObject(entry) || !plainObject(entry.data)) throw new Error('각 문서는 {id,data} 형식이어야 합니다.');
        identifier(entry.id, 'Firestore document');
        return entry.data;
    };

    for (const entry of source('users')) {
        const data = documentData(entry);
        const uid = identifier(data.uid || entry.id, 'User UID');
        const { password, passwordHash: _oldHash, salt: _oldSalt, ...profile } = data;
        if (!['admin', 'consultant', 'tester'].includes(profile.role)) throw new Error('users: 알 수 없는 권한입니다.');
        const email = String(profile.email || '').trim().toLowerCase();
        const userId = String(profile.userId || '').trim();
        if (!email && !userId) throw new Error('users: 로그인 아이디 또는 이메일이 필요합니다.');
        const passwordAvailable = typeof password === 'string' && password.length > 0 && password.length <= 256;
        if (!passwordAvailable) report.passwordResetRequired += 1;
        add('users', {
            ...profile, _id: uid, uid, email, userId,
            firestoreDocumentId: entry.id,
            // Removed immediately after hashing; never written to MongoDB or logs.
            _migrationPassword: passwordAvailable ? password : null,
            mustResetPassword: !passwordAvailable,
        });
    }

    const normalize = (data, id) => {
        if (!plainObject(data)) throw new Error('일정 항목이 객체가 아닙니다.');
        return { ...normalizeSchedule({ ...data, id }, { _id: id }), _id: id };
    };
    const monthly = source('schedules_by_month');
    const legacy = source('schedules');
    const monthlyCandidates = [];
    const legacyCandidates = [];
    for (const entry of monthly) {
        const data = documentData(entry);
        if (!Array.isArray(data.items)) throw new Error('schedules_by_month: items 배열이 없습니다.');
        data.items.forEach((item, index) => {
            if (!item?.id) report.generatedIds += 1;
            monthlyCandidates.push({
                rawData: item,
                document: normalize(item, item?.id || `migrated_${entry.id}_${index}`),
                sourceCollection: 'schedules_by_month', sourceDocumentId: entry.id, sourceItemIndex: index,
            });
        });
    }
    for (const entry of legacy) {
        legacyCandidates.push({ rawData: documentData(entry), sourceCollection: 'schedules', sourceDocumentId: entry.id });
    }

    const archive = (candidate, reason) => {
        const sourceKey = [candidate.sourceCollection, candidate.sourceDocumentId, candidate.sourceItemIndex ?? null];
        // Include the original content so a later snapshot of the same array
        // position can preserve another version under insert-only imports.
        const _id = createHash('sha256').update(JSON.stringify(sourceKey)).update(stableJson(candidate.rawData)).digest('hex');
        add('migration_schedule_archive', {
            _id, reason,
            sourceCollection: candidate.sourceCollection,
            sourceDocumentId: candidate.sourceDocumentId,
            ...(candidate.sourceItemIndex !== undefined ? { sourceItemIndex: candidate.sourceItemIndex } : {}),
            sourceProjectId: exportData.projectId || null,
            sourceExportedAt: exportData.exportedAt || null,
            rawData: candidate.rawData,
        });
    };
    if (!currentLayout) {
        for (const candidate of monthlyCandidates) add('schedules', candidate.document);
        for (const candidate of legacyCandidates) add('schedules', normalize(candidate.rawData, candidate.sourceDocumentId));
    } else {
        // The active UI reads monthly documents exclusively. Bringing old-only
        // legacy rows back into schedules would resurrect previously removed rows.
        const useMonthly = monthly.length > 0;
        report.authoritativeSource = useMonthly ? 'schedules_by_month' : 'schedules';
        if (useMonthly) {
            for (const candidate of legacyCandidates) {
                archive(candidate, 'legacy_collection_not_active');
                report.archivedLegacySchedules += 1;
            }
        }
        const candidates = (useMonthly ? monthlyCandidates : legacyCandidates.map(candidate => ({
            ...candidate, document: normalize(candidate.rawData, candidate.sourceDocumentId),
        }))).sort((a, b) => new Date(a.document.date) - new Date(b.document.date));
        const groups = new Map();
        for (const candidate of candidates) {
            const data = candidate.rawData;
            // Match CalendarPage's pre-migration selection exactly, including
            // retaining the first row when timestamps and cancellation agree.
            const key = `${data.date ? data.date.slice(0, 16) : ''}_${String(data.consultantId || data.consultantName || '').trim()}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(candidate);
        }
        const timestamp = candidate => new Date(candidate.rawData.updatedAt || candidate.rawData.createdAt || 0).getTime() || 0;
        const cancelled = candidate => candidate.rawData.isCancelled === true || candidate.rawData.status === '취소';
        const winnerIds = new Set();
        for (const group of groups.values()) {
            const winner = group.reduce((previous, candidate) => {
                const previousTime = timestamp(previous);
                const candidateTime = timestamp(candidate);
                return candidateTime > previousTime || (candidateTime === previousTime && cancelled(candidate) && !cancelled(previous)) ? candidate : previous;
            });
            if (winnerIds.has(winner.document._id)) throw new Error('schedules: 서로 다른 일정 슬롯의 식별자가 충돌합니다. 원본을 확인하세요.');
            winnerIds.add(winner.document._id);
            add('schedules', winner.document);
            for (const candidate of group) {
                if (candidate === winner) continue;
                archive(candidate, 'superseded_duplicate_slot');
                report.archivedDuplicateSchedules += 1;
            }
        }
    }

    const addSpecial = (data, id) => {
        if (!plainObject(data) || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(data.date)) throw new Error('특별 일정의 날짜가 올바르지 않습니다.');
        add('special_schedules', { ...data, _id: id, id });
    };
    for (const entry of source('special_schedules_by_year')) {
        const data = documentData(entry);
        if (!Array.isArray(data.items)) throw new Error('special_schedules_by_year: items 배열이 없습니다.');
        data.items.forEach((item, index) => {
            if (!item?.id) report.generatedIds += 1;
            addSpecial(item, item?.id || `migrated_special_${entry.id}_${index}`);
        });
    }
    for (const entry of source('special_schedules')) addSpecial(documentData(entry), entry.id);
    for (const name of ['common_codes', 'change_logs']) {
        for (const entry of source(name)) add(name, { ...documentData(entry), _id: entry.id });
    }

    const assertUnique = (name, field, normalize = value => value) => {
        const seen = new Map();
        for (const document of maps[name].values()) {
            const value = normalize(document[field]);
            if (value == null || value === '') continue;
            if (seen.has(value)) throw new Error(`${name}: ${field} 값이 중복됩니다. 가져오기 전에 원본을 정리하세요.`);
            seen.set(value, document._id);
        }
    };
    assertUnique('users', 'email', value => String(value || '').trim().toLowerCase());
    assertUnique('users', 'userId', value => String(value || '').trim().toLowerCase());
    assertUnique('schedules', 'slotKey');
    assertUnique('common_codes', 'code');

    return { collections: Object.fromEntries(collectionNames.map(name => [name, [...maps[name].values()]])), report };
}
