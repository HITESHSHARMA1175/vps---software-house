// Feature: production-hardening, Property 40: TOTP secrets round trip and never appear in public projections
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sealTotpSecret, openTotpSecret } from '../lib/totpSecrets.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('');
const base32Secret = fc.array(fc.constantFrom(...B32), { minLength: 16, maxLength: 64 }).map((a) => a.join(''));

const FORBIDDEN = ['two_factor_secret', 'two_factor_temp_secret', 'two_factor_backup_codes'];

describe('Property 40: TOTP secrets round trip and never appear in public projections', () => {
  /**
   * **Validates: Requirements 7.1, 7.2, 7.14**
   */
  it('sealed secrets open to the original, carry the enc:v1: prefix, and never equal the plaintext', () => {
    fc.assert(
      fc.property(base32Secret, (secret) => {
        const sealed = sealTotpSecret(secret);
        expect(sealed.startsWith('enc:v1:')).toBe(true);
        expect(sealed).not.toBe(secret);
        expect(sealed.includes(secret)).toBe(false);
        expect(openTotpSecret(sealed)).toBe(secret);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.14**
   */
  it('legacy plaintext secrets pass through openTotpSecret unchanged and empty stays empty', () => {
    fc.assert(
      fc.property(base32Secret, (secret) => {
        expect(openTotpSecret(secret)).toBe(secret);
      }),
      { numRuns: 100 },
    );
    expect(sealTotpSecret('')).toBe('');
    expect(openTotpSecret('')).toBe('');
  });

  /**
   * **Validates: Requirements 7.10, 7.14**
   * lib/publicProjections.js now exists (task 17.2), so this test always runs.
   */
  it('toPublicEmployee output never contains TOTP fields', async () => {
    const { toPublicEmployee } = await import('../lib/publicProjections.js');
    await fc.assert(
      fc.asyncProperty(
        base32Secret,
        base32Secret,
        fc.array(fc.string(), { maxLength: 10 }),
        fc.record({ id: fc.integer({ min: 1 }), name: fc.string(), username: fc.string(), role: fc.string() }),
        async (s1, s2, codes, base) => {
          const out = toPublicEmployee({
            ...base,
            two_factor_secret: sealTotpSecret(s1),
            two_factor_temp_secret: sealTotpSecret(s2),
            two_factor_backup_codes: JSON.stringify(codes),
          });
          for (const f of FORBIDDEN) expect(Object.keys(out)).not.toContain(f);
          const json = JSON.stringify(out);
          expect(json.includes(s1)).toBe(false);
          expect(json.includes(s2)).toBe(false);
          expect(json.includes('enc:v1:')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
