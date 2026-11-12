// Feature: production-hardening, Property 20: Warning throttle
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createWarnThrottle } from '../lib/agentAuth.js';

const WINDOW = 10 * 60 * 1000;

// Events are applied in non-decreasing time order, as a real clock would produce.
const eventsArb = fc
  .array(
    fc.record({
      serverId: fc.constantFrom('s1', 's2', 's3', '10.0.0.1:5000'),
      delta: fc.oneof(
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: WINDOW - 2, max: WINDOW + 2 }),
        fc.integer({ min: 0, max: 3 * WINDOW }),
      ),
    }),
    { minLength: 1, maxLength: 60 },
  )
  .map((items) => {
    let t = 1_700_000_000_000;
    return items.map(({ serverId, delta }) => {
      t += delta;
      return { serverId, t };
    });
  });

describe('Property 20: Warning throttle', () => {
  /**
   * **Validates: Requirements 4.3**
   */
  it('warns only when no warning for that serverId in the preceding 10 minutes; first event always warns; emitted warnings are >=10 min apart', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        let clock = 0;
        const shouldLog = createWarnThrottle(WINDOW, () => clock);
        const emitted = new Map();
        for (const { serverId, t } of events) {
          clock = t;
          const result = shouldLog(serverId);
          const prior = emitted.get(serverId) || [];
          const last = prior.length ? prior[prior.length - 1] : undefined;
          const expected = last === undefined || t - last >= WINDOW;
          expect(result).toBe(expected);
          if (last === undefined) expect(result).toBe(true);
          if (result) {
            prior.push(t);
            emitted.set(serverId, prior);
          }
        }
        for (const times of emitted.values()) {
          for (let i = 1; i < times.length; i++) {
            expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(WINDOW);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
