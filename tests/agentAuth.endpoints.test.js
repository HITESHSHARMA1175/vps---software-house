// Task 36.2: HTTP-level agent authentication and key rotation tests.
// Covers Requirements 1.5, 2.2, 2.3, 2.5, 2.6, 3.6, 19.3, 19.4 (plus 1.3/1.4/1.10/2.1/2.4/4.2-4.5 where they are observable).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, createServer, getAuditLogs, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';
import { hashAgentKey } from '../lib/agentAuth.js';

// Use the in-memory MySQL fake for the "failing store" group (the shared setup mock only has a refusing fallback).
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  const fake = createFakeMysql();
  globalThis.__agentTestFake = fake;
  return fake.moduleExports;
});

const BAD_KEY = 'ak_' + 'Z'.repeat(43);

// The Agent_Endpoint list registered in server.js (AGENT_ENDPOINT_PATHS). Req 1.5 / glossary call it "ten";
// the code registers eleven paths (detect-server and my-ip share one handler).
const ENDPOINTS = [
  ['POST', '/api/agent/telemetry'],
  ['POST', '/api/agent/job-result'],
  ['POST', '/api/agent/session-event'],
  ['POST', '/api/agent/duplicate-session-event'],
  ['POST', '/api/agent/migration/upload-full'],
  ['POST', '/api/agent/migration/upload-chunk'],
  ['GET', '/api/agent/migration/download-chunk'],
  ['GET', '/api/agent/detect-server'],
  ['GET', '/api/agent/my-ip'],
  ['POST', '/api/agent/listen-jobs'],
  ['POST', '/api/agent/poll-instant'],
];

function call(app, method, url, { key, serverId, headers = {} } = {}) {
  const sep = url.includes('?') ? '&' : '?';
  const full = url.includes('/migration/') ? `${url}${sep}migrationId=nope` : `${url}${sep}serverId=${encodeURIComponent(serverId || '')}`;
  let r = request(app)[method.toLowerCase()](full);
  if (key !== undefined) r = r.set('X-Agent-Key', key);
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  if (method === 'POST') return r.send({ serverId: serverId || '' });
  return r;
}

afterAll(() => {
  restoreEnv();
  restoreDatabaseJson();
});

describe('Agent authentication in enforce mode', () => {
  let app; let cookie; let A; let B; let warnSpy;

  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'enforce' }));
    const h = await import('./helpers/app.js');
    cookie = await adminCookie(h, app);
    A = await createServer(request, app, cookie, { id: 'srv-a', ipPort: '203.0.113.10:18526' });
    B = await createServer(request, app, cookie, { id: 'srv-b', ipPort: '203.0.113.11:18526' });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warnSpy?.mockRestore());

  const telemetry = (key, serverId = 'srv-a', extra = {}) => {
    let r = request(app).post('/api/agent/telemetry');
    if (key !== undefined) r = r.set('X-Agent-Key', key);
    return r.send({ serverId, cpuUsage: 5, ram: { total: 8, used: 2 }, ...extra });
  };

  it('processes a request with the valid key (Req 1.1)', async () => {
    const res = await telemetry(A.agentKey);
    expect(res.status).toBe(200);
  });

  it('rejects a missing, empty, wrong, or another server\'s key with 401 and an identical body (Req 1.3, 1.4)', async () => {
    const unknown = await telemetry(BAD_KEY, 'does-not-exist');
    expect(unknown.status).toBe(401);
    const variants = [await telemetry(undefined), await telemetry(''), await telemetry(BAD_KEY), await telemetry(B.agentKey)];
    for (const res of variants) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(unknown.body);
      expect(res.headers['content-type']).toBe(unknown.headers['content-type']);
    }
  });

  it('answers every listed Agent_Endpoint with 401 when the key is missing or invalid (Req 1.5, 19.3)', async () => {
    for (const [method, url] of ENDPOINTS) {
      const noKey = await call(app, method, url, { serverId: 'srv-a' });
      expect(noKey.status, `${method} ${url} without key`).toBe(401);
      const badKey = await call(app, method, url, { key: BAD_KEY, serverId: 'srv-a' });
      expect(badKey.status, `${method} ${url} with bad key`).toBe(401);
      expect(badKey.body).toEqual(noKey.body);
    }
  });

  it('lets the valid key through the listed endpoints that complete without long-polling (Req 1.1)', async () => {
    const posts = ['/api/agent/job-result', '/api/agent/session-event', '/api/agent/duplicate-session-event'];
    for (const url of posts) {
      const res = await request(app).post(url).set('X-Agent-Key', A.agentKey).send({ serverId: 'srv-a' });
      expect(res.status, url).not.toBe(401);
    }
    for (const url of ['/api/agent/detect-server', '/api/agent/my-ip']) {
      const res = await request(app).get(url).set('X-Agent-Key', A.agentKey);
      expect(res.status, url).toBe(200);
    }
  });

  it('ignores serverId / x-server-id hints without the key (identity comes from X-Agent-Key only)', async () => {
    const res = await request(app).post('/api/agent/listen-jobs').set('X-Server-Id', 'srv-a').send({});
    expect(res.status).toBe(401);
    const spoof = await request(app).post('/api/agent/listen-jobs?serverId=srv-a').set('X-Agent-Key', B.agentKey).send({});
    expect(spoof.status).toBe(401);
  });

  it('writes an audit entry for a failed authentication without the submitted key (Req 1.10)', async () => {
    await telemetry(BAD_KEY, 'srv-a');
    const logs = await getAuditLogs(request, app, cookie);
    const entry = logs.find((l) => l.action === 'AGENT_AUTH_FAILED' && l.target === 'srv-a' && /telemetry/.test(l.details));
    expect(entry).toBeTruthy();
    expect(entry.ipAddress).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    expect(JSON.stringify(logs)).not.toContain(BAD_KEY);
    expect(JSON.stringify(logs)).not.toContain(A.agentKey);
  });

  it('logs the rejection with serverId and endpoint (Req 4.5)', async () => {
    warnSpy.mockClear();
    await telemetry(BAD_KEY, 'srv-b');
    const line = warnSpy.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('rejected') && l.includes('serverId=srv-b'));
    expect(line).toContain('/api/agent/telemetry');
    expect(line).not.toContain(BAD_KEY);
  });
});

describe('Agent authentication in warn mode', () => {
  let app; let cookie; let S; let warnSpy;

  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'warn' }));
    const h = await import('./helpers/app.js');
    cookie = await adminCookie(h, app);
    S = await createServer(request, app, cookie, { id: 'srv-w', ipPort: '203.0.113.20:18526' });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warnSpy?.mockRestore());

  const warnLines = () => warnSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('accepted without valid key'));

  it('accepts a request with no key and records one warning per server per window (Req 4.2, 4.3)', async () => {
    warnSpy.mockClear();
    const first = await request(app).post('/api/agent/telemetry').send({ serverId: 'srv-w', cpuUsage: 1 });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/agent/telemetry').send({ serverId: 'srv-w', cpuUsage: 2 });
    expect(second.status).toBe(200);
    const lines = warnLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('serverId=srv-w');
    expect(lines[0]).toContain('/api/agent/telemetry');
  });

  it('rejects a wrong key for a server that has a key hash (Req 4.4)', async () => {
    const res = await request(app).post('/api/agent/telemetry').set('X-Agent-Key', BAD_KEY).send({ serverId: 'srv-w' });
    expect(res.status).toBe(401);
  });

  it('still accepts the valid key', async () => {
    const res = await request(app).post('/api/agent/telemetry').set('X-Agent-Key', S.agentKey).send({ serverId: 'srv-w' });
    expect(res.status).toBe(200);
  });
});

describe('Agent key rotation', () => {
  let app; let cookie; let empCookie; let salesCookie; let R; let warnSpy;

  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'enforce' }));
    const h = await import('./helpers/app.js');
    cookie = await adminCookie(h, app);
    empCookie = (await h.loginAs(app, 'employee')).cookie;
    salesCookie = (await h.loginAs(app, 'sales')).cookie;
    R = await createServer(request, app, cookie, { id: 'srv-r', ipPort: '203.0.113.30:18526' });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warnSpy?.mockRestore());

  const rotationLogs = async () => (await getAuditLogs(request, app, cookie)).filter((l) => l.action === 'AGENT_KEY_ROTATED');
  const telemetry = (key) => request(app).post('/api/agent/telemetry').set('X-Agent-Key', key).send({ serverId: 'srv-r' });

  it('refuses non-SUPER_ADMIN roles with 403, returns no key, and keeps the old key valid (Req 2.3)', async () => {
    for (const c of [empCookie, salesCookie]) {
      const res = await request(app).post('/api/servers/srv-r/rotate-agent-key').set('Cookie', c);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/ak_[A-Za-z0-9_-]{20,}/);
      expect(res.body.agentKey).toBeUndefined();
    }
    expect((await telemetry(R.agentKey)).status).toBe(200);
    expect(await rotationLogs()).toHaveLength(0);
  });

  it('requires a session (401 without cookie)', async () => {
    const res = await request(app).post('/api/servers/srv-r/rotate-agent-key');
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown server and writes no audit entry (Req 2.5)', async () => {
    const before = (await getAuditLogs(request, app, cookie)).length;
    const res = await request(app).post('/api/servers/no-such-server/rotate-agent-key').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.agentKey).toBeUndefined();
    expect((await getAuditLogs(request, app, cookie)).length).toBe(before);
    expect(await rotationLogs()).toHaveLength(0);
  });

  it('rotates: new key returned once, old key rejected, one clean audit entry (Req 2.1, 2.2, 2.4)', async () => {
    const t0 = Date.now();
    const res = await request(app).post('/api/servers/srv-r/rotate-agent-key').set('Cookie', cookie);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(res.status).toBe(200);
    const newKey = res.body.agentKey;
    expect(newKey).toMatch(/^ak_[A-Za-z0-9_-]{43}$/);
    expect(newKey.length).toBeGreaterThanOrEqual(32);
    expect(newKey).not.toBe(R.agentKey);
    expect(res.headers['cache-control']).toMatch(/no-store/);

    // Next request after the response: old key rejected, new key accepted.
    expect((await telemetry(R.agentKey)).status).toBe(401);
    expect((await telemetry(newKey)).status).toBe(200);

    const logs = await rotationLogs();
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry.operator).toBeTruthy();
    expect(entry.target).toBe('srv-r');
    expect(entry.timestamp).toBeTruthy();
    const text = JSON.stringify(await getAuditLogs(request, app, cookie));
    for (const secret of [newKey, hashAgentKey(newKey), R.agentKey, hashAgentKey(R.agentKey)]) {
      expect(text).not.toContain(secret);
    }

    // The plaintext key is never shown again by later API responses (Req 1.7).
    const list = await request(app).get('/api/servers').set('Cookie', cookie);
    expect(JSON.stringify(list.body)).not.toContain(newKey);
  });

  // PRODUCT BUG (reported in the task 36.2 Change_Report): GET /api/servers returns each server's `apiKey`
  // (the Agent_Key_Hash) to staff, although POST /api/servers deliberately omits it and toPublicServer does not
  // strip it. Flip to a normal `it` once the list projection removes `apiKey`.
  it.fails('does not expose the Agent_Key_Hash in GET /api/servers', async () => {
    const list = await request(app).get('/api/servers').set('Cookie', cookie);
    expect(JSON.stringify(list.body)).not.toMatch(/"apiKey"\s*:\s*"[0-9a-f]{64}"/);
  });
});

describe('Agent key rotation with a failing store (Req 2.6)', () => {
  let app; let cookie; let F; let fake;

  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'enforce', realInit: true }));
    fake = globalThis.__agentTestFake;
    const h = await import('./helpers/app.js');
    cookie = await adminCookie(h, app);
    F = await createServer(request, app, cookie, { id: 'srv-f', ipPort: '203.0.113.40:18526' });
  });

  it('returns an error, no new key, keeps the previous key valid, and writes no audit entry', async () => {
    expect(fake).toBeTruthy();
    const before = (await getAuditLogs(request, app, cookie)).filter((l) => l.action === 'AGENT_KEY_ROTATED').length;
    fake.failNext(/UPDATE `vps_servers` SET `apiKey`/);
    const res = await request(app).post('/api/servers/srv-f/rotate-agent-key').set('Cookie', cookie);
    expect(res.status).toBe(500);
    expect(res.body.agentKey).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/ak_[A-Za-z0-9_-]{20,}/);

    const ok = await request(app).post('/api/agent/telemetry').set('X-Agent-Key', F.agentKey).send({ serverId: 'srv-f' });
    expect(ok.status).toBe(200);
    const after = (await getAuditLogs(request, app, cookie)).filter((l) => l.action === 'AGENT_KEY_ROTATED').length;
    expect(after).toBe(before);
  });
});
