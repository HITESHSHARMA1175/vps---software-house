import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encrypt } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 2: Encryption never repeats a nonce
// **Validates: Requirements 7.1, 7.4**

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

const nonceOf = (stored) =>
  Buffer.from(stored.slice('enc:v1:'.length), 'base64url').subarray(0, 12).toString('hex');

describe('Property 2: Encryption never repeats a nonce', () => {
  it('same plaintext encrypted twice yields different ciphertexts', () => {
    fc.assert(
      fc.property(plaintextArb, keyArb, (plaintext, key) => {
        expect(encrypt(plaintext, key)).not.toBe(encrypt(plaintext, key));
      }),
      { numRuns: 200 }
    );
  });

  it('nonces are distinct across a batch of encryptions', () => {
    fc.assert(
      fc.property(plaintextArb, keyArb, fc.integer({ min: 2, max: 50 }), (plaintext, key, n) => {
        const nonces = new Set();
        for (let i = 0; i < n; i++) nonces.add(nonceOf(encrypt(plaintext, key)));
        expect(nonces.size).toBe(n);
      }),
      { numRuns: 200 }
    );
  });
});
