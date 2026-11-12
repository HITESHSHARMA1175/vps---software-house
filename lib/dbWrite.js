// safeWrite: run a MySQL write without ever throwing, and without swallowing the failure silently.
// Logs only the label (table / operation) and the error code. SQL text and parameters are never logged.

export async function safeWrite(label, promiseFactory, log = console.error) {
  try {
    await promiseFactory();
    return true;
  } catch (err) {
    const code = (err && (err.code || err.errno)) || 'UNKNOWN';
    try {
      log(`[DB] write failed table=${String(label)} code=${String(code)}`);
    } catch {
      // a broken logger must not crash the request
    }
    return false;
  }
}
