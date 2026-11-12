import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseTrustedProxies } from '../lib/clientIp.js';

const RUNS = { numRuns: 100 };

const ws = fc.array(fc.constantFrom(' ', '\t'), { maxLength: 3 }).map((a) => a.join(''));
const v4 = fc.ipV4();
// Exclude IPv4-mapped forms (they normalize to IPv4 and change the valid prefix range)
const v6 = fc.ipV6().filter((s) => !s.includes('.'));

const v4ToInt = (s) => s.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
const intToV4 = (n) => [24, 16, 8, 0].map((sh) => Math.floor(n / 2 ** sh) % 256).join('.');

// An IPv4 CIDR entry plus an address guaranteed to lie inside it
const v4Cidr = fc
  .tuple(v4, fc.integer({ min: 0, max: 32 }), fc.nat(0xffffffff))
  .map(([ip, prefix, rnd]) => {
    const hostBits = 32 - prefix;
    const size = 2 ** hostBits;
    const network = Math.floor(v4ToInt(ip) / size) * size;
    const inside = network + (rnd % size);
    return { entry: `${ip}/${prefix}`, inside: intToV4(inside) };
  });

const v6Cidr = fc.tuple(v6, fc.integer({ min: 0, max: 128 })).map(([ip, p]) => ({ entry: `${ip}/${p}`, base: ip, prefix: p }));

const validEntry = fc.oneof(
  v4.map((ip) => ({ entry: ip, listed: [ip] })),
  v6.map((ip) => ({ entry: ip, listed: [ip] })),
  v4Cidr.map((c) => ({ entry: c.entry, listed: [c.inside] })),
  v6Cidr.map((c) => ({ entry: c.entry, listed: c.prefix === 128 ? [c.base] : [] })),
);

const invalidEntry = fc.constantFrom(
  'notanip',
  '999.1.1.1',
  '1.2.3.4/33',
  '1.2.3.4/',
  '1.2.3.4/8/8',
  '::1/129',
  'abc/8',
  '1.2.3/24',
  '10.0.0.0/-1',
);

describe('clientIp parseTrustedProxies', () => {
  // Feature: production-hardening, Property 13: Trusted proxy list parsing
  // **Validates: Requirements 3.1, 3.8**
  it('accepts up to 50 valid entries with whitespace and empty segments; check matches listed and in-range addresses', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validEntry, ws, ws), { maxLength: 50 }),
        fc.array(fc.tuple(fc.nat(60), ws), { maxLength: 5 }),
        (items, empties) => {
          const list = items.map(([e, a, b]) => `${a}${e.entry}${b}`);
          for (const [pos, w] of empties) list.splice(pos % (list.length + 1), 0, w);
          const parsed = parseTrustedProxies(list);
          for (const [e] of items) {
            for (const addr of e.listed) expect(parsed.check(addr)).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });

  it('accepts a comma-style list passed as an array including only empties', () => {
    expect(parseTrustedProxies(['', '  ', '\t']).check('1.2.3.4')).toBe(false);
  });

  it('fails and names the invalid entry when any entry is invalid', () => {
    fc.assert(
      fc.property(
        fc.array(validEntry, { maxLength: 20 }),
        invalidEntry,
        ws,
        fc.nat(25),
        (valid, bad, pad, pos) => {
          const list = valid.map((v) => v.entry);
          list.splice(pos % (list.length + 1), 0, `${pad}${bad}${pad}`);
          expect(() => parseTrustedProxies(list)).toThrow(bad);
        },
      ),
      RUNS,
    );
  });

  it('fails and names the limit when more than 50 entries are given', () => {
    fc.assert(
      fc.property(fc.array(v4, { minLength: 51, maxLength: 80 }), (ips) => {
        expect(() => parseTrustedProxies(ips)).toThrow(/50/);
      }),
      RUNS,
    );
  });
});
