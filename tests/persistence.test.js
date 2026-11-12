// Task 36.12: persistence completeness against the in-memory fake MySQL.
// - A simulated restart (fresh server.js module graph over the same fake database) restores leads, server meta
//   (including the lastHardware drift baseline), client tallyVersion and ticket source.
// - A job that was PROCESSING before the restart still completes through job-result.
// - The migration relay updates client_subscriptions (not clients).
// - Production mode never writes database.json unless ALLOW_JSON_FALLBACK=1.
// Validates: Requirements 10.4, 11.2, 11.5, 24.4, 24.5 (hardening addition; proposed new requirement: "restart restores every persisted entity").
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, createServer, restoreDatabaseJson, restoreEnv, isolateDatabaseJson } from './helpers/agentHarness.js';
import { createFakeMysql } from './helpers/fakeMysql.js';

// One fake MySQL that survives vi.resetModules() so a "restart" sees the data written before it.
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql: make } = await import('./helpers/fakeMysql.js');
  globalThis.__persistFake ??= make();
  return globalThis.__persistFake.moduleExports;
});
globalThis.__persistFake ??= createFakeMysql();
const fake = () => globalThis.__persistFake;

const SAVED = { ...process.env };
const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PROD = {
  NODE_ENV: 'production',
  PORTAL_BASE_URL: 'https://vps.example.test',
  PASSWORD_ENCRYPTION_KEY: KEY,
  SUPERADMIN_DEFAULT_PASS: 'Persist-Test-Admin-1!',
};

let session = null; // { app, cookie }

/** Starts (or restarts) server.js against the shared fake MySQL. */
async function boot(env = {}) {
  delete process.env.ALLOW_JSON_FALLBACK;
  Object.assign(process.env, PROD, env);
  vi.spyOn(process, 'exit').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { app, helper } = await loadApp({ mode: 'warn', realInit: true });
  const cookie = await adminCookie(helper, app);
  session = { app, cookie };
  return session;
}

afterEach(() => {
  restoreDatabaseJson(); // vi.restoreAllMocks() below would otherwise leave the harness believing its fs spies are active
  vi.restoreAllMocks();
  fake().reset();
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});
afterAll(() => {
  restoreEnv();
  restoreDatabaseJson();
});

const dbJsonWrites = (spy) => spy.mock.calls.filter(([p]) => path.basename(String(p)) === 'database.json');
const sha = (file) => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent');
const tick = () => new Promise((r) => setTimeout(r, 25));

const SERVER_A = { id: 'srv-a', ipPort: '203.0.113.10:18526' };
const SERVER_B = { id: 'srv-b', ipPort: '203.0.113.11:18526' };
const HARDWARE = { ramTotalGB: 16, cpuCores: 4, cpuLogical: 8, cpuName: 'Test CPU', diskTotalGB: 200 };
const DISKS = [{ drive: 'C:', totalGB: 100 }, { drive: 'D:', totalGB: 100 }];

const telemetry = (s, serverId, hardware = HARDWARE) =>
  request(s.app).post('/api/agent/telemetry').send({ serverId, cpuUsage: 5, ram: { total: 8, used: 2 }, hardware, disks: DISKS });

const createClient = (s, extra = {}) =>
  request(s.app).post('/api/users').set('Cookie', s.cookie).send({
    company: 'Persist Co', username: 'persistco', password: 'Cl1ent-Pass-9x', serverId: 'srv-a', drive: 'Drive D',
    customerPhone: '9876543210', tallyVersion: 'Prime 4.1', ...extra,
  });

const jobResult = (s, body) => request(s.app).post('/api/agent/job-result').send(body);

describe('restart restores persisted state (Req 10.4, 24.4, 24.5)', () => {
  it('restores workspace_requests leads from MySQL without re-importing or duplicating them', async () => {
    let s = await boot();
    const res = await request(s.app).post('/api/public/request-demo').send({ companyName: 'Lead Co', phone: '5550001' });
    expect(res.status).toBe(200);
    expect(fake().rows('workspace_requests')).toHaveLength(1);
    expect(JSON.parse(fake().rows('workspace_requests')[0].data).companyName).toBe('Lead Co');

    fake().queries.length = 0;
    s = await boot(); // restart
    // The restart loaded the lead (SELECT of data) and, since the table is not empty, did not import legacy leads.
    expect(fake().queries.some((q) => /SELECT\s+`data`\s+FROM\s+`workspace_requests`/i.test(q.sql))).toBe(true);
    expect(fake().queries.some((q) => /INSERT[^]*`workspace_requests`/i.test(q.sql))).toBe(false);
    expect(fake().rows('workspace_requests')).toHaveLength(1);
  });

  it('restores vps_servers.meta including the lastHardware drift baseline', async () => {
    let s = await boot();
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    expect((await telemetry(s, 'srv-a')).status).toBe(200);
    const stored = JSON.parse(fake().rows('vps_servers').find((r) => r.id === 'srv-a').meta);
    expect(stored.lastHardware).toMatchObject({ ramTotalGB: 16, cpuCores: 4, diskTotalGB: 200 });
    const history1 = await request(s.app).get('/api/servers/srv-a/hardware-history').set('Cookie', s.cookie);
    expect(JSON.stringify(history1.body)).toContain('BASELINE_DETECTED');

    s = await boot(); // restart
    const metaWritesBefore = fake().queries.filter((q) => /UPDATE `vps_servers` SET `meta`/.test(q.sql)).length;
    // Identical hardware: the restored baseline hash means no meta rewrite and no second baseline event.
    expect((await telemetry(s, 'srv-a')).status).toBe(200);
    expect(fake().queries.filter((q) => /UPDATE `vps_servers` SET `meta`/.test(q.sql)).length).toBe(metaWritesBefore);
    // Resized RAM is reported as drift against the restored baseline instead of a fresh baseline.
    expect((await telemetry(s, 'srv-a', { ...HARDWARE, ramTotalGB: 32 })).status).toBe(200);
    const history2 = await request(s.app).get('/api/servers/srv-a/hardware-history').set('Cookie', s.cookie);
    const text = JSON.stringify(history2.body);
    expect(text).toContain('RAM_RESIZED');
    expect(text.match(/BASELINE_DETECTED/g) || []).toHaveLength(1);
  });

  it('restores client tallyVersion (used by a migration started after the restart)', async () => {
    let s = await boot();
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    await createServer(request, s.app, s.cookie, { ...SERVER_B });
    const created = await createClient(s);
    expect(created.status).toBe(200);
    const id = created.body.user.id;
    expect(fake().rows('client_subscriptions').find((r) => r.id === id).tallyVersion).toBe('Prime 4.1');

    s = await boot(); // restart
    const list = await request(s.app).get('/api/users').set('Cookie', s.cookie);
    expect(list.body.users.find((u) => u.id === id).tallyVersion).toBe('Prime 4.1');
    // Memory copy (not the SELECT in GET /api/users) feeds the migration record.
    const mig = await request(s.app).post(`/api/clients/${id}/migrate`).set('Cookie', s.cookie).send({ targetServerId: 'srv-b', targetDrive: 'E:' });
    expect(mig.status).toBe(200);
    const row = fake().rows('migrations').find((r) => r.id === mig.body.migrationId);
    expect(JSON.parse(row.data).tallyVersion).toBe('Prime 4.1');
  });

  it('restores ticket source for customer-portal and staff tickets', async () => {
    let s = await boot();
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    await createClient(s);
    const pub = await request(s.app).post('/api/public/tickets').send({ username: 'persistco', phone: '9876543210', subject: 'Slow', description: 'Tally is slow' });
    expect(pub.status).toBeLessThan(300);
    const staff = await request(s.app).post('/api/tickets').set('Cookie', s.cookie).send({ company: 'Persist Co', subject: 'Call', description: 'Phone call', issueCategory: 'General' });
    expect(staff.status).toBeLessThan(300);

    s = await boot(); // restart
    const res = await request(s.app).get('/api/tickets').set('Cookie', s.cookie);
    const sources = res.body.tickets.map((t) => t.source).sort();
    expect(sources).toEqual(['CUSTOMER_PORTAL', 'STAFF']);
  });

  it('completes a job that was PROCESSING before the restart through job-result', async () => {
    let s = await boot();
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    const created = await createClient(s);
    const jobId = created.body.provisionJob.id;
    expect(fake().rows('vps_provision_jobs').find((r) => r.id === jobId)).toBeTruthy();
    expect((await jobResult(s, { serverId: 'srv-a', jobId, status: 'PROCESSING', message: 'working' })).status).toBe(200);
    expect(fake().rows('vps_provision_jobs').find((r) => r.id === jobId).status).toBe('PROCESSING');

    s = await boot(); // restart: only PENDING jobs are reloaded
    const done = await jobResult(s, { serverId: 'srv-a', jobId, status: 'COMPLETED', message: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.success).toBe(true);
    const row = fake().rows('vps_provision_jobs').find((r) => r.id === jobId);
    expect(row.status).toBe('COMPLETED');
    expect(row.resultMessage).toBe('done');
  });
});

describe('migration relay (Req 10.4)', () => {
  it('updates client_subscriptions (never a "clients" table) when the import job completes', async () => {
    const s = await boot();
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    await createServer(request, s.app, s.cookie, { ...SERVER_B });
    const id = (await createClient(s)).body.user.id;
    const mig = await request(s.app).post(`/api/clients/${id}/migrate`).set('Cookie', s.cookie).send({ targetServerId: 'srv-b', targetDrive: 'E:' });
    expect(mig.status).toBe(200);
    const exp = await jobResult(s, { serverId: 'srv-a', jobId: mig.body.jobId, status: 'COMPLETED', message: 'exported', details: { sha256: 'a'.repeat(64), fileSizeBytes: 10 } });
    expect(exp.status).toBe(200);

    const importJob = fake().rows('vps_provision_jobs').find((r) => r.action === 'IMPORT_CLIENT_DATA');
    expect(importJob).toBeTruthy();
    fake().queries.length = 0;
    const imp = await jobResult(s, { serverId: 'srv-b', jobId: importJob.id, status: 'COMPLETED', message: 'imported' });
    expect(imp.status).toBe(200);
    await tick();

    const updates = fake().queries.filter((q) => /^\s*UPDATE\s+`?client_subscriptions`?\s+SET\s+`?serverId`?/i.test(q.sql));
    expect(updates).toHaveLength(1);
    expect(fake().queries.some((q) => /\b(UPDATE|INSERT INTO|REPLACE INTO)\s+`?clients`?\b/i.test(q.sql))).toBe(false);
    const row = fake().rows('client_subscriptions').find((r) => r.id === id);
    expect(row.serverId).toBe('srv-b');
    expect(row.drive).toBe('Drive E');
  });
});

describe('database.json writes (Req 11.2, 11.5)', () => {
  it('production mode never writes database.json during login, client create, telemetry and job completion', async () => {
    const dbFile = isolateDatabaseJson();
    fs.writeFileSync(dbFile, JSON.stringify({ servers: [], users: [], marker: 'untouched' }));
    const s = await boot();
    const write = vi.spyOn(fs, 'writeFileSync');
    write.mockClear();
    const before = sha(dbFile);

    expect((await request(s.app).post('/api/auth/login').send({ username: 'admin', password: PROD.SUPERADMIN_DEFAULT_PASS })).status).toBe(200);
    await createServer(request, s.app, s.cookie, { ...SERVER_A });
    const created = await createClient(s);
    expect(created.status).toBe(200);
    expect((await telemetry(s, 'srv-a')).status).toBe(200);
    expect((await jobResult(s, { serverId: 'srv-a', jobId: created.body.provisionJob.id, status: 'COMPLETED', message: 'ok' })).status).toBe(200);

    expect(dbJsonWrites(write)).toHaveLength(0);
    expect(sha(dbFile)).toBe(before);
  });

  it('with ALLOW_JSON_FALLBACK=1 the file is written', async () => {
    const dbFile = isolateDatabaseJson();
    fs.rmSync(dbFile, { force: true });
    const s = await boot({ ALLOW_JSON_FALLBACK: '1' });
    const write = vi.spyOn(fs, 'writeFileSync');
    write.mockClear();
    expect((await createClient(s, { serverId: '' })).status).toBe(200);
    expect(dbJsonWrites(write).length).toBeGreaterThan(0);
    const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    expect(saved.users.some((u) => u.company === 'Persist Co')).toBe(true);
  });
});
