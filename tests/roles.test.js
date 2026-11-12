// Role matrix: one route per privilege level, for SUPER_ADMIN, EMPLOYEE, SALESPERSON and anonymous (task 36.1).
// Validates: Requirements 19.1, 19.2
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, loginAs } from './helpers/app.js';

let app;
const cookies = {};

beforeAll(async () => {
  app = await getApp();
  for (const k of ['admin', 'employee', 'sales']) {
    const { res, cookie } = await loginAs(app, k);
    expect(res.status).toBe(200);
    cookies[k] = cookie;
  }
});

const call = (method, path, who, body) => {
  const r = request(app)[method](path);
  if (who) r.set('Cookie', cookies[who]);
  return r.send(body);
};

// Each level: a route, the roles that pass the role gate, and the status the gate-passing role sees
// for an intentionally incomplete/unknown request (so nothing is mutated).
const LEVELS = [
  {
    name: 'any authenticated user (requireAuth)',
    method: 'get', path: '/api/employees',
    allowed: ['admin', 'employee', 'sales'], denied: [],
  },
  {
    name: 'administrator (requireAdmin)',
    method: 'post', path: '/api/servers', body: {},
    allowed: ['admin'], denied: ['employee', 'sales'], passStatus: 400,
  },
  {
    name: 'SUPER_ADMIN only (inline role check)',
    method: 'post', path: '/api/servers/no-such-server/rotate-agent-key', body: {},
    allowed: ['admin'], denied: ['employee', 'sales'],
  },
  {
    name: 'SUPER_ADMIN only: reveal client password',
    method: 'post', path: '/api/clients/no-such-client/reveal-password', body: {},
    allowed: ['admin'], denied: ['employee', 'sales'],
  },
];

describe.each(LEVELS)('$name: $method $path', (level) => {
  it('anonymous requests get 401', async () => {
    const res = await call(level.method, level.path, null, level.body);
    expect(res.status).toBe(401);
  });

  it.each(level.allowed)('%s passes the role gate', async (who) => {
    const res = await call(level.method, level.path, who, level.body);
    expect([401, 403]).not.toContain(res.status);
    if (level.passStatus) expect(res.status).toBe(level.passStatus);
  });

  if (level.denied.length) {
    it.each(level.denied)('%s gets 403', async (who) => {
      const res = await call(level.method, level.path, who, level.body);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  }
});

describe('role enforcement details', () => {
  it('a denied role does not mutate state (POST /api/servers as EMPLOYEE creates nothing)', async () => {
    const before = (await call('get', '/api/servers', 'admin')).body;
    const res = await call('post', '/api/servers', 'employee', { name: 'Intruder', ip: '10.9.9.9' });
    expect(res.status).toBe(403);
    const after = (await call('get', '/api/servers', 'admin')).body;
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(JSON.stringify(after)).not.toContain('Intruder');
  });

  it('SALESPERSON sees the user list (tenant isolation applies to the result, not the gate)', async () => {
    const res = await call('get', '/api/users', 'sales');
    expect(res.status).toBe(200);
  });

  it('a suspended employee loses access on the next request', async () => {
    const { res: loginRes, cookie } = await loginAs(app, 'employee');
    expect(loginRes.status).toBe(200);
    const list = await call('get', '/api/employees', 'admin');
    const emp = list.body.employees.find((e) => e.username === 'employee');
    const put = await call('put', `/api/employees/${emp.id}/status`, 'admin', { status: 'SUSPENDED' });
    expect(put.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    const relogin = await loginAs(app, 'employee');
    expect(relogin.res.status).toBe(403);
    expect(relogin.res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    await call('put', `/api/employees/${emp.id}/status`, 'admin', { status: 'ACTIVE' });
  });
});
