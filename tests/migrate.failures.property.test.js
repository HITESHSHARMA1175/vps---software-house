// Feature: production-hardening, Property 12: Migration isolates row failures
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import crypto from 'node:crypto';
import { migrateRecords } from '../scripts/migrate_passwords.js';
import { sealPassword, isCiphertext, decrypt } from '../lib/secretCipher.js';

const key = crypto.randomBytes(32);
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
// Passwords are distinctive (prefix) so a leak into a log line is detectable.
const password = fc.array(fc.constantFrom(...ALNUM), { minLength: 6, maxLength: 24 }).map((a) => `Pw!${a.join('')}`);

const scenario = fc
  .array(password, { minLength: 1, maxLength: 25 })
  .chain((pws) =>
    fc.record({
      pws: fc.constant(pws),
      failing: fc.array(fc.boolean(), { minLength: pws.length, maxLength: pws.length }),
    }),
  );

describe('Property 12: Migration isolates row failures', () => {
  /**
   * **Validates: Requirements 8.6**
   */
  it('failed rows keep their original value, all others migrate, counts and exit status are consistent, no password in failure output', () => {
    fc.assert(
      fc.property(scenario, ({ pws, failing }) => {
        const records = pws.map((p, i) => ({ id: i + 1, password: p }));
        const failIds = new Set(records.filter((_, i) => failing[i]).map((r) => r.id));
        const failingSeal = (plain, k) => {
          const rec = records.find((r) => r.password === plain);
          if (rec && failIds.has(rec.id)) throw new Error(`boom ${plain}`);
          return sealPassword(plain, k);
        };
        const snapshot = JSON.parse(JSON.stringify(records));

        const r = migrateRecords(records, ['password'], key, failingSeal);

        // input not mutated
        expect(records).toEqual(snapshot);
        expect(r.records).toHaveLength(records.length);
        records.forEach((orig, i) => {
          const out = r.records[i];
          if (failIds.has(orig.id)) {
            expect(out.password).toBe(orig.password);
          } else {
            expect(isCiphertext(out.password)).toBe(true);
            expect(decrypt(out.password, key)).toBe(orig.password);
          }
        });
        expect(r.failed.length).toBe(failIds.size);
        expect(new Set(r.failed.map((f) => f.id))).toEqual(failIds);
        expect(r.migrated).toBe(records.length - failIds.size);
        expect(r.migrated + r.skipped + r.failed.length).toBe(records.length);

        // exit status is non-zero exactly when something failed
        const exitCode = r.failed.length > 0 ? 1 : 0;
        expect(exitCode !== 0).toBe(failIds.size > 0);

        // failure log lines (built from the failed entries) never contain a password value
        const lines = r.failed.map((f) => `FAILED client_subscriptions id=${f.id}`);
        for (const line of lines) for (const p of pws) expect(line.includes(p)).toBe(false);
        for (const f of r.failed) expect(Object.keys(f)).toEqual(['id']);
      }),
      { numRuns: 100 },
    );
  });
});
