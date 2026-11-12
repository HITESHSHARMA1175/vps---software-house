// Task 47.2: no server response may carry the Agent_Key_Hash (current or previous) or its expiry.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, createServer, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';
import { hashAgentKey } from '../lib/agentAuth.js';

vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  const fake = createFakeMysql();
  globalThis.__agentTestFake = fake;
  return fake.moduleExports;
});

const FORBIDDEN = ['apiKey', 'previousApiKey', 'previousKeyExpiresAt'];

function collectKeys(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) { out.push(k); collectKeys(value[k], out); }
  }
  return out;
}

afterAll(() => {
  restoreEnv();
  restoreDatabaseJson();
});

describe('Server responses never expose the Agent_Key_Hash', () => {
  let app; let cookie; let fake; let created; let newKey; let secrets; let warnSpy;

  beforeAll(async () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ({ app } = await loadApp({ mode: 'enforce', realInit: true }));
    fake = globalThis.__agentTestFake;
    const h = await import('./helpers/app.js');
    cookie = await adminCookie(h, app);
    created = await createServer(request, app, cookie, { id: 'srv-nk', ipPort: '203.0.113.50:18526' });
    const rot = await request(app).post('/api/servers/srv-nk/rotate-agent-key').set('Cookie', cookie).send({ graceMinutes: 30 });
    expect(rot.status).toBe(200);
    newKey = rot.body.agentKey;

    const row = fake.rows('vps_servers').find((r) => r.id === 'srv-nk');
    expect(row.apiKey).toBeTruthy();
    expect(row.previousApiKey).toBeTruthy();
    secrets = [hashAgentKey(newKey), hashAgentKey(created.agentKey), String(row.apiKey), String(row.previousApiKey)];
  });
  afterAll(() => warnSpy?.mockRestore());

  function assertClean(body, text) {
    const keys = collectKeys(body);
    for (const f of FORBIDDEN) expect(keys).not.toContain(f);
    for (const s of secrets) expect(text).not.toContain(s);
  }

  it('GET /api/servers', async () => {
    const res = await request(app).get('/api/servers').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('srv-nk');
    assertClean(res.body, res.text);
  });

  it('POST /api/servers response (new server)', async () => {
    const res = await request(app).post('/api/servers').set('Cookie', cookie).send({
      id: 'srv-nk2', name: 'Node nk2', ipPort: '203.0.113.51:18526', superClientPass: 'x-Pass-123',
    });
    expect(res.status).toBe(200);
    const text = res.text.replace(res.body.agentKey, '');
    const keys = collectKeys({ ...res.body, agentKey: undefined });
    for (const f of FORBIDDEN) expect(keys).not.toContain(f);
    expect(text).not.toContain(hashAgentKey(res.body.agentKey));
  });

  it('PUT /api/servers/:id response', async () => {
    const res = await request(app).put('/api/servers/srv-nk').set('Cookie', cookie).send({
      name: 'Node srv-nk edited', ipPort: '203.0.113.50:18526', apiKey: 'attacker', previousApiKey: 'attacker',
    });
    expect(res.status).toBe(200);
    assertClean(res.body, res.text);
    // Stored hashes survive the edit.
    const row = fake.rows('vps_servers').find((r) => r.id === 'srv-nk');
    expect(row.apiKey).toBe(hashAgentKey(newKey));
  });

  it('GET /api/servers/:id/report', async () => {
    const res = await request(app).get('/api/servers/srv-nk/report').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.report.server.id).toBe('srv-nk');
    assertClean(res.body, res.text);
  });
});
