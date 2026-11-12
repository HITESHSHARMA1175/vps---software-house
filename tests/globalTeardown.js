// Vitest globalSetup (Req 18.7): hash the real database.json before the run and verify it is
// byte-for-byte identical afterwards, whether tests passed or failed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL_DB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database.json');

function sha256OrNull() {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(REAL_DB)).digest('hex');
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
}

let before;

export function setup() {
  before = sha256OrNull();
}

export function teardown() {
  const after = sha256OrNull();
  if (after !== before) {
    // Throwing here makes the vitest process exit non-zero.
    throw new Error(`database.json changed during the test run (sha256 before=${before}, after=${after})`);
  }
}
