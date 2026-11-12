// Task 56.2: the MySQL "connected" startup log prints the configured database name.
// Validates: Requirements 12.6
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createFakeMysql } from './helpers/fakeMysql.js';

vi.mock('mysql2/promise', async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  globalThis.__dbNameFake ??= createFakeMysql();
  return globalThis.__dbNameFake.moduleExports;
});
globalThis.__dbNameFake ??= createFakeMysql();

const SAVED = { ...process.env };
const PASSWORD = 'Sup3r-Secret-Db-Pass-56';

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.__dbNameFake.reset();
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

describe('initMySQLDatabase connected log (Req 12.6)', () => {
  it('prints the configured DB_NAME, not the old literal, and no password', async () => {
    const lines = [];
    for (const level of ['log', 'warn', 'error']) {
      vi.spyOn(console, level).mockImplementation((...a) => { lines.push(a.join(' ')); });
    }
    vi.resetModules();
    delete process.env.MYSQL_DATABASE;
    Object.assign(process.env, {
      DB_NAME: 'custom_db_x',
      DB_PASSWORD: PASSWORD,
      NODE_ENV: 'test',
      SUPERADMIN_DEFAULT_PASS: 'Startup-Test-Admin-1!',
    });
    const { getApp } = await import('./helpers/app.js');
    await getApp({ initDatabase: undefined });

    const connected = lines.filter((l) => /Database Connected/i.test(l));
    expect(connected.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).toContain('custom_db_x');
    expect(all).not.toContain('innovati4_vps_db');
    expect(all).not.toContain(PASSWORD);
  });
});
