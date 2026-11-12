// Public projections (Requirements 7.10, 7.14, 9.5): shape objects before they leave the portal.
// Managed passwords, the plaintext agent key carried by SET_AGENT_KEY jobs, and any `enc:v1:` text never appear in
// responses. Every other field is preserved unchanged.

const SECRET_KEYS = new Set(['password', 'newPassword', 'superClientPass', 'agentKey', 'previousApiKey', 'previousKeyExpiresAt']);
const CIPHER_MARK = 'enc:v1:';

function isPlainish(v) {
  if (v === null || typeof v !== 'object') return false;
  if (v instanceof Date || Buffer.isBuffer(v)) return false;
  return true;
}

function hasCipherText(v) {
  return typeof v === 'string' && v.includes(CIPHER_MARK);
}

function clean(value, seen) {
  if (Array.isArray(value)) {
    return value.filter((item) => !hasCipherText(item)).map((item) => (isPlainish(item) ? clean(item, seen) : item));
  }
  if (!isPlainish(value)) return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const out = {};
  for (const key of Object.keys(value)) {
    if (SECRET_KEYS.has(key)) continue;
    const v = value[key];
    if (hasCipherText(v)) continue;
    out[key] = isPlainish(v) ? clean(v, seen) : v;
  }
  seen.delete(value);
  return out;
}

function project(obj) {
  if (obj === null || obj === undefined) return obj;
  if (!isPlainish(obj)) return obj;
  return clean(obj, new WeakSet());
}

export const toPublicClient = project;
export const toPublicServer = project;
export const toPublicJob = project;
export const toPublicMigration = project;

const EMPLOYEE_FIELDS = ['id', 'name', 'username', 'role', 'status', 'email', 'two_factor_enabled', 'lastLogin', 'createdAt'];

// Allowlist: TOTP secrets, backup codes and password hashes can never leak through this projection.
export function toPublicEmployee(emp) {
  if (!emp || typeof emp !== 'object') return emp;
  const out = {};
  for (const f of EMPLOYEE_FIELDS) {
    if (emp[f] !== undefined) out[f] = emp[f];
  }
  return out;
}

export function toPublicList(list, fn) {
  return Array.isArray(list) ? list.map((item) => fn(item)) : list;
}
