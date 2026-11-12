// Feature: production-hardening, Property 27: Terminal jobs hold no password
// **Validates: Requirements 9.1, 9.2, 9.3, 9.7**
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { finishJob, TERMINAL_STATUSES } from '../lib/provisionJobs.js';

const statusArb = fc.constantFrom(...TERMINAL_STATUSES);
const passwordArb = fc.string({ minLength: 0, maxLength: 40 });
const messageArb = fc.string({ maxLength: 60 });

// Fake DB holding one row. `failClears` makes any statement that sets password='' reject.
function makeDb(row, { failClears = false } = {}) {
  return {
    async query(sql) {
      const clears = sql.includes("`password` = ''");
      if (clears && failClears) throw new Error('clear failed');
      if (sql.startsWith('UPDATE') && sql.includes('`status` = ?')) {
        const params = arguments[1];
        row.status = params[0];
        row.resultMessage = params[1];
        if (clears) row.password = '';
      } else if (clears) {
        row.password = '';
      }
      return [{ affectedRows: 1 }];
    },
  };
}

describe('Property 27: terminal jobs hold no password', () => {
  it('finishJob leaves the terminal status and an empty password in MySQL and memory', async () => {
    await fc.assert(
      fc.asyncProperty(statusArb, passwordArb, messageArb, async (status, password, message) => {
        const row = { id: 'j1', status: 'RUNNING', password };
        const mem = { id: 'j1', status: 'RUNNING', password };
        const other = { id: 'j2', status: 'RUNNING', password: 'keep' };
        const res = await finishJob({ dbPool: makeDb(row), jobs: [mem, other] }, 'j1', status, message);
        expect(res.ok).toBe(true);
        expect(row.status).toBe(status);
        expect(row.password).toBe('');
        expect(mem.status).toBe(status);
        expect(mem.password).toBe('');
        expect(other.password).toBe('keep');
        // idempotent
        const again = await finishJob({ dbPool: makeDb(row), jobs: [mem] }, 'j1', status, message);
        expect(again.ok).toBe(true);
        expect(row.password).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  it('on clear failure keeps the terminal status, wipes memory, and retries up to 3 times at 5s', async () => {
    await fc.assert(
      fc.asyncProperty(statusArb, fc.string({ minLength: 1, maxLength: 40 }), async (status, password) => {
        const row = { id: 'j1', status: 'RUNNING', password };
        const mem = { id: 'j1', status: 'RUNNING', password };
        const timers = [];
        const errors = [];
        const db = makeDb(row, { failClears: true });
        const deps = {
          dbPool: db,
          jobs: [mem],
          setTimer: (fn, ms) => timers.push({ fn, ms }),
          log: { error: (m) => errors.push(m), warn: () => {} },
        };
        const res = await finishJob(deps, 'j1', status, 'm');
        expect(res.ok).toBe(false);
        expect(row.status).toBe(status);
        expect(mem.password).toBe('');
        // Drain retries: exactly 3 attempts, each scheduled 5000ms apart.
        let attempts = 0;
        while (timers.length) {
          const t = timers.shift();
          expect(t.ms).toBe(5000);
          attempts++;
          await t.fn();
        }
        expect(attempts).toBe(3);
        expect(errors.length).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});
