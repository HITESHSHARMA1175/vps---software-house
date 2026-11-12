// Feature: production-hardening, task 24.3: production never writes database.json
// **Validates: Requirements 11.2, 11.5, 11.6**
import { describe, it, expect } from 'vitest';
import { createDiskPersistence } from '../lib/diskPersistence.js';

const PATH = '/fake/database.json';

function fakeFs(initial) {
  const calls = { read: 0, write: 0, exists: 0 };
  let content = initial;
  return {
    calls,
    get content() { return content; },
    existsSync() { calls.exists++; return content !== undefined; },
    readFileSync() { calls.read++; return content; },
    writeFileSync(_p, data) { calls.write++; content = data; },
  };
}

const payload = () => ({
  servers: [{ id: 1 }], users: [{ username: 'alice' }], requests: [], renewals: [], tickets: [],
  sessions: [], provisionJobs: [{ id: 'j1', agentKey: 'SECRET', password: 'pw' }],
  portalUsers: [{ u: 'a' }], auditLogs: [{ a: 1 }],
});
const seed = JSON.stringify({ servers: [{ id: 9 }], users: [{ username: 'bob' }] });
const mk = (config, fsImpl) => createDiskPersistence({ config, filePath: PATH, fsImpl, log: () => {} });

describe('diskPersistence production guard', () => {
  it('production: save leaves file unchanged and never writes', () => {
    const fs = fakeFs(seed);
    const p = mk({ isProduction: true }, fs);
    expect(p.enabled).toBe(false);
    p.save(payload());
    p.save({});
    expect(fs.calls.write).toBe(0);
    expect(fs.content).toBe(seed);
  });

  it('production: load performs no read and returns defaults', () => {
    const fs = fakeFs(seed);
    const p = mk({ isProduction: true }, fs);
    const d = p.load();
    expect(fs.calls.read).toBe(0);
    expect(fs.calls.exists).toBe(0);
    expect(d.servers).toEqual([]);
  });

  it('production: readLegacyFile still reads and never writes', () => {
    const fs = fakeFs(seed);
    const p = mk({ isProduction: true }, fs);
    const d = p.readLegacyFile();
    expect(fs.calls.read).toBe(1);
    expect(fs.calls.write).toBe(0);
    expect(d.servers).toEqual([{ id: 9 }]);
  });

  it('ALLOW_JSON_FALLBACK: save writes (scrubbed) and load reads', () => {
    const fs = fakeFs(seed);
    const p = mk({ isProduction: true, allowJsonFallback: true }, fs);
    expect(p.enabled).toBe(true);
    p.save(payload());
    expect(fs.calls.write).toBe(1);
    expect(fs.content).not.toBe(seed);
    expect(fs.content).not.toContain('SECRET');
    const d = p.load();
    expect(fs.calls.read).toBe(1);
    expect(d.servers).toEqual([{ id: 1 }]);
  });

  it('non-production: persistence is enabled', () => {
    const fs = fakeFs(undefined);
    const p = mk({ isProduction: false }, fs);
    p.save(payload());
    expect(fs.calls.write).toBe(1);
  });
});
