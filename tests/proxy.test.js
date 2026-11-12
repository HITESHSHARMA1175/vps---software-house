// Task 36.2: trusted-proxy client IP handling over HTTP. Covers Requirements 3.2, 3.3, 3.6 and 19.4.
// The derived client IP is observed through GET /api/agent/detect-server (warn mode, no key needed) and
// through the audit entry written for a failed agent authentication.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { loadApp, adminCookie, createServer, getAuditLogs, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';

afterAll(() => {
  restoreEnv();
  restoreDatabaseJson();
});

const clientIpOf = async (app, headers = {}) => {
  let r = request(app).get('/api/agent/detect-server');
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  const res = await r;
  expect(res.status).toBe(200);
  return res.body.clientIp;
};

describe('forwarded IP headers from an untrusted peer (Req 3.2, 19.4)', () => {
  let app;
  beforeAll(async () => {
    // Only 10.9.9.9 is a Trusted_Proxy, so the loopback peer used by Supertest is untrusted.
    ({ app } = await loadApp({ mode: 'warn', trustedProxies: '10.9.9.9' }));
  });

  it('uses the socket address and ignores x-forwarded-for', async () => {
    const ip = await clientIpOf(app, { 'X-Forwarded-For': '198.51.100.7' });
    expect(ip).toMatch(/127\.0\.0\.1$/);
    expect(ip).not.toContain('198.51.100.7');
  });

  it('ignores cf-connecting-ip and x-real-ip as well', async () => {
    const ip = await clientIpOf(app, { 'CF-Connecting-IP': '198.51.100.8', 'X-Real-IP': '198.51.100.9' });
    expect(ip).toMatch(/127\.0\.0\.1$/);
  });

  it('does not let a forged x-forwarded-proto mark the request secure', async () => {
    const res = await request(app).get('/api/agent/detect-server').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(res.body.clientIp).toMatch(/127\.0\.0\.1$/);
  });
});

describe('forwarded IP headers from a trusted peer (Req 3.3, 19.4)', () => {
  let app;
  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'warn', trustedProxies: '127.0.0.0/8, ::1, 10.9.9.9' }));
  });

  it('honors x-forwarded-for', async () => {
    expect(await clientIpOf(app, { 'X-Forwarded-For': '198.51.100.7' })).toBe('198.51.100.7');
  });

  it('takes the right-most address that is not itself a trusted proxy', async () => {
    expect(await clientIpOf(app, { 'X-Forwarded-For': '192.0.2.99, 198.51.100.7, 10.9.9.9' })).toBe('198.51.100.7');
  });

  it('falls back to the socket address when the header has no valid address (Req 3.4)', async () => {
    const ip = await clientIpOf(app, { 'X-Forwarded-For': 'not-an-ip' });
    expect(ip).toMatch(/127\.0\.0\.1$/);
  });
});

describe('default Trusted_Proxy list is loopback only (Req 3.7)', () => {
  let app;
  beforeAll(async () => {
    ({ app } = await loadApp({ mode: 'warn' }));
  });

  it('honors the header from loopback when TRUSTED_PROXIES is unset', async () => {
    expect(await clientIpOf(app, { 'X-Forwarded-For': '198.51.100.7' })).toBe('198.51.100.7');
  });
});

describe('derived client IP is used in audit entries (Req 3.6)', () => {
  let warnSpy;
  afterAll(() => warnSpy?.mockRestore());

  async function failedAuthIp(trustedProxies) {
    const { app, helper } = await loadApp({ mode: 'warn', trustedProxies });
    const cookie = await adminCookie(helper, app);
    const srv = await createServer(request, app, cookie, { id: `srv-p-${Math.random().toString(36).slice(2, 8)}`, ipPort: '203.0.113.50:18526' });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Wrong key for a server that has a hash is rejected in warn mode and audited.
    const res = await request(app).post('/api/agent/telemetry')
      .set('X-Agent-Key', 'ak_' + 'Y'.repeat(43)).set('X-Forwarded-For', '198.51.100.77').send({ serverId: srv.id });
    expect(res.status).toBe(401);
    const logs = await getAuditLogs(request, app, cookie);
    return logs.find((l) => l.action === 'AGENT_AUTH_FAILED' && l.target === srv.id)?.ipAddress;
  }

  it('records the forwarded address when the peer is a Trusted_Proxy', async () => {
    expect(await failedAuthIp('127.0.0.0/8, ::1')).toBe('198.51.100.77');
  });

  it('records the socket address when the peer is not a Trusted_Proxy', async () => {
    const ip = await failedAuthIp('10.9.9.9');
    expect(ip).toMatch(/127\.0\.0\.1$/);
  });
});
