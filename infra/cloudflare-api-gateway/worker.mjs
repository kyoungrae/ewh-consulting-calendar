// This worker exposes a public HTTPS API URL and relays to the existing server.
// The destination is fixed: request paths, headers and redirects cannot choose it.
const UPSTREAM_API = 'https://macbookpro.tailf007d9.ts.net/ewh-calendar/api';
const FRONTEND_ORIGIN = 'https://ewha-consulting.web.app';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'origin', 'x-csrf-token', 'access-control-request-method', 'access-control-request-headers'];
const RESPONSE_HEADERS = ['content-type', 'retry-after', 'ratelimit', 'ratelimit-policy', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age', 'vary'];
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);

async function signedClientHeaders(request, secret) {
    // Same-zone Worker subrequests can alter x-real-ip and therefore the
    // connecting IP. Cloudflare marks Worker subrequests with CF-Worker.
    if (request.headers.has('cf-worker')) return null;
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip || ip.length > 45 || typeof secret !== 'string' || secret.length < 32) return null;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`ewh-gateway-v1\n${timestamp}\n${ip}`));
    const signature = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return { ip, timestamp, signature };
}

function errorResponse(status, message, request) {
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' });
    if (request.headers.get('origin') === FRONTEND_ORIGIN) headers.set('access-control-allow-origin', FRONTEND_ORIGIN);
    return new Response(JSON.stringify({ error: message }), { status, headers });
}

function boundedBody(body, state) {
    let size = 0;
    return body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            size += chunk.byteLength;
            if (size > MAX_BODY_BYTES) {
                state.exceeded = true;
                throw new Error('Request body exceeds limit');
            }
            controller.enqueue(chunk);
        },
    }));
}

export async function handleRequest(request, fetchImpl = fetch, env = {}) {
    if (!METHODS.has(request.method)) return errorResponse(405, '허용되지 않은 요청 방식입니다.', request);
    const url = new URL(request.url);
    if (!/^\/api(?:\/|$)/.test(url.pathname) || /\\|%(?:2e|2f|5c)/i.test(url.pathname)) {
        return errorResponse(400, '올바르지 않은 요청 경로입니다.', request);
    }
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
    }
    const limit = { exceeded: false };
    try {
        if (request.method === 'POST' && /^\/api\/auth\/login\/?$/i.test(url.pathname)) {
            const signed = await signedClientHeaders(request, env.GATEWAY_HMAC_SECRET);
            if (!signed) return errorResponse(503, '로그인 연결을 준비하지 못했습니다.', request);
            headers.set('x-ewh-gateway-ip', signed.ip);
            headers.set('x-ewh-gateway-time', signed.timestamp);
            headers.set('x-ewh-gateway-signature', signed.signature);
        }
        const declared = request.headers.get('content-length');
        if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return errorResponse(413, '요청 크기가 너무 큽니다.', request);
        const body = !['GET', 'HEAD'].includes(request.method) && request.body
            ? boundedBody(request.body, limit) : undefined;
        const upstream = await fetchImpl(`${UPSTREAM_API}${url.pathname.slice(4)}${url.search}`, {
            method: request.method, headers, body, ...(body ? { duplex: 'half' } : {}),
            redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(50_000),
        });
        if (upstream.status >= 300 && upstream.status < 400) return errorResponse(502, '서버 응답을 처리할 수 없습니다.', request);
        const outgoing = new Headers({ 'cache-control': 'no-store' });
        for (const name of RESPONSE_HEADERS) {
            const value = upstream.headers.get(name);
            if (value !== null) outgoing.set(name, value);
        }
        return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: outgoing });
    } catch {
        if (limit.exceeded) return errorResponse(413, '요청 크기가 너무 큽니다.', request);
        return errorResponse(502, '서버에 연결하지 못했습니다.', request);
    }
}

export default { fetch(request, env) { return handleRequest(request, fetch, env); } };
