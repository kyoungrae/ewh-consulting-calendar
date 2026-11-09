import { createHash, randomBytes } from 'node:crypto';
import { httpError, SESSION_MS } from './security.mjs';

const issueToken = () => randomBytes(32).toString('hex');
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const fields = ['uid', 'authVersion', 'firebaseTokensValidAfterTime', 'csrfToken', 'expiresAt'];

// Match the small express-session interface used by the authentication routes.
// The browser receives the random token; MongoDB stores only its SHA-256 hash.
export function bearerSession(db) {
    const collection = db.collection('api_sessions');
    return async (req, _res, next) => {
        const authorization = req.get('authorization') || '';
        const token = /^Bearer ([a-f0-9]{64})$/i.exec(authorization)?.[1];
        const now = new Date();
        const record = token
            ? await collection.findOne({ _id: tokenHash(token), expiresAt: { $gt: now } })
            : null;
        req.hasValidBearerSession = Boolean(record);

        const attach = (rawToken, data, persisted) => {
            req.sessionToken = rawToken;
            const session = { ...data, cookie: { maxAge: SESSION_MS } };
            req.session = session;
            const id = tokenHash(rawToken);
            Object.defineProperties(session, {
                save: { value(callback) {
                    const saved = Object.fromEntries(fields.filter(key => session[key] !== undefined).map(key => [key, session[key]]));
                    saved.expiresAt ||= Date.now() + SESSION_MS;
                    session.expiresAt = saved.expiresAt;
                    const document = { _id: id, data: saved, expiresAt: new Date(saved.expiresAt) };
                    const operation = persisted
                        ? collection.updateOne({ _id: id, expiresAt: { $gt: new Date() } }, { $set: { data: saved, expiresAt: document.expiresAt } })
                            .then(result => {
                                // A request that began before logout must never resurrect its token.
                                if (!result.matchedCount) throw httpError(401, '로그인 세션이 만료되었습니다.');
                            })
                        : collection.insertOne(document).then(() => { persisted = true; });
                    operation.then(() => callback(), callback);
                    return session;
                } },
                regenerate: { value(callback) {
                    collection.deleteOne({ _id: id }).then(() => {
                        attach(issueToken(), {}, false);
                        callback();
                    }, callback);
                    return session;
                } },
                destroy: { value(callback) {
                    collection.deleteOne({ _id: id }).then(() => {
                        req.session = null;
                        req.sessionToken = null;
                        req.hasValidBearerSession = false;
                        callback();
                    }, callback);
                    return session;
                } },
            });
        };
        attach(record ? token : issueToken(), record?.data || {}, Boolean(record));
        next();
    };
}
