import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyRateLimit } from '../lib/rateLimit.js';

// Feature: production-hardening, Property 33: Rate limiter blocks everything past the limit
// **Validates: Requirements 17.2, 17.3, 17.4, 17.5**

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

// Fixed-window in-memory limiter with a controllable clock.
function makeLimiter(clock) {
  const buckets = new Map();
  return async (type, key, max, windowMs) => {
    const k = `${type}:${key}`;
    let b = buckets.get(k);
    if (!b || clock.now >= b.resetAt) {
      b = { count: 0, resetAt: clock.now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, (b.resetAt - clock.now) / 1000) };
    }
    return { allowed: true };
  };
}

describe('Property 33: Rate limiter blocks everything past the limit', () => {
  it('allows the first N requests, 429s the rest, and resets after the window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1000, max: 60 * 60 * 1000 }),
        fc.integer({ min: 0, max: 40 }),
        async (n, windowMs, m) => {
          const clock = { now: 1_000_000 };
          const deps = { checkRateLimit: makeLimiter(clock), isProduction: true, logger: { error() {} } };
          for (let i = 0; i < m; i++) {
            const res = makeRes();
            const ok = await applyRateLimit(res, 'login', 'k', n, windowMs, deps);
            if (i < n) {
              expect(ok).toBe(true);
              expect(res.statusCode).toBe(200);
            } else {
              expect(ok).toBe(false);
              expect(res.statusCode).toBe(429);
              expect(res.body.success).toBe(false);
              expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
            }
          }
          // Window elapses: counter resets.
          clock.now += windowMs;
          const res = makeRes();
          expect(await applyRateLimit(res, 'login', 'k', n, windowMs, deps)).toBe(true);
          expect(res.statusCode).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('on limiter error returns 429 in production, allows outside, logging once', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.string(), async (isProduction, msg) => {
        const logs = [];
        const deps = {
          checkRateLimit: async () => { throw new Error(msg); },
          isProduction,
          logger: { error: (...a) => logs.push(a) },
        };
        const res = makeRes();
        const ok = await applyRateLimit(res, 't', 'k', 5, 1000, deps);
        expect(logs).toHaveLength(1);
        if (isProduction) {
          expect(ok).toBe(false);
          expect(res.statusCode).toBe(429);
          expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
        } else {
          expect(ok).toBe(true);
          expect(res.statusCode).toBe(200);
        }
      }),
      { numRuns: 100 }
    );
  });
});
