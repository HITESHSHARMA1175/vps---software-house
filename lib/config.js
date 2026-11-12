// Configuration loader (production-hardening, Phase 1 settings).
// Pure: takes an env object, returns a frozen config or throws ConfigError
// listing every problem found. Never includes secret values in messages.
import net from 'node:net';
import crypto from 'node:crypto';
import { parseKey } from './secretCipher.js';

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
    this.problems = Object.freeze([...problems]);
  }
}

export const MAX_TRUSTED_PROXIES = 50;
export const DEFAULT_TRUSTED_PROXIES = Object.freeze(['127.0.0.1', '::1']);
const AUTH_MODES = ['warn', 'enforce'];

/**
 * Public endpoint rate limits (design section 23.1). Env variables:
 * RATE_LIMIT_<NAME>_MAX and RATE_LIMIT_<NAME>_WINDOW_SEC (positive integers).
 * Entries that apply to a second key use an extra suffixed name:
 *  VERIFY_CUSTOMER = per IP, VERIFY_CUSTOMER_IDENTIFIER = per username+phone;
 *  VALIDATE_LOGIN = per preAuthToken, VALIDATE_LOGIN_IP = per IP;
 *  RESET_PASSWORD applies to both the IP key and the username key.
 */
const HOUR = 3600;
const QUARTER_HOUR = 900;
export const DEFAULT_RATE_LIMITS = Object.freeze({
  REQUEST_DEMO: Object.freeze({ max: 5, windowSec: HOUR }),
  VERIFY_CUSTOMER: Object.freeze({ max: 5, windowSec: HOUR }),
  VERIFY_CUSTOMER_IDENTIFIER: Object.freeze({ max: 3, windowSec: HOUR }),
  PUBLIC_TICKETS: Object.freeze({ max: 10, windowSec: HOUR }),
  RESET_PASSWORD: Object.freeze({ max: 5, windowSec: QUARTER_HOUR }),
  OTP_VERIFY: Object.freeze({ max: 5, windowSec: QUARTER_HOUR }),
  VALIDATE_LOGIN: Object.freeze({ max: 5, windowSec: QUARTER_HOUR }),
  VALIDATE_LOGIN_IP: Object.freeze({ max: 20, windowSec: QUARTER_HOUR }),
  AGENT_AUTH_FAIL: Object.freeze({ max: 30, windowSec: 300 }),
});

/** True for an IPv4/IPv6 address or an address/prefix CIDR range. */
export function isValidProxyEntry(entry) {
  if (typeof entry !== 'string' || entry === '') return false;
  const slash = entry.indexOf('/');
  if (slash === -1) return net.isIP(entry) !== 0;
  const addr = entry.slice(0, slash);
  const prefix = entry.slice(slash + 1);
  const family = net.isIP(addr);
  if (family === 0 || !/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

/** Splits a comma list, trims, drops empties. */
export function splitList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Joins the portal base URL and a path with exactly one "/" between them. */
export function buildPortalUrl(config, path = '') {
  const base = String(config.portalBaseUrl).replace(/\/+$/, '');
  const rest = String(path ?? '').replace(/^\/+/, '');
  return rest === '' ? base : `${base}/${rest}`;
}

/** True only when origin exactly matches an entry of config.corsAllowedOrigins. */
export function isOriginAllowed(config, origin) {
  if (typeof origin !== 'string' || origin === '') return false;
  return config.corsAllowedOrigins.includes(origin);
}

export function loadConfig(env = process.env, { listenPort } = {}) {
  const problems = [];
  const warnings = [];
  const notes = [];

  const nodeEnv = String(env.NODE_ENV ?? '').trim() || 'development';
  const isProduction = nodeEnv === 'production';

  // PORT
  let port = 5000;
  const rawPort = String(env.PORT ?? '').trim();
  if (rawPort !== '') {
    if (/^\d+$/.test(rawPort) && Number(rawPort) >= 1 && Number(rawPort) <= 65535) {
      port = Number(rawPort);
    } else {
      problems.push(`PORT must be an integer between 1 and 65535 (got "${rawPort}")`);
    }
  }

  // HOST (default loopback)
  const host = String(env.HOST ?? '').trim() || '127.0.0.1';

  // PORTAL_BASE_URL
  let portalBaseUrl = null;
  let portalOrigin = null;
  const rawBase = String(env.PORTAL_BASE_URL ?? '').trim();
  if (rawBase === '') {
    if (isProduction) {
      problems.push('PORTAL_BASE_URL is missing (required in production)');
    } else {
      portalBaseUrl = `http://127.0.0.1:${listenPort ?? port}`;
      portalOrigin = new URL(portalBaseUrl).origin;
    }
  } else {
    let parsed = null;
    try {
      parsed = new URL(rawBase);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      problems.push('PORTAL_BASE_URL is invalid (must be an absolute http or https URL)');
    } else if (isProduction && parsed.protocol !== 'https:') {
      problems.push('PORTAL_BASE_URL must use https in production (agent installer, binary and Agent_Key URLs are built from it)');
    } else {
      portalBaseUrl = rawBase.replace(/\/+$/, '');
      portalOrigin = parsed.origin;
    }
  }

  // CORS_ALLOWED_ORIGINS: portal origin plus trimmed, non-empty list entries
  const corsAllowedOrigins = [];
  if (portalOrigin) corsAllowedOrigins.push(portalOrigin);
  for (const o of splitList(env.CORS_ALLOWED_ORIGINS)) {
    if (!corsAllowedOrigins.includes(o)) corsAllowedOrigins.push(o);
  }

  // Translate: enabled only with TRANSLATE_ENABLED === '1' and a non-empty key
  const translateKey = String(env.TRANSLATE_API_KEY ?? '').trim();
  const translate = Object.freeze({
    enabled: env.TRANSLATE_ENABLED === '1' && translateKey !== '',
    apiKey: translateKey === '' ? null : translateKey,
  });

  // TRUSTED_PROXIES
  let trustedProxies = [...DEFAULT_TRUSTED_PROXIES];
  const entries = splitList(env.TRUSTED_PROXIES);
  if (entries.length > MAX_TRUSTED_PROXIES) {
    problems.push(`TRUSTED_PROXIES has ${entries.length} entries; at most ${MAX_TRUSTED_PROXIES} are allowed`);
  } else if (entries.length > 0) {
    const bad = entries.filter((e) => !isValidProxyEntry(e));
    for (const e of bad) {
      problems.push(`TRUSTED_PROXIES contains an invalid entry: "${e}" (expected IPv4, IPv6, or CIDR)`);
    }
    if (bad.length === 0) trustedProxies = entries;
  }

  // AGENT_AUTH_MODE
  let agentAuthMode = 'warn';
  const rawMode = env.AGENT_AUTH_MODE;
  if (rawMode === undefined || rawMode === null || rawMode === '') {
    notes.push('AGENT_AUTH_MODE not set: default applied (warn)');
  } else if (AUTH_MODES.includes(rawMode)) {
    agentAuthMode = rawMode;
  } else {
    problems.push(`AGENT_AUTH_MODE has invalid value "${rawMode}"; allowed values: ${AUTH_MODES.join(', ')}`);
  }

  // PASSWORD_ENCRYPTION_KEY (never echoed in messages)
  let encryptionKey = null;
  const rawKey = String(env.PASSWORD_ENCRYPTION_KEY ?? '').trim();
  if (rawKey === '') {
    if (isProduction) {
      problems.push('PASSWORD_ENCRYPTION_KEY is missing or has an invalid length (must decode to exactly 32 bytes)');
    } else {
      encryptionKey = crypto.randomBytes(32);
      warnings.push('PASSWORD_ENCRYPTION_KEY not set: using an ephemeral key; encrypted passwords will be unreadable after restart');
    }
  } else {
    try {
      encryptionKey = parseKey(rawKey);
    } catch {
      if (isProduction) {
        problems.push('PASSWORD_ENCRYPTION_KEY is missing or has an invalid length (must decode to exactly 32 bytes)');
      } else {
        encryptionKey = crypto.randomBytes(32);
        warnings.push('PASSWORD_ENCRYPTION_KEY is invalid (must decode to exactly 32 bytes): using an ephemeral key; encrypted passwords will be unreadable after restart');
      }
    }
  }

  // INTERNAL_SECRET (env only, no fallback)
  const rawSecret = String(env.INTERNAL_SECRET ?? '');
  const internalSecret = rawSecret === '' ? null : rawSecret;
  if (internalSecret === null) {
    notes.push('INTERNAL_SECRET not set: internal secret authentication path is disabled');
  }

  // ALLOW_JSON_FALLBACK: only the exact value '1' enables it in production.
  let allowJsonFallback = true;
  if (isProduction) {
    const rawFallback = env.ALLOW_JSON_FALLBACK;
    allowJsonFallback = rawFallback === '1';
    if (!allowJsonFallback && rawFallback !== undefined && rawFallback !== null && String(rawFallback).trim() !== '') {
      warnings.push('ALLOW_JSON_FALLBACK value ignored: only "1" enables the JSON fallback in production; fallback is disabled');
    }
  }
  const diskPersistenceEnabled = !isProduction || allowJsonFallback;

  // Rate limits: positive integers, defaults from DEFAULT_RATE_LIMITS
  const rateLimits = {};
  for (const [name, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
    const entry = { max: def.max, windowSec: def.windowSec };
    for (const [field, suffix] of [['max', 'MAX'], ['windowSec', 'WINDOW_SEC']]) {
      const varName = `RATE_LIMIT_${name}_${suffix}`;
      const raw = String(env[varName] ?? '').trim();
      if (raw === '') continue;
      if (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) >= 1) {
        entry[field] = Number(raw);
      } else {
        problems.push(`${varName} must be a positive integer (got "${raw}")`);
      }
    }
    rateLimits[name] = Object.freeze(entry);
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return Object.freeze({
    nodeEnv,
    isProduction,
    host,
    port,
    portalBaseUrl,
    corsAllowedOrigins: Object.freeze(corsAllowedOrigins),
    translate,
    trustedProxies: Object.freeze(trustedProxies),
    agentAuthMode,
    encryptionKey,
    internalSecret,
    allowJsonFallback,
    diskPersistenceEnabled,
    rateLimits: Object.freeze(rateLimits),
    warnings: Object.freeze(warnings),
    notes: Object.freeze(notes),
  });
}
