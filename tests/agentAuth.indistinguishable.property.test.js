// Feature: production-hardening, Property 17: Authentication failures are indistinguishable
// **Validates: Requirements 1.3, 1.4, 1.11**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createAgentAuthMiddleware, hashAgentKey, generateAgentKey } from '../lib/agentAuth.js';

const silent = { warn() {}, error() {}, info() {}, log() {} };

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, nextCalled: false };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.set = res.setHeader;
  res.json = (b) => { res.body = JSON.parse(JSON.stringify(b)); return res; };
  return res;
}

async function run(servers, mode, { serverRef, key }) {
  const audits = [];
  const mw = createAgentAuthMiddleware({
    getServers: () => servers,
    audit: (e) => { audits.push(e); },
    config: { agentAuthMode: mode, logger: silent },
    keyStatus: new Map(),
  });
  const headers = {};
  if (key !== undefined) headers['x-agent-key'] = key;
  const req = {
    headers,
    body: { serverId: serverRef },
    query: {},
    originalUrl: '/api/agent/telemetry',
    clientIp: '203.0.113.9',
  };
  const res = fakeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled, audits };
}

const keyArb = fc.constantFrom('ak_').chain((p) => fc.string({ minLength: 1, maxLength: 60 }).map((s) => p + s));

// Each scenario produces a rejected request for a distinct reason.
const scenarioArb = fc.record({
  reason: fc.constantFrom('unknown-server', 'missing-key', 'empty-key', 'wrong-key', 'no-hash', 'unreadable-hash'),
  realKey: fc.constant(null).map(() => generateAgentKey()),
  other: keyArb,
  badHash: fc.oneof(fc.constant('not-hex'), fc.string({ maxLength: 70 }).filter((s) => !/^[0-9a-fA-F]{64}$/.test(s) && s.length > 0)),
  refName: fc.stringMatching(/^[a-z0-9-]{1,20}$/),
});

function build({ reason, realKey, other, badHash, refName }) {
  const id = `srv-${refName}`;
  const base = { id, name: 'n', ipPort: '10.1.2.3:5000' };
  switch (reason) {
    case 'unknown-server':
      return { servers: [{ ...base, apiKey: hashAgentKey(realKey) }], req: { serverRef: `missing-${refName}`, key: realKey } };
    case 'missing-key':
      return { servers: [{ ...base, apiKey: hashAgentKey(realKey) }], req: { serverRef: id, key: undefined } };
    case 'empty-key':
      return { servers: [{ ...base, apiKey: hashAgentKey(realKey) }], req: { serverRef: id, key: '' } };
    case 'wrong-key':
      return { servers: [{ ...base, apiKey: hashAgentKey(realKey) }], req: { serverRef: id, key: other === realKey ? other + 'x' : other } };
    case 'no-hash':
      return { servers: [{ ...base }], req: { serverRef: id, key: other } };
    default:
      return { servers: [{ ...base, apiKey: badHash }], req: { serverRef: id, key: other } };
  }
}

describe('Property 17: Authentication failures are indistinguishable', () => {
  it('every rejection reason yields identical status, body and headers, with data unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (sc) => {
        const { servers, req } = build(sc);
        const before = JSON.stringify(servers);
        const { res, nextCalled } = await run(servers, 'enforce', req);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
        expect(res.headers).toEqual({});
        expect(JSON.stringify(servers)).toBe(before);

        // Reference rejection from a different reason must match exactly.
        const ref = build({ ...sc, reason: 'unknown-server' });
        const refOut = await run(ref.servers, 'enforce', ref.req);
        expect(res.statusCode).toBe(refOut.res.statusCode);
        expect(res.body).toEqual(refOut.res.body);
        expect(res.headers).toEqual(refOut.res.headers);
      }),
      { numRuns: 100 },
    );
  });

  it('a wrong key against a known server in warn mode is rejected with the same response', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (sc) => {
        const { servers, req } = build({ ...sc, reason: 'wrong-key' });
        const before = JSON.stringify(servers);
        const warn = await run(servers, 'warn', req);
        const enforce = await run(servers, 'enforce', req);
        expect(warn.nextCalled).toBe(false);
        expect(warn.res.statusCode).toBe(enforce.res.statusCode);
        expect(warn.res.body).toEqual(enforce.res.body);
        expect(warn.res.headers).toEqual(enforce.res.headers);
        expect(JSON.stringify(servers)).toBe(before);
      }),
      { numRuns: 100 },
    );
  });
});
