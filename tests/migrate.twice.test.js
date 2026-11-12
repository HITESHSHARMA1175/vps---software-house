// Task 36.9: Migration_Script double run on the same fake database.
// **Validates: Requirements 8.5, 19.8**
// Fully in-memory: mysql2/promise is the fake MySQL, and every database.json fs call is intercepted.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { fake } = await vi.hoisted(async () => {
  const { createFakeMysql } = await import('./helpers/fakeMysql.js');
  return { fake: createFakeMysql() };
});
vi.mock('mysql2/promise', () => fake.moduleExports);

const { main, SOURCES } = await import('../scripts/migrate_passwords.js');
const { isCiphertext, decrypt, parseKey } = await import('../lib/secretCipher.js');

const KEY_B64 = Buffer.alloc(32, 9).toString('base64');
const KEY = parseKey(KEY_B64);
const JSON_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json');
const TOTP = 'JBSWY3DPEHPK3PXP';

describe('Migration_Script double run', () => {
  let files; // in-memory files keyed by resolved path
  let logs;

  let portalJson = { id: 1, two_factor_secret: TOTP, two_factor_temp_secret: null };
  const initialJson = () => ({
    users: [{ id: 1, password: 'Pass#123' }, { id: 2, password: '' }],
    servers: [{ id: 1, superClientPass: 'srv-secret' }],
    provisionJobs: [{ id: 'j1', password: 'job-secret' }],
    portalUsers: [portalJson],
  });

  beforeEach(() => {
    fake.reset();
    logs = [];
    portalJson = { id: 1, two_factor_secret: TOTP, two_factor_temp_secret: null };
    files = new Map([[JSON_PATH, JSON.stringify(initialJson())]]);

    fake.seed('client_subscriptions', [{ id: 1, password: 'mysql-pass' }, { id: 2, password: null }]);
    fake.seed('vps_servers', [{ id: 1, superClientPass: 'mysql-srv' }]);
    fake.seed('vps_provision_jobs', [{ id: 1, password: 'mysql-job' }]);
    fake.seed('portal_users', [{ id: 1, two_factor_secret: TOTP, two_factor_temp_secret: TOTP }]);
    // Columns are already wide enough, so no ALTER is issued.
    fake.onQuery(/information_schema\.COLUMNS/i, () => [[{ len: 4096, nullable: 'YES', def: null }], []]);

    const real = {
      readFileSync: fs.readFileSync, existsSync: fs.existsSync, statSync: fs.statSync,
    };
    const key = (p) => path.resolve(String(p));
    vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...r) => (files.has(key(p)) ? files.get(key(p)) : real.readFileSync.call(fs, p, ...r)));
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => files.has(key(p)) || real.existsSync.call(fs, p));
    vi.spyOn(fs, 'statSync').mockImplementation((p, ...r) => (files.has(key(p)) ? { size: Buffer.byteLength(files.get(key(p))) } : real.statSync.call(fs, p, ...r)));
    vi.spyOn(fs, 'copyFileSync').mockImplementation((a, b) => { files.set(key(b), files.get(key(a))); });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p, data) => { files.set(key(p), String(data)); });
    vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => { files.set(key(b), files.get(key(a))); files.delete(key(a)); });
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a) => { logs.push(a.join(' ')); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = () => main(['--confirm-backup'], { PASSWORD_ENCRYPTION_KEY: KEY_B64, DB_HOST: 'fake' });
  const mysqlState = () => SOURCES.map((s) => fake.rows(s.table).map((r) => [r.id, r[s.column]]));

  const doubleRun = async () => {
    expect(await run()).toBe(0);

    // first run really encrypted both stores
    const afterFirstJson = files.get(JSON_PATH);
    const afterFirstMysql = JSON.stringify(mysqlState());
    const db1 = JSON.parse(afterFirstJson);
    expect(isCiphertext(db1.users[0].password)).toBe(true);
    expect(decrypt(db1.users[0].password, KEY)).toBe('Pass#123');
    expect(isCiphertext(fake.rows('client_subscriptions')[0].password)).toBe(true);
    expect(isCiphertext(fake.rows('portal_users')[0].two_factor_secret)).toBe(true);

    logs.length = 0;
    const writesBefore = fake.queries.filter((q) => /^\s*(UPDATE|INSERT|DELETE|ALTER)/i.test(q.sql)).length;
    const backupsBefore = [...files.keys()].filter((k) => k.includes('.bak-')).length;

    expect(await run()).toBe(0);

    expect(files.get(JSON_PATH)).toBe(afterFirstJson);
    expect(JSON.stringify(mysqlState())).toBe(afterFirstMysql);
    // no further UPDATE / ALTER issued, and no errors printed
    expect(fake.queries.filter((q) => /^\s*(UPDATE|INSERT|DELETE|ALTER)/i.test(q.sql)).length).toBe(writesBefore);
    expect(logs.join('\n')).not.toMatch(/FAILED|Unexpected|unavailable/);
    // every reported line shows migrated=0 and failed=0
    const counts = logs.filter((l) => l.includes('migrated='));
    expect(counts.length).toBe(SOURCES.length * 2);
    for (const l of counts) {
      expect(l).toMatch(/migrated=0 /);
      expect(l).toMatch(/failed=0$/);
    }
    // the script may take a database.json backup again, but it never changes the data
    expect(backupsBefore).toBeGreaterThanOrEqual(1);
  };

  it('second run leaves MySQL and database.json identical, migrates 0 rows, exits 0', async () => {
    // database.json portalUsers carries only a temp secret (the next test covers both fields)
    portalJson = { id: 1, two_factor_secret: null, two_factor_temp_secret: TOTP };
    files.set(JSON_PATH, JSON.stringify(initialJson()));
    await doubleRun();
  });

  // portalUsers is the JSON collection for two sources; updates are applied cumulatively so both migrate in one run.
  it('same, when a portalUsers record has both two_factor_secret and a temp secret', async () => {
    portalJson = { id: 1, two_factor_secret: TOTP, two_factor_temp_secret: TOTP };
    files.set(JSON_PATH, JSON.stringify(initialJson()));
    await doubleRun();
  });
});
