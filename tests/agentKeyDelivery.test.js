// Task 36.11: agent key delivery integration tests (HTTP level, in-memory MySQL fake, temp database.json).
// Covers Requirements 4.2, 4.4, 9.1, 9.2, 9.3 (hardening addition: design section 19).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createFakeMysql } from './helpers/fakeMysql.js';
import { loadApp, adminCookie, createServer, isolateDatabaseJson, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';

// Shared in-memory MySQL fake that survives vi.resetModules().
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  globalThis.__kdFake ??= createFakeMysql();
  return globalThis.__kdFake.moduleExports;
});

// Records the live payload handed to the disk store so tests can inspect the in-memory provision jobs
// (the store itself scrubs a copy before writing, so the file alone cannot show the memory state).
vi.mock('../lib/diskPersistence.js', async () => {
  const actual = await vi.importActual('../lib/diskPersistence.js');
  return {
    ...actual,
    createDiskPersistence: (opts) => {
      const store = actual.createDiskPersistence(opts);
      const save = store.save;
      store.save = (payload) => { globalThis.__kdLastSave = payload; return save(payload); };
      return store;
    },
  };
});

globalThis.__kdFake ??= createFakeMysql();
const fake = () => globalThis.__kdFake;
const PROXIES = '127.0.0.1,::1';
const SAVED_ENV = {};
const ENV_KEYS = ['NODE_ENV', 'PORTAL_BASE_URL', 'ALLOW_JSON_FALLBACK'];

function setEnv(env) {
  for (const k of ENV_KEYS) { if (!(k in SAVED_ENV)) SAVED_ENV[k] = process.env[k]; }
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}
function restoreProcessEnv() {
  for (const k of Object.keys(SAVED_ENV)) {
    if (SAVED_ENV[k] === undefined) delete process.env[k]; else process.env[k] = SAVED_ENV[k];
  }
}

const memJobs = () => (globalThis.__kdLastSave && globalThis.__kdLastSave.provisionJobs) || [];
const fileText = () => {
  const dir = path.dirname(isolateDatabaseJson());
  return fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
};
const dbText = () => JSON.stringify(fake().queries) + JSON.stringify(
  fake().tables().includes('vps_provision_jobs') ? fake().rows('vps_provision_jobs') : []
);

// Only console spies are restored here: vi.restoreAllMocks() would also undo the harness's fs redirect of database.json.
const consoleSpies = [];
function quietConsole() {
  for (const level of ['log', 'warn', 'error']) consoleSpies.push(vi.spyOn(console, level).mockImplementation(() => {}));
}
function restoreConsole() {
  while (consoleSpies.length) consoleSpies.pop().mockRestore();
}

function freshState() {
  fake().reset();
  globalThis.__kdLastSave = undefined;
  fs.rmSync(isolateDatabaseJson(), { force: true });
}

function telemetry(app, { id, ip, key, version, proto }) {
  let r = request(app).post('/api/agent/telemetry');
  if (ip) r = r.set('X-Forwarded-For', ip);
  if (proto) r = r.set('X-Forwarded-Proto', proto);
  if (key) r = r.set('X-Agent-Key', key);
  return r.send({ serverId: id, cpuUsage: 5, ram: { total: 8, used: 2 }, ...(version ? { agentVersion: version } : {}) });
}
function listen(app, { id, ip, proto }) {
  let r = request(app).post(`/api/agent/listen-jobs?serverId=${encodeURIComponent(id)}`);
  if (ip) r = r.set('X-Forwarded-For', ip);
  if (proto) r = r.set('X-Forwarded-Proto', proto);
  return r.send({});
}
const keyJobs = (body) => (body.pendingJobs || []).filter((j) => j.action === 'SET_AGENT_KEY');

afterAll(() => {
  restoreEnv();
  restoreProcessEnv();
  restoreDatabaseJson();
});

describe('GET /api/agent-keys/status', () => {
  let app; let cookie; let A; let B;

  beforeAll(async () => {
    freshState();
    setEnv({ NODE_ENV: 'test', PORTAL_BASE_URL: 'http://127.0.0.1:5000', ALLOW_JSON_FALLBACK: undefined });
    quietConsole();
    const loaded = await loadApp({ mode: 'warn', trustedProxies: PROXIES, realInit: true });
    app = loaded.app;
    cookie = await adminCookie(loaded.helper, app);
    A = await createServer(request, app, cookie, { id: 'kd-st-a', ipPort: '203.0.113.41:18526' });
    B = await createServer(request, app, cookie, { id: 'kd-st-b', ipPort: '203.0.113.42:18526' });
  });
  afterAll(restoreConsole);

  const status = async () => {
    const res = await request(app).get('/api/agent-keys/status').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body;
  };
  const row = (body, id) => body.servers.find((s) => s.serverId === id);

  it('returns the five fields per server and never a key or hash', async () => {
    await telemetry(app, { id: 'kd-st-a', ip: '203.0.113.41', key: A.agentKey, version: '2.1.0' });
    const body = await status();
    const a = row(body, 'kd-st-a');
    expect(Object.keys(a).sort()).toEqual(['agentVersion', 'hasHash', 'keyUsed', 'lastRequestValid', 'lastValidAt', 'serverId']);
    expect(a).toMatchObject({ hasHash: true, lastRequestValid: true, agentVersion: '2.1.0' });
    expect(typeof a.lastValidAt).toBe('string');
    expect(JSON.stringify(body)).not.toContain(A.agentKey);
  });

  it('is not ready until every server has a valid request, then ready', async () => {
    expect((await status()).readyForEnforce).toBe(false);
    // An invalid key keeps it not ready
    await telemetry(app, { id: 'kd-st-b', ip: '203.0.113.42', key: 'ak_' + 'Z'.repeat(43) });
    const bad = await status();
    expect(row(bad, 'kd-st-b').lastRequestValid).toBe(false);
    expect(bad.readyForEnforce).toBe(false);

    const good = await telemetry(app, { id: 'kd-st-b', ip: '203.0.113.42', key: B.agentKey });
    expect(good.status).toBe(200);
    const ready = await status();
    expect(ready.servers.map((s) => [s.serverId, s.lastRequestValid])).toEqual([['kd-st-a', true], ['kd-st-b', true]]);
    expect(ready.readyForEnforce).toBe(true);
  });

  it('is not ready once the last valid request is older than 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      expect((await status()).readyForEnforce).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is restricted to administrators', async () => {
    const h = await import('./helpers/app.js');
    const { cookie: sales } = await h.loginAs(app, 'sales');
    const res = await request(app).get('/api/agent-keys/status').set('Cookie', sales);
    expect([401, 403]).toContain(res.status);
  });
});

describe('Bulk delivery in warn mode', () => {
  let app; let cookie; let h; let keyJob; let plainKey;
  const S = {};
  const IPS = { new: '203.0.113.10', old: '203.0.113.11', none: '203.0.113.12' };

  beforeAll(async () => {
    freshState();
    setEnv({ NODE_ENV: 'test', PORTAL_BASE_URL: 'http://127.0.0.1:5000', ALLOW_JSON_FALLBACK: undefined });
    quietConsole();
    ({ app, helper: h } = await loadApp({ mode: 'warn', trustedProxies: PROXIES, realInit: true }));
    cookie = await adminCookie(h, app);
    for (const k of ['new', 'old', 'none']) {
      S[k] = await createServer(request, app, cookie, { id: `kd-${k}`, ipPort: `${IPS[k]}:18526` });
    }
    // Agents that do not send a key yet report their version (valid key not yet recorded for them).
    expect((await telemetry(app, { id: 'kd-new', ip: IPS.new, version: '2.1.0' })).status).toBe(200);
    expect((await telemetry(app, { id: 'kd-old', ip: IPS.old, version: '1.0.0' })).status).toBe(200);
    expect((await telemetry(app, { id: 'kd-none', ip: IPS.none })).status).toBe(200);
  });
  afterAll(restoreConsole);

  it('returns 403 to a non-SUPER_ADMIN user', async () => {
    const { cookie: empCookie } = await h.loginAs(app, 'employee');
    const bulk = await request(app).post('/api/servers/deploy-agent-keys').set('Cookie', empCookie).send({});
    expect(bulk.status).toBe(403);
    const one = await request(app).post('/api/servers/kd-new/deploy-agent-key').set('Cookie', empCookie).send({});
    expect(one.status).toBe(403);
    expect(memJobs().some((j) => j.action === 'SET_AGENT_KEY')).toBe(false);
  });

  it('queues SET_AGENT_KEY for the up-to-date agent and UPDATE_AGENT only for old or unversioned agents', async () => {
    const res = await request(app).post('/api/servers/deploy-agent-keys').set('Cookie', cookie).send({ serverIds: ['kd-new', 'kd-old', 'kd-none'] });
    expect(res.status).toBe(200);
    expect(res.body.queued).toEqual(['kd-new']);
    expect(res.body.needs_update.map((r) => r.serverId).sort()).toEqual(['kd-none', 'kd-old']);
    expect(JSON.stringify(res.body)).not.toMatch(/ak_[A-Za-z0-9_-]{20,}/);

    const keyForServers = memJobs().filter((j) => j.action === 'SET_AGENT_KEY').map((j) => j.serverId);
    expect(keyForServers).toEqual(['kd-new']);
    const updates = memJobs().filter((j) => j.action === 'UPDATE_AGENT').map((j) => j.serverId).sort();
    expect(updates).toEqual(['kd-none', 'kd-old']);
  });

  it('does not return the key job to a request from another IP', async () => {
    // Give the listener an ordinary pending job so the long poll answers immediately.
    const upd = await request(app).post('/api/servers/kd-new/update-agent').set('Cookie', cookie).send({});
    expect(upd.status).toBe(200);

    const tel = await telemetry(app, { id: 'kd-new', ip: '198.51.100.99' });
    expect(tel.status).toBe(200);
    expect(keyJobs(tel.body)).toHaveLength(0);
    expect(JSON.stringify(tel.body)).not.toMatch(/ak_[A-Za-z0-9_-]{20,}/);

    const lst = await listen(app, { id: 'kd-new', ip: '198.51.100.99' });
    expect(lst.status).toBe(200);
    expect(keyJobs(lst.body)).toHaveLength(0);
    expect((lst.body.pendingJobs || []).some((j) => j.action === 'UPDATE_AGENT')).toBe(true);
    // The withheld job stays PENDING for the real agent.
    expect(memJobs().find((j) => j.action === 'SET_AGENT_KEY').status).toBe('PENDING');
  });

  it('returns the key job to the registered IP (telemetry and listen-jobs)', async () => {
    const lst = await listen(app, { id: 'kd-new', ip: IPS.new });
    expect(lst.status).toBe(200);
    const jobs = keyJobs(lst.body);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].agentKey).toMatch(/^ak_/);

    const tel = await telemetry(app, { id: 'kd-new', ip: IPS.new });
    expect(keyJobs(tel.body)).toHaveLength(1);
    keyJob = jobs[0];
    plainKey = keyJob.agentKey;
    expect(plainKey).toBe(keyJobs(tel.body)[0].agentKey);
  });

  it('never put the key in vps_provision_jobs or the database.json temp file', () => {
    expect(plainKey).toBeTruthy();
    expect(dbText()).not.toContain(plainKey);
    const text = fileText();
    expect(text).toContain(keyJob.id);
    expect(text).not.toContain(plainKey);
  });

  it('removes the key from memory, file and MySQL after job-result COMPLETED, and does not re-deliver', async () => {
    // Delivery rotated the key; the agent now authenticates with the delivered one.
    const res = await request(app).post('/api/agent/job-result').set('X-Agent-Key', plainKey)
      .send({ serverId: 'kd-new', jobId: keyJob.id, status: 'COMPLETED', message: 'ok' });
    expect(res.status).toBe(200);
    const mem = memJobs().find((j) => j.id === keyJob.id);
    expect(mem.status).toBe('COMPLETED');
    expect(JSON.stringify(mem)).not.toContain(plainKey);
    expect(JSON.stringify(memJobs())).not.toContain(plainKey);
    expect(fileText()).not.toContain(plainKey);
    expect(dbText()).not.toContain(plainKey);

    const tel = await telemetry(app, { id: 'kd-new', ip: IPS.new });
    expect(keyJobs(tel.body)).toHaveLength(0);
  });

  it('removes the key after job-result FAILED', async () => {
    const r = await request(app).post('/api/servers/kd-new/deploy-agent-key').set('Cookie', cookie).send({ force: true });
    expect(r.status).toBe(200);
    expect(r.body.queued).toEqual(['kd-new']);
    const lst = await listen(app, { id: 'kd-new', ip: IPS.new });
    const job = keyJobs(lst.body)[0];
    expect(job).toBeTruthy();
    const res = await request(app).post('/api/agent/job-result').set('X-Agent-Key', job.agentKey)
      .send({ serverId: 'kd-new', jobId: job.id, status: 'FAILED', message: 'could not write config' });
    expect(res.status).toBe(200);
    const mem = memJobs().find((j) => j.id === job.id);
    expect(mem.status).toBe('FAILED');
    expect(JSON.stringify(memJobs())).not.toContain(job.agentKey);
    expect(fileText()).not.toContain(job.agentKey);
    expect(dbText()).not.toContain(job.agentKey);
  });

  it('removes the key after the 15-minute expiry', async () => {
    const r = await request(app).post('/api/servers/kd-new/deploy-agent-key').set('Cookie', cookie).send({ force: true });
    expect(r.status).toBe(200);
    const lst = await listen(app, { id: 'kd-new', ip: IPS.new });
    const job = keyJobs(lst.body)[0];
    expect(job).toBeTruthy();
    const key = job.agentKey;

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      // Any poll sweeps expired jobs; the expired job must not be delivered.
      const tel = await telemetry(app, { id: 'kd-new', ip: IPS.new });
      expect(tel.status).toBe(200);
      expect(keyJobs(tel.body).filter((j) => j.id === job.id)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
    const mem = memJobs().find((j) => j.id === job.id);
    expect(mem.status).toBe('FAILED');
    expect(JSON.stringify(memJobs())).not.toContain(key);
    expect(fileText()).not.toContain(key);
    expect(dbText()).not.toContain(key);
  });
});

describe('Delivery is refused in enforce mode', () => {
  let app; let cookie; let S;
  beforeAll(async () => {
    freshState();
    setEnv({ NODE_ENV: 'test', PORTAL_BASE_URL: 'http://127.0.0.1:5000', ALLOW_JSON_FALLBACK: undefined });
    quietConsole();
    const loaded = await loadApp({ mode: 'enforce', trustedProxies: PROXIES, realInit: true });
    app = loaded.app;
    cookie = await adminCookie(loaded.helper, app);
    S = await createServer(request, app, cookie, { id: 'kd-enf', ipPort: '203.0.113.20:18526' });
  });
  afterAll(restoreConsole);

  it('returns 409 for bulk and single delivery and queues nothing', async () => {
    const bulk = await request(app).post('/api/servers/deploy-agent-keys').set('Cookie', cookie).send({});
    expect(bulk.status).toBe(409);
    const one = await request(app).post('/api/servers/kd-enf/deploy-agent-key').set('Cookie', cookie).send({});
    expect(one.status).toBe(409);
    expect(memJobs().some((j) => j.action === 'SET_AGENT_KEY')).toBe(false);
  });

  it('rejects a request carrying only serverToken (Req 1.1, 4.2)', async () => {
    const res = await request(app).post('/api/agent/telemetry').set('X-Forwarded-For', '203.0.113.20')
      .set('X-Server-Token', 'vps_sec_token_default')
      .send({ serverId: 'kd-enf', serverToken: 'vps_sec_token_default', cpuUsage: 1 });
    expect(res.status).toBe(401);
    const ok = await request(app).post('/api/agent/telemetry').set('X-Agent-Key', S.agentKey).send({ serverId: 'kd-enf', cpuUsage: 1 });
    expect(ok.status).toBe(200);
  });
});

describe('Key job over plain http in production', () => {
  let app; let cookie; let id; let key;
  const IP = '203.0.113.30';

  beforeAll(async () => {
    freshState();
    setEnv({ NODE_ENV: 'production', PORTAL_BASE_URL: 'https://vps.example.test', ALLOW_JSON_FALLBACK: '1' });
    quietConsole();
    const loaded = await loadApp({ mode: 'warn', trustedProxies: PROXIES, realInit: true });
    app = loaded.app;
    cookie = await adminCookie(loaded.helper, app);
    ({ id } = await createServer(request, app, cookie, { id: 'kd-prod', ipPort: `${IP}:18526` }));
    expect((await telemetry(app, { id, ip: IP, version: '2.1.0', proto: 'https' })).status).toBe(200);
    const r = await request(app).post('/api/servers/deploy-agent-keys').set('Cookie', cookie).send({});
    expect(r.status).toBe(200);
    expect(r.body.queued).toEqual([id]);
    // An ordinary pending job so listen-jobs answers immediately instead of holding the long poll.
    const upd = await request(app).post(`/api/servers/${id}/update-agent`).set('Cookie', cookie).send({});
    expect(upd.status).toBe(200);
  });
  afterAll(restoreConsole);

  it('withholds the key over plain http even from the registered IP', async () => {
    const tel = await telemetry(app, { id, ip: IP });
    expect(tel.status).toBe(200);
    expect(keyJobs(tel.body)).toHaveLength(0);
    const lst = await listen(app, { id, ip: IP, proto: 'http' });
    expect(keyJobs(lst.body)).toHaveLength(0);
  });

  it('withholds the key from another IP even over https', async () => {
    const tel = await telemetry(app, { id, ip: '198.51.100.77', proto: 'https' });
    expect(keyJobs(tel.body)).toHaveLength(0);
  });

  it('returns the key to the registered IP over https', async () => {
    const tel = await telemetry(app, { id, ip: IP, proto: 'https' });
    const jobs = keyJobs(tel.body);
    expect(jobs).toHaveLength(1);
    key = jobs[0].agentKey;
    expect(key).toMatch(/^ak_/);
    expect(fileText()).not.toContain(key);
    expect(dbText()).not.toContain(key);
  });
});

