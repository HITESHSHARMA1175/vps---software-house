import crypto from 'node:crypto';

const VERSION_PREFIX = 'enc:v1:';
const MARKER = 'enc:';
const AAD = Buffer.from('enc:v1', 'ascii');
const NONCE_LEN = 12;
const TAG_LEN = 16;

export class CipherError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CipherError';
  }
}

/**
 * Parse an encryption key given as 64 hex chars or base64 into exactly 32 bytes.
 * Error messages never include the input.
 */
export function parseKey(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CipherError('Encryption key is missing');
  }
  const s = raw.trim();
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    buf = Buffer.from(s, 'hex');
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0) {
    buf = Buffer.from(s, 'base64');
  }
  if (!buf || buf.length !== 32) {
    throw new CipherError('Encryption key is invalid: it must decode to exactly 32 bytes');
  }
  return buf;
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new CipherError('Encryption key must be a 32-byte Buffer');
  }
}

function b64urlEncode(buf) {
  return buf.toString('base64url');
}

/** Canonical-strict base64url decode: re-encoding must reproduce the input. */
function b64urlDecodeStrict(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new CipherError('Malformed ciphertext');
  const buf = Buffer.from(s, 'base64url');
  if (buf.toString('base64url') !== s) throw new CipherError('Malformed ciphertext');
  return buf;
}

export function isCiphertext(stored) {
  return typeof stored === 'string' && stored.startsWith(VERSION_PREFIX);
}

export function encrypt(plaintext, key) {
  assertKey(key);
  if (typeof plaintext !== 'string') throw new CipherError('Plaintext must be a string');
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LEN });
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + b64urlEncode(Buffer.concat([nonce, tag, data]));
}

/**
 * Values without the `enc:` marker are legacy plaintext and returned unchanged.
 * Values with the marker must be valid `enc:v1:` ciphertext or CipherError is thrown.
 */
export function decrypt(stored, key) {
  if (typeof stored !== 'string') throw new CipherError('Stored value must be a string');
  if (!stored.startsWith(MARKER)) return stored;
  assertKey(key);
  if (!stored.startsWith(VERSION_PREFIX)) throw new CipherError('Unsupported ciphertext version');
  const raw = b64urlDecodeStrict(stored.slice(VERSION_PREFIX.length));
  if (raw.length < NONCE_LEN + TAG_LEN) throw new CipherError('Malformed ciphertext');
  const nonce = raw.subarray(0, NONCE_LEN);
  const tag = raw.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const data = raw.subarray(NONCE_LEN + TAG_LEN);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LEN });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new CipherError('Decryption failed');
  }
}

function envKey(key) {
  return key || parseKey(process.env.PASSWORD_ENCRYPTION_KEY);
}

/** '' stays '' ; otherwise encrypt. Key defaults to PASSWORD_ENCRYPTION_KEY. */
export function sealPassword(plain, key) {
  if (plain === '' || plain === null || plain === undefined) return '';
  return encrypt(String(plain), envKey(key));
}

/** '' -> '' ; legacy plaintext as is ; `enc:` values must decrypt or throw. */
export function openPassword(stored, key) {
  if (stored === '' || stored === null || stored === undefined) return '';
  const s = String(stored);
  if (!s.startsWith(MARKER)) return s;
  return decrypt(s, envKey(key));
}
