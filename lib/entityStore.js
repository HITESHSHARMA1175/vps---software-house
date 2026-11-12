// Entity storage for requests, renewals, migrations and deleted-server tombstones.
// See design section 8 (Req 10). Three implementations share one interface:
//   createMysqlEntityStore(pool, cipher)  production (Entity_Tables)
//   createMemoryEntityStore()             tests, isolated containers
//   createJsonEntityStore(container, {save})  non-prod fallback over memoryStore arrays
// list() returns newest first (createdAt DESC, id DESC) in every implementation,
// matching the existing unshift-based routes.
import { sealPassword as defaultSeal, isCiphertext as defaultIsCiphertext } from './secretCipher.js';

export const ENTITIES = ['requests', 'renewals', 'migrations'];
export const ENTITY_TABLES = { requests: 'requests', renewals: 'renewals', migrations: 'migrations', deletedServers: 'deleted_servers' };
const IMPORT_ENTITIES = [...ENTITIES, 'deletedServers'];

export class EntityStoreError extends Error {
  constructor(message, code = 'ENTITY_STORE_ERROR') {
    super(message);
    this.name = 'EntityStoreError';
    this.code = code;
  }
}

function assertEntity(entity) {
  if (!ENTITIES.includes(entity)) throw new EntityStoreError(`Unknown entity: ${entity}`, 'UNKNOWN_ENTITY');
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const str50 = (v) => (v === undefined || v === null ? null : String(v).slice(0, 50));
const cmpDesc = (a, b) => {
  const ca = String(a.createdAt ?? '');
  const cb = String(b.createdAt ?? '');
  if (ca !== cb) return ca < cb ? 1 : -1;
  const ia = String(a.id);
  const ib = String(b.id);
  return ia === ib ? 0 : ia < ib ? 1 : -1;
};
const validId = (r) => r && typeof r === 'object' && r.id !== undefined && r.id !== null && String(r.id) !== '';

// Seals the migration password when it is not already ciphertext. Returns a copy.
function prepareRecord(entity, record, cipher) {
  const rec = clone(record);
  if (entity === 'migrations' && cipher && typeof rec.password === 'string' && rec.password !== '') {
    if (!cipher.isCiphertext(rec.password)) rec.password = cipher.sealPassword(rec.password);
  }
  return rec;
}

function resolveCipher(cipher) {
  if (!cipher) return null;
  return {
    sealPassword: cipher.sealPassword || defaultSeal,
    isCiphertext: cipher.isCiphertext || defaultIsCiphertext
  };
}

/** Removes the migration password for logs and responses (Req 10.10). */
export function serializeMigration(m) {
  if (!m || typeof m !== 'object') return m;
  const { password, ...rest } = m;
  return rest;
}

/** Tombstone terms for a server: id, ip:port, bare IP, name, all lowercased and unique. */
export function tombstoneTerms(server) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string' && v.trim() !== '') out.add(v.trim().toLowerCase()); };
  if (!server) return [];
  if (typeof server === 'string') {
    add(server);
    add(server.split(':')[0]);
    return [...out];
  }
  add(server.id);
  if (server.ipPort) {
    add(server.ipPort);
    add(String(server.ipPort).split(':')[0]);
  }
  add(server.name);
  return [...out];
}

// ---------------------------------------------------------------------------
// Array-backed implementation (memory and JSON mode)
// ---------------------------------------------------------------------------
function createArrayBackedStore(container, { save = () => {}, cipher = null, removeServer = null } = {}) {
  const c = resolveCipher(cipher);
  const arr = (k) => {
    if (!Array.isArray(container[k])) container[k] = [];
    return container[k];
  };
  const find = (entity, id) => arr(entity).findIndex((r) => r && String(r.id) === String(id));

  return {
    mode: 'array',
    async list(entity, { limit } = {}) {
      assertEntity(entity);
      const rows = arr(entity).filter(validId).map(clone).sort(cmpDesc);
      return limit > 0 ? rows.slice(0, limit) : rows;
    },
    async get(entity, id) {
      assertEntity(entity);
      const i = find(entity, id);
      return i < 0 ? null : clone(arr(entity)[i]);
    },
    async put(entity, record) {
      assertEntity(entity);
      if (!validId(record)) throw new EntityStoreError('Record id is required', 'INVALID_RECORD');
      const rec = prepareRecord(entity, record, c);
      const i = find(entity, rec.id);
      if (i < 0) arr(entity).push(rec);
      else arr(entity)[i] = rec;
      save();
    },
    async remove(entity, id) {
      assertEntity(entity);
      const i = find(entity, id);
      if (i < 0) return false;
      arr(entity).splice(i, 1);
      save();
      return true;
    },
    async isDeleted(term) {
      if (typeof term !== 'string' || term === '') return false;
      return arr('deletedServers').includes(term.toLowerCase());
    },
    async count(entity) {
      if (entity === 'deletedServers') return arr('deletedServers').length;
      assertEntity(entity);
      return arr(entity).filter(validId).length;
    },
    async addTombstones(tokens) {
      const list = arr('deletedServers');
      for (const t of tokens) if (!list.includes(t)) list.push(t);
      save();
    },
    async removeTombstones(tokens) {
      const set = new Set(tokens);
      const list = arr('deletedServers');
      const before = list.length;
      container.deletedServers = list.filter((t) => !set.has(t));
      if (container.deletedServers.length !== before) save();
      return before - container.deletedServers.length;
    },
    // Tombstones and server removal succeed together or not at all (Req 10.12, 10.13).
    async deleteServerAtomic({ serverId, tokens }) {
      const snapshot = clone(arr('deletedServers'));
      try {
        await this.addTombstones(tokens);
        if (removeServer) await removeServer(serverId);
      } catch (err) {
        container.deletedServers = snapshot;
        throw err;
      }
    },
    // Bulk insert used by the legacy import; all-or-nothing.
    async importMany(entity, records) {
      const backup = clone(arr(entity));
      try {
        if (entity === 'deletedServers') {
          const list = arr('deletedServers');
          for (const r of records) if (!list.includes(r.token)) list.push(r.token);
        } else {
          assertEntity(entity);
          for (const r of records) arr(entity).push(prepareRecord(entity, r, c));
        }
        save();
      } catch (err) {
        container[entity] = backup;
        throw err;
      }
    }
  };
}

export function createMemoryEntityStore(options = {}) {
  return createArrayBackedStore({ requests: [], renewals: [], migrations: [], deletedServers: [] }, options);
}

/** JSON fallback mode: operates on the memoryStore arrays and calls save() after writes. */
export function createJsonEntityStore(container, options = {}) {
  return createArrayBackedStore(container, options);
}

// ---------------------------------------------------------------------------
// MySQL implementation
// ---------------------------------------------------------------------------
export function createMysqlEntityStore(pool, cipher = null) {
  const c = resolveCipher(cipher);
  const table = (entity) => {
    assertEntity(entity);
    return '`' + ENTITY_TABLES[entity] + '`';
  };
  const parse = (row) => JSON.parse(row.data);

  async function withTx(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      try {
        const out = await fn(conn);
        await conn.commit();
        return out;
      } catch (err) {
        try { await conn.rollback(); } catch { /* keep original error */ }
        throw err;
      }
    } finally {
      conn.release();
    }
  }

  const upsertSql = (entity) =>
    `INSERT INTO ${table(entity)} (id, status, createdAt, data) VALUES (?, ?, ?, ?) ` +
    'ON DUPLICATE KEY UPDATE status=VALUES(status), createdAt=VALUES(createdAt), data=VALUES(data)';
  const rowParams = (rec) => [String(rec.id), str50(rec.status), str50(rec.createdAt), JSON.stringify(rec)];

  return {
    mode: 'mysql',
    async list(entity, { limit } = {}) {
      const t = table(entity);
      const lim = Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}` : '';
      const [rows] = await pool.query(`SELECT data FROM ${t} ORDER BY createdAt DESC, id DESC${lim}`);
      return rows.map(parse);
    },
    async get(entity, id) {
      const [rows] = await pool.query(`SELECT data FROM ${table(entity)} WHERE id=?`, [String(id)]);
      return rows.length ? parse(rows[0]) : null;
    },
    async put(entity, record) {
      table(entity);
      if (!validId(record)) throw new EntityStoreError('Record id is required', 'INVALID_RECORD');
      const rec = prepareRecord(entity, record, c);
      await pool.query(upsertSql(entity), rowParams(rec));
    },
    async remove(entity, id) {
      const [res] = await pool.query(`DELETE FROM ${table(entity)} WHERE id=?`, [String(id)]);
      return (res?.affectedRows || 0) > 0;
    },
    async isDeleted(term) {
      if (typeof term !== 'string' || term === '') return false;
      const [rows] = await pool.query('SELECT 1 FROM `deleted_servers` WHERE token=? LIMIT 1', [term.toLowerCase()]);
      return rows.length > 0;
    },
    async count(entity) {
      const t = entity === 'deletedServers' ? '`deleted_servers`' : table(entity);
      const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
      return Number(rows[0]?.n || 0);
    },
    async addTombstones(tokens, { serverId = null, snapshot = null, deletedAt = new Date().toISOString() } = {}) {
      await withTx((conn) => insertTombstones(conn, tokens, serverId, snapshot, deletedAt));
    },
    async removeTombstones(tokens) {
      if (!tokens.length) return 0;
      const [res] = await pool.query('DELETE FROM `deleted_servers` WHERE token IN (?)', [tokens]);
      return res?.affectedRows || 0;
    },
    // Tombstone inserts and the vps_servers delete share one transaction (Req 10.12, 10.13).
    async deleteServerAtomic({ serverId, tokens, snapshot = null, deletedAt = new Date().toISOString() }) {
      await withTx(async (conn) => {
        await insertTombstones(conn, tokens, serverId, snapshot, deletedAt);
        await conn.query('DELETE FROM `vps_servers` WHERE id=?', [serverId]);
      });
    },
    // One transaction per call; rolled back entirely on any error (Req 10.9).
    async importMany(entity, records) {
      await withTx(async (conn) => {
        if (entity === 'deletedServers') {
          await insertTombstones(conn, records.map((r) => r.token), null, null, new Date().toISOString(), records);
          return;
        }
        for (const r of records) {
          await conn.query(upsertSql(entity), rowParams(prepareRecord(entity, r, c)));
        }
      });
    }
  };
}

// The snapshot is stored on the first row only (design section 8).
async function insertTombstones(conn, tokens, serverId, snapshot, deletedAt, srcRows = null) {
  const snap = snapshot ? JSON.stringify(snapshot) : null;
  let first = true;
  for (const token of tokens) {
    const src = srcRows ? srcRows.find((r) => r.token === token) : null;
    await conn.query(
      'INSERT INTO `deleted_servers` (token, serverId, deletedAt, snapshot) VALUES (?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE deletedAt=VALUES(deletedAt)',
      [token, src?.serverId ?? serverId, str50(src?.deletedAt ?? deletedAt), src?.snapshot ?? (first ? snap : null)]
    );
    first = false;
  }
}

// ---------------------------------------------------------------------------
// Server deletion / restore helpers
// ---------------------------------------------------------------------------

/**
 * Tombstones the server's terms and removes it from the active servers in one atomic step.
 * On failure nothing changes and an EntityStoreError('DELETE_FAILED') is thrown.
 * `server` may be the server object or a bare id string when the server is unknown.
 */
export async function deleteServerWithTombstones(store, server) {
  const serverId = typeof server === 'string' ? server : server?.id;
  if (!serverId) throw new EntityStoreError('Server id is required', 'INVALID_RECORD');
  const tokens = tombstoneTerms(server);
  try {
    await store.deleteServerAtomic({
      serverId,
      tokens,
      snapshot: typeof server === 'string' ? null : server,
      deletedAt: new Date().toISOString()
    });
  } catch (err) {
    const e = new EntityStoreError('Server deletion failed', 'DELETE_FAILED');
    e.cause = err;
    throw e;
  }
  return tokens;
}

/** Removes the tombstones for a re-added server. Returns how many were removed. */
export async function restoreServer(store, server) {
  const tokens = tombstoneTerms(server);
  if (!tokens.length) return 0;
  return store.removeTombstones(tokens);
}

// ---------------------------------------------------------------------------
// Startup import
// ---------------------------------------------------------------------------

function normalizeTombstone(t) {
  if (typeof t === 'string') return t.trim() === '' ? null : { token: t.trim().toLowerCase() };
  if (t && typeof t === 'object' && typeof t.token === 'string' && t.token !== '') return { ...t, token: t.token.toLowerCase() };
  return null;
}

/**
 * Imports legacy records into empty stores.
 * `sources` is one object or an array of objects (memoryStore first, then the database.json
 * read) with arrays under requests, renewals, migrations and deletedServers.
 * Per entity: skip when count > 0; de-duplicate by id (token for tombstones, first wins);
 * one transaction; on error roll back, log the table name and continue.
 * Never writes to database.json. Returns { [entity]: { status, imported } }.
 */
export async function importLegacyEntities(store, sources, log = console.log) {
  const list = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
  const result = {};
  for (const entity of IMPORT_ENTITIES) {
    const table = ENTITY_TABLES[entity];
    try {
      if ((await store.count(entity)) > 0) {
        result[entity] = { status: 'skipped', imported: 0 };
        continue;
      }
      const seen = new Set();
      const records = [];
      for (const src of list) {
        for (const raw of Array.isArray(src[entity]) ? src[entity] : []) {
          const rec = entity === 'deletedServers' ? normalizeTombstone(raw) : (validId(raw) ? raw : null);
          if (!rec) continue;
          const key = entity === 'deletedServers' ? rec.token : String(rec.id);
          if (seen.has(key)) continue;
          seen.add(key);
          records.push(rec);
        }
      }
      if (records.length) await store.importMany(entity, records);
      result[entity] = { status: 'imported', imported: records.length };
    } catch (err) {
      log(`Entity import failed for table ${table}: ${err.message}`);
      result[entity] = { status: 'failed', imported: 0 };
    }
  }
  return result;
}
