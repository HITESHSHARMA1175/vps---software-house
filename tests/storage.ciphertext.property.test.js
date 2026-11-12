import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { getApp } from './helpers/app.js';
import { decrypt, isCiphertext } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 6: Stored Managed_Passwords are ciphertext
// **Validates: Requirements 7.7, 10.10**

// MySQL: use the in-memory fake for this file (the shared setup falls back to a refusing pool).
const fake = vi.hoisted(() => ({ current: null }));
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  fake.current = createFakeMysql();
  return { ...fake.current.mysql, default: fake.current.mysql };
});

const KEY = Buffer.from(process.env.PASSWORD_ENCRYPTION_KEY, 'hex');
const REAL_DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json');

// database.json writes are captured in memory; the real file is never written.
const diskWrites = [];
const realWrite = fs.writeFileSync;
fs.writeFileSync = function patched(file, data, ...rest) {
  if (path.resolve(String(file)).toLowerCase() === REAL_DB.toLowerCase()) {
    diskWrites.push(String(data));
    return undefined;
  }
  return realWrite.call(fs, file, data, ...rest);
};

// Long, distinctive passwords so a plaintext substring match cannot be a coincidence.
const pwArb = fc
  .string({ minLength: 14, maxLength: 40, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+=') })
  .filter((s) => !s.startsWith('enc:v1:'));

// MySQL-backed entity writes may not touch database.json at all; an absent payload has nothing to leak.
const lastDisk = () => (diskWrites.length ? diskWrites[diskWrites.length - 1] : '');

const jsonEscaped = (s) => JSON.stringify(s).slice(1, -1);
const serialize = (rows) => JSON.stringify(rows);

function expectCipherOf(stored, plain) {
  expect(typeof stored).toBe('string');
  expect(isCiphertext(stored)).toBe(true);
  expect(decrypt(stored, KEY)).toBe(plain);
}
function expectNoPlain(text, plain) {
  expect(text.includes(plain)).toBe(false);
  expect(text.includes(jsonEscaped(plain))).toBe(false);
}

let app;
let httpServer;
let base;
let cookie;
let n = 0;
const uid = (p) => `${p}-${Date.now()}-${++n}`;

const errorLog = [];
beforeAll(async () => {
  const realError = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errorLog.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    return realError && undefined;
  });
  // initDatabase: undefined -> real initMySQLDatabase against the fake pool (so dbPool writes are observable).
  app = await getApp({ initDatabase: undefined });
  // Own listener: the outbound guard only learns of a port after 'listening', so wait for it before any request.
  httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  await new Promise((r) => setImmediate(r));
  base = `http://127.0.0.1:${httpServer.address().port}`;
  const { default: sup } = await import('supertest');
  const u = (await import('./helpers/app.js')).TEST_USERS.admin;
  const res = await sup(base).post('/api/auth/login').send({ username: u.username, password: u.password });
  cookie = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  expect(cookie).toBeTruthy();
});
afterAll(async () => {
  fs.writeFileSync = realWrite;
  await new Promise((r) => httpServer.close(r));
});

const api = (method, url, body) => request(base)[method](url).set('Cookie', cookie).send(body);

async function createServer(pw) {
  const id = uid('vps-pw');
  const r = await api('post', '/api/servers', { id, name: `n-${id}`, ipPort: '10.9.9.9:443', superClientPass: pw });
  expect(r.status).toBe(200);
  return id;
}
const row = (table, id) => fake.current.rows(table).find((r) => r.id === id);

describe('session validation against the fake MySQL', () => {
  it('validates the session cookie through the sessions/portal_users JOIN and rejects an unknown token', async () => {
    fake.current.clearQueries();
    const ok = await request(base).get('/api/servers').set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(fake.current.queries.some((q) => /FROM\s+`?sessions`?\s+s\s+JOIN\s+`?portal_users`?/i.test(q.sql))).toBe(true);
    const bad = await request(base).get('/api/servers').set('Cookie', cookie.replace(/=[^;]+/g, '=not-a-real-session-token'));
    expect(bad.status).toBe(401);
    expect(errorLog.filter((l) => /Session SQL validation error|unsupported SQL|ER_NOT_SUPPORTED_YET/.test(l))).toEqual([]);
  });
});

describe('Property 6: Stored Managed_Passwords are ciphertext', () => {
  it('server superClientPass is ciphertext in MySQL and in the database.json payload', async () => {
    await fc.assert(
      fc.asyncProperty(pwArb, async (pw) => {
        const id = await createServer(pw);
        const r = row('vps_servers', id);
        expect(r).toBeTruthy();
        expectCipherOf(r.superClientPass, pw);
        expectNoPlain(serialize(r), pw);
        expectNoPlain(lastDisk(), pw);
      }),
      { numRuns: 100 }
    );
  }, 120000);

  it('create, update, and provision paths store the client password and the job password as ciphertext', async () => {
    const serverId = await createServer('Seed-Password-0001');
    await fc.assert(
      fc.asyncProperty(pwArb, pwArb, pwArb, async (pwCreate, pwUpdate, pwProvision) => {
        // create (also queues a provision job)
        const id = uid('user-pw');
        const c = await api('post', '/api/users', { id, company: `Co ${id}`, username: id, password: pwCreate, serverId, drive: 'Drive D' });
        expect(c.status).toBe(200);
        expectCipherOf(row('client_subscriptions', id).password, pwCreate);
        const jobsAfterCreate = fake.current.rows('vps_provision_jobs').filter((j) => j.username === id);
        expect(jobsAfterCreate.length).toBeGreaterThan(0);
        for (const j of jobsAfterCreate) expectCipherOf(j.password, pwCreate);

        // update
        const u = await api('put', `/api/users/${id}`, { company: `Co ${id}`, username: id, password: pwUpdate, serverId, drive: 'Drive D' });
        expect(u.status).toBe(200);
        expectCipherOf(row('client_subscriptions', id).password, pwUpdate);

        // provision with an explicit password
        const p = await api('post', `/api/users/${id}/provision-vps`, { password: pwProvision });
        expect(p.status).toBe(200);
        const jobs = fake.current.rows('vps_provision_jobs').filter((j) => j.username === id);
        expect(jobs.some((j) => j.password && decrypt(j.password, KEY) === pwProvision)).toBe(true);
        for (const j of jobs) expect(isCiphertext(j.password)).toBe(true);

        // plaintext appears in no stored row for this client, nor in the last database.json payload
        const stored = serialize([
          ...fake.current.rows('client_subscriptions').filter((r) => r.id === id),
          ...jobs,
        ]);
        for (const pw of [pwCreate, pwUpdate, pwProvision]) {
          expectNoPlain(stored, pw);
          expectNoPlain(lastDisk(), pw);
        }
      }),
      { numRuns: 100 }
    );
  }, 180000);

  it('bulk import stores each new subscription password as ciphertext', async () => {
    const serverId = await createServer('Seed-Password-0002');
    await fc.assert(
      fc.asyncProperty(fc.array(pwArb, { minLength: 1, maxLength: 4 }), async (pws) => {
        const tag = uid('bulk');
        const entries = pws.map((password, i) => ({ company: `Co ${tag}-${i}`, username: `${tag}-${i}`, serverId, drive: 'Drive D', password }));
        const r = await api('post', '/api/users/bulk-import', { entries });
        expect(r.status).toBe(200);
        expect(r.body.created).toBe(pws.length);
        const rows = fake.current.rows('client_subscriptions');
        pws.forEach((pw, i) => {
          const stored = rows.find((x) => x.username === `${tag}-${i}`);
          expectCipherOf(stored.password, pw);
          expectNoPlain(serialize(stored), pw);
          expectNoPlain(lastDisk(), pw);
        });
      }),
      { numRuns: 100 }
    );
  }, 120000);

  it('migration record stores the client password as ciphertext', async () => {
    const source = await createServer('Seed-Password-0003');
    const target = await createServer('Seed-Password-0004');
    await fc.assert(
      fc.asyncProperty(pwArb, async (pw) => {
        const id = uid('user-mig');
        const c = await api('post', '/api/users', { id, company: `Co ${id}`, username: id, password: pw, serverId: source, drive: 'Drive D', autoProvision: false });
        expect(c.status).toBe(200);
        const m = await api('post', `/api/clients/${id}/migrate`, { targetServerId: target, targetDrive: 'E' });
        expect(m.status).toBe(200);

        // Every stored table row that belongs to this client's migration, whichever store holds it.
        const migTables = fake.current.tables().filter((t) => /migrat/i.test(t));
        const migRows = migTables.flatMap((t) => fake.current.rows(t)).filter((r) => JSON.stringify(r).includes(id));
        const disk = JSON.parse(lastDisk() || '{}');
        const diskMig = (disk.migrations || []).filter((x) => x.clientId === id);
        const all = [...migRows, ...diskMig];
        expect(all.length).toBeGreaterThan(0);
        for (const rec of all) {
          if (typeof rec.password === 'string') expectCipherOf(rec.password, pw);
          expectNoPlain(serialize(rec), pw);
        }
      }),
      { numRuns: 100 }
    );
  }, 120000);
});
