// Opt-in integration check against a REAL, DISPOSABLE MariaDB/MySQL server (Requirement 37).
//
//   REAL_MYSQL_URL=mysql://root:<password>@127.0.0.1:3307 npm run test:realmysql
//
// Without REAL_MYSQL_URL the script prints SKIPPED and exits 0.
// It creates a throwaway database (vps_it_<hex>), loads schema.sql into it, runs initMySQLDatabase twice,
// checks widened columns and the session validation JOIN, and always drops only that throwaway database.
// It never reads production settings into process.env and refuses to run against a database named like DB_NAME.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
export const THROWAWAY_PREFIX = 'vps_it_';

/** Parse mysql://user:password@host:port (a path segment is reported but never used to pick the database). */
export function parseRealMysqlUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('REAL_MYSQL_URL is not a valid URL'); }
  if (u.protocol !== 'mysql:' && u.protocol !== 'mariadb:') {
    throw new Error('REAL_MYSQL_URL must look like mysql://user:password@host:port');
  }
  if (!u.hostname) throw new Error('REAL_MYSQL_URL has no host');
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    pathDb: decodeURIComponent((u.pathname || '').replace(/^\/+/, ''))
  };
}

/** Database names configured as DB_NAME / MYSQL_DATABASE in the environment and in .env text (never loaded into process.env). */
export function collectProtectedNames(env = process.env, envFileText = '') {
  const fileVars = envFileText ? dotenv.parse(envFileText) : {};
  return [env.DB_NAME, env.MYSQL_DATABASE, fileVars.DB_NAME, fileVars.MYSQL_DATABASE]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

/**
 * Guard: refuse when the throwaway name or the URL path names a protected (production) database.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function checkTargetGuard({ name, urlDatabase = '', protectedNames = [] }) {
  const lower = new Set(protectedNames.map((n) => String(n).toLowerCase()));
  if (!name || !String(name).toLowerCase().startsWith(THROWAWAY_PREFIX)) {
    return { ok: false, reason: `throwaway database name must start with ${THROWAWAY_PREFIX}` };
  }
  if (lower.has(String(name).toLowerCase())) {
    return { ok: false, reason: 'throwaway database name equals the configured DB_NAME' };
  }
  if (urlDatabase && lower.has(String(urlDatabase).toLowerCase())) {
    return { ok: false, reason: 'REAL_MYSQL_URL names the configured DB_NAME database' };
  }
  return { ok: true };
}

export function generateThrowawayName() {
  return `${THROWAWAY_PREFIX}${crypto.randomBytes(6).toString('hex')}`;
}

/** Remove CREATE DATABASE / USE statements so schema.sql can never touch vps_management_db. */
export function stripDatabaseStatements(sql) {
  return String(sql)
    .replace(/^\s*CREATE\s+(DATABASE|SCHEMA)\b[^;]*;[ \t]*\r?$/gim, '')
    .replace(/^\s*USE\s+[^;]*;[ \t]*\r?$/gim, '');
}

const qid = (n) => '`' + String(n).replace(/`/g, '``') + '`';

async function main() {
  const rawUrl = process.env.REAL_MYSQL_URL;
  if (!rawUrl || !rawUrl.trim()) {
    console.log('SKIPPED (REAL_MYSQL_URL not set)');
    return 0;
  }

  let target;
  try { target = parseRealMysqlUrl(rawUrl); } catch (e) { console.error(`FAILED: ${e.message}`); return 1; }

  let envText = '';
  try { envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { /* no .env is fine */ }
  const protectedNames = collectProtectedNames(process.env, envText);
  const dbName = generateThrowawayName();
  const guard = checkTargetGuard({ name: dbName, urlDatabase: target.pathDb, protectedNames });
  if (!guard.ok) {
    console.error(`REFUSED: ${guard.reason}. Nothing was created.`);
    return 1;
  }

  const results = [];
  const step = (label, ok, detail = '') => {
    results.push({ label, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) throw new Error(`step failed: ${label}`);
  };

  const conn0 = { host: target.host, port: target.port, user: target.user, password: target.password };
  let admin = null;
  let created = false;
  let exitCode = 0;
  try {
    admin = await mysql.createConnection({ ...conn0, connectTimeout: 5000 });
    await admin.query(`CREATE DATABASE ${qid(dbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    step('create throwaway database', true, dbName);

    // Load schema.sql (CREATE DATABASE / USE removed) through a dedicated multi-statement connection.
    const schemaSql = stripDatabaseStatements(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
    const loader = await mysql.createConnection({ ...conn0, database: dbName, multipleStatements: true });
    try { await loader.query(schemaSql); } finally { await loader.end(); }
    step('load schema.sql into throwaway database', true);

    // Environment for server.js: set before import, never from .env.
    Object.assign(process.env, {
      DB_HOST: target.host,
      DB_PORT: String(target.port),
      DB_USER: target.user,
      DB_PASSWORD: target.password,
      DB_NAME: dbName,
      DB_SKIP_SOCKETS: '1',
      TEST_MODE: '1',
      NODE_ENV: 'test',
      PASSWORD_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
    });
    delete process.env.MYSQL_DATABASE;
    delete process.env.MYSQL_HOST;
    delete process.env.MYSQL_USER;
    delete process.env.MYSQL_PASSWORD;

    const { initMySQLDatabase } = await import(pathToFileURL(path.join(ROOT, 'server.js')).href);

    const db = await mysql.createConnection({ ...conn0, database: dbName });
    try {
      const countAll = async () => {
        const [tables] = await db.query(
          "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
          [dbName]
        );
        const counts = {};
        for (const { t } of tables) {
          const [[row]] = await db.query(`SELECT COUNT(*) AS c FROM ${qid(t)}`);
          counts[t] = Number(row.c);
        }
        return counts;
      };

      await initMySQLDatabase();
      const first = await countAll();
      step('initMySQLDatabase first run', Object.keys(first).length > 0, `${Object.keys(first).length} tables`);

      await initMySQLDatabase();
      const second = await countAll();
      step('initMySQLDatabase second run is repeat-safe (row counts equal)', JSON.stringify(first) === JSON.stringify(second));

      // Widened column lengths and a long value that must be accepted.
      const widened = [
        ['client_subscriptions', 'password', 2048],
        ['vps_servers', 'superClientPass', 2048],
        ['vps_provision_jobs', 'password', 2048],
        ['vps_servers', 'apiKey', 255],
        ['portal_users', 'two_factor_secret', 512],
        ['portal_users', 'two_factor_temp_secret', 512]
      ];
      for (const [tbl, col, want] of widened) {
        const [[c]] = await db.query(
          'SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [dbName, tbl, col]
        );
        step(`${tbl}.${col} length >= ${want}`, !!c && Number(c.len) >= want, c ? `len ${c.len}` : 'missing');

        // Insert a minimal row (required columns filled generically) carrying a long value.
        const [req] = await db.query(
          "SELECT COLUMN_NAME AS n, DATA_TYPE AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL AND EXTRA NOT LIKE '%auto_increment%' AND EXTRA NOT LIKE '%GENERATED%'",
          [dbName, tbl]
        );
        const row = {};
        for (const { n, d } of req) {
          if (/int|decimal|float|double/i.test(d)) row[n] = 0;
          else if (/timestamp|datetime/i.test(d)) row[n] = new Date();
          else row[n] = `it-${crypto.randomBytes(4).toString('hex')}`;
        }
        const valueLen = Math.min(Number(c.len), 600);
        row[col] = 'p'.repeat(valueLen);
        const cols = Object.keys(row);
        await db.query(
          `INSERT INTO ${qid(tbl)} (${cols.map(qid).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          cols.map((k) => row[k])
        );
        const [[back]] = await db.query(`SELECT CHAR_LENGTH(${qid(col)}) AS l FROM ${qid(tbl)} WHERE ${qid(col)} = ? LIMIT 1`, [row[col]]);
        step(`${tbl}.${col} accepts ${valueLen}-character value`, !!back && Number(back.l) === valueLen);
      }

      // Session validation JOIN, copied from validateSession in server.js
      // (grep -n "FROM \`sessions\` s" server.js).
      const empId = `it-emp-${crypto.randomBytes(4).toString('hex')}`;
      const tokenHash = crypto.randomBytes(16).toString('hex');
      await db.query(
        'INSERT INTO `portal_users` (id, name, username, password, role) VALUES (?, ?, ?, ?, ?)',
        [empId, 'IT User', `it_${crypto.randomBytes(4).toString('hex')}`, 'x', 'EMPLOYEE']
      );
      await db.query(
        'INSERT INTO `sessions` (id, employee_id, session_token_hash, status, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
        [`it-sess-${crypto.randomBytes(4).toString('hex')}`, empId, tokenHash, 'ACTIVE']
      );
      const [joined] = await db.query(
        `SELECT s.*, p.name, p.username, p.email, p.role, COALESCE(p.status, 'ACTIVE') as employee_status
         FROM \`sessions\` s
         JOIN \`portal_users\` p ON s.employee_id = p.id
         WHERE s.session_token_hash = ? AND s.status = 'ACTIVE' AND s.expires_at > NOW()`,
        [tokenHash]
      );
      step('session validation JOIN returns exactly one row', joined.length === 1, `${joined.length} row(s)`);
    } finally {
      await db.end().catch(() => {});
    }
  } catch (e) {
    exitCode = 1;
    if (!/^step failed:/.test(e.message)) console.error(`FAIL  unexpected error: ${e.code || ''} ${e.message}`);
  } finally {
    if (admin && created && dbName.startsWith(THROWAWAY_PREFIX)) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS ${qid(dbName)}`);
        console.log(`dropped throwaway database ${dbName}`);
      } catch (e) {
        exitCode = 1;
        console.error(`FAIL  could not drop ${dbName}: ${e.message}`);
      }
    }
    if (admin) await admin.end().catch(() => {});
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${exitCode === 0 ? 'PASSED' : 'FAILED'}: ${passed} passed, ${failed} failed`);
  return exitCode;
}

// Only run when executed directly, so tests can import the helpers without side effects.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().then((code) => process.exit(code), (e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
}
