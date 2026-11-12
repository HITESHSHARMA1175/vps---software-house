// Task 36.8: entity routes (requests, renewals, migrations, deleted servers) in MySQL mode and legacy import idempotence.
// Validates: Requirements 10.4, 10.5, 19.7
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { installDbGuard, listen, login } from './helpers/blockRealDb.js';
import { getApp } from './helpers/app.js';
import { createMysqlEntityStore, importLegacyEntities } from '../lib/entityStore.js';

// In-memory MySQL fake; the app runs its real initDatabase against it so Entity_Tables exist.
const fake = vi.hoisted(() => ({ current: null }));
vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  fake.current = createFakeMysql();
  return { ...fake.current.mysql, default: fake.current.mysql };
});

installDbGuard();

let app;
let admin;
let employee;
let sales;
let store;
const as = (cookie, r) => r.set('Cookie', cookie);
const silent = () => {};

beforeAll(async () => {
  app = await listen(await getApp({ initDatabase: undefined }));
  admin = await login(app, 'admin');
  employee = await login(app, 'employee');
  sales = await login(app, 'sales');
  store = createMysqlEntityStore(fake.current.pool());
});
afterAll(() => new Promise((r) => (app ? app.close(r) : r())));

describe('requests', () => {
  it('create, list, update (stored in the requests table)', async () => {
    const create = await as(admin, request(app).post('/api/requests')).send({ id: 'REQ-T1', company: 'Acme', status: 'Pending', salesAgent: 'Someone' });
    expect(create.status).toBe(200);
    expect(create.body.request.id).toBe('REQ-T1');
    expect(fake.current.rows('requests').some((r) => r.id === 'REQ-T1')).toBe(true);

    const list = await as(admin, request(app).get('/api/requests'));
    expect(list.body.requests.map((r) => r.id)).toContain('REQ-T1');

    const upd = await as(admin, request(app).put('/api/requests/REQ-T1')).send({ status: 'Approved', id: 'HIJACK' });
    expect(upd.status).toBe(200);
    const after = await store.get('requests', 'REQ-T1');
    expect(after.status).toBe('Approved');
    expect(after.company).toBe('Acme');
    expect(after.id).toBe('REQ-T1');
  });

  it('generates an id when none is supplied', async () => {
    const res = await as(admin, request(app).post('/api/requests')).send({ company: 'NoId' });
    expect(res.status).toBe(200);
    expect(res.body.request.id).toMatch(/^REQ-/);
  });

  it('salesperson only sees requests for their own agent name', async () => {
    await as(sales, request(app).post('/api/requests')).send({ id: 'REQ-S1', company: 'Mine' });
    await as(admin, request(app).post('/api/requests')).send({ id: 'REQ-OTHER', company: 'Other', salesAgent: 'nobody-else' });
    const list = await as(sales, request(app).get('/api/requests'));
    const ids = list.body.requests.map((r) => r.id);
    expect(ids).toContain('REQ-S1');
    expect(ids).not.toContain('REQ-OTHER');
  });

  it('rejects unauthenticated access', async () => {
    expect((await request(app).get('/api/requests')).status).toBe(401);
  });
});

describe('renewals', () => {
  it('create, list, and admin-only update', async () => {
    const create = await as(employee, request(app).post('/api/renewals')).send({ id: 'REN-T1', company: 'Acme', status: 'Pending' });
    expect(create.status).toBe(200);
    expect(create.body.renewal.requestedBy).toBeTruthy();

    const list = await as(admin, request(app).get('/api/renewals'));
    expect(list.body.renewals.map((r) => r.id)).toContain('REN-T1');

    const denied = await as(employee, request(app).put('/api/renewals/REN-T1')).send({ status: 'Approved' });
    expect(denied.status).toBe(403);
    expect((await store.get('renewals', 'REN-T1')).status).toBe('Pending');

    const ok = await as(admin, request(app).put('/api/renewals/REN-T1')).send({ status: 'Approved' });
    expect(ok.status).toBe(200);
    expect((await store.get('renewals', 'REN-T1')).status).toBe('Approved');
  });

  it('generates an id when none is supplied', async () => {
    const res = await as(admin, request(app).post('/api/renewals')).send({ company: 'NoId' });
    expect(res.body.renewal.id).toMatch(/^REN-/);
  });
});

describe('migrations', () => {
  it('lists, deletes one, and clears finished records only', async () => {
    await store.put('migrations', { id: 'MIG-DONE', status: 'COMPLETED', createdAt: '2024-01-01T00:00:00.000Z' });
    await store.put('migrations', { id: 'MIG-FAIL', status: 'FAILED', createdAt: '2024-01-02T00:00:00.000Z' });
    await store.put('migrations', { id: 'MIG-RUN', status: 'IN_PROGRESS', createdAt: '2024-01-03T00:00:00.000Z' });

    const list = await as(admin, request(app).get('/api/migrations'));
    expect(list.status).toBe(200);
    const ids = list.body.migrations.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['MIG-DONE', 'MIG-FAIL', 'MIG-RUN']));

    const one = await as(admin, request(app).delete('/api/migrations/MIG-DONE'));
    expect(one.status).toBe(200);
    expect(await store.get('migrations', 'MIG-DONE')).toBeNull();

    const clear = await as(admin, request(app).delete('/api/migrations'));
    expect(clear.status).toBe(200);
    expect(clear.body.deletedCount).toBe(1);
    expect(await store.get('migrations', 'MIG-FAIL')).toBeNull();
    expect(await store.get('migrations', 'MIG-RUN')).not.toBeNull();
  });
});

describe('deleted servers', () => {
  it('deleting a server writes tombstones and removes the server; non-admin is refused', async () => {
    const created = await as(admin, request(app).post('/api/servers')).send({ id: 'vps-del-1', name: 'Tomb Node', ipPort: '10.20.30.40:443' });
    expect(created.status).toBe(200);

    expect((await as(employee, request(app).delete('/api/servers/vps-del-1'))).status).toBe(403);
    expect(await store.isDeleted('vps-del-1')).toBe(false);

    const del = await as(admin, request(app).delete('/api/servers/vps-del-1'));
    expect(del.status).toBe(200);
    expect(await store.isDeleted('vps-del-1')).toBe(true);
    expect(await store.isDeleted('10.20.30.40')).toBe(true);
    const tokens = fake.current.rows('deleted_servers').map((r) => r.token);
    expect(tokens).toEqual(expect.arrayContaining(['vps-del-1', 'tomb node']));
    expect(fake.current.rows('vps_servers').some((r) => r.id === 'vps-del-1')).toBe(false);
  });
});

describe('legacy import', () => {
  const dataset = {
    requests: [{ id: 'R1', company: 'A' }, { id: 'R2', company: 'B' }, { id: 'R1', company: 'dup' }],
    renewals: [{ id: 'N1' }],
    migrations: [{ id: 'M1', status: 'COMPLETED' }],
    deletedServers: ['gone-1', 'gone-2'],
  };
  const counts = async (s) => ({
    requests: await s.count('requests'),
    renewals: await s.count('renewals'),
    migrations: await s.count('migrations'),
    deletedServers: await s.count('deletedServers'),
  });

  it('importing the same dataset twice yields the same counts as once', async () => {
    fake.current.exec('DELETE FROM `requests`');
    fake.current.exec('DELETE FROM `renewals`');
    fake.current.exec('DELETE FROM `migrations`');
    fake.current.exec('DELETE FROM `deleted_servers`');

    const first = await importLegacyEntities(store, [dataset], silent);
    const once = await counts(store);
    expect(once).toEqual({ requests: 2, renewals: 1, migrations: 1, deletedServers: 2 });
    expect(first.requests.imported).toBe(2);

    const second = await importLegacyEntities(store, [dataset], silent);
    expect(await counts(store)).toEqual(once);
    for (const k of Object.keys(second)) expect(second[k].imported).toBe(0);
  });
});
