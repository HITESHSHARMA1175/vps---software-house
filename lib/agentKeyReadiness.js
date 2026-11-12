// Readiness check for switching AGENT_AUTH_MODE to `enforce` (design section 19.5).
// Pure function: no I/O, no clock access except the injected `now`.
//
// readyForEnforce is true if and only if every non-deleted server has a stored key hash
// and its last agent request had a valid current key (lastRequestValid === true, keyUsed not 'previous') no more than
// `windowMs` (default 10 minutes) before `now`, boundary included.
//
// Documented edge cases:
//  - No non-deleted servers => readyForEnforce is true (nothing can be locked out).
//  - `keyStatus` lives in memory only. After a restart it is empty, so readyForEnforce stays
//    false until every agent has polled again with a valid key.
//  - Never returns a key or a hash, only whether a hash exists.

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value) return Date.parse(value);
  return NaN;
}

function isDeleted(server, deleted) {
  if (!deleted.size) return false;
  const candidates = [server.id, server.ipPort, server.name];
  return candidates.some((c) => typeof c === 'string' && c && deleted.has(c.toLowerCase()));
}

export function evaluateReadiness({
  servers = [],
  deletedTokens = [],
  keyStatus,
  now = Date.now(),
  windowMs = DEFAULT_WINDOW_MS
} = {}) {
  const deleted = new Set(
    (Array.isArray(deletedTokens) ? deletedTokens : [])
      .filter((t) => typeof t === 'string')
      .map((t) => t.toLowerCase())
  );
  const nowMs = toMs(now);
  const rows = [];
  let ready = true;

  for (const s of Array.isArray(servers) ? servers : []) {
    if (!s || isDeleted(s, deleted)) continue;
    const st = keyStatus && typeof keyStatus.get === 'function' ? keyStatus.get(s.id) : undefined;
    const hasHash = typeof s.apiKey === 'string' && s.apiKey.length > 0;
    const lastRequestValid = st ? st.valid : null;
    const lastValidAt = st ? st.at : null;
    const keyUsed = st && st.keyUsed ? st.keyUsed : null;
    const atMs = toMs(lastValidAt);
    const fresh = Number.isFinite(atMs) && Number.isFinite(nowMs) && nowMs - atMs <= windowMs;

    rows.push({
      serverId: s.id,
      hasHash,
      lastRequestValid,
      lastValidAt,
      keyUsed,
      agentVersion: s.agentVersion ?? null
    });
    // A request made with the previous key (grace window) does not count: that agent is rejected once the window ends (26.11)
    if (!(hasHash && lastRequestValid === true && fresh && keyUsed !== 'previous')) ready = false;
  }

  return { servers: rows, readyForEnforce: ready };
}
