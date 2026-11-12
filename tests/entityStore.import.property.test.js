import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createMemoryEntityStore, importLegacyEntities, ENTITIES } from '../lib/entityStore.js';

// Feature: production-hardening, Property 30: Legacy import is correct and idempotent
// **Validates: Requirements 10.6, 10.7, 10.8, 10.11, 19.7**

const idArb = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
const recordArb = fc.record({
  id: idArb,
  status: fc.constantFrom('pending', 'done'),
  createdAt: fc.constantFrom('2024-01-01', '2024-02-01', '2024-03-01'),
  note: fc.string({ maxLength: 10 })
});
const tokenArb = fc.constantFrom('t1', 't2', 't3', 't4', 'T1', 'T2');
const sourceArb = fc.record({
  requests: fc.array(recordArb, { maxLength: 8 }),
  renewals: fc.array(recordArb, { maxLength: 8 }),
  migrations: fc.array(recordArb, { maxLength: 8 }),
  deletedServers: fc.array(tokenArb, { maxLength: 6 })
});
const sourcesArb = fc.tuple(sourceArb, sourceArb); // [memoryStore, database.json]

const silent = () => {};
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function expectedUnique(sources, entity) {
  const map = new Map();
  for (const s of sources) {
    for (const r of s[entity]) {
      const key = entity === 'deletedServers' ? r.toLowerCase() : r.id;
      if (!map.has(key)) map.set(key, r);
    }
  }
  return map;
}

async function snapshot(store) {
  const out = {};
  for (const e of ENTITIES) out[e] = await store.list(e);
  out.deletedServers = await store.count('deletedServers');
  return out;
}

describe('Property 30: Legacy import is correct and idempotent', () => {
  it('imports unique ids into empty tables, first occurrence wins', async () => {
    await fc.assert(
      fc.asyncProperty(sourcesArb, async (sources) => {
        const store = createMemoryEntityStore();
        await importLegacyEntities(store, sources, silent);
        for (const e of [...ENTITIES, 'deletedServers']) {
          const exp = expectedUnique(sources, e);
          expect(await store.count(e)).toBe(exp.size);
        }
        for (const e of ENTITIES) {
          const exp = expectedUnique(sources, e);
          for (const [id, rec] of exp) expect(await store.get(e, id)).toEqual(rec);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('a second import adds 0 rows and modifies 0 rows', async () => {
    await fc.assert(
      fc.asyncProperty(sourcesArb, async (sources) => {
        const store = createMemoryEntityStore();
        await importLegacyEntities(store, sources, silent);
        const before = await snapshot(store);
        const again = await importLegacyEntities(store, sources, silent);
        expect(await snapshot(store)).toEqual(before);
        for (const e of [...ENTITIES, 'deletedServers']) expect(again[e].imported).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('importing into a non-empty table leaves it unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(sourcesArb, recordArb, async (sources, existing) => {
        const store = createMemoryEntityStore();
        for (const e of ENTITIES) await store.put(e, existing);
        await store.addTombstones(['pre-existing']);
        const before = await snapshot(store);
        await importLegacyEntities(store, sources, silent);
        expect(await snapshot(store)).toEqual(before);
      }),
      { numRuns: 100 }
    );
  });

  it('never modifies the database.json file it reads from', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-'));
    const file = path.join(dir, 'database.json');
    try {
      await fc.assert(
        fc.asyncProperty(sourceArb, async (src) => {
          fs.writeFileSync(file, JSON.stringify(src));
          const bytesBefore = fs.readFileSync(file);
          const fromDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
          const store = createMemoryEntityStore();
          await importLegacyEntities(store, [fromDisk], silent);
          await importLegacyEntities(store, [fromDisk], silent);
          expect(sha(fs.readFileSync(file))).toBe(sha(bytesBefore));
        }),
        { numRuns: 100 }
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
