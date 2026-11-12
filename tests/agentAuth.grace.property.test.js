// Feature: production-hardening, Property 43: The rotation grace window accepts the previous key only until its expiry
// **Validates: Requirements 2.10, 2.11, 2.13, 2.14, 2.16**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  decideAgentAuth,
  findServerByKeyHash,
  generateAgentKey,
  hashAgentKey,
  matchAgentKey,
  rotateAgentKey,
} from '../lib/agentAuth.js';

const MIN = 60000;

function makeStore(server) {
  return {
    findServer: async () => server,
    setAgentKeyRecord: async (_id, record) => {
      server.apiKey = record.apiKey;
      server.previousApiKey = record.previousApiKey || '';
      server.previousKeyExpiresAt = record.previousKeyExpiresAt ?? null;
    },
  };
}

const validGrace = fc.oneof(fc.constant(0), fc.constant(1), fc.constant(1440), fc.integer({ min: 0, max: 1440 }));
const invalidGrace = fc.oneof(
  fc.integer({ min: -100000, max: -1 }),
  fc.integer({ min: 1441, max: 100000 }),
  fc.double({ min: 0.01, max: 1439.99, noNaN: true }).filter((n) => !Number.isInteger(n)),
  fc.constantFrom(NaN, Infinity, -Infinity, '5', null, true, {}, []),
);

// One rotation step: either valid (with grace) or invalid, followed by time passing.
const stepArb = fc.oneof(
  { weight: 4, arbitrary: fc.record({ grace: validGrace, invalid: fc.constant(false), dt: fc.integer({ min: 0, max: 3 * 3600 * 1000 }) }) },
  { weight: 1, arbitrary: fc.record({ grace: invalidGrace, invalid: fc.constant(true), dt: fc.integer({ min: 0, max: 3 * 3600 * 1000 }) }) },
);

describe('Property 43: The rotation grace window accepts the previous key only until its expiry', () => {
  it('matches a simple model for current/previous/older keys, invalid graceMinutes and the exact boundary', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 }),
        fc.array(stepArb, { minLength: 1, maxLength: 5 }),
        fc.array(fc.integer({ min: 0, max: 2 * 1440 * MIN }), { maxLength: 4 }),
        async (start, steps, extraOffsets) => {
          const key0 = generateAgentKey();
          const server = { id: 'p43', apiKey: hashAgentKey(key0), previousApiKey: '', previousKeyExpiresAt: null };
          const store = makeStore(server);
          const issued = [key0];
          // model state
          let current = key0;
          let previous = null;
          let expiry = null;
          let t = start;

          for (const step of steps) {
            const snapshot = { ...server };
            if (step.invalid) {
              let err;
              try {
                await rotateAgentKey({ store, serverId: 'p43', graceMinutes: step.grace, now: () => t });
              } catch (e) {
                err = e;
              }
              expect(err?.statusCode).toBe(400);
              expect(server).toEqual(snapshot); // stores nothing, changes no accepted key
            } else {
              const { agentKey } = await rotateAgentKey({ store, serverId: 'p43', graceMinutes: step.grace, now: () => t });
              issued.push(agentKey);
              if (step.grace > 0) {
                previous = current;
                expiry = t + step.grace * MIN;
              } else {
                previous = null;
                expiry = null;
              }
              current = agentKey;
            }

            const probes = [t, t + step.dt, ...extraOffsets.map((o) => t + o)];
            if (expiry !== null) probes.push(expiry - 1, expiry, expiry + 1);
            for (const now of probes) {
              for (const key of issued) {
                let expected = null;
                if (key === current) expected = 'current';
                else if (key === previous && expiry !== null && now < expiry) expected = 'previous';

                const m = matchAgentKey({ server, submittedKey: key, now });
                expect(m).toEqual({ valid: expected !== null, keyUsed: expected });

                for (const mode of ['enforce', 'warn']) {
                  const d = decideAgentAuth({
                    mode,
                    serverFound: true,
                    storedHash: server.apiKey,
                    submittedKey: key,
                    previousHash: server.previousApiKey,
                    previousExpiresAt: server.previousKeyExpiresAt,
                    now,
                  });
                  expect(d.action === 'ACCEPT').toBe(expected !== null);
                  expect(d.keyUsed).toBe(expected);
                }

                // detect-server lookup follows the same window
                const found = findServerByKeyHash([server], hashAgentKey(key), now);
                expect(found.length === 1).toBe(expected !== null);
              }
            }
            t += step.dt;
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('rejects the previous key at the exact expiry instant and accepts it one millisecond earlier', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1440 }), fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 }), async (grace, t0) => {
        const oldKey = generateAgentKey();
        const server = { id: 'b', apiKey: hashAgentKey(oldKey) };
        const { agentKey } = await rotateAgentKey({ store: makeStore(server), serverId: 'b', graceMinutes: grace, now: () => t0 });
        const exp = t0 + grace * MIN;
        expect(server.previousKeyExpiresAt).toBe(exp);
        expect(matchAgentKey({ server, submittedKey: oldKey, now: exp - 1 }).keyUsed).toBe('previous');
        expect(matchAgentKey({ server, submittedKey: oldKey, now: exp }).valid).toBe(false);
        expect(matchAgentKey({ server, submittedKey: agentKey, now: exp + 10 * MIN }).keyUsed).toBe('current');
      }),
      { numRuns: 100 },
    );
  });
});
