import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sealPassword, openPassword } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 4: Legacy plaintext passes through and re-seals
// **Validates: Requirements 7.14, 9.1**

const keyArb = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((u) => Buffer.from(u));

// Any string (including unicode) that does not start with the `enc:` marker.
const legacyArb = fc.string({ unit: 'binary', maxLength: 200 }).filter((s) => !s.startsWith('enc:'));

describe('Property 4: Legacy plaintext passes through and re-seals', () => {
  it('openPassword returns legacy plaintext unchanged', () => {
    fc.assert(
      fc.property(legacyArb, keyArb, (s, key) => {
        expect(openPassword(s, key)).toBe(s);
      }),
      { numRuns: 200 }
    );
  });

  it('open(seal(open(s))) equals s for legacy values', () => {
    fc.assert(
      fc.property(legacyArb, keyArb, (s, key) => {
        const sealed = sealPassword(openPassword(s, key), key);
        if (s !== '') expect(sealed.startsWith('enc:v1:')).toBe(true);
        expect(openPassword(sealed, key)).toBe(s);
      }),
      { numRuns: 200 }
    );
  });

  it('the empty string stays empty through seal and open', () => {
    fc.assert(
      fc.property(keyArb, (key) => {
        expect(sealPassword('', key)).toBe('');
        expect(openPassword('', key)).toBe('');
      }),
      { numRuns: 100 }
    );
  });
});
