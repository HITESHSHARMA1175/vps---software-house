import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { translateText, MAX_TRANSLATE_CHARS } from '../lib/translate.js';

// Feature: production-hardening, Property 32: Translation never fails the caller
// **Validates: Requirements 16.2, 16.3, 16.5, 16.8**

const keyArb = fc.stringMatching(/^[A-Za-z0-9_-]{8,24}$/);
const textArb = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.constant(''),
  fc.integer({ min: MAX_TRANSLATE_CHARS + 1, max: MAX_TRANSLATE_CHARS + 50 }).map((n) => 'a'.repeat(n)),
  fc.constant('a'.repeat(MAX_TRANSLATE_CHARS)),
);
const outcomeArb = fc.constantFrom('success', 'timeout', 'status', 'empty', 'throw', 'badjson');

function makeFetch(outcome, calls) {
  return (url, init) => {
    calls.push({ url, init });
    switch (outcome) {
      case 'success':
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { translations: [{ translatedText: 'XLATED' }] } }) });
      case 'status':
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      case 'empty':
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { translations: [{ translatedText: '' }] } }) });
      case 'badjson':
        return Promise.resolve({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
      case 'throw':
        return Promise.reject(new Error('network down'));
      case 'timeout':
        return new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      default:
        throw new Error('unknown');
    }
  };
}

describe('Property 32: Translation never fails the caller', () => {
  it('never throws, calls provider only when eligible, falls back to original text, never logs the key', async () => {
    await fc.assert(
      fc.asyncProperty(
        textArb,
        fc.boolean(),
        fc.oneof(keyArb, fc.constant('')),
        outcomeArb,
        async (text, enabled, apiKey, outcome) => {
          const calls = [];
          const logs = [];
          const logger = { warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), log: (...a) => logs.push(a.join(' ')) };
          const config = { translate: { enabled, apiKey } };
          const result = await translateText({ text, config, fetchImpl: makeFetch(outcome, calls), timeoutMs: 5, logger });

          const eligible = enabled && apiKey !== '' && text.length > 0 && text.length <= MAX_TRANSLATE_CHARS;
          expect(calls.length).toBe(eligible ? 1 : 0);

          if (!enabled || apiKey === '') {
            expect(result).toEqual({ translatedText: text, status: 'disabled' });
          } else if (!eligible) {
            expect(result).toEqual({ translatedText: text, status: 'skipped' });
          } else if (outcome === 'success') {
            expect(result).toEqual({ translatedText: 'XLATED', status: 'ok' });
            expect(calls[0].init.headers['X-goog-api-key']).toBe(apiKey);
          } else {
            expect(result).toEqual({ translatedText: text, status: 'failed' });
          }
          for (const line of logs) expect(line.includes(apiKey) && apiKey !== '').toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('redacts the API key when the provider error message contains it', async () => {
    await fc.assert(
      fc.asyncProperty(keyArb, async (apiKey) => {
        const logs = [];
        const logger = { warn: (m) => logs.push(String(m)) };
        const fetchImpl = () => Promise.reject(new Error(`bad request key=${apiKey}`));
        const r = await translateText({ text: 'hi', config: { translate: { enabled: true, apiKey } }, fetchImpl, logger });
        expect(r).toEqual({ translatedText: 'hi', status: 'failed' });
        for (const l of logs) expect(l.includes(apiKey)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
