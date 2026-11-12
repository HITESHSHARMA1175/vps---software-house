// Feature: production-hardening, Property 42: Server runtime attributes survive a store and load round trip
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { META_KEYS, pickMeta, applyMeta } from '../lib/serverMeta.js';

const serverArb = fc
  .record(Object.fromEntries(META_KEYS.map((k) => [k, fc.jsonValue()])))
  .map((s) => ({ id: 'srv-1', name: 'Server', ...s }));

// JSON normalisation (e.g. -0 becomes 0) is what the store actually does.
const norm = (v) => JSON.parse(JSON.stringify(v));

describe('Property 42: Server runtime attributes survive a store and load round trip', () => {
  /**
   * **Validates: Requirements 10.4**
   */
  it('applyMeta({}, JSON.stringify(pickMeta(server))) restores every listed field deep-equal', () => {
    fc.assert(
      fc.property(serverArb, (server) => {
        const restored = applyMeta({}, JSON.stringify(pickMeta(server)));
        for (const key of META_KEYS) {
          expect(restored[key]).toEqual(norm(server[key]));
        }
        expect(Object.keys(restored).sort()).toEqual([...META_KEYS].sort());
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 10.4**
   */
  it('invalid meta JSON leaves the server unchanged and does not throw', () => {
    const invalidArb = fc.oneof(
      fc.string().filter((s) => {
        try {
          const p = JSON.parse(s);
          return p !== null && typeof p === 'object' && !Array.isArray(p) ? false : true;
        } catch {
          return true;
        }
      }),
      fc.constantFrom(null, undefined, 42, true, '', '{', '[1,2]', 'null'),
    );
    fc.assert(
      fc.property(serverArb, invalidArb, (server, bad) => {
        const before = norm(server);
        const copy = { ...server };
        expect(() => applyMeta(copy, bad)).not.toThrow();
        expect(norm(copy)).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});
