import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import session from 'express-session';
import { createApp } from '../server/app.mjs';

test('Firebase login diagnostic logs only fixed failure categories', async t => {
    const lines = [];
    t.mock.method(console, 'warn', (...args) => lines.push(args));
    let scenario = 'lookup_missing';
    const firebaseDirectory = {
        async lookup() {
            return scenario === 'lookup_missing' ? null : { uid: 'profile-uid', email: 'private-email@example.test' };
        },
        async get() {
            return { _id: 'profile-uid', uid: 'profile-uid', name: 'private-name', role: 'admin', status: scenario === 'profile_rejected' ? 'pending' : 'approved' };
        },
    };
    const firebaseAuth = {
        async signIn() {
            if (scenario === 'firebase_credentials_rejected') return null;
            return scenario === 'uid_mismatch' ? 'different-uid' : 'profile-uid';
        },
    };
    const origin = 'http://localhost:5173';
    const server = createApp({ db: {}, client: {}, config: { origin, authProvider: 'firebase', sessionTransport: 'cookie', secure: false, sessionSecret: 'test-session-secret-at-least-32-bytes' }, sessionStore: new session.MemoryStore(), firebaseAuth, firebaseDirectory }).listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const init = await fetch(`${base}/auth/session`, { headers: { Origin: origin } });
        const cookie = init.headers.get('set-cookie').split(';')[0];
        const { csrfToken } = await init.json();
        for (const reason of ['lookup_missing', 'firebase_credentials_rejected', 'uid_mismatch', 'profile_rejected']) {
            scenario = reason;
            const response = await fetch(`${base}/auth/login`, {
                method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ identifier: 'private-identifier', password: 'private-password' }),
            });
            assert.equal(response.status, 401);
            assert.deepEqual(lines.at(-1), ['AUTH_DIAGNOSTIC', reason]);
            assert.doesNotMatch(JSON.stringify(lines.at(-1)), /private-|profile-uid|different-uid/);
        }
        assert.equal(lines.length, 4);
        scenario = 'success';
        const success = await fetch(`${base}/auth/login`, {
            method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ identifier: 'private-identifier', password: 'private-password' }),
        });
        assert.equal(success.status, 200);
        assert.equal(lines.length, 4);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
