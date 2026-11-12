import crypto from 'node:crypto';
import bcryptjs from 'bcryptjs';
import { sealPassword, openPassword } from './secretCipher.js';

export const BACKUP_CODE_BCRYPT_COST = 10;

/** Seal a TOTP seed for storage (`enc:v1:...`). '' / null / undefined -> ''. */
export function sealTotpSecret(secret, key) {
  return sealPassword(secret, key);
}

/**
 * Open a stored TOTP seed. Legacy plaintext passes through unchanged (it is
 * re-sealed on the next write). Throws CipherError for malformed or
 * tampered `enc:` values; callers must not log the stored value.
 */
export function openTotpSecret(stored, key) {
  return openPassword(stored, key);
}

/** Uppercase and strip everything except A-Z and 0-9, so `abcd-1234` == `ABCD1234`. */
export function normalizeBackupCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Hash each plaintext code (normalized) with bcrypt. Returns an array of `$2...` hashes. */
export function hashBackupCodes(codes, bcrypt = bcryptjs) {
  if (!Array.isArray(codes)) return [];
  return codes.map((c) => bcrypt.hashSync(normalizeBackupCode(c), BACKUP_CODE_BCRYPT_COST));
}

function parseStoredList(storedList) {
  if (Array.isArray(storedList)) return storedList.slice();
  if (typeof storedList === 'string' && storedList.trim() !== '') {
    try {
      const parsed = JSON.parse(storedList);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeEqual(a, b) {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Check a submitted backup code against a stored list (array or JSON string).
 * Entries starting with `$2` are bcrypt hashes; anything else is a legacy
 * plaintext code compared after normalization. A matched entry is removed so
 * each code works once. Returns `{ matched, remaining }`; `remaining` is a new
 * array of stored entries (the input is not mutated).
 */
export function consumeBackupCode(storedList, submitted, bcrypt = bcryptjs) {
  const list = parseStoredList(storedList).filter((e) => typeof e === 'string');
  const clean = normalizeBackupCode(submitted);
  if (!clean) return { matched: false, remaining: list };

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    let hit = false;
    if (entry.startsWith('$2')) {
      try {
        hit = bcrypt.compareSync(clean, entry);
      } catch {
        hit = false;
      }
    } else {
      hit = safeEqual(normalizeBackupCode(entry), clean);
    }
    if (hit) {
      return { matched: true, remaining: list.slice(0, i).concat(list.slice(i + 1)) };
    }
  }
  return { matched: false, remaining: list };
}
