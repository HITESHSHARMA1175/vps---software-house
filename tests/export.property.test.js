// Feature: production-hardening, Property 25: Exports omit passwords by default and decrypt only for a confirming SUPER_ADMIN
// **Validates: Requirements 6.5**
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { installDbGuard, listen, login } from './helpers/blockRealDb.js';
import { getApp } from './helpers/app.js';

installDbGuard();

let app;
const cookies = {};
afterAll(() => new Promise((r) => (app ? app.close(r) : r())));

const as = (cookie, r) => r.set('Cookie', cookie);
const ACTION = 'CLIENTS_EXPORTED_WITH_PASSWORDS';
async function exportAuditCount() {
  const res = await as(cookies.admin, request(app).get('/api/audit-logs'));
  return (res.body.auditLogs || []).filter((l) => l.action === ACTION).length;
}

beforeAll(async () => {
  app = await listen(await getApp());
  for (const k of ['admin', 'employee', 'sales']) cookies[k] = await login(app, k);
});

const alnum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const pwArb = fc.string({ minLength: 10, maxLength: 20, unit: fc.constantFrom(...alnum) }).map((s) => `Zq9-${s}!#x`);
const flagArb = fc.constantFrom(undefined, true, false, 'true', 1, null);

let seq = 0;

describe('Property 25: export password handling', () => {
  it('omits passwords and enc:v1: unless SUPER_ADMIN with includePasswords===true and confirm===true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(pwArb, { minLength: 0, maxLength: 3 }),
        fc.constantFrom('admin', 'employee', 'sales'),
        flagArb,
        flagArb,
        async (pws, role, includePasswords, confirm) => {
          const serverId = `srv-p25-${Date.now()}-${++seq}`;
          const usernames = {};
          for (let i = 0; i < pws.length; i++) {
            const username = `p25u${seq}x${i}`;
            usernames[username] = pws[i];
            const r = await as(cookies.admin, request(app).post('/api/users')).send({
              id: `user-${username}`, company: `P25 ${username}`, username, password: pws[i], serverId, drive: 'Drive D', autoProvision: false,
            });
            expect(r.status).toBe(200);
          }

          const before = await exportAuditCount();
          const body = { serverId };
          if (includePasswords !== undefined) body.includePasswords = includePasswords;
          if (confirm !== undefined) body.confirm = confirm;
          const res = await as(cookies[role], request(app).post('/api/clients/export')).send(body);

          const wants = includePasswords === true;
          const allowed = wants && role === 'admin' && confirm === true;
          const after = await exportAuditCount();

          if (wants && !allowed) {
            expect(res.status).toBe(403);
            for (const pw of pws) expect(res.text).not.toContain(pw);
            expect(res.text).not.toMatch(/enc:v1:/);
            expect(after).toBe(before);
            return;
          }

          expect(res.status).toBe(200);
          expect(res.text).not.toContain('Pass#123');
          // Salespeople only see their own clients; none of these have a salesAgent.
          const expectedCount = role === 'sales' ? 0 : pws.length;
          expect(res.body.count).toBe(expectedCount);
          expect(res.body.clients.length).toBe(expectedCount);
          expect(res.text).not.toMatch(/enc:v1:/);

          if (allowed) {
            expect(res.body.includePasswords).toBe(true);
            const got = Object.fromEntries(res.body.clients.map((c) => [c.username, c.password]));
            for (const [u, pw] of Object.entries(usernames)) expect(got[u]).toBe(pw);
            expect(after - before).toBe(1);
          } else {
            expect(res.body.includePasswords).toBe(false);
            for (const pw of pws) expect(res.text).not.toContain(pw);
            for (const row of res.body.clients) expect(Object.keys(row)).not.toContain('password');
            expect(after).toBe(before);
          }
        },
      ),
      { numRuns: 40 },
    );
  }, 120000);
});
