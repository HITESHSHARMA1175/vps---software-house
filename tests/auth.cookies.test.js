// Secure-flag behaviour of the session cookie at HTTP level (task 36.1, task 32).
// Each scenario re-imports server.js with its own environment (vi.resetModules).
// Validates: Requirements 24.4, 24.5
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { seedPortalUsers, sessionSetCookie } from './helpers/totp.js';

const ADMIN_PASS = 'Cookie-Test-Admin-1!';
const SAVED = { ...process.env };

async function freshApp(env) {
  vi.resetModules();
  Object.assign(process.env, env);
  seedPortalUsers([{
    id: 'puser-1', name: 'Admin', username: 'admin', password: ADMIN_PASS, role: 'SUPER_ADMIN',
    status: 'ACTIVE', email: 'a@example.test', createdAt: '2026-01-01 00:00:00',
  }]);
  const { getApp } = await import('./helpers/app.js');
  return getApp();
}

const login = (app, headers = {}) =>
  request(app).post('/api/auth/login').set(headers).send({ username: 'admin', password: ADMIN_PASS });

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

describe('session cookie Secure flag', () => {
  it('production mode: login, logout and beacon-logout cookies all carry Secure', async () => {
    const app = await freshApp({
      NODE_ENV: 'production',
      PORTAL_BASE_URL: 'https://vps.example.test',
      ALLOW_JSON_FALLBACK: '1',
      SUPERADMIN_DEFAULT_PASS: ADMIN_PASS,
    });
    const res = await login(app);
    expect(res.status).toBe(200);
    const c = sessionSetCookie(res);
    expect(c.attrs.secure).toBe(true);
    expect(c.attrs.httponly).toBe(true);
    expect(String(c.attrs.samesite).toLowerCase()).toBe('lax');
    expect(c.attrs.path).toBe('/');
    expect(Number(c.attrs['max-age'])).toBe(86400);

    const cookie = `vps_session_id=${c.value}`;
    for (const path of ['/api/auth/logout', '/api/auth/beacon-logout']) {
      const out = await request(app).post(path).set('Cookie', cookie);
      const cc = sessionSetCookie(out);
      expect(cc.value).toBe('');
      expect(cc.attrs.secure).toBe(true);
      expect(cc.attrs.httponly).toBe(true);
      expect(String(cc.attrs.samesite).toLowerCase()).toBe('lax');
      expect(cc.attrs.path).toBe('/');
    }
  });

  it('non-production, trusted proxy (loopback) with x-forwarded-proto: https adds Secure', async () => {
    const app = await freshApp({ NODE_ENV: 'test' });
    const res = await login(app, { 'x-forwarded-proto': 'https' });
    expect(sessionSetCookie(res).attrs.secure).toBe(true);
  });

  it('non-production, plain http without a forwarded header has no Secure', async () => {
    const app = await freshApp({ NODE_ENV: 'test' });
    const res = await login(app);
    expect(sessionSetCookie(res).attrs.secure).toBeUndefined();
  });

  it('a forged x-forwarded-proto: https from an untrusted peer does not add Secure (login and logout)', async () => {
    const app = await freshApp({ NODE_ENV: 'test', TRUSTED_PROXIES: '10.0.0.1' });
    const res = await login(app, { 'x-forwarded-proto': 'https' });
    expect(res.status).toBe(200);
    const c = sessionSetCookie(res);
    expect(c.attrs.secure).toBeUndefined();
    const out = await request(app).post('/api/auth/logout')
      .set('Cookie', `vps_session_id=${c.value}`).set('x-forwarded-proto', 'https');
    expect(sessionSetCookie(out).attrs.secure).toBeUndefined();
  });
});
