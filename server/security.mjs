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
