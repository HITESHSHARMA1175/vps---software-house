import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseKey, CipherError } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 5: Key parsing accepts exactly 32 bytes
// **Validates: Requirements 7.6**

// Byte arrays of 0..70 bytes, biased so length 32 is common.
const bytesArb = fc.oneof(
  fc.uint8Array({ minLength: 32, maxLength: 32 }),
  fc.uint8Array({ minLength: 0, maxLength: 70 })
);
const encodingArb = fc.constantFrom('hex', 'base64');

describe('Property 5: Key parsing accepts exactly 32 bytes', () => {
  it('returns a 32-byte key iff the array has 32 bytes; otherwise throws without echoing the input', () => {
    fc.assert(
      fc.property(bytesArb, encodingArb, (bytes, enc) => {
        const buf = Buffer.from(bytes);
        const encoded = buf.toString(enc);
        if (buf.length === 32) {
          const key = parseKey(encoded);
          expect(Buffer.isBuffer(key)).toBe(true);
          expect(key.length).toBe(32);
          expect(key.equals(buf)).toBe(true);
        } else {
          let err;
          try {
            parseKey(encoded);
          } catch (e) {
            err = e;
          }
          expect(err).toBeInstanceOf(CipherError);
          // Very short encodings could collide with fixed message words by chance.
          if (encoded.length >= 8) expect(err.message).not.toContain(encoded);
        }
      }),
      { numRuns: 200 }
    );
  });
});
