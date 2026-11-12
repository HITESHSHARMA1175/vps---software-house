// Feature: production-hardening, Property 26: Disabled internal secret never authenticates
// **Validates: Requirements 6.7**
// With INTERNAL_SECRET unset or empty, any x-internal-secret header value is rejected with 401.
// Each scenario re-imports server.js with its own environment (vi.resetModules).
import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import fc from 'fast-check';

const SAVED = { ...process.env };
const PROTECTED = '/api/employees';
const ENABLED_SECRET = 'test-internal-secret-not-for-production';

async function freshApp(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const { getApp } = await import('./helpers/app.js');
  return getApp();
}

afterAll(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

// Printable ASCII without surrounding whitespace, so it is a legal header value as-is.
const headerValueArb = fc.oneof(
  fc.stringMatching(/^[\x21-\x7e]([\x20-\x7e]{0,38}[\x21-\x7e])?$/),
  fc.constantFrom('undefined', 'null', 'false', '0', 'changeme', 'secret', 'internal', 'admin', 'test-internal-secret-not-for-production'),
);

describe('Property 26: Disabled internal secret never authenticates', () => {
  it('control: with a secret configured, the matching header authenticates', async () => {
    const app = await freshApp({ INTERNAL_SECRET: ENABLED_SECRET });
    const ok = await request(app).get(PROTECTED).set('x-internal-secret', ENABLED_SECRET);
    expect(ok.status).toBe(200);
    const bad = await request(app).get(PROTECTED).set('x-internal-secret', ENABLED_SECRET + 'x');
    expect(bad.status).toBe(401);
  });

  for (const [label, value] of [['empty', ''], ['unset', undefined]]) {
    it(`INTERNAL_SECRET ${label}: no header value authenticates`, async () => {
      const app = await freshApp({ INTERNAL_SECRET: value });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await fc.assert(
          fc.asyncProperty(headerValueArb, async (v) => {
            const res = await request(app).get(PROTECTED).set('x-internal-secret', v);
            expect(res.status).toBe(401);
            expect(res.body?.username).toBeUndefined();
          }),
          { numRuns: 100 },
        );
        // Empty header value and no header behave the same.
        expect((await request(app).get(PROTECTED).set('x-internal-secret', '')).status).toBe(401);
        expect((await request(app).get(PROTECTED)).status).toBe(401);
      } finally {
        warn.mockRestore();
      }
    });
  }
});
