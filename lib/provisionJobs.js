// Provision_Job password purge helpers. See design section 7 (Requirement 9).
// The database and timer are injected so the module is testable without MySQL.
//
// deps = {
//   dbPool,            // optional; object with query(sql, params) returning a Promise. Falsy => memory only
//   getJobs,           // () => array   (memoryStore.provisionJobs); or pass `jobs` directly
//   jobs,              // array alternative to getJobs
//   setTimer,          // (fn, ms) => handle   (default: setTimeout)
//   log,               // { error(...), warn(...) } optional (default: console)
//   retryDelayMs,      // default 5000
//   maxRetries         // default 3
// }
import { scrubJobSecrets } from './agentKeyDelivery.js';

export const TERMINAL_STATUSES = Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED']);

const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;

function memoryJobs(deps) {
  if (deps && typeof deps.getJobs === 'function') return deps.getJobs() || [];
  return (deps && deps.jobs) || [];
}

function logger(deps) {
  return (deps && deps.log) || console;
}

function timer(deps) {
  return (deps && deps.setTimer) || ((fn, ms) => {
    const h = setTimeout(fn, ms);
    if (h && typeof h.unref === 'function') h.unref();
    return h;
  });
}

// Idempotent: only touches rows whose password is not already empty.
async function clearPasswordInDb(dbPool, jobId) {
  await dbPool.query(
    "UPDATE `vps_provision_jobs` SET `password` = '' WHERE `id` = ? AND `password` <> ''",
    [jobId]
  );
}

function scheduleClearRetries(deps, jobId) {
  const { dbPool } = deps;
  const delay = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const max = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const setTimer = timer(deps);
  const log = logger(deps);

  const attempt = (n) => {
    setTimer(async () => {
      try {
        await clearPasswordInDb(dbPool, jobId);
      } catch (err) {
        if (n < max) {
          attempt(n + 1);
        } else {
          log.error(`Provision job ${jobId}: password clear failed after ${max} retries: ${err && err.message}`);
        }
      }
    }, delay);
  };
  attempt(1);
}

// Records a terminal status and clears the password (MySQL + memory) in one call.
// Resolves { ok: true } on success, or { ok: false, error } when the password clear
// failed; in that case the terminal status is retained and the clear is retried
// up to 3 times at 5-second intervals in the background.
export async function finishJob(deps, jobId, status, message) {
  const finalStatus = status || 'COMPLETED';
  const finalMessage = message || '';

  // Memory first: status/message set, then secrets scrubbed in the same call (9.3).
  for (const job of memoryJobs(deps)) {
    if (job && job.id === jobId) {
      job.status = finalStatus;
      job.resultMessage = finalMessage;
      scrubJobSecrets(job);
    }
  }

  const dbPool = deps && deps.dbPool;
  if (!dbPool) return { ok: true };

  try {
    await dbPool.query(
      "UPDATE `vps_provision_jobs` SET `status` = ?, `resultMessage` = ?, `password` = '', `updatedAt` = CURRENT_TIMESTAMP WHERE `id` = ?",
      [finalStatus, finalMessage, jobId]
    );
    return { ok: true };
  } catch (clearErr) {
    // Retain the terminal status with a statement that does not touch the password.
    try {
      await dbPool.query(
        'UPDATE `vps_provision_jobs` SET `status` = ?, `resultMessage` = ?, `updatedAt` = CURRENT_TIMESTAMP WHERE `id` = ?',
        [finalStatus, finalMessage, jobId]
      );
    } catch (statusErr) {
      logger(deps).error(`Provision job ${jobId}: status write failed: ${statusErr && statusErr.message}`);
    }
    scheduleClearRetries(deps, jobId);
    return { ok: false, error: clearErr };
  }
}

// Clears passwords of every terminal job in MySQL and memory (boot sweep, 9.4).
// Resolves { ok, memoryCleared, error? }.
export async function sweepTerminalJobs(deps) {
  const terminal = new Set(TERMINAL_STATUSES);
  let memoryCleared = 0;
  for (const job of memoryJobs(deps)) {
    if (job && terminal.has(job.status)) {
      scrubJobSecrets(job);
      memoryCleared++;
    }
  }

  const dbPool = deps && deps.dbPool;
  if (!dbPool) return { ok: true, memoryCleared };

  try {
    await dbPool.query(
      "UPDATE `vps_provision_jobs` SET `password` = '' WHERE `status` IN ('COMPLETED','FAILED','CANCELLED','EXPIRED') AND `password` <> ''"
    );
    return { ok: true, memoryCleared };
  } catch (error) {
    logger(deps).error(`Provision job sweep failed: ${error && error.message}`);
    return { ok: false, memoryCleared, error };
  }
}
