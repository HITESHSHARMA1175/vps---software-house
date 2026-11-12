// Feature: production-hardening, Property 41: Backup codes are stored hashed, legacy plaintext codes work once
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import bcryptjs from 'bcryptjs';
import {
  hashBackupCodes,
  consumeBackupCode,
  normalizeBackupCode,
  BACKUP_CODE_BCRYPT_COST,
} from '../lib/totpSecrets.js';

// Fast injected bcrypt: same hash format, cost 4 instead of 10, so 100+ runs stay quick.
const fastBcrypt = {
  hashSync: (data) => bcryptjs.hashSync(data, 4),
  compareSync: (data, hash) => bcryptjs.compareSync(data, hash),
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const code = fc.array(fc.constantFrom(...ALNUM), { minLength: 8, maxLength: 10 }).map((a) => a.join(''));
const codeList = fc.uniqueArray(code, { minLength: 1, maxLength: 5 });

describe('Property 41: Backup codes are stored hashed, legacy plaintext codes work once', () => {
  /** **Validates: Requirements 7.14** */
  it('hashed list never contains a plaintext code, and each code is accepted exactly once', () => {
    fc.assert(
      fc.property(codeList, (codes) => {
        const hashed = hashBackupCodes(codes, fastBcrypt);
        expect(hashed).toHaveLength(codes.length);
        for (const h of hashed) {
          expect(h.startsWith('$2')).toBe(true);
          for (const c of codes) expect(h.includes(c)).toBe(false);
        }
        let list = hashed;
        for (const c of codes) {
          const r = consumeBackupCode(list, c, fastBcrypt);
          expect(r.matched).toBe(true);
          expect(r.remaining).toHaveLength(list.length - 1);
          const again = consumeBackupCode(r.remaining, c, fastBcrypt);
          expect(again.matched).toBe(false);
          list = r.remaining;
        }
        expect(list).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.14** */
  it('wrong codes never match and leave the list unchanged', () => {
    fc.assert(
      fc.property(codeList, code, (codes, other) => {
        fc.pre(!codes.includes(other));
        const hashed = hashBackupCodes(codes, fastBcrypt);
        const r = consumeBackupCode(hashed, other, fastBcrypt);
        expect(r.matched).toBe(false);
        expect(r.remaining).toEqual(hashed);
        expect(consumeBackupCode(hashed, '', fastBcrypt).matched).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.14** */
  it('legacy plaintext entries (array or JSON string) are accepted once, removed, and normalized', () => {
    fc.assert(
      fc.property(codeList, fc.boolean(), fc.nat(), (codes, asJson, pick) => {
        const target = codes[pick % codes.length];
        const stored = asJson ? JSON.stringify(codes) : codes;
        const submitted = target.slice(0, 4).toLowerCase() + '-' + target.slice(4);
        const r = consumeBackupCode(stored, submitted, fastBcrypt);
        expect(r.matched).toBe(true);
        expect(r.remaining).toEqual(codes.filter((c) => c !== target));
        expect(consumeBackupCode(r.remaining, submitted, fastBcrypt).matched).toBe(false);
        // input not mutated
        if (!asJson) expect(stored).toEqual(codes);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.14** */
  it('mixed hashed + legacy lists consume each entry once', () => {
    fc.assert(
      fc.property(codeList, codeList, (a, b) => {
        fc.pre(a.every((c) => !b.includes(c)));
        const mixed = [...hashBackupCodes(a, fastBcrypt), ...b];
        let list = mixed;
        for (const c of [...a, ...b]) {
          const r = consumeBackupCode(list, c, fastBcrypt);
          expect(r.matched).toBe(true);
          list = r.remaining;
        }
        expect(list).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.14** Real bcrypt at production cost, few cases. */
  it('production bcrypt cost 10 round trip', () => {
    expect(BACKUP_CODE_BCRYPT_COST).toBe(10);
    fc.assert(
      fc.property(code, (c) => {
        const [h] = hashBackupCodes([c]);
        expect(h.startsWith('$2')).toBe(true);
        expect(h).not.toContain(c);
        expect(consumeBackupCode([h], c).matched).toBe(true);
        expect(consumeBackupCode([h], normalizeBackupCode(c) + 'X').matched).toBe(false);
      }),
      { numRuns: 5 },
    );
  });
});
