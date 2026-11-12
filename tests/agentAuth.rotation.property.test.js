// Feature: production-hardening, Property 19: Rotation invalidates the previous key
// **Validates: Requirements 2.1, 2.4, 2.6**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createAgentAuthMiddleware,
  decideAgentAuth,
  generateAgentKey,
  hashAgentKey,
  rotateAgentKey,
  RotationError,
} from '../lib/agentAuth.js';

function makeStore(servers, { failSet = false } = {}) {
  return {
    findServer: async (id) => servers.find((s) => s.id === id) || null,
    setAgentKeyHash: async (id, hash) => {
      if (failSet) throw new Error('db down');
      servers.find((s) => s.id === id).apiKey = hash;
    },
  };
}

async function authenticate(servers, serverId, key) {
  const mw = createAgentAuthMiddleware({
    getServers: () => servers,
    audit: async () => {},
    config: { agentAuthMode: 'enforce', logger: { warn() {} } },
    keyStatus: new Map(),
  });
  const req = { headers: { 'x-agent-key': key }, body: { serverId }, originalUrl: '/api/agent/telemetry' };
  let status = 200;
  let nextCalled = false;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  await mw(req, res, () => { nextCalled = true; });
  return { accepted: nextCalled && status === 200, status };
}

const idArb = fc.stringMatching(/^[a-z0-9]{3,12}$/);

describe('Property 19: Rotation invalidates the previous key', () => {
  it('after rotation the new key is accepted, the old key rejected (enforce)', async () => {
    await fc.assert(
      fc.asyncProperty(idArb, fc.integer({ min: 1, max: 3 }), async (id, rotations) => {
        const oldKey = generateAgentKey();
        const servers = [{ id, ipPort: '10.0.0.1:1', apiKey: hashAgentKey(oldKey) }];
        const store = makeStore(servers);
        expect((await authenticate(servers, id, oldKey)).accepted).toBe(true);

        let prev = oldKey;
        const retired = [oldKey];
        for (let i = 0; i < rotations; i++) {
          const { agentKey } = await rotateAgentKey({ store, serverId: id });
          expect(agentKey).not.toBe(prev);
          retired.push(agentKey);
          prev = agentKey;
          retired.pop();
          // new key accepted, every earlier key rejected
          expect((await authenticate(servers, id, agentKey)).accepted).toBe(true);
          expect(decideAgentAuth({ mode: 'enforce', serverFound: true, storedHash: servers[0].apiKey, submittedKey: agentKey }).action).toBe('ACCEPT');
          retired.push(agentKey);
          for (const old of retired.slice(0, -1)) {
            const r = await authenticate(servers, id, old);
            expect(r.accepted).toBe(false);
            expect(r.status).toBe(401);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a rotation that fails before storing leaves the old key accepted', async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (id) => {
        const oldKey = generateAgentKey();
        const oldHash = hashAgentKey(oldKey);
        const servers = [{ id, ipPort: '10.0.0.1:1', apiKey: oldHash }];
        const store = makeStore(servers, { failSet: true });
        let err;
        try {
          await rotateAgentKey({ store, serverId: id });
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(RotationError);
        expect(err.code).toBe('ROTATION_FAILED');
        expect(servers[0].apiKey).toBe(oldHash);
        expect((await authenticate(servers, id, oldKey)).accepted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
