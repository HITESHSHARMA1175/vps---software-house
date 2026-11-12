/**
 * Builds a limiter key: `${name}:${ip}` or `${name}:${ip}:${identifier}`.
 * The identifier is trimmed and lowercased so case variants share a bucket.
 */
export function rateLimitKey(name, ip, identifier) {
  const base = `${name}:${ip ?? 'unknown'}`;
  if (identifier === undefined || identifier === null || String(identifier).trim() === '') return base;
  return `${base}:${String(identifier).trim().toLowerCase()}`;
}

/**
 * Rate limit helper with an injected limiter (Requirements 17.1-17.5).
 *
 * applyRateLimit awaits the injected `checkRateLimit`, then:
 *  - limit exceeded      -> 429 { success:false, error, retryAfterSeconds }, returns false
 *  - limiter throws      -> logs once; production: 429, returns false;
 *                           otherwise the request is allowed, returns true
 *  - otherwise           -> returns true (nothing written to `res`)
 *
 * Callers must stop processing when it resolves to false.
 */
export async function applyRateLimit(res, type, key, max, windowMs, deps = {}) {
  const { checkRateLimit, isProduction = false, logger = console } = deps;

  let rate;
  try {
    rate = await checkRateLimit(type, key, max, windowMs);
  } catch (e) {
    // Logged exactly once per failed request.
    logger.error('rate limit error:', e && e.message ? e.message : e);
    if (isProduction) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfterSeconds: 60,
      });
      return false;
    }
    return true;
  }

  if (!rate || !rate.allowed) {
    const secs = Number(rate && rate.retryAfterSeconds);
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: Number.isFinite(secs) && secs > 0 ? Math.ceil(secs) : 1,
    });
    return false;
  }
  return true;
}
