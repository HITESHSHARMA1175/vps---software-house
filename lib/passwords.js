import crypto from 'node:crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
// Symbols safe for `net user` / cmd / PowerShell quoting (no quotes, %, ^, &, |, <, >, (, ), $, `, \, /, ;, ,, !, space).
const SYMBOLS = '@#*-_+.';
const ALPHABET = UPPER + LOWER + DIGITS + SYMBOLS;

export const MIN_PASSWORD_LENGTH = 16;
export const MAX_PASSWORD_LENGTH = 64;

const DEFAULT_PASSWORDS = new Set(['emp123', 'sales123', 'Admin@12345']);

const pick = (chars) => chars[crypto.randomInt(chars.length)];

/**
 * Generate a random password of 16 to 64 characters with at least one
 * uppercase letter, one lowercase letter and one digit.
 */
export function generatePassword(length = MIN_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password length must be an integer from ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH}`);
  }
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** True when p is one of the known shipped default passwords. */
export function isDefaultPassword(p) {
  return typeof p === 'string' && DEFAULT_PASSWORDS.has(p);
}

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(['password', 'superclientpass', 'agentkey', 'apikey', 'x-agent-key']);
const CIPHERTEXT_TOKEN = /enc:v1:[^\s"',;]*/g;

function redactString(s) {
  return s.replace(CIPHERTEXT_TOKEN, REDACTED);
}

/**
 * Return a deep copy of value with sensitive fields masked and any
 * `enc:v1:` token replaced. Never mutates the input.
 */
export function redact(value, _seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (_seen.has(value)) return '[Circular]';
  _seen.add(value);

  if (value instanceof Error) {
    return { name: value.name, message: redactString(String(value.message)) };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, _seen));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redact(v, _seen);
  }
  return out;
}
