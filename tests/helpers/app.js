// Test app helper: imports server.js (TEST_MODE, no listen) and runs bootstrap() with fakes.
// Outside production, server.js seeds three demo users deterministically from fixed values:
//   admin/<SUPERADMIN_DEFAULT_PASS or Admin@12345> (SUPER_ADMIN), employee/emp123 (EMPLOYEE), sales/sales123 (SALESPERSON).
export const TEST_USERS = {
  admin: { username: 'admin', password: process.env.SUPERADMIN_DEFAULT_PASS || 'Admin@12345', role: 'SUPER_ADMIN' },
  employee: { username: 'employee', password: 'emp123', role: 'EMPLOYEE' },
  sales: { username: 'sales', password: 'sales123', role: 'SALESPERSON' },
};

let booted = null;

/** Returns the Express app after a single bootstrap() with no-op init/import/sweep (no MySQL, no disk). */
export async function getApp(deps = {}) {
  const mod = await import('../../server.js');
  if (!booted) {
    booted = mod.bootstrap({
      initDatabase: async () => {},
      importLegacy: async () => {},
      sweepJobs: async () => {},
      ...deps,
    });
  }
  await booted;
  return mod.app;
}

/** Logs in as one of TEST_USERS via Supertest; resolves to { res, cookie }. */
export async function loginAs(app, key = 'admin') {
  const { default: request } = await import('supertest');
  const u = TEST_USERS[key];
  const res = await request(app).post('/api/auth/login').send({ username: u.username, password: u.password });
  const cookie = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  return { res, cookie };
}
