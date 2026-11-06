import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/lib/api.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        values,
    };
}

const json = (body, status = 200) => Response.json(body, { status });
const remote = 'https://macbookpro.example.ts.net/ewh-calendar/api';

test('remote API uses its configured path and bearer sessions without cross-site cookies', async () => {
    const requests = [];
    const storage = memoryStorage();
    const responses = [
        { user: null, csrfToken: 'anonymous-csrf', sessionToken: 'anonymous-token' },
        { user: { uid: 'user' }, csrfToken: 'signed-in-csrf', sessionToken: 'authenticated-token' },
        [],
    ];
    const client = createApiClient({
        baseUrl: `${remote}/`, origin: 'https://calendar.web.app', storage,
        fetchImpl: async (url, options) => { requests.push({ url, options }); return json(responses.shift()); },
    });
    await client.api('/auth/login', { method: 'POST', body: { identifier: 'user', password: 'password' } });
    await client.api('/schedules');
    assert.deepEqual(requests.map(request => request.url), [`${remote}/auth/session`, `${remote}/auth/login`, `${remote}/schedules`]);
    assert.ok(requests.every(request => request.options.credentials === 'omit'));
    assert.equal(requests[0].options.headers.has('Authorization'), false);
    assert.equal(requests[1].options.headers.get('Authorization'), 'Bearer anonymous-token');
    assert.equal(requests[1].options.headers.get('X-CSRF-Token'), 'anonymous-csrf');
    assert.deepEqual(JSON.parse(requests[1].options.body), { identifier: 'user', password: 'password' });
    assert.equal(requests[2].options.headers.get('Authorization'), 'Bearer authenticated-token');
    assert.equal(storage.values.get(`ewh-session:${remote}`), 'authenticated-token');
});

test('manual session extension persists the replacement server token for later requests', async () => {
    const storage = memoryStorage();
    const requests = [];
    const responses = [
        { csrfToken: 'csrf', sessionToken: 'initial-token' },
        { csrfToken: 'extended-csrf', sessionToken: 'extended-token', expiresAt: Date.now() + 1800000 },
        [],
    ];
    const client = createApiClient({
        baseUrl: remote, origin: 'https://calendar.web.app', storage,
        fetchImpl: async (_url, options) => { requests.push(options); return json(responses.shift()); },
    });
    await client.api('/auth/session');
    await client.api('/auth/extend', { method: 'POST' });
    await client.api('/schedules');
    assert.equal(requests[1].headers.get('Authorization'), 'Bearer initial-token');
    assert.equal(requests[1].headers.get('X-CSRF-Token'), 'csrf');
    assert.equal(requests[2].headers.get('Authorization'), 'Bearer extended-token');
    assert.equal(storage.values.get(`ewh-session:${remote}`), 'extended-token');
});

test('saved opaque token is restored after reload and isolated by API base URL', async () => {
    const storage = memoryStorage();
    storage.setItem(`ewh-session:${remote}`, 'saved-opaque-token');
    const requests = [];
    const fetchImpl = async (url, options) => { requests.push({ url, options }); return json({ csrfToken: 'new-csrf' }); };
    const client = createApiClient({ baseUrl: remote, origin: 'https://calendar.web.app', storage, fetchImpl });
    await client.api('/auth/session');
    assert.equal(requests[0].options.headers.get('Authorization'), 'Bearer saved-opaque-token');
    const other = createApiClient({ baseUrl: `${remote}-other`, origin: 'https://calendar.web.app', storage, fetchImpl });
    await other.api('/auth/session');
    assert.equal(requests[1].options.headers.has('Authorization'), false);
});

test('same-origin API keeps cookies and supports both relative and absolute API bases', async () => {
    for (const baseUrl of ['/api', 'https://calendar.example/api']) {
        let captured;
        const client = createApiClient({
            baseUrl, origin: 'https://calendar.example', storage: memoryStorage(),
            fetchImpl: async (_url, options) => { captured = options; return json([]); },
        });
        await client.api('/codes');
        assert.equal(captured.credentials, 'same-origin');
    }
});

test('API configuration rejects insecure remote URLs and only allows local HTTP during development', () => {
    for (const baseUrl of ['http://remote.example/api', 'javascript:alert(1)', 'https://user:secret@example.com/api', 'https://example.com/api?token=secret', '//remote.example/api']) {
        assert.throws(() => createApiClient({ baseUrl, origin: 'https://calendar.example' }));
    }
    assert.throws(() => createApiClient({ baseUrl: 'http://localhost:3001/api', origin: 'https://calendar.example' }));
    assert.doesNotThrow(() => createApiClient({ baseUrl: 'http://localhost:3001/api', origin: 'http://localhost:5173', development: true }));
});

test('401 expires all browser credentials while an incorrect login preserves the anonymous session', async () => {
    const storage = memoryStorage();
    const requests = [];
    let expired = 0;
    const responses = [
        json({ csrfToken: 'csrf', sessionToken: 'token' }),
        json({ error: 'incorrect password' }, 401),
        json({ error: 'expired' }, 401),
        json([]),
    ];
    const client = createApiClient({
        baseUrl: remote, origin: 'https://calendar.web.app', storage, onAuthExpired: () => { expired += 1; },
        fetchImpl: async (_url, options) => { requests.push(options); return responses.shift(); },
    });
    await client.api('/auth/session');
    await assert.rejects(client.api('/auth/login', { method: 'POST', body: {} }), /incorrect password/);
    assert.equal(expired, 0);
    assert.equal(storage.values.size, 1);
    await assert.rejects(client.api('/users'), /expired/);
    assert.equal(expired, 1);
    assert.equal(storage.values.size, 0);
    await client.api('/codes');
    assert.equal(requests[3].headers.has('Authorization'), false);
});

test('session bootstrap requests are deduplicated and explicit logout clears memory and storage', async () => {
    let resolveSession;
    let calls = 0;
    const storage = memoryStorage();
    const client = createApiClient({
        storage,
        fetchImpl: () => { calls += 1; return new Promise(resolve => { resolveSession = resolve; }); },
    });
    const first = client.api('/auth/session');
    const second = client.api('/auth/session');
    assert.equal(calls, 1);
    resolveSession(json({ csrfToken: 'csrf', sessionToken: 'token' }));
    await Promise.all([first, second]);
    assert.equal(storage.values.size, 1);
    client.clearCredentials();
    assert.equal(storage.values.size, 0);
});

test('an old session response cannot restore credentials after local logout', async () => {
    let resolveSession;
    const storage = memoryStorage();
    const requests = [];
    const client = createApiClient({
        storage,
        fetchImpl: (_url, options) => {
            requests.push(options);
            if (requests.length === 1) return new Promise(resolve => { resolveSession = resolve; });
            return Promise.resolve(json([]));
        },
    });
    const pending = client.api('/auth/session');
    client.clearCredentials();
    resolveSession(json({ csrfToken: 'old-csrf', sessionToken: 'old-token' }));
    await pending;
    await client.api('/codes');
    assert.equal(storage.values.size, 0);
    assert.equal(requests[1].headers.has('Authorization'), false);
});

test('storage restrictions retain in-memory login and aborted requests remain abort errors', async () => {
    const requests = [];
    const client = createApiClient({
        storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } },
        fetchImpl: async (_url, options) => {
            requests.push(options);
            if (requests.length === 3) throw new DOMException('aborted', 'AbortError');
            return json(requests.length === 1 ? { sessionToken: 'memory-token' } : []);
        },
    });
    await client.api('/auth/session');
    await client.api('/schedules');
    assert.equal(requests[1].headers.get('Authorization'), 'Bearer memory-token');
    await assert.rejects(client.api('/codes'), { name: 'AbortError' });
});
