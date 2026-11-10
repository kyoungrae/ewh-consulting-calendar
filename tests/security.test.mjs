import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, safeUser, originsMatch } from '../server/security.mjs';
import { normalizeSchedule, publicDocument } from '../server/schedules.mjs';
import { readConfig } from '../server/config.mjs';

const piiSecret = 'test-pii-encryption-key-32chars!!';
const piiKey = derivePiiKey(piiSecret);

test('passwords use salted hashes; invalid and legacy passwords stay distinct', async () => {
    const hash = await hashPassword('secure-password');
    assert.notEqual(hash, await hashPassword('secure-password'));
    assert.equal(await verifyPassword('secure-password', hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);
    assert.equal(await verifyPassword('secure-password', null), false);
    await assert.rejects(hashPassword('123456'), { status: 400 });
    assert.equal(await verifyPassword('123456', await hashPassword('123456', { minimumLength: 1 })), true);
});

test('profiles never expose authentication data or another consultant fee', () => {
    const user = {
        _id: 'user', uid: 'user', name: '이름', role: 'consultant', password: 'secret', passwordHash: 'secret',
        consultingFeePerSession: 50000, consultingFeesByType: [], authVersion: 3,
        bankAccount: '123-456', uniqueNumber: 'U-1', birthDate: '1990-01-01'
    };
    const profile = safeUser(user);
    assert.equal(profile.passwordHash, undefined);
    assert.equal(profile.password, undefined);
    assert.equal(profile.authVersion, undefined);
    assert.equal(profile.bankAccount, '123-456');
    assert.equal(safeUser(user, false).consultingFeePerSession, undefined);
    assert.equal(safeUser(user, false).bankAccount, undefined);
    assert.equal(safeUser(user, false).uniqueNumber, undefined);
});

test('sensitive member fields encrypt at rest and decrypt for authorized reads', () => {
    const sealed = encryptUserFields({
        name: '이름',
        tel: '010-1234-5678',
        uniqueNumber: 'U-1',
        place: '서울',
        birthDate: '1990-01-01',
        affiliation: '소속',
        address: '주소',
        bankAccount: '123-456',
    }, piiKey);
    assert.equal(sealed.name, '이름');
    assert.match(sealed.tel, /^enc:v1:/);
    assert.match(sealed.bankAccount, /^enc:v1:/);
    assert.notEqual(sealed.tel, '010-1234-5678');
    assert.notEqual(encryptField('010-1234-5678', piiKey), encryptField('010-1234-5678', piiKey));
    const opened = decryptUserFields(sealed, piiKey);
    assert.equal(opened.tel, '010-1234-5678');
    assert.equal(opened.bankAccount, '123-456');
    assert.equal(opened.uniqueNumber, 'U-1');
    assert.equal(decryptField('legacy-plaintext', piiKey), 'legacy-plaintext');
    assert.equal(encryptField('', piiKey), '');
});

test('schedule dates normalize KST boundaries and reject object identifiers', () => {
    const first = normalizeSchedule({ date: '2026-11-01T00:30', consultantId: 'consultant' });
    const second = normalizeSchedule({ date: '2026-10-31T15:30:00Z', consultantId: 'consultant' });
    assert.equal(first.month, '2026-11');
    assert.equal(first.slotKey, second.slotKey);
    assert.throws(() => normalizeSchedule({ date: '2026-11-01T00:30', endDate: '2026-10-31T23:00', consultantId: 'x' }), { status: 400 });
    assert.throws(() => normalizeSchedule({ _id: { $ne: null }, date: first.date, consultantId: 'x' }), { status: 400 });
    assert.equal(publicDocument({ _id: 'canonical', id: 'legacy' }).id, 'canonical');
});

test('configuration rejects missing secrets and insecure HTTPS cookies', () => {
    assert.throws(() => readConfig({}), /SESSION_SECRET/);
    assert.throws(() => readConfig({ SESSION_SECRET: 'x'.repeat(32) }), /PII_ENCRYPTION_KEY/);
    assert.throws(() => readConfig({ SESSION_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: piiSecret, APP_ORIGIN: 'https://example.com', COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
    assert.throws(() => readConfig({ SESSION_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: piiSecret, APP_ORIGIN: 'https://example.com/' }), /origin/);
});

test('loopback localhost and 127.0.0.1 origins match for local CSRF/CORS', () => {
    assert.equal(originsMatch('http://localhost:5173', 'http://localhost:5173'), true);
    assert.equal(originsMatch('http://127.0.0.1:5173', 'http://localhost:5173'), true);
    assert.equal(originsMatch('http://localhost:5173', 'http://127.0.0.1:5173'), true);
    assert.equal(originsMatch('http://127.0.0.1:3000', 'http://localhost:5173'), false);
    assert.equal(originsMatch('https://ewha.example', 'http://localhost:5173'), false);
});
