// Health endpoint handler factory (Req 22). Pure core: db and timer are injected.
// Body is limited to { status, db }; errors are logged server-side only.

export const HEALTH_DB_TIMEOUT_MS = 2000;

/**
 * @param {object} deps
 * @param {() => ({ query: Function } | null | undefined)} deps.getDb  returns the pool, or null when none is connected
 * @param {{ setTimeout: Function, clearTimeout: Function }} [deps.timer]
 * @param {number} [deps.timeoutMs]
 * @param {{ error: Function }} [deps.logger]
 */
export function createHealthHandler({ getDb, timer = { setTimeout, clearTimeout }, timeoutMs = HEALTH_DB_TIMEOUT_MS, logger = console } = {}) {
  const OK = { status: 'ok', db: 'up' };
  const DOWN = { status: 'degraded', db: 'down' };

  async function checkDb() {
    const db = typeof getDb === 'function' ? getDb() : null;
    if (!db) return false;
    let handle;
    const timeout = new Promise((_, reject) => {
      handle = timer.setTimeout(() => reject(new Error('health db timeout')), timeoutMs);
    });
    try {
      await Promise.race([Promise.resolve().then(() => db.query('SELECT 1')), timeout]);
      return true;
    } catch (err) {
      try { logger.error('[health] database check failed:', err && (err.code || err.message)); } catch { /* ignore */ }
      return false;
    } finally {
      timer.clearTimeout(handle);
    }
  }

  return async function healthHandler(req, res) {
    const up = await checkDb();
    if (up) return res.status(200).json({ ...OK });
    return res.status(503).json({ ...DOWN });
  };
}
