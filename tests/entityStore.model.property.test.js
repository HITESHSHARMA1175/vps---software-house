import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createMemoryEntityStore, ENTITIES } from '../lib/entityStore.js';

// Feature: production-hardening, Property 29: Entity store matches a simple model
// **Validates: Requirements 10.4, 10.5**

const idArb = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f');
const recordArb = fc.record({
  id: idArb,
  status: fc.constantFrom('pending', 'approved', 'rejected'),
  createdAt: fc.integer({ min: 0, max: 5 }).map((n) => `2024-01-0${n + 1}T00:00:00.000Z`),
  note: fc.string({ maxLength: 20 }),
  nested: fc.record({ n: fc.integer(), flag: fc.boolean() })
});
const opArb = fc.oneof(
  fc.record({ op: fc.constant('put'), entity: fc.constantFrom(...ENTITIES), record: recordArb }),
  fc.record({ op: fc.constant('remove'), entity: fc.constantFrom(...ENTITIES), id: idArb })
);

const modelList = (m) =>
  [...m.values()].sort((a, b) =>
    a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  );

describe('Property 29: Entity store matches a simple model', () => {
  it('get/list equal a plain Map model after any put/remove sequence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 40 }), async (ops) => {
        const store = createMemoryEntityStore();
        const model = Object.fromEntries(ENTITIES.map((e) => [e, new Map()]));

        for (const o of ops) {
          if (o.op === 'put') {
            const input = JSON.parse(JSON.stringify(o.record));
            await store.put(o.entity, o.record);
            model[o.entity].set(o.record.id, input);
            // put then get returns a deep-equal record
            expect(await store.get(o.entity, o.record.id)).toEqual(input);
          } else {
            const existed = model[o.entity].delete(o.id);
            expect(await store.remove(o.entity, o.id)).toBe(existed);
          }
        }

        for (const e of ENTITIES) {
          expect(await store.list(e)).toEqual(modelList(model[e]));
          expect(await store.count(e)).toBe(model[e].size);
          for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
            expect(await store.get(e, id)).toEqual(model[e].get(id) ?? null);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
