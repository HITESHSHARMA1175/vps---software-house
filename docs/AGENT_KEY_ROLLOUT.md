# Agent Key Rollout

This guide covers delivering per-server Agent_Keys to agents that are already installed, checking each agent, and switching `AGENT_AUTH_MODE` from `warn` to `enforce`.

> **DO NOT set `AGENT_AUTH_MODE=enforce` until `readyForEnforce` is `true`.**
> In `enforce` mode an agent without a valid key gets 401 on every agent endpoint, so it cannot poll for jobs and cannot receive a new key. Fixing it then means a manual reinstall on the VPS.

Placeholders: `<portal>` is the portal host, `<admin cookie>` is the session cookie of a logged-in admin (SUPER_ADMIN for the deliver, rotate and enforce steps), `<serverId>` is the server id shown in the portal.

## How it works

- A SUPER_ADMIN triggers delivery while `AGENT_AUTH_MODE=warn`.
- For each server the backend generates a key and stores only its hash. A server with a hash still accepts old agents that send no key while the mode is `warn`.
- The backend queues one `SET_AGENT_KEY` job that carries the plaintext key once. It is handed only to a request from the server's registered IP, is never written to MySQL, and is scrubbed from memory and `database.json` after the job result or the 15-minute timeout.
- When a server already has a hash, delivery keeps its previous key valid for a grace window (default 60 minutes; optional `graceMinutes`, integer 0 to 1440, in the request body of `deploy-agent-key` and `deploy-agent-keys`). The expiry (`previousKeyExpiresAt`) is persisted, survives a restart, and is checked on every request. Only one previous key is kept. Servers without a hash have no previous key.
- Agents older than `AGENT_KEY_MIN_VERSION` (default `2.1.0`) first get an `UPDATE_AGENT` job and are reported as `needs_update`. Run delivery again after they update.
- Delivery requires `PORTAL_BASE_URL` to be `https://` in production. Otherwise the call returns 409 and nothing is queued.
- Residual risk: another request from the same registered public IP (shared NAT, or another process on the same VPS) can receive the job while it is pending.

## Steps

### 1. Back up the database

```bash
scripts/backup_mysql.sh
ls -l "$BACKUP_DIR"/*.sql.gz
```

Expected: a new `<DB_NAME>_YYYYMMDD_HHMMSS.sql.gz` file that is not empty, and exit status 0. Do not continue without it.

### 2. Approve and deploy the new agent binary

The new agent (with `SET_AGENT_KEY` and `agentVersion` in telemetry) must be built and approved by you. Rebuilding `InnovationVpsAgent.exe` is a manual Windows step and replaces the currently deployed file (reversible from git).

1. Compile the service from `public/VpsAgentService.cs` on Windows.
2. Replace the three copies (`public/`, repository root, `powershell-scripts/`) and deploy the portal.
3. Make sure `AGENT_AUTH_MODE` is empty or `warn` and restart the portal process.

Expected: after a restart the portal log shows `[Config] Agent_Auth_Mode: warn`.

### 3. Update old agents

Agents that report no version, or one below `AGENT_KEY_MIN_VERSION`, are updated by the bulk call in step 4 (it queues `UPDATE_AGENT` for them). Wait a few minutes, then run step 4 again.

### 4. Deliver keys

All non-deleted servers:

```bash
curl -s -X POST -b <admin cookie> -H "Content-Type: application/json" \
  -d '{}' https://<portal>/api/servers/deploy-agent-keys
```

One server (retry):

```bash
curl -s -X POST -b <admin cookie> https://<portal>/api/servers/<serverId>/deploy-agent-key
```

Optional body for the bulk call: `{ "serverIds": ["<serverId>"], "force": true, "graceMinutes": 60 }`. `force` re-delivers to a server that already has a hash and a valid request. `graceMinutes` (integer 0 to 1440, default 60 for servers that already have a hash) sets how long the previous key stays valid; any other value returns 400.

Expected: JSON with the lists `queued`, `needs_update` and `skipped` (server ids and reasons only). It never contains a key or a hash. A non-SUPER_ADMIN gets 403. In `enforce` mode it returns 409 (see Rollback).

The admin UI panel (`AgentKeyRolloutPanel`), if present in your build, calls the same endpoints.

### 5. Verify

Check every server, then check readiness (see below). Repeat step 4 for servers that are not yet valid.

## Per-agent manual check

Do this for each server, or at least for a sample plus every server that is not green.

1. **Agent log shows the key was installed.** Read the log through the portal:

   ```bash
   curl -s -X POST -b <admin cookie> https://<portal>/api/servers/<serverId>/get-agent-log
   ```

   Expected: the log contains `Agent key installed via SET_AGENT_KEY.` and the job result `Agent key installed`. The log never shows the key itself. If the log shows `FAILED` or `old key kept`, the old key still works; retry delivery.

2. **Portal sees valid requests.**

   ```bash
   curl -s -b <admin cookie> https://<portal>/api/agent-keys/status
   ```

   Expected: the entry for `<serverId>` has `"hasHash": true` and `"lastRequestValid": true`, with a recent `lastValidAt`, the `agentVersion`, and `"keyUsed": "current"`. `"keyUsed": "previous"` means the agent still sends the old key, which works only until `previousKeyExpiresAt`; wait until it shows `current` before the window ends. The response has no keys or hashes.

3. **A test request with the stored key returns 200.** On the VPS, in an elevated PowerShell:

   ```powershell
   $cfg = Get-Content "$env:ProgramData\InnovationWebWorks\VpsAgent\agent-config.json" | ConvertFrom-Json
   $r = Invoke-WebRequest -UseBasicParsing -Uri "https://<portal>/api/agent/my-ip" -Headers @{ "X-Agent-Key" = $cfg.agentKey; "X-Server-Id" = $cfg.serverId }
   $r.StatusCode
   ```

   Expected: `200`. The same request with a wrong key (for example `ak_wrong`) returns `401`.

   Do not paste the key into tickets or chat. The file is readable only by SYSTEM and Administrators; to confirm, run `icacls "$env:ProgramData\InnovationWebWorks\VpsAgent\agent-config.json"` and check that only those two principals are listed.

## The `enforce` gate

`readyForEnforce` in the `/api/agent-keys/status` response is `true` only if every non-deleted server has `hasHash: true` and `lastRequestValid: true` with `lastValidAt` within the last 10 minutes.

Notes:

- Requests made with the previous key (`keyUsed: "previous"`) do not count. A server is ready only after its agent uses the new key.
- With no servers at all, `readyForEnforce` is `true` (nothing to lock out).
- The valid-request map is in memory. After a portal restart `readyForEnforce` stays `false` until each agent has polled again (a few minutes).
- A server that is offline, or still on an old agent, keeps `readyForEnforce` false. Fix or remove that server first (a deleted server does not count).

Switch to `enforce` only when:

1. `readyForEnforce` is `true` in the latest status call.
2. The database backup from step 1 exists.
3. You can reach each VPS to reinstall an agent if needed.

Then set `AGENT_AUTH_MODE=enforce` in `.env`, restart the process, and check:

```bash
curl -s -b <admin cookie> https://<portal>/api/agent-keys/status
```

Expected: every server keeps `lastRequestValid: true` after the next polling interval. If any turns false, roll back at once.

## Rollback to `warn`

1. Set `AGENT_AUTH_MODE=warn` in `.env`.
2. Restart the portal process.
3. Run `curl -s -b <admin cookie> https://<portal>/api/agent-keys/status`.

Expected: the log shows `[Config] Agent_Auth_Mode: warn`, agents without a key are accepted again, and servers return to `lastRequestValid: true` after they poll.

Lost or broken agent key on one server:

1. Rotate the key (SUPER_ADMIN, works in either mode):

   ```bash
   curl -s -X POST -b <admin cookie> -H "Content-Type: application/json" \
     -d '{"graceMinutes":60}' https://<portal>/api/servers/<serverId>/rotate-agent-key
   ```

   `graceMinutes` is an integer 0 to 1440 (default 0, other values return 400). With a value above 0 the previous key keeps working until `previousKeyExpiresAt`, so rotation causes no downtime; with 0 it stops working at once. If the old key is the lost or compromised one, use 0. The response returns `agentKey`, `installerUrl`, `graceMinutes` and `previousKeyExpiresAt`; the key and URL are shown once, with `Cache-Control: no-store`, so treat both as secrets. The audit entry `AGENT_KEY_ROTATED` records `graceMinutes`.
2. Reinstall the agent on that VPS using `installerUrl` (the installer writes `agent-config.json` locked to SYSTEM and Administrators).
3. Re-run the per-agent check above and confirm `keyUsed` is `current` before `previousKeyExpiresAt`.

In `enforce` mode a server that lost its key cannot receive `SET_AGENT_KEY`, because delivery is blocked there (409) and the agent cannot poll. Roll back to `warn` or reinstall.
