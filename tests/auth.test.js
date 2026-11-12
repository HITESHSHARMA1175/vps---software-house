// Authentication tests (task 36.1): login, 2FA, session cookie flags, logout, TOTP storage forms.
// Validates: Requirements 19.1, 19.2, 7.10, 24.4, 24.5
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, loginAs, TEST_USERS } from './helpers/app.js';
import { parseSetCookie, seedPortalUsers, sessionSetCookie, totpCode, wrongCode } from './helpers/totp.js';
import { parseKey } from '../lib/secretCipher.js';
import { sealTotpSecret, hashBackupCodes } from '../lib/totpSecrets.js';

const SEALED_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const LEGACY_SECRET = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';
const SEALED_BACKUP = 'ABCD1234';
const LEGACY_BACKUP = 'LEGACY99';
const PW = 'Tfa-test-pass-1';

const base = (id, username, role, password) => ({
  id, name: `Test ${username}`, username, password, role, status: 'ACTIVE',
  email: `${username}@example.test`, createdAt: '2026-01-01 00:00:00', lastLogin: '',
});

let app;

beforeAll(async () => {
  const key = parseKey(process.env.PASSWORD_ENCRYPTION_KEY);
  seedPortalUsers([
    base('puser-1', TEST_USERS.admin.username, 'SUPER_ADMIN', TEST_USERS.admin.password),
    base('puser-2', TEST_USERS.employee.username, 'EMPLOYEE', TEST_USERS.employee.password),
    base('puser-3', TEST_USERS.sales.username, 'SALESPERSON', TEST_USERS.sales.password),
    {
      ...base('puser-t1', 'tfa_sealed', 'EMPLOYEE', PW),
      two_factor_enabled: 1,
      two_factor_secret: sealTotpSecret(SEALED_SECRET, key),
      two_factor_temp_secret: sealTotpSecret('PENDINGSECRETPENDINGSECRET', key),
      two_factor_backup_codes: JSON.stringify(hashBackupCodes([SEALED_BACKUP])),
    },
    {
      ...base('puser-t2', 'tfa_legacy', 'EMPLOYEE', PW),
      two_factor_enabled: 1,
      two_factor_secret: LEGACY_SECRET, // legacy plaintext seed
      two_factor_backup_codes: JSON.stringify([LEGACY_BACKUP]), // legacy plaintext backup code
    },
  ]);
  app = await getApp();
});

const login = (username, password) => request(app).post('/api/auth/login').send({ username, password });
const validate = (preAuthToken, code) => request(app).post('/api/auth/2fa/validate-login').send({ preAuthToken, code });

describe('login', () => {
  it('valid credentials issue a session cookie and a public employee body', async () => {
    const res = await login('admin', TEST_USERS.admin.password);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.employee).toMatchObject({ username: 'admin', role: 'SUPER_ADMIN' });
    expect(res.body.employee.password).toBeUndefined();
    expect(sessionSetCookie(res)).not.toBeNull();
  });

  it('wrong password returns 401 INVALID_CREDENTIALS and no cookie', async () => {
    const res = await login('admin', 'definitely-wrong');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('unknown user gets the same 401 message as a wrong password (no enumeration)', async () => {
    const a = await login('no-such-user', 'whatever-1');
    const b = await login('admin', 'whatever-1');
    expect(a.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.headers['set-cookie']).toBeUndefined();
  });

  it('missing fields return 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('the issued cookie authenticates /api/auth/me; without it /me is 401', async () => {
    const { cookie } = await loginAs(app, 'employee');
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.employee.username).toBe('employee');
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

describe('2FA login', () => {
  it('correct password with 2FA enabled returns a preAuthToken and issues no session', async () => {
    const res = await login('tfa_sealed', PW);
    expect(res.status).toBe(200);
    expect(res.body.require2FA).toBe(true);
    expect(typeof res.body.preAuthToken).toBe('string');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a wrong code gives 401 and no session cookie', async () => {
    const { body } = await login('tfa_sealed', PW);
    const res = await validate(body.preAuthToken, wrongCode(SEALED_SECRET));
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('an unknown preAuthToken gives 401 and no session cookie', async () => {
    const res = await validate('f'.repeat(64), totpCode(SEALED_SECRET));
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('missing code gives 400', async () => {
    const { body } = await login('tfa_sealed', PW);
    expect((await request(app).post('/api/auth/2fa/validate-login').send({ preAuthToken: body.preAuthToken })).status).toBe(400);
  });

  it('a user with a sealed secret logs in with a valid TOTP and the token is single use', async () => {
    const { body } = await login('tfa_sealed', PW);
    const res = await validate(body.preAuthToken, totpCode(SEALED_SECRET));
    expect(res.status).toBe(200);
    expect(res.body.employee.username).toBe('tfa_sealed');
    expect(sessionSetCookie(res)).not.toBeNull();
    const again = await validate(body.preAuthToken, totpCode(SEALED_SECRET));
    expect(again.status).toBe(401);
  });

  it('a legacy plaintext TOTP secret still works', async () => {
    const { body } = await login('tfa_legacy', PW);
    const res = await validate(body.preAuthToken, totpCode(LEGACY_SECRET));
    expect(res.status).toBe(200);
    expect(sessionSetCookie(res)).not.toBeNull();
  });

  it('a legacy plaintext backup code works exactly once', async () => {
    const first = await login('tfa_legacy', PW);
    const ok = await validate(first.body.preAuthToken, LEGACY_BACKUP);
    expect(ok.status).toBe(200);
    expect(sessionSetCookie(ok)).not.toBeNull();

    const second = await login('tfa_legacy', PW);
    const replay = await validate(second.body.preAuthToken, LEGACY_BACKUP);
    expect(replay.status).toBe(401);
    expect(replay.headers['set-cookie']).toBeUndefined();
  });

  it('a hashed backup code works exactly once', async () => {
    const first = await login('tfa_sealed', PW);
    const ok = await validate(first.body.preAuthToken, SEALED_BACKUP);
    expect(ok.status).toBe(200);
    const second = await login('tfa_sealed', PW);
    expect((await validate(second.body.preAuthToken, SEALED_BACKUP)).status).toBe(401);
  });
});

describe('secret fields never leave the server', () => {
  const FORBIDDEN = ['two_factor_secret', 'two_factor_temp_secret', 'two_factor_backup_codes'];
  const SECRET_VALUES = [SEALED_SECRET, LEGACY_SECRET, 'PENDINGSECRETPENDINGSECRET', LEGACY_BACKUP, SEALED_BACKUP];

  it('/api/auth/me and /api/employees bodies contain no secret keys or values', async () => {
    const { cookie } = await loginAs(app, 'admin');
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    const list = await request(app).get('/api/employees').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(list.status).toBe(200);
    // The seeded 2FA users are in the list, so the check is not vacuous.
    expect(list.body.employees.map((e) => e.username)).toEqual(expect.arrayContaining(['tfa_sealed', 'tfa_legacy']));
    for (const text of [JSON.stringify(me.body), JSON.stringify(list.body)]) {
      for (const k of FORBIDDEN) expect(text).not.toContain(k);
      for (const v of SECRET_VALUES) expect(text).not.toContain(v);
      expect(text).not.toContain('"password"');
    }
  });

  it('/api/auth/me for a 2FA user reports only the enabled flag', async () => {
    const pre = await login('tfa_legacy', PW);
    // legacy backup code was consumed above; use a fresh TOTP
    const done = await validate(pre.body.preAuthToken, totpCode(LEGACY_SECRET));
    const cookie = done.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.employee.two_factor_enabled).toBe(true);
    for (const k of FORBIDDEN) expect(JSON.stringify(me.body)).not.toContain(k);
  });
});

describe('session cookie attributes (HTTP level, test mode, loopback peer)', () => {
  it('login Set-Cookie has HttpOnly, SameSite=Lax, Max-Age and Path=/; no Secure over plain http', async () => {
    const res = await login('employee', TEST_USERS.employee.password);
    const c = sessionSetCookie(res);
    expect(c.attrs.httponly).toBe(true);
    expect(String(c.attrs.samesite).toLowerCase()).toBe('lax');
    expect(c.attrs.path).toBe('/');
    expect(Number(c.attrs['max-age'])).toBe(24 * 60 * 60);
    expect(c.attrs.secure).toBeUndefined();
  });

  it('logout sends a clearing cookie with matching attributes and ends the session', async () => {
    const { cookie } = await loginAs(app, 'sales');
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const c = sessionSetCookie(res);
    expect(c.value).toBe('');
    expect(c.attrs.httponly).toBe(true);
    expect(String(c.attrs.samesite).toLowerCase()).toBe('lax');
    expect(c.attrs.path).toBe('/');
    expect(new Date(c.attrs.expires).getTime()).toBeLessThan(Date.now());
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('beacon-logout sends a clearing cookie with matching attributes and ends the session', async () => {
    const { cookie } = await loginAs(app, 'sales');
    const res = await request(app).post('/api/auth/beacon-logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const c = sessionSetCookie(res);
    expect(c.value).toBe('');
    expect(c.attrs.httponly).toBe(true);
    expect(String(c.attrs.samesite).toLowerCase()).toBe('lax');
    expect(c.attrs.path).toBe('/');
    expect(new Date(c.attrs.expires).getTime()).toBeLessThan(Date.now());
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('parseSetCookie helper', () => {
  it('parses flags and key/values', () => {
    const c = parseSetCookie('a=b; Path=/; HttpOnly; Max-Age=5');
    expect(c).toMatchObject({ name: 'a', value: 'b', attrs: { path: '/', httponly: true, 'max-age': '5' } });
  });
});
