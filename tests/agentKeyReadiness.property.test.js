// Feature: production-hardening, Property 38: readyForEnforce is true only when every non-deleted server has a hash and a valid request in the last 10 minutes
// **Validates: Requirements 4.2, 4.4, 4.7**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateReadiness } from '../lib/agentKeyReadiness.js';

const WINDOW = 10 * 60 * 1000;

// Age of the last valid request relative to `now`, biased toward the 10-minute boundary.
const ageArb = fc.oneof(
  fc.constantFrom(0, WINDOW - 1, WINDOW, WINDOW + 1),
  fc.integer({ min: -60000, max: 3 * WINDOW })
);

const statusArb = fc.option(
  fc.record({ valid: fc.boolean(), age: ageArb }),
  { nil: undefined }
);

const serverArb = (i) =>
  fc.record({
    hasHash: fc.boolean(),
    status: statusArb,
    deleteBy: fc.constantFrom('none', 'id', 'ipPort', 'name'),
    upper: fc.boolean(),
  }).map((r) => ({ ...r, i }));

const scenarioArb = fc.record({
  now: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
  specs: fc.integer({ min: 0, max: 6 }).chain((n) =>
    fc.tuple(...Array.from({ length: n }, (_, i) => serverArb(i)))
  ),
  extraTokens: fc.array(fc.stringMatching(/^[a-z0-9.:-]{1,12}$/), { maxLength: 3 }),
  asDate: fc.boolean(),
});

describe('Property 38: readyForEnforce matches a simple model', () => {
  it('is true exactly when every non-deleted server has a hash and a valid request within 10 minutes', () => {
    fc.assert(
      fc.property(scenarioArb, ({ now, specs, extraTokens, asDate }) => {
        const servers = [];
        const keyStatus = new Map();
        const deletedTokens = [...extraTokens.map((t) => `x-${t}`)];
        const deletedIds = new Set();

        for (const s of specs) {
          const server = {
            id: `srv-${s.i}`,
            name: `name-${s.i}`,
            ipPort: `10.0.0.${s.i}:3000`,
            apiKey: s.hasHash ? 'hash-value' : '',
          };
          servers.push(server);
          if (s.status) {
            keyStatus.set(server.id, {
              valid: s.status.valid,
              at: asDate ? new Date(now - s.status.age) : now - s.status.age,
            });
          }
          if (s.deleteBy !== 'none') {
            const tok = server[s.deleteBy];
            deletedTokens.push(s.upper ? tok.toUpperCase() : tok);
            deletedIds.add(server.id);
          }
        }

        // Simple model
        const expected = specs.every((s) => {
          if (deletedIds.has(`srv-${s.i}`)) return true;
          return (
            s.hasHash &&
            !!s.status &&
            s.status.valid === true &&
            s.status.age <= WINDOW
          );
        });

        const result = evaluateReadiness({
          servers,
          deletedTokens,
          keyStatus,
          now: asDate ? new Date(now) : now,
        });

        expect(result.readyForEnforce).toBe(expected);
        expect(result.servers.map((r) => r.serverId)).toEqual(
          servers.filter((sv) => !deletedIds.has(sv.id)).map((sv) => sv.id)
        );
      }),
      { numRuns: 200 }
    );
  });

  it('is true for an empty server set', () => {
    expect(evaluateReadiness({ servers: [], keyStatus: new Map(), now: Date.now() }).readyForEnforce).toBe(true);
  });

  it('accepts exactly 10 minutes and rejects 10 minutes plus 1 ms', () => {
    const now = 1_700_000_000_000;
    const servers = [{ id: 'a', apiKey: 'h' }];
    const at = (age) => new Map([['a', { valid: true, at: now - age }]]);
    expect(evaluateReadiness({ servers, keyStatus: at(WINDOW), now }).readyForEnforce).toBe(true);
    expect(evaluateReadiness({ servers, keyStatus: at(WINDOW + 1), now }).readyForEnforce).toBe(false);
  });

  it('is not ready when the last valid request used the previous key (Requirement 26.11)', () => {
    const now = 1_700_000_000_000;
    const servers = [{ id: 'a', apiKey: 'h' }];
    const st = (keyUsed) => new Map([['a', { valid: true, keyUsed, at: now }]]);
    const prev = evaluateReadiness({ servers, keyStatus: st('previous'), now });
    expect(prev.readyForEnforce).toBe(false);
    expect(prev.servers[0].keyUsed).toBe('previous');
    expect(evaluateReadiness({ servers, keyStatus: st('current'), now }).readyForEnforce).toBe(true);
  });
});
