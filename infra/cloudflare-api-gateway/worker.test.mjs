import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleRequest } from './worker.mjs';
import { loginRateKey } from '../../server/gateway-rate.mjs';

const secret = 'example-secret-value-not-for-production'.repeat(2);

test('forwards login request and origin while excluding untrusted forwarding headers and cookies', async () => {
    const request = new Request('https://calendar.workers.dev/api/auth/login?q=%ED%95%9C', {
        method: 'POST', headers: { origin: 'https://ewha-consulting.web.app', authorization: 'Bearer example', 'x-csrf-token': 'example', 'content-type': 'application/json', cookie: 'secret=1', 'x-forwarded-for': '192.0.2.1', 'cf-connecting-ip': '192.0.2.5', 'x-ewh-gateway-ip': '192.0.2.1' },
        body: '{"identifier":"test"}',
    });
    let sent;
    const response = await handleRequest(request, async (url, options) => {
        sent = { url, ...options, body: await new Response(options.body).text() };
        return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'secret=1', 'cache-control': 'public', 'access-control-allow-origin': 'https://ewha-consulting.web.app' } });
    }, { GATEWAY_HMAC_SECRET: secret });
    assert.equal(sent.url, 'https://macbookpro.tailf007d9.ts.net/ewh-calendar/api/auth/login?q=%ED%95%9C');
    assert.equal(sent.body, '{"identifier":"test"}');
    assert.equal(sent.headers.get('authorization'), 'Bearer example');
    assert.equal(sent.headers.get('x-csrf-token'), 'example');
    assert.equal(sent.headers.get('origin'), 'https://ewha-consulting.web.app');
    assert.equal(sent.headers.get('cookie'), null);
    assert.equal(sent.headers.get('x-forwarded-for'), null);
    assert.equal(sent.headers.get('x-ewh-gateway-ip'), '192.0.2.5');
    assert.equal(loginRateKey({ ip: '203.0.113.5', get: name => sent.headers.get(name) }, secret), '192.0.2.5');
    assert.equal(sent.redirect, 'manual');
    assert.equal(sent.cache, 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://ewha-consulting.web.app');
    assert.equal(await response.text(), '{"ok":true}');
});

test('login fails closed without configured signing, client IP, or when sent by another Worker', async () => {
    let calls = 0;
    const relay = async () => { calls++; return new Response(null); };
    const makeRequest = headers => new Request('https://calendar.workers.dev/api/auth/login', { method: 'POST', headers, body: '{}' });
    assert.equal((await handleRequest(makeRequest({ 'cf-connecting-ip': '192.0.2.5' }), relay)).status, 503);
    assert.equal((await handleRequest(makeRequest({}), relay, { GATEWAY_HMAC_SECRET: secret })).status, 503);
    assert.equal((await handleRequest(makeRequest({ 'cf-connecting-ip': '192.0.2.5', 'cf-worker': 'attacker.example' }), relay, { GATEWAY_HMAC_SECRET: secret })).status, 503);
    assert.equal(calls, 0);
});

test('passes preflight headers through and preserves bodyless 204 status', async () => {
    let sent;
    const response = await handleRequest(new Request('https://calendar.workers.dev/api/auth/login', { method: 'OPTIONS', headers: { origin: 'https://ewha-consulting.web.app', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,x-csrf-token' } }), async (url, options) => {
        sent = { url, ...options };
        return new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://ewha-consulting.web.app', 'access-control-allow-headers': 'Authorization, Content-Type, X-CSRF-Token' } });
    });
    assert.equal(sent.headers.get('access-control-request-method'), 'POST');
    assert.equal(sent.headers.get('access-control-request-headers'), 'authorization,content-type,x-csrf-token');
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-headers'), 'Authorization, Content-Type, X-CSRF-Token');
});

test('does not relay redirects, unapproved methods or encoded path delimiters', async () => {
    let called = 0;
    const upstream = async () => { called++; return new Response(null, { status: 302, headers: { location: 'https://other.example/' } }); };
    assert.equal((await handleRequest(new Request('https://calendar.workers.dev/api/%2foutside'), upstream)).status, 400);
    assert.equal((await handleRequest(new Request('https://calendar.workers.dev/api/test', { method: 'PUT' }), upstream)).status, 405);
    const response = await handleRequest(new Request('https://calendar.workers.dev/api/auth/session'), upstream);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('location'), null);
    assert.equal(called, 1);
});

test('limits bodies and hides upstream errors', async () => {
    let called = false;
    const tooLarge = new Request('https://calendar.workers.dev/api/upload', { method: 'POST', headers: { 'content-length': String(12 * 1024 * 1024 + 1) }, body: 'x' });
    assert.equal((await handleRequest(tooLarge, async () => { called = true; })).status, 413);
    assert.equal(called, false);
    const response = await handleRequest(new Request('https://calendar.workers.dev/api/auth/session'), async () => { throw new Error('sensitive upstream details'); });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /sensitive/);
});

test('streams unknown-length bodies and rejects them when the limit is exceeded', async () => {
    let produced = 0;
    let consumed = 0;
    const chunks = 193;
    const chunkSize = 64 * 1024;
    const request = new Request('https://calendar.workers.dev/api/upload', {
        method: 'POST', duplex: 'half',
        body: new ReadableStream({
            pull(controller) {
                if (produced === chunks) return controller.close();
                produced++;
                controller.enqueue(new Uint8Array(chunkSize));
            },
        }),
    });
    const response = await handleRequest(request, async (_url, options) => {
        assert.equal(produced < chunks, true, 'the request begins before the entire body is buffered');
        for await (const chunk of options.body) consumed += chunk.byteLength;
        return new Response(null, { status: 204 });
    });
    assert.equal(response.status, 413);
    assert.equal(consumed, 12 * 1024 * 1024);
});

test('Workers event handler accepts platform environment and execution context arguments', async (t) => {
    const upstream = t.mock.method(globalThis, 'fetch', async () => new Response('{"status":"ok"}', { headers: { 'content-type': 'application/json' } }));
    const response = await worker.fetch(new Request('https://calendar.workers.dev/api/health'), {}, {});
    assert.equal(response.status, 200);
    assert.equal(upstream.mock.calls.length, 1);
});
