import crypto from 'node:crypto';

/** Runtime attributes persisted in vps_servers.meta (LONGTEXT JSON). */
export const META_KEYS = Object.freeze([
  'agentAliases',
  'lastHardware',
  'hardware',
  'physicalDisks',
  'occupiedDrives',
  'tallyVersions',
  'processAlerts',
  'lastOptimizedAt',
  'lastKnownAllUsers',
  'lastKnownDisabledUsers',
  'agentVersion',
]);

function jsonSafe(value) {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined; // circular, BigInt, throwing toJSON
  }
}

/**
 * Returns a JSON-safe object holding the listed attributes of a server.
 * Attributes that are missing or not serializable are omitted.
 */
export function pickMeta(server) {
  const meta = {};
  if (!server || typeof server !== 'object') return meta;
  for (const key of META_KEYS) {
    if (server[key] === undefined) continue;
    const safe = jsonSafe(server[key]);
    if (safe !== undefined) meta[key] = safe;
  }
  return meta;
}

/**
 * Merges stored meta JSON back into the server object. Invalid JSON, non-object
 * JSON, and unknown keys are ignored; never throws. Returns the server.
 */
export function applyMeta(server, metaJson) {
  if (!server || typeof server !== 'object') return server;
  let parsed = metaJson;
  if (typeof metaJson === 'string') {
    try {
      parsed = JSON.parse(metaJson);
    } catch {
      return server;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return server;
  for (const key of META_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] !== undefined) {
      server[key] = parsed[key];
    }
  }
  return server;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Write throttling helper: compares the hash of the new meta with the previous
 * one. Returns { changed, hash, json }; store `hash` after a successful write.
 */
export function metaChanged(prevHash, meta) {
  const json = JSON.stringify(meta ?? {});
  const hash = crypto.createHash('sha256').update(stableStringify(meta ?? {})).digest('hex');
  return { changed: hash !== prevHash, hash, json };
}
