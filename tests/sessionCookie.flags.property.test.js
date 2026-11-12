import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sessionCookieOptions, sessionClearOptions } from '../lib/sessionCookie.js';

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Fake res capturing cookie()/clearCookie() arguments. */
function fakeRes() {
  const res = { set: null, cleared: null };
  res.cookie = (name, value, opts) => { res.set = { name, value, opts }; return res; };
  res.clearCookie = (name, opts) => { res.cleared = { name, opts }; return res; };
  return res;
}

const reqArb = fc.record({
  secure: fc.boolean(),
  headers: fc.record({ 'x-forwarded-proto': fc.constantFrom(undefined, 'https', 'http') })
});
const cfgArb = fc.record({ isProduction: fc.boolean() });

describe('session cookie flags', () => {
  it('HttpOnly, SameSite=lax, path, maxAge always; Secure only from isProduction or req.secure', () => {
    fc.assert(fc.property(cfgArb, reqArb, (config, req) => {
      const res = fakeRes();
      res.cookie('vps_session_id', 'x', sessionCookieOptions({ config, req, maxAgeMs: SESSION_MAX_AGE_MS }));
      const o = res.set.opts;
      expect(o.httpOnly).toBe(true);
      expect(o.sameSite).toBe('lax');
      expect(o.path).toBe('/');
      expect(o.maxAge).toBe(SESSION_MAX_AGE_MS);
      // x-forwarded-proto is ignored entirely
      expect(o.secure).toBe(config.isProduction || req.secure);
    }), { numRuns: 100 });
  });

  it('a spoofed x-forwarded-proto over plain http outside production is not Secure', () => {
    const req = { secure: false, headers: { 'x-forwarded-proto': 'https' } };
    expect(sessionCookieOptions({ config: { isProduction: false }, req, maxAgeMs: 1 }).secure).toBe(false);
  });

  it('clearing options equal setting options minus maxAge (logout and beacon-logout)', () => {
    fc.assert(fc.property(cfgArb, reqArb, (config, req) => {
      const setOpts = sessionCookieOptions({ config, req, maxAgeMs: SESSION_MAX_AGE_MS });
      const { maxAge, ...expected } = setOpts;
      for (const route of ['logout', 'beacon-logout']) {
        const res = fakeRes();
        res.clearCookie('vps_session_id', sessionClearOptions({ config, req }));
        expect(res.cleared.opts, route).toEqual(expected);
        expect('maxAge' in res.cleared.opts).toBe(false);
      }
    }), { numRuns: 100 });
  });
});
