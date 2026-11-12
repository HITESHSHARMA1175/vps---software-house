// Production guard for database.json. See design section 20.1.
// Disabled in production unless ALLOW_JSON_FALLBACK=1: load() and save() never touch the file.
// readLegacyFile() is the only read in that mode (one-time legacy import) and never writes.
import nodeFs from 'node:fs';
import { scrubJobSecrets } from './agentKeyDelivery.js';

const JUNK_USERNAMES = ['newds', 'kkjhjmhgvhb', 'juist chill', 'mann', 'administrator', 'guest', 'defaultaccount', 'wdagutilityaccount'];
const JUNK_COMPANIES = ['mann pvt ltd', 'mann gupta', 'cheetah', 'sadsadaedsd'];
const JUNK_REQUEST_USERNAMES = ['newds', 'kkjhjmhgvhb', 'juist chill', 'mann'];

const ARRAY_KEYS = [
  'servers', 'users', 'requests', 'renewals', 'tickets', 'sessions', 'inactivityTracker',
  'sessionEvents', 'dailyUserActivity', 'monitoringAlerts', 'provisionJobs',
  'duplicateLoginEvents', 'migrations', 'deletedServers', 'hardwareHistory'
];

const arr = (v) => (Array.isArray(v) ? v : []);
const nonEmptyArr = (v, fallback) => (Array.isArray(v) && v.length > 0 ? v : fallback);

function isCleanUser(u) {
  return !!(
    u && u.username &&
    typeof u.username === 'string' &&
    !u.username.includes(' ') &&
    /^[a-zA-Z0-9_\-\.\$]+$/.test(u.username.trim()) &&
    !JUNK_USERNAMES.includes(u.username.toLowerCase().trim()) &&
    !JUNK_COMPANIES.includes(u.company?.toLowerCase()?.trim())
  );
}

function isCleanRequest(r) {
  return !JUNK_REQUEST_USERNAMES.includes(r?.username?.toLowerCase());
}

// options.defaults: { portalUsers, auditLogs } used when the file has none (server.js defaults).
export function createDiskPersistence({ config = {}, filePath, fsImpl = nodeFs, log = console.log, defaults = {} } = {}) {
  const enabled = !(config.isProduction && !config.allowJsonFallback);
  const defaultPortalUsers = defaults.portalUsers || [];
  const defaultAuditLogs = defaults.auditLogs || [];

  log(enabled
    ? 'Disk persistence: ENABLED (JSON fallback)'
    : 'Disk persistence: DISABLED (production, MySQL is the only store)');

  function emptyDefaults() {
    const out = {};
    for (const k of ARRAY_KEYS) out[k] = [];
    out.portalUsers = defaultPortalUsers;
    out.auditLogs = defaultAuditLogs;
    return out;
  }

  // Reads and normalizes the file. Returns null when the file is missing or unreadable.
  function readFile() {
    try {
      if (!fsImpl.existsSync(filePath)) return null;
      const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      const out = {};
      for (const k of ARRAY_KEYS) out[k] = arr(parsed[k]);
      out.users = out.users.filter(isCleanUser);
      out.requests = out.requests.filter(isCleanRequest);
      out.portalUsers = nonEmptyArr(parsed.portalUsers, defaultPortalUsers);
      out.auditLogs = nonEmptyArr(parsed.auditLogs, defaultAuditLogs);
      return out;
    } catch (e) {
      log(`Error reading database.json file: ${e.message}`);
      return null;
    }
  }

  function load() {
    if (!enabled) return emptyDefaults();
    return readFile() || emptyDefaults();
  }

  function save(payload) {
    if (!enabled) return;
    try {
      const toWrite = { ...payload };
      if (Array.isArray(toWrite.provisionJobs)) {
        // Copy each job so in-memory secrets (needed for delivery) are untouched.
        toWrite.provisionJobs = toWrite.provisionJobs.map((j) =>
          (j && typeof j === 'object' ? scrubJobSecrets({ ...j }) : j));
      }
      fsImpl.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf8');
    } catch (e) {
      log(`Error writing database.json file: ${e.message}`);
    }
  }

  // Explicit read for the one-time legacy import; works in every mode and never writes.
  function readLegacyFile() {
    return readFile() || emptyDefaults();
  }

  return { enabled, load, save, readLegacyFile };
}
