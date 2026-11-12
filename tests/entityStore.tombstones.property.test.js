import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createMemoryEntityStore,
  deleteServerWithTombstones,
  restoreServer,
  tombstoneTerms
} from '../lib/entityStore.js';

// Feature: production-hardening, Property 31: Server deletion tombstones
// **Validates: Requirements 10.12, 10.13**

const ipArb = fc
  .tuple(fc.integer({ min: 1, max: 254 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 1, max: 254 }))
  .map((p) => p.join('.'));
const serverArb = fc
  .record({
    id: fc.stringMatching(/^[A-Za-z0-9-]{3,12}$/),
    ip: ipArb,
    port: fc.integer({ min: 1, max: 65535 }),
    name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$/)
  })
  .map(({ id, ip, port, name }) => ({ id, ipPort: `${ip}:${port}`, name, ip }));

function setup(server, hooks = {}) {
  const active = new Map([[server.id, server]]);
  const store = createMemoryEntityStore({
    removeServer: async (id) => {
      if (hooks.failRemove) throw new Error('forced server delete failure');
      active.delete(id);
    }
  });
  if (hooks.failTombstones) {
    store.addTombstones = async () => {
      throw new Error('forced tombstone failure');
    };
  }
  return { store, active };
}

const termsOf = (s) => [s.id, s.ipPort, s.ip, s.name].map((t) => t.toLowerCase());

describe('Property 31: Server deletion tombstones', () => {
  it('deleted server leaves the active set and every lowercased term satisfies isDeleted', async () => {
    await fc.assert(
      fc.asyncProperty(serverArb, async (server) => {
        const { store, active } = setup(server);
        const returned = await deleteServerWithTombstones(store, server);
        expect(active.has(server.id)).toBe(false);
        expect([...returned].sort()).toEqual([...new Set(termsOf(server))].sort());
        for (const t of termsOf(server)) {
          expect(await store.isDeleted(t)).toBe(true);
          expect(await store.isDeleted(t.toUpperCase())).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('re-adding the server removes all of its tombstone terms', async () => {
    await fc.assert(
      fc.asyncProperty(serverArb, async (server) => {
        const { store } = setup(server);
        await deleteServerWithTombstones(store, server);
        const removed = await restoreServer(store, server);
        expect(removed).toBe(new Set(termsOf(server)).size);
        for (const t of termsOf(server)) expect(await store.isDeleted(t)).toBe(false);
        expect(await store.count('deletedServers')).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('a failed tombstone insert leaves the server active and creates no tombstones', async () => {
    await fc.assert(
      fc.asyncProperty(serverArb, async (server) => {
        const { store, active } = setup(server, { failTombstones: true });
        await expect(deleteServerWithTombstones(store, server)).rejects.toMatchObject({ code: 'DELETE_FAILED' });
        expect(active.has(server.id)).toBe(true);
        expect(await store.count('deletedServers')).toBe(0);
        for (const t of tombstoneTerms(server)) expect(await store.isDeleted(t)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('a failed server removal rolls back the tombstones and leaves the server active', async () => {
    await fc.assert(
      fc.asyncProperty(serverArb, async (server) => {
        const { store, active } = setup(server, { failRemove: true });
        await expect(deleteServerWithTombstones(store, server)).rejects.toMatchObject({ code: 'DELETE_FAILED' });
        expect(active.has(server.id)).toBe(true);
        expect(await store.count('deletedServers')).toBe(0);
        for (const t of termsOf(server)) expect(await store.isDeleted(t)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
