# Implementation Plan: Production Hardening

## Overview

The design uses JavaScript (ESM, Node.js) for all backend code, so no language question applies. Work follows the required phase order: (1) agent authentication, (2) secrets and passwords, (3) data storage, (4) infrastructure fixes, (5) tests, (6) operations.

Ground rules that apply to every task:

- Each task changes at most 5 files (generated files and lock files excluded) (Requirement 24.2).
- Each task ends with a Change_Report: the files changed (path and added/modified/deleted) and at least one verification step with its expected result (Requirement 24.3). The Change_Report line in each task lists the expected files and the verification.
- API response field names, types, and structure consumed by the frontend stay identical unless the frontend is updated in the same task (Requirement 24.4).
- Leave unrelated files and code blocks untouched (Requirement 24.5).
- Destructive actions (dropping columns, deleting rows or files, running data migrations) need explicit user approval first. Tasks that touch such actions carry an "ASK FIRST" note. If the user declines, leave the target unchanged and mark the task blocked in the Change_Report (Requirement 24.6, 24.7).
- Pure logic lives in `lib/*.js` so property tests do not need MySQL or a running server. Property tests that need `server.js` and the full harness are in Phase 5.
- Property tests use fast-check with at least 100 runs and carry the tag comment `// Feature: production-hardening, Property <n>: <title>`.

## Tasks

### Phase 1: Agent authentication

- [x] 1. Add the test tooling needed by later tasks
  - [x] 1.1 Install Vitest, Supertest, and fast-check and add a minimal runner config
    - Add `vitest`, `supertest`, `fast-check` to `devDependencies` pinned to exact versions (`npm install --save-exact -D`)
    - Add `"test": "vitest run"` to `package.json` scripts
    - Create `vitest.config.js` (node environment, `tests/**/*.test.js`, `setupFiles: ['tests/setup.js']`)
    - Create a minimal `tests/setup.js` that sets `TEST_MODE=1`, `NODE_ENV=test`, a fixed test `PASSWORD_ENCRYPTION_KEY`, and `INTERNAL_SECRET` (the full harness is task 35)
    - _Requirements: 18.1, 18.2, 18.6_
    - Change_Report: `package.json` (modified), `vitest.config.js` (added), `tests/setup.js` (added). Verify: `npm test` runs once, finds no tests or passes, and exits (code 0 with `--passWithNoTests` if needed).

- [x] 2. Configuration foundation
  - [x] 2.1 Create `lib/config.js` with the Phase 1 settings
    - Implement `loadConfig(env)` returning a frozen object and `ConfigError { problems }` that collects every problem before throwing
    - Cover `nodeEnv`/`isProduction`, `port`, `trustedProxies` (comma list, trim, drop empties, max 50, validate IPv4/IPv6/CIDR with `net`), and `agentAuthMode` (`warn`/`enforce` exact; unset/empty defaults to `warn` and records a "default applied" note; invalid non-empty value is a problem)
    - Add the new variables with placeholders to `.env.example`
    - _Requirements: 3.1, 3.7, 3.8, 4.1, 4.6, 4.8, 6.11_
    - Change_Report: `lib/config.js` (added), `.env.example` (modified). Verify: calling `loadConfig` with `AGENT_AUTH_MODE=bogus` throws naming the value; with `TRUSTED_PROXIES=10.0.0.0/8,notanip` throws naming `notanip`.

  - [x] 2.2 Load config at the top of `server.js`
    - Import `loadConfig`; on `ConfigError`, log each problem (never secret values) and `process.exit(1)`
    - Log the active Agent_Auth_Mode and any "default applied" note at startup
    - Keep every other line of `server.js` unchanged
    - _Requirements: 4.1, 4.6, 4.8_
    - Change_Report: `server.js` (modified). Verify: `AGENT_AUTH_MODE=bogus node server.js` exits non-zero before listening; unset prints the active mode `warn`.

- [x] 3. Trusted proxy client IP
  - [x] 3.1 Create `lib/clientIp.js`
    - Implement `parseTrustedProxies` (wrapping `net.BlockList` with `check(ip)`), `normalizeIp` (strip port, brackets, `::ffff:`), and `deriveClientIp({ socketAddress, headers, trusted })` per the design algorithm (untrusted peer ignores headers; trusted peer takes the right-most non-trusted address; fall back to the socket address)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_
    - Change_Report: `lib/clientIp.js` (added). Verify: a quick Node REPL call shows an untrusted socket with a spoofed `x-forwarded-for` returns the socket address.

  - [x] 3.2 Write property test for trusted proxy list parsing
    - **Property 13: Trusted proxy list parsing**
    - **Validates: Requirements 3.1, 3.8**
    - Change_Report: `tests/clientIp.parse.property.test.js` (added). Verify: `npx vitest run tests/clientIp.parse.property.test.js` passes with 100+ runs.

  - [x] 3.3 Write property test that untrusted peers cannot spoof the client IP
    - **Property 14: Untrusted peers cannot spoof the client IP**
    - **Validates: Requirements 3.2, 3.6**
    - Change_Report: `tests/clientIp.untrusted.property.test.js` (added). Verify: the test passes.

  - [x] 3.4 Write property test for right-most non-trusted address selection
    - **Property 15: Trusted peers yield the right-most non-trusted address**
    - **Validates: Requirements 3.3, 3.4**
    - Change_Report: `tests/clientIp.trusted.property.test.js` (added). Verify: the test passes.

  - [x] 3.5 Wire the client IP middleware into `server.js`
    - Replace `app.set('trust proxy', 1)` with the function form driven by `config.trustedProxies`
    - Add `app.use` middleware that sets `req.clientIp` via `deriveClientIp`
    - Replace each inline IP expression (around lines 141, 1601, 1711, 2864, 3585, 6520, 6538, 6854) with `req.clientIp`; use it for rate limiting, `logAudit`, and agent source checks
    - _Requirements: 3.5, 3.6, 24.4_
    - Change_Report: `server.js` (modified). Verify: with `TRUSTED_PROXIES` unset, a request carrying `x-forwarded-for: 1.2.3.4` from localhost is attributed to 127.0.0.1, and a request from a configured proxy address uses the forwarded address in the audit log. Existing login still works.

- [x] 4. Agent authentication core
  - [x] 4.1 Create `lib/agentAuth.js`
    - `generateAgentKey()` (`'ak_' + base64url(randomBytes(32))`), `hashAgentKey` (hex SHA-256), `verifyAgentKey` (digest compare with `timingSafeEqual`)
    - `decideAgentAuth({ mode, serverFound, storedHash, submittedKey })` implementing the full decision table, returning `{ action, keyValid }`
    - `findServerForKeyCheck(servers, ref)` matching only exact `id` or `ipPort`; ambiguous bare-IP reference returns not found
    - Warning throttle (10-minute window per serverId), a `rotateAgentKey` pure helper (store injected; old hash retained on store failure), and an Express middleware factory taking injected `getServers`, `audit`, `config`, and `keyStatus` map; reject body is one fixed 401 JSON
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.10, 1.11, 2.1, 2.4, 2.6, 4.2, 4.3, 4.4, 4.5, 4.7_
    - Change_Report: `lib/agentAuth.js` (added). Verify: Node REPL shows a generated key is 46 chars starting `ak_` and `verifyAgentKey(key, hashAgentKey(key))` is true.

  - [x] 4.2 Write property test for key generation and verification
    - **Property 18: Agent key generation and verification**
    - **Validates: Requirements 1.2, 1.6, 1.7**
    - Change_Report: `tests/agentAuth.keys.property.test.js` (added). Verify: passes.

  - [x] 4.3 Write property test for the authentication decision table
    - **Property 16: Agent authentication decision table**
    - **Validates: Requirements 1.1, 1.3, 1.11, 4.2, 4.4, 4.5**
    - Change_Report: `tests/agentAuth.decision.property.test.js` (added). Verify: passes.

  - [x] 4.4 Write property test for the warning throttle
    - **Property 20: Warning throttle**
    - **Validates: Requirements 4.3**
    - Change_Report: `tests/agentAuth.throttle.property.test.js` (added). Verify: passes.

  - [x] 4.5 Write property test that key lookup never crosses servers
    - **Property 35: Agent key lookup never crosses servers**
    - **Validates: Requirements 1.1, 1.4**
    - Change_Report: `tests/agentAuth.lookup.property.test.js` (added). Verify: passes.

- [x] 5. Server-side agent authentication integration
  - [x] 5.1 Widen `vps_servers.apiKey`
    - Change `apiKey` to `VARCHAR(255)` in `schema.sql`
    - Add a repeat-safe `ALTER TABLE vps_servers MODIFY COLUMN apiKey VARCHAR(255)` to `initMySQLDatabase`
    - No column or row is dropped
    - _Requirements: 1.8, 24.6_
    - Change_Report: `schema.sql` (modified), `server.js` (modified). Verify: run init twice against a test MySQL; values in existing rows are unchanged and no error occurs.

  - [x] 5.2 Mount agent authentication on the Agent_Endpoints
    - Add `resolveAgentServer(req)` with the per-endpoint rule table (body `serverId`, query/header `serverId`, migration source/target via `migrationId`, key-hash lookup for `detect-server` and `my-ip`)
    - Mount the middleware only on the ten Glossary endpoints after `express.json()`; set `req.agentServer`; write `AGENT_AUTH_FAILED` audit entries (serverId truncated to 100 chars, no key); record key status
    - Add `GET /api/agent-keys/status` for admins
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.10, 1.11, 4.2, 4.3, 4.4, 4.5, 4.7_
    - Change_Report: `server.js` (modified). Verify: with `AGENT_AUTH_MODE=enforce`, `POST /api/agent/telemetry` with no key returns 401 and an `AGENT_AUTH_FAILED` audit row; in `warn` mode it is accepted with one warning.

  - [x] 5.3 Generate keys on server creation and add the rotation endpoint
    - `POST /api/servers`: generate a key, store only the hash, add `agentKey` to the existing response, and embed it in the generated installer
    - New `POST /api/servers/:id/rotate-agent-key` (SUPER_ADMIN only; 403 otherwise; 404 with no audit if the server is missing; single-statement hash update; failure keeps the old hash; audit `AGENT_KEY_ROTATED` with no key or hash); returns `{ agentKey, installerUrl }` and a 15-minute one-time installer token bound to the server
    - Note: this task delivered the strict no-grace rotation (Requirement 2.4 with `graceMinutes` 0). Open Issue 2 is resolved: the optional `graceMinutes` window (Requirements 2.10 to 2.17, 23.5) is delivered by the follow-up task group 54.
    - _Requirements: 1.7, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 5.3_
    - Change_Report: `server.js` (modified). Verify: rotating returns a new key once; the old key is rejected in `enforce` mode on the next request; a non-SUPER_ADMIN gets 403.

  - [x] 5.4 Write property test that authentication failures are indistinguishable
    - **Property 17: Authentication failures are indistinguishable**
    - **Validates: Requirements 1.3, 1.4, 1.11**
    - Exercise the middleware factory with fake req/res and in-memory servers
    - Change_Report: `tests/agentAuth.indistinguishable.property.test.js` (added). Verify: passes.

  - [x] 5.5 Write property test that rotation invalidates the previous key
    - **Property 19: Rotation invalidates the previous key**
    - **Validates: Requirements 2.1, 2.4, 2.6**
    - Change_Report: `tests/agentAuth.rotation.property.test.js` (added). Verify: passes.

- [x] 6. Agent-side changes (Windows agent and installers)
  - [x] 6.1 Send `X-Agent-Key` from the C# service
    - Load `agentKey` from `agent-config.json` in `VpsAgentService.cs`; attach `X-Agent-Key` in `TimeoutWebClient.GetWebRequest` and the listen-jobs `HttpWebRequest`
    - Missing/empty key: skip the request, log once per polling interval, keep running. On 401: log timestamp and endpoint, keep running, retry next interval
    - Apply the SYSTEM + Administrators-only ACL whenever the service rewrites the config
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.8_
    - Change_Report: `public/VpsAgentService.cs` (modified). Verify (Windows): build and run; capture a request and confirm the header; remove the key and confirm the log line and no crash.

  - [x] 6.2 Send `X-Agent-Key` from the PowerShell agent scripts
    - Add the header on every request in `VpsAgent.master.ps1`, `VpsAgent.ps1`, and `public/VpsAgent.ps1`, reading `agentKey` from `%ProgramData%\InnovationWebWorks\VpsAgent\agent-config.json`; same missing-key and 401 behavior
    - _Requirements: 5.1, 5.2, 5.5, 5.6_
    - Change_Report: `powershell-scripts/VpsAgent.master.ps1`, `powershell-scripts/VpsAgent.ps1`, `public/VpsAgent.ps1` (modified). Verify: grep shows `X-Agent-Key` on each request call; a dry run logs "agent key missing" without a key.

  - [x] 6.3 Update the installers to write the key and lock down the config
    - `install.ps1` and `public/install.ps1`: write `agentKey` into `agent-config.json`, send `X-Agent-Key` on `detect-server`, then run `icacls ... /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)"`
    - Generic auto-detect without a key stays usable only in `warn` mode (Open Issue 1)
    - _Requirements: 5.2, 5.3, 5.8_
    - Change_Report: `install.ps1`, `public/install.ps1` (modified). Verify (Windows): after install, `icacls` on the config shows only SYSTEM and Administrators.

  - [x] 6.4 Update the Tally script and verify the encrypted bundle
    - Add key reading and the header to `Create_Tally_User.master.ps1`
    - Extend `scripts/build_encrypted_scripts.js` with a post-build check that decrypts each bundle and fails if `X-Agent-Key` is missing
    - _Requirements: 5.2, 5.4_
    - Change_Report: `powershell-scripts/Create_Tally_User.master.ps1`, `scripts/build_encrypted_scripts.js` (modified). Verify: `node scripts/build_encrypted_scripts.js` succeeds and the check reports `X-Agent-Key` present.

  - [x] 6.5 Confirm the updater preserves the agent key
    - Inspect `Update_VpsAgent.bat` (root-level, `public/`, and `powershell-scripts/` copies); change only if it can overwrite `agent-config.json`
    - _Requirements: 5.7_
    - Change_Report: `Update_VpsAgent.bat`, `public/Update_VpsAgent.bat`, `powershell-scripts/Update_VpsAgent.bat` (modified only if needed). Verify (Windows): hash `agent-config.json` before and after an update; hashes match.

- [x] 7. Rotate-key interface
  - [x] 7.1 Add the rotate control and one-time key display to the frontend
    - New `src/components/AgentKeyPanel.jsx` (copy button via `navigator.clipboard.writeText`, installer download tied to the panel's lifetime, error state shows no key or link)
    - `EditServerModal.jsx`: SUPER_ADMIN-only "Rotate agent key" with a confirmation dialog; `AddServerModal.jsx`: show the generated key once through the same panel
    - _Requirements: 2.7, 2.8, 2.9, 1.7_
    - Change_Report: `src/components/AgentKeyPanel.jsx` (added), `src/components/EditServerModal.jsx`, `src/components/AddServerModal.jsx` (modified). Verify: manual: rotate shows the key once, copy works, closing the panel removes the key and link, a forced 500 shows an error and no key.

- [x] 8. Retire `serverToken` (decision and cleanup)
  - Decision: `serverToken`, `X-Server-Token`, and `X-Server-Id` are NOT authentication. `X-Agent-Key` (task 5.2) replaces them. Verified facts: the C# agent sends `serverToken` in JSON bodies (`public/VpsAgentService.cs` lines 277, 375, 2955), in the listen-jobs query string (lines 396 to 399), and as `X-Server-Token` / `X-Server-Id` headers (lines 317, 404, 405); its default is `"vps_sec_token_default"` (line 34) and it is read and saved in `agent-config.json` (lines 4140 to 4141, 4152 to 4161). On the backend, `server.js` only destructures `serverToken` in `/api/agent/duplicate-session-event` (line 6190) and never validates it anywhere. `X-Server-Id` is read as an identification hint only (line 3582).
  - [x] 8.1 Remove the unused `serverToken` references from `server.js`
    - Delete `serverToken` from the destructure at line 6190; add a one-line comment that agent identity comes only from `X-Agent-Key` and that `serverId` / `X-Server-Id` are identification hints, never authentication
    - Confirm by grep that no other `serverToken` / `x-server-token` reference exists in `server.js` (none at the time of writing) and that `decideAgentAuth` (task 4.1) and the middleware (task 5.2) never read it
    - Leave the agent sending `serverToken` unchanged for now (older installed agents still send it). A later agent release removes it from the C# service, the PowerShell scripts, and the listen-jobs query string once every agent is upgraded (record this as a follow-up in the Change_Report; do not do it here)
    - _Requirements: 1.1, 1.3, 24.4, 24.5, 26.1_
    - Change_Report: `server.js` (modified). Verify: `grep -n "serverToken" server.js` returns nothing (or only the explanatory comment); `AGENT_AUTH_MODE=enforce` and a request carrying only `serverToken` / `X-Server-Token` returns 401.

  - [x] 8.2 Write property test that `serverToken` never authenticates
    - **Property 36: serverToken and X-Server-Token never authenticate**
    - **Validates: Requirements 1.1, 1.3, 26.1**
    - Exercise the middleware factory (task 4.1) in `enforce` mode with arbitrary `serverToken` body values and `X-Server-Token` / `X-Server-Id` headers and no `X-Agent-Key`; every request is rejected with the single fixed 401 body
    - Change_Report: `tests/agentAuth.serverToken.property.test.js` (added). Verify: passes.

- [x] 9. Deliver Agent_Keys to already-installed agents
  - Mechanism: during `warn` mode a SUPER_ADMIN triggers key delivery for one server or for all servers. The backend generates a key, stores only its hash (a server with a hash still accepts old agents that send no key, per Requirements 4.2 and 4.4), and queues one job that carries the plaintext key once.
  - Which job: the existing `UPDATE_AGENT` handler cannot carry a key. In the C# service it only reports "Agent auto-update acknowledged." and calls `CheckAndApplyAutoUpdate()` (`public/VpsAgentService.cs` lines 850 to 856, function at 4038); in `powershell-scripts/VpsAgent.master.ps1` (lines 1138 to 1149) it reports and calls `Check-AndApplyAgentAutoUpdate`. Neither reads any other job field. So this group adds a NEW action `SET_AGENT_KEY`.
  - Upgrading agents that do not know `SET_AGENT_KEY`: `ExecuteJob` in the C# service (line 458) is an `if (action == ...)` chain; I did not verify how an older binary treats an unknown action, so the backend never sends `SET_AGENT_KEY` to an agent unless its reported `agentVersion` is at least the minimum. Older agents first receive the existing `UPDATE_AGENT` job (route `POST /api/servers/:id/update-agent`, `server.js` line 4066), which downloads the new binary. Neither agent reports `agentVersion` yet (only `server.js` line 3127 reads `req.body.agentVersion`), so task 9.3 adds it to the telemetry payload; an agent with no reported version counts as "old".
  - Safety rules: the key travels only over HTTPS; the job that carries it is handed only to a request whose derived `req.clientIp` (task 3.5) matches the server's registered IP, because `warn` mode does not authenticate the poller; the key is never stored in MySQL and is stripped from the memory and `database.json` copies on completion, failure, and expiry, exactly like job passwords; a failed delivery leaves the old agent working.
  - [x] 9.1 Create `lib/agentKeyDelivery.js`
    - `buildSetAgentKeyJob({ serverId, agentKey })`; `stripAgentKey(job)` and `scrubJobSecrets(job)` (sets `agentKey` and `password` / `newPassword` to `''`, idempotent); `isJobDeliverable({ job, server, clientIp, secure, isProduction })` (jobs without `agentKey` are always deliverable; jobs with `agentKey` need `normalizeIp(clientIp)` equal to the host part of `server.ipPort` and, in production, `secure === true`); `needsAgentUpdate(agentVersion, minVersion)` (missing or unparsable version counts as old)
    - Pure functions with no I/O so they can be property tested
    - _Requirements: 4.2, 4.4, 9.1, 9.2, 9.3, 24.4, 24.5, 26.7, 26.8_
    - Change_Report: `lib/agentKeyDelivery.js` (added). Verify: Node REPL shows a job with `agentKey` is not deliverable to a non-matching IP and is deliverable to the matching one; `scrubJobSecrets` leaves no key.

  - [x] 9.2 Write property test for key delivery gating and scrubbing
    - **Property 37: An agent-key job reaches only the registered IP and leaves no key behind**
    - **Validates: Requirements 4.2, 4.4, 9.1, 9.2, 9.3, 26.7, 26.8**
    - Generate server IPs and requester IPs; assert deliverable only when equal (and secure in production); assert `scrubJobSecrets` output serializes without the key text
    - Change_Report: `tests/agentKeyDelivery.property.test.js` (added). Verify: passes.

  - [x] 9.3 Add the `SET_AGENT_KEY` action and `agentVersion` to the agents
    - C# service: in `ExecuteJob` next to `UPDATE_AGENT` (line 850), validate the key against `^ak_[A-Za-z0-9_-]{43}$`, write it to a temp file and replace `agent-config.json` atomically through `SaveConfig` (line 4152) with the SYSTEM + Administrators ACL from task 6.1, switch the in-memory key, then call `ReportJobResult` with `COMPLETED` ("Agent key installed", never the key) or `FAILED` (config untouched, old key kept). Never log the job body
    - PowerShell agents (`VpsAgent.master.ps1`, `powershell-scripts/VpsAgent.ps1`, `public/VpsAgent.ps1`): same action beside `UPDATE_AGENT` (master line 1140), writing `%ProgramData%\InnovationWebWorks\VpsAgent\agent-config.json` and applying `icacls ... /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)"`; same result reporting
    - All three agent variants add `agentVersion` to the telemetry payload (C# payload built around lines 277 to 283); the minimum version constant (`AGENT_KEY_MIN_VERSION`) is read by the endpoints in task 9.4
    - ASK FIRST: rebuilding and replacing the compiled `InnovationVpsAgent.exe` copies (`public/`, repository root, `powershell-scripts/`) is a manual Windows build step that replaces the currently deployed artifact (reversible from git). The user compiles and approves the replacement; generated binaries are not counted toward the 5-file limit.
    - _Requirements: 5.1, 5.2, 5.6, 5.8, 24.4, 24.5, 26.9_
    - Change_Report: `public/VpsAgentService.cs`, `powershell-scripts/VpsAgent.master.ps1`, `powershell-scripts/VpsAgent.ps1`, `public/VpsAgent.ps1` (modified). Verify (Windows): send a `SET_AGENT_KEY` job with a valid key; `agent-config.json` holds the new key with only SYSTEM and Administrators in `icacls`, the job reports `COMPLETED`, and the next request carries `X-Agent-Key`; a malformed key reports `FAILED` and the old key still works.

  - [x] 9.4 Add the key delivery endpoints
    - New SUPER_ADMIN routes `POST /api/servers/:id/deploy-agent-key` and `POST /api/servers/deploy-agent-keys` (bulk; body `{ serverIds?: string[], force?: boolean }`, default all non-deleted servers). Allowed only while `AGENT_AUTH_MODE=warn` (409 in `enforce`, because a keyless agent could not poll for the job)
    - Per server: skip with a reason if it already has a hash and `lastRequestValid` (unless `force`); if `needsAgentUpdate(agentVersion)` queue only `UPDATE_AGENT` and report `needs_update`; otherwise generate a key, store only the hash with a single-statement update (failure keeps the old hash, as in `rotateAgentKey` from task 4.1), and queue `SET_AGENT_KEY` through `queueServerJob`
    - `queueServerJob` (`server.js` line 2697) accepts `agentKey`; the MySQL `INSERT INTO vps_provision_jobs` (line 2766) is not changed, so the key is never written to MySQL, and the job expires through the existing 15-minute timeout (lines 2833 to 2846)
    - In production require `config.portalBaseUrl` to be `https://` (otherwise 409 and nothing queued); outside production allow http with a logged warning
    - Response lists `queued`, `needs_update`, `skipped` (server ids and reasons only; never a key or hash). Audit `AGENT_KEY_DELIVERY_QUEUED` per server (actor, serverId, no key, no hash)
    - _Requirements: 1.7, 2.1, 2.2, 4.2, 4.4, 5.3, 24.4, 24.5, 26.3, 26.4, 26.5, 26.6, 26.10_
    - Change_Report: `server.js` (modified). Verify: in `warn` mode the bulk call returns queued / needs_update / skipped lists with no key text; a non-SUPER_ADMIN gets 403; `enforce` mode returns 409; the `vps_provision_jobs` table has no key text.

  - [x] 9.5 Hand the key job only to the registered IP and scrub it afterwards
    - The job reaches agents at three places: the telemetry response (`pendingJobs`, `server.js` line 3567), `/api/agent/listen-jobs` and `/api/agent/poll-instant` (immediate jobs line 3623, long-poll and `agentJobEmitter` push lines 3653 to 3656). At each, drop jobs for which `isJobDeliverable` (task 9.1) is false and leave them `PENDING` (log a throttled warning with serverId only)
    - Scrub with `scrubJobSecrets` in `/api/agent/job-result` (line 3693, after the status is set), in the timeout sweep that marks jobs `FAILED` (lines 2833 to 2846), and in the serialization written to `database.json` (`saveDiskDatabase`, line 388; keep this when task 24.2 replaces it)
    - Residual risk to record in the Change_Report: a request from the same registered public IP (shared NAT, or another process on the same VPS) can receive the job
    - _Requirements: 4.2, 4.4, 9.1, 9.2, 9.3, 24.4, 24.5, 26.7, 26.8_
    - Change_Report: `server.js` (modified). Verify: a poll from another IP receives no `SET_AGENT_KEY` job and the job stays `PENDING`; the registered IP receives it once; after `job-result` (or after 15 minutes) the in-memory job and `database.json` contain no key text.

  - [x] 9.6 Add the readiness check for switching to `enforce`
    - Create `lib/agentKeyReadiness.js`: `evaluateReadiness({ servers, deletedTokens, keyStatus, now, windowMs = 10 * 60 * 1000 })` returning `{ servers: [{ serverId, hasHash, lastRequestValid, lastValidAt, agentVersion }], readyForEnforce }`; `readyForEnforce` is true only if every non-deleted server has `hasHash` and `lastRequestValid === true` with `lastValidAt` within the last 10 minutes (no servers means true; document it)
    - Extend `GET /api/agent-keys/status` (task 5.2) to return that shape; `agentVersion` comes from the telemetry field stored at `server.js` line 3127; the `keyStatus` map is in memory, so after a restart `readyForEnforce` stays false until agents have polled again (documented)
    - _Requirements: 4.2, 4.4, 4.7, 24.4, 24.5, 26.11_
    - Change_Report: `lib/agentKeyReadiness.js` (added), `server.js` (modified). Verify: the endpoint lists every server with the five fields; one server with `lastRequestValid=false` makes `readyForEnforce` false.

  - [x] 9.7 Write property test for `readyForEnforce`
    - **Property 38: readyForEnforce is true only when every non-deleted server has a hash and a valid request in the last 10 minutes**
    - **Validates: Requirements 4.2, 4.4, 4.7, 26.11**
    - Generate server sets, deleted sets, key status maps, and clocks; compare against a simple model; include the 10-minute boundary
    - Change_Report: `tests/agentKeyReadiness.property.test.js` (added). Verify: passes.

  - [x] 9.8 Add the rollout panel to the admin UI
    - New `src/components/AgentKeyRolloutPanel.jsx` (SUPER_ADMIN only): per-server table from `GET /api/agent-keys/status`, a `readyForEnforce` badge, "Deliver keys to all servers" and per-server retry buttons calling task 9.4, shows `needs_update` results; never shows a key or hash
    - Mount it in `src/components/views/VpsView.jsx`
    - _Requirements: 2.7, 24.4, 24.5, 26.12_
    - Change_Report: `src/components/AgentKeyRolloutPanel.jsx` (added), `src/components/views/VpsView.jsx` (modified). Verify: manual: the badge turns green only when every server shows a valid request; a non-SUPER_ADMIN does not see the panel.

  - [x] 9.9 Document the per-agent check and the `enforce` gate
    - Create `docs/AGENT_KEY_ROLLOUT.md`: order of steps (backup, approve and deploy the new agent binary, bulk delivery, verification), the per-agent manual check (the agent log line "Agent key installed" read through `POST /api/servers/:id/get-agent-log`; `curl -s -b <admin cookie> https://<portal>/api/agent-keys/status` showing `hasHash` and `lastRequestValid` true for the server; a test request from the VPS using the key stored in `agent-config.json` returning 200 instead of 401), and the rule: DO NOT set `AGENT_AUTH_MODE=enforce` until `readyForEnforce` is true
    - Rollback to `warn`: set `AGENT_AUTH_MODE=warn`, restart the process, check `/api/agent-keys/status`; a lost agent key is fixed with the rotate endpoint (task 5.3) and a reinstall
    - _Requirements: 4.7, 23.1, 23.3, 26.13_
    - Change_Report: `docs/AGENT_KEY_ROLLOUT.md` (added). Verify: review that every step has an expected result and the rollback section exists.

- [x] 10. Database backup (runs before any Phase 2 data change)
  - [x] 10.1 Create `scripts/backup_mysql.sh`
    - Read `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (fall back to `MYSQL_*` and to a safe `.env` read without `source`); `umask 077` temporary `--defaults-extra-file` removed by `trap`; output `${BACKUP_DIR}/${DB_NAME}_YYYYMMDD_HHMMSS.sql.gz`
    - Missing setting: no file, error naming it, non-zero. `BACKUP_RETENTION_DAYS` default 14, must be an integer 1 to 3650 or exit non-zero before deleting. On `mysqldump` failure remove the partial file, skip pruning, log the exit status. On success prune matching files older than the retention (never the new file), log name and size, exit 0
    - Include a daily cron example in the script header (output redirected to a log file); `BACKUP_DIR` must not be the directory that holds the encryption key backup (task 13.1)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10_
    - Change_Report: `scripts/backup_mysql.sh` (added). Verify: run with a stub `mysqldump` on `PATH`; the file name matches the pattern and the password is not in the stub's recorded argv.

  - [x] 10.2 Write a stub-based test for the backup script
    - Cover naming, no password in argv, pruning, invalid retention, missing setting, and failure cleanup
    - _Requirements: 20.1, 20.3, 20.4, 20.5, 20.7, 20.8_
    - Change_Report: `tests/backup.test.js`, `tests/fixtures/mysqldump-stub.sh` (added). Verify: passes where bash is available; skipped otherwise.

- [x] 11. Checkpoint - Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Ask the user whether to keep `AGENT_AUTH_MODE=warn` for the rollout period. Do NOT switch to `enforce` until `GET /api/agent-keys/status` reports `readyForEnforce: true` (task 9.6); the switch and the rollback to `warn` are in `docs/AGENT_KEY_ROLLOUT.md` and the Runbook.
  - Ask the user to run `scripts/backup_mysql.sh` once now and confirm the `.sql.gz` file exists and is non-empty; Phase 2 changes stored data.

### Phase 2: Secrets and passwords

- [x] 12. Secret cipher
  - [x] 12.1 Create `lib/secretCipher.js`
    - `parseKey` (hex 64 or base64 decoding to exactly 32 bytes; error text never includes the input), `encrypt`/`decrypt` (AES-256-GCM, fresh 12-byte nonce, AAD `enc:v1`, format `enc:v1:` + base64url(nonce‖tag‖ciphertext), canonical-strict base64url), `isCiphertext`, `CipherError`
    - `sealPassword`/`openPassword` wrappers: empty stays empty; legacy (no `enc:` prefix) passes through; `enc:` values must decrypt or throw
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.14_
    - Change_Report: `lib/secretCipher.js` (added). Verify: Node REPL round trip returns the original and two encryptions of the same text differ.

  - [x] 12.2 Write property test for the cipher round trip
    - **Property 1: Cipher round trip**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - Change_Report: `tests/secretCipher.roundtrip.property.test.js` (added). Verify: passes.

  - [x] 12.3 Write property test that nonces never repeat
    - **Property 2: Encryption never repeats a nonce**
    - **Validates: Requirements 7.1, 7.4**
    - Change_Report: `tests/secretCipher.nonce.property.test.js` (added). Verify: passes.

  - [x] 12.4 Write property test that tampered ciphertext is rejected
    - **Property 3: Tampered ciphertext is rejected**
    - **Validates: Requirements 7.5**
    - Mutate characters after the `enc:` marker only (Open Issue 5)
    - Change_Report: `tests/secretCipher.tamper.property.test.js` (added). Verify: passes.

  - [x] 12.5 Write property test for legacy plaintext pass-through
    - **Property 4: Legacy plaintext passes through and re-seals**
    - **Validates: Requirements 7.14, 9.1**
    - Change_Report: `tests/secretCipher.legacy.property.test.js` (added). Verify: passes.

  - [x] 12.6 Write property test for key parsing
    - **Property 5: Key parsing accepts exactly 32 bytes**
    - **Validates: Requirements 7.6**
    - Change_Report: `tests/secretCipher.key.property.test.js` (added). Verify: passes.

- [x] 13. Encryption key backup guidance
  - [x] 13.1 Document how to generate and back up `PASSWORD_ENCRYPTION_KEY`
    - `.env.example`: comment above `PASSWORD_ENCRYPTION_KEY` with the generator `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, and the rules below in short form
    - `README.md`: new "Encryption key backup" section: store the key in at least two separate secure places (a password manager and an offline copy); never in the repository and never in the `BACKUP_DIR` that holds the database dumps; losing the key makes every encrypted password unrecoverable; rotation is NOT supported by the v1 format (the `enc:v1:` prefix leaves room for a future key id); test a restore of a database backup together with the key (restore into a scratch database, start the portal with the key, reveal one client password and compare)
    - The migration gate in task 20.1 / checkpoint 21 and the Runbook (task 40.1) refer to this section
    - _Requirements: 7.6, 8.3, 23.1, 24.4, 24.5, 7.16_
    - Change_Report: `.env.example`, `README.md` (modified). Verify: the generator command prints a 44-character base64 string that `parseKey` (task 12.1) accepts.

- [x] 14. Password generation
  - [x] 14.1 Create `lib/passwords.js`
    - `generatePassword(length = 16)` (16 to 64, uses `crypto.randomInt`, at least one upper/lower/digit, avoids `net user` problem characters, Fisher-Yates shuffle), `isDefaultPassword` (`emp123`, `sales123`, `Admin@12345`), and a `redact()` helper masking `password`, `superClientPass`, `agentKey`, `apiKey`, `x-agent-key`, and `enc:v1:` tokens
    - _Requirements: 6.3, 6.10, 7.13_
    - Change_Report: `lib/passwords.js` (added). Verify: Node REPL `generatePassword(16)` returns 16 characters with upper, lower, and digit.

  - [x] 14.2 Write property test for generated passwords
    - **Property 24: Generated passwords meet the policy**
    - **Validates: Requirements 6.3**
    - Change_Report: `tests/passwords.generate.property.test.js` (added). Verify: passes.

- [x] 15. Remove hardcoded defaults and secrets
  - [x] 15.1 Extend `lib/config.js` with secret settings
    - Add `encryptionKey` (required and valid in production; ephemeral key plus warning outside production; error text never contains the key) and `internalSecret` (`null` when empty); document in `.env.example` (`PASSWORD_ENCRYPTION_KEY`, `INTERNAL_SECRET`, `SUPERADMIN_DEFAULT_PASS`)
    - _Requirements: 6.6, 6.7, 6.8, 7.6, 6.11_
    - Change_Report: `lib/config.js`, `.env.example` (modified). Verify: production env without a key fails with "missing or invalid length" and no key text.

  - [x] 15.2 Remove the schema default and widen password columns
    - `schema.sql`: `client_subscriptions.password VARCHAR(2048) NOT NULL` with no default; widen `vps_servers.superClientPass` and `vps_provision_jobs.password` to `VARCHAR(2048)`
    - `initMySQLDatabase`: remove the `ALTER ... DEFAULT 'Pass#123'` statement; add repeat-safe `MODIFY COLUMN` for the three columns
    - ASK FIRST: the optional `ALTER TABLE client_subscriptions ALTER COLUMN password DROP DEFAULT` on existing databases. Do not run or add it until the user approves (reversible by re-adding the default; Open Issue 4).
    - _Requirements: 6.1, 6.2, 7.8, 24.6, 24.7_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: `grep "Pass#123" schema.sql` has no match; running init twice leaves existing values intact.

  - [x] 15.3 Replace every `'Pass#123'` fallback in `server.js`
    - Current fallbacks in `server.js`: migration relay (line 3738), provisioning from a stored client (lines 4153, 4230, 4253), bulk import / user save (`REPLACE INTO client_subscriptions`, lines 7180, 7272, 7377), and password change (line 7313). Use the stored value, or `generatePassword()` where a new value must be created; never substitute a shared default
    - Exports no longer contain a password column by default and never substitute `'Pass#123'`; password-bearing exports are handled only by the SUPER_ADMIN export route in task 17.4 (decision: exports OMIT passwords by default)
    - Ensure every `client_subscriptions` insert sets the password explicitly
    - Note: Requirement 6.5 now reads "omit the password column by default", which matches this decision
    - _Requirements: 6.3, 6.4, 6.5_
    - Change_Report: `server.js` (modified). Verify: `grep "Pass#123" server.js` has no match; bulk import of a new user without a password creates a random password.

  - [x] 15.4 Remove the internal secret fallback and default seeding
    - `validateSession`: use `config.internalSecret` only; when `null`, reject `x-internal-secret` and log once that the path is disabled
    - Production: skip default admin seeding if `SUPERADMIN_DEFAULT_PASS` is empty (one error log); never seed `employee`/`sales`; startup audit warns once per user whose bcrypt hash matches a known default (username only)
    - _Requirements: 6.6, 6.7, 6.8, 6.9, 6.10_
    - Change_Report: `server.js` (modified). Verify: `grep "vps-internal-automation-2026" server.js` has no match; production start with no `SUPERADMIN_DEFAULT_PASS` logs the error and still starts.

- [x] 16. Sanitize agent job parameters (before encrypted passwords are dispatched)
  - Why: `queueServerJob` (`server.js` line 2697) copies request fields straight into the job that the agent runs as an administrator. `sanitizeWindowsUsername` (line 488) is the only check today, and `queueServerJob` is called from about 35 sites (lines 3734 to 7832, listed by `grep -n "queue\(Server\|Provision\|PasswordChange\|ToggleUserStatus\|LogoffSession\)" server.js`).
  - [x] 16.1 Create `lib/jobParams.js`
    - `validateJobParams(params)` returns the cleaned params or throws `JobParamError` (generic message, no echo of the input). Rules: `username` runs through the existing `sanitizeWindowsUsername` rules and is then rejected unless it matches `[A-Za-z0-9_.\-$ ]`, length 1 to 40, no leading `-`; `drive` / `targetDrive` `^[A-Za-z]:?$`; `driveLetter` a single letter with an optional colon; `sessionId` digits only or empty; `companyName` / `label` allowlist letters, digits, space, `. _ - & , ( )`, length <= 100, after stripping control characters, newlines, backticks, `$()`, `;`, `|`, `<`, `>`, `"` and `'`; `password` / `newPassword` reject NUL, CR, LF, length 4 to 128 (characters such as `'` `"` `` ` `` `$` `;` `&` `|` stay permitted and the code comment states they MUST reach PowerShell as data through parameters, `ConvertFrom-Json`, `-EncodedCommand`, or stdin, never string-interpolated); `migrationId` `^[A-Za-z0-9_-]+$`; `downloadUrl` / `uploadUrl` must start with `config.portalBaseUrl`; `sha256` `^[0-9a-f]{64}$`; `diskNumber`, `sizeGB`, `fileSizeBytes` coerced to finite non-negative numbers; `agentKey` `^ak_[A-Za-z0-9_-]{43}$`
    - _Requirements: 24.4, 24.5, 27.2, 27.3_
    - Change_Report: `lib/jobParams.js` (added). Verify: Node REPL: `validateJobParams({ username: "a'; calc; '" })` throws; `{ username: 'tally_user1', drive: 'D:' }` passes unchanged.

  - [x] 16.2 Write property test with injection payload generators
    - **Property 39: Job parameters are rejected or neutralized when they carry injection payloads**
    - **Validates: Requirements 24.4, 24.5, 27.1, 27.2, 27.3**
    - Generators for `'; calc; '`, `$(...)`, backticks, embedded newlines, `"`, `|`, `&`, `<`, `>`; for every field, assert the validator either throws or returns a value that contains none of the dangerous characters (password is the documented exception and is only checked for NUL / CR / LF / length); valid inputs round trip unchanged
    - Change_Report: `tests/jobParams.property.test.js` (added). Verify: passes with 100+ runs.

  - [x] 16.3 Apply the validators inside `queueServerJob`
    - Call `validateJobParams` at the top of `queueServerJob` (covers `queueProvisionJob`, `queuePasswordChangeJob`, `queueToggleUserStatusJob`, `queueLogoffSessionJob`, and the migration relay calls); on `JobParamError` throw before anything is pushed to `memoryStore.provisionJobs` or inserted into MySQL
    - Define the error so route handlers can map it (`statusCode: 400`)
    - _Requirements: 24.4, 24.5, 27.1_
    - Change_Report: `server.js` (modified). Verify: a call with a bad username queues nothing (`memoryStore.provisionJobs.length` unchanged, no INSERT).

  - [x] 16.4 Reject bad input at the routes that feed the queue
    - Add a small `validateJobRequest` middleware (from `lib/jobParams.js`) on the routes that call `queue*` (the call sites listed above: lockdown / update / logoff / toggle / password / provisioning / migration / disk routes between lines 3954 and 7832); invalid input returns `400 { success: false, error: 'Invalid request parameters' }` and queues nothing; never mount it on login or other password routes
    - Convert any `JobParamError` reaching a route's `catch` into the same 400 instead of a 500 with `err.message`
    - If the diff grows too large, split by line range (3900 to 5600, 7200 to 7850) into two tasks
    - _Requirements: 24.4, 24.5, 27.4_
    - Change_Report: `server.js` (modified). Verify: `POST` a provision request with `username: "x'; calc; '"` returns 400 with the generic message and no job; a normal request still succeeds.

  - [x] 16.5 Audit the agent code for command-string interpolation (report only)
    - Grep `powershell-scripts/VpsAgent.master.ps1`, `powershell-scripts/Create_Tally_User.master.ps1`, and `public/VpsAgentService.cs` for job fields interpolated into command strings. Known candidates to confirm and list in the Change_Report: `VpsAgent.master.ps1` line 299 (`powershell.exe ... -Command` guardian command string), lines 2237 and 2472 to 2473 (`net user "$username" "$password" /add`, a `"` or trailing backslash in a password breaks native-argument quoting), icacls calls with `"$uName"` / `"$username"` (lines 742 to 745, 1804 to 1842, 2180 to 2182, 2478 to 2480); `Create_Tally_User.master.ps1` line 283 (`Invoke-Expression $robocopyCmd`), icacls lines 228 to 257 and 327; `VpsAgentService.cs` line 1076 (`ExecutePowerShell(string.Format("Disable-LocalUser -Name '{0}' ...; net user '{0}' ...", username))`, a single quote in the name breaks out) and `RunProcess("icacls.exe", string.Format(...))` at lines 765, 2025, 3456, 3467, 3603 to 3608 (a `"` in a username or path breaks out); `-EncodedCommand` at line 2554 is already the safe form
    - No files change in this task
    - _Requirements: 24.4, 24.5, 27.6_
    - Change_Report: no files changed. Verify: the Change_Report lists each interpolation site with file and line, and the planned fix (parameterized form).

  - [x] 16.6 Fix the PowerShell master scripts
    - `VpsAgent.master.ps1` and `Create_Tally_User.master.ps1`: pass values as arguments (`& icacls.exe $path '/grant:r' ($user + ':(OI)(CI)F')`, `Start-Process -ArgumentList` as an array), replace `net user "$username" "$password"` with `Set-LocalUser` / `New-LocalUser` using a `SecureString` (or the ADSI `SetPassword` method already used for `CHANGE_USER_PASSWORD`), replace `Invoke-Expression $robocopyCmd` with `& robocopy.exe @argsArray`, and give the guardian command (line 299) its data through a file or `-EncodedCommand` instead of string concatenation
    - ASK FIRST if a fix needs more than these 2 files
    - _Requirements: 24.4, 24.5, 27.6_
    - Change_Report: `powershell-scripts/VpsAgent.master.ps1`, `powershell-scripts/Create_Tally_User.master.ps1` (modified). Verify (Windows): provisioning a user whose password contains `'`, `"`, `$`, and `;` succeeds and the password works; a username with a space-free allowed name still works.

  - [x] 16.7 Fix the C# service
    - `public/VpsAgentService.cs`: replace the `string.Format` command strings at the sites listed in task 16.5 with `ProcessStartInfo.ArgumentList`-style argument arrays (or properly escaped arguments for .NET Framework builds that lack `ArgumentList`) and `-EncodedCommand` for the `ExecutePowerShell` call at line 1076; re-validate `username` / `driveRoot` with the same allowlists before use
    - _Requirements: 24.4, 24.5, 27.6_
    - Change_Report: `public/VpsAgentService.cs` (modified). Verify (Windows): build; disable-user and provisioning jobs still work; a username containing `'` is rejected by the agent before any process starts.

  - [x] 16.8 Sync the derived script copies
    - Apply the same edits to the derived copies of the scripts: `powershell-scripts/VpsAgent.ps1`, `public/VpsAgent.ps1`, `powershell-scripts/Create_Tally_User.ps1`, `public/scripts/Create_Tally_User.ps1`; if they are produced from the master files by `scripts/build_encrypted_scripts.js`, regenerate them instead of hand editing (generated files do not count toward the 5-file limit)
    - ASK FIRST if more than 5 files must change by hand
    - _Requirements: 24.4, 24.5, 27.6_
    - Change_Report: `powershell-scripts/VpsAgent.ps1`, `public/VpsAgent.ps1`, `powershell-scripts/Create_Tally_User.ps1`, `public/scripts/Create_Tally_User.ps1` (modified or regenerated). Verify: `grep -n "Invoke-Expression\|net user \"" ` over the four files shows no job-field interpolation.

- [x] 17. Encrypt Managed_Passwords at rest
  - [x] 17.1 Seal passwords on every write path
    - Call `sealPassword` for `client_subscriptions.password`, `vps_servers.superClientPass`, `vps_provision_jobs.password`, and the `memoryStore`/`database.json` copies; decrypt with `openPassword` only when building a Provision_Job payload for an authenticated Agent
    - On decrypt failure, create or dispatch no job and return a "cannot be decrypted" error with no password data
    - _Requirements: 7.7, 7.9, 7.15, 7.13_
    - Change_Report: `server.js` (modified). Verify: creating a client stores a value starting with `enc:v1:`; the agent job payload carries the plaintext.

  - [x] 17.2 Add public projections and strip passwords from responses
    - Create `lib/publicProjections.js` (`toPublicClient`, `toPublicServer`, `toPublicJob`, `toPublicMigration`) removing `password`, `newPassword`, `superClientPass`, `agentKey` (the plaintext key carried by `SET_AGENT_KEY` jobs from task 9.4), and any `enc:v1:` text
    - Apply at every list and detail response that returns those objects; preserve all other fields
    - _Requirements: 7.10, 9.5, 24.4_
    - Change_Report: `lib/publicProjections.js` (added), `server.js` (modified). Verify: `GET` client and server lists contain no `password`/`superClientPass`; other fields match the previous responses.

  - [x] 17.3 Add the SUPER_ADMIN password reveal route
    - `POST /api/clients/:id/reveal-password`: 403 for non-SUPER_ADMIN before any decrypt; decrypt, write one audit entry (actor, target, timestamp, no password), return the plaintext once; decrypt failure returns an error body with no password data
    - Add a "Reveal" action to the client detail view only if a suitable component is already touched (otherwise defer to the user)
    - _Requirements: 7.11, 7.12, 7.13, 7.15_
    - Change_Report: `server.js` (modified). Verify: SUPER_ADMIN gets the plaintext and exactly one new audit row; EMPLOYEE gets 403.

  - [x] 17.4 Add the SUPER_ADMIN export route (exports omit passwords by default)
    - Where the export happens today: it is client-side only (`exportServerUserExcel` in `src/utils/exportUtils.js` line 110, called from `UsersView.jsx` line 234, `UserTable.jsx` line 236, and passed through `App.jsx` line 861). It has no password column and the template text says not to add passwords. There is no server export route, so add one.
    - New `POST /api/clients/export` (any authenticated role): body `{ serverId?, includePasswords?, confirm? }`; default response is the client rows with NO password column. With `includePasswords: true` the route decrypts with `openPassword` ONLY for SUPER_ADMIN and only when `confirm === true`; every other role gets 403 before any decrypt (also 403 when `confirm` is missing for a SUPER_ADMIN, with no decrypt)
    - Write exactly ONE audit entry per export request that includes passwords (actor, number of rows, timestamp; no passwords); a plain export writes none; decrypt failure of a row writes an empty value for that row and never a ciphertext or fallback
    - _Requirements: 6.5, 6.12, 7.10, 7.11, 7.12, 7.13_
    - Change_Report: `server.js` (modified). Verify: a default export has no password column; a SUPER_ADMIN with `includePasswords` and `confirm` gets plaintext and one audit row; an EMPLOYEE gets 403 and nothing is decrypted.

  - [x] 17.5 Add the "Export with passwords" action to the UI
    - `src/utils/exportUtils.js`: new `exportServerUserWithPasswords(serverId)` that calls the route from task 17.4 (the existing client-side export stays unchanged and password-free); `src/components/UserTable.jsx`: SUPER_ADMIN-only button with a confirmation dialog that sends `confirm: true`
    - _Requirements: 6.5, 6.12, 7.11, 24.4_
    - Change_Report: `src/utils/exportUtils.js`, `src/components/UserTable.jsx` (modified). Verify: manual: SUPER_ADMIN sees the button, cancelling the dialog sends nothing, other roles do not see it.

  - [x] 17.6 Write property test that public serializers never expose passwords
    - **Property 7: Public serializers never expose passwords**
    - **Validates: Requirements 7.10, 9.5**
    - Include `agentKey` in the generated objects (including `toPublicJob`)
    - Change_Report: `tests/publicProjections.property.test.js` (added). Verify: passes.

  - [x] 17.7 Replace the `'Pass#123'` display fallbacks in the frontend (part 1)
    - Once task 17.2 strips passwords from responses, `user.password || 'Pass#123'` would show a wrong password and build wrong RDP / bookmarklet data. Replace the fallbacks with a "Reveal" action backed by the route in task 17.3 (SUPER_ADMIN only) and hide the value for other roles
    - Files: `src/components/views/UsersView.jsx` (lines 401 to 402), `src/components/UserTable.jsx` (lines 411 to 412), `src/components/UserProfileModal.jsx` (lines 34 to 35), `src/components/WebRemoteConsoleModal.jsx` (line 46)
    - ASK FIRST: this changes how the RDP file / bookmarklet is built (the password must be revealed on demand); confirm the desired behavior for non-SUPER_ADMIN roles before editing.
    - _Requirements: 7.10, 7.11, 24.4, 36.1, 36.2_
    - Change_Report: `src/components/views/UsersView.jsx`, `src/components/UserTable.jsx`, `src/components/UserProfileModal.jsx`, `src/components/WebRemoteConsoleModal.jsx` (modified). Verify: `grep -rn "Pass#123" src/` no longer matches these files; Reveal shows the real password for SUPER_ADMIN.

  - [x] 17.8 Replace the `'Pass#123'` display fallbacks in the frontend (part 2)
    - Same change for `src/components/views/HardwareSpecsView.jsx` (line 761), `src/components/views/VpsView.jsx` (line 275), `src/components/ServerTabList.jsx` (line 53), `src/components/TopNavbar.jsx` (line 118), and `src/components/AddServerModal.jsx` (line 97: send an empty value or a generated password instead of the shared default)
    - ASK FIRST for the same reason as task 17.7
    - _Requirements: 6.1, 6.4, 7.10, 24.4, 36.1, 36.3_
    - Change_Report: `src/components/views/HardwareSpecsView.jsx`, `src/components/views/VpsView.jsx`, `src/components/ServerTabList.jsx`, `src/components/TopNavbar.jsx`, `src/components/AddServerModal.jsx` (modified). Verify: `grep -rn "Pass#123" src/` has no match.

- [x] 18. Encrypt TOTP secrets and hash backup codes
  - Read sites in `server.js`: login check (line 1670), `validate-login` (lines 1724 to 1750), `2fa/setup` (lines 1772 to 1785), `confirm-setup` (lines 1816 to 1835), `disable` (lines 1882 to 1889), admin reset (lines 1911 to 1920). Columns `two_factor_secret` and `two_factor_temp_secret` are `VARCHAR(128)` (`schema.sql` lines 77 to 78, `server.js` lines 655 and 661); `two_factor_backup_codes` is a JSON array of codes like `ABCD-1234` (`generateTotpBackupCodes`, line 1425), stored in plaintext today.
  - Backup code decision: store each code as a bcrypt hash (`bcryptjs` is already a dependency; codes have only 32 bits of entropy, so a slow hash is needed). Existing plaintext codes keep working: a submitted code is compared against both forms (bcrypt compare for entries starting with `$2`, normalized string compare for legacy entries) until it is used; a used code is removed. The setup response still returns the plaintext codes once.
  - [x] 18.1 Create `lib/totpSecrets.js`
    - `sealTotpSecret` / `openTotpSecret` wrapping `sealPassword` / `openPassword` from `lib/secretCipher.js` (legacy plaintext passes through and is re-sealed on the next write), `hashBackupCodes(codes)`, and `consumeBackupCode(storedList, submitted)` returning `{ matched, remaining }` that handles both bcrypt and legacy plaintext entries
    - _Requirements: 7.1, 7.2, 7.14, 24.4, 24.5, 28.1, 28.2, 28.3_
    - Change_Report: `lib/totpSecrets.js` (added). Verify: Node REPL: a sealed secret starts with `enc:v1:` and opens to the original; a legacy plaintext code is accepted once and then removed.

  - [x] 18.2 Write property test for TOTP secret sealing and projections
    - **Property 40: TOTP secrets round trip and never appear in public projections**
    - **Validates: Requirements 7.1, 7.2, 7.10, 7.14, 28.1, 28.2, 28.5**
    - Round trip for generated base32 secrets; the stored form never equals the plaintext; `toPublicEmployee` (task 18.6) output never contains `two_factor_secret`, `two_factor_temp_secret`, or `two_factor_backup_codes`
    - Change_Report: `tests/totpSecrets.property.test.js` (added). Verify: passes.

  - [x] 18.3 Widen the TOTP columns
    - `schema.sql`: `two_factor_secret` and `two_factor_temp_secret` to `VARCHAR(512)`; `initMySQLDatabase`: repeat-safe `ALTER TABLE portal_users MODIFY COLUMN ... VARCHAR(512) DEFAULT NULL` for both; no data dropped
    - ASK FIRST: this alters the existing `portal_users` table (widening only; reversible by narrowing again only if no value exceeds 128 characters).
    - _Requirements: 7.8, 24.6, 24.7, 28.4_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: run init twice against a test MySQL; no error and existing rows unchanged.

  - [x] 18.4 Read sites: login and `validate-login`
    - Use `openTotpSecret` before `verifyTotp` in `validate-login`; use `consumeBackupCode` for recovery codes (dual-form compare) and persist the remaining list; on a decrypt failure return the same generic 401 as a wrong code and log the user id only
    - _Requirements: 7.2, 7.5, 7.14, 28.2, 28.3, 28.6_
    - Change_Report: `server.js` (modified). Verify: a user with a sealed secret logs in with a valid TOTP; a user with a legacy plaintext secret and a legacy plaintext backup code logs in once with the code and the code is then gone.

  - [x] 18.5 Write sites: setup, confirm-setup, disable, and reset
    - `setup`: seal the temp secret and store hashed backup codes (response still returns the plaintext codes and secret once); `confirm-setup`: open the temp secret, verify, store `sealTotpSecret(secret)`; `disable` and admin reset: clear all three columns as today (memory and MySQL)
    - _Requirements: 7.1, 7.7, 7.9, 28.1, 28.3_
    - Change_Report: `server.js` (modified). Verify: after setup and confirm, the `portal_users` row holds `enc:v1:` values and hashed codes; login works; disable clears the columns.

  - [x] 18.6 Make sure the TOTP fields are never returned
    - Add `toPublicEmployee` to `lib/publicProjections.js` (allowlist: id, name, username, role, status, email, two_factor_enabled, lastLogin, createdAt) and apply it to the `GET /api/employees` fallback path (lines 2029 to 2049), `/api/auth/me` (lines 1957 to 1985), and any login response that builds an employee object (lines 1116, 1191, 1514, 1540)
    - _Requirements: 7.10, 24.4, 28.5_
    - Change_Report: `lib/publicProjections.js`, `server.js` (modified). Verify: `GET /api/employees` and `/api/auth/me` bodies contain none of the three column names; existing fields are unchanged.

  - [x] 18.7 Write property test for backup code hashing and legacy compatibility
    - **Property 41: Backup codes are stored hashed, legacy plaintext codes work once**
    - **Validates: Requirements 7.14, 28.3**
    - Hashed list never contains a plaintext code; a code is accepted at most once; legacy plaintext entries are accepted once and removed; wrong codes never match
    - Change_Report: `tests/totpBackupCodes.property.test.js` (added). Verify: passes.

- [x] 19. Purge Provision_Job passwords
  - [x] 19.1 Create `lib/provisionJobs.js`
    - `finishJob(deps, jobId, status, message)` runs one `UPDATE ... SET status=?, resultMessage=?, password='' ...` and clears the memory copy in the same call; idempotent on empty passwords; on clear failure keep the terminal status and retry up to 3 times at 5-second intervals (injected timer)
    - `sweepTerminalJobs(deps)` clears passwords for `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` in MySQL and memory
    - Both helpers also clear `agentKey` in the memory copy through `scrubJobSecrets` from `lib/agentKeyDelivery.js` (task 9.1); the key is never in MySQL (task 9.4), so only the memory and `database.json` copies need it
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.7_
    - Change_Report: `lib/provisionJobs.js` (added). Verify: Node REPL with a fake db shows a completed job ends with an empty password.

  - [x] 19.2 Use the helpers in `server.js`
    - Replace status updates in `job-result` (line 3693), the cancel path, and the timeout sweep (lines 2833 to 2846) with `finishJob`; keep the interim `scrubJobSecrets` calls from task 9.5 working through the helper; run `sweepTerminalJobs` during startup before the server accepts requests
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
    - Change_Report: `server.js` (modified). Verify: report a job result, then query the row; `password` is empty and status is set.

  - [x] 19.3 Write property test that terminal jobs hold no password
    - **Property 27: Terminal jobs hold no password**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.7**
    - Change_Report: `tests/provisionJobs.finish.property.test.js` (added). Verify: passes.

  - [x] 19.4 Write property test for the boot sweep
    - **Property 28: Boot sweep clears only terminal jobs**
    - **Validates: Requirements 9.4**
    - Change_Report: `tests/provisionJobs.sweep.property.test.js` (added). Verify: passes.

- [x] 20. One-time password Migration_Script
  - [x] 20.1 Create `scripts/migrate_passwords.js`
    - Pure `migrateRecords(records, fields, key)` returning `{ records, migrated, skipped, failed }`
    - CLI: `--dry-run` (counts only, no writes, no backup); without `--dry-run` and without `--confirm-backup` it exits non-zero before touching anything; otherwise back up `database.json` with a timestamped name, verify the copy exists with equal size, run the idempotent `MODIFY COLUMN` statements, encrypt rows, continue past per-row failures (log table and id only), print counts per source, exit non-zero if any row failed; 30-second connect timeout
    - Cover the TOTP columns too: `portal_users.two_factor_secret` and `portal_users.two_factor_temp_secret` (MySQL) and `portalUsers[].two_factor_secret` / `two_factor_temp_secret` (`database.json`), sealed with `sealTotpSecret` from task 18.1; the dry-run prints separate counts per source and field (client passwords, server passwords, job passwords, TOTP secrets, TOTP temp secrets). Backup codes are left as they are (legacy plaintext codes keep working until used, task 18.4)
    - MANDATORY manual gate (ASK FIRST): do NOT run this script without `--dry-run` against real data until the user confirms all three items in the checkpoint (task 21): (a) `scripts/backup_mysql.sh` was run and the `.sql.gz` file exists and is non-empty, (b) `database.json` was copied, (c) `PASSWORD_ENCRYPTION_KEY` is stored in two separate secure locations (`README.md` section from task 13.1). Writing this task's code is fine; executing the real migration modifies stored data and is reversible only from the backup. The script itself still requires `--confirm-backup`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 24.6_
    - Change_Report: `scripts/migrate_passwords.js` (added). Verify: `node scripts/migrate_passwords.js` with no flags exits non-zero with the backup message; `--dry-run` prints counts per source and field and changes nothing.

  - [x] 20.2 Write property test for encryption coverage and consistent counts
    - **Property 9: Migration encrypts every plaintext value and reports consistent counts**
    - **Validates: Requirements 8.1, 8.5, 8.7**
    - Change_Report: `tests/migrate.encrypts.property.test.js` (added). Verify: passes.

  - [x] 20.3 Write property test that migration is idempotent
    - **Property 10: Migration is idempotent**
    - **Validates: Requirements 8.5, 19.8**
    - Change_Report: `tests/migrate.idempotent.property.test.js` (added). Verify: passes.

  - [x] 20.4 Write property test that a dry run changes nothing
    - **Property 11: Dry run changes nothing and predicts the real run**
    - **Validates: Requirements 8.2**
    - Change_Report: `tests/migrate.dryrun.property.test.js` (added). Verify: passes.

  - [x] 20.5 Write property test that row failures are isolated
    - **Property 12: Migration isolates row failures**
    - **Validates: Requirements 8.6**
    - Change_Report: `tests/migrate.failures.property.test.js` (added). Verify: passes.

- [x] 21. Checkpoint - Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - ASK FIRST (mandatory gate before the real, non-dry-run Migration_Script run in task 20.1). Present this checklist and wait for the user to confirm every item:
    - (a) `scripts/backup_mysql.sh` (task 10.1) was run just now and the `.sql.gz` file exists and is non-empty (`ls -l`)
    - (b) `database.json` was copied to a safe location outside the repository
    - (c) `PASSWORD_ENCRYPTION_KEY` is stored in two separate secure locations (password manager and offline copy), never in the repository or the backup directory (`README.md` section from task 13.1)
    - (d) `scripts/migrate_passwords.js --dry-run` was run and its per-field counts look right
  - Ask the user to approve the optional `DROP DEFAULT` (task 15.2) and the `portal_users` column widening (task 18.3) separately.

### Phase 3: Data storage

- [x] 22. Entity tables and routes
  - [x] 22.1 Add the Entity_Tables
    - `CREATE TABLE IF NOT EXISTS` for `requests`, `renewals`, `migrations` (`id`, `status`, `createdAt`, `data LONGTEXT`, `idx_status`) and `deleted_servers` (`token` PK, `serverId`, `deletedAt`, `snapshot`) in `schema.sql` and `initMySQLDatabase`
    - On table-creation failure, log the table name, leave other tables untouched, and report startup failure
    - No drop, truncate, or delete of existing data
    - _Requirements: 10.1, 10.2, 10.3, 24.6_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: run `schema.sql` twice; zero errors and unchanged row counts.

  - [x] 22.2 Create `lib/entityStore.js`
    - MySQL, in-memory, and JSON-mode implementations of `list/get/put/remove/isDeleted/count`
    - `importLegacyEntities(store, sources, log)`: per entity, one transaction; skip when count > 0; de-duplicate by id (token for tombstones, first wins); roll back and log the table on error; read `database.json` only
    - `deleteServerWithTombstones` and `restoreServer` helpers (tombstone terms: id, `ip:port`, bare IP, name, lowercased)
    - _Requirements: 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.11, 10.12, 10.13_
    - Change_Report: `lib/entityStore.js` (added). Verify: Node REPL import into an empty memory store twice; second run adds 0 rows.

  - [x] 22.3 Write property test that the entity store matches a model
    - **Property 29: Entity store matches a simple model**
    - **Validates: Requirements 10.4, 10.5**
    - Change_Report: `tests/entityStore.model.property.test.js` (added). Verify: passes.

  - [x] 22.4 Write property test for legacy import
    - **Property 30: Legacy import is correct and idempotent**
    - **Validates: Requirements 10.6, 10.7, 10.8, 10.11, 19.7**
    - Change_Report: `tests/entityStore.import.property.test.js` (added). Verify: passes.

  - [x] 22.5 Move requests and renewals routes to the entity store
    - Replace `memoryStore.requests` / `memoryStore.renewals` reads and writes with `entityStore` calls in MySQL mode; JSON mode keeps current behavior; response shapes unchanged
    - _Requirements: 10.4, 10.5, 24.4_
    - Change_Report: `server.js` (modified). Verify: create, update, and list a request and a renewal; fields match the pre-change shape; rows exist in the MySQL tables.

  - [x] 22.6 Move migrations routes to the entity store and run the startup import
    - Switch migration records to `entityStore`, storing the migration password via `sealPassword` and never returning it in logs or responses
    - Run `importLegacyEntities` for all four entities during startup before listening
    - _Requirements: 10.4, 10.5, 10.6, 10.10, 10.11_
    - Change_Report: `server.js` (modified). Verify: restart with a populated `database.json`; table counts equal unique source ids; `database.json` hash is unchanged by the import.

  - [x] 22.7 Move deleted-servers handling to tombstone rows
    - Server delete route: insert tombstones plus snapshot and remove the server in one transaction; failure rolls back and returns an error; re-adding a server removes its tombstones; `isDeleted` checks read the table
    - ASK FIRST: this removes rows from `vps_servers` as part of the existing delete flow (no change in semantics). No other deletion is added.
    - _Requirements: 10.4, 10.12, 10.13, 24.6_
    - Change_Report: `server.js` (modified). Verify: delete a server; it leaves `vps_servers` and its tombstones exist; a forced tombstone failure leaves the server active.

  - [x] 22.8 Write property test for server deletion tombstones
    - **Property 31: Server deletion tombstones**
    - **Validates: Requirements 10.12, 10.13**
    - Change_Report: `tests/entityStore.tombstones.property.test.js` (added). Verify: passes.

- [x] 23. Storage mode and database failure behavior
  - [x] 23.1 Add `allowJsonFallback` and storage settings to config
    - In production `allowJsonFallback` is true only when `ALLOW_JSON_FALLBACK === '1'`; other non-empty values add a "value ignored" warning; always true outside production; document in `.env.example`
    - _Requirements: 11.3, 11.5, 11.6_
    - Change_Report: `lib/config.js`, `.env.example` (modified). Verify: `ALLOW_JSON_FALLBACK=yes` in production yields a warning and fallback disabled.

  - [x] 23.2 Fail loudly when MySQL is unavailable in production
    - 30-second startup deadline; unreachable MySQL in production without fallback logs an error, creates or modifies no `database.json`, exits non-zero
    - `db.query` wrapper throws `DbUnavailableError`; Express error middleware maps it to `503 { error: 'Database unavailable' }`; generic 500 body otherwise (no stack, redacted logs)
    - One storage-mode log line: `Storage mode: MySQL` or `Storage mode: JSON fallback`, plus config warnings. Convert only the tables touched by this spec; document remaining `.catch(() => {})` writes as a gap (Open Issue 6)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 24.5_
    - Change_Report: `server.js` (modified). Verify: production with MySQL stopped exits non-zero within 30 s and leaves `database.json` untouched; a query failure at runtime returns 503.

- [x] 24. Disable disk persistence in production
  - Facts: `loadDiskDatabase()` (`server.js` line 325) runs at module load (`let memoryStore = loadDiskDatabase();`, line 417) and reads `database.json` (path at line 129). `saveDiskDatabase()` (line 388) rewrites the whole file and has 69 call sites. With MySQL as the store, the file duplicates passwords, 2FA data, and sessions in plaintext JSON.
  - [x] 24.1 Create `lib/diskPersistence.js`
    - `createDiskPersistence({ config, filePath, fsImpl, log })` returning `{ enabled, load(), save(payload), readLegacyFile() }`. `enabled` is false when `config.isProduction && !config.allowJsonFallback` (task 23.1). When disabled: `load()` returns the empty defaults without touching the file, `save()` is a no-op for ALL collections (no `writeFileSync`), and the module logs once: `Disk persistence: DISABLED (production, MySQL is the only store)`; when enabled it logs `Disk persistence: ENABLED (JSON fallback)`
    - `readLegacyFile()` reads and parses the file explicitly (with the existing junk-user and junk-request filters from lines 331 to 340) and is used only by the one-time legacy import (`importLegacyEntities`, task 22.2); it never writes
    - `save()` strips job secrets (`scrubJobSecrets`, task 9.1) from `provisionJobs` before writing so the plaintext `agentKey` and job passwords never reach the file
    - _Requirements: 11.2, 11.3, 11.5, 11.6, 24.4, 24.5, 29.1, 29.2, 29.3, 29.4_
    - Change_Report: `lib/diskPersistence.js` (added). Verify: Node REPL with a fake `fsImpl`: disabled mode records zero writes and zero reads; enabled mode writes.

  - [x] 24.2 Wire it into `server.js`
    - Replace the bodies of `loadDiskDatabase` and `saveDiskDatabase` with thin wrappers over `lib/diskPersistence.js` so the 69 call sites stay unchanged; `importLegacyEntities` calls `readLegacyFile()`; keep the log line at startup
    - ASK FIRST: before the first production start with persistence disabled, the user confirms MySQL already holds the data that used to live only in `database.json` (compare counts of `users`, `servers`, `portalUsers`, `tickets` in the file against the MySQL tables; the Change_Report includes the comparison). Anything that exists only in the file would no longer be loaded.
    - _Requirements: 11.2, 11.3, 11.5, 24.4, 24.5, 29.1, 29.2_
    - Change_Report: `server.js` (modified). Verify: production start: the log shows persistence DISABLED and the SHA-256 of `database.json` is identical before and after a login, a client create, and a telemetry post; with `ALLOW_JSON_FALLBACK=1` the file changes.

  - [x] 24.3 Write tests that production never writes `database.json`
    - Use a temp `DB_FILE_PATH`. Production mode (no `ALLOW_JSON_FALLBACK`): `save()` for every collection leaves the file hash unchanged, `load()` performs no read, `readLegacyFile()` still reads. `ALLOW_JSON_FALLBACK=1`: `save()` changes the hash and `load()` reads
    - _Requirements: 11.2, 11.5, 11.6, 24.4, 24.5, 29.1, 29.2_
    - Change_Report: `tests/diskPersistence.test.js` (added). Verify: passes.

- [x] 25. Move memory-only and JSON-only data into MySQL
  - Inventory seed (verified by grep on `memoryStore.<name>`, 19 collections): `servers`, `users`, `portalUsers`, `deletedServers`, `dailyUserActivity`, `migrations`, `tickets`, `sessionEvents`, `sessions`, `provisionJobs`, `monitoringAlerts`, `duplicateLoginEvents`, `hardwareHistory`, `telemetryHistory`, `requests`, `renewals`, `inactivityTracker`, `auditLogs`, `workspaceRequests`. Boot loads from MySQL exist for `client_subscriptions` (line 926), `vps_servers` (951), `vps_hardware_history` (962, limit 500), `support_tickets` (968), `user_inactivity_tracker` (971), `server_session_events` (974, limit 1000), `daily_user_activity` (977), `server_monitoring_alerts` (993, ACTIVE only), `server_telemetry` (996), `portal_users` (1036), `audit_logs` (1051, limit 200), `vps_provision_jobs` (1054, PENDING only), `duplicate_login_events` (1080). `requests`, `renewals`, `migrations`, `deletedServers` are handled in task 22.
  - [x] 25.1 Inventory and verify the list (report only)
    - Re-run `grep -o "memoryStore\.[A-Za-z]*" server.js | sort | uniq -c` and, for each collection, record in the Change_Report: MySQL table, loaded at boot (with limit or filter), written on change (and whether the write is `.catch(() => {})`), and the gap. Seed gaps to confirm or refute: `workspaceRequests` (public request-demo leads, `server.js` lines 1546 to 1567, no table); `telemetryHistory` (table `server_telemetry_history` created at line 837, insert at line 3537, read at line 4913 with a memory fallback at line 4975: verify the read path); `provisionJobs` (only `PENDING` loaded at boot, line 1054; `job-result` looks up memory only, lines 3697 to 3698, so a job that was `PROCESSING` before a restart can never be completed); `hardwareHistory` (memory cap 500 at lines 1342 to 1343 and boot limit 500 at line 962); `sessionEvents` / `duplicateLoginEvents` (limit 1000), `auditLogs` (limit 200 at boot; the audit route at line 7941 reads MySQL), `monitoringAlerts` (ACTIVE only), `inactivityTracker`, `dailyUserActivity`, `sessions`, `tickets`, `portalUsers`, `users`, `servers` fallbacks
    - Server runtime attributes with no column (set at `server.js` lines 1030 to 1031, 2322 to 2323, 3095 to 3099, 3129 to 3130, 3152 to 3285, 3442 to 3457): `agentAliases`, `lastHardware` (the hardware drift baseline), `hardware`, `physicalDisks`, `occupiedDrives`, `tallyVersions`, `processAlerts`, `lastOptimizedAt`, `lastKnownAllUsers`, `lastKnownDisabledUsers`, `agentVersion` (line 3127). `schema.sql` `vps_servers` (lines 14 to 31) has none of them
    - Client and ticket fields with no column: `tallyVersion` (set at lines 2744, 3744, 4158, 4235, 4259), `isDisabled` (lines 3779, 4321, 4387; `client_subscriptions` has no such column, only `status`), `source` on tickets (`support_tickets` has no such column)
    - No files change in this task; the findings drive tasks 25.2 to 25.10
    - _Requirements: 10.4, 11.2, 24.4, 24.5, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_
    - Change_Report: no files changed. Verify: the report lists all 19 collections and every attribute above with a confirmed or refuted gap.

  - [x] 25.2 Fix the `UPDATE \`clients\`` bug
    - The migration relay, rollback, and reset code runs `UPDATE \`clients\` SET serverId=?, drive=?, status=?, isDisabled=0 WHERE id=?` (`server.js` lines 3782, 4325, 4391), but the table is `client_subscriptions` (`schema.sql` line 38; there is no `clients` table) and it has no `isDisabled` column. The `.catch(() => {})` hides the failure, so the new server, drive, and status are never saved to MySQL. Change the statements to `UPDATE \`client_subscriptions\` SET serverId=?, drive=?, status=? WHERE id=?`, log failures instead of swallowing them, and keep `isDisabled` in memory only until task 25.8 decides on it
    - _Requirements: 10.4, 24.4, 24.5, 31.5_
    - Change_Report: `server.js` (modified). Verify: `grep -n "UPDATE \`clients\`" server.js` has no match; after a migration relay the `client_subscriptions` row shows the new `serverId` and `drive`.

  - [x] 25.3 Add the `workspace_requests` table and persist demo leads
    - `CREATE TABLE IF NOT EXISTS workspace_requests` (`id`, `createdAt`, `status`, `data LONGTEXT`, `idx_status`) in `schema.sql` and `initMySQLDatabase`; `POST /api/public/request-demo` (line 1546) inserts the lead and keeps the in-memory copy; boot loads the table into `memoryStore.workspaceRequests`; any existing `database.json` leads are imported once through `readLegacyFile()` (empty-table rule, as in task 22.2)
    - _Requirements: 10.1, 10.4, 10.6, 24.4, 24.5, 31.1_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: submit a demo request, restart the server, and the lead is still listed; running init twice causes no error.

  - [x] 25.4 Add the `meta` column to `vps_servers`
    - `schema.sql`: `meta LONGTEXT DEFAULT NULL`; `initMySQLDatabase`: repeat-safe `ALTER TABLE vps_servers ADD COLUMN meta LONGTEXT DEFAULT NULL` (ignore "duplicate column"); no data dropped
    - ASK FIRST: this alters the existing `vps_servers` table (adds one nullable column; reversible with `DROP COLUMN`, which would lose only the new data).
    - _Requirements: 10.1, 24.6, 24.7, 31.2_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: run init twice; no error; existing rows unchanged and `meta` is `NULL`.

  - [x] 25.5 Create `lib/serverMeta.js`
    - `pickMeta(server)` returns a JSON-safe object of `agentAliases`, `lastHardware` (drift baseline), `hardware`, `physicalDisks`, `occupiedDrives`, `tallyVersions`, `processAlerts`, `lastOptimizedAt`, `lastKnownAllUsers`, `lastKnownDisabledUsers`, `agentVersion`; `applyMeta(server, metaJson)` merges it back (invalid JSON is ignored with no throw); `metaChanged(prevHash, meta)` for write throttling
    - _Requirements: 10.4, 24.4, 24.5, 31.2, 31.7_
    - Change_Report: `lib/serverMeta.js` (added). Verify: Node REPL: `applyMeta({}, JSON.stringify(pickMeta(s)))` restores every listed field.

  - [x] 25.6 Write property test for the server meta round trip
    - **Property 42: Server runtime attributes survive a store and load round trip**
    - **Validates: Requirements 10.4, 31.7**
    - Change_Report: `tests/serverMeta.property.test.js` (added). Verify: passes.

  - [x] 25.7 Persist and load the server meta
    - Telemetry handler (`/api/agent/telemetry`, line 2857 onward): after the existing in-memory updates, write `meta` with a single `UPDATE vps_servers SET meta=? WHERE id=?` when `metaChanged`, at most once per 60 seconds per server, except the drift baseline (`lastHardware`, lines 3152 to 3285), which is written immediately when it changes; failures are logged, not swallowed
    - Boot (`vps_servers` load, line 951): `applyMeta` for every row. Telemetry-only fields keep their current precedence rules
    - _Requirements: 10.4, 24.4, 24.5, 31.2_
    - Change_Report: `server.js` (modified). Verify: post telemetry with hardware values, restart, and the first telemetry after restart raises no false hardware-change event; `lastHardware` is present after boot.

  - [x] 25.8 Persist client `tallyVersion` and ticket `source`
    - ASK FIRST: add `client_subscriptions.tallyVersion VARCHAR(50) DEFAULT ''` and `support_tickets.source VARCHAR(30) DEFAULT ''` with repeat-safe `ALTER TABLE ... ADD COLUMN` (existing tables; nullable defaults; reversible with `DROP COLUMN`). Derive `isDisabled` from `status` instead of storing it (no column)
    - Write and read both fields at the client and ticket insert / update / boot-load sites
    - _Requirements: 10.1, 10.4, 24.6, 24.7, 31.3_
    - Change_Report: `schema.sql`, `server.js` (modified). Verify: set a client `tallyVersion`, restart, and it is still set; a ticket created from the customer portal keeps its `source`.

  - [x] 25.9 Fix the job-result and history read paths
    - `/api/agent/job-result` (line 3693): when the job is not in `memoryStore.provisionJobs`, load it by id from `vps_provision_jobs`, then complete it as usual (so a result that arrives after a restart is not lost)
    - Verify and document the telemetry history read (`server_telemetry_history`, read at line 4913): the time-range filter returns MySQL rows after a restart, and the memory fallback (line 4975) is used only when MySQL is unavailable. Record in the Change_Report whether the boot caps (hardwareHistory 500, sessionEvents 1000, duplicateLoginEvents 1000) hide data the UI needs; fix only `hardwareHistory` by reading older rows from MySQL on request if the UI needs them (ASK FIRST if so)
    - _Requirements: 9.1, 10.4, 24.4, 24.5, 31.4_
    - Change_Report: `server.js` (modified). Verify: queue a job, mark it `PROCESSING`, restart the server, post a result: the row becomes `COMPLETED` with an empty password.

  - [x] 25.10 Stop swallowing MySQL write errors for the inventoried tables
    - Create `lib/dbWrite.js` (`safeWrite(label, promiseFactory, log)` that logs table and error code, never the SQL parameters, and returns a boolean) and use it in place of `.catch(() => {})` for the writes of the tables in the inventory (clients, servers, tickets, inactivity, session events, daily activity, alerts, duplicate events, portal users, audit logs, provision jobs). With disk persistence off in production (task 24), a swallowed error means silent data loss
    - If the diff in `server.js` grows too large, split by table group
    - _Requirements: 11.2, 24.4, 24.5, 31.6_
    - Change_Report: `lib/dbWrite.js` (added), `server.js` (modified). Verify: with a failing fake pool, a client update logs one error line with the table name and no SQL parameters.

- [x] 26. Checkpoint - Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Infrastructure fixes

- [x] 27. Binding, configuration completion, and startup order
  - [x] 27.1 Complete `lib/config.js`
    - Add `host` (`HOST`, default `127.0.0.1`), `portalBaseUrl` (valid `http`/`https`, trailing `/` stripped, fatal when missing in production, default `http://127.0.0.1:<PORT>` otherwise), `corsAllowedOrigins`, translate settings (`TRANSLATE_ENABLED === '1'` and non-empty `TRANSLATE_API_KEY`), and the helpers `buildPortalUrl(config, path)` and `isOriginAllowed(config, origin)`
    - Document `PORTAL_BASE_URL`, `HOST`, `CORS_ALLOWED_ORIGINS`, `TRANSLATE_*` in `.env.example`
    - _Requirements: 12.1, 12.2, 13.1, 13.2, 13.4, 13.6, 13.7, 13.8, 16.1, 16.3_
    - Change_Report: `lib/config.js`, `.env.example` (modified). Verify: `PORTAL_BASE_URL=ftp://x` fails naming `PORTAL_BASE_URL`; trailing slashes are stripped.

  - [x] 27.2 Reject an `http` `PORTAL_BASE_URL` in production
    - In `lib/config.js`: when `NODE_ENV=production`, `PORTAL_BASE_URL` must use `https`; an `http` value is a startup problem whose message names `PORTAL_BASE_URL` (collected with the other problems); `http` stays allowed outside production
    - `.env.example`: document the rule and why: agents download the installer and the agent binary (`InnovationVpsAgent.exe`) and receive Agent_Keys through URLs built from this value (`buildPortalUrl`), so plain http would expose them
    - _Requirements: 13.1, 13.2, 13.6, 13.7, 12.2, 25.1, 25.2, 25.3, 25.4_
    - Change_Report: `lib/config.js`, `.env.example` (modified). Verify: `NODE_ENV=production PORTAL_BASE_URL=http://x.example` fails naming `PORTAL_BASE_URL`; `https://x.example` passes; `http://127.0.0.1:5000` passes when `NODE_ENV` is not production.

  - [x] 27.3 Write property test for environment validation
    - **Property 21: Environment validation**
    - **Validates: Requirements 4.1, 4.8, 7.6, 11.5, 11.6, 12.1, 12.2**
    - Change_Report: `tests/config.env.property.test.js` (added). Verify: passes.

  - [x] 27.4 Write property test for base URL normalization
    - **Property 22: Portal base URL normalization**
    - **Validates: Requirements 13.1, 13.2, 13.6, 13.7**
    - Extended for task 27.2: in production every generated `http://` value is rejected with an error naming `PORTAL_BASE_URL`, every `https://` value is accepted and normalized; outside production both schemes are accepted
    - Change_Report: `tests/config.baseurl.property.test.js` (added). Verify: passes.

  - [x] 27.5 Extract `bootstrap()` and fix binding in `server.js`
    - `async function bootstrap(deps)` runs config, DB init, purge sweep, entity import, and seeding before `listen`; export it next to `app`
    - `app.listen(config.port, config.host)`; log the actual bound address and port; remove the "Bound to 0.0.0.0" text; `error` handler logs the address and port and exits non-zero
    - `unref()` the two module-level `setInterval` handles; skip `dotenv.config()` when `TEST_MODE === '1'`
    - _Requirements: 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 18.3, 18.6_
    - Change_Report: `server.js` (modified). Verify: default start logs `127.0.0.1:<port>`; occupying the port makes the process exit non-zero with an error naming the address; importing `app` under `TEST_MODE=1` leaves the process able to exit.

- [x] 28. Configurable hostname and CORS
  - [x] 28.1 Replace hardcoded hostnames in `server.js`
    - Use `buildPortalUrl` for migration `uploadUrl`/`downloadUrl`, the telemetry URL, and installer portal URLs (around lines 2410, 3745, 4181, 4260, 6553, 6798, 6866); ignore `Host` and `x-forwarded-host`
    - CORS uses `isOriginAllowed`; remove the `localhost`, `127.0.0.1`, and `.innovationwebworks.in` allowances
    - _Requirements: 13.3, 13.4, 13.5, 24.4_
    - Change_Report: `server.js` (modified). Verify: `grep "innovationwebworks" server.js` shows no URL constants; a request with a foreign `Origin` gets no CORS allow header.

  - [x] 28.2 Write property test that portal URLs and CORS use only configuration
    - **Property 23: Portal URLs and CORS use only configuration**
    - **Validates: Requirements 13.3, 13.4, 13.5**
    - Change_Report: `tests/config.urls.property.test.js` (added). Verify: passes.

- [x] 29. Rate limit correctness
  - [x] 29.1 Create `lib/rateLimit.js` with `applyRateLimit`
    - Await `checkRateLimit` (injected); exceeded returns 429 with `retryAfterSeconds`; limiter error returns 429 in production and allows otherwise, logging once per failed request
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
    - Change_Report: `lib/rateLimit.js` (added). Verify: Node REPL shows requests beyond the limit receive 429.

  - [x] 29.2 Fix the forgot-password route and audit other call sites
    - Replace the un-awaited call (around line 8761) with `applyRateLimit`; confirm every other `checkRateLimit(` call is awaited
    - This restores password-reset OTP requests, which currently always return 429 (Open Issue 3)
    - _Requirements: 17.1, 17.2, 17.5_
    - Change_Report: `server.js` (modified). Verify: the first forgot-password request is not 429; request N+1 within the window is 429 with `retryAfterSeconds`.

  - [x] 29.3 Write property test for rate limiting
    - **Property 33: Rate limiter blocks everything past the limit**
    - **Validates: Requirements 17.2, 17.3, 17.4, 17.5**
    - Change_Report: `tests/rateLimit.property.test.js` (added). Verify: passes.

  - [x] 29.4 Add env-configurable limits for the public endpoints
    - `lib/config.js`: `rateLimits` built from `RATE_LIMIT_<NAME>_MAX` and `RATE_LIMIT_<NAME>_WINDOW_SEC` with documented defaults (invalid values add a problem naming the variable). Defaults: `REQUEST_DEMO` 5 per 1 hour per IP; `VERIFY_CUSTOMER` 5 per 1 hour per IP and 3 per 1 hour per username+phone identifier (hard limit, because the route confirms whether a username and phone pair exists, which allows account enumeration); `PUBLIC_TICKETS` 10 per 1 hour per IP; `RESET_PASSWORD` 5 per 15 minutes per IP and per username; `OTP_VERIFY` 5 per 15 minutes per username; `VALIDATE_LOGIN` 5 per 15 minutes per `preAuthToken` and 20 per 15 minutes per IP; `AGENT_AUTH_FAIL` 30 per 5 minutes per IP
    - `lib/rateLimit.js`: `rateLimitKey(name, ip, identifier)` helper; `.env.example`: list every variable with its default
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 24.4, 24.5, 30.1, 30.2, 30.6_
    - Change_Report: `lib/config.js`, `lib/rateLimit.js`, `.env.example` (modified). Verify: `RATE_LIMIT_REQUEST_DEMO_MAX=abc` fails naming that variable; defaults appear in `loadConfig({})`.

  - [x] 29.5 Rate limit the public endpoints
    - Apply `applyRateLimit` (per `req.clientIp` from task 3.5, plus the per-identifier key where listed in task 29.4) to `POST /api/public/request-demo` (line 1546), `POST /api/public/verify-customer` (line 8236), `POST /api/public/tickets` (line 8288), `POST /api/forgot-password/reset-password` (line 8844) and its OTP check (the `otpVerify` store exists at line 201 but is never used, so the OTP can be guessed today). Add the new limiter types to `rateLimitStores` (lines 199 to 201)
    - Exceeded: `429 { success: false, error, retryAfterSeconds }`; keep the existing response shape otherwise; verify-customer returns the same generic failure for unknown and wrong-phone cases
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 24.4, 30.1, 30.2, 30.3, 30.4_
    - Change_Report: `server.js` (modified). Verify: the sixth `verify-customer` request within the window from one IP returns 429 with `retryAfterSeconds`; the fourth attempt for one username+phone from different IPs returns 429.

  - [x] 29.6 Rate limit 2FA login validation and agent authentication failures
    - `POST /api/auth/2fa/validate-login` (line 1699): limit per `preAuthToken` and per `req.clientIp`; exceeding the per-token limit deletes the pre-auth entry so the user must sign in again
    - Agent auth failures: in the middleware from task 4.1 / 5.2, count each failed authentication per `req.clientIp` and answer 429 with `retryAfterSeconds` once `AGENT_AUTH_FAIL` is exceeded (successful requests are never counted; the 401 body stays the single fixed one before the limit)
    - _Requirements: 1.3, 1.11, 17.1, 17.2, 17.3, 30.3, 30.5_
    - Change_Report: `lib/agentAuth.js`, `server.js` (modified). Verify: six wrong 2FA codes with one `preAuthToken` return 429; 31 keyless agent requests from one IP in `enforce` mode end in 429 and a valid agent from another IP is unaffected.

  - [x] 29.7 Write unit tests for the public limit table
    - With a fake limiter and fake req / res: each limit name resolves to its configured maximum and window; the per-IP and per-identifier keys are independent; the 429 body has `retryAfterSeconds`; env overrides change the limits
    - _Requirements: 17.2, 17.3, 17.4, 30.3, 30.6_
    - Change_Report: `tests/rateLimit.public.test.js` (added). Verify: passes.

- [x] 30. Translation resilience
  - [x] 30.1 Create `lib/translate.js`
    - `translateText({ text, config, fetchImpl, timeoutMs = 5000 })` resolving `{ translatedText, status }` (`ok`, `disabled`, `failed`, `skipped`); skip empty or over-5000-character text; official v2 endpoint with the key in `X-goog-api-key`; timeout via `AbortController`; never throws; never logs the key
    - _Requirements: 16.1, 16.2, 16.3, 16.5, 16.8_
    - Change_Report: `lib/translate.js` (added). Verify: Node REPL with `TRANSLATE_ENABLED` unset returns the original text and status `disabled` without calling fetch.

  - [x] 30.2 Write property test that translation never fails the caller
    - **Property 32: Translation never fails the caller**
    - **Validates: Requirements 16.2, 16.3, 16.5, 16.8**
    - Change_Report: `tests/translate.property.test.js` (added). Verify: passes.

  - [x] 30.3 Wire the translate route
    - `/api/ai/translate` uses `translateText`, keeps the existing pre/post-processing, always returns HTTP 200 `{ success: true, translatedText, translateStatus }`; remove the `clients5.google.com` call
    - _Requirements: 16.1, 16.2, 16.4, 16.5, 16.8, 24.4_
    - Change_Report: `server.js` (modified). Verify: `grep "clients5.google.com" server.js` has no match; disabled mode returns the original text.

  - [x] 30.4 Simplify the frontend translate helper
    - `src/utils/nlpTranslate.js` calls only `/api/ai/translate`; remove the direct `clients5.google.com` and MyMemory fallbacks; on `disabled`/`failed`/`skipped`, non-200, or a network error return the original text with no dialog
    - _Requirements: 16.4, 16.6, 16.7_
    - Change_Report: `src/utils/nlpTranslate.js` (modified). Verify: `grep -ri "mymemory\|clients5" src/` has no match; a failed request returns the original text.

  - [x] 30.5 Write unit tests for the frontend translate helper
    - Cover `disabled`, `failed`, non-200, and network error returning the original text
    - _Requirements: 16.6, 16.7_
    - Change_Report: `tests/nlpTranslate.test.js` (added). Verify: passes.

- [x] 31. Protect uploaded files
  - [x] 31.1 Authenticate voice notes and stop serving migration archives
    - Replace the blanket `/uploads` static mount with an authenticated `/uploads/voice-notes` mount (`index: false`, `dotfiles: 'deny'`); stop serving `uploads/migrations`; add `path.sep` to the four traversal guards (around lines 4443, 4563, 4730, 4739)
    - ASK FIRST (Open Issue 8): confirm customer-portal sessions must also play voice notes and which auth middleware to use. No files are deleted.
    - _Requirements: 1.5, 10.10, 24.4, 24.5_
    - Change_Report: `server.js` (modified). Verify: unauthenticated `GET /uploads/voice-notes/x.webm` is 401; `GET /uploads/migrations/<id>.zip` is 404 for everyone.

- [x] 32. Session cookie flags
  - Facts: `finalizeEmployeeLogin` (`server.js` line 1468) sets `vps_session_id` at lines 1522 to 1528 with `secure: req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'` (the header can be spoofed by a client), `httpOnly: true`, `sameSite: 'lax'`, `path: '/'` and no `maxAge`. Logout clears the cookie with the same expression (lines 1942 to 1948); `/api/auth/beacon-logout` clears it with no options (line 2020). The session lifetime is `SESSION_MAX_AGE_MS` (line 1104).
  - [x] 32.1 Fix the cookie options and use identical options when clearing
    - Create `lib/sessionCookie.js` with `sessionCookieOptions({ config, req, maxAgeMs })` returning `{ httpOnly: true, secure: config.isProduction || req.secure, sameSite: 'lax', path: '/', maxAge: maxAgeMs }` with `maxAgeMs` passed in from `SESSION_MAX_AGE_MS` (`req.secure` is trustworthy because task 3.5 makes `trust proxy` list-based) and `sessionClearOptions(...)` (the same options without `maxAge`)
    - Use them in `finalizeEmployeeLogin`, `/api/auth/logout`, and `/api/auth/beacon-logout`; no header-derived value remains
    - ASK FIRST: `sameSite: 'strict'` is a possible further hardening, but check the customer portal flow (links opened from email or WhatsApp land on the portal while logged in) before choosing it; keep `'lax'` unless the user approves.
    - _Requirements: 24.4, 24.5, 32.1, 32.2, 32.3_
    - Change_Report: `lib/sessionCookie.js` (added), `server.js` (modified). Verify: in production mode a login response has `Set-Cookie: vps_session_id=...; HttpOnly; Secure; SameSite=Lax; Max-Age=86400; Path=/`; a request with a forged `x-forwarded-proto: https` over plain http in test mode does not get `Secure`.

  - [x] 32.2 Write a test for the cookie flags
    - Unit level with a fake `res` capturing `cookie()` and `clearCookie()` arguments: HttpOnly always; Secure when `isProduction` or `req.secure`; not Secure for a spoofed header; SameSite set; `maxAge` equals `SESSION_MAX_AGE_MS`; the clearing options equal the setting options (minus `maxAge`) for logout and beacon-logout. The HTTP-level `Set-Cookie` assertion is in task 36.1
    - _Requirements: 24.4, 24.5, 32.1, 32.2, 32.3_
    - Change_Report: `tests/sessionCookie.flags.property.test.js` (added). Verify: passes.

- [x] 33. Development script and dependency security
  - [x] 33.1 Add `dev:all` with `concurrently`
    - Add `concurrently` pinned to an exact version; `dev:all` = `concurrently -k -s first -n backend,vite -c blue,green "node server.js" "vite"`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
    - Change_Report: `package.json` (modified). Verify: `npm run dev:all` shows `[backend]` and `[vite]` prefixes; stopping one process stops the other; Ctrl+C ends both within 5 s.

  - [x] 33.2 Replace the vulnerable `xlsx` dependency
    - Install the maintained SheetJS release pinned to an exact version; keep the used API surface (`XLSX.read(..., { type: 'array', cellDates: true })`, `sheet_to_json`, `SSF.parse_date_code`); adjust `BulkSharedVpsImportModal.jsx` only if needed; parse before writing any data and keep the existing error state
    - ASK FIRST (Open Issue 7): installing from the SheetJS CDN tarball URL is a policy choice; also ask before any major upgrade of other packages. Record the `npm audit` date, counts per severity, and each affected package with version, plus advisory, range, and mitigation for unfixable high/critical items in the Change_Report.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
    - Change_Report: `package.json`, `src/components/BulkSharedVpsImportModal.jsx` (modified if needed). Verify: `npm audit` shows no `xlsx` advisory; importing a sample `.xlsx` shows the same rows as before.

  - [x] 33.3 Write a golden-file test for spreadsheet parsing
    - Parse sample `.xlsx` and `.csv` files and compare row count, headers, and cell values to stored expected output
    - _Requirements: 15.2_
    - Change_Report: `tests/xlsx.golden.test.js`, `tests/fixtures/*` (added). Verify: passes.

- [x] 34. Checkpoint - Phase 4 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 5: Tests

- [x] 35. Harden the test harness
  - [x] 35.1 Finish `tests/setup.js` and helpers
    - Mock `mysql2/promise` with the in-memory fake; guard `globalThis.fetch`, `http.request`, and `https.request` with "Unmocked outbound request to <host>"; redirect `DB_FILE_PATH` to a temp directory; global teardown compares the SHA-256 of the real `database.json` before and after; `tests/helpers/app.js` calls `bootstrap()` with fakes and seeds test users deterministically
    - _Requirements: 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_
    - Change_Report: `vitest.config.js`, `tests/setup.js`, `tests/globalTeardown.js`, `tests/helpers/app.js` (added/modified). Verify: `npm test` passes with no MySQL running and `database.json` unchanged; an unmocked `fetch` fails the test with the host named.

  - [x] 35.2 Create the in-memory MySQL fake
    - `tests/helpers/fakeMysql.js` supporting the queries used by the covered routes and transactions
    - _Requirements: 18.4_
    - Change_Report: `tests/helpers/fakeMysql.js` (added). Verify: tests using it make no network connection.

- [x] 36. Critical behavior tests
  - [x] 36.1 Write authentication and role tests
    - Login valid/invalid; 2FA valid/invalid with no session issued; role matrix (SUPER_ADMIN, EMPLOYEE, SALESPERSON) across one route per privilege level
    - HTTP-level `Set-Cookie` assertions (task 32): the login response has `HttpOnly`, `SameSite=Lax`, `Max-Age`, `Path=/`, and `Secure` in production mode (and when `req.secure`); a forged `x-forwarded-proto: https` over plain http does not add `Secure`; logout and beacon-logout send a clearing cookie with the same attributes
    - TOTP (task 18): a user with a sealed secret logs in; a legacy plaintext secret and legacy backup code still work once; `/api/auth/me` and `/api/employees` bodies never contain `two_factor_secret`, `two_factor_temp_secret`, or `two_factor_backup_codes`
    - _Requirements: 19.1, 19.2, 7.10, 24.4, 24.5, 28.5, 32.1, 32.2, 32.3_
    - Change_Report: `tests/auth.test.js`, `tests/roles.test.js` (added). Verify: passes.

  - [x] 36.2 Write agent authentication, proxy, and uploads tests
    - Valid/invalid/missing key in `enforce`; missing key in `warn` with a recorded warning; 401 on each of the ten Agent_Endpoints; spoofed headers ignored from an untrusted peer and honored from a trusted one; rotation (audit content, 403, 404, failing store); uploads auth
    - _Requirements: 1.5, 2.2, 2.3, 2.5, 2.6, 3.6, 19.3, 19.4_
    - Change_Report: `tests/agentAuth.endpoints.test.js`, `tests/proxy.test.js`, `tests/uploads.test.js` (added). Verify: passes.

  - [x] 36.3 Write provision flow and password reveal tests
    - Create a job, agent retrieves it with the plaintext, agent reports the result, stored password empty; SUPER_ADMIN reveal writes exactly one audit entry; other roles get 403 with nothing decrypted
    - Export (task 17.4): a default export has no password column and writes no audit entry; `includePasswords` without `confirm` or from a non-SUPER_ADMIN returns 403 and decrypts nothing; a SUPER_ADMIN export with `includePasswords` and `confirm` returns plaintext and writes exactly ONE audit entry (actor, row count, timestamp, no password text anywhere in it)
    - Job parameters (task 16): a provision request with an injection payload in `username`, `companyName`, or `drive` returns 400 with the generic message and queues nothing
    - _Requirements: 6.5, 6.12, 7.11, 7.12, 9.1, 19.5, 19.9_
    - Change_Report: `tests/provision.test.js`, `tests/reveal.test.js`, `tests/export.test.js` (added). Verify: passes.

  - [x] 36.4 Write property test that stored passwords are ciphertext
    - **Property 6: Stored Managed_Passwords are ciphertext**
    - **Validates: Requirements 7.7, 10.10**
    - Change_Report: `tests/storage.ciphertext.property.test.js` (added). Verify: passes.

  - [x] 36.5 Write property test that secrets never appear in logs or audits
    - **Property 8: Secrets never appear in logs or audit entries**
    - **Validates: Requirements 1.10, 2.2, 7.11, 7.13, 8.6**
    - Change_Report: `tests/secrets.logs.property.test.js` (added). Verify: passes.

  - [x] 36.6 Write property test that exports omit passwords unless a SUPER_ADMIN explicitly asks
    - **Property 25: Exports omit passwords by default and decrypt only for a confirming SUPER_ADMIN**
    - **Validates: Requirements 6.5, 6.12**
    - Generate clients with sealed passwords, roles, and `includePasswords` / `confirm` flags; assert: no password text or `enc:v1:` text unless role is SUPER_ADMIN and both flags are true; non-SUPER_ADMIN requests with `includePasswords` produce 403 and zero decrypt calls; the row count equals the number of clients and never contains `'Pass#123'`
    - Change_Report: `tests/export.property.test.js` (added). Verify: passes.

  - [x] 36.7 Write property test that a disabled internal secret never authenticates
    - **Property 26: Disabled internal secret never authenticates**
    - **Validates: Requirements 6.7**
    - Change_Report: `tests/internalSecret.property.test.js` (added). Verify: passes.

  - [x] 36.8 Write entity route and import tests
    - CRUD for requests, renewals, migrations, and deleted servers; importing the same dataset twice yields the same count as once
    - _Requirements: 10.4, 10.5, 19.7_
    - Change_Report: `tests/entities.routes.test.js` (added). Verify: passes.

  - [x] 36.9 Write the Migration_Script double-run test
    - Run the script twice on the same fake database: second run produces identical data, reports 0 migrated, and no error
    - _Requirements: 8.5, 19.8_
    - Change_Report: `tests/migrate.twice.test.js` (added). Verify: passes.

  - [x] 36.10 Write rate limit regression and startup decision tests
    - First forgot-password request is not 429; request beyond the limit is 429 with `retryAfterSeconds` and no token; production with MySQL down (11.1), runtime 503 with no JSON write (11.2), storage-mode log line (11.4), `PORTAL_BASE_URL` rules including http rejected in production (13.6, 13.7), `AGENT_AUTH_MODE` production default (4.6)
    - Public endpoint limits (task 29.5, 29.6): `request-demo`, `verify-customer` (per IP and per username+phone), `public/tickets`, `reset-password` / OTP verify, `2fa/validate-login` (per `preAuthToken` and per IP), and agent auth failures per IP each return 429 with `retryAfterSeconds` past the limit
    - _Requirements: 4.6, 11.1, 11.2, 11.4, 13.6, 13.7, 17.1, 17.2, 24.4, 25.1, 30.1, 30.3, 30.5_
    - Change_Report: `tests/ratelimit.test.js`, `tests/startup.test.js` (added). Verify: passes.

  - [x] 36.11 Write agent key delivery integration tests
    - Bulk delivery in `warn` mode queues `SET_AGENT_KEY` for up-to-date agents and `UPDATE_AGENT` only for agents with no or old `agentVersion`; 409 in `enforce`; 403 for non-SUPER_ADMIN
    - The key job is not returned to a telemetry or listen-jobs request from another IP or (in production) over plain http; it is returned once to the registered IP; after `job-result` `COMPLETED`, `FAILED`, or after the 15-minute expiry, the job in memory and the `database.json` temp file contain no key text and `vps_provision_jobs` never had one
    - `GET /api/agent-keys/status` returns the five fields per server and `readyForEnforce` true only after every server has a valid request within 10 minutes; a request carrying only `serverToken` is rejected in `enforce` mode
    - _Requirements: 4.2, 4.4, 9.1, 9.2, 9.3, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.11_
    - Change_Report: `tests/agentKeyDelivery.test.js` (added). Verify: passes.

  - [x] 36.12 Write persistence completeness tests
    - With the fake MySQL: after a simulated restart, `workspace_requests` leads, `vps_servers.meta` values (including the `lastHardware` drift baseline), client `tallyVersion`, and ticket `source` are restored; `job-result` for a job that was `PROCESSING` before the restart completes it; the migration relay updates `client_subscriptions` (not `clients`)
    - Production mode: no write to `database.json` happens during login, client create, telemetry post, and job completion (file hash unchanged); with `ALLOW_JSON_FALLBACK=1` the file is written
    - _Requirements: 10.4, 11.2, 11.5, 24.4, 24.5, 29.1, 29.2, 31.1, 31.2, 31.3, 31.4, 31.5_
    - Change_Report: `tests/persistence.test.js` (added). Verify: passes.

- [x] 37. Checkpoint - Phase 5 complete
  - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Operations

- [x] 38. Health endpoint
  - [x] 38.1 Create `lib/health.js` and register `GET /health`
    - Handler factory with injected `db` and timer; `SELECT 1` raced against 2000 ms; `200 { status: 'ok', db: 'up' }` or `503 { status: 'degraded', db: 'down' }`; body has only those two keys; registered before auth middleware; errors logged server-side only
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_
    - Change_Report: `lib/health.js` (added), `server.js` (modified). Verify: `curl /health` with no credentials returns 200 `{"status":"ok","db":"up"}`; with MySQL stopped returns 503 within 2.5 s.

  - [x] 38.2 Write property test that the health body leaks nothing
    - **Property 34: Health body leaks nothing**
    - **Validates: Requirements 22.3, 22.4, 22.5**
    - Change_Report: `tests/health.property.test.js` (added). Verify: passes.

- [x] 39. Process management
  - [x] 39.1 Create `ecosystem.config.cjs`
    - One app `portal-backend`, `script: 'server.js'`, `instances: 1`, `exec_mode: 'fork'`, `NODE_ENV=production`, `autorestart: true`, `max_memory_restart: '512M'`, `min_uptime: '10s'`, `max_restarts: 10`, `restart_delay: 1000`, separate `error_file` and `out_file`, `time: true`, `log_date_format: 'YYYY-MM-DD HH:mm:ss Z'`; add `pm2-logrotate` commands (10M, retain 14) as a comment for the Runbook
    - Comment next to `instances` / `exec_mode`: the portal keeps state in process memory (`memoryStore` at `server.js` line 417, the session cache fallback, `telemetryStore` line 2519, the long-poll emitters `agentJobEmitter` and `liveScreenWaiters` lines 16 to 21, `liveScreenStore` line 20, `preAuthStore` line 1459, `otpStore` line 8748, the in-memory rate-limit maps lines 199 to 201, and the agent key status map from task 5.2), so cluster mode or more than one instance would break correctness (a login, OTP, or long-poll could land on a different process than the one that holds its state)
    - _Requirements: 21.1, 21.2, 21.3, 21.5, 21.6, 21.7, 33.1, 33.2_
    - Change_Report: `ecosystem.config.cjs` (added). Verify: `node -e "const c=require('./ecosystem.config.cjs').apps[0]; console.log(c.instances, c.exec_mode)"` prints `1 fork`, and the rest of the settings above are present; on staging, `pm2 start` and kill the process to see a restart.

- [x] 40. Operations runbook
  - [x] 40.1 Write `RUNBOOK.md`
    - One top-level section per procedure: deployment, rollback, adding a VPS node, rotating Agent_Keys, switching `warn` to `enforce`, restoring a MySQL backup, and running the Migration_Script (`--dry-run` first). Numbered steps, expected results, and for each failure-prone step the symptom and action (continue, retry, or roll back); deployment lists every variable in `.env.example`
    - Key rotation: describe `graceMinutes` (Requirements 2.10 to 2.17, 23.5); task 54.5 updates this section for the grace window (Open Issue 2 resolved)
    - Add (these refer to earlier tasks instead of repeating them): the backup procedure and cron line from `scripts/backup_mysql.sh` (task 10.1); the PASSWORD_ENCRYPTION_KEY section (generate, two separate secure places, never in the repo or `BACKUP_DIR`, loss makes encrypted passwords unrecoverable, no rotation in the v1 format, restore test of backup plus key together; from task 13.1); delivering Agent_Keys to installed agents and the `warn` to `enforce` gate "only when `readyForEnforce` is true" with the rollback to `warn` (task 9.9); the `serverToken` retirement note (task 8.1: the backend ignores `serverToken` and `X-Server-Token`, `X-Server-Id` is only a hint, and a later agent release stops sending them once all agents are upgraded); the real Migration_Script gate checklist (checkpoint 21); and the single-instance rule for PM2 (task 39.1)
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 20.10_
    - Change_Report: `RUNBOOK.md` (added). Verify: review that each of the seven sections exists, the added sections above exist, and every `.env.example` variable appears in the deployment section.

- [x] 41. Static smoke checks
  - [x] 41.1 Write smoke tests for static requirements
    - No `Pass#123` in `server.js`/`schema.sql`; no `vps-internal-automation-2026`; no `Bound to 0.0.0.0`; no `clients5.google.com` or `mymemory` in `server.js`/`src/`; `.env.example` contains every variable referenced by `lib/config.js`; added tools pinned to exact versions; `dev:all` uses `concurrently`; `ecosystem.config.cjs` settings including `instances: 1` and `exec_mode: 'fork'`; agent scripts reference `X-Agent-Key`; no `serverToken` reference in `server.js`; no `UPDATE \`clients\`` statement in `server.js`; no `x-forwarded-proto` in the cookie code
    - _Requirements: 5.2, 6.1, 6.4, 6.6, 6.11, 12.4, 13.8, 14.1, 14.5, 16.4, 18.1, 21.1, 21.3_
    - Change_Report: `tests/staticRequirements.smoke.test.js` (added). Verify: passes.

- [x] 42. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm with the user that the Change_Report for every task is complete, and the Phase 1 to 6 open decisions (Open Issues 1, 2, 7, 8) are recorded.

- [x] 43. Deliver the `server.js` split plan (plan only)
  - [x] 43.1 Produce a written plan to split `server.js` into modules
    - Deliver the plan in the conversation or Change_Report only. Do not change any file and do not execute any step
    - List each proposed module and the responsibilities moved into it (for example config/bootstrap, session and auth middleware, agent routes, client routes, server routes, provisioning jobs, migration relay, tickets, translate/AI, audit, storage and MySQL init), in a safe extraction order
    - _Requirements: 24.8_
    - Change_Report: no files changed. Verify: the repository diff after this task is empty.

### Phase 7: Follow-up fixes from test findings

These tasks close the known issues the Phase 5 tests pinned down with `it.fails` / `it.skip` (RUNBOOK.md section 9). Each fix flips its pinned test to a normal test in the same task. Do not read `server.js` in full; locate code with `grep -n` and edit only the named blocks.

- [ ] 44. Configurable database file path
  - [x] 44.1 Honor `DB_FILE_PATH` in `server.js`
    - Read `process.env.DB_FILE_PATH` (default `<repo>/database.json`) once where the disk database path is defined (`grep -n "database.json" server.js`); use it for every read, write, and temp-file path of the disk store
    - Add `DB_FILE_PATH` with an empty placeholder and a one-line description to `.env.example`
    - _Requirements: 10.11, 24.4, 24.5, 29.5_
    - Change_Report: `server.js` (modified), `.env.example` (modified). Verify: with `DB_FILE_PATH=<temp>/db.json`, starting the server in test mode writes only to that file and leaves `<repo>/database.json` byte-for-byte unchanged; unset behaves as before.

  - [ ] 44.2 Remove the test workaround and add a test
    - Remove the workaround in `tests/helpers/*` that backs up, swaps, or restores the real `database.json`; point the harness at a per-run temp file through `DB_FILE_PATH` instead
    - Add a test that sets `DB_FILE_PATH`, triggers a save, and asserts the file appears at that path and the repo `database.json` hash is unchanged
    - _Requirements: 10.11, 18.1, 24.4, 29.5, 35.3_
    - Change_Report: `tests/helpers/*` (modified, at most 2 files), `tests/dbFilePath.test.js` (added). Verify: `npx vitest run tests/dbFilePath.test.js` passes; `git status` shows `database.json` unmodified after `npm test`.

- [ ] 45. Async route error handling for job-queue routes
  - [x] 45.1 Wrap the async job-queue routes
    - Add a small `asyncHandler(fn)` wrapper in `server.js` (or `lib/asyncHandler.js` if that keeps `server.js` edits smaller) that forwards rejections to the error path
    - Apply it to `POST /api/users`, `POST /api/users/:id/provision-vps`, and the `os-users/:username/change-password` route; a `JobParamError` returns HTTP 400 `{ error: 'Invalid request' }` (generic, no field names or values), and any other error keeps its current behavior
    - _Requirements: 24.4, 24.5, 27.4, 27.5_
    - Change_Report: `server.js` (modified), `lib/asyncHandler.js` (added only if used). Verify: a request with an invalid job parameter returns 400 with the generic body and the process logs no `unhandledRejection`.

  - [-] 45.2 Un-skip the provisioning tests
    - Change the 3 `it.skip` tests in `tests/provision.test.js` to `it`; adjust only their assertions to the generic 400 body
    - _Requirements: 18.1, 24.4, 27.4, 27.5, 35.4_
    - Change_Report: `tests/provision.test.js` (modified). Verify: `npx vitest run tests/provision.test.js` passes with 0 skipped.

- [ ] 46. HTTP 503 when the database is unavailable
  - [ ] 46.1 Return 503 from routes that swallow `DbUnavailableError`
    - In production (`config.isProduction`, no `ALLOW_JSON_FALLBACK=1`), make `GET /api/requests`, `GET /api/renewals`, `GET /api/servers`, `GET /api/employees`, the `/api/auth/login` fallback path, and `POST /api/public/tickets` respond `503 { error: 'Database unavailable' }` when `DbUnavailableError` is thrown, instead of returning an empty list or a fallback result
    - Log the underlying error server-side only; outside production keep current behavior
    - _Requirements: 11.1, 24.4, 24.5, 34.1, 34.2_
    - Change_Report: `server.js` (modified). Verify: with the DB layer forced to throw `DbUnavailableError` in production mode, each listed route returns 503 with exactly that body and no error detail.

  - [ ] 46.2 Flip the pinned startup tests
    - Change the two `it.fails` tests in `tests/startup.test.js` to normal `it`; extend them to cover the six routes above if they cover fewer
    - _Requirements: 11.1, 18.1, 34.1, 35.4_
    - Change_Report: `tests/startup.test.js` (modified). Verify: `npx vitest run tests/startup.test.js` passes with no `it.fails` left.

- [ ] 47. Strip the Agent_Key hash from server responses
  - [ ] 47.1 Remove `apiKey` from `GET /api/servers`
    - Add `apiKey` to the fields stripped by the server projection in `lib/publicProjections.js` and make sure `GET /api/servers` in `server.js` uses it for every server in the response (including the fallback path)
    - Check the frontend does not read `apiKey` (`grep -rn "apiKey" src/`); if it does, update that file in this task
    - _Requirements: 1.7, 24.4, 24.5, 34.3_
    - Change_Report: `lib/publicProjections.js` (modified), `server.js` (modified). Verify: `GET /api/servers` JSON contains no `apiKey` key at any depth; other fields are unchanged.

  - [ ] 47.2 Flip the `apiKey` test
    - Change the existing `it.fails` test to a normal test asserting the response omits `apiKey`; add a unit case for the projection
    - _Requirements: 1.7, 18.1, 34.3, 35.4_
    - Change_Report: the test file that holds the `it.fails` test (modified), `tests/publicProjections.test.js` (modified or added). Verify: both pass and no `it.fails` remains for this issue.

- [x] 48. Cumulative TOTP secret migration
  - Status note: the code fix and the test flip were already done together with task 20.1 (`scripts/migrate_passwords.js` now applies shared-collection sources cumulatively, and `tests/migrate.twice.test.js` uses a normal `it`). The only remaining work in this group is `RUNBOOK.md` known issue 9.3 (task 48.2). Do not re-do 48.1 or the test flip; verify them and update the Runbook. This task is intentionally left unticked.
  - [x] 48.1 Fix the `portalUsers` double-source overwrite
    - Already done with task 20.1: only confirm that `scripts/migrate_passwords.js` still applies the sources cumulatively (no code change expected)
    - In `scripts/migrate_passwords.js`, when `portalUsers` is read from both MySQL and `database.json`, merge per record so `two_factor_secret` and `two_factor_temp_secret` are both migrated cumulatively; a later source must not overwrite an earlier migrated value
    - Keep the already-ciphertext skip rule and the `--dry-run` / `--confirm-backup` behavior unchanged
    - ASK FIRST: running the script for real against live data is not part of this task; run only against test fixtures or `--dry-run`.
    - _Requirements: 8.1, 8.5, 24.4, 24.5, 28.7_
    - Change_Report: `scripts/migrate_passwords.js` (modified). Verify: a fixture with a plaintext `two_factor_secret` in one source and a plaintext `two_factor_temp_secret` in the other ends with both encrypted after one run.

  - [x] 48.2 Flip the double-run test and update the Runbook
    - The test flip is already done with task 20.1 (`tests/migrate.twice.test.js` uses a normal `it`); confirm with `grep -n "it.fails" tests/migrate.twice.test.js` (no match)
    - Remaining work: update `RUNBOOK.md` known issue 9.3 to state it is fixed (leave the numbering of the other items alone; task 53 removes fixed items together)
    - _Requirements: 8.5, 18.1, 23.1, 35.4_
    - Change_Report: `RUNBOOK.md` (modified). Verify: `npx vitest run tests/migrate.twice.test.js` passes; RUNBOOK 9.3 is marked fixed.

- [ ] 49. Remove `serverToken` from the install template
  - [ ] 49.1 Delete the `serverToken` value from the embedded installer
    - In `server.js` around line 7408 (use `grep -n "serverToken" server.js`), remove the `serverToken` value from the embedded install template so generated installers no longer write it into `agent-config.json`
    - Older installed agents keep working: the backend ignores `serverToken` (task 8.1) and the agent falls back to its built-in default. ASK FIRST is not needed.
    - _Requirements: 5.3, 24.4, 24.5, 26.2_
    - Change_Report: `server.js` (modified). Verify: `grep -n "serverToken" server.js` shows no installer-template value; a generated installer still contains `agentKey`.

  - [ ] 49.2 Flip the smoke test
    - Change the `it.fails` test in `tests/staticRequirements.smoke.test.js` to a normal `it` asserting `server.js` has no `serverToken` value in the install template
    - _Requirements: 5.2, 18.1, 26.2, 35.4_
    - Change_Report: `tests/staticRequirements.smoke.test.js` (modified). Verify: `npx vitest run tests/staticRequirements.smoke.test.js` passes.

- [ ] 50. Persist `workspaceRequests` in the disk store
  - [ ] 50.1 Include `workspaceRequests` in save and read
    - In `lib/diskPersistence.js`, add `workspaceRequests` to the serialized fields and to the read path (default `[]` when missing); in `server.js`, pass it where the store object is built and restored (`grep -n "workspaceRequests" server.js`)
    - Keep secrets scrubbing for jobs unchanged
    - _Requirements: 10.6, 24.4, 24.5, 29.6_
    - Change_Report: `lib/diskPersistence.js` (modified), `server.js` (modified). Verify: a save/load round trip through `lib/diskPersistence.js` keeps `workspaceRequests`; a legacy `database.json` with leads is imported.

  - [ ] 50.2 Add a round-trip test
    - Add a test that writes a store with `workspaceRequests` to a temp `DB_FILE_PATH`, reads it back, and compares; include a file without the key (expects `[]`)
    - _Requirements: 10.6, 18.1, 29.6_
    - Change_Report: `tests/diskPersistence.workspaceRequests.test.js` (added). Verify: passes.

- [ ] 51. Consistent MySQL mock in tests
  - [x] 51.1 Teach the fake MySQL `ALTER ... MODIFY` and `information_schema`
    - In `tests/helpers/fakeMysql.js`, accept `ALTER TABLE ... MODIFY COLUMN ...` (no-op that updates column metadata if tracked) and answer `information_schema` queries used by `initMySQLDatabase` (`grep -n "information_schema" server.js`) with empty or matching results
    - _Requirements: 18.1, 24.5, 35.1_
    - Change_Report: `tests/helpers/fakeMysql.js` (modified). Verify: running init against the fake logs no `ER_NOT_SUPPORTED_YET` lines.

  - [ ] 51.2 Use the fake MySQL in the `mysql2/promise` mock
    - In `tests/setup.js`, make the `mysql2/promise` mock return the fake MySQL pool consistently; if a test must keep the old behavior, document why in a comment next to the mock
    - _Requirements: 18.1, 18.2, 35.2_
    - Change_Report: `tests/setup.js` (modified). Verify: `npm test` passes and the output has no `ER_NOT_SUPPORTED_YET` noise.

- [ ] 52. Dependency audit follow-up
  - [ ]* 52.1 Run `npm audit` and plan upgrades for remaining vulnerabilities
    - Run `npm audit` and record the date, counts per severity, and each affected package with version, advisory, and fix range; cover `vitest`/`vite`/`esbuild`, `nodemailer`, `qs`, `body-parser`, and `proxy-addr`
    - Write the upgrade plan in the Change_Report (target versions, whether each is breaking, test impact, order). Do not change `package.json` or the lock file in this task
    - ASK FIRST: upgrades can be breaking (for example major bumps of `vitest`/`vite`, or `nodemailer` and `body-parser` API changes). Apply nothing until the user approves each upgrade (Requirement 15.6).
    - _Requirements: 15.1, 15.5, 15.6_
    - Change_Report: no files changed. Verify: the repository diff is empty and the plan lists every remaining high/critical advisory with a decision (upgrade, mitigate, or accept).

- [ ] 53. Final checkpoint - Phase 7 complete
  - Run the full suite with `npm test`; confirm no `it.fails` or `it.skip` remain except the bash-dependent backup tests (`grep -rn "it\.fails\|it\.skip" tests/`)
  - Update `RUNBOOK.md` section 9 to remove the fixed issues and keep only the open ones
  - Ensure all tests pass, ask the user if questions arise.
  - Change_Report: `RUNBOOK.md` (modified). Verify: `npm test` exits 0; the grep lists only the backup tests; section 9 has no fixed issue left.
  - Note: tasks 54 to 57 below were added after this checkpoint; the new final checkpoint is task 58.

### Phase 8: Rotation grace window, proxy IP, startup log, and real MySQL check

Task order: 54 (key rotation grace window, resolves Open Issue 2), 55 (PHP proxy client IP), 56 (startup log database name), existing task 48 (cumulative TOTP migration, Runbook 9.3 only), 57 (real MySQL integration check), then the new final checkpoint 58. Do not read `server.js` in full; locate code with `grep -n` and edit only the named blocks.

- [x] 54. Agent key rotation grace window (resolves Open Issue 2)
  - Decision: `POST /api/servers/:id/rotate-agent-key` accepts an optional `graceMinutes` (integer 0..1440, default 0). With 0 the old key is rejected immediately, exactly as today (Requirement 2.4). With a value above 0 the hash of the replaced key is kept as `previousApiKey` with an expiry `previousKeyExpiresAt` (epoch milliseconds) and is accepted alongside the new key until the expiry, evaluated at request time. Both values are persisted so a restart does not change the window. Only one previous key exists at a time (the next rotation replaces it). Requirements 2.10 to 2.17 and 23.5 describe the behavior.
  - [x] 54.1 Extend `lib/agentAuth.js` with the grace window (pure logic)
    - `rotateAgentKey({ store, serverId, generate, graceMinutes = 0, now = Date.now })`: reject a `graceMinutes` that is not an integer 0..1440 with an error carrying `statusCode: 400` before generating or storing anything; with 0 store `{ apiKey: newHash, previousApiKey: '', previousKeyExpiresAt: null }`; above 0 store `{ apiKey: newHash, previousApiKey: oldHash, previousKeyExpiresAt: now() + graceMinutes * 60000 }` in one store call; on store failure keep the old record unchanged and return no key (Requirement 2.6); the previous hash of an earlier rotation is overwritten (Requirement 2.14)
    - `matchAgentKey({ server, submittedKey, now })` returns `{ valid, keyUsed: 'current' | 'previous' | null }`; the previous hash counts only when it is non-empty and `now < previousKeyExpiresAt`
    - `decideAgentAuth` input gains optional `previousHash`, `previousExpiresAt`, `now` and the result gains `keyUsed`; the existing table is unchanged for servers without a previous hash; a match on the unexpired previous hash returns `keyValid: true` and `keyUsed: 'previous'` in both modes; `findServerByKeyHash` (used for `detect-server`) also considers an unexpired previous hash
    - The middleware records `keyUsed` in the `keyStatus` map next to `valid` and `at` (Requirement 2.16); the fixed 401 body and the audit content stay unchanged
    - _Requirements: 2.1, 2.4, 2.6, 2.10, 2.11, 2.13, 2.14, 2.16_
    - Change_Report: `lib/agentAuth.js` (modified). Verify: Node REPL: after `rotateAgentKey` with `graceMinutes: 10` both keys match, the old key stops matching at the expiry millisecond, and `graceMinutes: 1441` or `1.5` throws with `statusCode` 400 and stores nothing; existing tests `npx vitest run tests/agentAuth.decision.property.test.js tests/agentAuth.rotation.property.test.js` still pass.

  - [x] 54.2 Persist the window and wire the rotate and delivery endpoints
    - `schema.sql`: `vps_servers.previousApiKey VARCHAR(255) DEFAULT NULL` and `previousKeyExpiresAt BIGINT DEFAULT NULL`; `initMySQLDatabase`: repeat-safe `ALTER TABLE vps_servers ADD COLUMN ...` for both (ignore the duplicate-column error); load both into the server objects at boot; no column or row is dropped
    - ASK FIRST: this adds two nullable columns to the existing `vps_servers` table (reversible with `DROP COLUMN`, which loses only grace-window data).
    - `POST /api/servers/:id/rotate-agent-key`: read `graceMinutes` from the body (400 and no change, no audit entry for an invalid value); update `apiKey`, `previousApiKey`, and `previousKeyExpiresAt` in ONE statement and update the in-memory server in the same step; audit `AGENT_KEY_ROTATED` records `graceMinutes` and never a key or hash; the response keeps its shape and adds `graceMinutes` and `previousKeyExpiresAt` (ISO string or `null`), never a hash
    - `GET /api/agent-keys/status` adds `keyUsed` per server; `lib/agentKeyReadiness.js` treats `keyUsed === 'previous'` as not ready (Requirement 26.11)
    - Delivery (`POST /api/servers/:id/deploy-agent-key` and the bulk route): accept an optional `graceMinutes` (default 60 when the server already has a hash, 0 otherwise) and store the replaced hash as the previous key through the same helper, so an agent that still sends the old key can poll for its `SET_AGENT_KEY` job during the window (Requirement 26.14); the `isJobDeliverable` IP gate is unchanged
    - `lib/publicProjections.js`: strip `previousApiKey` (and keep `previousKeyExpiresAt` out of list responses) in `toPublicServer`
    - _Requirements: 2.2, 2.5, 2.6, 2.10, 2.11, 2.12, 2.14, 2.15, 2.16, 26.11, 26.14, 34.3_
    - Change_Report: `schema.sql`, `server.js`, `lib/publicProjections.js`, `lib/agentKeyReadiness.js` (modified). Verify: run init twice against a test MySQL (no error, rows unchanged); rotate with `graceMinutes: 5` and both keys authenticate in `enforce` mode, the old key is rejected after 5 minutes; restart the server in between and the expiry timestamp is unchanged; `GET /api/servers` contains neither `apiKey` nor `previousApiKey`; a non-SUPER_ADMIN still gets 403.

  - [x] 54.3 Write the grace window property test and endpoint tests
    - **Property 43: The rotation grace window accepts the previous key only until its expiry**
    - **Validates: Requirements 2.10, 2.11, 2.13, 2.14, 2.16**
    - Generate `graceMinutes` (valid and invalid), clock offsets around the expiry (including the exact boundary), and chains of two rotations; compare `matchAgentKey` and `decideAgentAuth` against a simple model: the new key is always valid, the previous key is valid only while `now < expiry`, a key from two rotations ago is never valid, invalid `graceMinutes` changes nothing
    - Example tests with the fake MySQL: invalid `graceMinutes` returns 400 and writes no audit row; the audit row contains `graceMinutes` and no key or hash text; a simulated restart keeps the same expiry; a `SET_AGENT_KEY` job is returned to an agent that polls with the old key inside the window and the key text never appears in `vps_provision_jobs`; update `tests/agentKeyReadiness.property.test.js` so a server whose last request used the previous key is not ready
    - _Requirements: 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 26.11, 26.14_
    - Change_Report: `tests/agentAuth.grace.property.test.js` (added), `tests/agentAuth.rotateGrace.test.js` (added), `tests/agentKeyReadiness.property.test.js` (modified). Verify: `npx vitest run tests/agentAuth.grace.property.test.js tests/agentAuth.rotateGrace.test.js tests/agentKeyReadiness.property.test.js` passes with 100+ runs for the property test.

  - [x] 54.4 Add the `graceMinutes` input to the rotate dialog
    - `src/components/EditServerModal.jsx` (SUPER_ADMIN-only rotate confirmation dialog): number input for `graceMinutes` (integer 0..1440, default 0, inline validation, hint that 0 rejects the old key immediately and is the choice for a leaked key); send the value in the rotate request body
    - `src/components/AgentKeyPanel.jsx`: when the response has a `previousKeyExpiresAt`, show "Old key stays valid until <local time>"; never show a hash
    - _Requirements: 2.7, 2.17_
    - Change_Report: `src/components/EditServerModal.jsx`, `src/components/AgentKeyPanel.jsx` (modified). Verify: manual: the dialog defaults to 0, rejects 1441 and 1.5 before sending, and a 30-minute rotation shows the window end; the request body contains `graceMinutes`.

  - [x] 54.5 Update the Runbook and the rollout document
    - `RUNBOOK.md` section 4 (Rotating Agent_Keys): ordered steps with `graceMinutes` (which side is updated in each step, how `SET_AGENT_KEY` reaches the agents, how to verify through `GET /api/agent-keys/status` `keyUsed`, choose 0 for a leaked key, failure symptoms and actions); section 9.6 (Open Issue 2): mark resolved and point to section 4 (leave the numbering of the other items alone; task 53 removes fixed items together)
    - `docs/AGENT_KEY_ROLLOUT.md`: add the grace window to the delivery steps (default 60 minutes for delivery) and the rule that `readyForEnforce` ignores requests made with a previous key
    - _Requirements: 23.5, 23.9, 2.10, 2.11, 26.13_
    - Change_Report: `RUNBOOK.md`, `docs/AGENT_KEY_ROLLOUT.md` (modified). Verify: review that section 4 has the numbered steps with expected results and failure handling, and section 9.6 says resolved.

- [x] 55. PHP proxy client IP handling (Requirement 3)
  - Facts: `public/api_proxy.php` forwards every incoming header (the `getallheaders()` loop), then computes `$client_ip` from `HTTP_CF_CONNECTING_IP`, then `HTTP_X_FORWARDED_FOR`, then `REMOTE_ADDR` and appends `X-Forwarded-For` and `X-Real-IP` headers. Both client-supplied values are spoofable, and the client's own `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP` headers also pass through the loop. The built copy `dist/api_proxy.php` comes from `public/` through the build; do not edit `dist/` by hand.
  - [x] 55.1 Make the PHP relay set and never pass through the client IP headers
    - In `public/api_proxy.php`: add `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, and `forwarded` to `$blocked_headers` (both header loops); set `$client_ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'` and send exactly one `X-Forwarded-For: <REMOTE_ADDR>` and one `X-Real-IP: <REMOTE_ADDR>`; keep every other header, the streaming download branch, and the retry logic unchanged (both curl paths use the same `$headers`)
    - ASK FIRST (out of this task): if the PHP host itself sits behind Cloudflare or another proxy, `REMOTE_ADDR` is that proxy and the real client IP needs a verified-proxy list inside PHP; record the deployment topology in the Change_Report and do not guess
    - _Requirements: 3.2, 3.3, 3.6, 3.9_
    - Change_Report: `public/api_proxy.php` (modified; `dist/api_proxy.php` is regenerated by `npm run build`). Verify: `php -l public/api_proxy.php` reports no syntax error when PHP is available; through the relay, a request with `X-Forwarded-For: 6.6.6.6` and `CF-Connecting-IP: 7.7.7.7` shows the connection's address in the portal audit log; after `npm run build`, `grep -c "HTTP_X_FORWARDED_FOR\|HTTP_CF_CONNECTING_IP" dist/api_proxy.php` is 0 for the client IP computation.

  - [x] 55.2 Document the matching `TRUSTED_PROXIES` setting
    - `RUNBOOK.md` (deployment section and the proxy note): `TRUSTED_PROXIES` must contain the address of the host that runs the PHP relay (`127.0.0.1,::1` when it runs on the same host as the portal); with it unset only loopback is trusted; list a wrong entry's symptom (every client appears with the proxy address, or forwarded values are ignored) and the action
    - `.env.example`: extend the comment above `TRUSTED_PROXIES` with the same rule and an example value
    - _Requirements: 3.7, 3.10_
    - Change_Report: `RUNBOOK.md`, `.env.example` (modified). Verify: review that both files name the PHP host rule; `loadConfig` accepts the example value.

  - [x] 55.3 Write a static test for the PHP relay
    - Assert that `public/api_proxy.php` does not read `HTTP_X_FORWARDED_FOR`, `HTTP_CF_CONNECTING_IP`, or `HTTP_X_REAL_IP` for the client IP, that it blocks the three headers in the pass-through loop, and that it sets both `X-Forwarded-For` and `X-Real-IP` from `REMOTE_ADDR`
    - _Requirements: 3.9_
    - Change_Report: `tests/apiProxy.static.test.js` (added). Verify: `npx vitest run tests/apiProxy.static.test.js` passes and fails when the original file content is restored.

- [x] 56. Startup log prints the configured database name
  - Facts: the connection log in `initMySQLDatabase` (`grep -n innovati4_vps_db server.js`, about line 723) prints the literal `innovati4_vps_db`; the real name is in the local `dbName` (about line 706, `DB_NAME` / `MYSQL_DATABASE`, default `vps_db`).
  - [x] 56.1 Print `dbName` instead of the literal
    - Replace the literal in that log line with the local `dbName`; print no user, password, or other credential; leave the JSON-fallback log unchanged
    - _Requirements: 12.6_
    - Change_Report: `server.js` (modified). Verify: `grep -n innovati4_vps_db server.js` has no match; starting against a database named `vps_management_db` prints that name.

  - [x] 56.2 Add a test and a static check
    - Runtime: with the fake MySQL and `DB_NAME=custom_db_x`, capture the console output of `initMySQLDatabase` and assert it contains `custom_db_x`, not `innovati4_vps_db`, and no password; static: `server.js` contains no `innovati4_vps_db`
    - _Requirements: 12.6_
    - Change_Report: `tests/startup.dbname.test.js` (added), `tests/staticRequirements.smoke.test.js` (modified). Verify: both pass.

- [x] 57. Real MariaDB/MySQL integration check (opt-in)
  - Why: the in-memory fake cannot judge `ALTER ... MODIFY COLUMN`, `information_schema`, or the session `JOIN`. The check runs as a plain Node script (not under Vitest, whose setup mocks `mysql2/promise`), is skipped unless `REAL_MYSQL_URL` is set, and never touches the production database.
  - [x] 57.1 Export `initMySQLDatabase` and allow a TCP-only connection
    - `server.js`: add `initMySQLDatabase` to the existing export line; when `DB_SKIP_SOCKETS=1` the candidate list in `initMySQLDatabase` (about lines 708 to 716) keeps only the TCP candidate, so the check can never reach a local production socket; behavior without the variable is unchanged
    - _Requirements: 37.3_
    - Change_Report: `server.js` (modified). Verify: `grep -n "export {" server.js` lists `initMySQLDatabase`; with `DB_SKIP_SOCKETS=1` no `socketPath` candidate is tried (log shows TCP only).

  - [x] 57.2 Create `scripts/test_real_mysql.js` and wire the npm script
    - Without `REAL_MYSQL_URL` print `SKIPPED (REAL_MYSQL_URL not set)` and exit 0. Otherwise parse `mysql://user:password@host:port` (a path segment is ignored), read `DB_NAME` from the environment and from `.env` with `dotenv.parse` on the file text (never `dotenv.config`, so no production settings leak into the process), generate a unique name `vps_it_<random hex>`, and refuse (exit non-zero, before creating anything) when that name equals `DB_NAME` or the URL path names `DB_NAME` (case-insensitive); export the guard as a function for the unit test
    - Steps: create the throwaway database; load `schema.sql` (multi-statement connection); set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SKIP_SOCKETS=1`, `TEST_MODE=1`, `NODE_ENV=test`, and a test `PASSWORD_ENCRYPTION_KEY`, then import `server.js` and run `initMySQLDatabase` twice; compare row counts of every table before and after the second run (equal, no error); check through `information_schema` that the widened columns (`client_subscriptions.password`, `vps_servers.superClientPass`, `vps_provision_jobs.password`, `vps_servers.apiKey`, the TOTP columns) have the widened lengths and accept a 600-character value; insert one `portal_users` row and one `sessions` row and run the session validation JOIN copied from `validateSession` (`grep -n "FROM \`sessions\` s" server.js`, comment names the source) expecting one row
    - Always drop only the throwaway database in a `finally` block (only a name that starts with `vps_it_` and was created by this run); exit non-zero on any failed step
    - `package.json`: add `"test:realmysql": "node scripts/test_real_mysql.js"` (not part of `npm test`); `.env.example`: add a commented `REAL_MYSQL_URL=` line with the rule that it must point at a disposable server
    - _Requirements: 37.1, 37.2, 37.3_
    - Change_Report: `scripts/test_real_mysql.js` (added), `package.json` (modified), `.env.example` (modified). Verify: `npm run test:realmysql` without the variable prints SKIPPED and exits 0; with a Docker MariaDB (task 57.4) it prints each step as passed, exits 0, and `SHOW DATABASES` afterwards lists no `vps_it_*` database.

  - [x] 57.3 Write a unit test for the guard and the skip path
    - Spawn the script with `REAL_MYSQL_URL` unset and expect exit 0 and `SKIPPED`; call the exported guard with a name equal to `DB_NAME` (any letter case) and expect a refusal; a different name is accepted; no database connection is made in this test
    - _Requirements: 37.1, 37.2_
    - Change_Report: `tests/realMysql.guard.test.js` (added). Verify: `npx vitest run tests/realMysql.guard.test.js` passes with no MySQL running.

  - [x] 57.4 Document the Docker run in the Runbook
    - `RUNBOOK.md`: new subsection under Supporting procedures: `docker run --rm -e MARIADB_ROOT_PASSWORD=<disposable-password> -p 3307:3306 mariadb:11`, wait for readiness, run `REAL_MYSQL_URL=mysql://root:<disposable-password>@127.0.0.1:3307 npm run test:realmysql`, expected output, the refusal rule (never point it at the production server or a database named like `DB_NAME`), and the cleanup (`docker stop`; the container is removed with `--rm`); failure symptoms and actions
    - _Requirements: 37.4, 23.9_
    - Change_Report: `RUNBOOK.md` (modified). Verify: review that the commands and expected results are present; run them once on a machine with Docker.

- [x] 58. Final checkpoint - Ensure all tests pass
  - Run the full suite with `npm test`; confirm `grep -rn "it\.fails\|it\.skip" tests/` lists only the bash-dependent backup tests, `grep -n innovati4_vps_db server.js` has no match, and `npm run test:realmysql` prints SKIPPED without the variable
  - Confirm task 48.2 (`RUNBOOK.md` 9.3) is done before ticking task 48, and that `RUNBOOK.md` section 9 lists only open issues
  - Ensure all tests pass, ask the user if questions arise.
  - Change_Report: no files changed. Verify: `npm test` exits 0.

### Phase 9: Forgot-password OTP mail

- [x] 59. Forgot-password OTP mail fixes
  - [x] 59.1 Fix `/api/forgot-password/request-otp` sender, recipient and failure handling
    - Remove every hardcoded email address in the route (the `targetEmail` fallback and the `from` address); `from` uses `process.env.SMTP_USER`; the transport uses `SMTP_HOST` and `SMTP_PORT` from the environment (port parsed as an integer, `secure` true only for 465) with `SMTP_USER` / `SMTP_PASS` as auth
    - Matched account with no email: send nothing, store no OTP, return the same generic response as an unknown account, and log a server-side warning naming the username only
    - `sendMail` failure: delete the stored OTP, log the error code/message without credentials, and return a generic error response (HTTP 502, `{ success: false, error: 'Unable to send the verification email. Please try again later.' }`) instead of success
    - Never print or store SMTP credentials; leave other routes and the default seed emails untouched
    - _Requirements: 6.4, 7.13, 17.1_
    - Change_Report: `server.js` (modified). Verify: grep shows no email literal in the route; the tests in 59.3 pass.

  - [x] 59.2 Show the server message when `maskedEmail` is missing
    - `src/components/ForgotPasswordModal.jsx`: when the response has no `maskedEmail`, show `data.message` (never the text "undefined"); use `data.username` or the typed value as the reset target; show `data.error` on failure
    - _Requirements: 24.4_
    - Change_Report: `src/components/ForgotPasswordModal.jsx` (modified). Verify: `npx vite build` succeeds; a generic response shows its message.

  - [x] 59.3 Write tests for the OTP mail paths
    - No-email account: generic response identical to an unknown account, `sendMail` not called, warning logged with the username; SMTP failure: generic error response, no OTP stored, no credentials in logs; generic response for an unknown account; `from` equals `SMTP_USER` and the transport uses `SMTP_HOST`/`SMTP_PORT`
    - Mock `nodemailer`; never connect to a real SMTP server
    - _Requirements: 6.4, 7.13, 17.1_
    - Change_Report: `tests/forgotPassword.otp.test.js` (added). Verify: passes.

- [x] 60. Password visibility toggles
  - [x] 60.1 Add a show/hide eye button to the login and reset password fields
    - `src/components/LoginScreen.jsx` password field and `src/components/ForgotPasswordModal.jsx` New Password and Confirm New Password fields: an eye / eye-off icon button (lucide-react `Eye` / `EyeOff`, already a dependency) inside the right edge of each input that toggles `type` between `password` and `text`
    - The button is `type="button"` (never submits), has an `aria-label` that switches between "Show password" and "Hide password", `aria-pressed`, keyboard focus, and the input keeps its value, autocomplete attribute and existing styling (add right padding so text does not run under the icon)
    - Each field toggles independently; reset back to hidden when the modal closes
    - _Requirements: 24.4_
    - Change_Report: `src/components/LoginScreen.jsx`, `src/components/ForgotPasswordModal.jsx` (modified). Verify: `npx vite build` succeeds; clicking the eye shows the typed text and clicking again hides it; pressing Enter in the field still submits the form.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties; unit and integration tests validate specific examples and edge cases
- Property tests that need `server.js` and the full harness are in Phase 5 (Properties 6, 8, 25, 26); all others sit next to the code they test
- Tasks that require user approval before acting (ASK FIRST):
  - 5.3 (original optional rotation grace window; delivered by task 54)
  - 9.3 (rebuild and replace the compiled `InnovationVpsAgent.exe` copies)
  - 15.2 (optional `DROP DEFAULT` on `client_subscriptions.password`)
  - 16.6 and 16.8 (only if an agent-script fix needs more than 5 hand-edited files)
  - 17.7 and 17.8 (frontend password display and RDP / bookmarklet behavior)
  - 18.3 (widen the `portal_users` TOTP columns)
  - 20.1 and checkpoint 21 (mandatory gate before the real, non-dry-run Migration_Script run: backup file confirmed, `database.json` copied, `PASSWORD_ENCRYPTION_KEY` stored in two places)
  - 22.7 (server delete flow removes rows)
  - 24.2 (confirm MySQL holds everything that lived only in `database.json` before disabling disk persistence)
  - 25.4 (add `vps_servers.meta`), 25.8 (add `client_subscriptions.tallyVersion` and `support_tickets.source`), and 25.9 (only if older `hardwareHistory` rows must be read from MySQL)
  - 31.1 (voice-note access)
  - 32.1 (`SameSite=Strict`, only if the user wants it)
  - 33.2 (spreadsheet package source)
  - 48.1 (only if a real, non-dry-run Migration_Script run is wanted)
  - 52.1 (any dependency upgrade that may be breaking)
- Do not switch `AGENT_AUTH_MODE` to `enforce` until `GET /api/agent-keys/status` reports `readyForEnforce: true` (task 9.6); the rollback to `warn` is in `docs/AGENT_KEY_ROLLOUT.md` and the Runbook
- The backup script (task 10.1) sits at the end of Phase 1 so a backup exists before any Phase 2 data change; Phase 6 only references it (Runbook task 40.1)
- Requirement and design sync (done in this revision):
  - Requirements 25 to 37 were added for the former "hardening addition" items: HTTPS-only base URL (25), agent key delivery, readiness and serverToken retirement (26), job parameter sanitization (27), TOTP secrets (28), disk persistence and DB_FILE_PATH (29), public endpoint rate limits (30), memory-only data in MySQL (31), session cookies (32), PM2 single instance (33), DB-unavailable 503 and response hygiene (34), test harness fidelity (35), frontend default password (36), real MySQL check (37); Requirements 2.10 to 2.17, 3.9, 3.10, 7.16, 12.6 and 26.14 were added and 2.4, 6.12, 23.5 rewritten
  - Requirement 6.5 and 6.12 state that exports OMIT passwords by default; only a confirming SUPER_ADMIN (includePasswords and confirm) can export them, with one CLIENTS_EXPORTED_WITH_PASSWORDS audit entry per request (tasks 15.3, 17.4, 36.6)
  - Design Properties 36 to 42 are listed with their Validates lines; Property 43 (rotation grace window, task 54.3) is new
- Phase 8 ASK FIRST items: 54.2 (two nullable columns on ps_servers), 55.1 (only if the PHP host is itself behind another proxy), 57.2 (needs a disposable MariaDB/MySQL server; never the production database)
## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "6.1", "6.2", "9.1", "10.1", "12.1", "14.1", "16.1", "16.5", "24.1"] },
    { "id": 1, "tasks": ["2.2", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5", "6.3", "6.4", "6.5", "9.2", "9.3", "10.2", "12.2", "12.3", "12.4", "12.5", "12.6", "14.2", "15.1", "16.2", "18.1", "19.1", "22.2", "25.5", "29.1", "30.1"] },
    { "id": 2, "tasks": ["3.5", "13.1", "16.6", "16.7", "18.2", "19.3", "19.4", "22.3", "22.4", "25.6", "29.3", "30.2"] },
    { "id": 3, "tasks": ["5.1", "16.8", "23.1"] },
    { "id": 4, "tasks": ["5.2", "27.1"] },
    { "id": 5, "tasks": ["5.3", "27.2"] },
    { "id": 6, "tasks": ["8.1", "27.3", "27.4", "29.4"] },
    { "id": 7, "tasks": ["9.4", "5.4", "5.5", "7.1", "8.2", "29.7"] },
    { "id": 8, "tasks": ["9.5"] },
    { "id": 9, "tasks": ["9.6"] },
    { "id": 10, "tasks": ["15.2", "9.7", "9.8", "9.9"] },
    { "id": 11, "tasks": ["15.3"] },
    { "id": 12, "tasks": ["15.4"] },
    { "id": 13, "tasks": ["16.3"] },
    { "id": 14, "tasks": ["16.4"] },
    { "id": 15, "tasks": ["17.1"] },
    { "id": 16, "tasks": ["17.2"] },
    { "id": 17, "tasks": ["17.3"] },
    { "id": 18, "tasks": ["17.4"] },
    { "id": 19, "tasks": ["18.3", "17.5", "17.6", "33.1"] },
    { "id": 20, "tasks": ["18.4", "17.7", "17.8", "33.2"] },
    { "id": 21, "tasks": ["18.5", "33.3"] },
    { "id": 22, "tasks": ["18.6"] },
    { "id": 23, "tasks": ["19.2", "18.7", "20.1"] },
    { "id": 24, "tasks": ["22.1", "20.2", "20.3", "20.4", "20.5"] },
    { "id": 25, "tasks": ["22.5"] },
    { "id": 26, "tasks": ["22.6"] },
    { "id": 27, "tasks": ["22.7"] },
    { "id": 28, "tasks": ["22.8", "23.2"] },
    { "id": 29, "tasks": ["24.2", "25.1"] },
    { "id": 30, "tasks": ["25.2", "24.3"] },
    { "id": 31, "tasks": ["25.3"] },
    { "id": 32, "tasks": ["25.4"] },
    { "id": 33, "tasks": ["25.7"] },
    { "id": 34, "tasks": ["25.8"] },
    { "id": 35, "tasks": ["25.9"] },
    { "id": 36, "tasks": ["25.10"] },
    { "id": 37, "tasks": ["27.5"] },
    { "id": 38, "tasks": ["28.1", "35.1", "35.2"] },
    { "id": 39, "tasks": ["29.2", "28.2"] },
    { "id": 40, "tasks": ["29.5"] },
    { "id": 41, "tasks": ["29.6"] },
    { "id": 42, "tasks": ["30.3"] },
    { "id": 43, "tasks": ["31.1", "30.4"] },
    { "id": 44, "tasks": ["32.1", "30.5"] },
    { "id": 45, "tasks": ["38.1", "32.2"] },
    { "id": 46, "tasks": ["36.1", "36.2", "36.3", "36.4", "36.5", "36.6", "36.7", "36.8", "36.9", "36.10", "36.11", "36.12", "38.2", "39.1"] },
    { "id": 47, "tasks": ["40.1", "41.1", "43.1"] },
    { "id": 48, "tasks": ["44.1", "48.1", "51.1"] },
    { "id": 49, "tasks": ["44.2", "48.2", "51.2", "52.1"] },
    { "id": 50, "tasks": ["45.1"] },
    { "id": 51, "tasks": ["45.2"] },
    { "id": 52, "tasks": ["46.1"] },
    { "id": 53, "tasks": ["46.2"] },
    { "id": 54, "tasks": ["47.1"] },
    { "id": 55, "tasks": ["47.2"] },
    { "id": 56, "tasks": ["49.1"] },
    { "id": 57, "tasks": ["49.2"] },
    { "id": 58, "tasks": ["50.1"] },
    { "id": 59, "tasks": ["50.2"] },
    { "id": 60, "tasks": ["54.1", "55.1"] },
    { "id": 61, "tasks": ["54.2", "55.2", "55.3"] },
    { "id": 62, "tasks": ["54.3", "56.1"] },
    { "id": 63, "tasks": ["54.4", "56.2", "57.1"] },
    { "id": 64, "tasks": ["54.5", "57.2"] },
    { "id": 65, "tasks": ["57.3", "57.4"] }
  ]
}
```
