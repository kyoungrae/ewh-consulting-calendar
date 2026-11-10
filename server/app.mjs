import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword, verifyPassword, safeUser, consultantMasterUser, httpError, SESSION_MS, newToken, originsMatch } from './security.mjs';
import { publicDocument, normalizeSchedule, withTransaction, writeChangeLog, importSchedules, rollbackImport } from './schedules.mjs';
import { bearerSession } from './bearer-session.mjs';
import { loginRateKey } from './gateway-rate.mjs';

const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const destroySession = req => new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
const readAll = user => ['admin', 'tester'].includes(user.role);
function admin(req, _res, next) {
    if (req.user.role !== 'admin') return next(httpError(403, '관리자만 변경할 수 있습니다.'));
    next();
}
function text(value, label, required = false) {
    if (typeof value !== 'string' || value.length > 10000 || (required && !value.trim())) throw httpError(400, `${label} 항목이 올바르지 않습니다.`);
    return value.trim();
}
const normalizedEmail = value => typeof value === 'string' ? value.toLowerCase() : '';
function fees(value) {
    if (!Array.isArray(value) || value.length > 100 || value.some(row => !row || typeof row.typeCode !== 'string' || !row.typeCode.trim() || !Number.isFinite(row.amount) || row.amount < 0)) throw httpError(400, '유형별 강사료가 올바르지 않습니다.');
    return value.map(({ typeCode, amount }) => ({ typeCode: typeCode.trim(), amount }));
}
function userFields(input) {
    const out = {};
    for (const key of ['userId', 'email', 'name', 'tel', 'role', 'status', 'uniqueNumber', 'place', 'placeInterview', 'placeCorrection', 'affiliation', 'address', 'bankAccount', 'remark']) {
        if (input[key] !== undefined) out[key] = text(input[key], key, ['name', 'userId'].includes(key));
    }
    if (input.birthDate !== undefined) {
        const value = text(input.birthDate, '생년월일');
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, '생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.');
        out.birthDate = value;
    }
    if (out.email) {
        out.email = out.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw httpError(400, '이메일 형식이 올바르지 않습니다.');
    }
    if (out.birthDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(out.birthDate)) throw httpError(400, '생년월일 형식이 올바르지 않습니다. (YYYY-MM-DD)');
        const birth = new Date(`${out.birthDate}T00:00:00`);
        if (Number.isNaN(birth.getTime())) throw httpError(400, '생년월일이 올바르지 않습니다.');
    }
    if (out.role !== undefined && !['admin', 'consultant', 'tester'].includes(out.role)) throw httpError(400, '권한이 올바르지 않습니다.');
    if (out.status !== undefined && !['approved', 'pending', 'rejected', 'suspended'].includes(out.status)) throw httpError(400, '승인 상태가 올바르지 않습니다.');
    if (input.consultingFeesByType !== undefined) out.consultingFeesByType = fees(input.consultingFeesByType);
    if (input.consultingFeePerSession !== undefined) {
        if (input.consultingFeePerSession !== null && (!Number.isFinite(input.consultingFeePerSession) || input.consultingFeePerSession < 0)) throw httpError(400, '강사료가 올바르지 않습니다.');
        out.consultingFeePerSession = input.consultingFeePerSession;
    }
    return out;
}

export function createApp({ db, client, config, sessionStore, firebaseAuth, firebaseDirectory }) {
    const app = express();
    const useBearer = config.sessionTransport === 'bearer';
    const useFirebase = config.authProvider === 'firebase';
    if (useFirebase && (!firebaseAuth || !firebaseDirectory)) throw new Error('Firebase auth and directory adapters are required.');
    if (!Buffer.isBuffer(config.piiEncryptionKey) || config.piiEncryptionKey.length !== 32) {
        throw new Error('piiEncryptionKey must be a 32-byte Buffer.');
    }
    const piiKey = config.piiEncryptionKey;
    const seal = fields => encryptUserFields(fields, piiKey);
    const present = (user, includePrivate = true) => safeUser(decryptUserFields(user, piiKey), includePrivate);
    // A dedicated collection avoids trusting legacy migrated MongoDB users.
    // It is initialized from Firebase during the controlled cutover and is the
    // authority for application access thereafter.
    const firebaseUsers = useFirebase ? db.collection('firebase_user_states') : null;
    app.disable('x-powered-by');
    if (config.production) app.set('trust proxy', 1);
    app.use(helmet({ crossOriginResourcePolicy: { policy: useBearer ? 'cross-origin' : 'same-origin' }, contentSecurityPolicy: { directives: {
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
        'upgrade-insecure-requests': config.secure ? [] : null,
    } } }));
    app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    if (useBearer) app.use('/api', (req, res, next) => {
        const origin = req.get('origin');
        res.vary('Origin');
        if (originsMatch(origin, config.origin)) res.set('Access-Control-Allow-Origin', origin);
        if (req.method !== 'OPTIONS') return next();
        const methods = ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
        const headers = ['authorization', 'content-type', 'x-csrf-token'];
        const requestedHeaders = (req.get('access-control-request-headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!originsMatch(origin, config.origin) || !methods.includes(req.get('access-control-request-method')) || requestedHeaders.some(header => !headers.includes(header))) {
            return next(httpError(403, '허용되지 않은 요청 출처입니다.'));
        }
        res.set('Access-Control-Allow-Methods', methods.join(', '));
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token');
        res.set('Access-Control-Max-Age', '600');
        res.vary('Access-Control-Request-Headers');
        res.status(204).end();
    });
    app.get('/api/health', async (_req, res) => {
        try { await db.command({ ping: 1 }); res.json({ status: 'ok' }); }
        catch { res.status(503).json({ status: 'unavailable' }); }
    });
    app.use('/api', express.json({ limit: '12mb' }));
    app.use('/api', useBearer ? bearerSession(db) : session({
        name: 'ewh.sid', secret: config.sessionSecret,
        resave: false, saveUninitialized: false, rolling: false,
        store: sessionStore || MongoStore.create({ clientPromise: Promise.resolve(client), dbName: config.database, collectionName: 'sessions', touchAfter: 60 }),
        cookie: { httpOnly: true, secure: config.secure, sameSite: 'strict', maxAge: SESSION_MS },
    }));
    app.use('/api', (req, _res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
        if (useBearer && !req.hasValidBearerSession && req.path !== '/auth/login') return next(httpError(401, '로그인이 필요하거나 세션이 만료되었습니다.'));
        if (!originsMatch(req.get('origin'), config.origin) || !req.session.csrfToken || req.get('x-csrf-token') !== req.session.csrfToken) return next(httpError(403, '요청 인증에 실패했습니다. 새로고침 후 다시 시도해 주세요.'));
        next();
    });
    const snapshot = (req, user) => ({
        user: user ? { uid: user.uid, email: user.email, displayName: user.name } : null,
        profile: user ? present(user) : null,
        csrfToken: req.session.csrfToken,
        expiresAt: user ? req.session.expiresAt : null,
        ...(useBearer ? { sessionToken: req.sessionToken } : {}),
    });
    const findSessionUser = async req => {
        if (!req.session.uid || req.session.expiresAt <= Date.now()) return null;
        const user = useFirebase ? await firebaseUsers.findOne({ uid: req.session.uid }) : await db.collection('users').findOne({ uid: req.session.uid, status: 'approved' });
        // A temporary synchronization lock must deny access without destroying
        // the caller's session. After it clears the version check below still
        // revokes security-sensitive changes; failed sync stays inaccessible.
        if (user?.authSyncPending) throw httpError(503, '계정 정보가 동기화 중입니다. 잠시 후 다시 시도해 주세요.');
        return user && !user.disabled && user.status === 'approved' && !user.authSyncPending && (user.authVersion || 0) === req.session.authVersion && (!useFirebase || user.tokensValidAfterTime === req.session.firebaseTokensValidAfterTime) ? user : null;
    };
    app.get('/api/auth/session', async (req, res) => {
        const user = await findSessionUser(req);
        if (req.session.uid && !user) await regenerate(req);
        req.session.csrfToken ||= newToken();
        if (useBearer) await saveSession(req);
        res.json(snapshot(req, user));
    });
    app.get('/api/auth/consultants', async (req, res) => {
        // 로그인 전 선택 목록은 공개 필드만, 관리자 세션에서는 영수증용 마스터(인적/계좌·장소·단가)까지 반환.
        const sessionUser = await findSessionUser(req).catch(() => null);
        const includeMaster = sessionUser?.role === 'admin';
        const consultants = useFirebase
            ? (await firebaseUsers.find({ role: 'consultant', status: 'approved', hasProfile: true, disabled: { $ne: true }, authSyncPending: { $ne: true } }).sort({ name: 1 }).toArray()).filter(user => normalizedEmail(user.name) !== normalizedEmail(user.email))
            : await db.collection('users').find(
                { role: 'consultant', status: 'approved' },
                includeMaster ? undefined : { projection: { _id: 1, uid: 1, name: 1, role: 1, status: 1 } }
            ).sort({ name: 1 }).toArray();
        res.json(consultants.map(user => (includeMaster ? consultantMasterUser(user) : safeUser(user, false))));
    });
    const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => loginRateKey(req, config.gatewayHmacSecret), message: { error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' } });
    app.post('/api/auth/login', loginLimit, async (req, res) => {
        const identifier = text(req.body.identifier, '아이디', true);
        let fresh;
        if (useFirebase) {
            const byName = req.body.loginByName === true;
            const isEmail = !byName && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
            const filter = byName ? { name: identifier, role: 'consultant', hasProfile: true } : isEmail ? { email: identifier.toLowerCase() } : { userId: identifier };
            const matches = await firebaseUsers.find(filter).limit(2).toArray();
            const found = matches.length === 1 ? matches[0] : null;
            const uid = found && !found.authSyncPending ? await firebaseAuth.signIn(found.email, req.body.password) : null;
            // Verify Firebase at login, then re-read local state to prevent a
            // concurrent account lock or deletion from creating a stale session.
            const remote = uid && uid === found?.uid ? await firebaseDirectory.get(uid) : null;
            const local = remote ? await firebaseUsers.findOne({ uid }) : null;
            if (local && !remote.disabled && !remote.authSyncPending
                && remote.uid === local.uid && normalizedEmail(remote.email) === normalizedEmail(local.email)
                && remote.role === local.role && remote.status === local.status
                && (remote.authVersion || 0) === (local.authVersion || 0)
                && remote.tokensValidAfterTime === local.tokensValidAfterTime) fresh = local;
        } else {
            const filter = req.body.loginByName === true ? { name: identifier, role: 'consultant' } : { $or: [{ userId: identifier }, { email: identifier.toLowerCase() }] };
            const matches = await db.collection('users').find(filter).limit(2).toArray();
            const user = matches.length === 1 ? matches[0] : null;
            if (user && await verifyPassword(req.body.password, user.passwordHash)) {
                fresh = await db.collection('users').findOne({ uid: user.uid, status: 'approved' });
                if ((fresh?.authVersion || 0) !== (user.authVersion || 0)) fresh = null;
            }
        }
        if (!fresh || fresh.disabled || fresh.status !== 'approved' || fresh.authSyncPending) throw httpError(401, '계정 정보 또는 비밀번호가 올바르지 않거나 승인되지 않은 계정입니다.');
        await regenerate(req);
        req.session.uid = fresh.uid;
        req.session.authVersion = fresh.authVersion || 0;
        if (useFirebase) req.session.firebaseTokensValidAfterTime = fresh.tokensValidAfterTime;
        req.session.csrfToken = newToken();
        req.session.expiresAt = Date.now() + SESSION_MS;
        await saveSession(req);
        res.json(snapshot(req, fresh));
    });
    app.post('/api/auth/logout', async (req, res) => {
        await destroySession(req);
        if (!useBearer) res.clearCookie('ewh.sid', { httpOnly: true, secure: config.secure, sameSite: 'strict', path: '/' });
        res.json({ ok: true });
    });
    app.use('/api', async (req, _res, next) => {
        req.user = await findSessionUser(req);
        if (!req.user) throw httpError(401, '로그인이 필요하거나 세션이 만료되었습니다.');
        next();
    });
    app.post('/api/auth/extend', async (req, res) => {
        req.session.expiresAt = Date.now() + SESSION_MS;
        req.session.cookie.maxAge = SESSION_MS;
        await saveSession(req);
        res.json(snapshot(req, req.user));
    });

    app.get('/api/users/check-id', admin, async (req, res) => {
        const userId = text(req.query.userId, '아이디', true);
        res.json({ exists: Boolean(await (useFirebase ? firebaseUsers : db.collection('users')).findOne({ userId }, { projection: { _id: 1 } })) });
    });
    app.get('/api/users', async (req, res) => {
        const users = useFirebase ? (req.user.role === 'consultant' ? [req.user] : await firebaseUsers.find({}).toArray()) : await db.collection('users').find(req.user.role === 'consultant' ? { uid: req.user.uid } : {}).toArray();
        res.json(users.map(user => present(user, req.user.role === 'admin' || req.user.uid === user.uid)));
    });
    app.post('/api/users', admin, async (req, res) => {
        const fields = seal(userFields(req.body));
        if (!fields.name || !fields.userId) throw httpError(400, '이름과 아이디를 입력해 주세요.');
        const uid = randomUUID();
        const now = new Date().toISOString();
        if (useFirebase && !fields.email) throw httpError(400, 'Firebase 로그인에 사용할 이메일을 입력해 주세요.');
        if (useFirebase && await firebaseUsers.findOne({ userId: fields.userId })) throw httpError(409, '이미 사용 중인 아이디입니다.');
        if (typeof req.body.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 256) throw httpError(400, '비밀번호는 8자 이상 256자 이하로 입력해 주세요.');
        const user = { _id: uid, uid, role: 'consultant', status: 'approved', ...fields, authVersion: 0, createdAt: now, updatedAt: now };
        if (useFirebase) {
            // Reserve and deny the account before touching Firebase. Unknown
            // outcomes or partial failures stay locked for manual reconciliation.
            await firebaseUsers.insertOne({ ...user, disabled: user.status !== 'approved', hasProfile: true, tokensValidAfterTime: '', authSyncPending: true });
            try { await firebaseAuth.createUser({ uid, email: fields.email, password: req.body.password, displayName: fields.name, disabled: user.status !== 'approved' }); }
            catch (error) {
                // A timeout can leave an account created remotely even when the response was lost.
                console.error('Firebase account creation failed; inspect UID if outcome is uncertain:', uid);
                throw error;
            }
            const { _id, ...profile } = user;
            await firebaseDirectory.create(uid, { ...profile, authSyncPending: true });
            await firebaseDirectory.finish(uid, {});
            const remote = await firebaseDirectory.get(uid);
            if (!remote || remote.authSyncPending || remote.uid !== uid || normalizedEmail(remote.email) !== normalizedEmail(user.email)
                || remote.role !== user.role || remote.status !== user.status
                || remote.disabled !== (user.status !== 'approved') || (remote.authVersion || 0) !== 0) throw new Error('New Firebase user could not be verified');
            const result = await firebaseUsers.updateOne({ _id: uid, authSyncPending: true, authVersion: 0 }, { $set: { disabled: remote.disabled, tokensValidAfterTime: remote.tokensValidAfterTime, authSyncPending: false } });
            if (!result.matchedCount) throw new Error('New local user lock was lost');
        } else {
            user.passwordHash = await hashPassword(req.body.password);
            await db.collection('users').insertOne(user);
        }
        res.status(201).json(present(user));
    });
    app.patch('/api/users/:id', async (req, res) => {
        const existing = useFirebase ? await firebaseUsers.findOne({ _id: req.params.id }) : await db.collection('users').findOne({ _id: req.params.id });
        if (!existing) throw httpError(404, '회원을 찾을 수 없습니다.');
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && (req.user.role !== 'consultant' || existing.uid !== req.user.uid || Object.keys(req.body).some(key => key !== 'consultingFeesByType'))) throw httpError(403, '본인의 유형별 강사료만 수정할 수 있습니다.');
        const patch = isAdmin ? seal(userFields(req.body)) : { consultingFeesByType: fees(req.body.consultingFeesByType) };
        if (existing.uid === req.user.uid && ((patch.role && patch.role !== existing.role) || (patch.status && patch.status !== 'approved'))) throw httpError(400, '본인 계정의 권한이나 승인은 해제할 수 없습니다.');
        if (existing.authSyncPending) throw httpError(409, '계정 동기화가 중단되어 관리자 확인이 필요합니다.');
        if (useFirebase && patch.userId && patch.userId !== existing.userId && await firebaseUsers.findOne({ userId: patch.userId })) throw httpError(409, '이미 사용 중인 아이디입니다.');
        const changingPassword = isAdmin && req.body.password !== undefined;
        if (changingPassword && (typeof req.body.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 256)) throw httpError(400, '비밀번호는 8자 이상 256자 이하로 입력해 주세요.');
        const firebaseChanges = {};
        if (useFirebase && isAdmin) {
            if (patch.email !== undefined && patch.email !== existing.email) {
                if (!patch.email) throw httpError(400, 'Firebase 로그인에 사용할 이메일을 입력해 주세요.');
                firebaseChanges.email = patch.email;
            }
            if (patch.name !== undefined && patch.name !== existing.name) firebaseChanges.displayName = patch.name;
            if (patch.status !== undefined && patch.status !== existing.status) firebaseChanges.disabled = patch.status !== 'approved';
            if (changingPassword) firebaseChanges.password = req.body.password;
        }
        if (changingPassword && !useFirebase) patch.passwordHash = await hashPassword(req.body.password);
        if (changingPassword) patch.mustResetPassword = false;
        const needsSync = Object.keys(firebaseChanges).length > 0;
        const invalidate = changingPassword || (patch.status && patch.status !== existing.status) || (patch.role && patch.role !== existing.role) || needsSync;
        if (useFirebase) {
            const currentVersion = existing.authVersion || 0;
            const nextVersion = currentVersion + (invalidate ? 1 : 0);
            const locked = await firebaseUsers.updateOne({ _id: existing._id, authSyncPending: { $ne: true }, authVersion: currentVersion }, { $set: { authSyncPending: true, authVersion: nextVersion } });
            if (!locked.matchedCount) throw httpError(409, '계정 정보가 변경 중입니다. 다시 시도해 주세요.');
            const updatedAt = new Date().toISOString();
            if (invalidate) {
                await firebaseDirectory.lock(existing);
                if (needsSync) await firebaseAuth.updateUser(existing.uid, firebaseChanges);
                await firebaseDirectory.finish(existing.uid, { ...patch, updatedAt });
            } else {
                await firebaseDirectory.update(existing, { ...patch, updatedAt });
            }
            const remote = await firebaseDirectory.get(existing.uid);
            const expected = { ...existing, ...patch };
            const expectedDisabled = firebaseChanges.disabled ?? existing.disabled;
            if (!remote || remote.authSyncPending || remote.uid !== existing.uid || normalizedEmail(remote.email) !== normalizedEmail(expected.email)
                || remote.role !== expected.role || remote.status !== expected.status || remote.disabled !== expectedDisabled
                || (remote.authVersion || 0) !== nextVersion) throw new Error('Firebase user state could not be verified');
            const saved = await firebaseUsers.findOneAndUpdate({ _id: existing._id, authSyncPending: true, authVersion: nextVersion }, { $set: { ...patch, updatedAt, disabled: remote.disabled, tokensValidAfterTime: remote.tokensValidAfterTime, hasProfile: remote.hasProfile, authSyncPending: false } }, { returnDocument: 'after' });
            if (!saved) throw new Error('Local user lock was lost');
            return res.json(present(saved));
        }
        const update = { $set: { ...patch, updatedAt: new Date().toISOString() } };
        if (invalidate) update.$inc = { authVersion: 1 };
        const user = await db.collection('users').findOneAndUpdate({ _id: existing._id }, update, { returnDocument: 'after' });
        res.json(present(user));
    });
    app.delete('/api/users/:id', admin, async (req, res) => {
        const target = useFirebase ? await firebaseUsers.findOne({ _id: req.params.id }) : await db.collection('users').findOne({ _id: req.params.id });
        if (!target) throw httpError(404, '회원을 찾을 수 없습니다.');
        if (target.uid === req.user.uid) throw httpError(400, '본인 계정은 삭제할 수 없습니다.');
        if (useFirebase) {
            if (target.authSyncPending) throw httpError(409, '계정 동기화가 중단되어 관리자 확인이 필요합니다.');
            const version = target.authVersion || 0;
            const locked = await firebaseUsers.updateOne({ _id: target._id, authSyncPending: { $ne: true }, authVersion: version }, { $set: { authSyncPending: true, authVersion: version + 1 } });
            if (!locked.matchedCount) throw httpError(409, '계정 정보가 변경 중입니다. 다시 시도해 주세요.');
            await firebaseDirectory.lock(target);
            await firebaseAuth.deleteUser(target.uid);
            await firebaseDirectory.remove(target.uid);
            const removed = await firebaseUsers.deleteOne({ _id: target._id, authSyncPending: true, authVersion: version + 1 });
            if (!removed.deletedCount) throw new Error('Local user lock was lost');
            return res.json({ ok: true });
        }
        await db.collection('users').deleteOne({ _id: target._id });
        res.json({ ok: true });
    });

    app.get('/api/schedules', async (req, res) => {
        const filter = readAll(req.user) ? {} : { consultantId: req.user.uid };
        if (req.query.month !== undefined) {
            if (typeof req.query.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) throw httpError(400, '월 형식이 올바르지 않습니다.');
            filter.month = req.query.month;
        }
        res.json((await db.collection('schedules').find(filter).sort({ date: 1 }).toArray()).map(publicDocument));
    });
    app.post('/api/schedules/import', admin, async (req, res) => res.json(await importSchedules(db, client, req.body, req.user)));
    app.post('/api/schedules', admin, async (req, res) => {
        const now = new Date().toISOString();
        const item = normalizeSchedule({ ...req.body, _id: randomUUID(), createdAt: now, updatedAt: now });
        await withTransaction(client, async session => {
            await db.collection('schedules').insertOne(item, { session });
            await writeChangeLog(db, session, 'ADD', { added: [publicDocument(item)], updated: [], deleted: [] }, req.user);
        });
        res.status(201).json(publicDocument(item));
    });
    app.patch('/api/schedules/:id', admin, async (req, res) => {
        let item;
        await withTransaction(client, async session => {
            const before = await db.collection('schedules').findOne({ _id: req.params.id }, { session });
            if (!before) throw httpError(404, '일정을 찾을 수 없습니다.');
            item = normalizeSchedule({ ...req.body, createdAt: before.createdAt, updatedAt: new Date().toISOString() }, before);
            await db.collection('schedules').replaceOne({ _id: before._id }, item, { session });
            await writeChangeLog(db, session, 'UPDATE', { added: [], updated: [{ before: publicDocument(before), after: publicDocument(item) }], deleted: [] }, req.user);
        });
        res.json(publicDocument(item));
    });
    const removeSchedules = async (req, res, one) => {
        const count = await withTransaction(client, async session => {
            const query = one ? { _id: req.params.id } : {};
            const before = await db.collection('schedules').find(query, { session }).toArray();
            if (one && !before.length) throw httpError(404, '일정을 찾을 수 없습니다.');
            if (before.length) {
                await db.collection('schedules').deleteMany(query, { session });
                await writeChangeLog(db, session, 'DELETE', { added: [], updated: [], deleted: before.map(publicDocument) }, req.user);
            }
            return before.length;
        });
        res.json({ ok: true, deletedCount: count });
    };
    app.delete('/api/schedules/:id', admin, (req, res) => removeSchedules(req, res, true));
    app.delete('/api/schedules', admin, (req, res) => removeSchedules(req, res, false));
    app.get('/api/change-logs', async (req, res) => {
        res.json(readAll(req.user) ? (await db.collection('change_logs').find().sort({ timestamp: -1 }).limit(50).toArray()).map(publicDocument) : []);
    });
    app.post('/api/change-logs/:id/rollback', admin, async (req, res) => res.json(await rollbackImport(db, client, req.params.id, req.user)));

    for (const [path, collection, allowed, required] of [
        ['codes', 'common_codes', ['code', 'name', 'description', 'color', 'borderColor', 'textColor'], ['code', 'name']],
        ['special-schedules', 'special_schedules', ['title', 'date', 'endDate', 'type', 'color', 'textColor', 'memo'], ['title', 'date']],
    ]) {
        const validate = (input, before = {}) => {
            const out = { ...before };
            for (const key of allowed) if (input[key] !== undefined) out[key] = text(input[key], key, required.includes(key));
            for (const key of required) if (!out[key]) throw httpError(400, `${key} 항목을 입력해 주세요.`);
            if (collection === 'special_schedules' && (!/^\d{4}-\d\d-\d\d$/.test(out.date) || !Number.isFinite(new Date(out.date).getTime()) || (out.endDate && (!/^\d{4}-\d\d-\d\d$/.test(out.endDate) || out.endDate < out.date)))) throw httpError(400, '일반 일정의 날짜를 확인해 주세요.');
            return out;
        };
        app.get(`/api/${path}`, async (_req, res) => res.json((await db.collection(collection).find().sort({ [collection === 'common_codes' ? 'code' : 'date']: 1 }).toArray()).map(publicDocument)));
        app.post(`/api/${path}`, admin, async (req, res) => {
            const now = new Date().toISOString();
            const item = { ...validate(req.body), _id: randomUUID(), createdAt: now, updatedAt: now };
            await db.collection(collection).insertOne(item);
            res.status(201).json(publicDocument(item));
        });
        app.patch(`/api/${path}/:id`, admin, async (req, res) => {
            const before = await db.collection(collection).findOne({ _id: req.params.id });
            if (!before) throw httpError(404, '항목을 찾을 수 없습니다.');
            const item = { ...validate(req.body, before), updatedAt: new Date().toISOString() };
            await db.collection(collection).replaceOne({ _id: before._id }, item);
            res.json(publicDocument(item));
        });
        app.delete(`/api/${path}/:id`, admin, async (req, res) => {
            const result = await db.collection(collection).deleteOne({ _id: req.params.id });
            if (!result.deletedCount) throw httpError(404, '항목을 찾을 수 없습니다.');
            res.json({ ok: true });
        });
    }
    app.use('/api', (_req, _res, next) => next(httpError(404, 'API 경로를 찾을 수 없습니다.')));
    const dist = resolve('dist');
    if (existsSync(dist)) {
        app.use(express.static(dist));
        app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
    }
    app.use((error, _req, res, _next) => {
        if (error.code === 11000) return res.status(409).json({ error: '아이디, 이메일, 코드 또는 같은 일시와 담당자의 일정이 이미 존재합니다.' });
        const status = error.status || 500;
        if (status >= 500) console.error('API error:', error.name, error.code || 'internal');
        res.status(status).json({ error: status >= 500 ? '서버 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' : error.message });
    });
    return app;
}
