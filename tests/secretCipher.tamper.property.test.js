import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encrypt, decrypt, CipherError } from '../lib/secretCipher.js';

// Feature: production-hardening, Property 3: Tampered ciphertext is rejected
// **Validates: Requirements 7.5**

const plaintextArb = fc.string({ minLength: 1, maxLength: 128 });
const keyArb = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((u) => Buffer.from(u));

// Only characters after the `enc:` marker are mutated (Open Issue 5).
const MARKER_LEN = 'enc:'.length;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_:!';

function expectRejected(stored, key) {
  let result;
  let threw = false;
  try {
    result = decrypt(stored, key);
  } catch (e) {
    threw = true;
    expect(e).toBeInstanceOf(CipherError);
  }
  expect(threw).toBe(true);
  expect(result).toBeUndefined();
}

describe('Property 3: Tampered ciphertext is rejected', () => {
  it('rejects a single changed character after the enc: marker', () => {
    fc.assert(
      fc.property(
        plaintextArb,
        keyArb,
        fc.nat(),
        fc.integer({ min: 0, max: ALPHABET.length - 1 }),
        (plaintext, key, posSeed, chSeed) => {
          const stored = encrypt(plaintext, key);
          const span = stored.length - MARKER_LEN;
          const pos = MARKER_LEN + (posSeed % span);
          let ch = ALPHABET[chSeed];
          if (ch === stored[pos]) ch = ALPHABET[(chSeed + 1) % ALPHABET.length];
          const tampered = stored.slice(0, pos) + ch + stored.slice(pos + 1);
          fc.pre(tampered !== stored);
          expectRejected(tampered, key);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects truncated ciphertext', () => {
    fc.assert(
      fc.property(plaintextArb, keyArb, fc.nat(), (plaintext, key, cut) => {
        const stored = encrypt(plaintext, key);
        const newLen = MARKER_LEN + (cut % (stored.length - MARKER_LEN));
        expectRejected(stored.slice(0, newLen), key);
      }),
      { numRuns: 200 }
    );
  });

  it('rejects appended data', () => {
    fc.assert(
      fc.property(
        plaintextArb,
        keyArb,
        fc.string({ minLength: 1, maxLength: 16 }),
        (plaintext, key, extra) => {
          expectRejected(encrypt(plaintext, key) + extra, key);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects decryption with a different key', () => {
    fc.assert(
      fc.property(plaintextArb, keyArb, keyArb, (plaintext, key, other) => {
        fc.pre(!key.equals(other));
        expectRejected(encrypt(plaintext, key), other);
      }),
      { numRuns: 200 }
    );
  });
});
