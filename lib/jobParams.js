/**
 * Job parameter validation for agent jobs (queueServerJob and friends).
 *
 * Jobs are executed by the agent as an administrator, so every field that is
 * copied from a request into a job goes through `validateJobParams` first.
 *
 * PASSWORD NOTE: `password` / `newPassword` may legitimately contain
 * shell-significant characters (' " ` $ ; & |). They are only checked for
 * NUL / CR / LF and length. Consumers MUST pass them to PowerShell or child
 * processes as DATA (parameters, ConvertFrom-Json, -EncodedCommand, stdin,
 * argument arrays), and NEVER string-interpolate them into a command line.
 */

export class JobParamError extends Error {
  constructor() {
    // Generic message on purpose: never echo the rejected input.
    super('Invalid job parameters');
    this.name = 'JobParamError';
    this.statusCode = 400;
  }
}

const fail = () => {
  throw new JobParamError();
};

const isAbsent = (v) => v === undefined || v === null;

const USERNAME_ALLOWED = /^[A-Za-z0-9_.$ -]{1,40}$/;
const DRIVE_RE = /^[A-Za-z]:?$/;
const SESSION_ID_RE = /^\d+$/;
const MIGRATION_ID_RE = /^[A-Za-z0-9_-]+$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const AGENT_KEY_RE = /^ak_[A-Za-z0-9_-]{43}$/;
// Stripped before the allowlist is applied.
// eslint-disable-next-line no-control-regex
const TEXT_STRIP_RE = /[\u0000-\u001f\u007f`$();|<>"']/g;
const TEXT_ALLOWED = /^[A-Za-z0-9 ._&,()-]*$/;

function cleanUsername(value, sanitizeUsername) {
  if (typeof value !== 'string') fail();
  let name = value.trim();
  if (typeof sanitizeUsername === 'function') {
    // Existing server.js rules (system accounts, corrupt names, ...)
    const s = sanitizeUsername(name);
    if (!s) fail();
    name = String(s);
  } else {
    // Same structural rule as sanitizeWindowsUsername: drop a trailing session id.
    name = name.replace(/\s+\d+$/, '').trim();
  }
  if (name.length < 1 || name.length > 40) fail();
  if (name.startsWith('-')) fail();
  if (!USERNAME_ALLOWED.test(name)) fail();
  return name;
}

function cleanText(value) {
  if (typeof value !== 'string') fail();
  const cleaned = value.replace(TEXT_STRIP_RE, '').trim();
  if (cleaned.length > 100) fail();
  if (!TEXT_ALLOWED.test(cleaned)) fail();
  return cleaned;
}

function cleanPassword(value) {
  if (typeof value !== 'string') fail();
  if (value.includes('\u0000') || value.includes('\r') || value.includes('\n')) fail();
  if (value.length < 4 || value.length > 128) fail();
  return value;
}

function cleanUrl(value, config) {
  if (typeof value !== 'string') fail();
  const base = config && typeof config.portalBaseUrl === 'string' ? config.portalBaseUrl.replace(/\/+$/, '') : '';
  if (!base) fail();
  // Shell metacharacters ($ ; | ( )) are rejected too; '&' stays valid in query strings.
  if (/[\s\u0000-\u001f\u007f"'`<>\\$;|()]/.test(value)) fail();
  if (value !== base && !value.startsWith(base + '/')) fail();
  return value;
}

function cleanNumber(value) {
  if (typeof value === 'boolean') fail();
  if (typeof value === 'string' && value.trim() === '') fail();
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail();
  return n;
}

function matchString(value, re) {
  if (typeof value !== 'string' || !re.test(value)) fail();
  return value;
}

/**
 * Validate and clean job params. Returns a new object; unknown fields are
 * passed through untouched. Throws JobParamError (generic message) on failure.
 *
 * @param {object} params
 * @param {{ config?: { portalBaseUrl?: string }, sanitizeUsername?: (s: string) => string|null }} [options]
 */
export function validateJobParams(params, options = {}) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) fail();
  const { config, sanitizeUsername } = options || {};
  const out = { ...params };

  for (const key of Object.keys(out)) {
    const v = out[key];
    switch (key) {
      case 'username':
        if (isAbsent(v) || v === '') break;
        out[key] = cleanUsername(v, sanitizeUsername);
        break;
      case 'drive':
      case 'targetDrive':
      case 'driveLetter':
        if (isAbsent(v) || v === '') break;
        out[key] = matchString(v, DRIVE_RE);
        break;
      case 'sessionId':
        if (isAbsent(v) || v === '') break;
        out[key] = matchString(typeof v === 'number' ? String(v) : v, SESSION_ID_RE);
        break;
      case 'companyName':
      case 'label':
        if (isAbsent(v)) break;
        out[key] = cleanText(v);
        break;
      case 'password':
      case 'newPassword':
        if (isAbsent(v) || v === '') break;
        out[key] = cleanPassword(v);
        break;
      case 'migrationId':
        if (isAbsent(v) || v === '') break;
        out[key] = matchString(v, MIGRATION_ID_RE);
        break;
      case 'downloadUrl':
      case 'uploadUrl':
        if (isAbsent(v) || v === '') break;
        out[key] = cleanUrl(v, config);
        break;
      case 'sha256':
        if (isAbsent(v) || v === '') break;
        out[key] = matchString(v, SHA256_RE);
        break;
      case 'diskNumber':
      case 'sizeGB':
      case 'fileSizeBytes':
        if (isAbsent(v) || v === '') break;
        out[key] = cleanNumber(v);
        break;
      case 'agentKey':
        if (isAbsent(v) || v === '') break;
        out[key] = matchString(v, AGENT_KEY_RE);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Express middleware factory: validates req.body and answers 400 on failure,
 * queueing nothing. Never mount on login or other password routes.
 *
 * @param {{ getConfig?: () => object, config?: object, sanitizeUsername?: Function }} [options]
 */
export function validateJobRequest(options = {}) {
  return (req, res, next) => {
    try {
      const config = typeof options.getConfig === 'function' ? options.getConfig() : options.config;
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      req.body = validateJobParams(body, { config, sanitizeUsername: options.sanitizeUsername });
      return next();
    } catch (err) {
      if (err instanceof JobParamError) {
        return res.status(400).json({ success: false, error: 'Invalid request parameters' });
      }
      return next(err);
    }
  };
}
