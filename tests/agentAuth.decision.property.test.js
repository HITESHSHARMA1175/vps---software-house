// Feature: production-hardening, Property 16: Agent authentication decision table
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decideAgentAuth, generateAgentKey, hashAgentKey } from '../lib/agentAuth.js';

const REAL_KEY = generateAgentKey();
const REAL_HASH = hashAgentKey(REAL_KEY);

// Reference model: the decision table from the design document.
function model({ mode, serverFound, hashState, keyState }) {
  const hasHash = hashState === 'valid';
  const hasKey = keyState !== 'missing' && keyState !== 'empty';
  const match = serverFound && hasHash && keyState === 'matching';
  if (match) return 'ACCEPT';
  if (mode === 'enforce') return 'REJECT';
  // warn
  if (serverFound && hasHash && hasKey) return 'REJECT'; // mismatch against existing hash (4.4)
  return 'ACCEPT_WARN'; // missing key, no hash, or unknown server (4.2)
}

const storedHashFor = (state) =>
  ({ valid: REAL_HASH, empty: '', unreadable: undefined })[state];

const submittedKeyFor = (state, other) =>
  ({ matching: REAL_KEY, mismatching: other, missing: undefined, empty: '' })[state];

describe('Property 16: Agent authentication decision table', () => {
  /**
   * **Validates: Requirements 1.1, 1.3, 1.11, 4.2, 4.4, 4.5**
   */
  it('returns the action given by the decision table for every input combination', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('warn', 'enforce'),
        fc.boolean(),
        fc.constantFrom('valid', 'empty', 'unreadable'),
        fc.constantFrom('matching', 'mismatching', 'missing', 'empty'),
        fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s !== REAL_KEY),
        (mode, serverFound, hashState, keyState, otherKey) => {
          const result = decideAgentAuth({
            mode,
            serverFound,
            storedHash: storedHashFor(hashState),
            submittedKey: submittedKeyFor(keyState, otherKey),
          });
          const expected = model({ mode, serverFound, hashState, keyState });
          expect(result.action).toBe(expected);
          // keyValid is true exactly when the key was accepted as a match
          expect(result.keyValid).toBe(expected === 'ACCEPT');
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.3, 1.11, 4.2, 4.4, 4.5**
   */
  it('in enforce mode only a found server with a stored hash and matching key is accepted', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom('valid', 'empty', 'unreadable'),
        fc.constantFrom('matching', 'mismatching', 'missing', 'empty'),
        fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s !== REAL_KEY),
        (serverFound, hashState, keyState, otherKey) => {
          const { action } = decideAgentAuth({
            mode: 'enforce',
            serverFound,
            storedHash: storedHashFor(hashState),
            submittedKey: submittedKeyFor(keyState, otherKey),
          });
          const shouldAccept = serverFound && hashState === 'valid' && keyState === 'matching';
          expect(action === 'ACCEPT').toBe(shouldAccept);
          expect(action === 'ACCEPT_WARN').toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
