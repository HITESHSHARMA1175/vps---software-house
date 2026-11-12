// Test-only TOTP helpers (RFC 6238, SHA1, 6 digits, 30 s) and database.json seeding for portal users.
import crypto from 'node:crypto';
import fs from 'node:fs';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(str) {
  let bits = 0;
  let val = 0;
  const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Current 6-digit TOTP code for a base32 secret. `stepOffset` shifts by whole 30 s steps. */
export function totpCode(secretBase32, stepOffset = 0, now = Date.now()) {
  const step = Math.floor(now / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secretBase32)).update(buf).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
  return String(bin % 1000000).padStart(6, '0');
}

/** A code that is guaranteed to be wrong for the +-1 step window. */
export function wrongCode(secretBase32) {
  const valid = new Set([-1, 0, 1].map((o) => totpCode(secretBase32, o)));
  for (let i = 0; i < 1000; i++) {
    const c = String(100000 + i);
    if (!valid.has(c)) return c;
  }
  throw new Error('unreachable');
}

/** Writes the portalUsers list into DB_FILE_PATH (a per-test-file temp path) before server.js is imported. */
export function seedPortalUsers(portalUsers) {
  fs.writeFileSync(process.env.DB_FILE_PATH, JSON.stringify({ portalUsers }, null, 2), 'utf8');
}

export function readSeededFile() {
  return JSON.parse(fs.readFileSync(process.env.DB_FILE_PATH, 'utf8'));
}

/** Parses a Set-Cookie header into { name, value, attrs: { lowercaseKey: value|true } }. */
export function parseSetCookie(header) {
  const [pair, ...rest] = header.split(';').map((s) => s.trim());
  const eq = pair.indexOf('=');
  const attrs = {};
  for (const a of rest) {
    const i = a.indexOf('=');
    if (i === -1) attrs[a.toLowerCase()] = true;
    else attrs[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
  }
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs };
}

export function sessionSetCookie(res) {
  const list = res.headers['set-cookie'] || [];
  const found = list.find((c) => c.startsWith('vps_session_id='));
  return found ? parseSetCookie(found) : null;
}
