// Test-only guard (defence in depth): server.js honors DB_FILE_PATH, but any fs access to the
// REAL database.json path is still redirected so a missing env var can never touch the real file.
// Call installDbGuard() BEFORE the first getApp(). All fs access to the real file is redirected
// to process.env.DB_FILE_PATH (the per-run temp file created by tests/setup.js).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const REAL_DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database.json');
const norm = (p) => (typeof p === 'string' ? path.resolve(p).toLowerCase() : null);
const isReal = (p) => norm(p) === REAL_DB.toLowerCase();

/**
 * Starts the Express app on an ephemeral port and resolves once it is LISTENING. Needed because the
 * outbound guard in tests/setup.js learns a port only on the 'listening' event, which fires after
 * Supertest has already tried to connect when it starts the server itself. Returns an http.Server
 * that can be passed to request(). Call close() in afterAll.
 */
export async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/** Same as helpers/app.js loginAs but against an already-listening server. */
export async function login(server, key = 'admin') {
  const { default: request } = await import('supertest');
  const { TEST_USERS } = await import('./app.js');
  const u = TEST_USERS[key];
  const res = await request(server).post('/api/auth/login').send({ username: u.username, password: u.password });
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
}

export function installDbGuard() {
  const redirect = (p) => (isReal(p) ? process.env.DB_FILE_PATH : p);
  for (const name of ['writeFileSync', 'readFileSync', 'existsSync', 'renameSync', 'copyFileSync', 'appendFileSync', 'unlinkSync']) {
    const orig = fs[name];
    vi.spyOn(fs, name).mockImplementation((p, ...rest) => orig.call(fs, redirect(p), ...rest));
  }
  return { realPath: REAL_DB };
}
