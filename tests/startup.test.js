// Task 36.10: startup decisions (storage mode, strict MySQL in production, PORTAL_BASE_URL, AGENT_AUTH_MODE).
// Validates: Requirements 4.6, 11.1, 11.2, 11.4, 13.6, 13.7
import fs from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { loadConfig, ConfigError } from '../lib/config.js';
import { createFakeMysql } from './helpers/fakeMysql.js';

// Shared in-memory MySQL fake that survives vi.resetModules().
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  globalThis.__startupFake ??= createFakeMysql();
  return globalThis.__startupFake.moduleExports;
});
globalThis.__startupFake ??= createFakeMysql();
const fake = () => globalThis.__startupFake;

const SAVED = { ...process.env };
const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PROD = {
  NODE_ENV: 'production',
  PORTAL_BASE_URL: 'https://vps.example.test',
  PASSWORD_ENCRYPTION_KEY: KEY,
  SUPERADMIN_DEFAULT_PASS: 'Startup-Test-Admin-1!',
};

let logs;
function captureConsole() {
  logs = { log: [], warn: [], error: [] };
  for (const level of ['log', 'warn', 'error']) {
    vi.spyOn(console, level).mockImplementation((...a) => { logs[level].push(a.join(' ')); });
  }
}

async function boot(env) {
  vi.resetModules();
  delete process.env.ALLOW_JSON_FALLBACK; // do not inherit the developer's shell value
  Object.assign(process.env, env);
  captureConsole();
  const { getApp } = await import('./helpers/app.js');
  // initDatabase: undefined -> the real initMySQLDatabase runs against the fake MySQL.
  return getApp({ initDatabase: undefined });
}

afterEach(() => {
  vi.restoreAllMocks();
  fake()?.reset();
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

const dbFileWrites = (spy) => spy.mock.calls.filter(([p]) => String(p) === String(process.env.DB_FILE_PATH));

describe('production with MySQL down (Req 11.1)', () => {
  it('refuses to start: logs the reason, exits non-zero and never writes database.json', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    fake().setUnavailable(true);
    const write = vi.spyOn(fs, 'writeFileSync');
    await boot(PROD);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.error.some((l) => l.includes('[DB]') && /unreachable|initialization failed/i.test(l))).toBe(true);
    expect(logs.error.some((l) => l.includes('database.json was not touched'))).toBe(true);
    expect(dbFileWrites(write)).toHaveLength(0);
    expect(logs.log.some((l) => l.includes('Disk persistence: DISABLED'))).toBe(true);
  });

  it('with ALLOW_JSON_FALLBACK=1 it starts on the JSON fallback and warns', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    fake().setUnavailable(true);
    await boot({ ...PROD, ALLOW_JSON_FALLBACK: '1' });
    expect(exit).not.toHaveBeenCalled();
    expect(logs.warn.some((l) => l.includes('ALLOW_JSON_FALLBACK=1'))).toBe(true);
    expect(logs.log).toContain('Storage mode: JSON fallback');
  });

  it('a value other than "1" does not enable the fallback (still refuses to start)', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    fake().setUnavailable(true);
    await boot({ ...PROD, ALLOW_JSON_FALLBACK: 'true' });
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('storage-mode log line (Req 11.4)', () => {
  it('reports MySQL when the database connects', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    await boot(PROD);
    expect(exit).not.toHaveBeenCalled();
    expect(logs.log).toContain('Storage mode: MySQL');
    expect(logs.log).not.toContain('Storage mode: JSON fallback');
  });

  it('reports JSON fallback outside production when MySQL is down', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    fake().setUnavailable(true);
    await boot({ NODE_ENV: 'test' });
    expect(exit).not.toHaveBeenCalled();
    expect(logs.log).toContain('Storage mode: JSON fallback');
  });
});

describe('production runtime outage (Req 11.2)', () => {
  async function outageApp() {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    const app = await boot(PROD);
    expect(logs.log).toContain('Storage mode: MySQL');
    const h = await import('./helpers/app.js');
    const { cookie } = await h.loginAs(app, 'admin');
    expect(cookie).toBeTruthy();
    fake().setUnavailable(true);
    return { app, cookie };
  }

  it('never writes database.json while MySQL is down', async () => {
    const { app, cookie } = await outageApp();
    const write = vi.spyOn(fs, 'writeFileSync');
    await request(app).post('/api/public/tickets').send({ username: 'a', phone: '1', subject: 's', description: 'd' });
    await request(app).get('/api/requests').set('Cookie', cookie);
    expect(dbFileWrites(write)).toHaveLength(0);
    expect(fs.existsSync(process.env.DB_FILE_PATH)).toBe(false);
  });

  const DOWN = { error: 'Database unavailable' };
  const listHas = async (app, cookie, path, text) => {
    const r = await request(app).get(path).set('Cookie', cookie);
    expect(r.status).toBe(200);
    return JSON.stringify(r.body).includes(text);
  };

  it('answers 503 { error: "Database unavailable" } for a read that needs MySQL', async () => {
    const { app, cookie } = await outageApp();
    const res = await request(app).get('/api/requests').set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body).toEqual(DOWN);
  });

  it('rejects a write with 503 instead of accepting it into memory', async () => {
    const { app } = await outageApp();
    const res = await request(app).post('/api/public/tickets').send({ username: 'a', phone: '1', subject: 's', description: 'd' });
    expect(res.status).toBe(503);
  });

  it('public ticket: 503 exact body and nothing accepted into memory', async () => {
    const { app, cookie } = await outageApp();
    const subject = `outage-public-${Date.now()}`;
    const res = await request(app).post('/api/public/tickets').send({ username: 'a', phone: '1', subject, description: 'd' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual(DOWN);
    fake().setUnavailable(false);
    expect(await listHas(app, cookie, '/api/tickets', subject)).toBe(false);
  });

  it('staff routes: GET /api/servers and POST /api/tickets answer 503; the ticket is not kept', async () => {
    const { app, cookie } = await outageApp();
    const subject = `outage-staff-${Date.now()}`;
    const s = await request(app).get('/api/servers').set('Cookie', cookie);
    expect(s.status).toBe(503);
    expect(s.body).toEqual(DOWN);
    const t = await request(app).post('/api/tickets').set('Cookie', cookie).send({ company: 'Acme', subject, description: 'd' });
    expect(t.status).toBe(503);
    expect(t.body).toEqual(DOWN);
    fake().setUnavailable(false);
    expect(await listHas(app, cookie, '/api/tickets', subject)).toBe(false);
  });

  it('first-failure window: a mutating staff request right after the outage starts gets 503 and is not kept', async () => {
    const { app, cookie } = await outageApp();
    const username = `outage_emp_${Date.now()}`;
    const res = await request(app).post('/api/employees').set('Cookie', cookie)
      .send({ name: 'Outage Emp', username, password: 'Outage-Pass-1!', role: 'STAFF' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual(DOWN);
    fake().setUnavailable(false);
    expect(await listHas(app, cookie, '/api/employees', username)).toBe(false);
  });

  it('recovers: GET /api/servers returns 200 once MySQL is back', async () => {
    const { app, cookie } = await outageApp();
    expect((await request(app).get('/api/servers').set('Cookie', cookie)).status).toBe(503);
    fake().setUnavailable(false);
    expect((await request(app).get('/api/servers').set('Cookie', cookie)).status).toBe(200);
  });

  it('non-strict (NODE_ENV=test): fallback behaviour is unchanged while MySQL is down', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    const app = await boot({ NODE_ENV: 'test' });
    const h = await import('./helpers/app.js');
    const { cookie } = await h.loginAs(app, 'admin');
    fake().setUnavailable(true);
    const res = await request(app).get('/api/servers').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
describe('PORTAL_BASE_URL rules (Req 13.6, 13.7)', () => {
  const prodEnv = (extra) => ({ NODE_ENV: 'production', PASSWORD_ENCRYPTION_KEY: KEY, ...extra });
  const problemsOf = (env) => {
    try { loadConfig(env); } catch (e) { if (e instanceof ConfigError) return e.problems; throw e; }
    return [];
  };

  it('rejects an http URL in production', () => {
    const p = problemsOf(prodEnv({ PORTAL_BASE_URL: 'http://vps.example.test' }));
    expect(p.some((x) => x.includes('PORTAL_BASE_URL') && /https/.test(x))).toBe(true);
  });

  it('rejects a missing URL in production', () => {
    expect(problemsOf(prodEnv({})).some((x) => x.includes('PORTAL_BASE_URL is missing'))).toBe(true);
  });

  it.each(['not a url', 'ftp://vps.example.test', '/relative'])('rejects invalid URL %s', (v) => {
    expect(problemsOf(prodEnv({ PORTAL_BASE_URL: v })).some((x) => x.includes('PORTAL_BASE_URL is invalid'))).toBe(true);
  });

  it('accepts https in production and strips trailing slashes', () => {
    expect(loadConfig(prodEnv({ PORTAL_BASE_URL: 'https://vps.example.test//' })).portalBaseUrl).toBe('https://vps.example.test');
  });

  it('allows http and a loopback default outside production', () => {
    expect(loadConfig({ NODE_ENV: 'development', PORTAL_BASE_URL: 'http://intranet.local:5000' }).portalBaseUrl).toBe('http://intranet.local:5000');
    expect(loadConfig({ NODE_ENV: 'development' }).portalBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('server.js refuses to start in production with an http PORTAL_BASE_URL', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    vi.resetModules();
    Object.assign(process.env, PROD, { PORTAL_BASE_URL: 'http://vps.example.test' });
    captureConsole();
    await expect(import('../server.js')).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.error.some((l) => l.includes('PORTAL_BASE_URL must use https'))).toBe(true);
  });
});

describe('AGENT_AUTH_MODE production default (Req 4.6)', () => {
  const prodEnv = { NODE_ENV: 'production', PORTAL_BASE_URL: 'https://vps.example.test', PASSWORD_ENCRYPTION_KEY: KEY };

  it('defaults to warn in production and notes the default', () => {
    const cfg = loadConfig(prodEnv);
    expect(cfg.agentAuthMode).toBe('warn');
    expect(cfg.notes.some((n) => n.includes('AGENT_AUTH_MODE not set'))).toBe(true);
  });

  it('honours enforce and warn, and rejects other values naming the variable', () => {
    expect(loadConfig({ ...prodEnv, AGENT_AUTH_MODE: 'enforce' }).agentAuthMode).toBe('enforce');
    expect(loadConfig({ ...prodEnv, AGENT_AUTH_MODE: 'warn' }).agentAuthMode).toBe('warn');
    let err;
    try { loadConfig({ ...prodEnv, AGENT_AUTH_MODE: 'strict' }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.problems.some((p) => p.includes('AGENT_AUTH_MODE'))).toBe(true);
  });
});
