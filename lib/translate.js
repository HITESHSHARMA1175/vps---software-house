// Official Google Cloud Translation (v2) client. Never throws, never logs the API key.

export const TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
export const MAX_TRANSLATE_CHARS = 5000;
export const DEFAULT_TRANSLATE_TIMEOUT_MS = 5000;

function original(text) {
  return typeof text === 'string' ? text : (text === null || text === undefined ? '' : String(text));
}

/**
 * Translate text through the official API.
 * Resolves { translatedText, status } where status is 'ok' | 'disabled' | 'failed' | 'skipped'.
 * On anything other than 'ok', translatedText is the original text unchanged.
 */
export async function translateText({
  text,
  config,
  fetchImpl,
  timeoutMs = DEFAULT_TRANSLATE_TIMEOUT_MS,
  source,
  target = 'en',
  logger = console,
} = {}) {
  const orig = original(text);
  try {
    const tc = config && config.translate;
    const apiKey = tc && typeof tc.apiKey === 'string' ? tc.apiKey : '';
    if (!tc || tc.enabled !== true || !apiKey) {
      return { translatedText: orig, status: 'disabled' };
    }
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TRANSLATE_CHARS) {
      return { translatedText: orig, status: 'skipped' };
    }

    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) throw new Error('fetch unavailable');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = { q: text, target, format: 'text' };
      if (source) body.source = source;
      const res = await doFetch(TRANSLATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res || !res.ok) {
        throw new Error(`provider returned HTTP ${res ? res.status : 'no response'}`);
      }
      const data = await res.json();
      const out = data && data.data && Array.isArray(data.data.translations)
        ? data.data.translations[0] && data.data.translations[0].translatedText
        : undefined;
      if (typeof out !== 'string' || out.length === 0) {
        throw new Error('provider returned no translated text');
      }
      return { translatedText: out, status: 'ok' };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    try {
      let reason = err && err.name === 'AbortError' ? 'timeout' : String((err && err.message) || err);
      const key = config && config.translate && config.translate.apiKey;
      if (key) reason = reason.split(key).join('[redacted]');
      if (logger && typeof logger.warn === 'function') logger.warn(`[translate] failed: ${reason}`);
    } catch { /* logging must never throw */ }
    return { translatedText: orig, status: 'failed' };
  }
}
