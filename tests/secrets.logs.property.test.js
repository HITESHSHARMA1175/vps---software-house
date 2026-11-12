// Feature: production-hardening, Property 8: Secrets never appear in logs or audit entries
// **Validates: Requirements 1.10, 2.2, 7.11, 7.13, 8.6**
//
// Drives create, change-password, reveal, rotate, failed-agent-authentication and decrypt-failure flows
// through the real Express app (in-memory MySQL fake, temp database.json) and asserts that none of the
// captured console output, Audit_Log entries, or error response bodies contain a generated plaintext
// password, a ciphertext, an agent key, or an agent key hash.
import fs from 'node:fs';
import util from 'node:util';
import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { getApp, loginAs } from './helpers/app.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealPassword, parseKey } from '../lib/secretCipher.js';
import { hashAgentKey } from '../lib/agentAuth.js';

const KEY = parseKey(process.env.PASSWORD_ENCRYPTION_KEY);
// Distinctive prefix so a random password cannot collide with ordinary log text.
const pwArb = fc.stringMatching(/^[A-Za-z0-9!@#%^*_-]{12,24}$/).map((s) => `Zx9-${s}`);

let app;
let server;
let cookie;
let captured = [];
const spies = [];

function startCapture() {
  captured = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    spies.push(vi.spyOn(console, m).mockImplementation((...args) => {
      captured.push(util.format(...args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 6 })))));
    }));
  }
}
function stopCapture() {
  while (spies.length) spies.pop().mockRestore();
}

async function auditText() {
  const res = await request(app).get('/api/audit-logs').set('Cookie', cookie);
  expect(res.status).toBe(200);
  return JSON.stringify(res.body.auditLogs || []);
}

/** Ciphertexts currently persisted by the app (read from the temp database.json, never the real one). */
function persistedCiphertexts() {
  try {
    const text = fs.readFileSync(process.env.DB_FILE_PATH, 'utf8');
    return [...new Set(text.match(/enc:v1:[A-Za-z0-9+/=_-]+/g) || [])];
  } catch {
    return [];
  }
}

// server.js hard-codes DB_FILE_PATH to <repo>/database.json and ignores the DB_FILE_PATH env redirect from
// tests/setup.js (reported as a product/harness bug). Until that is fixed, divert every write aimed at the
// real file to the temp file so this test never modifies it.
const REAL_DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json');
function divertRealDatabaseWrites() {
  const orig = fs.writeFileSync;
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...rest) =>
    orig.call(fs, typeof file === 'string' && path.resolve(file) === REAL_DB ? process.env.DB_FILE_PATH : file, ...rest));
}

beforeAll(async () => {
  divertRealDatabaseWrites();
  startCapture(); // also covers bootstrap output
  const expressApp = await getApp();
  // Listen explicitly so the harness's loopback guard has seen the port before the first request
  // (Supertest's own listen(0) races the guard's 'listening' hook).
  server = http.createServer(expressApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  app = server;
  ({ cookie } = await loginAs(app, 'admin'));
  expect(cookie).toBeTruthy();
});
afterAll(async () => {
  stopCapture();
  vi.mocked(fs.writeFileSync).mockRestore?.();
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('Property 8: secrets never appear in logs or audit entries', () => {
  it('keeps passwords, ciphertexts, agent keys and key hashes out of console output, audits and error bodies', async () => {
    let n = 0;
    await fc.assert(
      fc.asyncProperty(pwArb, pwArb, pwArb, fc.boolean(), async (pw1, pw2, srvPw, autoProvision) => {
        n += 1;
        const tag = `p8${Date.now().toString(36)}${n}`;
        const serverId = `vps-${tag}`;
        const otherServerId = `vps-${tag}-b`;
        const clientId = `user-${tag}`;
        const errorBodies = [];
        const secrets = new Set([pw1, pw2, srvPw]);
        const startLog = captured.length;
        const auth = (r) => r.set('Cookie', cookie);
        const note = (res) => { if (res.status >= 400) errorBodies.push(res.text); return res; };

        // Servers (each gets a fresh agent key whose hash is stored)
        for (const [id, ip] of [[serverId, '10.8.0.1'], [otherServerId, '10.8.0.2']]) {
          const r = note(await auth(request(app).post('/api/servers')).send({
            id, name: `Srv ${id}`, ipPort: `${ip}:3389`, superClientUser: 'sa', superClientPass: srvPw, totalUsersLimit: 10,
          }));
          expect(r.status).toBeLessThan(500);
        }

        // Create client
        note(await auth(request(app).post('/api/users')).send({
          id: clientId, company: `Co ${tag}`, username: `u${tag}`.slice(0, 20), password: pw1,
          serverId, drive: 'Drive D', autoProvision,
        }));

        // Change password
        note(await auth(request(app).post(`/api/users/${clientId}/change-password`)).send({ newPassword: pw2 }));

        // Reveal (client + server)
        const reveal = note(await auth(request(app).post(`/api/clients/${clientId}/reveal-password`)).send({}));
        expect(reveal.status).toBe(200);
        expect(reveal.body.password).toBe(pw2); // flows really ran: the secret exists, and only in the success body
        note(await auth(request(app).post(`/api/servers/${serverId}/reveal-password`)).send({}));

        // Rotate agent keys (the success body legitimately returns the key once; it must not reach logs/audits)
        const keys = [];
        for (const id of [serverId, otherServerId]) {
          const rot = note(await auth(request(app).post(`/api/servers/${id}/rotate-agent-key`)).send({}));
          if (rot.status === 200 && rot.body.agentKey) {
            keys.push(rot.body.agentKey);
            secrets.add(rot.body.agentKey);
            secrets.add(hashAgentKey(rot.body.agentKey));
          }
        }

        expect(keys).toHaveLength(2);

        // Failed agent authentication: wrong key, and server A's real key presented for server B
        const wrong = `ak_${tag}wrongwrongwrongwrongwrongwrongwrong`;
        secrets.add(wrong);
        secrets.add(hashAgentKey(wrong));
        note(await request(app).post('/api/agent/telemetry').set('X-Agent-Key', wrong).send({ serverId }));
        if (keys[0]) {
          note(await request(app).post('/api/agent/telemetry').set('X-Agent-Key', keys[0]).send({ serverId: otherServerId }));
        }

        // Failed user authentication with a password-like secret
        note(await request(app).post('/api/auth/login').send({ username: 'admin', password: pw1 }));

        // Decrypt failure: a tampered ciphertext stored for a client and a server
        const good = sealPassword(pw1, KEY);
        const tampered = `${good.slice(0, -4)}${good.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
        secrets.add(tampered);
        const badId = `${clientId}-bad`;
        note(await auth(request(app).post('/api/users')).send({
          id: badId, company: `Bad ${tag}`, username: `b${tag}`.slice(0, 20), password: tampered, serverId, autoProvision: false,
        }));
        const badReveal = note(await auth(request(app).post(`/api/clients/${badId}/reveal-password`)).send({}));
        expect(badReveal.status).toBe(500);

        for (const c of persistedCiphertexts()) secrets.add(c);

        const logs = captured.slice(startLog).join('\n');
        const audits = await auditText();
        const bodies = errorBodies.join('\n');
        for (const [where, text] of [['console output', logs], ['audit entries', audits], ['error bodies', bodies]]) {
          for (const secret of secrets) {
            if (text.includes(secret)) {
              throw new Error(`secret leaked into ${where} (length ${secret.length}, prefix ${secret.slice(0, 6)})`);
            }
          }
          // Any ciphertext at all is also a leak in these channels.
          expect(text.includes('enc:v1:'), `ciphertext marker in ${where}`).toBe(false);
        }
      }),
      { numRuns: 10 }
    );
  }, 120000);
});
