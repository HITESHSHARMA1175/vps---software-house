import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { buildPortalUrl, isOriginAllowed, loadConfig } from '../lib/config.js';

// Feature: production-hardening, Property 23: Portal URLs and CORS use only configuration
// **Validates: Requirements 13.3, 13.4, 13.5**

const KEY = 'a'.repeat(64);
const label = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);
const hostArb = fc
  .tuple(label, label, fc.constantFrom('com', 'io', 'net'))
  .map(([a, b, tld]) => `${a}.${b}.${tld}`);
const originArb = fc
  .tuple(fc.constantFrom('http', 'https'), hostArb)
  .map(([s, h]) => `${s}://${h}`);
const pathArb = fc
  .array(label, { maxLength: 4 })
  .map((segs) => segs.join('/'));
const slashesArb = fc.integer({ min: 0, max: 4 }).map((n) => '/'.repeat(n));

describe('Property 23: Portal URLs and CORS use only configuration', () => {
  it('built URLs start with the configured base and end with the path, ignoring Host headers', () => {
    fc.assert(
      fc.property(
        originArb,
        slashesArb,
        slashesArb,
        pathArb,
        hostArb, // request Host header (must have no influence)
        hostArb, // x-forwarded-host header (must have no influence)
        (origin, trailing, leading, p, hostHeader, xfh) => {
          const config = loadConfig({
            NODE_ENV: 'development',
            PORTAL_BASE_URL: origin + trailing,
            PASSWORD_ENCRYPTION_KEY: KEY,
          });
          const req = { headers: { host: hostHeader, 'x-forwarded-host': xfh } };
          void req; // buildPortalUrl takes only config and path
          const url = buildPortalUrl(config, leading + p);
          expect(url.startsWith(origin)).toBe(true);
          expect(url.endsWith(p)).toBe(true);
          expect(url).toBe(p === '' ? origin : `${origin}/${p}`);
          if (!origin.includes(hostHeader)) expect(url.startsWith(`${origin}/`) || url === origin).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CORS allows an origin iff it is the base origin or a listed entry', () => {
    fc.assert(
      fc.property(
        originArb,
        fc.array(originArb, { maxLength: 5 }),
        originArb,
        (base, list, probe) => {
          const config = loadConfig({
            NODE_ENV: 'development',
            PORTAL_BASE_URL: base,
            CORS_ALLOWED_ORIGINS: list.join(' , '),
            PASSWORD_ENCRYPTION_KEY: KEY,
          });
          const expected = probe === base || list.includes(probe);
          expect(isOriginAllowed(config, probe)).toBe(expected);
          expect(isOriginAllowed(config, base)).toBe(true);
          for (const o of list) expect(isOriginAllowed(config, o)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('server.js contains no hardcoded portal hostname URL literals', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    expect(src).not.toMatch(/https?:\/\/[^\s'"`]*innovationwebworks/i);
    expect(src).not.toMatch(/https?:\/\/vps\./i);
  });
});
