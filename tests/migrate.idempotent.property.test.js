// Feature: production-hardening, Property 10: Migration is idempotent
// **Validates: Requirements 8.5, 19.8**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import crypto from 'node:crypto';
import { migrateRecords } from '../scripts/migrate_passwords.js';
import { isCiphertext } from '../lib/secretCipher.js';

const key = crypto.randomBytes(32);
const FIELDS = ['password', 'two_factor_secret'];

const valueArb = fc.oneof(
  fc.string({ maxLength: 30 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant('')
);
const recordArb = fc.record(
  { id: fc.integer({ min: 1, max: 100000 }), password: valueArb, two_factor_secret: valueArb, name: fc.string({ maxLength: 8 }) },
  { requiredKeys: ['id'] }
);
const recordsArb = fc.array(recordArb, { maxLength: 20 });

describe('Property 10: Migration is idempotent', () => {
  it('a second run changes nothing and reports zero migrated', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const first = migrateRecords(records, FIELDS, key);
        const second = migrateRecords(first.records, FIELDS, key);

        expect(first.failed).toEqual([]);
        expect(second.migrated).toBe(0);
        expect(second.failed).toEqual([]);
        expect(second.skipped).toBe(records.length);
        expect(second.records).toEqual(first.records);

        // a third run is still stable, and no value is double-encrypted
        const third = migrateRecords(second.records, FIELDS, key);
        expect(third.records).toEqual(first.records);
        for (const r of second.records) {
          for (const f of FIELDS) {
            if (typeof r[f] === 'string' && r[f] !== '') expect(isCiphertext(r[f])).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
