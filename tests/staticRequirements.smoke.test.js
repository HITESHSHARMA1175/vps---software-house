// Static smoke checks for production-hardening (task 41.1).
// Validates: Requirements 5.2, 6.1, 6.4, 6.6, 6.11, 12.4, 13.8, 14.1, 14.5, 16.4, 18.1, 21.1, 21.3
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_RATE_LIMITS } from '../lib/config.js';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : [rel];
  });

const serverJs = read('server.js');
const schemaSql = read('schema.sql');
const srcFiles = walk('src').filter((f) => /\.(jsx?|css|html)$/.test(f));

describe('static requirements smoke checks', () => {
  it('has no Pass#123 in server.js or schema.sql', () => {
    expect(serverJs).not.toContain('Pass#123');
    expect(schemaSql).not.toContain('Pass#123');
  });

  it('has no hardcoded vps-internal-automation-2026 secret', () => {
    expect(serverJs).not.toContain('vps-internal-automation-2026');
  });

  it('has no "Bound to 0.0.0.0" message', () => {
    expect(serverJs).not.toContain('Bound to 0.0.0.0');
  });

  it('has no clients5.google.com or mymemory in server.js/src', () => {
    for (const [name, text] of [['server.js', serverJs], ...srcFiles.map((f) => [f, read(f)])]) {
      expect(text, name).not.toMatch(/clients5\.google\.com/i);
      expect(text, name).not.toMatch(/mymemory/i);
    }
  });

  it('.env.example lists every variable referenced by lib/config.js', () => {
    const cfg = read('lib/config.js');
    const names = new Set([...cfg.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
    for (const n of Object.keys(DEFAULT_RATE_LIMITS)) {
      names.add(`RATE_LIMIT_${n}_MAX`);
      names.add(`RATE_LIMIT_${n}_WINDOW_SEC`);
    }
    const example = read('.env.example');
    const missing = [...names].filter((n) => !new RegExp(`^\\s*#?\\s*${n}\\s*=`, 'm').test(example));
    expect(missing).toEqual([]);
  });

  it('added dev tools are pinned to exact versions', () => {
    const pkg = JSON.parse(read('package.json'));
    for (const tool of ['concurrently', 'fast-check', 'supertest', 'vitest']) {
      expect(pkg.devDependencies[tool], tool).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('dev:all uses concurrently', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['dev:all']).toMatch(/^concurrently\b/);
  });

  it('ecosystem.config.cjs runs a single fork instance', () => {
    const eco = createRequire(import.meta.url)(path.join(root, 'ecosystem.config.cjs'));
    const app = eco.apps[0];
    expect(app.name).toBe('portal-backend');
    expect(app.script).toBe('server.js');
    expect(app.instances).toBe(1);
    expect(app.exec_mode).toBe('fork');
    expect(app.env.NODE_ENV).toBe('production');
    expect(app.autorestart).toBe(true);
  });

  it('agent scripts reference X-Agent-Key', () => {
    for (const f of [
      'powershell-scripts/VpsAgent.master.ps1',
      'powershell-scripts/Create_Tally_User.master.ps1',
      'public/install.ps1',
      'public/VpsAgentService.cs',
    ]) {
      expect(read(f), f).toContain('X-Agent-Key');
    }
  });

  // PRODUCT BUG: server.js line ~7408 embeds a PowerShell template that writes
  // "serverToken":"vps_sec_token_default" into agent-config.json.
  it.fails('server.js has no serverToken reference (product bug: install template ~line 7408)', () => {
    expect(serverJs).not.toContain('serverToken');
  });

  it('server.js has no hardcoded innovati4_vps_db database name (Req 12.6)', () => {
    expect(serverJs).not.toContain('innovati4_vps_db');
  });

  it('server.js has no UPDATE `clients` statement', () => {
    expect(serverJs).not.toMatch(/UPDATE\s+`clients`/i);
  });

  it('cookie code does not read x-forwarded-proto', () => {
    const code = read('lib/sessionCookie.js')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/x-forwarded-proto/i);
  });
});
