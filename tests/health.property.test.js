// Feature: production-hardening, Property 34: Health body leaks nothing
// **Validates: Requirements 22.3, 22.4, 22.5**
//
// For any database failure (error text, code, host, credentials, stack, timeout), the health body is
// exactly one of the two fixed shapes and contains no part of the error. Also checks GET /health on the
// real app needs no credentials and returns only the fixed keys.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { createHealthHandler } from '../lib/health.js';
import { getApp } from './helpers/app.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const noopLogger = { error() {} };
const secretArb = fc.stringMatching(/^[A-Za-z0-9._-]{8,24}$/).map((s) => `Sx9-${s}`);
const OK = { status: 'ok', db: 'up' };
const DOWN = { status: 'degraded', db: 'down' };

describe('Property 34: health body leaks nothing', () => {
  it('failing queries yield the fixed degraded body with no error detail', async () => {
    await fc.assert(fc.asyncProperty(secretArb, secretArb, secretArb, async (msg, code, host) => {
      const err = new Error(`connect ECONNREFUSED ${host} user=${msg}`);
      err.code = code;
      err.sqlMessage = msg;
      const handler = createHealthHandler({
        getDb: () => ({ query: async () => { throw err; } }),
        logger: noopLogger,
      });
      const res = fakeRes();
      await handler({}, res);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual(DOWN);
      expect(Object.keys(res.body).sort()).toEqual(['db', 'status']);
      const text = JSON.stringify(res.body);
      for (const s of [msg, code, host]) expect(text).not.toContain(s);
    }), { numRuns: 50 });
  });

  it('timeouts and missing pools yield the same fixed degraded body', async () => {
    const fired = [];
    const timer = {
      setTimeout: (fn) => { fired.push(fn); queueMicrotask(fn); return 1; },
      clearTimeout() {},
    };
    const hang = createHealthHandler({ getDb: () => ({ query: () => new Promise(() => {}) }), timer, logger: noopLogger });
    const none = createHealthHandler({ getDb: () => null, logger: noopLogger });
    for (const h of [hang, none]) {
      const res = fakeRes();
      await h({}, res);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual(DOWN);
    }
  });

  it('successful queries yield only the fixed ok body regardless of query result contents', async () => {
    await fc.assert(fc.asyncProperty(fc.anything(), async (rows) => {
      const handler = createHealthHandler({ getDb: () => ({ query: async () => rows }), logger: noopLogger });
      const res = fakeRes();
      await handler({}, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(OK);
    }), { numRuns: 30 });
  });

  it('GET /health on the real app needs no credentials and exposes only status and db', async () => {
    const app = await getApp();
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toEqual(res.status === 200 ? OK : DOWN);
    expect(Object.keys(res.body).sort()).toEqual(['db', 'status']);
  });
});
