// TLS and connect-timeout settings for MySQL connections (managed databases such as Aiven).
// Errors name the offending variable but never include the CA text or its value.
import fs from 'node:fs';

const PEM_MARKER = '-----BEGIN CERTIFICATE-----';
const DEFAULT_TIMEOUT_MS = 10000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** True when the value looks like a PEM certificate. */
export function looksLikePemCertificate(value) {
  return typeof value === 'string' && value.includes(PEM_MARKER) && value.includes('-----END CERTIFICATE-----');
}

function configError(variable, problem) {
  const err = new Error(`${variable} ${problem}`);
  err.code = 'DB_SSL_CONFIG';
  err.variable = variable;
  return err;
}

function sslFlag(env) {
  const raw = text(env.DB_SSL).toLowerCase();
  if (raw === '' || raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true' || raw === 'required') return true;
  throw configError('DB_SSL', 'must be one of 1, true, required, 0, false (or empty)');
}

function readCa(env) {
  if (text(env.DB_SSL_CA) !== '') {
    return { name: 'DB_SSL_CA', pem: String(env.DB_SSL_CA).trim().replace(/\\n/g, '\n') };
  }
  if (text(env.DB_SSL_CA_BASE64) !== '') {
    const pem = Buffer.from(text(env.DB_SSL_CA_BASE64), 'base64').toString('utf8');
    return { name: 'DB_SSL_CA_BASE64', pem };
  }
  if (text(env.DB_SSL_CA_FILE) !== '') {
    try {
      return { name: 'DB_SSL_CA_FILE', pem: fs.readFileSync(text(env.DB_SSL_CA_FILE), 'utf8') };
    } catch {
      throw configError('DB_SSL_CA_FILE', 'could not be read');
    }
  }
  return null;
}

/**
 * Returns `undefined` when TLS is off, else `{ ca, rejectUnauthorized: true }`.
 * Throws a config error naming the variable when the settings are invalid.
 */
export function buildMysqlSsl(env = process.env) {
  const flag = sslFlag(env);
  const ca = readCa(env);
  if (!flag && !ca) return undefined;
  if (!ca) throw configError('DB_SSL', 'is on but no CA was given: set DB_SSL_CA, DB_SSL_CA_BASE64 or DB_SSL_CA_FILE');
  if (!looksLikePemCertificate(ca.pem)) throw configError(ca.name, 'is not a PEM certificate');
  return { ca: ca.pem, rejectUnauthorized: true };
}

/** DB_CONNECT_TIMEOUT_MS as an integer in 1000..120000 (default 10000). */
export function connectTimeoutMs(env = process.env) {
  const raw = text(env.DB_CONNECT_TIMEOUT_MS);
  if (raw === '') return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || n < MIN_TIMEOUT_MS || n > MAX_TIMEOUT_MS) {
    throw configError('DB_CONNECT_TIMEOUT_MS', `must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`);
  }
  return n;
}
