// Shared harness for the agent-auth / proxy / uploads integration tests (task 36.2).
// - Points DB_FILE_PATH (honored by server.js) at a harness temp file, and also redirects any fs access
//   to the repository's real database.json there as a second line of defence.
// - Loads a fresh server.js instance per call with the requested environment (config is read at import).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const REAL_DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database.json');
export const REPO_ROOT = path.dirname(REAL_DB);

let isolated = null;

/** Spies on fs so the real database.json is never read or written; returns the temp path used instead. */
export function isolateDatabaseJson() {
  if (isolated) return isolated.tmp;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-agent-harness-'));
  const tmp = path.join(dir, 'database.json');
  const redirect = (p) => (typeof p === 'string' && path.resolve(p) === REAL_DB ? tmp : p);
  const origExists = fs.existsSync.bind(fs);
  const origRead = fs.readFileSync.bind(fs);
  const origWrite = fs.writeFileSync.bind(fs);
  const spies = [
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => origExists(redirect(p))),
    vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...r) => origRead(redirect(p), ...r)),
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p, ...r) => origWrite(redirect(p), ...r)),
  ];
  // server.js reads DB_FILE_PATH at import, so apps loaded after this persist to `tmp`.
  isolated = { tmp, dir, spies, prevDbPath: process.env.DB_FILE_PATH };
  process.env.DB_FILE_PATH = tmp;
  return tmp;
}

export function restoreDatabaseJson() {
  if (!isolated) return;
  for (const s of isolated.spies) s.mockRestore();
  // Back to the per-file temp path from tests/setup.js (never the real file).
  if (isolated.prevDbPath === undefined) delete process.env.DB_FILE_PATH; else process.env.DB_FILE_PATH = isolated.prevDbPath;
  try { fs.rmSync(isolated.dir, { recursive: true, force: true }); } catch { /* best effort */ }
  isolated = null;
}

const TOUCHED_ENV = ['AGENT_AUTH_MODE', 'TRUSTED_PROXIES', 'RATE_LIMIT_AGENT_AUTH_FAIL_MAX'];
const savedEnv = {};

export function restoreEnv() {
  for (const k of TOUCHED_ENV) {
    if (k in savedEnv) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
  }
}

/**
 * Fresh server.js + bootstrap with the given environment.
 * opts: { mode: 'warn'|'enforce', trustedProxies?: string, realInit?: boolean }
 * realInit runs the real initMySQLDatabase against the in-memory fake MySQL (test file must mock mysql2/promise).
 */
export async function loadApp({ mode = 'enforce', trustedProxies, realInit = false } = {}) {
  isolateDatabaseJson();
  for (const k of TOUCHED_ENV) if (!(k in savedEnv)) savedEnv[k] = process.env[k];
  process.env.AGENT_AUTH_MODE = mode;
  if (trustedProxies === undefined) delete process.env.TRUSTED_PROXIES; else process.env.TRUSTED_PROXIES = trustedProxies;
  process.env.RATE_LIMIT_AGENT_AUTH_FAIL_MAX = '100000';
  vi.resetModules();
  const helper = await import('./app.js');
  const app = await helper.getApp(realInit ? { initDatabase: undefined } : {});
  return { app, helper };
}

export async function adminCookie(h, app) {
  const { cookie, res } = await h.loginAs(app, 'admin');
  if (res.status !== 200 || !cookie) throw new Error(`admin login failed: ${res.status}`);
  return cookie;
}

/** Creates a server through the API (admin) and returns its id and one-time plaintext agent key. */
export async function createServer(request, app, cookie, { id, ipPort, name } = {}) {
  const res = await request(app).post('/api/servers').set('Cookie', cookie).send({
    id, name: name || `Node ${id}`, ipPort: ipPort || '203.0.113.10:18526', superClientPass: 'x-Pass-123',
  });
  if (res.status !== 200 || !res.body.agentKey) throw new Error(`server create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.server.id, agentKey: res.body.agentKey, ipPort: ipPort || '203.0.113.10:18526' };
}

export async function getAuditLogs(request, app, cookie) {
  const res = await request(app).get('/api/audit-logs').set('Cookie', cookie);
  return res.body.auditLogs || [];
}
