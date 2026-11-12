import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { migrateRecords } from '../scripts/migrate_passwords.js';
import { encrypt, decrypt, isCiphertext } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 9: Migration encrypts every plaintext value and reports consistent counts
// **Validates: Requirements 8.1, 8.5, 8.7**

const FIELDS = ['password', 'two_factor_secret'];
const key = Buffer.alloc(32, 7);

const plainArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !s.startsWith('enc:v1:'));
const valueArb = fc.oneof(
  plainArb,
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined),
  plainArb.map((p) => encrypt(p, key))
);
const recordsArb = fc
  .array(fc.record({ password: valueArb, two_factor_secret: valueArb, other: fc.string({ maxLength: 10 }) }), { maxLength: 25 })
  .map((rs) => rs.map((r, i) => ({ id: i + 1, ...r })));

const isPlain = (v) => typeof v === 'string' && v !== '' && !isCiphertext(v);

describe('Property 9: Migration encrypts every plaintext value and reports consistent counts', () => {
  it('encrypts every plaintext field, leaves others unchanged, and migrated + skipped + failed equals the input count', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const snapshot = JSON.parse(JSON.stringify(records));
        const r = migrateRecords(records, FIELDS, key);

        expect(JSON.parse(JSON.stringify(records))).toEqual(snapshot); // input not mutated
        expect(r.failed).toEqual([]);
        expect(r.records.length).toBe(records.length);
        expect(r.migrated + r.skipped + r.failed.length).toBe(records.length);

        let expectedMigrated = 0;
        records.forEach((rec, i) => {
          const out = r.records[i];
          let changed = false;
          for (const f of FIELDS) {
            if (isPlain(rec[f])) {
              changed = true;
              expect(isCiphertext(out[f])).toBe(true);
              expect(decrypt(out[f], key)).toBe(rec[f]);
            } else {
              expect(out[f]).toBe(rec[f]);
            }
          }
          expect(out.other).toBe(rec.other);
          if (changed) expectedMigrated++;
        });
        expect(r.migrated).toBe(expectedMigrated);
      }),
      { numRuns: 200 }
    );
  });

  it('counts stay consistent when some rows fail to encrypt; failed rows are unchanged', () => {
    fc.assert(
      fc.property(recordsArb, fc.integer({ min: 0, max: 3 }), (records, mod) => {
        // Deterministic failure injection: values whose length % 4 === mod throw.
        const seal = (plain, k) => {
          if (plain.length % 4 === mod) throw new Error('boom');
          return encrypt(plain, k);
        };
        const r = migrateRecords(records, FIELDS, key, seal);

        expect(r.records.length).toBe(records.length);
        expect(r.migrated + r.skipped + r.failed.length).toBe(records.length);

        const failedIds = new Set(r.failed.map((f) => f.id));
        records.forEach((rec, i) => {
          const hasFailing = FIELDS.some((f) => isPlain(rec[f]) && rec[f].length % 4 === mod);
          expect(failedIds.has(rec.id)).toBe(hasFailing);
          if (hasFailing) expect(r.records[i]).toEqual(rec);
        });
      }),
      { numRuns: 200 }
    );
  });
});
