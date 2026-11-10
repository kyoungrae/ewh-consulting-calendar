import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { loginRateKey } from '../server/gateway-rate.mjs';
import { readConfig } from '../server/config.mjs';

const secret = '0123456789abcdef'.repeat(4);
const now = 1_800_000_000_000;
const timestamp = String(now / 1000);
const signed = ip => ({
    'x-ewh-gateway-ip': ip,
    'x-ewh-gateway-time': timestamp,
    'x-ewh-gateway-signature': createHmac('sha256', secret).update(`ewh-gateway-v1\n${timestamp}\n${ip}`).digest('hex'),
});
const request = headers => ({ ip: '203.0.113.5', get: name => headers[name] });

test('signed gateway clients use independent rate buckets; direct clients keep their IP', () => {
    assert.equal(loginRateKey(request(signed('192.0.2.1')), secret, now), '192.0.2.1');
    assert.equal(loginRateKey(request(signed('192.0.2.2')), secret, now), '192.0.2.2');
    assert.equal(loginRateKey(request({}), secret, now), '203.0.113.5');
    assert.equal(loginRateKey(request({}), '', now), '203.0.113.5');
    assert.throws(() => loginRateKey(request(signed('192.0.2.1')), '', now), { status: 503 });
});

test('untrusted, tampered, expired or malformed gateway headers fail closed', () => {
    const valid = signed('192.0.2.1');
    for (const headers of [
        { ...valid, 'x-ewh-gateway-ip': '192.0.2.9' },
        { ...valid, 'x-ewh-gateway-time': '1800000001' },
        { ...valid, 'x-ewh-gateway-signature': '0'.repeat(64) },
        { ...valid, 'x-ewh-gateway-ip': 'not-an-ip' },
        { ...valid, 'x-ewh-gateway-signature': 'x'.repeat(64) },
        { 'x-ewh-gateway-ip': '192.0.2.1' },
        { 'x-ewh-gateway-time': '' },
    ]) assert.throws(() => loginRateKey(request(headers), secret, now), { status: 503 });
    assert.throws(() => loginRateKey(request(valid), secret, now + 61_000), { status: 503 });
    assert.throws(() => loginRateKey(request(valid), secret, now - 61_000), { status: 503 });
    assert.throws(() => loginRateKey(request(valid), 'wrong-secret-value', now), { status: 503 });
});

test('IPv6 clients use the same subnet aggregation as direct requests', () => {
    const gateway = request(signed('2001:db8:1234:5600::1'));
    const direct = { ip: '2001:db8:1234:5600::2', get: () => undefined };
    assert.equal(loginRateKey(gateway, secret, now), loginRateKey(direct, secret, now));
});

test('configured gateway signing secret must be sufficiently long', () => {
    const env = { AUTH_PROVIDER: 'mongo', GATEWAY_HMAC_SECRET: 'short', SESSION_SECRET: 'x'.repeat(32), PII_ENCRYPTION_KEY: 'test-pii-encryption-key-32chars!!' };
    assert.throws(() => readConfig(env), /GATEWAY_HMAC_SECRET/);
    assert.equal(readConfig({ ...env, GATEWAY_HMAC_SECRET: secret }).gatewayHmacSecret, secret);
});

test('the login rate-limit middleware forwards an invalid gateway signature as a 503', async () => {
    const limiter = rateLimit({ keyGenerator: req => loginRateKey(req, secret, now) });
    const error = await new Promise(resolve => limiter(request({ ...signed('192.0.2.1'), 'x-ewh-gateway-signature': '0'.repeat(64) }), {}, resolve));
    assert.equal(error?.status, 503);
});
