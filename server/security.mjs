import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const SESSION_MS = 30 * 60 * 1000;
export const newToken = () => randomBytes(32).toString('hex');
const ENC_PREFIX = 'enc:v1:';

export function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

/** localhost ↔ 127.0.0.1 같은 루프백·포트면 동일 출처로 본다 (로컬 CSRF/CORS). */
export function originsMatch(requestOrigin, configuredOrigin) {
    if (!requestOrigin || !configuredOrigin) return false;
    if (requestOrigin === configuredOrigin) return true;
    try {
        const request = new URL(requestOrigin);
        const configured = new URL(configuredOrigin);
        const loopback = new Set(['localhost', '127.0.0.1']);
        return request.protocol === configured.protocol
            && request.port === configured.port
            && loopback.has(request.hostname)
            && loopback.has(configured.hostname);
    } catch {
        return false;
    }
}

export async function hashPassword(password, { minimumLength = 8 } = {}) {
    if (typeof password !== 'string' || password.length < minimumLength || password.length > 256) {
        throw httpError(400, '비밀번호는 8자 이상 256자 이하로 입력해 주세요.');
    }
    const salt = randomBytes(16).toString('hex');
    const key = await derive(password, salt, 64);
    return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
    if (typeof password !== 'string' || password.length > 256 || typeof encoded !== 'string') return false;
    const [algorithm, salt, expected] = encoded.split(':');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
    const actual = await derive(password, salt, 64);
    return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

/** DB에 평문으로 두면 안 되는 회원 개인정보 필드 (조회 키로 쓰지 않음) */
export const SENSITIVE_USER_FIELDS = [
    'tel', 'uniqueNumber', 'place', 'placeInterview', 'placeCorrection',
    'birthDate', 'affiliation', 'address', 'bankAccount',
];

export function derivePiiKey(secret) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('PII_ENCRYPTION_KEY must contain at least 32 characters.');
    }
    return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptField(plaintext, key) {
    if (plaintext == null || plaintext === '') return plaintext;
    if (typeof plaintext !== 'string') throw httpError(400, '개인정보 형식이 올바르지 않습니다.');
    if (plaintext.startsWith(ENC_PREFIX)) return plaintext;
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid PII encryption key.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptField(value, key) {
    if (value == null || value === '') return value;
    if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value;
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid PII encryption key.');
    const parts = value.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 3) throw httpError(500, '암호화된 개인정보를 읽을 수 없습니다.');
    const [ivB64, tagB64, dataB64] = parts;
    try {
        const iv = Buffer.from(ivB64, 'base64url');
        const tag = Buffer.from(tagB64, 'base64url');
        const data = Buffer.from(dataB64, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
        throw httpError(500, '암호화된 개인정보를 읽을 수 없습니다.');
    }
}

export function encryptUserFields(fields, key) {
    if (!fields || typeof fields !== 'object') return fields;
    const out = { ...fields };
    for (const name of SENSITIVE_USER_FIELDS) {
        if (out[name] !== undefined) out[name] = encryptField(out[name], key);
    }
    return out;
}

export function decryptUserFields(user, key) {
    if (!user || typeof user !== 'object') return user;
    const out = { ...user };
    for (const name of SENSITIVE_USER_FIELDS) {
        if (out[name] !== undefined) out[name] = decryptField(out[name], key);
    }
    return out;
}

/** 영수증·지출결의 마스터에 쓰는 상담사 인적/계좌 필드 */
export const CONSULTANT_MASTER_FIELDS = [
    'uid', 'name', 'tel', 'role', 'status',
    'uniqueNumber', 'birthDate', 'affiliation', 'address', 'bankAccount',
    'place', 'placeInterview', 'placeCorrection',
    'consultingFeePerSession', 'consultingFeesByType', 'remark'
];

export function safeUser(user, includePrivate = true) {
    const fields = includePrivate
        ? ['uid', 'userId', 'email', 'name', 'tel', 'role', 'status',
            'uniqueNumber', 'birthDate', 'affiliation', 'address', 'bankAccount',
            'place', 'placeInterview', 'placeCorrection', 'remark',
            'consultingFeePerSession', 'consultingFeesByType',
            'createdAt', 'updatedAt', 'mustResetPassword', 'authSyncPending']
        : ['uid', 'name', 'role', 'status'];
    return Object.fromEntries([['id', String(user._id)], ...fields.filter(key => user[key] !== undefined).map(key => [key, user[key]])]);
}

export function consultantMasterUser(user) {
    return Object.fromEntries([
        ['id', String(user._id)],
        ...CONSULTANT_MASTER_FIELDS.filter(key => user[key] !== undefined).map(key => [key, user[key]])
    ]);
}
