// Task 49.2: the served installer embeds a clean agent-config.json template (no serverToken / default token).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';

vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  const fake = createFakeMysql();
  globalThis.__agentTestFake = fake;
  return fake.moduleExports;
});

afterAll(() => {
  restoreEnv();
  restoreDatabaseJson();
});

describe('Pre-configured installer content', () => {
  let body; let warnSpy;

  beforeAll(async () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = await loadApp({ mode: 'enforce', realInit: true });
    const h = await import('./helpers/app.js');
    const cookie = await adminCookie(h, app);
    const created = await request(app).post('/api/servers').set('Cookie', cookie).send({
      id: 'srv-inst', name: 'Node inst', ipPort: '203.0.113.60:18526', superClientPass: 'x-Pass-123',
    });
    expect(created.status).toBe(200);
    const url = new URL(created.body.agentInstall.installerUrl, 'http://localhost');
    const res = await request(app).get(url.pathname + url.search);
    expect(res.status).toBe(200);
    body = res.text;
  });
  afterAll(() => warnSpy?.mockRestore());

  it('embeds the agent key and agent-config.json, with no serverToken or default token', () => {
    expect(body).toContain('"agentKey":"ak_');
    expect(body).toContain('agent-config.json');
    expect(body).not.toContain('serverToken');
    expect(body).not.toContain('vps_sec_token_default');
  });

  it('$cfgJson template is valid JSON once PowerShell concatenation is resolved', () => {
    const line = body.split('\n').find((l) => l.includes('$cfgJson ='));
    expect(line).toBeTruthy();
    // Drop the parenthesised -replace expression (it contains its own quoted regex literal).
    const expr = line.slice(line.indexOf('=') + 1).replace(/\([^)]*-replace[^)]*\)/, '$x');
    // Keep the single-quoted literals; replace each interpolated PowerShell expression with a placeholder.
    const literals = [...expr.matchAll(/'((?:[^'])*)'/g)].map((m) => m[1]);
    expect(literals.length).toBeGreaterThanOrEqual(3);
    const resolved = literals.join('placeholder');
    const parsed = JSON.parse(resolved);
    expect(parsed.agentKey).toMatch(/^ak_/);
    expect(parsed.intervalSeconds).toBe(5);
    expect(Object.keys(parsed)).not.toContain('serverToken');
  });
});
