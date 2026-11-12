// Feature: production-hardening, Property 28: Boot sweep clears only terminal jobs
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sweepTerminalJobs, TERMINAL_STATUSES } from '../lib/provisionJobs.js';

const ALL_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'];
const TERMINAL = new Set(TERMINAL_STATUSES);

const jobArb = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom(...ALL_STATUSES),
  password: fc.string({ maxLength: 12 }),
  agentKey: fc.string({ maxLength: 12 }),
});
const jobsArb = fc.array(jobArb, { maxLength: 20 });

// In-memory stand-in for the vps_provision_jobs table; interprets the sweep's UPDATE.
function fakePool(rows, { failing = false } = {}) {
  return {
    async query(sql) {
      if (failing) throw new Error('db down');
      const m = /`status` IN \(([^)]*)\)/.exec(sql);
      const statuses = new Set(m[1].split(',').map((s) => s.trim().replace(/'/g, '')));
      for (const r of rows) {
        if (statuses.has(r.status) && r.password !== '') r.password = '';
      }
      return [{}];
    },
  };
}

const clone = (a) => a.map((j) => ({ ...j }));

describe('Property 28: Boot sweep clears only terminal jobs', () => {
  /**
   * **Validates: Requirements 9.4**
   */
  it('clears passwords of terminal jobs in MySQL and memory, leaves non-terminal jobs untouched', async () => {
    await fc.assert(
      fc.asyncProperty(jobsArb, async (jobs) => {
        const mem = clone(jobs);
        const db = clone(jobs);
        const res = await sweepTerminalJobs({ dbPool: fakePool(db), jobs: mem });
        expect(res.ok).toBe(true);
        expect(res.memoryCleared).toBe(jobs.filter((j) => TERMINAL.has(j.status)).length);
        for (const store of [mem, db]) {
          store.forEach((j, i) => {
            if (TERMINAL.has(j.status)) {
              expect(j.password).toBe('');
            } else {
              expect(j.password).toBe(jobs[i].password);
            }
            expect(j.status).toBe(jobs[i].status);
          });
        }
        mem.forEach((j, i) => {
          if (TERMINAL.has(j.status)) expect(j.agentKey).toBe('');
          else expect(j.agentKey).toBe(jobs[i].agentKey);
        });
      }),
      { numRuns: 100 }
    );
  });

  it('is idempotent and works memory-only without a database', async () => {
    await fc.assert(
      fc.asyncProperty(jobsArb, async (jobs) => {
        const mem = clone(jobs);
        await sweepTerminalJobs({ jobs: mem });
        const once = clone(mem);
        const res = await sweepTerminalJobs({ jobs: mem });
        expect(res.ok).toBe(true);
        expect(mem).toEqual(once);
      }),
      { numRuns: 100 }
    );
  });

  it('reports a database failure but still clears memory', async () => {
    await fc.assert(
      fc.asyncProperty(jobsArb, async (jobs) => {
        const mem = clone(jobs);
        const errors = [];
        const res = await sweepTerminalJobs({
          dbPool: fakePool([], { failing: true }),
          jobs: mem,
          log: { error: (m) => errors.push(m), warn() {} },
        });
        expect(res.ok).toBe(false);
        expect(errors.length).toBe(1);
        mem.forEach((j) => {
          if (TERMINAL.has(j.status)) expect(j.password).toBe('');
        });
      }),
      { numRuns: 100 }
    );
  });
});
