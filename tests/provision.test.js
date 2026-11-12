// Task 36.3: provision flow and job-parameter validation through the real Express app.
// Validates: Requirements 7.12, 9.1, 19.5, 19.9
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { installDbGuard, listen, login } from './helpers/blockRealDb.js';
import { getApp } from './helpers/app.js';
import { isCiphertext } from '../lib/secretCipher.js';
import { validateJobParams, JobParamError } from '../lib/jobParams.js';

installDbGuard();

let app;
afterAll(() => new Promise((r) => (app ? app.close(r) : r())));
let cookie;
const PW = 'Zq9-Prov!sion#Pass42';

beforeAll(async () => {
  app = await listen(await getApp());
  cookie = await login(app, 'admin');
  expect(cookie).toBeTruthy();
});

const auth = (r) => r.set('Cookie', cookie);
const diskText = () => { try { return fs.readFileSync(process.env.DB_FILE_PATH, 'utf8'); } catch { return ''; } };

describe('provision flow', () => {
  it('queues a job, hands the agent the plaintext once, and holds no password after the result', async () => {
    const serverId = 'srv-prov-flow';
    const create = await auth(request(app).post('/api/users')).send({
      id: 'user-prov-flow', company: 'Prov Flow Co', username: 'provflow', password: PW, serverId, drive: 'Drive D',
    });
    expect(create.status).toBe(200);
    expect(create.body.provisionJob).toBeTruthy();
    const jobId = create.body.provisionJob.id;

    // Nothing the admin UI receives carries the plaintext or a ciphertext.
    expect(create.text).not.toContain(PW);
    expect(create.text).not.toMatch(/enc:v1:/);
    // Nor does the persisted JSON copy.
    expect(diskText()).not.toContain(PW);

    // Agent retrieves the job: plaintext appears only in this per-response copy.
    const listen = await request(app).get('/api/agent/listen-jobs').query({ serverId });
    expect(listen.status).toBe(200);
    const delivered = listen.body.pendingJobs.find((j) => j.id === jobId);
    expect(delivered).toBeTruthy();
    expect(delivered.action).toBe('PROVISION_TALLY_USER');
    expect(delivered.password).toBe(PW);
    expect(isCiphertext(delivered.password)).toBe(false);

    // Agent reports the result.
    const done = await request(app).post('/api/agent/job-result').send({ serverId, jobId, status: 'COMPLETED', message: 'ok' });
    expect(done.status).toBe(200);

    // The job is no longer deliverable and no password text is anywhere on disk.
    const tele = await request(app).post('/api/agent/telemetry').send({ serverId });
    expect(tele.status).toBe(200);
    expect((tele.body.pendingJobs || []).find((j) => j.id === jobId)).toBeUndefined();
    expect(diskText()).not.toContain(PW);

    // A late duplicate report cannot resurrect the password either.
    const again = await request(app).get('/api/agent/telemetry').query({ serverId });
    expect(JSON.stringify(again.body)).not.toContain(PW);
  });

  it('a user created without autoProvision queues nothing', async () => {
    const serverId = 'srv-prov-none';
    const create = await auth(request(app).post('/api/users')).send({
      id: 'user-prov-none', company: 'No Prov Co', username: 'noprov', password: PW, serverId, drive: 'Drive D', autoProvision: false,
    });
    expect(create.status).toBe(200);
    expect(create.body.provisionJob).toBeFalsy();
    const tele = await request(app).post('/api/agent/telemetry').send({ serverId });
    expect(tele.body.pendingJobs || []).toEqual([]);
  });
});

describe('job parameters (task 16): injection payloads', () => {
  const GENERIC = 'Invalid request parameters';

  async function pendingFor(serverId) {
    const tele = await request(app).post('/api/agent/telemetry').send({ serverId });
    return tele.body.pendingJobs || [];
  }

  // Routes that take job input from the request BODY sit behind jobRequestGuard, which answers the generic 400.
  it.each([
    ['username', { username: 'bob; Remove-Item C:\\ -Recurse', enabled: false }],
    ['username (backtick/subexpression)', { username: 'bob\u0060whoami\u0060$(calc)', enabled: false }],
  ])('change-user-status with a hostile %s returns the generic 400 and queues nothing', async (_label, body) => {
    const serverId = 'srv-inj-status';
    const res = await auth(request(app).post('/api/servers/' + serverId + '/change-user-status')).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: GENERIC });
    expect(res.text).not.toContain('Remove-Item');
    expect(res.text).not.toContain('whoami');
    expect(await pendingFor(serverId)).toEqual([]);
  });

  it('initialize-disk with a hostile drive letter returns the generic 400 and queues nothing', async () => {
    const serverId = 'srv-inj-drive';
    const res = await auth(request(app).post('/api/servers/' + serverId + '/initialize-disk')).send({ diskNumber: 1, driveLetter: 'D:; calc', label: 'Data' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: GENERIC });
    expect(await pendingFor(serverId)).toEqual([]);
  });

  it('companyName: shell metacharacters are stripped, characters outside the allowlist are rejected', () => {
    const opts = {};
    expect(validateJobParams({ companyName: 'Acme \u0060whoami\u0060 $(calc);' }, opts).companyName).not.toMatch(/[\u0060$();]/);
    expect(() => validateJobParams({ companyName: 'Acme {calc} %COMSPEC%' }, opts)).toThrow(JobParamError);
    expect(() => validateJobParams({ companyName: 'x'.repeat(101) }, opts)).toThrow(JobParamError);
    try { validateJobParams({ companyName: 'Acme {calc}' }, opts); } catch (e) { expect(e.message).toBe('Invalid job parameters'); expect(e.message).not.toContain('calc'); }
  });

  // Routes whose job input is validated inside the handler (jobRouteHandler maps JobParamError to the generic 400).
  describe('handler-level validation', () => {
    const rejections = [];
    const onRejection = (reason) => { rejections.push(reason); };
    beforeAll(() => { process.on('unhandledRejection', onRejection); });
    afterAll(() => { process.off('unhandledRejection', onRejection); });

    const T = { response: 3000, deadline: 5000 };
    const expectGeneric400 = (res, hostile) => {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: GENERIC });
      expect(res.text).not.toContain(hostile);
    };
    const usersText = async () => JSON.stringify((await auth(request(app).get('/api/users'))).body);
    const stillUp = async () => {
      const ok = await auth(request(app).get('/api/users')).timeout(T);
      expect(ok.status).toBe(200);
    };

    it.each([
      ['a"; rm -rf /'],
      ['bob; Remove-Item C:\\ -Recurse'],
    ])('POST /api/users with hostile username %j returns the generic 400, creates nothing, queues nothing', async (username) => {
      const serverId = 'srv-inj-users-name';
      const id = 'user-inj-name-' + username.length;
      const res = await auth(request(app).post('/api/users')).timeout(T).send({
        id, company: 'Hostile Name Co ' + username.length, username, password: PW, serverId, drive: 'Drive D',
      });
      expectGeneric400(res, username);
      expect(await pendingFor(serverId)).toEqual([]);
      expect(await usersText()).not.toContain(id);
      await stillUp();
    });

    it.each([['C:\\..\\..'], ['D:; calc']])('POST /api/users with hostile drive %j returns the generic 400, creates nothing, queues nothing', async (drive) => {
      const serverId = 'srv-inj-users-drive';
      const id = 'user-inj-drive-' + drive.length;
      const res = await auth(request(app).post('/api/users')).timeout(T).send({
        id, company: 'Hostile Drive Co ' + drive.length, username: 'gooduser' + drive.length, password: PW, serverId, drive,
      });
      expectGeneric400(res, drive);
      expect(await pendingFor(serverId)).toEqual([]);
      expect(await usersText()).not.toContain(id);
      await stillUp();
    });

    async function makeUser(id, serverId, extra = {}) {
      const res = await auth(request(app).post('/api/users')).timeout(T).send({
        id, company: 'Prov Target ' + id, username: 'target' + id.length, password: PW, serverId, drive: 'Drive D', autoProvision: false, ...extra,
      });
      expect(res.status).toBe(200);
      return res;
    }

    it('provision-vps with a hostile drive returns the generic 400 and queues nothing', async () => {
      const serverId = 'srv-inj-pv-drive';
      await makeUser('user-pv-drive', serverId);
      for (const drive of ['C:\\..\\..', 'D:; calc']) {
        const res = await auth(request(app).post('/api/users/user-pv-drive/provision-vps')).timeout(T).send({ drive });
        expectGeneric400(res, drive);
      }
      expect(await pendingFor(serverId)).toEqual([]);
      await stillUp();
    });

    it('provision-vps for a user whose stored username is hostile returns the generic 400 and queues nothing', async () => {
      const serverId = 'srv-inj-pv-name';
      await makeUser('user-pv-name', serverId);
      const hostile = 'a"; rm -rf /';
      // Plant the hostile username directly on the stored record (as a legacy/imported record might hold it).
      const put = await auth(request(app).put('/api/users/user-pv-name')).timeout(T).send({
        id: 'user-pv-name', company: 'Prov Target user-pv-name', username: hostile, password: PW, serverId, drive: 'Drive D', autoProvision: false,
      });
      expect([200, 400]).toContain(put.status);
      const res = await auth(request(app).post('/api/users/user-pv-name/provision-vps')).timeout(T).send({});
      expectGeneric400(res, hostile);
      expect(await pendingFor(serverId)).toEqual([]);
      await stillUp();
    });

    it.each([['a"; rm -rf /'], ['bob; Remove-Item C:\\ -Recurse']])('os-users/%j/change-password returns the generic 400 and queues nothing', async (username) => {
      const serverId = 'srv-inj-cpw';
      const res = await auth(request(app).post('/api/servers/' + serverId + '/os-users/' + encodeURIComponent(username) + '/change-password'))
        .timeout(T).send({ newPassword: PW });
      expectGeneric400(res, username);
      expect(await pendingFor(serverId)).toEqual([]);
      await stillUp();
    });

    it('recorded no unhandled rejections and the server still answers', async () => {
      await new Promise((r) => setTimeout(r, 50));
      expect(rejections).toEqual([]);
      await stillUp();
    });
  });
});