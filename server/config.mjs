export function readConfig(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const origin = env.APP_ORIGIN || 'http://localhost:5173';
    const sessionTransport = env.SESSION_TRANSPORT || 'cookie';
    const authProvider = env.AUTH_PROVIDER || (production ? 'firebase' : 'mongo');
    if (!['firebase', 'mongo'].includes(authProvider)) throw new Error('AUTH_PROVIDER must be firebase or mongo.');
    let firebase;
    if (authProvider === 'firebase') {
        if (!env.FIREBASE_WEB_API_KEY || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('Firebase authentication requires FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_BASE64.');
        let serviceAccount;
        try { serviceAccount = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')); }
        catch { throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_BASE64.'); }
        if (serviceAccount.project_id !== env.FIREBASE_PROJECT_ID || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Firebase service account does not match FIREBASE_PROJECT_ID.');
        firebase = { apiKey: env.FIREBASE_WEB_API_KEY, projectId: env.FIREBASE_PROJECT_ID, serviceAccount };
    }
    if (!['cookie', 'bearer'].includes(sessionTransport)) throw new Error('SESSION_TRANSPORT must be cookie or bearer.');
    const gatewayHmacSecret = env.GATEWAY_HMAC_SECRET || '';
    if (gatewayHmacSecret && gatewayHmacSecret.length < 32) throw new Error('GATEWAY_HMAC_SECRET must contain at least 32 characters.');
    if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
    if (sessionTransport === 'cookie' && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) throw new Error('SESSION_SECRET must contain at least 32 characters.');
    const secure = env.COOKIE_SECURE === undefined ? production : env.COOKIE_SECURE === 'true';
    if (origin.startsWith('https:') && !secure) throw new Error('HTTPS APP_ORIGIN requires COOKIE_SECURE=true.');
    if (production && !origin.startsWith('https:') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error('Production APP_ORIGIN must use HTTPS (except local preview).');
    return {
        production, origin, secure, sessionTransport, authProvider, firebase,
        port: Number(env.PORT || 3001),
        mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
        database: env.MONGODB_DB || 'ewh_consulting',
        sessionSecret: env.SESSION_SECRET,
        gatewayHmacSecret,
    };
}
