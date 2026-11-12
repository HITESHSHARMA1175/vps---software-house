// Task 36.2: /uploads access control. Covers Requirements 19.3/19.4 (auth paths) and the task 31.1 behavior:
// only /uploads/voice-notes is served, only to authenticated staff; everything else under /uploads is 404.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { loadApp, REPO_ROOT, restoreDatabaseJson, restoreEnv } from './helpers/agentHarness.js';

const UPLOADS = path.join(REPO_ROOT, 'uploads');
const tag = `t362-${process.pid}-${Date.now()}`;
const voiceFile = path.join(UPLOADS, 'voice-notes', `${tag}.webm`);
const dotFile = path.join(UPLOADS, 'voice-notes', `.${tag}-hidden`);
const migFile = path.join(UPLOADS, 'migrations', `${tag}.zip`);
const VOICE_BODY = 'voice-note-bytes';
const MIG_BODY = 'migration-zip-secret-bytes';

describe('/uploads access control', () => {
  let app; let helper; let cookies;

  beforeAll(async () => {
    ({ app, helper } = await loadApp({ mode: 'warn' }));
    fs.writeFileSync(voiceFile, VOICE_BODY);
    fs.writeFileSync(dotFile, 'hidden');
    fs.writeFileSync(migFile, MIG_BODY);
    cookies = {};
    for (const k of ['admin', 'employee', 'sales']) cookies[k] = (await helper.loginAs(app, k)).cookie;
  });

  afterAll(() => {
    for (const f of [voiceFile, dotFile, migFile]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
    restoreEnv();
    restoreDatabaseJson();
  });

  it('rejects voice-note requests without a session (401), whether or not the file exists', async () => {
    const existing = await request(app).get(`/uploads/voice-notes/${tag}.webm`);
    expect(existing.status).toBe(401);
    expect(existing.text).not.toContain(VOICE_BODY);
    const missing = await request(app).get('/uploads/voice-notes/does-not-exist.webm');
    expect(missing.status).toBe(401);
  });

  it('rejects an invalid session cookie', async () => {
    const res = await request(app).get(`/uploads/voice-notes/${tag}.webm`).set('Cookie', 'session=bogus; sessionId=bogus; token=bogus');
    expect(res.status).toBe(401);
  });

  it('serves a voice note to every authenticated staff role', async () => {
    for (const role of ['admin', 'employee', 'sales']) {
      const res = await request(app).get(`/uploads/voice-notes/${tag}.webm`).set('Cookie', cookies[role]);
      expect(res.status, role).toBe(200);
      expect(res.body.toString() || res.text).toContain(VOICE_BODY);
    }
  });

  it('returns 404 for a missing voice note when authenticated', async () => {
    const res = await request(app).get('/uploads/voice-notes/nope.webm').set('Cookie', cookies.admin);
    expect(res.status).toBe(404);
  });

  it('never serves uploads/migrations, with or without a session', async () => {
    for (const cookie of [undefined, cookies.admin]) {
      let r = request(app).get(`/uploads/migrations/${tag}.zip`);
      if (cookie) r = r.set('Cookie', cookie);
      const res = await r;
      expect(res.status).toBe(404);
      expect(res.text || '').not.toContain(MIG_BODY);
    }
  });

  it('answers 404 for the uploads root and unknown subpaths', async () => {
    for (const p of ['/uploads', '/uploads/', '/uploads/other/file.txt']) {
      const res = await request(app).get(p).set('Cookie', cookies.admin);
      expect(res.status, p).toBe(404);
    }
  });

  it('does not serve dotfiles inside voice-notes', async () => {
    const res = await request(app).get(`/uploads/voice-notes/.${tag}-hidden`).set('Cookie', cookies.admin);
    expect(res.status).not.toBe(200);
    expect(res.text || '').not.toContain('hidden');
  });

  it('does not allow path traversal out of voice-notes into migrations', async () => {
    for (const p of [`/uploads/voice-notes/..%2fmigrations%2f${tag}.zip`, `/uploads/voice-notes/../migrations/${tag}.zip`, `/uploads/voice-notes/%2e%2e/migrations/${tag}.zip`]) {
      const res = await request(app).get(p).set('Cookie', cookies.admin);
      expect(res.status, p).not.toBe(200);
      expect(res.text || '').not.toContain(MIG_BODY);
    }
  });
});
