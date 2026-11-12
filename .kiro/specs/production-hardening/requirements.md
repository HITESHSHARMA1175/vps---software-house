# Requirements Document

## Introduction

This feature hardens and completes the existing VPS management portal for production use. The portal consists of a React + Vite frontend (`src/`), a single Express backend (`server.js`), a MySQL schema (`schema.sql`), and a Windows agent (`VpsAgent.ps1`, `VpsAgentService.cs`, installer scripts) running on each VPS node.

Work is delivered in six ordered phases: (1) agent authentication, (2) secrets and passwords, (3) data storage, (4) infrastructure fixes, (5) automated tests, (6) operations tooling. Existing behavior and API response shapes the frontend depends on are preserved. Destructive changes require prior user approval.

Findings from code review that this spec addresses:

- Agent endpoints identify callers only by `serverId` or IP and trust spoofable `cf-connecting-ip` and `x-forwarded-for` headers.
- `vps_servers.apiKey` exists (`VARCHAR(100)`) but is unused for authentication.
- `'Pass#123'` is hardcoded in `schema.sql` and in many places in `server.js` (provisioning, migration, bulk import, export).
- `validateSession` falls back to the hardcoded `INTERNAL_SECRET` value `vps-internal-automation-2026`.
- Default portal users are seeded with passwords `emp123`, `sales123`, and fallback `Admin@12345`.
- `checkRateLimit` is async but is called without `await` in the forgot-password route.
- `app.set('trust proxy', 1)` is set unconditionally, and `app.listen` binds to `0.0.0.0`.
- `https://vps.innovationwebworks.in` is hardcoded in migration URLs, the telemetry URL, CORS checks, and portal URL derivation.
- Requests, renewals, migrations, and deletedServers exist only in `memoryStore` / `database.json`.
- `dev:all` runs only `node server.js`.
- `xlsx@^0.18.5` has known vulnerabilities.
- The translate feature uses an unofficial Google endpoint.
- The existing test hook exports `app` when `TEST_MODE=1`.

## Glossary

- **Portal_Backend**: The Express application in `server.js`.
- **Portal_Frontend**: The React + Vite application in `src/`.
- **Agent**: The Windows component on a VPS node (`VpsAgent.ps1` and `VpsAgentService.cs`, installed via `install.ps1` and the `.bat` scripts).
- **Agent_Endpoint**: Any Portal_Backend route called by an Agent: `/api/agent/telemetry`, `job-result`, `session-event`, `duplicate-session-event`, `migration/upload-full`, `migration/upload-chunk`, `migration/download-chunk`, `detect-server`, `listen-jobs`, and `poll-instant`.
- **Agent_Key**: A per-server secret stored for a `vps_servers` row and sent by the Agent in the `X-Agent-Key` header.
- **Agent_Key_Hash**: The stored one-way hash of an Agent_Key in the `vps_servers.apiKey` column.
- **Agent_Auth_Mode**: A Portal_Backend setting with values `warn` (accept missing or invalid keys and log a warning) and `enforce` (reject them).
- **Trusted_Proxy**: A reverse proxy whose address is listed in the `TRUSTED_PROXIES` environment variable.
- **Forwarded_IP_Header**: Any of `cf-connecting-ip`, `x-forwarded-for`, or `x-real-ip`.
- **Managed_Password**: A Windows account password stored in `client_subscriptions.password`, `vps_servers.superClientPass`, or `vps_provision_jobs.password`.
- **Secret_Cipher**: The module that encrypts and decrypts Managed_Passwords using AES-256-GCM.
- **Encryption_Key**: A 32-byte key supplied in the `PASSWORD_ENCRYPTION_KEY` environment variable (base64 or hex encoded).
- **Migration_Script**: A one-time Node.js script that converts existing plaintext Managed_Passwords to ciphertext.
- **Provision_Job**: A row in `vps_provision_jobs` describing work an Agent executes (create user, change password, terminate session, and similar).
- **Audit_Log**: The `audit_logs` table written by `logAudit`.
- **Memory_Store**: The in-process `memoryStore` object persisted to `database.json`.
- **Entity_Tables**: The new MySQL tables for `requests`, `renewals`, `migrations`, and `deleted_servers`.
- **Production_Mode**: Operation with `NODE_ENV=production`.
- **Portal_Base_URL**: The public URL of the portal, read from the `PORTAL_BASE_URL` environment variable.
- **Test_Suite**: The automated tests run with Vitest or Jest plus Supertest.
- **Backup_Script**: The shell script that dumps the MySQL database.
- **Runbook**: The `RUNBOOK.md` operations document.
- **Change_Report**: A summary at the end of each task listing files changed and how to verify them.
- **Implementation**: The set of changes delivered to the repository to satisfy this document.
- **Implementer**: The agent or developer who carries out the Implementation.
- **Entity_Table**: Any one of the Entity_Tables.
- **PM2**: The Node.js process manager that runs the Portal_Backend in production.

## Requirements

### Requirement 1: Per-Server Agent Authentication

**User Story:** As a platform operator, I want every Agent request to carry a per-server key, so that a caller cannot impersonate a VPS node by guessing its serverId or IP.

#### Acceptance Criteria

1. WHEN an Agent_Endpoint request is received while Agent_Auth_Mode is `enforce`, THE Portal_Backend SHALL verify the `X-Agent-Key` header against the Agent_Key_Hash of the server identified in the request, and SHALL process the request only if the key matches.
2. WHEN the Portal_Backend compares a submitted Agent_Key with a stored Agent_Key_Hash, THE Portal_Backend SHALL use a constant-time comparison so that the comparison duration does not depend on the number of matching leading characters.
3. IF the `X-Agent-Key` header is missing, empty, or does not match while Agent_Auth_Mode is `enforce`, THEN THE Portal_Backend SHALL reject the request with HTTP 401, SHALL return a response body identical to that returned for a non-existent serverId, and SHALL leave server data unchanged.
4. IF an Agent_Endpoint request targets a serverId that does not exist while Agent_Auth_Mode is `enforce`, THEN THE Portal_Backend SHALL respond with the same HTTP 401 status, body, and headers as for an invalid key.
5. WHILE Agent_Auth_Mode is `enforce`, THE Portal_Backend SHALL apply Agent_Key verification to every Agent_Endpoint listed in the Glossary, with no listed endpoint accepting an unauthenticated request.
6. WHEN an Agent_Key is generated, THE Portal_Backend SHALL create it from at least 32 bytes (256 bits) of output from a cryptographically secure random generator.
7. WHEN an Agent_Key is generated, THE Portal_Backend SHALL store only the Agent_Key_Hash in `vps_servers.apiKey` and SHALL display the plaintext Agent_Key to the requesting admin exactly once, such that no later API response or page view contains it.
8. WHEN the schema migration runs, THE Portal_Backend SHALL ensure `vps_servers.apiKey` can hold the full Agent_Key_Hash, widening the column if required, and SHALL preserve all existing rows and values.
9. WHEN a new server is created through the Portal_Backend, THE Portal_Backend SHALL generate an Agent_Key and include it in the generated installer for that server.
10. IF an Agent_Endpoint request fails authentication, THEN THE Portal_Backend SHALL write an Audit_Log entry containing the serverId as submitted, source IP, endpoint, and timestamp, and SHALL omit the submitted key value.
11. IF the Agent_Key_Hash cannot be read for a server (storage error or empty `vps_servers.apiKey`) while Agent_Auth_Mode is `enforce`, THEN THE Portal_Backend SHALL reject the request with the same HTTP 401 response as for an invalid key and SHALL write an Audit_Log entry.

### Requirement 2: Agent Key Rotation

**User Story:** As an admin, I want to rotate a server's Agent_Key from the UI or API, so that I can revoke a leaked key without reinstalling the portal.

#### Acceptance Criteria

1. WHEN an authenticated SUPER_ADMIN requests key rotation for an existing server, THE Portal_Backend SHALL generate a new Agent_Key of at least 32 random characters, replace the stored Agent_Key_Hash with the hash of the new Agent_Key, and return the new plaintext Agent_Key in that response only, within 2 seconds.
2. WHEN a key rotation completes, THE Portal_Backend SHALL write one Audit_Log entry containing the acting user's identifier, the server identifier, the action type "agent key rotation", and the timestamp, and THE entry SHALL NOT contain the plaintext Agent_Key or the Agent_Key_Hash.
3. IF a user whose role is not SUPER_ADMIN requests key rotation, THEN THE Portal_Backend SHALL respond with HTTP 403, leave the stored Agent_Key_Hash unchanged, and not return any Agent_Key.
4. WHEN a key rotation completes with `graceMinutes` omitted or equal to 0, THE Portal_Backend SHALL reject any Agent_Endpoint request that presents the previous Agent_Key, starting with the next request received after the rotation response is sent, while Agent_Auth_Mode is `enforce`. A rotation with `graceMinutes` greater than 0 follows criteria 10 to 16 instead.
5. IF key rotation is requested for a server identifier that does not exist, THEN THE Portal_Backend SHALL respond with an error indicating the server was not found and SHALL NOT create or modify any Agent_Key_Hash or Audit_Log entry.
6. IF key rotation fails before the new Agent_Key_Hash is stored, THEN THE Portal_Backend SHALL respond with an error indicating rotation failed, retain the previous Agent_Key_Hash so the previous Agent_Key stays valid, and not return a new Agent_Key.
7. WHEN the Portal_Backend returns a new Agent_Key, THE Portal_Frontend SHALL display it with a copy action that places the full key on the clipboard, and SHALL provide a rotate control on the server management screen that requires user confirmation before sending the rotation request.
8. WHEN a key rotation completes, THE Portal_Frontend SHALL provide a download of an installer pre-configured with the new Agent_Key, available until the user closes the new-key display.
9. IF the rotation request fails, THEN THE Portal_Frontend SHALL display an error message indicating the failure reason and SHALL NOT display any Agent_Key or installer download.
10. THE rotation request SHALL accept an optional `graceMinutes` value that is an integer from 0 to 1440, with a default of 0 when omitted. IF `graceMinutes` is present and is not an integer in that range, THEN THE Portal_Backend SHALL respond with HTTP 400, leave the stored Agent_Key_Hash and any grace window unchanged, return no Agent_Key, and write no Audit_Log entry.
11. WHEN a rotation with `graceMinutes` greater than 0 completes, THE Portal_Backend SHALL keep the hash of the replaced Agent_Key valid as the previous Agent_Key alongside the hash of the new Agent_Key until the grace window ends, and SHALL treat a request presenting either key as authenticated (keyValid true) for Agent_Auth_Mode `warn` and `enforce`.
12. THE Portal_Backend SHALL persist the previous Agent_Key_Hash and its expiry timestamp (`previousKeyExpiresAt`) in storage, so that a restart of the Portal_Backend neither shortens nor extends the grace window.
13. THE Portal_Backend SHALL evaluate grace window expiry at request time against the current clock: a request presenting the previous Agent_Key at or after `previousKeyExpiresAt` SHALL be rejected like any other invalid key, and a request before it SHALL be accepted.
14. WHEN another rotation completes, THE Portal_Backend SHALL discard the previous Agent_Key_Hash of the earlier rotation, so that at most one previous Agent_Key is valid for a server at any time and only the keys of the latest rotation are accepted.
15. WHEN a rotation completes, THE Audit_Log entry from criterion 2 SHALL record the `graceMinutes` value used and SHALL NOT contain the plaintext Agent_Key, the new Agent_Key_Hash, or the previous Agent_Key_Hash.
16. WHEN an Agent_Endpoint request is authenticated, THE Portal_Backend SHALL record in the agent key status (Requirement 4.7) whether the current key or the previous key was used, and a Provision_Job carrying a delivered Agent_Key (Requirement 26) SHALL still reach an Agent that authenticates with the previous key during the grace window.
17. THE Portal_Frontend rotate dialog, shown to SUPER_ADMIN only, SHALL provide a `graceMinutes` input restricted to integers from 0 to 1440 with a default of 0, SHALL send the chosen value with the rotation request, and SHALL show when the grace window ends if a window was set.

### Requirement 3: Trusted Proxy IP Handling

**User Story:** As a platform operator, I want forwarded IP headers honored only from my reverse proxy, so that clients cannot spoof their source IP.

#### Acceptance Criteria

1. WHEN the Portal_Backend starts, THE Portal_Backend SHALL read the Trusted_Proxy list from the `TRUSTED_PROXIES` environment variable as a comma-separated list of at most 50 entries, where each entry is an IPv4 address, an IPv6 address, or a CIDR range, and whitespace around entries is ignored.
2. WHEN a request arrives from an address that is not a Trusted_Proxy, THE Portal_Backend SHALL ignore all Forwarded_IP_Headers and use the socket remote address as the client IP.
3. WHEN a request arrives from a Trusted_Proxy, THE Portal_Backend SHALL derive the client IP from the Forwarded_IP_Headers by taking the right-most address in the forwarded chain that is not itself a Trusted_Proxy.
4. IF a request arrives from a Trusted_Proxy and the Forwarded_IP_Headers are absent or contain no valid IPv4 or IPv6 address, THEN THE Portal_Backend SHALL use the socket remote address as the client IP.
5. THE Portal_Backend SHALL replace the unconditional `app.set('trust proxy', 1)` with a setting derived from `TRUSTED_PROXIES`.
6. THE Portal_Backend SHALL use the derived client IP for rate limiting, Audit_Log entries, and Agent_Endpoint source checks.
7. IF `TRUSTED_PROXIES` is unset or empty, THEN THE Portal_Backend SHALL trust only the loopback addresses 127.0.0.1 and ::1.
8. IF `TRUSTED_PROXIES` contains an entry that is not a valid IPv4 address, IPv6 address, or CIDR range, THEN THE Portal_Backend SHALL fail to start and write an error to the console identifying the invalid entry.
9. THE PHP relay `public/api_proxy.php` (deployed as `api_proxy.php` through the build into `dist/`) SHALL set the client IP headers it forwards to the Portal_Backend from the address of its own incoming connection (`X-Forwarded-For` and `X-Real-IP` both set to `REMOTE_ADDR`), SHALL overwrite rather than append to those headers, and SHALL NOT pass through any client-supplied `X-Forwarded-For`, `X-Real-IP`, or `CF-Connecting-IP` header value.
10. THE `RUNBOOK.md` and `.env.example` files SHALL state that `TRUSTED_PROXIES` must list the address of the host that runs the PHP relay (`127.0.0.1` and `::1` when it runs on the same host as the Portal_Backend), so that the forwarded client IP is honored under criterion 3 and a client-supplied header cannot be.

### Requirement 4: Agent Authentication Migration Period

**User Story:** As a platform operator, I want a transition period where old agents keep working, so that I can update all VPS nodes without an outage.

#### Acceptance Criteria

1. WHEN the Portal_Backend starts, THE Portal_Backend SHALL read Agent_Auth_Mode from the `AGENT_AUTH_MODE` environment variable, accept only the exact lowercase values `warn` and `enforce`, and log the active mode.
2. WHILE Agent_Auth_Mode is `warn`, THE Portal_Backend SHALL accept and process an Agent_Endpoint request that has no Agent_Key, or whose Agent_Key is invalid for a server that has no Agent_Key_Hash.
3. WHILE Agent_Auth_Mode is `warn`, WHEN the Portal_Backend accepts an Agent_Endpoint request under criterion 2, THE Portal_Backend SHALL log one warning containing the serverId and endpoint, and SHALL log no more than one such warning per serverId within any 10-minute window.
4. WHILE Agent_Auth_Mode is `warn`, IF an Agent_Endpoint request carries an Agent_Key that does not match the Agent_Key_Hash of a server that has one, THEN THE Portal_Backend SHALL reject the request with an authentication failure response, SHALL NOT process the request, and SHALL log the rejection with the serverId and endpoint.
5. WHILE Agent_Auth_Mode is `enforce`, IF an Agent_Endpoint request has a missing or invalid Agent_Key, THEN THE Portal_Backend SHALL reject the request with an authentication failure response, SHALL NOT process the request, and SHALL log the rejection with the serverId and endpoint.
6. WHERE `NODE_ENV` is `production`, IF `AGENT_AUTH_MODE` is unset or an empty string, THEN THE Portal_Backend SHALL set Agent_Auth_Mode to `warn` and log that the default was applied.
7. WHEN an admin requests the agent key status, THE Portal_Backend SHALL return, for each server, the serverId, whether the most recent Agent_Endpoint request from that server carried a valid Agent_Key (true, false, or no value if no request has been received), and the timestamp of that request.
8. IF `AGENT_AUTH_MODE` is set to a non-empty value other than `warn` or `enforce`, THEN THE Portal_Backend SHALL log an error naming the invalid value and the allowed values, and SHALL exit with a non-zero exit code before accepting any request.

### Requirement 5: Agent Scripts Send the Key

**User Story:** As a platform operator, I want the agent and installers to send the Agent_Key, so that agents keep working after enforcement.

#### Acceptance Criteria

1. WHEN the Agent sends a request to an Agent_Endpoint, THE Agent SHALL include the `X-Agent-Key` header containing the stored Agent_Key value.
2. THE `install.ps1`, `VpsAgent.ps1`, `VpsAgent.master.ps1`, `Create_Tally_User.master.ps1`, and `VpsAgentService.cs` files SHALL read the Agent_Key from the agent configuration stored under `%ProgramData%\InnovationWebWorks\VpsAgent`.
3. WHEN the installer is generated by the Portal_Backend for a server, THE Portal_Backend SHALL embed that server's Agent_Key in the installer output.
4. WHEN `scripts/build_encrypted_scripts.js` runs, THE script SHALL produce encrypted script bundles whose decrypted contents include the code that reads the Agent_Key and sends the `X-Agent-Key` header.
5. IF an Agent_Endpoint responds with HTTP 401, THEN THE Agent SHALL write a failure entry to its local log containing the timestamp and the endpoint name, keep the process running, and retry on the next polling interval.
6. IF the stored Agent_Key is missing, empty, or unreadable when the Agent prepares a request, THEN THE Agent SHALL skip the request, write a failure entry to its local log indicating the missing key, keep the process running, and retry on the next polling interval.
7. WHEN the `Update_VpsAgent.bat` script completes, THE Agent configuration SHALL contain an Agent_Key value identical to the value present before the update.
8. WHEN the Agent stores the Agent_Key, THE Agent SHALL set the file permissions so that only the SYSTEM and Administrators accounts have access and all other accounts have no access.

### Requirement 6: Remove Hardcoded Default Passwords and Secrets

**User Story:** As a security-conscious operator, I want no hardcoded default credentials in the code or schema, so that a fresh deployment is not accessible with known passwords.

#### Acceptance Criteria

1. THE `schema.sql` file SHALL define `client_subscriptions.password` without the default value `'Pass#123'`.
2. THE Portal_Backend SHALL contain no `ALTER TABLE ... DEFAULT 'Pass#123'` statement in `initMySQLDatabase`.
3. WHEN the Portal_Backend creates a new client and no password is supplied, THE Portal_Backend SHALL generate a random password of 16 to 64 characters containing at least one uppercase letter, one lowercase letter, and one digit.
4. THE Portal_Backend SHALL contain no `'Pass#123'` literal in provisioning, migration, bulk import, and export code paths.
5. WHEN the Portal_Backend exports client data, THE Portal_Backend SHALL omit the password column by default and SHALL NOT substitute `'Pass#123'` or any other default for an empty value.
6. THE Portal_Backend SHALL read `INTERNAL_SECRET` only from the process environment and SHALL NOT define a fallback literal value in code.
7. IF `INTERNAL_SECRET` is unset or an empty string at startup, THEN THE Portal_Backend SHALL reject every request that uses the `x-internal-secret` header with an authentication failure response and SHALL write one log entry stating that the internal secret path is disabled.
8. IF Production_Mode is active and `SUPERADMIN_DEFAULT_PASS` is unset or an empty string, THEN THE Portal_Backend SHALL skip seeding the default admin user, SHALL write one error log entry naming `SUPERADMIN_DEFAULT_PASS`, and SHALL continue starting.
9. WHERE Production_Mode is active, THE Portal_Backend SHALL skip seeding the `employee` and `sales` demo users.
10. WHEN the Portal_Backend starts in Production_Mode and a portal user has a password matching `emp123`, `sales123`, or `Admin@12345`, THE Portal_Backend SHALL write one warning log entry per matching user containing the username and SHALL NOT include the password value in the entry.
11. THE `.env.example` file SHALL list every environment variable introduced by this spec, each with a placeholder value that is empty or clearly marked as a placeholder.
12. WHEN a client export request (`POST /api/clients/export`) sets `includePasswords` to true and `confirm` to true and the acting user is SUPER_ADMIN, THE Portal_Backend SHALL decrypt the stored passwords for that response only and SHALL write exactly one Audit_Log entry with the action `CLIENTS_EXPORTED_WITH_PASSWORDS` containing the acting user, the number of rows exported, and the timestamp, without any password value; IF `includePasswords` is true and the acting user is not SUPER_ADMIN or `confirm` is not true, THEN THE Portal_Backend SHALL respond with HTTP 403, SHALL NOT decrypt any password, and SHALL write no export audit entry. A request without `includePasswords` SHALL return rows with no password column and SHALL write no export audit entry.

### Requirement 7: Encrypt Managed Passwords at Rest

**User Story:** As a security-conscious operator, I want managed Windows passwords encrypted in the database, so that a database leak does not expose client credentials.

#### Acceptance Criteria

1. WHEN the Portal_Backend encrypts a Managed_Password, THE Secret_Cipher SHALL use AES-256-GCM with the Encryption_Key and a newly generated random 12-byte nonce for each encryption.
2. WHEN the Secret_Cipher encrypts a plaintext, THE Secret_Cipher SHALL return a single string containing, in order, a version prefix, the nonce, the authentication tag, and the encrypted data.
3. FOR ALL valid plaintext strings of 1 to 256 characters (including non-ASCII characters), decrypting the output of encrypting that string SHALL return the original string (round-trip property).
4. FOR ALL plaintext strings of 1 to 256 characters, encrypting the same plaintext twice SHALL produce two different ciphertext strings.
5. IF any part of a stored ciphertext (version prefix, nonce, authentication tag, or encrypted data) has been modified or is malformed, THEN THE Secret_Cipher SHALL raise an error on decryption, SHALL NOT return any plaintext, and THE Portal_Backend SHALL leave the stored value unchanged.
6. IF the Encryption_Key is missing or does not decode to exactly 32 bytes, THEN THE Portal_Backend SHALL refuse to start in Production_Mode, exit with a non-zero status, and write a log entry stating the key is missing or has an invalid length, without including the key value.
7. WHEN the Portal_Backend writes `client_subscriptions.password`, `vps_servers.superClientPass`, or `vps_provision_jobs.password` to MySQL or Memory_Store, THE Portal_Backend SHALL write the Secret_Cipher ciphertext and SHALL NOT write the plaintext.
8. WHEN the schema migration runs, THE schema migration SHALL widen the three Managed_Password columns to hold at least 512 characters, SHALL preserve all existing rows and values, and SHALL be safe to run repeatedly without error.
9. WHEN the Portal_Backend builds a Provision_Job payload for an authenticated Agent, THE Portal_Backend SHALL decrypt the Managed_Password for that payload only.
10. THE Portal_Backend SHALL omit Managed_Passwords from all list and detail API responses, except the explicit admin view in criterion 11.
11. WHEN a SUPER_ADMIN explicitly requests to view a Managed_Password, THE Portal_Backend SHALL return the plaintext in that response only and SHALL write an Audit_Log entry containing the acting user, the target account, and the timestamp, without the password value.
12. IF a user whose role is not SUPER_ADMIN requests to view a Managed_Password, THEN THE Portal_Backend SHALL respond with HTTP 403, SHALL NOT return any password data, and SHALL NOT decrypt the stored value.
13. THE Portal_Backend SHALL NOT include plaintext or ciphertext Managed_Passwords in console logs, Audit_Log details, or error responses.
14. WHERE a stored Managed_Password lacks the ciphertext version prefix, THE Secret_Cipher SHALL treat the value as legacy plaintext and return it unchanged on decryption, and THE Portal_Backend SHALL write it back as ciphertext the next time that record is written.
15. IF decryption of a stored Managed_Password fails when building a Provision_Job payload or an admin view, THEN THE Portal_Backend SHALL return an error response indicating the password cannot be decrypted, SHALL NOT include any password data, and SHALL NOT create or dispatch the Provision_Job payload.
16. THE repository documentation (`README.md` and a comment in `.env.example`) SHALL describe how to generate the Encryption_Key, SHALL require storing it in at least two separate secure locations outside the repository and outside the database backup directory, SHALL state that losing it makes every encrypted value unrecoverable and that key rotation is not supported by the `enc:v1:` format, and SHALL describe a restore test of a database backup together with the key.

### Requirement 8: One-Time Password Migration

**User Story:** As an operator, I want a safe script to encrypt existing passwords, so that I can adopt encryption without manual edits.

#### Acceptance Criteria

1. WHEN the Migration_Script runs with the `--confirm-backup` flag and without `--dry-run`, THE Migration_Script SHALL encrypt every plaintext Managed_Password in each MySQL table that stores Managed_Passwords and in every record of `database.json` that stores a Managed_Password, and SHALL persist each encrypted value so that the stored value carries the ciphertext version prefix.
2. WHEN the Migration_Script runs with the `--dry-run` flag, THE Migration_Script SHALL print the number of rows it would change for each table and for `database.json`, SHALL NOT modify any MySQL row, SHALL NOT modify `database.json`, SHALL NOT create a backup file, and SHALL exit with status 0 if no row failed evaluation.
3. WHEN the Migration_Script runs without `--dry-run`, THE Migration_Script SHALL create a backup copy of `database.json` whose file name includes a timestamp (date and time to the second) before modifying `database.json`.
4. IF the Migration_Script cannot create or verify the `database.json` backup copy (the copy is missing or its size differs from the original), THEN THE Migration_Script SHALL NOT modify `database.json` or any MySQL row, SHALL print an error indicating the backup failure, and SHALL exit with a non-zero status.
5. WHEN the Migration_Script encounters a Managed_Password value that already carries the ciphertext version prefix, THE Migration_Script SHALL leave that value unchanged and count it as skipped, so that a second run produces stored data identical to the data after the first run and reports 0 rows migrated.
6. IF the Migration_Script fails to encrypt or write a row, THEN THE Migration_Script SHALL log the table name and row id without including the password value (plaintext or ciphertext), leave that row's stored value unchanged, continue processing the remaining rows, count the row as failed, and exit with a non-zero status after processing all rows.
7. WHEN the Migration_Script finishes, THE Migration_Script SHALL print the counts of rows migrated, skipped, and failed for each MySQL table and for `database.json`.
8. IF the Migration_Script is run without `--dry-run` and without the `--confirm-backup` flag, THEN THE Migration_Script SHALL NOT read or modify any MySQL row or `database.json`, SHALL print a message stating that a database backup must be confirmed with `--confirm-backup`, and SHALL exit with a non-zero status.
9. IF the Migration_Script cannot connect to MySQL or cannot read `database.json`, THEN THE Migration_Script SHALL make no modifications, print an error identifying which data source is unavailable, and exit with a non-zero status within 30 seconds.

### Requirement 9: Purge Provision Job Passwords

**User Story:** As a security-conscious operator, I want job passwords removed once the job finishes, so that credentials do not linger in the queue.

#### Acceptance Criteria

1. WHEN an Agent reports a Provision_Job result with status completed or failed, THE Portal_Backend SHALL set `vps_provision_jobs.password` to an empty value for that job within the same operation that records the status, such that no read after the result is acknowledged returns a non-empty password.
2. WHEN a Provision_Job is cancelled or expires, THE Portal_Backend SHALL set its password to an empty value within 5 seconds of the status change.
3. WHEN the Portal_Backend clears a Provision_Job password, THE Portal_Backend SHALL set the password of the same job in the Memory_Store copy to an empty value in the same operation.
4. WHEN the Portal_Backend starts, THE Portal_Backend SHALL set the password to an empty value for every Provision_Job in a terminal state (completed, failed, cancelled, or expired) before it begins accepting requests.
5. WHEN the Portal_Backend returns a Provision_Job result to the Portal_Frontend, THE Portal_Backend SHALL omit the password field from the response for every job status.
6. IF clearing a Provision_Job password fails, THEN THE Portal_Backend SHALL retain the terminal job status, return an error indication to the caller, and retry the clearing up to 3 times at 5-second intervals.
7. WHEN the Portal_Backend clears a password for a Provision_Job that is already empty, THE Portal_Backend SHALL complete without error and leave the job's other fields unchanged.

### Requirement 10: MySQL Tables for Requests, Renewals, Migrations, Deleted Servers

**User Story:** As a platform operator, I want requests, renewals, migrations, and deleted servers stored in MySQL, so that they survive restarts and can be backed up.

#### Acceptance Criteria

1. THE `schema.sql` file SHALL define one Entity_Table each for requests, renewals, migrations, and deleted servers using `CREATE TABLE IF NOT EXISTS`, such that executing `schema.sql` twice in succession completes with zero errors and leaves row counts unchanged.
2. WHEN `initMySQLDatabase` runs, THE Portal_Backend SHALL create each missing Entity_Table and SHALL NOT drop, truncate, or delete rows or columns from any existing table.
3. IF creating an Entity_Table fails during `initMySQLDatabase`, THEN THE Portal_Backend SHALL log an error identifying the failed table, SHALL leave all existing tables and rows unchanged, and SHALL report startup failure instead of serving requests that depend on the missing table.
4. WHEN the Portal_Backend handles a read or write on the requests, renewals, migrations, or deleted servers routes, THE Portal_Backend SHALL read from and write to the Entity_Tables and SHALL NOT read from or write to Memory_Store or `database.json` for these entities.
5. THE Portal_Backend SHALL return from these routes the same JSON field names, value types, and response structure as before the change, such that an existing client test suite passes without modification.
6. WHEN the Portal_Backend starts and an Entity_Table contains 0 rows, THE Portal_Backend SHALL import into that table all matching records from Memory_Store and `database.json` in a single transaction, de-duplicating records that share the same record identifier.
7. WHEN the Portal_Backend starts and an Entity_Table contains 1 or more rows, THE Portal_Backend SHALL skip the import for that table and leave its rows unchanged.
8. WHEN the import completes, THE Portal_Backend SHALL ensure the row count of each Entity_Table equals the count of unique source records for that entity, and running the import again SHALL add 0 rows and modify 0 existing rows.
9. IF the import fails for an Entity_Table, THEN THE Portal_Backend SHALL roll back that table's import so it contains 0 rows from the failed attempt, log an error identifying the table, and retry the import on the next startup.
10. WHEN a migration record is stored, THE Portal_Backend SHALL persist the migration password only in encrypted form, using the same encryption approach defined in Requirement 7, and SHALL NOT store, return in logs, or expose the plaintext password in any Entity_Table column.
11. THE Portal_Backend SHALL leave the content of `database.json` byte-for-byte unchanged by the import and SHALL NOT delete, rename, or modify the file.
12. WHEN a server is deleted, THE Portal_Backend SHALL insert its record into the deleted-servers table and remove it from the active servers table within a single transaction.
13. IF inserting into the deleted-servers table fails during a server deletion, THEN THE Portal_Backend SHALL roll back the transaction, retain the server in the active servers table, and return an error response indicating the deletion failed.

### Requirement 11: Fail Loudly When MySQL Is Unavailable in Production

**User Story:** As a platform operator, I want the portal to stop instead of silently using a JSON file when MySQL is down, so that data is never split across two stores.

#### Acceptance Criteria

1. IF MySQL is unreachable at startup while Production_Mode is active AND `ALLOW_JSON_FALLBACK` is not set to `1`, THEN THE Portal_Backend SHALL write an error log entry stating that MySQL is unreachable, SHALL NOT create or modify `database.json`, and SHALL exit with a non-zero status within 30 seconds of process start.
2. IF a MySQL query fails at runtime while Production_Mode is active AND `ALLOW_JSON_FALLBACK` is not set to `1`, THEN THE Portal_Backend SHALL respond to the originating request with HTTP 503 and a response body indicating that the database is unavailable, SHALL NOT read from or write to `database.json`, and SHALL continue running and accept subsequent requests.
3. WHILE Production_Mode is not active, THE Portal_Backend SHALL retain the existing `database.json` fallback behavior when MySQL is unreachable or a MySQL query fails.
4. WHEN the Portal_Backend completes startup, THE Portal_Backend SHALL write exactly one log line stating the active storage mode, with the value `MySQL` or `JSON fallback`.
5. WHERE `ALLOW_JSON_FALLBACK=1` is set, THE Portal_Backend SHALL permit the `database.json` fallback in Production_Mode when MySQL is unreachable or a query fails, and SHALL write a warning log line at startup stating that JSON fallback is enabled in Production_Mode.
6. IF `ALLOW_JSON_FALLBACK` is set to any value other than `1` while Production_Mode is active, THEN THE Portal_Backend SHALL treat the fallback as disabled and SHALL write a warning log line at startup stating that the value was ignored.

### Requirement 12: Network Binding

**User Story:** As a platform operator, I want the backend bound to loopback by default, so that only the reverse proxy can reach it.

#### Acceptance Criteria

1. WHEN the Portal_Backend starts and the `HOST` environment variable is set to a non-empty value, THE Portal_Backend SHALL bind its listening socket to the address given in `HOST`.
2. IF the `HOST` environment variable is unset or is an empty string, THEN THE Portal_Backend SHALL bind its listening socket to `127.0.0.1`.
3. WHEN the Portal_Backend has successfully bound its listening socket, THE Portal_Backend SHALL write one startup log line containing the actual bound address and port as reported by the listening socket, within 5 seconds of process start.
4. THE Portal_Backend SHALL NOT emit the hardcoded text "Bound to 0.0.0.0" in any startup log output.
5. IF the Portal_Backend cannot bind to the configured address and port (for example, the address is invalid or the port is in use), THEN THE Portal_Backend SHALL write an error log line identifying the attempted address and port, and SHALL exit with a non-zero exit code within 5 seconds without accepting any connections.
6. WHEN the Portal_Backend connects to MySQL successfully, THE Portal_Backend SHALL write the database name actually configured (the value of `DB_NAME`, as used for the connection) in the connection log line, SHALL NOT print a hardcoded database name, and SHALL NOT print the database user, password, or any other credential.

### Requirement 13: Configurable Hostname

**User Story:** As a platform operator, I want the portal hostname in configuration, so that I can deploy to another domain without editing code.

#### Acceptance Criteria

1. WHEN the Portal_Backend starts, THE Portal_Backend SHALL read Portal_Base_URL from the `PORTAL_BASE_URL` environment variable, and SHALL strip any trailing "/" characters from the value.
2. IF `PORTAL_BASE_URL` is set to a value that is not an absolute `http` or `https` URL, THEN THE Portal_Backend SHALL refuse to start with a non-zero exit code and SHALL log a message naming `PORTAL_BASE_URL` as invalid.
3. WHEN the Portal_Backend builds the migration `uploadUrl` and `downloadUrl`, the telemetry URL, or an installer portal URL, THE Portal_Backend SHALL use Portal_Base_URL as the URL prefix.
4. WHEN the Portal_Backend checks the `Origin` header of a request for CORS, THE Portal_Backend SHALL allow the origin only if it exactly matches the origin of Portal_Base_URL or an entry in the comma-separated `CORS_ALLOWED_ORIGINS` list (entries trimmed of whitespace, empty entries ignored). The hardcoded `innovationwebworks.in` suffix check SHALL be removed.
5. THE Portal_Backend SHALL ignore the `x-forwarded-host` and `Host` request headers when building installer and migration URLs.
6. IF Production_Mode is active and `PORTAL_BASE_URL` is unset or empty, THEN THE Portal_Backend SHALL refuse to start with a non-zero exit code and SHALL log a message naming `PORTAL_BASE_URL` as missing.
7. WHERE Production_Mode is not active and `PORTAL_BASE_URL` is unset or empty, THE Portal_Backend SHALL default Portal_Base_URL to `http://127.0.0.1:<PORT>`, where `<PORT>` is the port the Portal_Backend listens on.
8. THE `.env.example` file SHALL document `PORTAL_BASE_URL`, `HOST`, and `CORS_ALLOWED_ORIGINS`, each with a description and an example value.

### Requirement 14: Development Scripts

**User Story:** As a developer, I want one command to run the backend and the Vite dev server, so that I can develop without opening two terminals.

#### Acceptance Criteria

1. WHEN a developer runs `npm run dev:all` from the project root, THE package scripts SHALL start both `node server.js` and `vite` concurrently within the same terminal session.
2. WHILE both processes are running under `dev:all`, THE package scripts SHALL display the output of each process in the same terminal, with each output line prefixed by a label identifying its source process (backend or vite).
3. IF either process started by `dev:all` exits with a non-zero exit code, THEN THE `dev:all` script SHALL terminate the other process within 5 seconds and exit with a non-zero exit code.
4. WHEN a developer sends an interrupt signal (Ctrl+C) to `dev:all`, THE `dev:all` script SHALL terminate both processes within 5 seconds.
5. THE `package.json` file SHALL pin the exact version (no `^`, `~`, or range operators) of every tool added to support `dev:all`.

### Requirement 15: Dependency Security

**User Story:** As a security-conscious operator, I want no known high or critical vulnerabilities in dependencies, so that the portal is not exposed through third-party packages.

#### Acceptance Criteria

1. THE `package.json` file SHALL reference a spreadsheet library version that has zero known vulnerabilities of any severity reported by `npm audit`, replacing `xlsx@^0.18.5`.
2. WHEN the spreadsheet library is upgraded, THE Portal_Backend and Portal_Frontend SHALL read and write the same file formats as before the upgrade, and SHALL produce import and export results identical in row count, column headers, and cell values to those produced before the upgrade, when tested against the same sample files.
3. IF a spreadsheet file import or export fails after the upgrade, THEN THE Portal_Backend or Portal_Frontend SHALL display an error message indicating the failure, and SHALL leave existing stored data unchanged.
4. WHEN the dependency upgrade is complete, THE project SHALL run `npm audit` and record in the Change_Report the date of the run, the count of vulnerabilities at each severity level (low, moderate, high, critical), and the name and installed version of each package with a reported vulnerability.
5. IF `npm audit` reports a high or critical vulnerability that has no available fix, THEN THE Change_Report SHALL list the package name, the advisory identifier, the affected version range, and a recommended mitigation.
6. IF a fix requires a major version upgrade of a package other than the spreadsheet library, THEN THE implementer SHALL ask the user for approval before applying it, and SHALL NOT apply the upgrade until the user approves.

### Requirement 16: Translation Feature Resilience

**User Story:** As a user, I want the portal to keep working when translation is unavailable, so that a third-party outage does not break pages.

#### Acceptance Criteria

1. WHERE the `TRANSLATE_ENABLED` environment variable equals the string `1` and `TRANSLATE_API_KEY` is a non-empty string, THE Portal_Backend SHALL enable the translation feature and forward translation requests to the official Google Cloud Translation API.
2. IF `TRANSLATE_ENABLED` is unset or has any value other than `1`, THEN THE Portal_Backend SHALL respond to translate route requests with the original untranslated text unchanged, HTTP 200, and a flag indicating translation is disabled, without calling any external translation provider.
3. IF `TRANSLATE_ENABLED` equals `1` and `TRANSLATE_API_KEY` is unset or empty, THEN THE Portal_Backend SHALL treat translation as disabled and respond as defined in criterion 2.
4. THE Portal_Backend SHALL NOT send translation requests to the unofficial Google translate endpoint.
5. IF the translation provider does not respond within 5 seconds, or returns an error response or a response that contains no translated text, THEN THE Portal_Backend SHALL respond with the original text unchanged, HTTP 200, and a flag indicating translation failed, and SHALL write one log entry that records the failure reason and excludes the value of `TRANSLATE_API_KEY`.
6. IF the translate route response indicates translation is disabled or failed, THEN THE Portal_Frontend SHALL render the original text in place of the translation, SHALL NOT display an error dialog, and SHALL keep the page interactive.
7. IF the translate route request itself fails (network error, or HTTP status other than 200), THEN THE Portal_Frontend SHALL render the original text, SHALL NOT display an error dialog, and SHALL keep the page interactive.
8. WHEN the translate route receives an empty text value or text longer than 5000 characters, THE Portal_Backend SHALL respond with the original text unchanged, HTTP 200, and a flag indicating translation was skipped, without calling the translation provider.

### Requirement 17: Rate Limit Correctness

**User Story:** As a platform operator, I want rate limiting to work on every route that uses it, so that abuse of password reset cannot bypass limits.

#### Acceptance Criteria

1. WHEN a request reaches a route that calls `checkRateLimit`, THE Portal_Backend SHALL `await` the result of `checkRateLimit` before evaluating whether the limit is exceeded, including in the forgot-password route.
2. IF `checkRateLimit` reports the limit is exceeded, THEN THE Portal_Backend SHALL respond with HTTP 429, include an indication of how many seconds remain until the client may retry, and not perform the protected action (for forgot-password: no reset token is created and no reset message is sent).
3. IF `checkRateLimit` throws an error or rejects while Production_Mode is active, THEN THE Portal_Backend SHALL respond with HTTP 429, log the error once per failed request, and not perform the protected action.
4. IF `checkRateLimit` throws an error or rejects while Production_Mode is not active, THEN THE Portal_Backend SHALL log the error once per failed request and allow the request to proceed.
5. WHEN a client makes more forgot-password requests than the configured limit within the configured window, THE Portal_Backend SHALL respond with HTTP 429 to every request beyond the limit until the window expires.

### Requirement 18: Automated Test Setup

**User Story:** As a developer, I want a working test framework, so that I can verify changes and prevent regressions.

#### Acceptance Criteria

1. THE project SHALL declare exactly one test runner (Vitest or Jest) and Supertest as devDependencies in `package.json`, each pinned to an exact version with no range operators (`^`, `~`, `>`, `*`).
2. WHEN a developer runs `npm test`, THE Test_Suite SHALL execute all tests exactly once, in non-watch mode, and exit with code 0 if all tests pass or a non-zero code if any test fails.
3. WHEN a test file imports `server.js` with `TEST_MODE=1` set, THE Test_Suite SHALL obtain the Express `app` object from the existing export without binding a network port and without starting background timers or scheduled jobs that keep the process alive after tests complete.
4. THE Test_Suite SHALL replace the MySQL database layer with an in-memory fake or mock so that all tests pass with no MySQL server running and with no MySQL network connection attempted.
5. THE Test_Suite SHALL block all outbound network requests to any Agent or external service by mocking them, and IF a test attempts an unmocked outbound request, THEN THE Test_Suite SHALL fail that test with an error identifying the attempted destination.
6. THE Test_Suite SHALL set the test Encryption_Key and all test secrets through environment variables defined in the test setup, and SHALL NOT read, load, or modify the real `.env` file during a run.
7. WHEN a test run completes, whether tests pass or fail, THE Test_Suite SHALL leave `database.json` byte-for-byte identical to its content before the run.
8. WHEN `npm test` completes on a clean checkout with dependencies installed, THE Test_Suite SHALL finish within 60 seconds.

### Requirement 19: Test Coverage of Critical Behavior

**User Story:** As a developer, I want tests for the security-critical paths, so that hardening changes are verified.

#### Acceptance Criteria

1. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that a login with valid credentials succeeds, a login with an invalid password is rejected, a 2FA verification with a valid code succeeds, and a 2FA verification with an invalid code is rejected without issuing an authenticated session.
2. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting, for at least one representative route per privilege level (SUPER_ADMIN-only, EMPLOYEE-or-higher, SALESPERSON-or-higher), that each of the SUPER_ADMIN, EMPLOYEE, and SALESPERSON roles receives HTTP 200 where permitted and HTTP 403 where denied.
3. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that Agent authentication accepts a valid key, rejects an invalid key, rejects a missing key in `enforce` mode, and accepts a missing key while recording a warning in `warn` mode.
4. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that Forwarded_IP_Headers sent from a source that is not a Trusted_Proxy are ignored (the connection's own address is used) and that Forwarded_IP_Headers sent from a Trusted_Proxy are honored.
5. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that a Provision_Job can be created, that an authenticated Agent can retrieve it, that the Agent can report a result, and that the stored password is purged after the job completes.
6. WHEN the Test_Suite is executed, THE Test_Suite SHALL include property-based tests, each running at least 100 generated cases, asserting that Secret_Cipher decrypts every encrypted value to the original plaintext, that encrypting the same plaintext repeatedly never produces the same nonce twice, and that modifying any single byte of the ciphertext causes decryption to fail.
7. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that each Entity_Tables route supports create, read, update, and delete, and that importing the same dataset twice yields the same stored record count as importing it once.
8. WHEN the Test_Suite is executed, THE Test_Suite SHALL include an automated test asserting that running the Migration_Script twice on the same database produces identical data after the second run and reports no error.
9. WHEN the Test_Suite is executed, THE Test_Suite SHALL include automated tests asserting that a SUPER_ADMIN viewing a Managed_Password causes exactly one new Audit_Log entry to be written, and that a non-SUPER_ADMIN user receives HTTP 403 and no Managed_Password value is returned.
10. IF any automated test in the Test_Suite fails, THEN THE Test_Suite SHALL exit with a non-zero status and report the name of each failing test.

### Requirement 20: Database Backup

**User Story:** As a platform operator, I want a scripted MySQL backup, so that I can recover from data loss.

#### Acceptance Criteria

1. WHEN the Backup_Script is run, THE Backup_Script SHALL create a gzip-compressed `mysqldump` of the configured database in the backup directory, with a file name containing the database name and the creation date and time to the second in the format `YYYYMMDD_HHMMSS`.
2. WHEN the Backup_Script starts, THE Backup_Script SHALL read the database host, port, user, password and database name from environment variables, and SHALL use values from the `.env` file for any variable not set in the environment.
3. WHILE the Backup_Script is running `mysqldump`, THE Backup_Script SHALL keep the database password out of the command-line arguments of the `mysqldump` process, so that the password is not visible to other users in the process list.
4. IF any required database setting (host, user, password or database name) is missing from both the environment and the `.env` file, THEN THE Backup_Script SHALL create no backup file, log an error naming the missing setting, and exit with a non-zero status.
5. WHEN a backup file has been created successfully, THE Backup_Script SHALL delete backup files in the backup directory that match the Backup_Script's naming pattern and are older than `BACKUP_RETENTION_DAYS` days, and SHALL NOT delete the backup file just created.
6. IF `BACKUP_RETENTION_DAYS` is unset, THEN THE Backup_Script SHALL use a retention period of 14 days.
7. IF `BACKUP_RETENTION_DAYS` is set to a value that is not a whole number from 1 to 3650, THEN THE Backup_Script SHALL delete no backup files, log an error indicating the invalid value, and exit with a non-zero status.
8. IF the `mysqldump` command fails, THEN THE Backup_Script SHALL remove the incomplete backup file, delete no older backups, write an error to the log that includes the `mysqldump` exit status, and exit with a non-zero status.
9. WHEN a backup completes successfully, THE Backup_Script SHALL log the backup file name and size in bytes and exit with status 0.
10. THE repository SHALL include a cron example that runs the Backup_Script once per day at a stated time and redirects the script's output to a log file.

### Requirement 21: Process Management and Logging

**User Story:** As a platform operator, I want PM2 to run the backend with log rotation, so that the service restarts on failure and logs do not fill the disk.

#### Acceptance Criteria

1. THE repository SHALL include an `ecosystem.config.cjs` file that defines exactly one PM2 application for the Portal_Backend process, with the environment variable `NODE_ENV` set to `production`.
2. WHEN the Portal_Backend process exits with a non-zero exit code or crashes, THE PM2 process manager SHALL restart the process automatically within 5 seconds, using the `autorestart` setting enabled in `ecosystem.config.cjs`.
3. THE `ecosystem.config.cjs` file SHALL set a maximum memory restart limit of 512 MB for the Portal_Backend process.
4. IF the Portal_Backend process exceeds the configured maximum memory restart limit, THEN THE PM2 process manager SHALL restart the process and the process SHALL return to a running state within 30 seconds.
5. IF the Portal_Backend process restarts more than 10 times within 60 seconds, THEN THE PM2 process manager SHALL stop restarting it and set its status to `errored`, so that a crash loop does not consume system resources.
6. THE `ecosystem.config.cjs` file or the Runbook SHALL configure log rotation with `pm2-logrotate`, with a maximum log file size of 10 MB and a retained file count of 14.
7. THE `ecosystem.config.cjs` file SHALL configure the PM2 error log and output log as two separate files, and SHALL enable timestamps in the format `YYYY-MM-DD HH:mm:ss Z` on every log line.

### Requirement 22: Health Endpoint

**User Story:** As a platform operator, I want a health endpoint, so that monitors and the proxy can detect failures.

#### Acceptance Criteria

1. WHEN a client sends `GET /health` with no credentials, session, or authorization header, THE Portal_Backend SHALL process the request and return a response of HTTP 200 or HTTP 503 and SHALL NOT return an authentication error.
2. WHEN a client sends `GET /health` and MySQL completes a lightweight query within 2000 milliseconds, THE Portal_Backend SHALL respond with HTTP 200 and a JSON body containing `status` set to `ok` and `db` set to `up`.
3. IF the MySQL lightweight query returns an error, THEN THE Portal_Backend SHALL respond with HTTP 503 and a JSON body containing `status` set to `degraded` and `db` set to `down`.
4. IF the MySQL lightweight query does not complete within 2000 milliseconds, THEN THE Portal_Backend SHALL respond with HTTP 503 and a JSON body containing `status` set to `degraded` and `db` set to `down` within 2500 milliseconds of receiving the request.
5. THE Portal_Backend SHALL limit the `/health` JSON body to the `status` and `db` fields, and SHALL exclude secrets, hostnames, database error messages, and version details of internal components from the response.

### Requirement 23: Operations Runbook

**User Story:** As an on-call operator, I want a runbook, so that I can perform common operations without reading the source.

#### Acceptance Criteria

1. THE repository SHALL include a UTF-8 encoded Markdown file named `RUNBOOK.md` at the project root, with one top-level section for each procedure listed in criteria 2 through 8.
2. THE Runbook SHALL describe the deployment procedure as an ordered, numbered list of steps that covers, in this order: setting each required environment variable (listing every variable name defined in `.env.example`), applying the database schema migration, and starting the application under PM2, followed by a verification step that states the expected observable result confirming the application is running.
3. THE Runbook SHALL describe the rollback procedure as an ordered, numbered list of steps that covers: stopping or reverting the PM2 process, restoring the previous build artifacts, and restoring the database state from the most recent Backup_Script backup taken before the deployment, followed by a verification step that states the expected observable result confirming the rollback succeeded.
4. THE Runbook SHALL describe adding a new VPS node as an ordered, numbered list of steps that covers: generating the node's Agent_Key, installing the Agent on the node, and confirming the node reports to the system, with the expected observable result for each step.
5. THE Runbook SHALL describe rotating Agent_Keys as an ordered, numbered list of steps that states, for each step, which side (server or Agent) is updated, and SHALL explain the `graceMinutes` option of Requirement 2: with `graceMinutes` greater than 0 the server accepts both the previous and the new Agent_Key until the window ends or the next rotation, so no Agent is rejected while the Agents are updated (including delivery of the new key by `SET_AGENT_KEY`), and with `graceMinutes` 0 the previous key is rejected immediately, which the Runbook SHALL mark as the choice for a leaked key.
6. THE Runbook SHALL describe switching Agent_Auth_Mode from `warn` to `enforce` as an ordered, numbered list of steps that includes a precondition check that every Agent is sending a valid Agent_Key, the configuration change, the application restart or reload needed to apply it, a verification step, and the steps to revert to `warn` if any Agent is rejected after the switch.
7. THE Runbook SHALL describe restoring a MySQL backup produced by the Backup_Script as an ordered, numbered list of steps that covers: identifying the backup file, stopping or pausing writes to the application, restoring the backup into MySQL, restarting the application, and verifying the restore by stating the expected observable result.
8. THE Runbook SHALL describe running the Migration_Script with the `--dry-run` flag before running it without the flag, including the command for each run, the expected output of the dry run, and the condition under which the operator must stop and not run the real migration.
9. IF a procedure step in the Runbook can fail, THEN THE Runbook SHALL state, for that step, the symptom the operator will observe and the action to take, including whether to continue, retry, or roll back.

### Requirement 24: Safe, Reviewable Delivery

**User Story:** As the project owner, I want small, reviewable changes that do not break the app, so that I can approve each step with confidence.

#### Acceptance Criteria

1. THE Implementation SHALL deliver work in this phase order: agent authentication, secrets and passwords, data storage, infrastructure fixes, tests, operations.
2. WHEN a phase starts, THE Implementation SHALL divide the phase into tasks that each change no more than 5 files, excluding generated files and lock files.
3. WHEN a task completes, THE Implementer SHALL provide a Change_Report that lists every file changed in the task, with the path and the type of change (added, modified, or deleted) for each file, and at least one manual or automated verification step with its expected result.
4. WHILE a task is in progress, THE Implementation SHALL keep the field names, field types, and top-level structure of every API response consumed by the Portal_Frontend identical to the state before the task started, unless the Portal_Frontend is updated in the same task.
5. THE Implementation SHALL leave unmodified every file and code block whose change is not required by Requirements 1 to 23.
6. IF a task would drop a database column, delete database rows, or delete files, THEN THE Implementer SHALL list the affected columns, row sets, or files, state whether the change is reversible, and wait for explicit user approval before making the change.
7. IF the user does not approve a destructive change, THEN THE Implementer SHALL leave the affected columns, rows, and files unchanged and mark the task as blocked in the Change_Report.
8. WHEN all phases are complete, THE Implementer SHALL provide a written plan, without changing any file or executing any step, that proposes how to split `server.js` into modules, listing each proposed module and the responsibilities moved into it.

### Requirement 25: HTTPS-Only Portal Base URL in Production

**User Story:** As a platform operator, I want the portal base URL to be https in production, so that installers, agent binaries, and Agent_Keys are never fetched or delivered over plain http.

#### Acceptance Criteria

1. IF Production_Mode is active and `PORTAL_BASE_URL` uses the `http` scheme, THEN THE Portal_Backend SHALL refuse to start with a non-zero exit code and SHALL log a message naming `PORTAL_BASE_URL` as invalid because it is not https.
2. WHERE Production_Mode is active and `PORTAL_BASE_URL` uses the `https` scheme, THE Portal_Backend SHALL accept it and strip trailing "/" characters as defined in Requirement 13.1.
3. WHERE Production_Mode is not active, THE Portal_Backend SHALL accept both `http` and `https` values of `PORTAL_BASE_URL`.
4. THE `.env.example` file SHALL document the https-only rule for production and the reason: agents download the installer and the agent binary and receive Agent_Keys through URLs built from this value.

### Requirement 26: Agent Key Delivery, Readiness, and serverToken Retirement

**User Story:** As a platform operator, I want to deliver Agent_Keys to already-installed agents and know when it is safe to enforce, so that I can switch to `enforce` without losing any node.

#### Acceptance Criteria

1. THE Portal_Backend SHALL NOT use `serverToken`, `X-Server-Token`, or `X-Server-Id` as authentication; a request that carries only those values and no valid `X-Agent-Key` SHALL be rejected with the fixed HTTP 401 response while Agent_Auth_Mode is `enforce`, and `X-Server-Id` SHALL be used only as an identification hint.
2. THE installer generated by the Portal_Backend SHALL NOT write a `serverToken` value into `agent-config.json`.
3. WHILE Agent_Auth_Mode is `warn`, WHEN a SUPER_ADMIN requests Agent_Key delivery for one server or for all servers, THE Portal_Backend SHALL generate a new Agent_Key per server, store only its hash, and queue one `SET_AGENT_KEY` Provision_Job that carries the plaintext Agent_Key.
4. IF Agent_Auth_Mode is `enforce`, THEN THE Portal_Backend SHALL respond to a delivery request with HTTP 409 and queue nothing; IF the requester is not SUPER_ADMIN, THEN THE Portal_Backend SHALL respond with HTTP 403 and queue nothing.
5. IF a server has no reported `agentVersion` or a version below the minimum that supports `SET_AGENT_KEY`, THEN THE Portal_Backend SHALL queue only an `UPDATE_AGENT` job for it and report it as `needs_update`.
6. IF Production_Mode is active and `PORTAL_BASE_URL` is not https, THEN THE Portal_Backend SHALL respond to a delivery request with HTTP 409 and queue nothing.
7. THE Portal_Backend SHALL hand a job that carries an Agent_Key only to a request whose derived client IP equals the registered IP of the target server and, in Production_Mode, only over a secure connection; otherwise the job SHALL remain pending and SHALL NOT be returned.
8. THE Portal_Backend SHALL NOT write a plaintext Agent_Key to `vps_provision_jobs`, and SHALL remove it from the in-memory job and any disk copy when the job completes, fails, or expires.
9. WHEN the Agent executes `SET_AGENT_KEY` with a key that matches the Agent_Key format, THE Agent SHALL replace the key in `agent-config.json` atomically with only the SYSTEM and Administrators accounts having access and report `COMPLETED` without including the key; IF the key is malformed, THEN THE Agent SHALL leave the configuration unchanged, keep the old key, and report `FAILED`.
10. THE Portal_Backend SHALL write one Audit_Log entry per queued delivery containing the acting user and serverId and SHALL NOT include the Agent_Key or its hash; the delivery response SHALL list server identifiers and reasons only.
11. WHEN an admin requests the agent key status, THE Portal_Backend SHALL return per server the `serverId`, `hasHash`, `lastRequestValid`, `lastValidAt`, and `agentVersion`, and a top-level `readyForEnforce` value that is true only if every non-deleted server has a hash and a valid-key request made with its current key (not a previous key still inside a grace window, Requirement 2.11) within the last 10 minutes (true when there are no servers).
12. THE Portal_Frontend SHALL provide a SUPER_ADMIN-only rollout panel that shows the per-server status and the `readyForEnforce` value, offers bulk and per-server delivery, and never shows an Agent_Key or hash.
13. THE repository SHALL include `docs/AGENT_KEY_ROLLOUT.md` describing the rollout order, the per-agent verification, the rule not to set `AGENT_AUTH_MODE=enforce` until `readyForEnforce` is true, and the rollback to `warn`.
14. WHEN a delivery replaces an existing Agent_Key_Hash, THE Portal_Backend SHALL keep the replaced hash as the previous Agent_Key for a grace window of `graceMinutes` (integer 0 to 1440, default 60 for delivery, Requirement 2.10), so that an Agent that still authenticates with the old key can poll for the `SET_AGENT_KEY` job instead of being rejected as a key mismatch (Requirement 4.4).

### Requirement 27: Agent Job Parameter Sanitization

**User Story:** As a security-conscious operator, I want job parameters validated before they are queued and never interpolated into commands, so that a crafted value cannot run code on a VPS node.

#### Acceptance Criteria

1. WHEN a Provision_Job is queued, THE Portal_Backend SHALL validate its parameters before anything is stored, and IF validation fails, THEN THE Portal_Backend SHALL queue nothing, insert nothing into MySQL, and raise a `JobParamError` whose message does not echo the input.
2. THE Portal_Backend SHALL accept only values that match the per-field rules: usernames limited to letters, digits, `_ . - $` and space with a length of 1 to 40 and no leading `-`; drive values of one letter with an optional colon; session identifiers of digits only; company names and labels limited to letters, digits, space and `. _ - & , ( )` with a length of at most 100; migration identifiers limited to letters, digits, `_` and `-`; URLs starting with `PORTAL_BASE_URL`; hash values of 64 lowercase hex characters; numeric fields coerced to finite non-negative numbers; Agent_Keys matching the key format.
3. THE Portal_Backend SHALL reject a password parameter that contains NUL, CR, or LF or whose length is outside 4 to 128 characters, and SHALL otherwise permit shell-significant characters in it.
4. IF a route that feeds the job queue receives invalid parameters, THEN THE Portal_Backend SHALL respond with HTTP 400 and a generic body that contains no field name or input value, including for `POST /api/users`, `POST /api/users/:id/provision-vps`, and the `os-users/:username/change-password` route.
5. IF a `JobParamError` or other error is raised inside an asynchronous job-queue route handler, THEN THE Portal_Backend SHALL forward it to the error path so that the process records no unhandled promise rejection.
6. THE Agent scripts and the Agent service SHALL pass job values to child processes and PowerShell commands as data (argument arrays, secure strings, encoded commands) and SHALL NOT build command strings by interpolating job values; the Agent service SHALL re-validate usernames and drive roots before use.

### Requirement 28: TOTP Secret Protection

**User Story:** As a security-conscious operator, I want TOTP secrets encrypted and backup codes hashed, so that a database leak does not yield valid second factors.

#### Acceptance Criteria

1. WHEN the Portal_Backend writes `portal_users.two_factor_secret` or `portal_users.two_factor_temp_secret`, THE Portal_Backend SHALL store the Secret_Cipher ciphertext and SHALL NOT store the plaintext secret, in MySQL, Memory_Store, and `database.json`.
2. WHERE a stored TOTP secret lacks the ciphertext version prefix, THE Portal_Backend SHALL treat it as legacy plaintext, accept it for verification, and write it back as ciphertext the next time that record is written.
3. WHEN the Portal_Backend generates TOTP backup codes, THE Portal_Backend SHALL store each code as a bcrypt hash, SHALL return the plaintext codes to the user only in the setup response, and SHALL accept each code at most once by removing it from the stored list when used; legacy plaintext codes SHALL be accepted once and then removed.
4. WHEN the schema migration runs, THE Portal_Backend SHALL widen `two_factor_secret` and `two_factor_temp_secret` to hold at least 512 characters, preserve existing values, and be safe to run repeatedly.
5. THE Portal_Backend SHALL NOT include `two_factor_secret`, `two_factor_temp_secret`, or `two_factor_backup_codes` in any API response.
6. IF decryption of a stored TOTP secret fails during login validation, THEN THE Portal_Backend SHALL respond with the same generic HTTP 401 as for a wrong code and log only the user identifier.
7. THE Migration_Script SHALL also seal the TOTP secret columns in MySQL and the matching fields in `database.json`, with separate dry-run counts per source and field, and SHALL merge records that appear in both sources so that a value migrated from one source is not overwritten by the other.

### Requirement 29: No Disk Persistence in Production, Configurable Database File Path

**User Story:** As a platform operator, I want `database.json` untouched in production, so that passwords, 2FA data, and sessions are not duplicated in a plaintext file.

#### Acceptance Criteria

1. WHILE Production_Mode is active and `ALLOW_JSON_FALLBACK` is not `1`, THE Portal_Backend SHALL NOT write the disk database file, SHALL NOT read it when loading the Memory_Store, and SHALL log once that disk persistence is disabled.
2. WHERE `ALLOW_JSON_FALLBACK=1` or Production_Mode is not active, THE Portal_Backend SHALL read and write the disk database file as before and SHALL log once that disk persistence is enabled.
3. THE Portal_Backend SHALL read the disk database file explicitly only for the one-time legacy import of Requirement 10, and that read SHALL NOT modify the file.
4. WHEN the Portal_Backend writes the disk database file, THE Portal_Backend SHALL remove Agent_Keys and job passwords from provision jobs before writing.
5. THE Portal_Backend SHALL read the `DB_FILE_PATH` environment variable once at startup and, when it is set to a non-empty value, SHALL use that path for every read, write, and temporary file of the disk database; WHEN it is unset, THE Portal_Backend SHALL use `database.json` in the project root. THE `.env.example` file SHALL document `DB_FILE_PATH`.
6. THE disk database SHALL include the `workspaceRequests` collection in its save and load, defaulting to an empty list when the key is missing from an existing file.

### Requirement 30: Public Endpoint and Agent-Failure Rate Limits

**User Story:** As a platform operator, I want public and failure-prone endpoints rate limited, so that abuse such as account enumeration and OTP guessing is blocked.

#### Acceptance Criteria

1. THE Portal_Backend SHALL apply per-IP limits to `POST /api/public/request-demo`, `POST /api/public/verify-customer`, `POST /api/public/tickets`, the password-reset OTP check and reset route, and `POST /api/auth/2fa/validate-login`, with defaults of 5 per hour, 5 per hour, 10 per hour, 5 per 15 minutes, and 20 per 15 minutes respectively.
2. THE Portal_Backend SHALL additionally limit `verify-customer` to 3 per hour per username and phone combination, OTP verification to 5 per 15 minutes per username, and `validate-login` to 5 per 15 minutes per pre-authentication token.
3. WHEN a limit is exceeded, THE Portal_Backend SHALL respond with HTTP 429 and a body containing `retryAfterSeconds`, SHALL NOT perform the protected action, and for `validate-login` SHALL discard the pre-authentication entry once the per-token limit is exceeded.
4. THE `verify-customer` route SHALL return the same generic failure for an unknown username and for a wrong phone number.
5. WHEN an Agent_Endpoint authentication fails, THE Portal_Backend SHALL count the failure per derived client IP, SHALL respond with HTTP 429 and `retryAfterSeconds` once 30 failures occur within 5 minutes, SHALL NOT count successful requests, and SHALL leave valid Agents on other addresses unaffected.
6. THE limits SHALL be configurable through `RATE_LIMIT_<NAME>_MAX` and `RATE_LIMIT_<NAME>_WINDOW_SEC` environment variables listed in `.env.example`, and IF a value is not a positive integer, THEN THE Portal_Backend SHALL refuse to start with a message naming the variable.

### Requirement 31: Memory-Only Data Persisted in MySQL

**User Story:** As a platform operator, I want data that lived only in memory stored in MySQL, so that a restart or disabled disk persistence does not lose it.

#### Acceptance Criteria

1. THE `schema.sql` file and `initMySQLDatabase` SHALL define a `workspace_requests` table with `CREATE TABLE IF NOT EXISTS`, and WHEN a demo lead is submitted, THE Portal_Backend SHALL insert it into that table, load the table at startup, and import leads from the legacy file once into an empty table.
2. THE Portal_Backend SHALL persist server runtime attributes (`agentAliases`, `lastHardware`, `hardware`, `physicalDisks`, `occupiedDrives`, `tallyVersions`, `processAlerts`, `lastOptimizedAt`, `lastKnownAllUsers`, `lastKnownDisabledUsers`, `agentVersion`) in a nullable `vps_servers.meta` column, SHALL restore them at startup, and SHALL write the hardware drift baseline immediately when it changes and other attributes at most once per 60 seconds per server.
3. THE Portal_Backend SHALL persist the client `tallyVersion` and the ticket `source` in nullable columns added with repeat-safe `ALTER TABLE ... ADD COLUMN` statements, without dropping any column or row.
4. WHEN a job result arrives for a job that is not in memory, THE Portal_Backend SHALL load the job from `vps_provision_jobs` and complete it, so that a job that was `PROCESSING` before a restart is not lost.
5. THE migration relay, rollback, and reset code SHALL update `client_subscriptions` and SHALL NOT update a non-existent `clients` table.
6. WHEN a MySQL write for an inventoried table fails, THE Portal_Backend SHALL log the table name and error code without SQL parameters instead of silently discarding the error.
7. FOR ALL server objects, restoring `vps_servers.meta` into a server SHALL reproduce each persisted runtime attribute, and invalid meta JSON SHALL leave the server unchanged without raising an error.

### Requirement 32: Session Cookie Flags

**User Story:** As a security-conscious operator, I want session cookies that clients cannot downgrade, so that a spoofed header cannot remove the `Secure` flag.

#### Acceptance Criteria

1. WHEN the Portal_Backend sets the session cookie, THE Portal_Backend SHALL set `HttpOnly`, `SameSite=Lax`, `Path=/`, a `Max-Age` equal to the session lifetime, and `Secure` when Production_Mode is active or the connection is secure as determined by the trusted proxy setting of Requirement 3.
2. THE Portal_Backend SHALL NOT derive `Secure` from the value of an `x-forwarded-proto` request header.
3. WHEN the Portal_Backend clears the session cookie on logout or beacon logout, THE Portal_Backend SHALL use the same cookie attributes as when setting it, except for `Max-Age`.

### Requirement 33: PM2 Single-Instance Rule

**User Story:** As a platform operator, I want PM2 to run exactly one fork instance, so that in-process state (sessions, OTPs, long-poll waiters, rate limits) stays correct.

#### Acceptance Criteria

1. THE `ecosystem.config.cjs` file SHALL set `instances` to 1 and `exec_mode` to `fork` for the Portal_Backend application.
2. THE `ecosystem.config.cjs` file SHALL contain a comment that lists the in-process state that prevents cluster mode or multiple instances.
3. THE Runbook SHALL state the single-instance rule.

### Requirement 34: Database-Unavailable Responses and Server Response Hygiene

**User Story:** As a platform operator, I want clear 503 responses when the database is down and no key hashes in API responses, so that failures are visible and internal values stay private.

#### Acceptance Criteria

1. WHILE Production_Mode is active and `ALLOW_JSON_FALLBACK` is not `1`, WHEN a database operation raises a database-unavailable error, THE Portal_Backend SHALL respond to `GET /api/requests`, `GET /api/renewals`, `GET /api/servers`, `GET /api/employees`, the `/api/auth/login` fallback path, and `POST /api/public/tickets` with HTTP 503 and the body `{ "error": "Database unavailable" }`, SHALL NOT return an empty list or a fallback result, and SHALL log the underlying error on the server only.
2. WHILE Production_Mode is not active, THE Portal_Backend SHALL keep the existing fallback behavior of those routes.
3. THE Portal_Backend SHALL NOT include `apiKey` (the Agent_Key_Hash) at any depth in `GET /api/servers` or any other server list or detail response, including fallback paths, and SHALL leave all other fields unchanged.

### Requirement 35: Test Harness Fidelity

**User Story:** As a developer, I want the test database fake to behave like the real driver for schema statements and to be used consistently, so that tests exercise startup code without noise or real files.

#### Acceptance Criteria

1. THE Test_Suite fake MySQL SHALL accept `ALTER TABLE ... MODIFY COLUMN` statements and answer the `information_schema` queries issued by `initMySQLDatabase`, so that running initialization against it logs no unsupported-statement errors.
2. THE Test_Suite `mysql2/promise` mock SHALL return the fake MySQL pool consistently, and any test that needs different behavior SHALL document the reason next to the mock.
3. THE Test_Suite SHALL direct the disk database to a per-run temporary file through `DB_FILE_PATH` and SHALL NOT back up, swap, or restore the real `database.json`.
4. WHEN a defect that a test pinned with `it.fails` or `it.skip` is fixed, THE Test_Suite SHALL change that test to a normal test in the same task, and no `it.fails` or `it.skip` SHALL remain except for tests that need `bash`.

### Requirement 36: No Default Password Display in the Frontend

**User Story:** As a security-conscious operator, I want the frontend to stop showing a shared default password, so that users never see or use a wrong credential.

#### Acceptance Criteria

1. THE Portal_Frontend SHALL contain no `'Pass#123'` fallback in any component under `src/`.
2. WHEN a SUPER_ADMIN needs a client password, THE Portal_Frontend SHALL obtain it on demand through the reveal route of Requirement 7.11, and SHALL NOT show or embed a password for other roles.
3. WHEN the Portal_Frontend creates a server without a supplied password, THE Portal_Frontend SHALL send an empty value instead of a shared default.

### Requirement 37: Real MySQL Integration Check

**User Story:** As a developer, I want an opt-in test against a real MariaDB/MySQL, so that schema and migration statements the in-memory fake cannot judge are verified without risking production data.

#### Acceptance Criteria

1. THE repository SHALL include an integration test that is skipped unless the `REAL_MYSQL_URL` environment variable is set, so that `npm test` neither connects to a database nor runs it by default.
2. IF the throwaway database name equals the `DB_NAME` value in `.env` or in the environment (compared case-insensitively), THEN THE integration test SHALL refuse to run before creating or changing anything and SHALL exit or fail with an error naming the conflict.
3. WHEN the integration test runs, THE integration test SHALL create a throwaway database with a unique name, load `schema.sql` into it, run `initMySQLDatabase` twice without error and without changing row counts, verify that the widened columns accept values longer than the original column sizes, run the session validation JOIN query without error, and drop only the throwaway database afterwards, including when a step fails.
4. THE Runbook SHALL document running the test against a Docker container (`docker run --rm -e MARIADB_ROOT_PASSWORD=... -p 3307:3306 mariadb:11`) and the `REAL_MYSQL_URL` value to use.
