// Feature: production-hardening, Property 35: Agent key lookup never crosses servers
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { findServerForKeyCheck, generateAgentKey, hashAgentKey, verifyAgentKey } from '../lib/agentAuth.js';

const hostArb = fc.constantFrom('10.0.0.1', '10.0.0.2', '192.168.1.5');
const portArb = fc.constantFrom('3389', '3390', '3391');
const nameArb = fc.constantFrom('alpha', 'beta', 'srv-1', '10.0.0.1');

// Servers with unique ids; ipPorts may repeat hosts (and even full ipPorts); names may equal other ids.
const serversArb = fc
  .array(fc.record({ host: hostArb, port: portArb, name: nameArb }), { minLength: 1, maxLength: 8 })
  .map((rows) =>
    rows.map((r, i) => {
      const key = generateAgentKey();
      return { id: `srv-${i}`, name: r.name === 'srv-1' ? `srv-${(i + 1) % rows.length}` : r.name, ipPort: `${r.host}:${r.port}`, apiKey: hashAgentKey(key), _key: key };
    }),
  );

const hostOf = (s) => s.ipPort.split(':')[0];

describe('Property 35: Agent key lookup never crosses servers', () => {
  /**
   * **Validates: Requirements 1.1, 1.4**
   */
  it('returns a server only on exact id / exact ipPort / unambiguous bare IP, and only that server key verifies', () => {
    fc.assert(
      fc.property(serversArb, fc.nat(), fc.constantFrom('id', 'ipPort', 'bareIp', 'name', 'random'), fc.string({ maxLength: 20 }), (servers, idx, kind, rnd) => {
        const base = servers[idx % servers.length];
        const ref = { id: base.id, ipPort: base.ipPort, bareIp: hostOf(base), name: base.name, random: rnd }[kind];
        const found = findServerForKeyCheck(servers, ref);

        if (found) {
          const exactId = ref.trim() === found.id;
          const exactIpPort = ref.trim() === found.ipPort;
          const bareUnique = !ref.includes(':') && hostOf(found) === ref.trim() && servers.filter((s) => hostOf(s) === ref.trim()).length === 1;
          expect(exactId || exactIpPort || bareUnique).toBe(true);

          // Key verification accepts only the key generated for the found server.
          for (const s of servers) {
            expect(verifyAgentKey(s._key, found.apiKey)).toBe(s.id === found.id);
          }
        }

        // Bare IP shared by more than one server is "not found" (unless it equals some server id).
        if (kind === 'bareIp' && servers.filter((s) => hostOf(s) === ref).length > 1 && !servers.some((s) => s.id === ref)) {
          expect(found).toBeNull();
        }
        // Exact id always resolves to that server (ids are unique).
        if (kind === 'id') expect(found?.id).toBe(base.id);
        // A name that is neither an id nor an IP reference never matches.
        if (kind === 'name' && !servers.some((s) => s.id === ref || hostOf(s) === ref || s.ipPort === ref)) {
          expect(found).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });
});
