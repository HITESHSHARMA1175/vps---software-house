import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toPublicClient, toPublicServer, toPublicJob, toPublicMigration } from '../lib/publicProjections.js';

// Feature: production-hardening, Property 7: Public serializers never expose passwords
// **Validates: Requirements 7.10, 9.5**

const FORBIDDEN = ['password', 'newPassword', 'superClientPass', 'agentKey'];
const STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled', 'expired'];

const secretText = fc.oneof(
  fc.string().map((s) => `enc:v1:${s}`),
  fc.string({ minLength: 1 }),
  fc.constant('')
);
const plainText = fc.string({ maxLength: 20 });

const secretFields = fc.record(
  {
    password: secretText,
    newPassword: secretText,
    superClientPass: secretText,
    agentKey: secretText,
  },
  { requiredKeys: [] }
);

const nested = fc.record({ password: secretText, agentKey: secretText, note: plainText }, { requiredKeys: ['note'] });

const baseObject = fc
  .tuple(
    secretFields,
    fc.record({ id: fc.integer(), name: plainText, status: fc.constantFrom(...STATUSES) }),
    fc.option(nested, { nil: undefined }),
    fc.array(nested, { maxLength: 3 })
  )
  .map(([secrets, base, child, children]) => ({ ...base, ...secrets, ...(child ? { child } : {}), children }));

function walkKeys(value, visit) {
  if (Array.isArray(value)) return value.forEach((v) => walkKeys(v, visit));
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      visit(k);
      walkKeys(value[k], visit);
    }
  }
}

function assertSafe(out) {
  const keys = [];
  walkKeys(out, (k) => keys.push(k));
  for (const f of FORBIDDEN) expect(keys).not.toContain(f);
  expect(JSON.stringify(out)).not.toContain('enc:v1:');
}

describe('Property 7: Public serializers never expose passwords', () => {
  it('strips secrets from clients, servers, jobs (incl. agentKey) and migrations for every status', () => {
    fc.assert(
      fc.property(baseObject, (obj) => {
        for (const fn of [toPublicClient, toPublicServer, toPublicJob, toPublicMigration]) {
          assertSafe(fn(obj));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('toPublicServer never emits apiKey, previousApiKey or previousKeyExpiresAt at any depth', () => {
    const KEYS = ['apiKey', 'previousApiKey', 'previousKeyExpiresAt'];
    const leaf = fc.oneof(fc.string(), fc.integer(), fc.constant(null));
    const tree = fc.letrec((tie) => ({
      node: fc.oneof(
        { depthSize: 'small', withCrossShrink: true },
        leaf,
        fc.array(tie('node'), { maxLength: 3 }),
        fc.dictionary(fc.oneof(fc.constantFrom(...KEYS), fc.constantFrom('name', 'child', 'id')), tie('node'), { maxKeys: 5 })
      ),
    })).node;
    const root = fc.dictionary(fc.oneof(fc.constantFrom(...KEYS), fc.constantFrom('name', 'child', 'list')), tree, { maxKeys: 6 });
    fc.assert(
      fc.property(root, (obj) => {
        const keys = [];
        walkKeys(toPublicServer(obj), (k) => keys.push(k));
        for (const f of KEYS) expect(keys).not.toContain(f);
      }),
      { numRuns: 200 }
    );
  });

  it('preserves non-secret fields', () => {
    fc.assert(
      fc.property(baseObject, (obj) => {
        const out = toPublicJob(obj);
        expect(out.id).toBe(obj.id);
        expect(out.name).toBe(obj.name);
        expect(out.status).toBe(obj.status);
      }),
      { numRuns: 100 }
    );
  });
});
