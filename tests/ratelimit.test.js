// Task 36.10: rate limit regressions at HTTP level (forgot-password, public endpoints, 2FA validate, agent auth failures).
// Each scenario re-imports server.js (vi.resetModules) so limiter counters start empty.
// Validates: Requirements 17.1, 17.2, 24.4 (tasks 29.5, 29.6)
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

const SAVED = { ...process.env };

async function freshApp(env = {}) {
  vi.resetModules();
  Object.assign(process.env, env);
  const { getApp } = await import('./helpers/app.js');
  return getApp();
}

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

/** Sends `n` requests through `send(i)`; returns the responses in order. */
async function burst(n, send) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await send(i));
  return out;
}

function expect429(res) {
  expect(res.status).toBe(429);
  expect(res.body.success).toBe(false);
  expect(Number.isInteger(res.body.retryAfterSeconds)).toBe(true);
  expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
}

describe('forgot-password request-otp', () => {
  it('first request is not 429; the request beyond the limit is 429 with retryAfterSeconds and no OTP', async () => {
    const app = await freshApp();
    // Unknown account: the safe response path, so no mail transport is ever used.
    const send = () => request(app).post('/api/forgot-password/request-otp').send({ username: 'nobody-here' });
    const results = await burst(3, send);
    expect(results[0].status).not.toBe(429);
    for (const r of results) expect(r.status).toBe(200);

    const blocked = await send();
    expect429(blocked);
    const text = JSON.stringify(blocked.body);
    expect(text).not.toMatch(/\b\d{6}\b/);
    expect(blocked.body.otpCode).toBeUndefined();
    expect(blocked.body.token).toBeUndefined();
    expect(blocked.body.maskedEmail).toBeUndefined();
  });
});

describe('public endpoint limits', () => {
  it('request-demo: 429 with retryAfterSeconds past 5 per IP', async () => {
    const app = await freshApp();
    const send = () => request(app).post('/api/public/request-demo').send({});
    const first = await burst(5, send);
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await send());
  });

  it('public/tickets: 429 past 10 per IP', async () => {
    const app = await freshApp();
    const send = () => request(app).post('/api/public/tickets').send({});
    const first = await burst(10, send);
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await send());
  });

  it('verify-customer: per-IP limit of 5 (different identifiers each time)', async () => {
    const app = await freshApp();
    const send = (i) => request(app).post('/api/public/verify-customer').send({ username: `user${i}`, phone: `98765432${i}0` });
    const first = await burst(5, send);
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await send(9));
  });

  it('verify-customer: per username+phone limit of 3 across different IPs', async () => {
    const app = await freshApp();
    const send = (ip) => request(app)
      .post('/api/public/verify-customer')
      .set('X-Forwarded-For', ip)
      .send({ username: 'targetuser', phone: '9876543210' });
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      expect((await send(ip)).status).not.toBe(429);
    }
    expect429(await send('198.51.100.4'));
    // A different identifier from a fresh IP is unaffected.
    const other = await request(app)
      .post('/api/public/verify-customer')
      .set('X-Forwarded-For', '198.51.100.5')
      .send({ username: 'someoneelse', phone: '9123456780' });
    expect(other.status).not.toBe(429);
  });

  it('reset-password: per-IP limit of 5', async () => {
    const app = await freshApp();
    const send = (i) => request(app)
      .post('/api/forgot-password/reset-password')
      .send({ username: `reset-user-${i}`, otpCode: '123456', newPassword: 'a-long-enough-pass-1' });
    const first = await burst(5, send);
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await send(99));
  });

  it('reset-password: OTP guesses per username are limited to 5', async () => {
    const app = await freshApp({ RATE_LIMIT_RESET_PASSWORD_MAX: '1000' });
    const send = () => request(app)
      .post('/api/forgot-password/reset-password')
      .send({ username: 'otp-victim', otpCode: '000000', newPassword: 'a-long-enough-pass-1' });
    const first = await burst(5, send);
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await send());
  });
});

describe('2fa/validate-login limits', () => {
  const validate = (app, preAuthToken, headers = {}) =>
    request(app).post('/api/auth/2fa/validate-login').set(headers).send({ preAuthToken, code: '123456' });

  it('per preAuthToken: 429 past 5 attempts', async () => {
    const app = await freshApp();
    const first = await burst(5, () => validate(app, 'token-a'));
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await validate(app, 'token-a'));
    // A different token from the same IP is still allowed.
    expect((await validate(app, 'token-b')).status).not.toBe(429);
  });

  it('per IP: 429 past 20 attempts even with a new token each time', async () => {
    const app = await freshApp();
    const first = await burst(20, (i) => validate(app, `tok-${i}`));
    for (const r of first) expect(r.status).not.toBe(429);
    expect429(await validate(app, 'tok-fresh'));
    // Another IP is unaffected.
    expect((await validate(app, 'tok-other', { 'X-Forwarded-For': '203.0.113.77' })).status).not.toBe(429);
  });
});

describe('agent authentication failures', () => {
  it('answers 429 with retryAfterSeconds once failures from one IP pass the limit', async () => {
    const app = await freshApp({ AGENT_AUTH_MODE: 'enforce', RATE_LIMIT_AGENT_AUTH_FAIL_MAX: '3' });
    const bad = (headers = {}) => request(app)
      .post('/api/agent/telemetry')
      .set('X-Agent-Key', 'ak_' + 'Z'.repeat(43))
      .set(headers)
      .send({ serverId: 'no-such-server' });
    const first = await burst(3, () => bad());
    for (const r of first) expect(r.status).toBe(401);
    expect429(await bad());
    // Failures are counted per client IP: another IP still gets a plain 401.
    expect((await bad({ 'X-Forwarded-For': '203.0.113.50' })).status).toBe(401);
  });
});
