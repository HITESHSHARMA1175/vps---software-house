// Feature: production-hardening, Property 18: Agent key generation and verification
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateAgentKey, hashAgentKey, verifyAgentKey, KEY_PREFIX } from '../lib/agentAuth.js';

describe('Property 18: Agent key generation and verification', () => {
  /**
   * **Validates: Requirements 1.2, 1.6, 1.7**
   */
  it('generated keys have >=32 bytes entropy, are unique in a batch, hash to 64 hex chars, and verify', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (n) => {
        const keys = Array.from({ length: n }, () => generateAgentKey());
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of keys) {
          expect(key.startsWith(KEY_PREFIX)).toBe(true);
          expect(Buffer.from(key.slice(KEY_PREFIX.length), 'base64url').length).toBeGreaterThanOrEqual(32);
          const hash = hashAgentKey(key);
          expect(hash).toMatch(/^[0-9a-f]{64}$/);
          expect(hash).not.toBe(key);
          expect(verifyAgentKey(key, hash)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.2, 1.6, 1.7**
   */
  it('verifyAgentKey is false for any other string', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (other) => {
        const key = generateAgentKey();
        fc.pre(other !== key);
        expect(verifyAgentKey(other, hashAgentKey(key))).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
