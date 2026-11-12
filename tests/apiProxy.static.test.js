// Static checks for the PHP relay (task 55.3).
// Validates: Requirements 3.9
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const php = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'api_proxy.php'), 'utf8');
// Ignore comment lines so explanatory text cannot trigger or mask assertions.
const code = php
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|#|\*|\/\*)/.test(l))
  .join('\n');

describe('public/api_proxy.php client IP handling', () => {
  it('does not read client-supplied IP headers from $_SERVER', () => {
    expect(code).not.toMatch(/HTTP_X_FORWARDED_FOR/);
    expect(code).not.toMatch(/HTTP_CF_CONNECTING_IP/);
    expect(code).not.toMatch(/HTTP_X_REAL_IP/);
  });

  it('blocks the client IP headers in the pass-through loop', () => {
    const m = code.match(/\$blocked_headers\s*=\s*array\(([^)]*)\)/);
    expect(m).not.toBeNull();
    const list = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    for (const h of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded']) {
      expect(list).toContain(h);
    }
    // Both the getallheaders() loop and the $_SERVER fallback loop use the list.
    expect(code.match(/in_array\(\$lower,\s*\$blocked_headers\)/g)?.length).toBe(2);
  });

  it('derives the client IP from REMOTE_ADDR only', () => {
    expect(code).toMatch(/\$client_ip\s*=\s*\$_SERVER\['REMOTE_ADDR'\]\s*\?\?\s*'127\.0\.0\.1'\s*;/);
    expect(code.match(/\$client_ip\s*=/g)?.length).toBe(1);
  });

  it('sets exactly one X-Forwarded-For and one X-Real-IP from $client_ip', () => {
    const xff = code.match(/\$headers\[\]\s*=\s*"X-Forwarded-For:\s*"\s*\.\s*\$client_ip\s*;/g) || [];
    const xri = code.match(/\$headers\[\]\s*=\s*"X-Real-IP:\s*"\s*\.\s*\$client_ip\s*;/g) || [];
    expect(xff.length).toBe(1);
    expect(xri.length).toBe(1);
    expect((code.match(/X-Forwarded-For:/gi) || []).length).toBe(1);
    expect((code.match(/X-Real-IP:/gi) || []).length).toBe(1);
  });
});
