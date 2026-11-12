import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generatePassword } from '../lib/passwords.js';

// Feature: production-hardening, Property 24: Generated passwords meet the policy
// **Validates: Requirements 6.3**

describe('Property 24: Generated passwords meet the policy', () => {
  it('has exact length, upper, lower, digit, and successive calls differ', () => {
    fc.assert(
      fc.property(fc.integer({ min: 16, max: 64 }), (length) => {
        const a = generatePassword(length);
        const b = generatePassword(length);
        expect(typeof a).toBe('string');
        expect(a).toHaveLength(length);
        expect(a).toMatch(/[A-Z]/);
        expect(a).toMatch(/[a-z]/);
        expect(a).toMatch(/[0-9]/);
        expect(a).not.toBe(b);
      }),
      { numRuns: 100 }
    );
  });
});
