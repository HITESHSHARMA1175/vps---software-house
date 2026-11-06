# Innovation VPS & User Management Suite

## 1. What this project is

Innovation VPS & User Management Suite is a full-stack operations portal for managing Windows VPS infrastructure and the customers who use it.

It gives administrators and staff one web console to:

- Register and monitor VPS server nodes.
- Manage Windows client users and their subscriptions.
- Assign users to servers and storage drives.
- Track subscription expiry, renewals, billing information, and customer contact details.
- Monitor server CPU, memory, disks, sessions, and agent health.
- Provision or manage Windows users through a remote agent.
- Review audit logs and staff sessions.
- Handle customer support tickets.
- Perform selected remote-assistance and migration operations.
- Provide a public customer/helpdesk portal.

The project is designed for a business that operates shared or dedicated Windows VPS servers, especially environments running Tally or similar desktop applications.

## 2. Main architecture

```text
Browser
  |
  | Development: Vite proxy (/api -> localhost:5000)
  | Production: Apache/LiteSpeed -> api_proxy.php -> localhost:5000
  v
React + Vite frontend
  |
  v
Node.js + Express backend
  |
  +--> MySQL/MariaDB (primary persistent database)
  +--> database.json (local fail-safe database)
  +--> Redis (optional cache/session acceleration)
  +--> SMTP (optional email delivery)
  +--> Windows VPS agents (telemetry and remote jobs)
```

### Frontend

The frontend is a React single-page application built with Vite. Its main responsibilities are:

- Rendering the login screen and authenticated management console.
- Providing dashboard views, tables, reports, modals, and customer portal screens.
- Calling the Express API with `fetch`.
- Maintaining authenticated user, server, navigation, toast, and application data state through React contexts and hooks.
- Providing role-aware navigation and permissions.

Important frontend areas:

- `src/App.jsx`: application composition, routing-like view selection, global modals, and major data flows.
- `src/components/`: reusable screens, views, forms, modals, tables, and portal components.
- `src/contexts/`: authentication, server, user, navigation, and notification state.
- `src/hooks/`: reusable API and UI behavior.
- `src/utils/`: exports and helper utilities.
- `src/index.css`: application styling.

### Backend

The backend is a Node.js Express server in `server.js`. It:

- Exposes REST-style API endpoints under `/api`.
- Authenticates portal users and creates HttpOnly cookie sessions.
- Applies role-based authorization to protected operations.
- Reads and writes MySQL/MariaDB when configured and available.
- Falls back to `database.json` when MySQL is unavailable.
- Uses Redis when available and falls back to in-memory behavior when Redis is unavailable.
- Receives telemetry and job results from Windows agents.
- Queues remote jobs for agents.
- Handles file uploads, migrations, voice notes, tickets, email, and selected remote operations.

The backend listens on port `5000` by default and binds to `0.0.0.0`.

## 3. Functional modules

### Authentication and staff access

- Username/password login.
- Bcrypt password verification.
- HttpOnly cookie-based sessions.
- Per-tab session tracking.
- Session heartbeat and logout.
- Optional Google Authenticator TOTP 2FA.
- Backup codes for 2FA recovery.
- Password reset through email OTP when SMTP is configured.
- Administrative session termination.
- Staff roles including `SUPER_ADMIN`, `ADMIN`, `EMPLOYEE`, `SALESPERSON`, and `VIEWER`.

### VPS server management

The portal stores and manages:

- Server name and type.
- IP/RDP or TSplus port.
- HTTP and HTTPS access URLs.
- Tally serial information.
- Super-client account details.
- User capacity.
- Hardware specifications.
- Operational status.
- Available storage drives.
- Agent API key.

### Client and subscription management

Each client subscription can include:

- Company and customer contact details.
- Windows username and managed password.
- Server and drive assignment.
- Tally serial number.
- Subscription type and payment type.
- Amount, billing date, and expiry date.
- Salesperson assignment.
- Active, disabled, suspended, or expired status.
- Notes and last activity information.

The portal supports adding, editing, deleting, importing, renewing, disabling, and changing client passwords.

### Monitoring and telemetry

The Windows agent reports information such as:

- CPU usage.
- Total and used memory.
- Disk and drive information.
- Active and disconnected users.
- Server status.
- Hardware history.
- Agent connectivity.

The backend stores recent telemetry in memory and can persist telemetry history to MySQL.

### Windows VPS agent

The repository includes a Windows service agent used on managed VPS nodes. It can:

- Send telemetry to the central portal.
- Poll for or receive jobs.
- Report job results.
- Assist with user provisioning and account operations.
- Support disk, session, remote-assistance, and migration workflows.
- Run as a Windows Service with service recovery and a guardian scheduled task.

Agent-related files include:

- `InnovationVpsAgent.exe`: native Windows agent binary.
- `VpsAgent.ps1`: protected PowerShell runtime wrapper.
- `install.ps1`: administrator bootstrap installer.
- `Install_VpsAgent_Service.bat`, `Uninstall_VpsAgent_Service.bat`, `Check_VpsAgent_Status.bat`, and `Update_VpsAgent.bat`: service administration helpers.
- `VpsAgentService.cs`: source used as a fallback compilation target by the installer.
- `powershell-scripts/`: master and supporting PowerShell scripts.

### Secure script build

The script builder in `scripts/build_encrypted_scripts.js`:

1. Reads master PowerShell scripts.
2. Compresses them with GZip.
3. Encrypts the compressed bytes with AES-256-CBC.
4. Generates self-decrypting PowerShell wrappers.
5. Writes the wrappers to the root, public, and PowerShell distribution locations.

This protects distributed script files from containing the original plaintext implementation. The generated wrapper still needs to be treated as sensitive deployment software because it contains the runtime payload and cryptographic material needed to execute it.

Run the builder with:

```powershell
node scripts/build_encrypted_scripts.js
```

### Customer support portal

The application includes a public customer/helpdesk experience for:

- Customer verification.
- Ticket creation.
- Ticket updates and support communication.
- Voice-note and attachment-related workflows where configured.

The public portal is selected by paths such as `/portal`, `/support`, or the `portal=1` query flag.

### Audit and reporting

The backend records security and administrative actions, including events such as:

- User creation and deletion.
- Password changes and resets.
- Account locks.
- Session termination.
- Server and subscription changes.
- Agent and operational actions.

The frontend includes activity logs, daily activity, expiry, revenue/reporting, hardware, migration, and storage-related views.

## 4. Data storage

### MySQL/MariaDB

`schema.sql` defines the production database schema. Major tables include:

- `vps_servers`: managed server nodes.
- `client_subscriptions`: customers, Windows users, and subscriptions.
- `portal_users`: staff accounts and 2FA data.
- `audit_logs`: administrative and security audit records.
- `sessions`: authenticated portal sessions.
- Additional tables for telemetry, tickets, jobs, migrations, and operational data.

Use MySQL 8+ or MariaDB 10.5+ for the primary deployment.

### Local disk fallback

When MySQL is not available, the backend uses `database.json`. This is useful for local development and fail-safe operation, but it is not the preferred multi-user production store.

Do not treat `database.json` as a replacement for database backups or a high-availability database.

### Redis

Redis is optional. When available, it provides fast cache/session support. If it is unavailable, the application logs a fallback notice and continues using in-memory and database behavior.

## 5. Repository layout

```text
.
├── src/                         React frontend
│   ├── components/              Screens, views, modals, and UI controls
│   ├── contexts/                Shared application state
│   ├── hooks/                   Reusable frontend behavior
│   ├── data/                    Frontend data/constants
│   └── utils/                   Export and helper functions
├── public/                      Static files and agent distribution assets
├── powershell-scripts/          Windows agent scripts and master scripts
├── scripts/                     Build and packaging utilities
├── server.js                    Express API and backend services
├── database.json                Local fallback data store
├── schema.sql                   MySQL/MariaDB schema
├── package.json                 Scripts and dependencies
├── vite.config.js               Vite configuration and development proxy
├── install.ps1                  Windows agent bootstrap installer
├── deploy.js                    Deployment helper
├── deploy_fast.js               Build and SSH deployment pipeline
└── public/api_proxy.php         Apache/LiteSpeed bridge to port 5000
```

## 6. Local development

### Requirements

- Node.js 18 or newer; Node.js 20+ is recommended.
- npm 9 or newer.
- MySQL/MariaDB is optional for local startup.
- Redis is optional for local startup.

### Install dependencies

```powershell
npm install
```

### Configure environment

Copy `.env.example` to `.env` if needed and configure values such as:

```ini
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=vps_management_db
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SESSION_SECRET=replace_with_a_long_random_secret
ALLOWED_ORIGIN=http://localhost:3000
```

Never commit real passwords, SMTP credentials, SSH credentials, API keys, or production secrets.

### Start the backend

In terminal 1:

```powershell
npm run server
```

The API starts at:

```text
http://localhost:5000
```

### Start the frontend

In terminal 2:

```powershell
npm run dev
```

The frontend starts at:

```text
http://localhost:3000
```

During development, `vite.config.js` proxies `/api` and `/uploads` to the Express server on port `5000`.

### Start/stop reminder

The frontend and backend are separate processes. If the frontend loads but login says it cannot connect to the server, check that `npm run server` is still running and that port `5000` is listening.

## 7. Production build and deployment

### Build the frontend

```powershell
npm run build
```

This creates the production frontend bundle in `dist/`.

### Preview the production frontend locally

```powershell
npm run preview
```

### Fast SSH deployment

`deploy_fast.js` performs the following pipeline:

1. Regenerates protected PowerShell scripts.
2. Runs the Vite production build.
3. Creates a compressed `dist.tar.gz`.
4. Uploads the frontend bundle, backend, schema, installer, agent assets, and proxy files over SSH.
5. Writes an Apache `.htaccess` configuration.
6. Extracts the frontend on the remote host.
7. Restarts the backend with PM2 on port `5000`.
8. Verifies a backend agent endpoint.

Configure SSH and target values in the environment before running:

```powershell
node deploy_fast.js
```

Review the deployment script and environment values carefully before using it against a production server.

### Production request flow

In the cPanel/Apache-style deployment described by the repository:

```text
Browser -> Apache/LiteSpeed -> public/api_proxy.php -> Express on 127.0.0.1:5000
```

The PHP proxy forwards API requests, cookies, headers, uploads, downloads, and the client IP to the Node backend.

## 8. Installing an agent on a Windows VPS

1. Open PowerShell as Administrator on the target Windows VPS.
2. Run the central installer or download the repository's `install.ps1`.
3. Allow the installer to auto-detect the server identity, or provide `-ServerId`.
4. The installer downloads the native agent or compiles it from `VpsAgentService.cs` if necessary.
5. It installs the `InnovationVpsAgent` Windows Service.
6. It configures service crash recovery and a one-minute guardian task.
7. It starts the service and reports its status.

The installer communicates with:

```text
https://vps.innovationwebworks.in
```

The central portal must be reachable from the VPS, and the server node must be registered/configured in the management system.

## 9. Important security controls

- Bcrypt password hashing for portal credentials.
- HttpOnly session cookies.
- Session token hashing in the backend schema.
- Role-based authorization middleware.
- Optional TOTP 2FA and backup codes.
- Session heartbeat and revocation.
- Audit logging.
- CORS allow-listing for local and approved production domains.
- Security response headers.
- Agent API authentication keys.
- Encrypted/compressed PowerShell distribution wrappers.
- Production reverse proxy support.

### Security recommendations

Before production use:

- Replace the example `SESSION_SECRET` with a long random secret.
- Set real SMTP credentials only through secure environment configuration.
- Keep SSH credentials out of source control.
- Restrict database and Redis network access.
- Use HTTPS for the public portal and agent traffic.
- Rotate default/example agent and server credentials.
- Review the npm audit report and update vulnerable dependencies after testing.
- Back up MySQL and protect `database.json` if the fallback store is enabled.
- Avoid exposing port `5000` directly to the public internet when a reverse proxy is available.

## 10. Troubleshooting

### Login says “Unable to connect to login server”

Check:

```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen
```

If nothing is listening, start the backend:

```powershell
npm run server
```

Also confirm that the frontend is using the correct URL and that the Vite `/api` proxy is present during development.

### Backend reports Redis connection notice

This is not necessarily a fatal error. Redis is optional in the current implementation. The backend can continue with fallback behavior, although production deployments should use a reliable Redis instance when distributed caching/session performance is required.

### Backend reports MySQL unavailable

The application can fall back to `database.json`. For production, configure MySQL/MariaDB and initialize it with `schema.sql`.

### Agent is offline

Check:

- The Windows service exists and is running.
- The target VPS can resolve and reach the portal hostname.
- The server ID and agent API key match the registered server.
- HTTPS certificate and firewall rules permit agent traffic.
- The portal backend is running and accepting agent telemetry.

## 11. Available npm commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the Vite development frontend |
| `npm run server` | Start the Express backend |
| `npm run dev:all` | Alias that currently starts the backend |
| `npm run build` | Create the production frontend bundle |
| `npm run preview` | Preview the built frontend |
| `node scripts/build_encrypted_scripts.js` | Regenerate encrypted PowerShell wrappers |
| `node deploy_fast.js` | Build and deploy through SSH |

## 12. Operational summary

The normal operating cycle is:

1. Register a VPS server in the portal.
2. Install and start the Windows VPS agent.
3. Confirm telemetry and server health.
4. Create or import client subscriptions.
5. Assign each client to a server and storage drive.
6. Provision/manage the Windows user through the agent.
7. Monitor active sessions, capacity, storage, and expiry dates.
8. Renew, suspend, disable, migrate, or assist clients as required.
9. Use audit logs and reports for operational accountability.
10. Back up the production database and review agent/backend health regularly.

