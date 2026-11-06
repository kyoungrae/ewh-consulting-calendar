import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiBaseUrl } from './build-firebase-hosting.mjs';

test('hosting build preserves the full Funnel mount and API prefix', () => {
    assert.equal(normalizeApiBaseUrl(' https://macbookpro.tailf007d9.ts.net/ewh-calendar/api/ '), 'https://macbookpro.tailf007d9.ts.net/ewh-calendar/api');
    assert.equal(normalizeApiBaseUrl('https://api.example.com/api'), 'https://api.example.com/api');
});

test('hosting build rejects missing, insecure, incomplete, and credential-bearing API URLs', () => {
    for (const value of ['', 'http://localhost:8180/api', 'https://example.com', 'https://example.com/ewh-calendar', 'https://user:password@example.com/api', 'https://example.com/api?secret=value', 'https://example.com/api#fragment']) {
        assert.throws(() => normalizeApiBaseUrl(value));
    }
});
