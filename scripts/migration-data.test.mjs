import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMigration } from './migration-data.mjs';

const exportFile = collections => ({ version: 1, collections });
const schedule = (id, date = '2026-11-01T00:10:00+09:00') => ({ id, date, consultantId: 'original-uid', typeCode: 'CAREER' });

test('migration flattens monthly/yearly items and preserves UID relationships', () => {
    const result = prepareMigration(exportFile({
        users: [{ id: 'profile-doc', data: { uid: 'original-uid', userId: 'teacher', email: 'Teacher@example.com', role: 'consultant', password: 'oldpw6' } }],
        schedules_by_month: [{ id: '2026-11', data: { items: [schedule('schedule-1')] } }],
        special_schedules_by_year: [{ id: '2026', data: { items: [{ id: 'special-1', date: '2026-11-03', title: '행사' }] } }],
    }));
    assert.equal(result.collections.users[0]._id, 'original-uid');
    assert.equal(result.collections.users[0].firestoreDocumentId, 'profile-doc');
    assert.equal(result.collections.users[0].email, 'teacher@example.com');
    assert.equal(result.collections.users[0].password, undefined);
    assert.equal(result.collections.schedules[0]._id, 'schedule-1');
    assert.equal(result.collections.schedules[0].consultantId, 'original-uid');
    assert.equal(result.collections.schedules[0].month, '2026-11');
    assert.equal(result.collections.schedules[0].date, '2026-10-31T15:10:00.000Z');
    assert.equal(result.collections.special_schedules[0]._id, 'special-1');
});

test('migration requires password reset when only Firebase authentication has a hash', () => {
    const result = prepareMigration(exportFile({ users: [{ id: 'uid', data: { userId: 'admin', role: 'admin', passwordHash: 'FIREBASE_HASH' } }] }));
    assert.equal(result.collections.users[0].passwordHash, undefined);
    assert.equal(result.collections.users[0]._migrationPassword, null);
    assert.equal(result.collections.users[0].mustResetPassword, true);
    assert.equal(result.report.passwordResetRequired, 1);
});

test('migration detects conflicting legacy and monthly schedule IDs before writes', () => {
    assert.throws(() => prepareMigration(exportFile({
        schedules_by_month: [{ id: '2026-11', data: { items: [schedule('same-id')] } }],
        schedules: [{ id: 'same-id', data: schedule('same-id', '2026-11-02T12:00:00+09:00') }],
    })), /식별자가 충돌/);
});

test('migration rejects duplicate slots and case-insensitive login IDs', () => {
    assert.throws(() => prepareMigration(exportFile({
        schedules_by_month: [{ id: '2026-11', data: { items: [schedule('one'), schedule('two')] } }],
    })), /slotKey/);
    assert.throws(() => prepareMigration(exportFile({
        users: [
            { id: 'one', data: { userId: 'Teacher', role: 'consultant' } },
            { id: 'two', data: { userId: 'teacher', role: 'consultant' } },
        ],
    })), /userId/);
});

test('migration generates stable IDs for old array entries without IDs', () => {
    const input = exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [{ date: '2026-11-01T10:00', consultantId: 'uid' }] } }] });
    const a = prepareMigration(input);
    const b = prepareMigration(input);
    assert.equal(a.collections.schedules[0]._id, b.collections.schedules[0]._id);
    assert.equal(a.report.generatedIds, 1);
});

test('current layout archives every legacy row when monthly documents exist, including stale legacy-only slots', () => {
    const legacyShared = schedule('legacy-shared');
    const legacyOnly = schedule('legacy-only', '2026-11-02T10:00:00+09:00');
    const result = prepareMigration(exportFile({
        schedules_by_month: [{ id: '2026-11', data: { items: [schedule('current-monthly')] } }],
        schedules: [{ id: 'legacy-shared', data: legacyShared }, { id: 'legacy-only', data: legacyOnly }],
    }), { currentLayout: true });
    assert.deepEqual(result.collections.schedules.map(item => item._id), ['current-monthly']);
    assert.equal(result.report.authoritativeSource, 'schedules_by_month');
    assert.equal(result.report.archivedLegacySchedules, 2);
    assert.equal(result.report.archivedDuplicateSchedules, 0);
    assert.deepEqual(result.collections.migration_schedule_archive.map(item => item.rawData), [legacyShared, legacyOnly]);
    assert.ok(result.collections.migration_schedule_archive.every(item => item.sourceCollection === 'schedules' && item.reason === 'legacy_collection_not_active'));
});

test('current layout keeps latest updatedAt or fallback createdAt and archives superseded raw monthly rows', () => {
    const older = { ...schedule('older'), updatedAt: '2026-11-01T01:00:00Z', createdAt: '2026-11-09T01:00:00Z', isCancelled: true, legacyOnlyField: 'preserve' };
    const latest = { ...schedule('latest'), createdAt: '2026-11-02T01:00:00Z', isCancelled: false };
    const result = prepareMigration(exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [older, latest] } }] }), { currentLayout: true });
    assert.equal(result.collections.schedules[0]._id, 'latest');
    assert.equal(result.collections.schedules[0].consultantId, 'original-uid');
    assert.equal(result.report.archivedDuplicateSchedules, 1);
    const archived = result.collections.migration_schedule_archive[0];
    assert.deepEqual(archived.rawData, older);
    assert.equal(archived.sourceDocumentId, '2026-11');
    assert.equal(archived.sourceItemIndex, 0);
});

test('current layout cancellation tie-break follows existing UI and keeps first row on a full tie', () => {
    for (const cancellation of [{ isCancelled: true }, { status: '취소' }]) {
        const active = { ...schedule('active'), updatedAt: '2026-11-01T01:00:00Z' };
        const cancelled = { ...schedule('cancelled'), updatedAt: active.updatedAt, ...cancellation };
        for (const items of [[active, cancelled], [cancelled, active]]) {
            const result = prepareMigration(exportFile({ schedules_by_month: [{ id: '2026-11', data: { items } }] }), { currentLayout: true });
            assert.equal(result.collections.schedules[0]._id, 'cancelled');
        }
    }
    const result = prepareMigration(exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [schedule('first'), schedule('second')] } }] }), { currentLayout: true });
    assert.equal(result.collections.schedules[0]._id, 'first');
    // The original data provider sorts by full start time before CalendarPage
    // selects one row per minute slot; stable full ties keep source order.
    const timeSorted = prepareMigration(exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [schedule('later', '2026-11-01T10:00:30+09:00'), schedule('earlier', '2026-11-01T10:00:01+09:00')] } }] }), { currentLayout: true });
    assert.equal(timeSorted.collections.schedules[0]._id, 'earlier');
});

test('current layout falls back to legacy only when no monthly documents exist', () => {
    const input = exportFile({ schedules: [
        { id: 'old', data: { ...schedule('old'), createdAt: '2026-11-01T00:00:00Z' } },
        { id: 'new', data: { ...schedule('new'), createdAt: '2026-11-02T00:00:00Z' } },
    ] });
    const result = prepareMigration(input, { currentLayout: true });
    assert.equal(result.report.authoritativeSource, 'schedules');
    assert.equal(result.collections.schedules[0]._id, 'new');
    assert.equal(result.report.archivedLegacySchedules, 0);
    assert.equal(result.report.archivedDuplicateSchedules, 1);
    const emptyMonthly = prepareMigration(exportFile({ ...input.collections, schedules_by_month: [{ id: '2026-11', data: { items: [] } }] }), { currentLayout: true });
    assert.equal(emptyMonthly.collections.schedules.length, 0);
    assert.equal(emptyMonthly.report.archivedLegacySchedules, 2);
});

test('current layout handles conflicting duplicate IDs only within the same slot', () => {
    const items = [
        { ...schedule('same-id'), updatedAt: '2026-11-01T00:00:00Z', memo: 'old' },
        { ...schedule('same-id'), updatedAt: '2026-11-02T00:00:00Z', memo: 'new' },
    ];
    const input = exportFile({ schedules_by_month: [{ id: '2026-11', data: { items } }] });
    assert.throws(() => prepareMigration(input), /식별자가 충돌/);
    const result = prepareMigration(input, { currentLayout: true });
    assert.equal(result.collections.schedules[0]._id, 'same-id');
    assert.equal(result.collections.schedules[0].memo, 'new');
    assert.equal(result.collections.migration_schedule_archive[0].rawData.memo, 'old');
    assert.throws(() => prepareMigration(exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [schedule('collision'), schedule('collision', '2026-11-02T10:00:00+09:00')] } }] }), { currentLayout: true }), /식별자가 충돌/);
});

test('current layout archive IDs are deterministic and preserve changed versions at the same source position', () => {
    const input = exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [schedule('monthly')] } }], schedules: [{ id: 'legacy', data: { ...schedule('legacy'), memo: 'version-one' } }] });
    const a = prepareMigration(input, { currentLayout: true });
    const b = prepareMigration(input, { currentLayout: true });
    assert.match(a.collections.migration_schedule_archive[0]._id, /^[a-f0-9]{64}$/);
    assert.equal(a.collections.migration_schedule_archive[0]._id, b.collections.migration_schedule_archive[0]._id);
    const changed = structuredClone(input);
    changed.collections.schedules[0].data.memo = 'version-two';
    const c = prepareMigration(changed, { currentLayout: true });
    assert.notEqual(a.collections.migration_schedule_archive[0]._id, c.collections.migration_schedule_archive[0]._id);
});

test('strict migration still rejects duplicate slots without explicitly selecting current layout', () => {
    const input = exportFile({ schedules_by_month: [{ id: '2026-11', data: { items: [schedule('one'), schedule('two')] } }] });
    assert.throws(() => prepareMigration(input), /slotKey/);
    assert.equal(prepareMigration(input, { currentLayout: true }).collections.schedules.length, 1);
});
