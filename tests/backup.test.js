// Stub-based tests for scripts/backup_mysql.sh (task 10.2).
// Skipped when bash is not available.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'backup_mysql.sh');
const STUB = path.join(ROOT, 'tests', 'fixtures', 'mysqldump-stub.sh');
const posix = (p) => p.replace(/\\/g, '/');

const probe = spawnSync('bash', ['-c', 'command -v gzip && command -v find && command -v mktemp'], { encoding: 'utf8' });
const HAS_BASH = !probe.error && probe.status === 0;

const SECRET = 'S3cr3t-Pa55word!';
let tmp, stubDir, backupDir, envFile;

// Runs the script under bash with the stub mysqldump first on PATH.
function run(extraEnv = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(DB_|MYSQL_|BACKUP_)/.test(k)) delete env[k];
  }
  Object.assign(env, {
    ENV_FILE: posix(envFile),
    BACKUP_DIR: posix(backupDir),
    STUB_DIR: posix(stubDir),
    SCRIPT: posix(SCRIPT),
    DB_HOST: 'localhost',
    DB_USER: 'backup_user',
    DB_PASSWORD: SECRET,
    DB_NAME: 'vpsdb',
    ...extraEnv,
  });
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const wrapper =
    'S="$STUB_DIR"; command -v cygpath >/dev/null 2>&1 && S="$(cygpath -u "$STUB_DIR")"; ' +
    'chmod +x "$S/mysqldump"; PATH="$S:$PATH"; exec bash "$SCRIPT"';
  return spawnSync('bash', ['-c', wrapper], { env, encoding: 'utf8' });
}

const dumps = () => fs.readdirSync(backupDir).filter((f) => f.endsWith('.sql.gz'));

describe.skipIf(!HAS_BASH)('scripts/backup_mysql.sh (stub mysqldump)', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
    stubDir = path.join(tmp, 'bin');
    backupDir = path.join(tmp, 'backups');
    envFile = path.join(tmp, 'empty.env');
    fs.mkdirSync(stubDir);
    fs.writeFileSync(envFile, '');
    fs.copyFileSync(STUB, path.join(stubDir, 'mysqldump'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('names the file DB_NAME_YYYYMMDD_HHMMSS.sql.gz and exits 0', () => {
    const r = run();
    expect(r.status).toBe(0);
    const files = dumps();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^vpsdb_\d{8}_\d{6}\.sql\.gz$/);
    expect(fs.statSync(path.join(backupDir, files[0])).size).toBeGreaterThan(0);
  });

  it('never puts the password in mysqldump argv; it goes through the option file', () => {
    expect(run().status).toBe(0);
    const argv = fs.readFileSync(path.join(stubDir, 'argv.log'), 'utf8');
    expect(argv).not.toContain(SECRET);
    expect(argv).toContain('--defaults-extra-file=');
    expect(fs.readFileSync(path.join(stubDir, 'cnf.log'), 'utf8')).toContain(SECRET);
  });

  it('prunes matching files older than the retention and keeps newer and unrelated files', () => {
    fs.mkdirSync(backupDir, { recursive: true });
    const old = path.join(backupDir, 'vpsdb_20200101_000000.sql.gz');
    const recent = path.join(backupDir, 'vpsdb_20991231_000000.sql.gz');
    const other = path.join(backupDir, 'otherdb_20200101_000000.sql.gz');
    for (const f of [old, recent, other]) fs.writeFileSync(f, 'x');
    const past = new Date(Date.now() - 30 * 86400 * 1000);
    fs.utimesSync(old, past, past);
    fs.utimesSync(other, past, past);
    const r = run({ BACKUP_RETENTION_DAYS: '7' });
    expect(r.status).toBe(0);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    expect(dumps().length).toBe(3); // recent + other + the new dump
  });

  it.each(['0', '3651', 'abc', '-5', '1.5'])('rejects invalid retention %s before deleting anything', (val) => {
    fs.mkdirSync(backupDir, { recursive: true });
    const old = path.join(backupDir, 'vpsdb_20200101_000000.sql.gz');
    fs.writeFileSync(old, 'x');
    const past = new Date(Date.now() - 30 * 86400 * 1000);
    fs.utimesSync(old, past, past);
    const r = run({ BACKUP_RETENTION_DAYS: val });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BACKUP_RETENTION_DAYS');
    expect(fs.existsSync(old)).toBe(true);
    expect(dumps()).toEqual(['vpsdb_20200101_000000.sql.gz']);
  });

  it('fails naming the missing setting and creates no file', () => {
    const r = run({ DB_PASSWORD: undefined });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('DB_PASSWORD');
    expect(fs.existsSync(backupDir) ? dumps() : []).toHaveLength(0);
  });

  it('removes the partial file, skips pruning, and returns non-zero when mysqldump fails', () => {
    fs.mkdirSync(backupDir, { recursive: true });
    const old = path.join(backupDir, 'vpsdb_20200101_000000.sql.gz');
    fs.writeFileSync(old, 'x');
    const past = new Date(Date.now() - 30 * 86400 * 1000);
    fs.utimesSync(old, past, past);
    const r = run({ STUB_EXIT: '3' });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('3');
    expect(dumps()).toEqual(['vpsdb_20200101_000000.sql.gz']); // no partial, old one not pruned
  });
});
