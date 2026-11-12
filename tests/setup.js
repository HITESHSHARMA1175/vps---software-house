// Test harness (Req 18). Runs before every test file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

// --- Environment (18.6): all secrets come from here; the real .env is never read (server.js skips dotenv in TEST_MODE).
process.env.TEST_MODE = '1';
process.env.NODE_ENV = 'test';
// Fixed, test-only 32-byte key (64 hex chars). Never use in real environments.
process.env.PASSWORD_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.INTERNAL_SECRET = 'test-internal-secret-not-for-production';
process.env.PORTAL_BASE_URL = 'http://127.0.0.1:5000';
process.env.SUPERADMIN_DEFAULT_PASS = process.env.SUPERADMIN_DEFAULT_PASS || 'Test-Admin-Pass-1!';

// --- Redirect JSON persistence to a temp directory (18.7). The real database.json is never a target.
// server.js reads DB_FILE_PATH at import; this file runs before any test file imports it.
// Unique per worker and per test file (mkdtemp), so parallel workers never share a file.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `vps-test-${process.env.VITEST_POOL_ID || '0'}-${process.pid}-`));
process.env.DB_FILE_PATH = path.join(tmpDir, 'database.json');
process.on('exit', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

// Defence in depth: server.js honors DB_FILE_PATH, but any code resolving the real path directly gets
// its fs calls on <repo>/database.json rerouted to the temp file.
// Done at the fs level (not by mocking lib/diskPersistence.js) so test files that wrap
// fs.writeFileSync themselves still see the original path first.
const REAL_DB_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json').toLowerCase();
const toTemp = (p) => (typeof p === 'string' && path.resolve(p).toLowerCase() === REAL_DB_FILE ? process.env.DB_FILE_PATH : p);
for (const name of ['existsSync', 'readFileSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'unlinkSync', 'statSync']) {
  const orig = fs[name];
  if (typeof orig !== 'function') continue;
  fs[name] = function dbRedirect(p, ...rest) {
    return orig.call(fs, toTemp(p), ...rest.map((r, i) => (i === 0 && (name === 'renameSync' || name === 'copyFileSync') ? toTemp(r) : r)));
  };
}

// --- MySQL: replace mysql2/promise with the in-memory fake (18.4). No connection is ever attempted.
vi.mock('mysql2/promise', async () => {
  let mod = null;
  try {
    mod = await import('./helpers/fakeMysql.js');
  } catch (e) {
    if (!e || (e.code !== 'ERR_MODULE_NOT_FOUND' && !/Failed to load|Cannot find|does not exist/i.test(String(e.message)))) throw e;
  }
  if (mod) {
    // Accept any of: default module-shaped object, named `mysql`, or a `createPool` export.
    const shaped = mod.mysql || mod.fakeMysql || mod.default || mod;
    if (typeof shaped.createPool === 'function') return { ...shaped, default: shaped };
  }
  // Fallback until tests/helpers/fakeMysql.js exists: fail fast locally without touching the network.
  const refuse = async () => {
    const err = new Error('connect ECONNREFUSED (fake mysql: tests/helpers/fakeMysql.js not available)');
    err.code = 'ECONNREFUSED';
    throw err;
  };
  const fallback = {
    createPool: () => ({ query: refuse, execute: refuse, getConnection: refuse, end: async () => {}, on() {} }),
    createConnection: refuse,
  };
  return { ...fallback, default: fallback };
});

// --- Outbound guard (18.5): fetch, http.request/get, https.request/get.
// Loopback is allowed only for ports that a server inside this process is listening on (Supertest).
const localPorts = new Set();
// Servers created in this process. Supertest listens on '127.0.0.1' and may send its request before
// 'listening' fires, so the guard also checks each tracked server's current address() lazily.
const localServers = new Set();
const origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function patchedListen(...args) {
  localServers.add(this);
  this.once('listening', () => {
    const a = this.address();
    if (a && typeof a === 'object') localPorts.add(a.port);
  });
  this.once('close', () => localServers.delete(this));
  return origListen.apply(this, args);
};
function isLocalPort(port) {
  if (localPorts.has(port)) return true;
  for (const s of localServers) {
    const a = s.address();
    if (a && typeof a === 'object' && a.port === port) {
      localPorts.add(port);
      return true;
    }
  }
  return false;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0', '']);

function describeTarget(input, options, defaultPort) {
  let host = '';
  let port = defaultPort;
  const take = (o) => {
    if (!o) return;
    if (o instanceof URL) {
      host = o.hostname || host;
      if (o.port) port = Number(o.port);
    } else if (typeof o === 'string') {
      try { return take(new URL(o)); } catch { host = o; }
    } else if (typeof o === 'object') {
      host = o.hostname || o.host || host;
      if (o.port) port = Number(o.port);
    }
  };
  take(input);
  if (options && typeof options === 'object') take(options);
  if (typeof host === 'string' && host.includes(':') && !host.startsWith('[') && /:\d+$/.test(host)) {
    const i = host.lastIndexOf(':');
    port = Number(host.slice(i + 1));
    host = host.slice(0, i);
  }
  return { host: host || 'localhost', port };
}

function assertAllowed(host, port) {
  if (LOOPBACK.has(host) && isLocalPort(Number(port))) return;
  throw new Error(`Unmocked outbound request to ${host}${port ? `:${port}` : ''}`);
}

function guardModule(mod, defaultPort) {
  for (const name of ['request', 'get']) {
    const orig = mod[name];
    mod[name] = function guarded(input, options, ...rest) {
      const t = describeTarget(input, typeof options === 'object' ? options : null, defaultPort);
      assertAllowed(t.host, t.port);
      return orig.call(mod, input, options, ...rest);
    };
  }
}
guardModule(http, 80);
guardModule(https, 443);
syncBuiltinESMExports();

const origFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input, init) {
  let url;
  try {
    url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  } catch {
    throw new Error(`Unmocked outbound request to ${String(input)}`);
  }
  assertAllowed(url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80));
  return origFetch.call(globalThis, input, init);
};
