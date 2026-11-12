import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encrypt, decrypt } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 1: Cipher round trip
// **Validates: Requirements 7.1, 7.2, 7.3**

// 1 to 256 code points: ASCII, BMP non-ASCII (no surrogates) and astral.
const plaintextArb = fc
  .array(
    fc.oneof(
      fc.integer({ min: 0x20, max: 0x7e }),
      fc.integer({ min: 0xa0, max: 0xd7ff }),
      fc.integer({ min: 0x10000, max: 0x10ffff })
    ),
    { minLength: 1, maxLength: 256 }
  )
  .map((cps) => String.fromCodePoint(...cps));

const keyArb = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((u) => Buffer.from(u));

describe('Property 1: Cipher round trip', () => {
  it('decrypt(encrypt(p, k), k) === p, with enc:v1: prefix and exact payload size', () => {
    fc.assert(
      fc.property(plaintextArb, keyArb, (plaintext, key) => {
        const stored = encrypt(plaintext, key);
        expect(stored.startsWith('enc:v1:')).toBe(true);
        const payload = Buffer.from(stored.slice('enc:v1:'.length), 'base64url');
        expect(payload.length).toBe(12 + 16 + Buffer.byteLength(plaintext, 'utf8'));
        expect(decrypt(stored, key)).toBe(plaintext);
      }),
      { numRuns: 200 }
    );
  });
});
