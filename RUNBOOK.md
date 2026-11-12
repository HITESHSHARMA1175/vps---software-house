# Operations Runbook

Procedures for operating the Innovation VPS portal (`server.js`, run by PM2 as `portal-backend`). Each procedure is a numbered list. Steps that can fail list the **Symptom** and the **Action** (continue, retry, or roll back).

Conventions: `<portal>` is the public portal host, `<admin cookie>` is a logged-in admin session cookie (SUPER_ADMIN where stated), `<serverId>` is the server id shown in the portal. Commands assume a Linux host with the project at `/opt/innovation-vps` (adjust to your path).

Contents

1. [Deployment](#1-deployment)
2. [Rollback](#2-rollback)
3. [Adding a VPS node](#3-adding-a-vps-node)
4. [Rotating Agent_Keys](#4-rotating-agent_keys)
5. [Switching `warn` to `enforce`](#5-switching-agent_auth_mode-from-warn-to-enforce)
6. [Restoring a MySQL backup](#6-restoring-a-mysql-backup)
7. [Running the Migration_Script](#7-running-the-migration_script-dry-run-first)
8. [Supporting procedures](#8-supporting-procedures) (backup and cron, encryption key, agent key delivery, `serverToken` retirement, PM2 single-instance rule, log rotation, real MariaDB/MySQL integration check)
9. [Known issues](#9-known-issues)

---

## 1. Deployment

1. **Take a database backup first** (see [8.1](#81-backup-procedure-and-cron)).
   - Expected: a new non-empty `<DB_NAME>_YYYYMMDD_HHMMSS.sql.gz` in `BACKUP_DIR`, exit status 0.
   - Symptom: the script exits non-zero or the file is 0 bytes. Action: stop; fix the cause (credentials, disk space, `mysqldump` missing) and retry. Do not deploy without a backup.

2. **Get the code and build the frontend.**

   ```bash
   cd /opt/innovation-vps
   git pull
   npm ci
   npm run build
   ```

   - Expected: `dist/` is regenerated and the build ends without errors.
   - Symptom: `npm ci` or the build fails. Action: stop; nothing is running the new code yet, so the live service is unaffected. Fix, then retry.

3. **Set each environment variable in `.env`** (copy from `.env.example` on first install: `cp .env.example .env`, then `chmod 600 .env`). Every variable defined in `.env.example` is listed here.

   Server and database

   | Variable | Notes |
   |---|---|
   | `PORT` | Backend port (default 5000). |
   | `NODE_ENV` | Set to `production` (PM2 also sets it from `ecosystem.config.cjs`). |
   | `HOST` | Bind address. Empty = `127.0.0.1` (reverse proxy only). |
   | `DB_HOST` | MySQL host. |
   | `DB_PORT` | MySQL port (3306). |
   | `DB_USER` | MySQL user. |
   | `DB_PASSWORD` | MySQL password. |
   | `DB_NAME` | Database name. |
   | `DB_SOCKET` | Optional Unix socket path. |
   | `ALLOW_JSON_FALLBACK` | Leave empty in production. `1` lets the portal fall back to `database.json` when MySQL is down. |

   Cache, sessions, origins, proxy

   | Variable | Notes |
   |---|---|
   | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Optional Redis; falls back to memory. |
   | `SESSION_SECRET` | Replace the example value with a long random string. |
   | `ALLOWED_ORIGIN` | Legacy allowed origin. |
   | `PORTAL_BASE_URL` | **Required in production, must be `https://`.** Used for installer, migration and telemetry URLs. |
   | `CORS_ALLOWED_ORIGINS` | Extra CORS origins, comma-separated, exact match. |
   | `TRUSTED_PROXIES` | Reverse proxy IPs/CIDRs. Must include the host running the PHP relay (`public/api_proxy.php`); empty = loopback only, which covers a same-host relay. See [8.7](#87-php-relay-and-trusted_proxies). |

   Secrets and authentication

   | Variable | Notes |
   |---|---|
   | `PASSWORD_ENCRYPTION_KEY` | **Required in production.** See [8.2](#82-password_encryption_key) before setting it. |
   | `AGENT_AUTH_MODE` | Empty or `warn` for a first deploy. See [5](#5-switching-agent_auth_mode-from-warn-to-enforce). |
   | `INTERNAL_SECRET` | Empty disables the `x-internal-secret` path. |
   | `SUPERADMIN_DEFAULT_PASS` | One-time initial admin password. In production the default admin is not seeded if empty. |

   Optional integrations

   | Variable | Notes |
   |---|---|
   | `TRANSLATE_ENABLED`, `TRANSLATE_API_KEY` | Translation is on only when `TRANSLATE_ENABLED=1` and the key is non-empty. |
   | `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PASSWORD`, `REMOTE_TARGET_DIR` | Used only by `deploy.js` / `deploy_fast.js`. |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email notifications. |

   Rate limits (each is a positive integer; empty = default). Invalid values fail startup and name the variable.

   | Variable | Default |
   |---|---|
   | `RATE_LIMIT_REQUEST_DEMO_MAX` / `_WINDOW_SEC` | 5 / 3600 |
   | `RATE_LIMIT_VERIFY_CUSTOMER_MAX` / `_WINDOW_SEC` | 5 / 3600 |
   | `RATE_LIMIT_VERIFY_CUSTOMER_IDENTIFIER_MAX` / `_WINDOW_SEC` | 3 / 3600 |
   | `RATE_LIMIT_PUBLIC_TICKETS_MAX` / `_WINDOW_SEC` | 10 / 3600 |
   | `RATE_LIMIT_RESET_PASSWORD_MAX` / `_WINDOW_SEC` | 5 / 900 |
   | `RATE_LIMIT_OTP_VERIFY_MAX` / `_WINDOW_SEC` | 5 / 900 |
   | `RATE_LIMIT_VALIDATE_LOGIN_MAX` / `_WINDOW_SEC` | 5 / 900 |
   | `RATE_LIMIT_VALIDATE_LOGIN_IP_MAX` / `_WINDOW_SEC` | 20 / 900 |
   | `RATE_LIMIT_AGENT_AUTH_FAIL_MAX` / `_WINDOW_SEC` | 30 / 300 |

   Backup script settings (not in `.env.example`; read by `scripts/backup_mysql.sh`): `BACKUP_DIR` (default `<project>/backups`) and `BACKUP_RETENTION_DAYS` (default 14, whole number 1 to 3650).

   - Symptom: the process exits at startup with a `[Config]` error naming a variable (missing `PORTAL_BASE_URL`, `http://` base URL in production, invalid `PASSWORD_ENCRYPTION_KEY`, bad rate limit value). Action: fix that variable and start again; no data was touched.

4. **Apply the database schema.** The schema is applied automatically and repeat-safely when the portal starts (`CREATE TABLE IF NOT EXISTS` and guarded `ALTER TABLE` in `initMySQLDatabase`). For a brand-new database you can also load the base schema first:

   ```bash
   mysql -u <DB_USER> -p <DB_NAME> < schema.sql
   ```

   - Expected: no errors. On the first start, the portal log shows the MySQL connection line.
   - Symptom: `Access denied` or `Unknown database`. Action: create the database and user, fix `DB_*`, retry.
   - Symptom: the log shows `[DB] ... widen failed`. Action: continue only if the code is `ER_DUP_FIELDNAME`-like and harmless; otherwise read the error, fix it, and restart (the statements are repeat-safe).

5. **Start under PM2** (single instance, see [8.5](#85-pm2-single-instance-rule)).

   ```bash
   mkdir -p logs
   pm2 start ecosystem.config.cjs      # first time
   # pm2 restart portal-backend         # later deploys
   pm2 save
   ```

   - Expected: `pm2 status` shows `portal-backend` as `online`, and the out log contains `[Config] Agent_Auth_Mode: warn` (or the mode you set).
   - Symptom: status `errored` or repeated restarts. Action: read `pm2 logs portal-backend --err --lines 100`; if the cause is configuration, fix it and `pm2 restart portal-backend`; if the new code is at fault, **roll back** ([2](#2-rollback)).

6. **Verify.**

   ```bash
   curl -i http://127.0.0.1:5000/health
   ```

   - Expected: HTTP 200 with body `{"status":"ok","db":"up"}`, and the login page loads at `https://<portal>/`.
   - Symptom: HTTP 503 `{"status":"degraded","db":"down"}`. Action: MySQL is unreachable or slower than 2 seconds; check `DB_*` and the database service, then retry. If it does not recover, **roll back**.
   - Symptom: connection refused. Action: check `pm2 status`; see step 5.

---

## 2. Rollback

Use when a deployment fails verification or causes errors.

1. **Stop or revert the PM2 process.**

   ```bash
   pm2 stop portal-backend
   ```

   - Expected: `pm2 status` shows `stopped`. Writes to the application stop here.

2. **Restore the previous build artifacts.**

   ```bash
   git log --oneline -5                 # find the previous release
   git checkout <previous-commit-or-tag>
   npm ci
   npm run build
   ```

   - Expected: the working tree matches the previous release and `dist/` is rebuilt.
   - Symptom: build fails. Action: restore the previous `dist/` and `node_modules` from your last known-good copy, or retry after fixing the cause.

3. **Restore the database** from the most recent backup taken before the deployment (step 1 of Deployment). Follow [6](#6-restoring-a-mysql-backup) steps 3 to 5. Skip this step only if the deployment made no database change you need to undo (schema changes are additive and repeat-safe).
   - If the Migration_Script ran, also restore the `database.json` copy and keep the same `PASSWORD_ENCRYPTION_KEY`; encrypted rows cannot be read by the previous release.

4. **Restore the previous `.env`** values if you changed them (for example `AGENT_AUTH_MODE=warn`).

5. **Start the service.**

   ```bash
   pm2 restart portal-backend
   ```

6. **Verify.**
   - Expected: `pm2 status` shows `online`, `curl -i http://127.0.0.1:5000/health` returns 200 with `{"status":"ok","db":"up"}`, and an admin can log in and see the server list.
   - Symptom: still failing. Action: restore an older backup (identify it by timestamp) and repeat; escalate if no backup restores cleanly.

---

## 3. Adding a VPS node

1. **Create the server record and generate its Agent_Key** (admin UI "Add Server", or the API).

   ```bash
   curl -s -X POST -b <admin cookie> -H "Content-Type: application/json" \
     -d '{"name":"<name>","ipPort":"<public-ip>:<port>"}' https://<portal>/api/servers
   ```

   - Expected: the response contains the server, an `agentKey` (shown once), and `agentInstall.installerUrl` plus `agentInstall.powershellCommand`. The response has no key hash. Only the hash is stored.
   - Symptom: 400 "Server Name is required". Action: add a name and retry.
   - Copy the `agentKey` and installer command now; treat them as secrets.

2. **Install the Agent on the node.** On the VPS, in an elevated PowerShell, run the `powershellCommand` from step 1 (the installer URL embeds a one-time token valid for 15 minutes, bound to this server). Requires `PORTAL_BASE_URL` to be `https://` in production.
   - Expected: the installer prints `Agent key saved to agent-config.json` and installs the `InnovationVpsAgent` Windows service. The service shows Running (`Check_VpsAgent_Status.bat`).
   - Symptom: the installer was served without a key (no `Agent key saved` line), the token was already used, or 15 minutes passed. Action: generate a new key and installer with `POST /api/servers/<serverId>/rotate-agent-key` (see [4](#4-rotating-agent_keys)), then re-run the installer.
   - Symptom: download or TLS failure. Action: check the VPS can reach `https://<portal>`; retry.

3. **Confirm the node reports to the system.**

   ```bash
   curl -s -b <admin cookie> https://<portal>/api/agent-keys/status
   ```

   - Expected: within a few polling intervals (about a minute) the entry for `<serverId>` shows `"hasHash": true`, `"lastRequestValid": true`, a recent `lastValidAt`, and an `agentVersion`; the server shows live telemetry (CPU, RAM) in the portal.
   - Symptom: `lastRequestValid` stays false or no telemetry. Action: check the agent log on the VPS and the firewall; in `warn` mode retry once, then re-issue the key and reinstall.

---

## 4. Rotating Agent_Keys

> **Use a grace window for zero-downtime rotation.** `rotate-agent-key` accepts an optional `graceMinutes` (integer 0 to 1440, default 0; anything else returns 400). With `graceMinutes` greater than 0 the previous key stays valid until `previousKeyExpiresAt`, so the agent keeps working while you install the new key. Recommended: `60`. With the default `0` the old key stops working immediately (the agent is rejected with 401 in `enforce` mode until the new key is installed).
>
> Grace window rules: only one previous key is kept (a second rotation replaces it); `previousKeyExpiresAt` is stored, survives a portal restart, and is checked on every request; after it passes the previous key is rejected.

Per-server procedure (SUPER_ADMIN). Each step says which side changes.

1. **Server side:** rotate.

   ```bash
   curl -s -X POST -b <admin cookie> -H "Content-Type: application/json" \
     -d '{"graceMinutes":60}' https://<portal>/api/servers/<serverId>/rotate-agent-key
   ```

   The admin UI rotate dialog has a "grace minutes" input for the same value.

   - Expected: JSON `{ "agentKey": "ak_...", "installerUrl": "https://<portal>/install.ps1?s=...&t=...", "graceMinutes": 60, "previousKeyExpiresAt": "<ISO time>" }`. The key and URL are shown once, with `Cache-Control: no-store`. The previous key is accepted until `previousKeyExpiresAt` (with `graceMinutes` 0 it is rejected at once). An audit entry `AGENT_KEY_ROTATED` is written with `graceMinutes` (no key or hash in it).
   - Symptom: 400. Action: `graceMinutes` must be an integer from 0 to 1440. 403: log in as SUPER_ADMIN. 404: wrong server id (no audit entry). 500 (rotation failed): the old key is kept; retry.
2. **Server side:** copy `installerUrl` (token valid 15 minutes, single use). Treat it as a secret.
3. **Agent side:** run the installer on the VPS in elevated PowerShell:

   ```powershell
   [Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; (New-Object Net.WebClient).DownloadString('<installerUrl>') | iex
   ```

   - Expected: `Agent key saved to agent-config.json` and the service restarts.
   - Symptom: token expired or used. Action: go back to step 1 for a new key.
4. **Server side:** verify with `GET /api/agent-keys/status`.
   - Expected: the server shows `lastRequestValid: true`, a fresh `lastValidAt`, and `keyUsed: "current"`. `keyUsed: "previous"` means the agent is still sending the old key (valid only because of the grace window). `readyForEnforce` ignores requests made with the previous key, so it stays `false` until the agent uses the new key.
   - Wait until `keyUsed` is `current` before `previousKeyExpiresAt`. If the window ends first, the old key stops working and the agent is rejected (401 in `enforce` mode).
   - Symptom: still `previous` or false after two polling intervals. Action: retry step 1 to 3 (use a longer `graceMinutes` if the window is nearly over); in `enforce` mode, if the agent cannot poll, switch to `warn` ([5](#5-switching-agent_auth_mode-from-warn-to-enforce) rollback) or reinstall by hand.
5. Repeat for the next server.

An agent that still has a working key can also receive a new key remotely with the delivery call in [8.3](#83-delivering-agent_keys-to-installed-agents); that path keeps the old key until the agent confirms, and also applies the grace window described in 8.3.

---

## 5. Switching Agent_Auth_Mode from `warn` to `enforce`

> Do not switch until `GET /api/agent-keys/status` reports `"readyForEnforce": true`. In `enforce` mode an agent without a valid key gets 401 on every agent endpoint and needs a manual reinstall.

1. **Precondition check (every Agent is sending a valid Agent_Key).**

   ```bash
   curl -s -b <admin cookie> https://<portal>/api/agent-keys/status
   ```

   - Expected: `"readyForEnforce": true`, and every non-deleted server has `hasHash: true`, `lastRequestValid: true`, `lastValidAt` within 10 minutes.
   - Symptom: `false`. Action: **do not continue.** Deliver keys to the servers that are not valid ([8.3](#83-delivering-agent_keys-to-installed-agents)), wait a few polling intervals, check again.
   - Note: the status map is in memory. After a portal restart it stays `false` until each agent has polled again (a few minutes). Wait and recheck.
2. Confirm a fresh database backup exists ([8.1](#81-backup-procedure-and-cron)) and you can reach each VPS to reinstall an agent if needed.
3. **Configuration change:** in `.env` set `AGENT_AUTH_MODE=enforce`.
4. **Apply:** `pm2 restart portal-backend`.
   - Expected: the out log shows `[Config] Agent_Auth_Mode: enforce`.
5. **Verify:** wait one to two polling intervals, then call `GET /api/agent-keys/status` again.
   - Expected: every server still shows `lastRequestValid: true`. (Right after the restart `readyForEnforce` is false until agents poll again; that is normal.)
6. **Revert to `warn`** if any agent is rejected (a server turns `lastRequestValid: false`, agents log 401):
   1. Set `AGENT_AUTH_MODE=warn` in `.env`.
   2. `pm2 restart portal-backend`.
   3. Check the log shows `[Config] Agent_Auth_Mode: warn` and the servers return to `lastRequestValid: true` after they poll.
   4. Fix the rejected server (re-deliver or rotate its key), then restart this procedure from step 1.

---

## 6. Restoring a MySQL backup

Backups are `${BACKUP_DIR}/${DB_NAME}_YYYYMMDD_HHMMSS.sql.gz` made by `scripts/backup_mysql.sh`.

1. **Identify the backup file.**

   ```bash
   ls -lt "$BACKUP_DIR"/*.sql.gz | head
   gzip -t "$BACKUP_DIR/<file>.sql.gz"
   ```

   - Expected: the file you need (latest before the incident, or the pre-deployment one) is listed, non-empty, and `gzip -t` prints nothing.
   - Symptom: `gzip -t` reports an error. Action: choose the next older file.
2. **Stop or pause writes to the application.**

   ```bash
   pm2 stop portal-backend
   ```

   - Expected: `pm2 status` shows `stopped`.
3. **Optional but recommended:** take a safety dump of the current state with `scripts/backup_mysql.sh` before overwriting it.
4. **Restore into MySQL.** To rehearse, restore into a scratch database first (`CREATE DATABASE vps_restore_test;`).

   ```bash
   gunzip -c "$BACKUP_DIR/<file>.sql.gz" | mysql -u <DB_USER> -p <DB_NAME>
   ```

   - Expected: no output and exit status 0.
   - Symptom: an error mid-way. Action: retry once into a freshly created empty database; if it still fails, use the next older backup.
5. **Restart the application.**

   ```bash
   pm2 restart portal-backend
   ```

6. **Verify the restore.**
   - Expected: `curl -i http://127.0.0.1:5000/health` returns 200 `{"status":"ok","db":"up"}`; an admin logs in; the server list and client list match the backup time; revealing one client password works (this proves the backup and `PASSWORD_ENCRYPTION_KEY` match).
   - Symptom: password reveal fails. Action: the key does not match the data; retrieve the correct key from your stored copies ([8.2](#82-password_encryption_key)).
   - Symptom: agents show rejected after the restore. Action: the stored key hashes came from the backup; if keys were rotated after it, re-rotate those servers ([4](#4-rotating-agent_keys)).

---

## 7. Running the Migration_Script (dry run first)

`scripts/migrate_passwords.js` encrypts stored plaintext passwords and TOTP secrets in MySQL and `database.json` (idempotent; already-encrypted `enc:v1:` values are skipped). It never prints a password or ciphertext.

### 7.1 Dry run

```bash
node scripts/migrate_passwords.js --dry-run
```

- Expected output: per-source counts (client passwords, server passwords, job passwords, TOTP secrets, TOTP temp secrets) of rows that would be migrated, skipped, or failed; **no writes and no backup**; exit status 0.
- **Stop and do not run the real migration** if any of these is true: the exit status is non-zero; any source reports failed rows or is unavailable; the counts do not match what you expect (for example far fewer rows than the tables hold); `PASSWORD_ENCRYPTION_KEY` is missing or invalid.

### 7.2 Gate checklist (mandatory before the real run)

Confirm every item:

- [ ] (a) `scripts/backup_mysql.sh` was run just now and `ls -l` shows a non-empty `.sql.gz`.
- [ ] (b) `database.json` was copied to a safe location outside the repository.
- [ ] (c) `PASSWORD_ENCRYPTION_KEY` is stored in two separate secure locations (password manager and offline copy), never in the repository or `BACKUP_DIR` ([8.2](#82-password_encryption_key)).
- [ ] (d) The dry run above was run and its per-field counts look right.
- [ ] The portal is stopped (`pm2 stop portal-backend`) so nothing rewrites `database.json` meanwhile.

Optional changes are approved separately and are not part of this run: dropping the `client_subscriptions.password` default and widening the `portal_users` TOTP columns.

### 7.3 Real run

```bash
node scripts/migrate_passwords.js --confirm-backup
```

- Without `--confirm-backup` (and without `--dry-run`) the script exits non-zero before touching anything.
- Expected: it backs up `database.json` with a timestamped name, verifies the copy, runs the idempotent column widening, encrypts rows, prints counts per source, exit status 0.
- Symptom: a non-zero exit with failed rows (logged by table and id only). Action: the other rows are done; fix or inspect the listed rows and run the same command again (it is idempotent). If many fail, restore from the backup ([6](#6-restoring-a-mysql-backup)).
- Symptom: connect timeout (30 seconds). Action: check `DB_*` and retry.
- Afterwards: `pm2 start portal-backend`, then verify by revealing one client password. Run the dry run again; it should report 0 to migrate.
- A single run migrates every source, including `database.json` `portalUsers` records that have both `two_factor_secret` and `two_factor_temp_secret` (see [9.3](#93-fixed-migrate_passwordsjs-two_factor-fields-in-one-run)). Do not run the real command twice; the follow-up dry run is only a check.

---

## 8. Supporting procedures

### 8.1 Backup procedure and cron

`scripts/backup_mysql.sh` writes `${BACKUP_DIR}/${DB_NAME}_YYYYMMDD_HHMMSS.sql.gz`.

```bash
scripts/backup_mysql.sh
ls -l "$BACKUP_DIR"/*.sql.gz
```

- Settings: environment first, then `.env` (read, not sourced): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `BACKUP_DIR` (default `<project>/backups`), `BACKUP_RETENTION_DAYS` (default 14, range 1 to 3650). The password is kept out of the `mysqldump` command line.
- On success it logs the file name and size and exits 0, then deletes dumps older than the retention period. On a `mysqldump` failure it removes the partial file, deletes no old backups, and exits non-zero.
- `BACKUP_DIR` must not hold the encryption key backup.

Cron example (daily at 02:30, output to a log file):

```cron
30 2 * * * /opt/innovation-vps/scripts/backup_mysql.sh >> /var/log/vps-backup.log 2>&1
```

Check `tail /var/log/vps-backup.log` after the first run. Symptom: a missing setting error or non-zero exit. Action: fix the named setting and rerun.

### 8.2 PASSWORD_ENCRYPTION_KEY

Managed passwords are stored as `enc:v1:` values encrypted with this key. Also see `README.md`, section "Encryption key backup".

1. Generate (once):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Expected: a 44-character base64 string (a 64-character hex string is also accepted).
2. Store it in **two separate secure places** (a password manager and an offline copy).
3. **Never** put it in the repository or in `BACKUP_DIR` (the directory that holds database dumps).
4. **Losing the key makes every encrypted password unrecoverable.**
5. **No key rotation** in the v1 format (the `enc:v1:` prefix leaves room for a future key id). Do not change the key on a database that holds encrypted data.
6. **Test a restore of a backup together with the key:** restore a dump into a scratch database, start the portal with the key, reveal one client password, and compare it with the known value.

### 8.3 Delivering Agent_Keys to installed agents

Full guide: `docs/AGENT_KEY_ROLLOUT.md`. Summary:

1. Back up the database ([8.1](#81-backup-procedure-and-cron)).
2. Keep `AGENT_AUTH_MODE` empty or `warn`; make sure agents run the version with `SET_AGENT_KEY` support (older agents get `UPDATE_AGENT` first and are reported as `needs_update`; run the delivery again after they update).
3. Deliver (SUPER_ADMIN):

   ```bash
   curl -s -X POST -b <admin cookie> -H "Content-Type: application/json" -d '{}' https://<portal>/api/servers/deploy-agent-keys
   curl -s -X POST -b <admin cookie> https://<portal>/api/servers/<serverId>/deploy-agent-key   # one server
   ```

   - Grace window: when a server already has a key hash, delivery keeps its previous key valid for a default of 60 minutes. Override with `-d '{"graceMinutes":120}'` (integer 0 to 1440; the same body field works on `deploy-agent-key`). Servers without a hash have no previous key, so no window applies. Check `keyUsed` in the status call (see [4](#4-rotating-agent_keys)) and make sure the agent switches to the new key before the window ends.
   - Expected: lists `queued`, `needs_update`, `skipped`. No keys or hashes in the response.
   - Symptom: 409. Action: `PORTAL_BASE_URL` is not `https://` in production, or the mode is `enforce`; fix or switch to `warn`.
4. Check `GET /api/agent-keys/status` until each server shows `hasHash: true` and `lastRequestValid: true`.
5. Only when `readyForEnforce` is `true`, follow [5](#5-switching-agent_auth_mode-from-warn-to-enforce). Roll back to `warn` there if any agent is rejected.

### 8.4 `serverToken` retirement

The backend ignores the legacy `serverToken` field and the `X-Server-Token` header. `X-Server-Id` is only a hint to find the server, never authentication; identity comes from `X-Agent-Key`. Installed agents may still send `serverToken` (the installer still writes the placeholder value into `agent-config.json`); this is harmless. A later agent release will stop sending them once all agents are upgraded. No operator action is needed.

### 8.5 PM2 single-instance rule

Run exactly one instance: `instances: 1`, `exec_mode: 'fork'` in `ecosystem.config.cjs`. Do not use cluster mode or `pm2 scale`. The portal keeps state in process memory (session cache fallback, telemetry store, long-poll emitters, pre-auth and OTP stores, rate-limit counters, installer tokens, the agent key status map), so a login, OTP, or long-poll landing on a second process would fail. Restart policy: auto-restart, 512 MB memory limit, up to 10 restarts then `errored`.

### 8.6 Log rotation

Run once on the host:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

Logs are in `./logs/portal-backend-out.log` and `./logs/portal-backend-error.log` with timestamps. Expected: `pm2 conf pm2-logrotate` shows `max_size` 10M and `retain` 14.

### 8.7 PHP relay and TRUSTED_PROXIES

`public/api_proxy.php` forwards requests to the Node portal. It sets `X-Forwarded-For` and `X-Real-IP` to its own `REMOTE_ADDR` and drops any copies sent by the client, so clients cannot spoof their IP through the relay.

`TRUSTED_PROXIES` must list the address of the host running the PHP relay, as seen by the Node portal. If the relay runs on the same host as Node, that is `127.0.0.1` and `::1`, which the default (empty = loopback only) already covers. If the relay runs on another host, add that host's IP or CIDR.

Cloudflare caveat: if the PHP host is itself behind Cloudflare or another proxy, `REMOTE_ADDR` is that proxy's address. All clients then appear to come from it (shared rate limits and audit IPs). This case is not handled.

### 8.8 Real MariaDB/MySQL integration check

`scripts/test_real_mysql.js` (`npm run test:realmysql`) is an opt-in check against a real, disposable MariaDB/MySQL server. Without `REAL_MYSQL_URL` it prints `SKIPPED (REAL_MYSQL_URL not set)` and exits 0.

What it does:

1. Reads `REAL_MYSQL_URL` (`mysql://user:password@host:port`). Any database in the URL path is never used to pick the target.
2. Generates a throwaway database named `vps_it_<hex>`. It refuses to run (prints `REFUSED: ...`, creates nothing, exit 1) if that name, or the database in the URL, equals `DB_NAME` / `MYSQL_DATABASE` from the environment or `.env`. `.env` is read only for this check and is never loaded into the environment.
3. Creates the database and loads `schema.sql` into it with the `CREATE DATABASE` and `USE` statements stripped, so the production database name can never be touched.
4. Runs `initMySQLDatabase` twice and checks that the row counts of every table are equal (repeat-safe).
5. Checks through `information_schema` that the widened columns have the expected length, and inserts a long value into each.
6. Inserts a user and a session and runs the same JOIN as session validation, expecting exactly one row.
7. In a `finally` block, drops only the throwaway database, even when a step failed.

Procedure (needs Docker):

1. **Start a disposable server.**

   ```bash
   docker run --rm -d --name vps-itest -e MARIADB_ROOT_PASSWORD=itest -p 3307:3306 mariadb:11
   ```

2. **Wait until it accepts connections** (a few seconds to about 30 seconds on first start). Check the logs for `ready for connections`:

   ```bash
   docker logs vps-itest 2>&1 | grep "ready for connections"
   ```

   The line appears twice (the temporary init server, then the real one). Wait for the second one.
   - Symptom: the next step fails with `ECONNREFUSED` or `ECONNRESET`. Action: wait a few more seconds and run it again.

3. **Run the check.** PowerShell:

   ```powershell
   $env:REAL_MYSQL_URL = "mysql://root:itest@127.0.0.1:3307/"
   npm run test:realmysql
   ```

   bash:

   ```bash
   REAL_MYSQL_URL=mysql://root:itest@127.0.0.1:3307/ npm run test:realmysql
   ```

   - Expected: a `PASS` line per step (create throwaway database, load schema, both `initMySQLDatabase` runs, each column length and long-value insert, the session JOIN), then `dropped throwaway database vps_it_<hex>` and `PASSED: <n> passed, 0 failed`, exit status 0.
   - Symptom: `FAIL` lines or `FAILED: ...`, exit status 1. Action: read the failing step; the throwaway database is still dropped. Do not deploy changes to the schema or `initMySQLDatabase` until it passes.

4. **Stop the server.** `--rm` removes the container on stop:

   ```bash
   docker stop vps-itest
   ```

   PowerShell: clear the variable with `Remove-Item Env:REAL_MYSQL_URL`.

> **Warning: never point `REAL_MYSQL_URL` at the production server.** The script creates and drops databases with the given credentials. The `DB_NAME` guard only protects one database name, not the server. Use only a disposable local container.

---

## 9. Known issues

Found by the test suite. Items marked Fixed have been fixed in the code; the others are open product defects. Plan around the open ones.

### 9.1 Fixed: `DB_FILE_PATH` environment variable

Fixed. `server.js` now honors `DB_FILE_PATH` (default `<repo>/database.json`). If you set it, the Migration_Script gate item (b) and any backup of the JSON data must use that path.

### 9.2 `DbUnavailableError` does not always produce HTTP 503

The final error handler returns 503 `{"error":"Database unavailable"}` for `DbUnavailableError`, but some routes catch it first: they answer 500 (for example "Failed to load requests") or fall back to in-memory data and answer 200 (for example `GET /api/servers`, `GET /api/employees`). Impact: when MySQL is down, do not rely on route status codes. Use `GET /health` (503 `degraded/down`) for monitoring. Data shown during an outage may be stale.

### 9.3 Fixed: `migrate_passwords.js` two_factor fields in one run

Fixed. `portalUsers` is the `database.json` collection for two sources (`two_factor_secret` and `two_factor_temp_secret`). `scripts/migrate_passwords.js` now applies sources that share a collection cumulatively, so both TOTP fields migrate in a single run and a second run reports 0 migrated. No workaround is needed.

### 9.4 Unhandled `JobParamError` in job routes

`POST /api/users/:id/provision-vps`, `POST /api/users`, and `os-users/:username/change-password` queue jobs outside a try/catch in async handlers. A hostile username or drive makes `JobParamError` an unhandled rejection in Express 4: the request hangs with no 400 response, and on Node 15 or later the process can terminate. Nothing is queued. Impact: PM2 restarts the process (see [8.5](#85-pm2-single-instance-rule)); expect a brief outage and `JobParamError` in the error log after a malformed request. Action: if you see repeated restarts with `JobParamError`, find the caller in the access logs and block it.

### 9.5 `GET /api/servers` returns the Agent_Key hash

`GET /api/servers` includes each server's `apiKey` (the stored Agent_Key hash) for authenticated staff, although `POST /api/servers` omits it and the public projection does not strip it. The hash is not the key, and the key cannot be derived from it, but it should not be exposed. Impact: treat portal staff sessions as sensitive and avoid sharing `GET /api/servers` output (screenshots, tickets). The list remains correct for the readiness checks.

### 9.6 Fixed: Open Issue 2, key rotation grace window

Fixed. `rotate-agent-key` accepts an optional `graceMinutes` (0 to 1440, default 0) that keeps the previous key valid until `previousKeyExpiresAt`; key delivery defaults to a 60-minute window. Use `graceMinutes` (for example 60) for zero-downtime rotation; see [4](#4-rotating-agent_keys). Without `graceMinutes` the old key is rejected immediately, as before.
