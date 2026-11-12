import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadConfig, ConfigError } from '../lib/config.js';

// Feature: production-hardening, Property 22: Portal base URL normalization
// **Validates: Requirements 13.1, 13.2, 13.6, 13.7**

const KEY = 'a'.repeat(64);
const label = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);
const hostArb = fc
  .tuple(label, label, fc.constantFrom('com', 'io', 'net'))
  .map(([a, b, tld]) => `${a}.${b}.${tld}`);
const pathArb = fc
  .array(label, { maxLength: 3 })
  .map((segs) => (segs.length ? `/${segs.join('/')}` : ''));
const schemeArb = fc.constantFrom('http', 'https');
const slashesArb = fc.integer({ min: 0, max: 5 }).map((n) => '/'.repeat(n));

const prodEnv = (base) => ({
  NODE_ENV: 'production',
  PORTAL_BASE_URL: base,
  PASSWORD_ENCRYPTION_KEY: KEY,
});

function problemsOf(fn) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e.problems.join('\n');
  }
  return null;
}

describe('Property 22: Portal base URL normalization', () => {
  it('strips trailing slashes outside production for both schemes', () => {
    fc.assert(
      fc.property(schemeArb, hostArb, pathArb, slashesArb, (scheme, host, path, slashes) => {
        const bare = `${scheme}://${host}${path}`;
        const cfg = loadConfig({ NODE_ENV: 'development', PORTAL_BASE_URL: bare + slashes });
        expect(cfg.portalBaseUrl).toBe(bare);
      }),
      { numRuns: 100 }
    );
  });

  it('fails naming PORTAL_BASE_URL for non-absolute-http(s) strings', () => {
    const bad = fc.oneof(
      fc.stringMatching(/^[a-z0-9 .]{1,20}$/).filter((s) => s.trim() !== ''),
      hostArb.map((h) => `ftp://${h}`),
      hostArb.map((h) => `//${h}`),
      hostArb.map((h) => `javascript:${h}`)
    );
    fc.assert(
      fc.property(bad, fc.constantFrom('development', 'production'), (value, nodeEnv) => {
        const msg = problemsOf(() =>
          loadConfig({ NODE_ENV: nodeEnv, PORTAL_BASE_URL: value, PASSWORD_ENCRYPTION_KEY: KEY })
        );
        expect(msg).not.toBeNull();
        expect(msg).toContain('PORTAL_BASE_URL');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects http in production naming PORTAL_BASE_URL', () => {
    fc.assert(
      fc.property(hostArb, pathArb, slashesArb, (host, path, slashes) => {
        const msg = problemsOf(() => loadConfig(prodEnv(`http://${host}${path}${slashes}`)));
        expect(msg).not.toBeNull();
        expect(msg).toContain('PORTAL_BASE_URL');
      }),
      { numRuns: 100 }
    );
  });

  it('accepts https in production with the normalized URL', () => {
    fc.assert(
      fc.property(hostArb, pathArb, slashesArb, (host, path, slashes) => {
        const bare = `https://${host}${path}`;
        const cfg = loadConfig(prodEnv(bare + slashes));
        expect(cfg.portalBaseUrl).toBe(bare);
      }),
      { numRuns: 100 }
    );
  });
});
