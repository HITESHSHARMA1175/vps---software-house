// Feature: production-hardening, Property 36: serverToken and X-Server-Token never authenticate
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createAgentAuthMiddleware, generateAgentKey, hashAgentKey, REJECT_BODY } from '../lib/agentAuth.js';

const KEY = generateAgentKey();
const servers = [
  { id: 'srv-1', name: 'one', ipPort: '10.0.0.1:3389', apiKey: hashAgentKey(KEY) },
  { id: 'srv-2', name: 'two', ipPort: '10.0.0.2:3389', apiKey: hashAgentKey(generateAgentKey()) },
  { id: 'srv-3', name: 'three', ipPort: '10.0.0.3:3389', apiKey: '' }, // legacy server with no key
];

// Token values: arbitrary strings, the legacy default, and even the real plaintext key / its hash.
const tokenArb = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.constantFrom('vps_sec_token_default', KEY, hashAgentKey(KEY), ''),
);
const serverRefArb = fc.oneof(
  fc.constantFrom('srv-1', 'srv-2', 'srv-3', '10.0.0.1:3389', '10.0.0.3', 'unknown'),
  fc.string({ maxLength: 30 }),
);

function run(req) {
  const audits = [];
  const mw = createAgentAuthMiddleware({
    getServers: () => servers,
    audit: (e) => audits.push(e),
    config: { agentAuthMode: 'enforce', logger: { warn() {} } },
    keyStatus: new Map(),
  });
  const out = { status: null, body: null, nextCalled: false };
  const res = {
    status(c) {
      out.status = c;
      return this;
    },
    json(b) {
      out.body = b;
      return this;
    },
  };
  return mw(req, res, () => {
    out.nextCalled = true;
  }).then(() => ({ ...out, audits }));
}

describe('Property 36: serverToken and X-Server-Token never authenticate', () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   */
  it('rejects every request with only serverToken / X-Server-Token / X-Server-Id in enforce mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        tokenArb,
        tokenArb,
        serverRefArb,
        serverRefArb,
        fc.boolean(),
        async (bodyToken, queryToken, headerToken, bodyRef, headerRef, useBodyRef) => {
          const req = {
            originalUrl: '/api/agent/telemetry',
            headers: { 'x-server-token': headerToken, 'x-server-id': headerRef },
            body: { serverToken: bodyToken, ...(useBodyRef ? { serverId: bodyRef } : {}) },
            query: { serverToken: queryToken },
            ip: '127.0.0.1',
          };
          const r = await run(req);
          expect(r.nextCalled).toBe(false);
          expect(r.status).toBe(401);
          expect(r.body).toEqual(REJECT_BODY);
          expect(req.agentServer).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });
});
