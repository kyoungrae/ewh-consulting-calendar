function browserStorage() {
    try { return globalThis.sessionStorage; }
    catch { return undefined; }
}

function resolveBase(value, origin, development) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('API 서버 주소를 입력해 주세요.');
    const base = value.trim().replace(/\/+$/, '');
    const relative = base.startsWith('/') && !base.startsWith('//');
    let url;
    try { url = new URL(base, origin); }
    catch { throw new Error('API 서버 주소가 올바르지 않습니다.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!relative && !/^https?:\/\//i.test(base)) || base.includes('\\') || url.username || url.password || url.search || url.hash
        || (!relative && url.protocol !== 'https:' && !(development && local && url.protocol === 'http:'))) {
        throw new Error('API 서버는 HTTPS 주소를 사용해 주세요. 로컬 개발 서버만 HTTP를 사용할 수 있습니다.');
    }
    return { base: relative ? base : url.href.replace(/\/+$/, ''), absolute: url.href.replace(/\/+$/, ''), crossOrigin: url.origin !== origin };
}

// Keeping configuration and browser dependencies explicit also lets the remote-login
// flow be checked without a running Firebase host or a browser's cookie settings.
export function createApiClient({
    baseUrl = '/api',
    origin = globalThis.location?.origin || 'http://localhost',
    development = false,
    fetchImpl = (...args) => globalThis.fetch(...args),
    storage = browserStorage(),
    onAuthExpired = () => globalThis.dispatchEvent?.(new Event('ewh-auth-expired')),
} = {}) {
    const { base, absolute, crossOrigin } = resolveBase(baseUrl, origin, development);
    const storageKey = `ewh-session:${absolute}`;
    let csrfToken = null;
    let sessionToken = null;
    let sessionRequest = null;
    let credentialGeneration = 0;

    function rememberSessionToken(value) {
        sessionToken = typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/\s/.test(value) ? value : null;
        try {
            if (sessionToken) storage?.setItem(storageKey, sessionToken);
            else storage?.removeItem(storageKey);
        } catch { /* Private browsing can disable storage; in-memory login still works. */ }
    }
    try { rememberSessionToken(storage?.getItem(storageKey)); }
    catch { /* Fall back to memory when the browser blocks sessionStorage. */ }

    function clearCredentials() {
        credentialGeneration += 1;
        csrfToken = null;
        rememberSessionToken(null);
        sessionRequest = null;
    }

    async function request(path, options) {
        const generation = credentialGeneration;
        const headers = new Headers(options.headers);
        headers.set('Accept', 'application/json');
        const method = (options.method || 'GET').toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            if (!csrfToken) await api('/auth/session');
            headers.set('X-CSRF-Token', csrfToken);
        }
        if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
        const body = options.body === undefined ? undefined : JSON.stringify(options.body);
        if (body !== undefined) headers.set('Content-Type', 'application/json');

        let response;
        try {
            response = await fetchImpl(`${base}${path}`, {
                ...options, method, headers, body,
                credentials: crossOrigin ? 'omit' : 'same-origin',
            });
        } catch (cause) {
            if (cause?.name === 'AbortError') throw cause;
            throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', { cause });
        }
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(
                (typeof data?.error === 'string' ? data.error : data?.message)
                || `요청을 처리하지 못했습니다. (${response.status})`
            );
            error.status = response.status;
            error.code = data?.code;
            if (response.status === 401 && path !== '/auth/login' && generation === credentialGeneration) {
                clearCredentials();
                onAuthExpired();
            }
            throw error;
        }
        if (generation === credentialGeneration && data) {
            if (Object.hasOwn(data, 'csrfToken')) csrfToken = data.csrfToken;
            if (Object.hasOwn(data, 'sessionToken')) rememberSessionToken(data.sessionToken);
        }
        return data;
    }

    async function api(path, options = {}) {
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
            throw new Error('올바르지 않은 API 경로입니다.');
        }
        if (path === '/auth/session' && (!options.method || options.method.toUpperCase() === 'GET')) {
            if (!sessionRequest) {
                const promise = request(path, options).finally(() => {
                    if (sessionRequest === promise) sessionRequest = null;
                });
                sessionRequest = promise;
            }
            return sessionRequest;
        }
        return request(path, options);
    }
    return { api, clearCredentials };
}

const client = createApiClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api',
    development: Boolean(import.meta.env?.DEV),
});

export const api = client.api;
// AuthContext calls this when logging out or expiring the local session. Clear
// both credentials so a page reload cannot restore a session the user closed.
export const clearCsrfToken = client.clearCredentials;
