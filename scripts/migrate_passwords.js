#!/usr/bin/env node
// One-time Migration_Script: encrypts legacy plaintext passwords and TOTP seeds
// in MySQL and in database.json.
//
//   node scripts/migrate_passwords.js --dry-run          counts only, no writes, no backup
//   node scripts/migrate_passwords.js --confirm-backup   real run (after backups are verified)
//
// Safe to run repeatedly: values that already carry the `enc:v1:` prefix are skipped.
// Neither passwords nor ciphertext are ever printed; failures log table and id only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as mysqlModule from 'mysql2/promise';
import { parseKey, sealPassword, isCiphertext } from '../lib/secretCipher.js';
import { sealTotpSecret } from '../lib/totpSecrets.js';
import { buildMysqlSsl } from '../lib/dbSsl.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'database.json');
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const PASSWORD_WIDTH = 2048;
const TOTP_WIDTH = 512;

/**
 * Migration sources. `table`/`column` are the MySQL location, `collection`/`field`
 * the matching location in database.json.
 */
export const SOURCES = [
  { label: 'client passwords', table: 'client_subscriptions', column: 'password', collection: 'users', field: 'password', width: PASSWORD_WIDTH, seal: sealPassword },
  { label: 'server passwords', table: 'vps_servers', column: 'superClientPass', collection: 'servers', field: 'superClientPass', width: PASSWORD_WIDTH, seal: sealPassword },
  { label: 'job passwords', table: 'vps_provision_jobs', column: 'password', collection: 'provisionJobs', field: 'password', width: PASSWORD_WIDTH, seal: sealPassword },
  { label: 'TOTP secrets', table: 'portal_users', column: 'two_factor_secret', collection: 'portalUsers', field: 'two_factor_secret', width: TOTP_WIDTH, seal: sealTotpSecret },
  { label: 'TOTP temp secrets', table: 'portal_users', column: 'two_factor_temp_secret', collection: 'portalUsers', field: 'two_factor_temp_secret', width: TOTP_WIDTH, seal: sealTotpSecret },
];

const isPlain = (v) => typeof v === 'string' && v !== '' && !isCiphertext(v);

/**
 * Pure core. Encrypts every plaintext value in `fields` of each record.
 * A record whose sealing throws is returned unchanged and reported in `failed` ({ id } only).
 * Input is not mutated. migrated + skipped + failed.length === records.length.
 */
export function migrateRecords(records, fields, key, seal = sealPassword) {
  const out = [];
  const failed = [];
  let migrated = 0;
  let skipped = 0;
  for (const rec of records) {
    const next = { ...rec };
    let changed = false;
    let bad = false;
    for (const f of fields) {
      if (!isPlain(rec[f])) continue;
      try {
        next[f] = seal(rec[f], key);
        changed = true;
      } catch {
        bad = true;
        break;
      }
    }
    if (bad) {
      failed.push({ id: rec.id });
      out.push(rec);
    } else if (changed) {
      migrated++;
      out.push(next);
    } else {
      skipped++;
      out.push(rec);
    }
  }
  return { records: out, migrated, skipped, failed };
}

const formatLine = (name, r) => `${name.padEnd(34)} migrated=${r.migrated} skipped=${r.skipped} failed=${r.failed.length}`;
const mysqlName = (s) => `${s.table}.${s.column}`;
const jsonName = (s) => `${s.collection}[].${s.field}`;

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function connectionConfig(env) {
  const pick = (a, b, d) => env[a] ?? env[b] ?? d;
  const ssl = buildMysqlSsl(env);
  const rawTimeout = String(env.DB_CONNECT_TIMEOUT_MS ?? '').trim();
  const timeout = rawTimeout === '' ? DEFAULT_CONNECT_TIMEOUT_MS : Number(rawTimeout);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    throw new Error('DB_CONNECT_TIMEOUT_MS must be an integer between 1000 and 120000');
  }
  return {
    host: pick('DB_HOST', 'MYSQL_HOST', 'localhost'),
    port: Number(pick('DB_PORT', 'MYSQL_PORT', 3306)),
    user: pick('DB_USER', 'MYSQL_USER', 'root'),
    password: pick('DB_PASSWORD', 'MYSQL_PASSWORD', ''),
    database: pick('DB_NAME', 'MYSQL_DATABASE', undefined) ?? env.MYSQL_DB,
    connectTimeout: timeout,
    ...(ssl ? { ssl } : {}),
  };
}

// Repeat-safe widening; keeps nullability and default (same logic as initMySQLDatabase).
async function widenColumn(conn, s) {
  const [cols] = await conn.query(
    'SELECT CHARACTER_MAXIMUM_LENGTH AS len, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [s.table, s.column]
  );
  if (!cols || !cols.length || Number(cols[0].len) >= s.width) return;
  const notNull = String(cols[0].nullable).toUpperCase() === 'NO';
  const def = cols[0].def === null || cols[0].def === undefined
    ? (notNull ? '' : ' DEFAULT NULL')
    : ` DEFAULT ${conn.escape(String(cols[0].def))}`;
  await conn.query(`ALTER TABLE \`${s.table}\` MODIFY COLUMN \`${s.column}\` VARCHAR(${s.width})${notNull ? ' NOT NULL' : ''}${def}`);
}

export async function main(argv = [], env = process.env) {
  const args = new Set(argv);
  const dryRun = args.has('--dry-run');
  const confirmed = args.has('--confirm-backup');

  if (!dryRun && !confirmed) {
    console.error('Refusing to run: this changes stored data. Back up MySQL (scripts/backup_mysql.sh) and database.json first, then re-run with --confirm-backup (or use --dry-run).');
    return 1;
  }

  let key;
  try {
    key = parseKey(env.PASSWORD_ENCRYPTION_KEY);
  } catch (e) {
    console.error(`PASSWORD_ENCRYPTION_KEY problem: ${e.message}`);
    return 1;
  }

  let conn = null;
  try {
    // Read database.json (no changes yet)
    let db;
    try {
      db = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
      if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('not an object');
    } catch {
      console.error('database.json is unavailable or unreadable; no changes made.');
      return 1;
    }

    // Connect to MySQL (30 second timeout)
    try {
      const create = mysqlModule.createConnection || mysqlModule.default.createConnection;
      conn = await create(connectionConfig(env));
    } catch (e) {
      console.error(`MySQL is unavailable (${e && e.code ? e.code : 'connect error'}); no changes made.`);
      return 1;
    }

    // Real run: backup first, verify, then widen columns
    if (!dryRun) {
      const backupPath = `${JSON_PATH}.bak-${timestamp()}`;
      try {
        fs.copyFileSync(JSON_PATH, backupPath);
        if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size !== fs.statSync(JSON_PATH).size) {
          throw new Error('size mismatch');
        }
      } catch {
        console.error('database.json backup could not be verified; no changes made.');
        return 1;
      }
      console.log(`database.json backed up to ${path.basename(backupPath)}`);
      for (const s of SOURCES) {
        try {
          await widenColumn(conn, s);
        } catch (e) {
          console.error(`Could not widen ${mysqlName(s)} (${e && e.code ? e.code : 'error'}); no data changed.`);
          return 1;
        }
      }
    }

    let anyFailed = false;
    const report = [];

    // ---- MySQL
    for (const s of SOURCES) {
      let rows;
      try {
        [rows] = await conn.query(`SELECT \`id\`, \`${s.column}\` AS \`${s.column}\` FROM \`${s.table}\``);
      } catch (e) {
        console.error(`Could not read ${s.table} (${e && e.code ? e.code : 'error'})`);
        anyFailed = true;
        report.push(`${mysqlName(s).padEnd(34)} migrated=0 skipped=0 failed=0`);
        continue;
      }
      const records = (rows || []).map((r) => ({ id: r.id, [s.column]: r[s.column] }));
      const res = migrateRecords(records, [s.column], key, s.seal);
      if (!dryRun) {
        for (let i = 0; i < records.length; i++) {
          if (res.records[i][s.column] === records[i][s.column]) continue;
          try {
            await conn.query(`UPDATE \`${s.table}\` SET \`${s.column}\` = ? WHERE \`id\` = ?`, [res.records[i][s.column], records[i].id]);
          } catch {
            res.migrated--;
            res.failed.push({ id: records[i].id });
          }
        }
      }
      for (const f of res.failed) console.error(`FAILED ${s.table} id=${f.id}`);
      if (res.failed.length) anyFailed = true;
      report.push(formatLine(mysqlName(s), res));
    }

    // ---- database.json: sources sharing a collection are applied cumulatively
    const working = {};
    let jsonChanged = false;
    for (const s of SOURCES) {
      if (!(s.collection in working)) working[s.collection] = Array.isArray(db[s.collection]) ? db[s.collection] : [];
      const res = migrateRecords(working[s.collection], [s.field], key, s.seal);
      working[s.collection] = res.records;
      if (res.migrated > 0) jsonChanged = true;
      for (const f of res.failed) console.error(`FAILED ${s.collection} id=${f.id}`);
      if (res.failed.length) anyFailed = true;
      report.push(formatLine(jsonName(s), res));
    }
    if (!dryRun && jsonChanged) {
      const next = { ...db };
      for (const [c, recs] of Object.entries(working)) if (Array.isArray(db[c])) next[c] = recs;
      const tmp = `${JSON_PATH}.tmp-${process.pid}`;
      try {
        fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
        fs.renameSync(tmp, JSON_PATH);
      } catch (e) {
        console.error(`FAILED to write database.json (${e && e.code ? e.code : 'error'})`);
        anyFailed = true;
      }
    }

    console.log(dryRun ? 'Dry run (nothing was written):' : 'Migration counts:');
    for (const line of report) console.log(line);
    return anyFailed ? 1 : 0;
  } finally {
    if (conn && typeof conn.end === 'function') {
      try { await conn.end(); } catch { /* ignore */ }
    }
  }
}

// CLI entry: importing this module must not run main().
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  (async () => {
    try {
      await import('dotenv/config');
    } catch { /* dotenv optional */ }
    process.exitCode = await main(process.argv.slice(2), process.env);
  })().catch((e) => {
    console.error(`Migration aborted: ${e && e.code ? e.code : 'unexpected error'}`);
    process.exitCode = 1;
  });
}
