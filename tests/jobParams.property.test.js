import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateJobParams, JobParamError } from '../lib/jobParams.js';

// Feature: production-hardening, Property 39: Job parameters are rejected or neutralized when they carry injection payloads
// **Validates: Requirements 24.4, 24.5 (hardening addition; propose a new requirement ID in the Change_Report)**

const BASE = 'https://portal.example.com';
const options = { config: { portalBaseUrl: BASE } };

const FRAGMENTS = [
  "'; calc; '", '$(calc)', '`calc`', '\n', '\r\n', '"', '|', '&', '<', '>', ';', "'", '$(Get-Process)', '"; calc; "',
];
const safeChunk = fc.stringMatching(/^[A-Za-z0-9]{0,6}$/);
const payload = fc
  .array(fc.oneof(fc.constantFrom(...FRAGMENTS), safeChunk), { minLength: 1, maxLength: 6 })
  .map((parts) => parts.join(''))
  .filter((s) => /['"`$;|<>\r\n]/.test(s) || /[&]/.test(s) || /[()]/.test(s));

// Characters that must never survive in the returned value, per field.
const COMMON_DANGEROUS = /['"`$;|<>\r\n\u0000]/;
const STRICT_DANGEROUS = /['"`$;|<>&()\r\n\u0000]/;

const run = (params) => {
  try {
    return { ok: true, value: validateJobParams(params, options) };
  } catch (e) {
    expect(e).toBeInstanceOf(JobParamError);
    expect(e.message).toBe('Invalid job parameters');
    return { ok: false };
  }
};

const strictFields = ['username', 'drive', 'targetDrive', 'driveLetter', 'sessionId', 'migrationId', 'sha256', 'agentKey'];
const textFields = ['companyName', 'label'];
const urlFields = ['downloadUrl', 'uploadUrl'];

describe('Property 39: injection payloads are rejected or neutralized', () => {
  it('strict fields never return dangerous characters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...strictFields), payload, (field, p) => {
        const r = run({ [field]: p });
        if (r.ok) expect(String(r.value[field])).not.toMatch(STRICT_DANGEROUS);
      }),
      { numRuns: 200 }
    );
  });

  it('companyName / label never return dangerous characters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...textFields), safeChunk, payload, (field, prefix, p) => {
        const r = run({ [field]: prefix + p });
        if (r.ok) expect(r.value[field]).not.toMatch(COMMON_DANGEROUS);
      }),
      { numRuns: 200 }
    );
  });

  it('URL fields never return dangerous characters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...urlFields), payload, (field, p) => {
        const r = run({ [field]: BASE + '/files/' + p });
        if (r.ok) expect(r.value[field]).not.toMatch(/['"`$;|<>()\s\\]/);
      }),
      { numRuns: 200 }
    );
  });

  it('password rejects NUL / CR / LF and bad lengths; other payload characters are allowed', () => {
    fc.assert(
      fc.property(fc.constantFrom('password', 'newPassword'), payload, (field, p) => {
        const value = 'Ab1' + p;
        const r = run({ [field]: value });
        const bad = /[\u0000\r\n]/.test(value) || value.length < 4 || value.length > 128;
        expect(r.ok).toBe(!bad);
        if (r.ok) expect(r.value[field]).toBe(value);
      }),
      { numRuns: 200 }
    );
  });

  it('valid inputs round trip unchanged', () => {
    const word = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_.]{0,20}$/);
    const hex = fc.stringMatching(/^[0-9a-f]{64}$/);
    const key = fc.stringMatching(/^[A-Za-z0-9_-]{43}$/).map((s) => 'ak_' + s);
    fc.assert(
      fc.property(
        word,
        fc.stringMatching(/^[A-Za-z]:?$/),
        fc.stringMatching(/^[0-9]{1,6}$/),
        fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ._&,-]{0,30}[A-Za-z0-9]$/),
        fc.stringMatching(/^[A-Za-z0-9_-]{1,30}$/),
        hex,
        key,
        fc.stringMatching(/^[A-Za-z0-9/_.-]{0,30}$/),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.stringMatching(/^[\x20-\x7e]{4,128}$/),
        (username, drive, sessionId, company, migrationId, sha256, agentKey, path, num, password) => {
          const input = {
            username, drive, targetDrive: drive, driveLetter: drive, sessionId,
            companyName: company, label: company, migrationId, sha256, agentKey,
            downloadUrl: BASE + '/' + path, uploadUrl: BASE + '/' + path,
            diskNumber: num, sizeGB: num, fileSizeBytes: num,
            password, newPassword: password, extra: 'untouched',
          };
          expect(validateJobParams(input, options)).toEqual(input);
        }
      ),
      { numRuns: 150 }
    );
  });
});
