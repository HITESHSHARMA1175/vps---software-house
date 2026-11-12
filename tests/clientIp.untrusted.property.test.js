// Feature: production-hardening, Property 14: Untrusted peers cannot spoof the client IP
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deriveClientIp, normalizeIp, parseTrustedProxies } from '../lib/clientIp.js';

const trusted = parseTrustedProxies(['10.0.0.0/8', '192.168.1.5', '127.0.0.1', '::1', 'fd00::/8']);

const ipv4 = fc.tuple(...Array(4).fill(fc.integer({ min: 0, max: 255 }))).map((p) => p.join('.'));
const ipv6 = fc
  .array(fc.integer({ min: 0, max: 0xffff }), { minLength: 8, maxLength: 8 })
  .map((g) => g.map((x) => x.toString(16)).join(':'));
const anyIp = fc.oneof(ipv4, ipv6);

// Socket addresses outside the trusted set, optionally in ::ffff: mapped form
const untrustedSocket = fc
  .tuple(anyIp, fc.boolean())
  .map(([ip, mapped]) => (mapped && ip.includes('.') ? `::ffff:${ip}` : ip))
  .filter((s) => normalizeIp(s) !== null && !trusted.check(s));

const headerVal = fc.oneof(
  fc.string(),
  fc.array(anyIp, { maxLength: 5 }).map((a) => a.join(', ')),
);
const headersArb = fc.record(
  {
    'x-forwarded-for': headerVal,
    'cf-connecting-ip': headerVal,
    'x-real-ip': headerVal,
  },
  { requiredKeys: [] },
);

describe('Property 14: Untrusted peers cannot spoof the client IP', () => {
  /**
   * **Validates: Requirements 3.2, 3.6**
   */
  it('returns the normalized socket address regardless of forwarding headers', () => {
    fc.assert(
      fc.property(untrustedSocket, headersArb, (socketAddress, headers) => {
        expect(deriveClientIp({ socketAddress, headers, trusted })).toBe(normalizeIp(socketAddress));
      }),
      { numRuns: 200 },
    );
  });
});
