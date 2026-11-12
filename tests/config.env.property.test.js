import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadConfig, ConfigError } from '../lib/config.js';

// Feature: production-hardening, Property 21: Environment validation
// **Validates: Requirements 4.1, 4.8, 7.6, 11.5, 11.6, 12.1, 12.2**

const GOOD_KEY = Buffer.alloc(32, 7).toString('hex');
const prodEnv = (extra = {}) => ({
  NODE_ENV: 'production',
  PORTAL_BASE_URL: 'https://portal.example.com',
  PASSWORD_ENCRYPTION_KEY: GOOD_KEY,
  ...extra,
});

const tryLoad = (env) => {
  try {
    return { config: loadConfig(env) };
  } catch (e) {
    return { err: e };
  }
};

// Strings biased toward the interesting literal values.
const modeArb = fc.oneof(
  fc.constantFrom('warn', 'enforce', '', 'WARN', 'Enforce', ' warn', 'enforce ', 'off', '1'),
  fc.string({ maxLength: 12 })
);

describe('Property 21: Environment validation', () => {
  it('AGENT_AUTH_MODE: accepts only warn, enforce, or empty/unset; otherwise throws naming the value', () => {
    fc.assert(
      fc.property(fc.option(modeArb, { nil: undefined }), (mode) => {
        const env = prodEnv();
        if (mode !== undefined) env.AGENT_AUTH_MODE = mode;
        const { config, err } = tryLoad(env);
        const valid = mode === undefined || mode === '' || mode === 'warn' || mode === 'enforce';
        if (valid) {
          expect(err).toBeUndefined();
          expect(config.agentAuthMode).toBe(mode === 'enforce' ? 'enforce' : 'warn');
        } else {
          expect(err).toBeInstanceOf(ConfigError);
          expect(err.message).toContain(mode);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('ALLOW_JSON_FALLBACK in production: true iff exactly "1"; other non-empty values add a warning', () => {
    const valArb = fc.option(
      fc.oneof(fc.constantFrom('1', '0', '', ' ', 'true', 'yes', ' 1', '1 '), fc.string({ maxLength: 8 })),
      { nil: undefined }
    );
    fc.assert(
      fc.property(valArb, (v) => {
        const env = prodEnv();
        if (v !== undefined) env.ALLOW_JSON_FALLBACK = v;
        const config = loadConfig(env);
        expect(config.allowJsonFallback).toBe(v === '1');
        const warned = config.warnings.some((w) => w.includes('ALLOW_JSON_FALLBACK'));
        const nonEmptyOther = v !== undefined && v !== '1' && v.trim() !== '';
        expect(warned).toBe(nonEmptyOther);
      }),
      { numRuns: 200 }
    );
  });

  it('HOST: empty or unset yields 127.0.0.1', () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, '', ' ', '   '), fc.boolean(), (host, prod) => {
        const env = prod ? prodEnv() : { NODE_ENV: 'development' };
        if (host !== undefined) env.HOST = host;
        expect(loadConfig(env).host).toBe('127.0.0.1');
      }),
      { numRuns: 100 }
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9.]{1,20}$/), (host) => {
        expect(loadConfig(prodEnv({ HOST: host })).host).toBe(host);
      }),
      { numRuns: 100 }
    );
  });

  it('PASSWORD_ENCRYPTION_KEY in production: load fails when missing or not 32 bytes, without echoing it', () => {
    const bytesArb = fc.oneof(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ minLength: 0, maxLength: 70 })
    );
    fc.assert(
      fc.property(fc.option(bytesArb, { nil: undefined }), fc.constantFrom('hex', 'base64'), (bytes, enc) => {
        const env = prodEnv();
        let encoded;
        if (bytes === undefined) delete env.PASSWORD_ENCRYPTION_KEY;
        else {
          encoded = Buffer.from(bytes).toString(enc);
          env.PASSWORD_ENCRYPTION_KEY = encoded;
        }
        const { config, err } = tryLoad(env);
        if (bytes !== undefined && bytes.length === 32) {
          expect(err).toBeUndefined();
          expect(config.encryptionKey.length).toBe(32);
        } else {
          expect(err).toBeInstanceOf(ConfigError);
          expect(err.message).toContain('PASSWORD_ENCRYPTION_KEY');
          if (encoded && encoded.length >= 8) expect(err.message).not.toContain(encoded);
        }
      }),
      { numRuns: 200 }
    );
  });
});
