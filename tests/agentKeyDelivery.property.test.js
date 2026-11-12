// Feature: production-hardening, Property 37: An agent-key job reaches only the registered IP and leaves no key behind
// **Validates: Requirements 4.2, 4.4, 9.1, 9.2, 9.3**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizeIp } from '../lib/clientIp.js';
import {
  buildSetAgentKeyJob,
  isJobDeliverable,
  scrubJobSecrets,
  stripAgentKey,
} from '../lib/agentKeyDelivery.js';

const ipv4 = fc.tuple(...Array(4).fill(fc.integer({ min: 0, max: 255 }))).map((p) => p.join('.'));
const port = fc.integer({ min: 1, max: 65535 });
const keyArb = fc.stringMatching(/^[A-Za-z0-9]{24,64}$/);

describe('Property 37: agent-key job delivery and scrubbing', () => {
  it('delivers a key job only to the registered IP (and over https in production)', () => {
    fc.assert(
      fc.property(
        ipv4, ipv4, port, keyArb, fc.boolean(), fc.boolean(), fc.boolean(),
        (serverIp, otherIp, p, key, withPort, secure, isProduction) => {
          const job = buildSetAgentKeyJob({ serverId: 's1', agentKey: key });
          const server = { ipPort: withPort ? `${serverIp}:${p}` : serverIp };
          const base = { job, server, secure, isProduction };

          const matching = isJobDeliverable({ ...base, clientIp: serverIp });
          expect(matching).toBe(!isProduction || secure === true);

          const sameIpMapped = isJobDeliverable({ ...base, clientIp: `::ffff:${serverIp}` });
          expect(sameIpMapped).toBe(matching);

          const other = isJobDeliverable({ ...base, clientIp: otherIp });
          expect(other).toBe(normalizeIp(otherIp) === normalizeIp(serverIp) ? matching : false);

          // Jobs without a key are always deliverable
          expect(
            isJobDeliverable({ ...base, job: stripAgentKey(job), clientIp: otherIp }),
          ).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is not deliverable without a requester IP or registered IP', () => {
    fc.assert(
      fc.property(ipv4, keyArb, fc.constantFrom(null, undefined, '', 'garbage'), (ip, key, bad) => {
        const job = buildSetAgentKeyJob({ serverId: 's1', agentKey: key });
        expect(isJobDeliverable({ job, server: { ipPort: ip }, clientIp: bad, secure: true, isProduction: false })).toBe(false);
        expect(isJobDeliverable({ job, server: { ipPort: bad }, clientIp: ip, secure: true, isProduction: false })).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('scrubJobSecrets leaves no key text, is idempotent, and keeps other fields', () => {
    fc.assert(
      fc.property(keyArb, fc.string({ minLength: 8 }), fc.string({ minLength: 8 }), (key, pw, npw) => {
        const job = { ...buildSetAgentKeyJob({ serverId: 's1', agentKey: key }), password: pw, newPassword: npw };
        const { agentKey, password, newPassword, ...others } = job;
        const once = JSON.parse(JSON.stringify(scrubJobSecrets(job)));
        const twice = JSON.parse(JSON.stringify(scrubJobSecrets(scrubJobSecrets(job))));

        expect(JSON.stringify(job)).not.toContain(key);
        expect(once.agentKey).toBe('');
        expect(once.password).toBe('');
        expect(once.newPassword).toBe('');
        expect(twice).toEqual(once);
        expect(once).toMatchObject(JSON.parse(JSON.stringify(others)));
      }),
      { numRuns: 200 },
    );
  });

  it('stripAgentKey output serializes without the key and does not mutate the input', () => {
    fc.assert(
      fc.property(keyArb, (key) => {
        const job = buildSetAgentKeyJob({ serverId: 's1', agentKey: key });
        const stripped = stripAgentKey(job);
        expect(JSON.stringify(stripped)).not.toContain(key);
        expect('agentKey' in stripped).toBe(false);
        expect(job.agentKey).toBe(key);
      }),
      { numRuns: 100 },
    );
  });
});
