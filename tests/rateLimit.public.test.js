import { describe, it, expect, vi } from 'vitest';
import { loadConfig, ConfigError, DEFAULT_RATE_LIMITS } from '../lib/config.js';
import { rateLimitKey, applyRateLimit } from '../lib/rateLimit.js';

const baseEnv = { NODE_ENV: 'development' };

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

/** Fake limiter: counts hits per (type, key), allows up to `max`. */
function fakeLimiter() {
  const hits = new Map();
  const calls = [];
  const check = async (type, key, max, windowMs) => {
    calls.push({ type, key, max, windowMs });
    const id = `${type}|${key}`;
    const n = (hits.get(id) ?? 0) + 1;
    hits.set(id, n);
    return n <= max ? { allowed: true } : { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  };
  return { check, calls };
}

describe('public limit table defaults', () => {
  const cfg = loadConfig(baseEnv);

  it('resolves every limit name to its default max and window', () => {
    expect(Object.keys(cfg.rateLimits).sort()).toEqual(Object.keys(DEFAULT_RATE_LIMITS).sort());
    for (const [name, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
      expect(cfg.rateLimits[name]).toEqual({ max: def.max, windowSec: def.windowSec });
    }
  });

  it('matches the documented table values', () => {
    expect(cfg.rateLimits.REQUEST_DEMO).toEqual({ max: 5, windowSec: 3600 });
    expect(cfg.rateLimits.VERIFY_CUSTOMER_IDENTIFIER).toEqual({ max: 3, windowSec: 3600 });
    expect(cfg.rateLimits.OTP_VERIFY).toEqual({ max: 5, windowSec: 900 });
    expect(cfg.rateLimits.AGENT_AUTH_FAIL).toEqual({ max: 30, windowSec: 300 });
  });
});

describe('env overrides', () => {
  it('overrides max and window independently', () => {
    const cfg = loadConfig({
      ...baseEnv,
      RATE_LIMIT_REQUEST_DEMO_MAX: '2',
      RATE_LIMIT_OTP_VERIFY_WINDOW_SEC: '60',
    });
    expect(cfg.rateLimits.REQUEST_DEMO).toEqual({ max: 2, windowSec: 3600 });
    expect(cfg.rateLimits.OTP_VERIFY).toEqual({ max: 5, windowSec: 60 });
    expect(cfg.rateLimits.PUBLIC_TICKETS).toEqual({ max: 10, windowSec: 3600 });
  });

  it('treats empty values as unset', () => {
    const cfg = loadConfig({ ...baseEnv, RATE_LIMIT_REQUEST_DEMO_MAX: '  ' });
    expect(cfg.rateLimits.REQUEST_DEMO.max).toBe(5);
  });

  it.each(['0', '-1', '1.5', 'abc', '1e3'])('rejects invalid value %s naming the variable', (v) => {
    let err;
    try {
      loadConfig({ ...baseEnv, RATE_LIMIT_PUBLIC_TICKETS_MAX: v });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.problems.some((p) => p.includes('RATE_LIMIT_PUBLIC_TICKETS_MAX'))).toBe(true);
  });

  it('reports every invalid rate limit variable at once', () => {
    let err;
    try {
      loadConfig({ ...baseEnv, RATE_LIMIT_REQUEST_DEMO_MAX: '0', RATE_LIMIT_RESET_PASSWORD_WINDOW_SEC: 'x' });
    } catch (e) {
      err = e;
    }
    expect(err.problems).toHaveLength(2);
  });
});

describe('rateLimitKey', () => {
  it('builds per-IP and per-identifier keys', () => {
    expect(rateLimitKey('verify', '1.2.3.4')).toBe('verify:1.2.3.4');
    expect(rateLimitKey('verify', '1.2.3.4', 'Alice')).toBe('verify:1.2.3.4:alice');
  });

  it('normalises identifier case and whitespace', () => {
    expect(rateLimitKey('n', 'ip', '  AbC ')).toBe(rateLimitKey('n', 'ip', 'abc'));
  });

  it('ignores empty identifiers and falls back to unknown ip', () => {
    expect(rateLimitKey('n', 'ip', '')).toBe('n:ip');
    expect(rateLimitKey('n', 'ip', null)).toBe('n:ip');
    expect(rateLimitKey('n', undefined)).toBe('n:unknown');
  });

  it('keeps different ips and identifiers in different buckets', () => {
    expect(rateLimitKey('n', 'a', 'x')).not.toBe(rateLimitKey('n', 'b', 'x'));
    expect(rateLimitKey('n', 'a', 'x')).not.toBe(rateLimitKey('n', 'a', 'y'));
    expect(rateLimitKey('n', 'a')).not.toBe(rateLimitKey('n', 'a', 'x'));
  });
});

describe('applyRateLimit with the configured table', () => {
  it('passes configured max and window (ms) to the limiter for each name', async () => {
    const cfg = loadConfig({ ...baseEnv, RATE_LIMIT_REQUEST_DEMO_MAX: '2' });
    const lim = fakeLimiter();
    for (const [name, { max, windowSec }] of Object.entries(cfg.rateLimits)) {
      const ok = await applyRateLimit(fakeRes(), 'store', rateLimitKey(name, '9.9.9.9'), max, windowSec * 1000, {
        checkRateLimit: lim.check,
      });
      expect(ok).toBe(true);
    }
    const demo = lim.calls.find((c) => c.key.startsWith('REQUEST_DEMO:'));
    expect(demo.max).toBe(2);
    expect(demo.windowMs).toBe(3600 * 1000);
  });

  it('answers 429 with retryAfterSeconds once the limit is exceeded', async () => {
    const { max, windowSec } = loadConfig({ ...baseEnv, RATE_LIMIT_REQUEST_DEMO_MAX: '2' }).rateLimits.REQUEST_DEMO;
    const lim = fakeLimiter();
    const key = rateLimitKey('REQUEST_DEMO', '1.1.1.1');
    const deps = { checkRateLimit: lim.check };
    for (let i = 0; i < max; i++) {
      expect(await applyRateLimit(fakeRes(), 'demo', key, max, windowSec * 1000, deps)).toBe(true);
    }
    const res = fakeRes();
    expect(await applyRateLimit(res, 'demo', key, max, windowSec * 1000, deps)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.retryAfterSeconds).toBe(windowSec);
    expect(typeof res.body.error).toBe('string');
  });

  it('keeps per-IP and per-identifier counters independent', async () => {
    const lim = fakeLimiter();
    const deps = { checkRateLimit: lim.check };
    const ipKey = rateLimitKey('VERIFY_CUSTOMER', '1.1.1.1');
    const idKey = rateLimitKey('VERIFY_CUSTOMER_IDENTIFIER', '1.1.1.1', 'bob|555');
    const ipLimit = DEFAULT_RATE_LIMITS.VERIFY_CUSTOMER;
    const idLimit = DEFAULT_RATE_LIMITS.VERIFY_CUSTOMER_IDENTIFIER;

    for (let i = 0; i < idLimit.max; i++) {
      await applyRateLimit(fakeRes(), 'v', idKey, idLimit.max, idLimit.windowSec * 1000, deps);
    }
    const blocked = fakeRes();
    expect(await applyRateLimit(blocked, 'v', idKey, idLimit.max, idLimit.windowSec * 1000, deps)).toBe(false);
    expect(blocked.statusCode).toBe(429);

    // The IP bucket is untouched; another identifier from the same IP is allowed.
    expect(await applyRateLimit(fakeRes(), 'v', ipKey, ipLimit.max, ipLimit.windowSec * 1000, deps)).toBe(true);
    const otherKey = rateLimitKey('VERIFY_CUSTOMER_IDENTIFIER', '1.1.1.1', 'carol|777');
    expect(await applyRateLimit(fakeRes(), 'v', otherKey, idLimit.max, idLimit.windowSec * 1000, deps)).toBe(true);
  });

  it('does not write to res when the request is allowed', async () => {
    const res = fakeRes();
    res.status = vi.fn(res.status);
    const ok = await applyRateLimit(res, 't', 'k', 1, 1000, { checkRateLimit: async () => ({ allowed: true }) });
    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
