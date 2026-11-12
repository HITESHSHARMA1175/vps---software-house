// Task 36.3 (17.4): client export omits passwords by default; includePasswords needs SUPER_ADMIN + confirm.
// Validates: Requirements 6.5 (omit by default), 7.11, 7.12, 19.5
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { installDbGuard, listen, login } from './helpers/blockRealDb.js';
import { getApp } from './helpers/app.js';

installDbGuard();

let app;
afterAll(() => new Promise((r) => (app ? app.close(r) : r())));
let admin;
let employee;
let sales;
const PWS = { a: 'Zq9-Export!Alpha#11', b: 'Zq9-Export!Bravo#22' };
const SRV = 'srv-export-only';
const ACTION = 'CLIENTS_EXPORTED_WITH_PASSWORDS';

const as = (cookie, r) => r.set('Cookie', cookie);
const exp = (cookie, body) => as(cookie, request(app).post('/api/clients/export')).send(body);

async function audits() {
  const res = await as(admin, request(app).get('/api/audit-logs'));
  return res.body.auditLogs || [];
}
const exportAudits = async () => (await audits()).filter((l) => l.action === ACTION);

beforeAll(async () => {
  app = await listen(await getApp());
  admin = (await login(app, 'admin'));
  employee = (await login(app, 'employee'));
  sales = (await login(app, 'sales'));
  for (const [k, pw] of Object.entries(PWS)) {
    const r = await as(admin, request(app).post('/api/users')).send({
      id: `user-export-${k}`, company: `Export ${k}`, username: `export${k}`, password: pw, serverId: SRV, drive: 'Drive D', autoProvision: false,
    });
    expect(r.status).toBe(200);
  }
});

describe('default export', () => {
  it('has no password column and writes no audit entry', async () => {
    const before = (await exportAudits()).length;
    const res = await exp(admin, { serverId: SRV });
    expect(res.status).toBe(200);
    expect(res.body.includePasswords).toBe(false);
    expect(res.body.count).toBe(2);
    for (const row of res.body.clients) {
      expect(Object.keys(row)).not.toContain('password');
    }
    for (const pw of Object.values(PWS)) expect(res.text).not.toContain(pw);
    expect(res.text).not.toMatch(/enc:v1:/);
    expect((await exportAudits()).length).toBe(before);
  });

  it('is available to non-admin roles without passwords', async () => {
    const res = await exp(employee, { serverId: SRV });
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/enc:v1:/);
  });
});

describe('includePasswords guards', () => {
  it('SUPER_ADMIN without confirm gets 403, nothing decrypted, no audit', async () => {
    const before = (await exportAudits()).length;
    for (const body of [{ serverId: SRV, includePasswords: true }, { serverId: SRV, includePasswords: true, confirm: 'true' }, { serverId: SRV, includePasswords: true, confirm: false }]) {
      const res = await exp(admin, body);
      expect(res.status).toBe(403);
      for (const pw of Object.values(PWS)) expect(res.text).not.toContain(pw);
    }
    expect((await exportAudits()).length).toBe(before);
  });

  it.each([['employee'], ['sales']])('%s with confirm still gets 403, nothing decrypted, no audit', async (who) => {
    const cookie = who === 'employee' ? employee : sales;
    const before = (await exportAudits()).length;
    const res = await exp(cookie, { serverId: SRV, includePasswords: true, confirm: true });
    expect(res.status).toBe(403);
    for (const pw of Object.values(PWS)) expect(res.text).not.toContain(pw);
    expect((await exportAudits()).length).toBe(before);
  });

  it('unauthenticated callers are rejected', async () => {
    const res = await request(app).post('/api/clients/export').send({ serverId: SRV, includePasswords: true, confirm: true });
    expect([401, 403]).toContain(res.status);
  });
});

describe('confirmed SUPER_ADMIN export', () => {
  it('returns plaintext and writes exactly ONE audit entry with actor, row count, timestamp and no password text', async () => {
    const before = await exportAudits();
    const res = await exp(admin, { serverId: SRV, includePasswords: true, confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.includePasswords).toBe(true);
    expect(res.body.count).toBe(2);
    const byUser = Object.fromEntries(res.body.clients.map((c) => [c.username, c.password]));
    expect(byUser.exporta).toBe(PWS.a);
    expect(byUser.exportb).toBe(PWS.b);
    expect(res.headers['cache-control']).toMatch(/no-store/);

    const after = await exportAudits();
    expect(after.length - before.length).toBe(1);
    const entry = after[0];
    expect(entry.operator).toBeTruthy();
    expect(entry.role).toBe('SUPER_ADMIN');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(entry.details).toMatch(/\b2\b/);
    const text = JSON.stringify(entry);
    for (const pw of Object.values(PWS)) expect(text).not.toContain(pw);
    expect(text).not.toMatch(/enc:v1:/);
  });
});
