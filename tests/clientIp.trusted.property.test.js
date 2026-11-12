import { describe, it } from 'vitest';
import fc from 'fast-check';
import { deriveClientIp, parseTrustedProxies } from '../lib/clientIp.js';

// Small address pool so generated chains frequently collide with the trusted set.
const poolIp = fc.integer({ min: 1, max: 12 }).map((n) => `203.0.113.${n}`);
const invalidEntry = fc.constantFrom('garbage', '', '999.1.1.1', 'unknown', '1.2.3', '_hidden');

// A chain entry: a valid address (optionally with a port) or an invalid token.
const chainEntry = fc.oneof(
  { arbitrary: fc.record({ ip: poolIp, port: fc.boolean() }).map(({ ip, port }) => ({
    valid: true, ip, text: port ? `${ip}:8080` : ip,
  })), weight: 3 },
  { arbitrary: invalidEntry.map((text) => ({ valid: false, ip: null, text })), weight: 1 },
);

describe('clientIp trusted peers', () => {
  // Feature: production-hardening, Property 15: Trusted peers yield the right-most non-trusted address
  // **Validates: Requirements 3.3, 3.4**
  it('returns the right-most valid non-trusted address, else the socket address', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(poolIp, { maxLength: 12 }),
        fc.array(chainEntry, { maxLength: 10 }),
        fc.constantFrom('10.0.0.1', '10.0.0.2', '::ffff:10.0.0.1'),
        (trustedPool, chain, socketAddress) => {
          const trusted = parseTrustedProxies(['10.0.0.0/8', ...trustedPool]);
          const headers = { 'x-forwarded-for': chain.map((c) => c.text).join(',') };

          let expected = socketAddress.replace('::ffff:', '');
          for (let i = chain.length - 1; i >= 0; i--) {
            if (chain[i].valid && !trustedPool.includes(chain[i].ip)) {
              expected = chain[i].ip;
              break;
            }
          }

          return deriveClientIp({ socketAddress, headers, trusted }) === expected;
        },
      ),
      { numRuns: 200 },
    );
  });
});
