import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { httpError } from './security.mjs';

const fields = ['date', 'endDate', 'location', 'consultantId', 'consultantName', 'studentName', 'typeCode', 'typeName', 'memo', 'status', 'isCancelled', 'cancelReason', 'cancelledAt', 'originalDate', 'createdAt', 'updatedAt'];
export const publicDocument = ({ _id, id: _legacyId, slotKey: _slotKey, month: _month, ...rest }) => ({ id: String(_id), ...rest });
const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' });

export function normalizeSchedule(input, existing = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, '일정 형식이 올바르지 않습니다.');
    const data = { ...existing };
    for (const key of fields) {
        if (input[key] !== undefined) {
            if (key === 'isCancelled') {
                if (typeof input[key] !== 'boolean') throw httpError(400, '취소 상태가 올바르지 않습니다.');
            } else if (typeof input[key] !== 'string' || input[key].length > 10000) throw httpError(400, '일정 항목은 문자열로 입력해 주세요.');
            data[key] = input[key];
        }
    }
    // Datetime-local strings belong to the consulting calendar's Korean timezone.
    const asDate = value => new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}+09:00` : value);
    const date = asDate(data.date || '');
    if (!Number.isFinite(date.getTime())) throw httpError(400, '올바른 시작 일시를 입력해 주세요.');
    if (!data.consultantId && !data.consultantName) throw httpError(400, '담당 컨설턴트를 지정해 주세요.');
    data.date = date.toISOString();
    if (data.endDate) {
        const end = asDate(data.endDate);
        if (!Number.isFinite(end.getTime()) || end < date) throw httpError(400, '종료 일시는 시작 일시 이후여야 합니다.');
        data.endDate = end.toISOString();
    }
    const parts = monthFormatter.formatToParts(date);
    data.month = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
    data.slotKey = `${data.date.slice(0, 16)}_${String(data.consultantId || data.consultantName).trim()}`;
    data._id = existing._id || input._id || input.id || randomUUID();
    if (typeof data._id !== 'string' || !data._id || data._id.length > 512) throw httpError(400, '일정 식별자가 올바르지 않습니다.');
    return data;
}

export async function withTransaction(client, callback) {
    const session = client.startSession();
    try { return await session.withTransaction(() => callback(session)); }
    finally { await session.endSession(); }
}

export async function writeChangeLog(db, session, type, details, actor, extra = {}) {
    const summary = Object.fromEntries(['added', 'updated', 'deleted', 'unchanged'].map(key => [key, details[key]?.length || 0]));
    const log = { _id: randomUUID(), type, summary, details, timestamp: new Date().toISOString(), actorUid: actor.uid, ...extra };
    await db.collection('change_logs').insertOne(log, { session });
    return summary;
}

function comparable(item) {
    const { id: _id, _id: _mongoId, slotKey: _slotKey, month: _month, ...data } = item;
    return data;
}

export async function importSchedules(db, client, payload, actor) {
    const { schedules, isReplace = false, mode } = payload;
    const targetMonths = payload.targetMonths ?? undefined;
    if (!Array.isArray(schedules) || schedules.length > 20000) throw httpError(400, '한 번에 20,000개 이하의 일정을 업로드해 주세요.');
    if (targetMonths !== undefined && (!Array.isArray(targetMonths) || targetMonths.some(m => typeof m !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))) throw httpError(400, '대상 월 형식이 올바르지 않습니다.');
    const incoming = schedules.map(item => normalizeSchedule(item));
    if (new Set(incoming.map(s => s.slotKey)).size !== incoming.length) throw httpError(409, '업로드에 동일한 일시와 담당자의 일정이 중복되어 있습니다.');
    const months = new Set(incoming.map(s => s.month));
    if (isReplace) {
        if (targetMonths) targetMonths.forEach(m => months.add(m));
        else if (incoming.length) for (let m = 1; m <= 12; m++) months.add(`${incoming[0].month.slice(0, 4)}-${String(m).padStart(2, '0')}`);
    }
    if (targetMonths && incoming.some(s => !targetMonths.includes(s.month))) throw httpError(400, '선택한 월 외의 일정이 포함되어 있습니다.');
    return withTransaction(client, async session => {
        const collection = db.collection('schedules');
        const existing = await collection.find({ month: { $in: [...months] } }, { session }).toArray();
        const byKey = new Map(existing.map(s => [s.slotKey, s]));
        const result = { processed: [], added: [], updated: [], deleted: [], unchanged: [] };
        const keep = new Set();
        const now = new Date().toISOString();
        for (const candidate of incoming) {
            const before = byKey.get(candidate.slotKey);
            if (before && mode === 'append') throw httpError(409, '동일한 일시와 담당자의 일정이 이미 존재합니다.');
            const item = before && !isReplace
                ? normalizeSchedule(candidate, before)
                : { ...candidate, _id: randomUUID(), createdAt: now, updatedAt: now };
            keep.add(item._id);
            if (before && !isReplace) {
                // Uploads omit timestamps. Preserve those when comparing editable fields.
                for (const key of ['createdAt', 'updatedAt']) {
                    if (before[key] !== undefined) item[key] = before[key];
                    else delete item[key];
                }
                if (isDeepStrictEqual(comparable(item), comparable(before))) result.unchanged.push(publicDocument(before));
                else {
                    item.updatedAt = now;
                    result.updated.push({ before: publicDocument(before), after: publicDocument(item) });
                }
            } else result.added.push(publicDocument(item));
            result.processed.push(publicDocument(item));
        }
        if (mode !== 'append') result.deleted = existing.filter(s => !keep.has(s._id)).map(publicDocument);
        const removedIds = result.deleted.map(s => s.id);
        if (removedIds.length) await collection.deleteMany({ _id: { $in: removedIds } }, { session });
        for (const item of result.updated) await collection.replaceOne({ _id: item.after.id }, normalizeSchedule(item.after), { session });
        if (result.added.length) await collection.insertMany(result.added.map(item => normalizeSchedule(item)), { session });
        if (result.added.length + result.updated.length + result.deleted.length) await writeChangeLog(db, session, isReplace ? 'REPLACE' : mode === 'append' ? 'ADD' : 'MERGE', result, actor);
        return result;
    });
}

export async function rollbackImport(db, client, id, actor) {
    return withTransaction(client, async session => {
        const log = await db.collection('change_logs').findOne({ _id: id }, { session });
        if (!log || !['MERGE', 'REPLACE'].includes(log.type)) throw httpError(400, '엑셀 업로드 이력만 되돌릴 수 있습니다.');
        if (await db.collection('change_logs').findOne({ rollbackOf: id }, { session })) throw httpError(409, '이미 되돌린 이력입니다.');
        const { added = [], updated = [], deleted = [] } = log.details || {};
        const schedules = db.collection('schedules');
        for (const expected of [...added, ...updated.map(c => c.after)]) {
            const actual = await schedules.findOne({ _id: expected.id }, { session });
            if (!actual || !isDeepStrictEqual(comparable(publicDocument(actual)), comparable(publicDocument(normalizeSchedule(expected))))) throw httpError(409, '이력 이후 일정이 변경되어 자동으로 되돌릴 수 없습니다.');
        }
        const removedIds = new Set([...added.map(s => s.id), ...updated.map(c => c.after.id)]);
        for (const original of deleted) {
            const normalized = normalizeSchedule(original);
            const occupants = await schedules.find({ $or: [{ _id: normalized._id }, { slotKey: normalized.slotKey }] }, { session }).toArray();
            if (occupants.some(item => !removedIds.has(item._id))) throw httpError(409, '삭제된 일정의 자리에 다른 일정이 있어 되돌릴 수 없습니다.');
        }
        if (added.length) await schedules.deleteMany({ _id: { $in: added.map(s => s.id) } }, { session });
        // Delete changed rows first so restored unique slots cannot collide with each other.
        if (updated.length) await schedules.deleteMany({ _id: { $in: updated.map(c => c.after.id) } }, { session });
        const restored = [...deleted, ...updated.map(c => c.before)].map(s => normalizeSchedule(s));
        if (restored.length) await schedules.insertMany(restored, { session });
        const details = { added: deleted, updated: updated.map(c => ({ before: c.after, after: c.before })), deleted: added };
        return { ok: true, ...await writeChangeLog(db, session, 'ROLLBACK', details, actor, { rollbackOf: id }) };
    });
}
