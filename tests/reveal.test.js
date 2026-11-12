// Task 36.3: password reveal. SUPER_ADMIN only; exactly one audit entry; nothing decrypted for other roles.
// Validates: Requirements 7.11, 7.12, 19.5
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { installDbGuard, listen, login } from './helpers/blockRealDb.js';
import { getApp } from './helpers/app.js';
import * as secretCipher from '../lib/secretCipher.js';

installDbGuard();

let app;
afterAll(() => new Promise((r) => (app ? app.close(r) : r())));
let admin;
let employee;
let sales;
const CLIENT_PW = 'Zq9-Reveal!Client#77';
const SERVER_PW = 'Zq9-Reveal!Server#88';

const as = (cookie, r) => r.set('Cookie', cookie);

async function auditEntries(action) {
  const res = await as(admin, request(app).get('/api/audit-logs'));
  expect(res.status).toBe(200);
  return (res.body.auditLogs || []).filter((l) => l.action === action);
}

beforeAll(async () => {
  app = await listen(await getApp());
  admin = (await login(app, 'admin'));
  employee = (await login(app, 'employee'));
  sales = (await login(app, 'sales'));
  expect(admin && employee && sales).toBeTruthy();

  const c = await as(admin, request(app).post('/api/users')).send({
    id: 'user-reveal-1', company: 'Reveal Co', username: 'revealco', password: CLIENT_PW, serverId: 'srv-reveal', drive: 'Drive D', autoProvision: false,
  });
  expect(c.status).toBe(200);
  const s = await as(admin, request(app).post('/api/servers')).send({
    id: 'srv-reveal', name: 'Reveal Srv', ipPort: '10.9.0.1:3389', superClientUser: 'sa', superClientPass: SERVER_PW, totalUsersLimit: 5,
  });
  expect(s.status).toBeLessThan(300);
});

describe('client password reveal', () => {
  it('SUPER_ADMIN gets the plaintext and exactly one audit entry without any password text', async () => {
    const before = (await auditEntries('PASSWORD_REVEALED')).length;
    const res = await as(admin, request(app).post('/api/clients/user-reveal-1/reveal-password')).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, password: CLIENT_PW });
    expect(res.headers['cache-control']).toMatch(/no-store/);

    const after = await auditEntries('PASSWORD_REVEALED');
    expect(after.length - before).toBe(1);
    const entry = after[0];
    expect(entry.target).toBe('user-reveal-1');
    expect(entry.operator).toBeTruthy();
    expect(entry.role).toBe('SUPER_ADMIN');
    expect(JSON.stringify(entry)).not.toContain(CLIENT_PW);
    expect(JSON.stringify(entry)).not.toMatch(/enc:v1:/);
  });

  it.each([['employee'], ['sales']])('%s gets 403, no audit entry, and nothing is decrypted', async (who) => {
    const cookie = who === 'employee' ? employee : sales;
    const before = (await auditEntries('PASSWORD_REVEALED')).length;
    const res = await as(cookie, request(app).post('/api/clients/user-reveal-1/reveal-password')).send({});
    expect(res.status).toBe(403);
    expect(res.text).not.toContain(CLIENT_PW);
    expect((await auditEntries('PASSWORD_REVEALED')).length).toBe(before);
  });

  it('unauthenticated callers are rejected', async () => {
    const res = await request(app).post('/api/clients/user-reveal-1/reveal-password').send({});
    expect([401, 403]).toContain(res.status);
    expect(res.text).not.toContain(CLIENT_PW);
  });

  it('unknown client is 404 and writes no audit entry', async () => {
    const before = (await auditEntries('PASSWORD_REVEALED')).length;
    const res = await as(admin, request(app).post('/api/clients/nope/reveal-password')).send({});
    expect(res.status).toBe(404);
    expect((await auditEntries('PASSWORD_REVEALED')).length).toBe(before);
  });
});

describe('server super-client password reveal', () => {
  it('SUPER_ADMIN gets the plaintext and exactly one audit entry', async () => {
    const before = (await auditEntries('PASSWORD_REVEALED')).length;
    const res = await as(admin, request(app).post('/api/servers/srv-reveal/reveal-password')).send({});
    expect(res.status).toBe(200);
    expect(res.body.password).toBe(SERVER_PW);
    const after = await auditEntries('PASSWORD_REVEALED');
    expect(after.length - before).toBe(1);
    expect(JSON.stringify(after[0])).not.toContain(SERVER_PW);
  });

  it('EMPLOYEE gets 403 and no audit entry', async () => {
    const before = (await auditEntries('PASSWORD_REVEALED')).length;
    const res = await as(employee, request(app).post('/api/servers/srv-reveal/reveal-password')).send({});
    expect(res.status).toBe(403);
    expect(res.text).not.toContain(SERVER_PW);
    expect((await auditEntries('PASSWORD_REVEALED')).length).toBe(before);
  });
});

describe('nothing is decrypted for non-SUPER_ADMIN', () => {
  it('openPassword is never reached on a 403 reveal', async () => {
    // Observable proxy: a client whose ciphertext is corrupt answers 500 to SUPER_ADMIN (decrypt attempted)
    // but a plain 403 to EMPLOYEE (role check first, no decrypt attempted).
    const sealed = secretCipher.sealPassword('whatever-pw-1', Buffer.from(process.env.PASSWORD_ENCRYPTION_KEY, 'hex'));
    const tampered = `${sealed.slice(0, -4)}${sealed.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    const c = await as(admin, request(app).post('/api/users')).send({
      id: 'user-reveal-bad', company: 'Bad Co', username: 'badco', password: tampered, serverId: 'srv-reveal', autoProvision: false,
    });
    expect(c.status).toBe(200);
    const asAdmin = await as(admin, request(app).post('/api/clients/user-reveal-bad/reveal-password')).send({});
    expect(asAdmin.status).toBe(500);
    const asEmp = await as(employee, request(app).post('/api/clients/user-reveal-bad/reveal-password')).send({});
    expect(asEmp.status).toBe(403);
  });
});
