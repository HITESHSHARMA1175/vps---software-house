import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseRealMysqlUrl,
  collectProtectedNames,
  checkTargetGuard,
  generateThrowawayName,
  stripDatabaseStatements,
  THROWAWAY_PREFIX
} from '../scripts/test_real_mysql.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'test_real_mysql.js');

function runScript(extraEnv) {
  const env = { ...process.env };
  delete env.REAL_MYSQL_URL;
  delete env.DB_NAME;
  delete env.MYSQL_DATABASE;
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 20000
  });
}

describe('real MySQL guard (Requirement 37)', () => {
  it('uses the vps_it_ prefix', () => {
    expect(THROWAWAY_PREFIX).toBe('vps_it_');
  });

  it('collects protected names from env and .env text', () => {
    const names = collectProtectedNames(
      { DB_NAME: 'EnvDb', MYSQL_DATABASE: 'EnvMy' },
      'DB_NAME=FileDb\nMYSQL_DATABASE=FileMy\n'
    );
    expect(names).toEqual(['EnvDb', 'EnvMy', 'FileDb', 'FileMy']);
  });

  it('refuses a target equal to a protected name, case-insensitively, from env and .env text', () => {
    const protectedNames = collectProtectedNames({ DB_NAME: 'vps_it_abc' }, 'MYSQL_DATABASE=vps_it_def');
    expect(checkTargetGuard({ name: 'VPS_IT_ABC', protectedNames }).ok).toBe(false);
    expect(checkTargetGuard({ name: 'vps_it_DEF', protectedNames }).ok).toBe(false);
    const viaMysqlEnv = collectProtectedNames({ MYSQL_DATABASE: 'vps_it_zzz' }, '');
    expect(checkTargetGuard({ name: 'vps_it_ZZZ', protectedNames: viaMysqlEnv }).ok).toBe(false);
  });

  it('refuses when the URL path names a protected database', () => {
    const r = checkTargetGuard({
      name: generateThrowawayName(),
      urlDatabase: 'Vps_Management_Db',
      protectedNames: ['vps_management_db']
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/REAL_MYSQL_URL/);
  });

  it('refuses names without the throwaway prefix', () => {
    expect(checkTargetGuard({ name: 'vps_management_db', protectedNames: [] }).ok).toBe(false);
  });

  it('accepts a fresh throwaway name', () => {
    const r = checkTargetGuard({
      name: generateThrowawayName(),
      urlDatabase: 'other',
      protectedNames: ['vps_management_db']
    });
    expect(r).toEqual({ ok: true });
  });

  it('generated names carry the prefix and differ', () => {
    const a = generateThrowawayName();
    const b = generateThrowawayName();
    expect(a.startsWith(THROWAWAY_PREFIX)).toBe(true);
    expect(b.startsWith(THROWAWAY_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('stripDatabaseStatements removes CREATE DATABASE and USE but keeps CREATE TABLE', () => {
    const sql = [
      'CREATE DATABASE IF NOT EXISTS vps_management_db;',
      'USE vps_management_db;',
      'CREATE TABLE `t` (id INT);'
    ].join('\n');
    const out = stripDatabaseStatements(sql);
    expect(out).not.toMatch(/CREATE\s+DATABASE/i);
    expect(out).not.toMatch(/^\s*USE\b/im);
    expect(out).toContain('CREATE TABLE `t` (id INT);');
  });

  it('parses the URL and decodes credentials', () => {
    const p = parseRealMysqlUrl('mysql://us%40er:p%3Aw%2Fd@db.example:3307/somedb');
    expect(p).toEqual({
      host: 'db.example',
      port: 3307,
      user: 'us@er',
      password: 'p:w/d',
      pathDb: 'somedb'
    });
    expect(() => parseRealMysqlUrl('http://x')).toThrow();
  });
});

describe('test_real_mysql.js process behaviour', () => {
  it('prints SKIPPED and exits 0 when REAL_MYSQL_URL is unset', () => {
    const r = runScript({});
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SKIPPED/);
  });

  it('REFUSES before connecting when the URL path names the configured DB_NAME', () => {
    // Port 1 is closed: reaching a connect attempt would produce a connection error, not REFUSED.
    const r = runScript({ REAL_MYSQL_URL: 'mysql://u:p@127.0.0.1:1/protecteddb', DB_NAME: 'protecteddb' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED/);
    expect(r.stdout).not.toMatch(/PASS|create throwaway/);
  });
});
