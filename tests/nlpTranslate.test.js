// @vitest-environment node
// Validates: Requirements 16.6, 16.7
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { translateHinglishToEnglish } from '../src/utils/nlpTranslate.js';

const okJson = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

describe('translateHinglishToEnglish', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns translated text on ok status and calls only /api/ai/translate', async () => {
    fetch.mockResolvedValue(okJson({ success: true, translatedText: 'Hello', translateStatus: 'ok' }));
    expect(await translateHinglishToEnglish('  namaste  ')).toBe('Hello');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/ai/translate');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ text: 'namaste' });
  });

  it.each(['disabled', 'failed', 'skipped'])('returns original text when status is %s', async (status) => {
    fetch.mockResolvedValue(okJson({ success: false, translatedText: 'X', translateStatus: status }));
    expect(await translateHinglishToEnglish('mera kaam')).toBe('mera kaam');
    expect(fetch.mock.calls.every(([u]) => u === '/api/ai/translate')).toBe(true);
  });

  it('returns original text on non-200 response', async () => {
    fetch.mockResolvedValue(okJson({}, 500));
    expect(await translateHinglishToEnglish('mera kaam')).toBe('mera kaam');
  });

  it('returns original text on network error', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    expect(await translateHinglishToEnglish('mera kaam')).toBe('mera kaam');
  });

  it('returns original text when JSON parsing fails', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad'); } });
    expect(await translateHinglishToEnglish('mera kaam')).toBe('mera kaam');
  });

  it('returns empty string without fetching for empty/non-string input', async () => {
    expect(await translateHinglishToEnglish('   ')).toBe('');
    expect(await translateHinglishToEnglish(null)).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
