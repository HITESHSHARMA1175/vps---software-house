// Agent authentication core (Requirements 1, 2, 4). Pure logic plus an Express middleware factory.
import crypto from 'node:crypto';

export const KEY_PREFIX = 'ak_';
export const WARN_WINDOW_MS = 10 * 60 * 1000;
export const REJECT_BODY = Object.freeze({ error: 'Unauthorized' });

/** 'ak_' + base64url(32 random bytes) => 46 chars, 256 bits. */
export function generateAgentKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

/** Hex SHA-256 of the key (64 chars). */
export function hashAgentKey(key) {
  return crypto.createHash('sha256').update(String(key ?? ''), 'utf8').digest('hex');
}

const DUMMY_HASH = hashAgentKey('dummy-agent-key-for-constant-work');

/** Constant-time comparison of SHA-256 digests; false for empty/invalid inputs. */
export function verifyAgentKey(submitted, storedHash) {
  const sub = typeof submitted === 'string' ? submitted : '';
  const stored = typeof storedHash === 'string' ? storedHash : '';
  const a = crypto.createHash('sha256').update(sub, 'utf8').digest();
  const b = /^[0-9a-fA-F]{64}$/.test(stored) ? Buffer.from(stored, 'hex') : null;
  if (!b) {
    // keep similar work, then fail
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b) && sub.length > 0;
}

/**
 * Decision table (design section 3).
 * @returns {{action:'ACCEPT'|'ACCEPT_WARN'|'REJECT', keyValid:boolean}}
 */
export function decideAgentAuth({
  mode,
  serverFound,
  storedHash,
  submittedKey,
  previousHash,
  previousExpiresAt,
  now = Date.now(),
} = {}) {
  const hasHash = typeof storedHash === 'string' && storedHash.length > 0;
  const hasKey = typeof submittedKey === 'string' && submittedKey.length > 0;
  const match = !!(serverFound && hasHash && hasKey && verifyAgentKey(submittedKey, storedHash));

  if (match) return { action: 'ACCEPT', keyValid: true, keyUsed: 'current' };

  // Grace window: an unexpired previous hash is accepted in both modes (Requirements 2.10, 2.11).
  const prevMatch = !!(
    serverFound &&
    hasKey &&
    isPreviousUsable(previousHash, previousExpiresAt, now) &&
    verifyAgentKey(submittedKey, previousHash)
  );
  if (prevMatch) return { action: 'ACCEPT', keyValid: true, keyUsed: 'previous' };

  if (mode === 'warn') {
    if (serverFound && hasHash && hasKey) return { action: 'REJECT', keyValid: false, keyUsed: null }; // 4.4
    return { action: 'ACCEPT_WARN', keyValid: false, keyUsed: null }; // 4.2
  }
  // enforce (and any unknown mode fails closed)
  return { action: 'REJECT', keyValid: false, keyUsed: null };
}

/** The previous hash counts only when non-empty and now < expiry. */
function isPreviousUsable(previousHash, previousExpiresAt, now) {
  const exp = Number(previousExpiresAt);
  return (
    typeof previousHash === 'string' &&
    previousHash.length > 0 &&
    previousExpiresAt !== null &&
    previousExpiresAt !== undefined &&
    Number.isFinite(exp) &&
    Number(now) < exp
  );
}

/** @returns {{valid:boolean, keyUsed:'current'|'previous'|null}} */
export function matchAgentKey({ server, submittedKey, now = Date.now() } = {}) {
  if (!server || typeof submittedKey !== 'string' || !submittedKey) return { valid: false, keyUsed: null };
  if (typeof server.apiKey === 'string' && server.apiKey && verifyAgentKey(submittedKey, server.apiKey)) {
    return { valid: true, keyUsed: 'current' };
  }
  if (
    isPreviousUsable(server.previousApiKey, server.previousKeyExpiresAt, now) &&
    verifyAgentKey(submittedKey, server.previousApiKey)
  ) {
    return { valid: true, keyUsed: 'previous' };
  }
  return { valid: false, keyUsed: null };
}

/** Servers whose current or unexpired previous hash equals keyHash (detect-server). */
export function findServerByKeyHash(servers, keyHash, now = Date.now()) {
  if (!Array.isArray(servers) || !keyHash) return [];
  return servers.filter(
    (s) =>
      s &&
      (s.apiKey === keyHash ||
        (s.previousApiKey === keyHash && isPreviousUsable(s.previousApiKey, s.previousKeyExpiresAt, now))),
  );
}

function normalizeHostPort(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { host: '', port: '', full: '' };
  s = s.replace(/^::ffff:/, '');
  let host = s;
  let port = '';
  const br = s.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (br) {
    host = br[1];
    port = br[2] || '';
  } else if ((s.match(/:/g) || []).length === 1) {
    const i = s.indexOf(':');
    host = s.slice(0, i);
    port = s.slice(i + 1);
  }
  return { host, port, full: port ? `${host}:${port}` : host };
}

/**
 * Strict lookup: exact id, or exact ipPort, or bare IP that resolves to exactly one server.
 * Never matches by name; ambiguous => null.
 */
export function findServerForKeyCheck(servers, ref) {
  const r = String(ref ?? '').trim();
  if (!r || !Array.isArray(servers)) return null;
  const byId = servers.filter((s) => s && s.id === r);
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) return null;
  const q = normalizeHostPort(r);
  if (!q.host) return null;
  if (q.port) {
    const m = servers.filter((s) => s && s.ipPort && normalizeHostPort(s.ipPort).full === q.full);
    return m.length === 1 ? m[0] : null;
  }
  const m = servers.filter((s) => s && s.ipPort && normalizeHostPort(s.ipPort).host === q.host);
  return m.length === 1 ? m[0] : null;
}

/** Returns shouldLog(serverId): true at most once per serverId per window. */
export function createWarnThrottle(windowMs = WARN_WINDOW_MS, now = Date.now) {
  const last = new Map();
  return function shouldLog(serverId) {
    const id = String(serverId ?? '');
    const t = now();
    const prev = last.get(id);
    if (prev !== undefined && t - prev < windowMs) return false;
    last.set(id, t);
    return true;
  };
}

export class RotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RotationError';
    this.code = code; // 'NOT_FOUND' | 'ROTATION_FAILED'
  }
}

/**
 * store: { findServer?(id) -> server|null, setAgentKeyHash(id, hash) -> Promise }
 * The new key is returned only after the hash is stored; on failure the old hash is untouched.
 */
export async function rotateAgentKey({
  store,
  serverId,
  generate = generateAgentKey,
  graceMinutes = 0,
  now = Date.now,
}) {
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 1440) {
    const err = new RotationError('INVALID_GRACE', 'graceMinutes must be an integer between 0 and 1440');
    err.statusCode = 400;
    throw err;
  }
  let found = null;
  if (typeof store?.findServer === 'function') {
    try {
      found = await store.findServer(serverId);
    } catch {
      throw new RotationError('ROTATION_FAILED', 'Key rotation failed');
    }
    if (!found) throw new RotationError('NOT_FOUND', 'Server not found');
  }
  let agentKey;
  try {
    agentKey = generate();
    const newHash = hashAgentKey(agentKey);
    const oldHash = typeof found?.apiKey === 'string' ? found.apiKey : '';
    const keepPrevious = graceMinutes > 0 && oldHash.length > 0;
    const record = {
      apiKey: newHash,
      previousApiKey: keepPrevious ? oldHash : '',
      previousKeyExpiresAt: keepPrevious ? now() + graceMinutes * 60000 : null,
    };
    if (typeof store.setAgentKeyRecord === 'function') await store.setAgentKeyRecord(serverId, record);
    else await store.setAgentKeyHash(serverId, newHash, record);
  } catch {
    throw new RotationError('ROTATION_FAILED', 'Key rotation failed');
  }
  return { agentKey };
}

function headerValue(req, name) {
  const v = req.headers?.[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * Default server resolution: serverId from body / query / x-server-id; with no reference,
 * look up by key hash (detect-server). Returns {server, ref, error}.
 */
async function defaultResolve(req, servers, submittedKey, now = Date.now) {
  const ref =
    (req.body && typeof req.body === 'object' && typeof req.body.serverId === 'string' && req.body.serverId) ||
    (req.query && typeof req.query.serverId === 'string' && req.query.serverId) ||
    headerValue(req, 'x-server-id') ||
    '';
  if (ref) return { server: findServerForKeyCheck(servers, ref), ref };
  if (submittedKey) {
    const h = hashAgentKey(submittedKey);
    const m = findServerByKeyHash(servers, h, now());
    return { server: m.length === 1 ? m[0] : null, ref: '' };
  }
  return { server: null, ref: '' };
}

/**
 * deps: { getServers: () => Server[]|Promise, audit: (entry) => any, config: {agentAuthMode, logger?},
 *         keyStatus: Map, resolveAgentServer?: (req, servers, submittedKey) => {server, ref}|Promise,
 *         now?: () => number, throttle?: fn }
 */
export function createAgentAuthMiddleware({
  getServers,
  audit,
  config,
  keyStatus,
  resolveAgentServer,
  now = Date.now,
  throttle,
  failureLimiter,
}) {
  const shouldWarn = throttle || createWarnThrottle(WARN_WINDOW_MS, now);
  const log = config?.logger || console;

  const reject = (res) => res.status(401).json({ ...REJECT_BODY });

  return async function agentAuth(req, res, next) {
    const endpoint = String(req.originalUrl || req.url || '').split('?')[0];
    const submittedKey = headerValue(req, 'x-agent-key');
    const mode = config?.agentAuthMode;
    let servers = [];
    let storageError = false;
    try {
      servers = (await getServers()) || [];
    } catch {
      storageError = true;
    }

    let server = null;
    let ref = '';
    if (!storageError) {
      try {
        const r = await (resolveAgentServer || defaultResolve)(req, servers, submittedKey, now);
        server = r?.server || null;
        ref = r?.ref ?? '';
      } catch {
        storageError = true;
      }
    }
    if (!ref) ref = String(req.body?.serverId ?? req.query?.serverId ?? headerValue(req, 'x-server-id') ?? '');

    const storedHash = server && typeof server.apiKey === 'string' ? server.apiKey : '';
    const decision = decideAgentAuth({
      mode,
      serverFound: !!server && !storageError,
      storedHash,
      submittedKey,
      previousHash: server && typeof server.previousApiKey === 'string' ? server.previousApiKey : '',
      previousExpiresAt: server ? server.previousKeyExpiresAt : null,
      now: now(),
    });
    // similar work for unknown servers (timing)
    if (!server) verifyAgentKey(submittedKey, DUMMY_HASH);

    if (server && keyStatus && typeof keyStatus.set === 'function') {
      keyStatus.set(server.id, { valid: decision.keyValid, keyUsed: decision.keyUsed ?? null, at: new Date(now()).toISOString() });
    }

    if (decision.action === 'REJECT') {
      try {
        await audit?.({
          action: 'AGENT_AUTH_FAILED',
          serverId: String(ref).slice(0, 100),
          ip: req.clientIp || req.ip || '',
          endpoint,
          timestamp: new Date(now()).toISOString(),
        });
      } catch {
        /* auditing must not change the response */
      }
      log.warn?.(`[agent-auth] rejected serverId=${String(ref).slice(0, 100)} endpoint=${endpoint}`);
      // Only failed authentications are counted; once over the limit answer 429 instead of 401.
      if (failureLimiter) {
        try {
          const rate = await failureLimiter(req);
          if (rate && rate.allowed === false) {
            const secs = Number(rate.retryAfterSeconds);
            return res.status(429).json({
              success: false,
              error: 'Too many requests. Please try again later.',
              retryAfterSeconds: Number.isFinite(secs) && secs > 0 ? Math.ceil(secs) : 1,
            });
          }
        } catch {
          /* limiter errors must not change the 401 response */
        }
      }
      return reject(res);
    }

    if (decision.action === 'ACCEPT_WARN') {
      const id = server?.id ?? String(ref);
      if (shouldWarn(id)) {
        log.warn?.(`[agent-auth] accepted without valid key serverId=${String(id).slice(0, 100)} endpoint=${endpoint}`);
      }
    }
    if (server) req.agentServer = server;
    return next();
  };
}
