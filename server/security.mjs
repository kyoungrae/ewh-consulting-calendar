import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const SESSION_MS = 30 * 60 * 1000;
export const newToken = () => randomBytes(32).toString('hex');

export function httpError(status, message) {
    return Object.assign(new Error(message), { status });
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

/** 관리자(또는 본인)에게만 노출하는 회원 프로필·민감정보 필드 */
export const PRIVATE_USER_FIELDS = [
    'uid', 'userId', 'email', 'name', 'tel', 'role', 'status',
    'uniqueNumber', 'place', 'birthDate', 'affiliation', 'address', 'bankAccount',
    'consultingFeePerSession', 'consultingFeesByType',
    'createdAt', 'updatedAt', 'mustResetPassword', 'authSyncPending'
];

export function safeUser(user, includePrivate = true) {
    const fields = includePrivate ? PRIVATE_USER_FIELDS : ['uid', 'name', 'role', 'status'];
    return Object.fromEntries([['id', String(user._id)], ...fields.filter(key => user[key] !== undefined).map(key => [key, user[key]])]);
}
