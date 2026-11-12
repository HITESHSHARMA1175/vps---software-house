// Feature: production-hardening, Property 11: Dry run changes nothing and predicts the real run
// Uses only in-memory fakes: mysql2/promise is mocked and fs access to database.json is intercepted.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const queries = [];
let tableRows = {};

vi.mock('mysql2/promise', () => {
  const conn = {
    query: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      const m = /^SELECT `id`, `(\w+)` AS `\w+` FROM `(\w+)`/.exec(String(sql));
      if (m) return [(tableRows[`${m[2]}.${m[1]}`] || []).map((r) => ({ ...r })), []];
      return [[{ '1': 1 }], []];
    },
    escape: (v) => `'${v}'`,
    end: async () => {},
  };
  const api = { createConnection: async () => conn };
  return { default: api, ...api };
});

const { main, SOURCES, migrateRecords } = await import('../scripts/migrate_passwords.js');
const { parseKey } = await import('../lib/secretCipher.js');

const KEY_B64 = Buffer.alloc(32, 7).toString('base64');
const KEY = parseKey(KEY_B64);
const JSON_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('');
const base32 = fc.array(fc.constantFrom(...B32), { minLength: 16, maxLength: 32 }).map((a) => a.join(''));
const plain = fc.string({ minLength: 1, maxLength: 24 }).filter((s) => !s.startsWith('enc:v1:'));
const sealedLike = base32.map((s) => `enc:v1:${s}`);

function valueFor(src) {
  const isTotp = src.collection === 'portalUsers';
  return fc.oneof(
    { weight: 3, arbitrary: isTotp ? base32 : plain },
    { weight: 1, arbitrary: sealedLike },
    { weight: 1, arbitrary: fc.constantFrom('', null) },
  );
}

const rowsArb = (src) =>
  fc.array(valueFor(src), { maxLength: 6 }).map((vals) => vals.map((v, i) => ({ id: i + 1, [src.column]: v })));

const worldArb = fc.record({
  mysql: fc.tuple(...SOURCES.map(rowsArb)),
  json: fc.tuple(...SOURCES.map(rowsArb)),
});

describe('Property 11: Dry run changes nothing and predicts the real run', () => {
  let writes;
  let logs;
  let realRead;

  beforeEach(() => {
    queries.length = 0;
    writes = [];
    logs = [];
    realRead = fs.readFileSync;
    for (const fn of ['writeFileSync', 'copyFileSync', 'renameSync', 'appendFileSync', 'unlinkSync', 'mkdirSync']) {
      vi.spyOn(fs, fn).mockImplementation((...a) => { writes.push([fn, a[0]]); });
    }
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a) => { logs.push(a.join(' ')); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 8.2**
   */
  it('--dry-run issues only reads, writes/backs up no file, prints predicted counts, exits 0', async () => {
    await fc.assert(
      fc.asyncProperty(worldArb, async (world) => {
        queries.length = 0;
        writes.length = 0;
        logs.length = 0;

        // Build the fake database.json (one collection per source) and the fake MySQL tables.
        const db = {};
        SOURCES.forEach((src, i) => {
          const rows = world.json[i].map((r) => ({ id: r.id, [src.field]: r[src.column] }));
          // portalUsers is shared by two sources: merge the fields onto the same records
          if (db[src.collection]) {
            rows.forEach((r, k) => { db[src.collection][k] = { ...(db[src.collection][k] || { id: r.id }), ...r }; });
          } else {
            db[src.collection] = rows;
          }
        });
        tableRows = {};
        SOURCES.forEach((src, i) => { tableRows[`${src.table}.${src.column}`] = world.mysql[i]; });
        const snapshotRows = JSON.stringify(tableRows);
        const dbText = JSON.stringify(db);

        const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
          if (path.resolve(String(p)) === JSON_PATH) return dbText;
          return realRead.call(fs, p, ...rest);
        });

        const code = await main(['--dry-run'], { PASSWORD_ENCRYPTION_KEY: KEY_B64, DB_HOST: 'fake' });
        spy.mockRestore();

        // Exit 0 (no row can fail with valid generated input)
        expect(code).toBe(0);
        // No file created, copied, renamed, or written (no backup, no database.json rewrite)
        expect(writes).toEqual([]);
        // No MySQL write or DDL: only SELECT statements
        for (const q of queries) expect(/^\s*SELECT\b/i.test(q.sql)).toBe(true);
        // The fake MySQL rows and database.json text are untouched
        expect(JSON.stringify(tableRows)).toBe(snapshotRows);
        expect(JSON.stringify(db)).toBe(dbText);

        // Printed counts equal what a real run would migrate / skip
        const out = logs.join('\n');
        for (const [i, src] of SOURCES.entries()) {
          const m = migrateRecords(world.mysql[i], [src.column], KEY, src.seal);
          const j = migrateRecords(db[src.collection], [src.field], KEY, src.seal);
          const mLine = `${src.table}.${src.column}`.padEnd(34) + ` migrated=${m.migrated} skipped=${m.skipped} failed=0`;
          const jLine = `${src.collection}[].${src.field}`.padEnd(34) + ` migrated=${j.migrated} skipped=${j.skipped} failed=0`;
          expect(out).toContain(mLine);
          expect(out).toContain(jLine);
        }
      }),
      { numRuns: 100 },
    );
  });
});
