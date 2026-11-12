# Innovation VPS & User Management Suite

An enterprise-grade, multi-node Windows VPS and user management control plane built with Node.js, Express, React, Vite, and Windows PowerShell/C# background agents.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **NPM**: v9.0.0 or higher
- **Database** *(Optional)*: MySQL 8.0+ or MariaDB 10.5+
  > **Note:** If MySQL is not running or not configured, the platform automatically falls back to the high-performance local disk database (`database.json`).

---

### 2. Installation
Clone or extract the project archive, open a terminal in the project directory, and install dependencies:

```bash
npm install
```

---

### 3. Environment Configuration (`.env`)
The project includes a ready-to-use `.env` file (and `.env.example` as a template). You can customize settings:

```ini
# Backend Server Port
PORT=5000

# Database Configuration (Optional - falls back to database.json if offline)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=vps_management_db

# Security & CORS
SESSION_SECRET=vps_super_secure_key_change_in_production_9876543210
ALLOWED_ORIGIN=http://localhost:3000
```

---

### 4. Running the Project Locally

#### Run Backend API:
```bash
npm run server
# Or: node server.js
```
The Express backend starts on `http://localhost:5000`.

#### Run Frontend Dev Server (in another terminal):
```bash
npm run dev
```
The Vite development server starts on `http://localhost:3000`. Open your browser at [http://localhost:3000](http://localhost:3000).

---

### 5. Production Build & Deployment

To compile the React frontend for production:
```bash
npm run build
```
The optimized production bundle will be generated in `dist/`.

#### Fast Remote Deployment (SSH):
To deploy the fullstack application to your Linux/cPanel remote production server:
1. Ensure your remote server credentials in `.env` are set:
   ```ini
   SSH_HOST=your_server_ip
   SSH_PORT=22
   SSH_USER=root
   SSH_PASSWORD=your_ssh_password
   REMOTE_TARGET_DIR=/var/www/your_site_domain
   ```
2. Execute the fast deployment pipeline:
   ```bash
   node deploy_fast.js
   ```

---

### 6. Architecture & Features Overview
- **Zero-Trust User Provisioning**: Automated partition formatting, directory creation, NTFS ACL permissions, and dedicated `tally.ini` configuration for client isolation.
- **Hardware Telemetry & Drift Detection**: Real-time CPU, RAM, disk health, active sessions, and multi-drive storage monitoring.
- **Auto-Healing Agent Service**: 24/7 background Windows Service (`InnovationVpsAgent.exe`) with auto-resurrection via Windows Service Control Manager (SCM).
- **In-Memory Encrypted Scripts**: All proprietary PowerShell scripts are encrypted with AES-256 and execute directly in memory with zero plaintext disk footprint.
- **Duplicate Session Guardian**: Enforces single-login compliance with grace periods and automatic stale session termination.

---

## Encryption key backup

Managed passwords are stored encrypted (`enc:v1:` values) with `PASSWORD_ENCRYPTION_KEY`. The database alone cannot reveal them, so the key must be backed up with the same care as the data.

**Generate a key** (prints a 44-character base64 string):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Rules**

- Store the key in at least two separate secure places: a password manager and an offline copy (for example a printed or encrypted USB copy kept in a safe).
- Never store it in the repository, and never in the `BACKUP_DIR` that holds the database dumps. A dump and its key kept together defeat the encryption.
- Losing the key makes every encrypted password unrecoverable. There is no reset.
- Key rotation is NOT supported by the v1 format. The `enc:v1:` prefix leaves room for a future key id.

**Test a restore (backup plus key together)**

1. Restore a recent database backup into a scratch database (not the live one).
2. Start the portal against that scratch database with the key from your backup copy.
3. Reveal one client password in the portal and compare it with the known value.

Run this test before the password migration (`scripts/migrate_passwords.js`) and after any change to your backup process.

---

## 📄 License
Proprietary & Confidential - Innovation Web Works. All Rights Reserved.
