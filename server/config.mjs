export function readConfig(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const origin = env.APP_ORIGIN || 'http://localhost:5173';
    const sessionTransport = env.SESSION_TRANSPORT || 'cookie';
    if (!['cookie', 'bearer'].includes(sessionTransport)) throw new Error('SESSION_TRANSPORT must be cookie or bearer.');
    if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
    if (sessionTransport === 'cookie' && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) throw new Error('SESSION_SECRET must contain at least 32 characters.');
    const secure = env.COOKIE_SECURE === undefined ? production : env.COOKIE_SECURE === 'true';
    if (origin.startsWith('https:') && !secure) throw new Error('HTTPS APP_ORIGIN requires COOKIE_SECURE=true.');
    if (production && !origin.startsWith('https:') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error('Production APP_ORIGIN must use HTTPS (except local preview).');
    return {
        production, origin, secure, sessionTransport,
        port: Number(env.PORT || 3001),
        mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        database: env.MONGODB_DB || 'ewh_consulting',
        sessionSecret: env.SESSION_SECRET,
    };
}
