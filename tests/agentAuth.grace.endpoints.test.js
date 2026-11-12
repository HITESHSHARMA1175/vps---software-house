// Task 54.3: HTTP-level tests for the agent key rotation grace window (Requirements 2.10, 2.11, 2.13, 2.14, 2.16, 26.14).
// Only Date is faked (setTimeout/setInterval stay real) and the fake is installed before the app is imported,
// so every `Date.now` captured by server.js and lib/agentAuth.js follows vi.setSystemTime.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, createServer, getAuditLogs, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';
import { hashAgentKey } from '../lib/agentAuth.js';
import { createFakeMysql } from './helpers/fakeMysql.js';

// One in-memory MySQL fake shared across vi.resetModules(), so a second loadApp() is a "restart" on the same data.
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  globalThis.__graceFake ??= createFakeMysql();
  return globalThis.__graceFake.moduleExports;
});

globalThis.__graceFake ??= createFakeMysql();

const MIN = 60000;
const fake = () => globalThis.__graceFake;
const row = (id) => fake().rows('vps_servers').find((r) => r.id === id);
const T0 = Date.UTC(2030, 0, 1, 12, 0, 0);
const SAVED = {};
const spies = [];

beforeAll(() => {
  for (const k of ['NODE_ENV', 'PORTAL_BASE_URL', 'ALLOW_JSON_FALLBACK']) SAVED[k] = process.env[k];
  process.env.NODE_ENV = 'test';
  process.env.PORTAL_BASE_URL = 'http://127.0.0.1:5000';
  delete process.env.ALLOW_JSON_FALLBACK;
  for (const level of ['log', 'warn', 'error']) spies.push(vi.spyOn(console, level).mockImplementation(() => {}));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterAll(() => {
  vi.useRealTimers();
  while (spies.length) spies.pop().mockRestore();
  for (const [k, v] of Object.entries(SAVED)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  restoreEnv();
  restoreDatabaseJson();
});

describe('Rotation endpoint grace window (enforce mode)', () => {
  let app; let helper; let cookie; let empCookie;

  const rotate = (id, body, c = cookie) => {
    const r = request(app).post(`/api/servers/${id}/rotate-agent-key`).set('Cookie', c);
    return body === undefined ? r : r.send(body);
  };
  const telemetry = (id, key) => request(app).post('/api/agent/telemetry').set('X-Agent-Key', key).send({ serverId: id, cpuUsage: 3 });
  const rotationLogs = async () => (await getAuditLogs(request, app, cookie)).filter((l) => l.action === 'AGENT_KEY_ROTATED');

  beforeAll(async () => {
    fake().reset();
    vi.setSystemTime(T0);
    ({ app, helper } = await loadApp({ mode: 'enforce', realInit: true }));
    cookie = await adminCookie(helper, app);
    empCookie = (await helper.loginAs(app, 'employee')).cookie;
  });

  it('accepts both keys during the window and rejects the old key at the exact expiry instant', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-a', ipPort: '203.0.113.50:18526' });
    vi.setSystemTime(T0);
    const res = await rotate('gr-a', { graceMinutes: 5 });
    expect(res.status).toBe(200);
    expect(res.body.graceMinutes).toBe(5);
    expect(res.body.previousKeyExpiresAt).toBe(new Date(T0 + 5 * MIN).toISOString());
    const newKey = res.body.agentKey;

    vi.setSystemTime(T0 + 5 * MIN - 1);
    expect((await telemetry('gr-a', S.agentKey)).status).toBe(200);
    expect((await telemetry('gr-a', newKey)).status).toBe(200);

    vi.setSystemTime(T0 + 5 * MIN); // exact expiry: rejected (now < expiry is required)
    expect((await telemetry('gr-a', S.agentKey)).status).toBe(401);
    expect((await telemetry('gr-a', newKey)).status).toBe(200);
  });

  it('persists previousApiKey (a hash) and previousKeyExpiresAt, and the expiry survives a restart', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-b', ipPort: '203.0.113.51:18526' });
    vi.setSystemTime(T0);
    const res = await rotate('gr-b', { graceMinutes: 10 });
    expect(res.status).toBe(200);
    const stored = row('gr-b');
    expect(stored.previousApiKey).toBe(hashAgentKey(S.agentKey));
    expect(stored.apiKey).toBe(hashAgentKey(res.body.agentKey));
    expect(Number(stored.previousKeyExpiresAt)).toBe(T0 + 10 * MIN);

    // "restart": fresh module graph, same MySQL data
    ({ app, helper } = await loadApp({ mode: 'enforce', realInit: true }));
    cookie = await adminCookie(helper, app);
    expect(Number(row('gr-b').previousKeyExpiresAt)).toBe(T0 + 10 * MIN);

    vi.setSystemTime(T0 + 10 * MIN - 1);
    expect((await telemetry('gr-b', S.agentKey)).status).toBe(200);
    vi.setSystemTime(T0 + 10 * MIN);
    expect((await telemetry('gr-b', S.agentKey)).status).toBe(401);
    expect((await telemetry('gr-b', res.body.agentKey)).status).toBe(200);
    expect(Number(row('gr-b').previousKeyExpiresAt)).toBe(T0 + 10 * MIN); // unchanged by the restart
  });

  it('defaults to no grace window: the old key is rejected at once and nothing is stored as previous', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-c', ipPort: '203.0.113.52:18526' });
    vi.setSystemTime(T0);
    for (const body of [undefined, {}, { graceMinutes: 0 }]) {
      const res = await rotate('gr-c', body);
      expect(res.status).toBe(200);
      expect(res.body.graceMinutes).toBe(0);
      expect(res.body.previousKeyExpiresAt).toBeNull();
      expect((await telemetry('gr-c', S.agentKey)).status).toBe(401);
      expect(row('gr-c').previousApiKey ?? null).toBeNull();
      expect(row('gr-c').previousKeyExpiresAt ?? null).toBeNull();
      S.agentKey = res.body.agentKey;
    }
  });

  it('a key from two rotations ago is never accepted, even inside the first window', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-d', ipPort: '203.0.113.53:18526' });
    vi.setSystemTime(T0);
    const first = await rotate('gr-d', { graceMinutes: 30 });
    const second = await rotate('gr-d', { graceMinutes: 30 });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await telemetry('gr-d', S.agentKey)).status).toBe(401); // two rotations ago
    expect((await telemetry('gr-d', first.body.agentKey)).status).toBe(200); // previous
    expect((await telemetry('gr-d', second.body.agentKey)).status).toBe(200); // current
  });

  it('answers 400 for an invalid graceMinutes, changes no key, stores nothing and writes no audit entry', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-e', ipPort: '203.0.113.54:18526' });
    vi.setSystemTime(T0);
    const before = (await rotationLogs()).length;
    const hashBefore = row('gr-e').apiKey;
    for (const bad of [-1, 1441, 1.5, '5', null, true, 'abc', {}, [5]]) {
      const res = await rotate('gr-e', { graceMinutes: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.agentKey).toBeUndefined();
    }
    expect(row('gr-e').apiKey).toBe(hashBefore);
    expect(row('gr-e').previousApiKey ?? null).toBeNull();
    expect((await telemetry('gr-e', S.agentKey)).status).toBe(200);
    expect((await rotationLogs()).length).toBe(before);
    // boundaries 0 and 1440 are valid
    expect((await rotate('gr-e', { graceMinutes: 1440 })).status).toBe(200);
  });

  it('keeps SUPER_ADMIN-only access for graceMinutes rotations', async () => {
    await createServer(request, app, cookie, { id: 'gr-f', ipPort: '203.0.113.55:18526' });
    const res = await rotate('gr-f', { graceMinutes: 5 }, empCookie);
    expect(res.status).toBe(403);
    expect(row('gr-f').previousApiKey ?? null).toBeNull();
  });

  it('never exposes previousApiKey in list responses (Req 2.14 / 1.7)', async () => {
    const S = await createServer(request, app, cookie, { id: 'gr-g', ipPort: '203.0.113.56:18526' });
    const res = await rotate('gr-g', { graceMinutes: 5 });
    const list = await request(app).get('/api/servers').set('Cookie', cookie);
    const text = JSON.stringify(list.body);
    expect(text).not.toContain('previousApiKey');
    expect(text).not.toContain(hashAgentKey(S.agentKey));
    expect(text).not.toContain(res.body.agentKey);
  });
});

describe('Key delivery defaults to a 60-minute grace window (Req 26.14)', () => {
  let app; let helper; let cookie;

  const telemetry = (id, key, extra = {}) => {
    let r = request(app).post('/api/agent/telemetry');
    if (key) r = r.set('X-Agent-Key', key);
    return r.send({ serverId: id, cpuUsage: 3, ram: { total: 8, used: 2 }, ...extra });
  };
  const deploy = (id, body = {}) => request(app).post(`/api/servers/${id}/deploy-agent-key`).set('Cookie', cookie).send(body);
  const prepare = async (id, n) => {
    const S = await createServer(request, app, cookie, { id, ipPort: `203.0.113.${n}:18526` });
    expect((await telemetry(id, undefined, { agentVersion: '2.1.0' })).status).toBe(200); // warn mode, up to date
    return S;
  };

  beforeAll(async () => {
    fake().reset();
    vi.setSystemTime(T0);
    ({ app, helper } = await loadApp({ mode: 'warn', realInit: true }));
    cookie = await adminCookie(helper, app);
  });

  it('keeps the old key valid for exactly 60 minutes after delivery when no graceMinutes is given', async () => {
    const S = await prepare('gd-a', 60);
    vi.setSystemTime(T0);
    const r = await deploy('gd-a');
    expect(r.status).toBe(200);
    expect(r.body.queued).toEqual(['gd-a']);
    expect(Number(row('gd-a').previousKeyExpiresAt)).toBe(T0 + 60 * MIN);
    expect(row('gd-a').previousApiKey).toBe(hashAgentKey(S.agentKey));

    vi.setSystemTime(T0 + 60 * MIN - 1);
    expect((await telemetry('gd-a', S.agentKey)).status).toBe(200);
    vi.setSystemTime(T0 + 60 * MIN);
    expect((await telemetry('gd-a', S.agentKey)).status).toBe(401);
  });

  it('honours an explicit graceMinutes, including 0', async () => {
    vi.setSystemTime(T0);
    const A = await prepare('gd-b', 61);
    expect((await deploy('gd-b', { graceMinutes: 2 })).body.queued).toEqual(['gd-b']);
    expect(Number(row('gd-b').previousKeyExpiresAt)).toBe(T0 + 2 * MIN);

    const Z = await prepare('gd-c', 62);
    expect((await deploy('gd-c', { graceMinutes: 0 })).body.queued).toEqual(['gd-c']);
    expect((await telemetry('gd-c', Z.agentKey)).status).toBe(401);
    expect(row('gd-c').previousApiKey ?? null).toBeNull();
    expect(A.agentKey).toBeTruthy();
  });

  it('answers 400 for an invalid graceMinutes and queues nothing', async () => {
    vi.setSystemTime(T0);
    const S = await prepare('gd-d', 63);
    const hashBefore = row('gd-d').apiKey;
    for (const bad of [-1, 1441, 2.5, '60', null]) {
      const r = await deploy('gd-d', { graceMinutes: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(row('gd-d').apiKey).toBe(hashBefore);
    expect((await telemetry('gd-d', S.agentKey)).status).toBe(200);
  });
});
