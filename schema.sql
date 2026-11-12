-- ==============================================================================
-- Innovation Web Works - VPS Management System Complete Database Schema
-- Database: MySQL 8.0+ / MariaDB 10.5+
-- Charset: utf8mb4 / utf8mb4_unicode_ci
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `vps_management_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `vps_management_db`;

-- ------------------------------------------------------------------------------
-- Table 1: `vps_servers`
-- Purpose: Holds all physical, cloud, and VPS Windows server nodes.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vps_servers` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Server Node ID (e.g., srv-1)',
  `name` VARCHAR(255) NOT NULL COMMENT 'Display Name / Alias of VPS Node',
  `serverType` VARCHAR(50) DEFAULT 'Shared VPS' COMMENT 'Server category: Shared VPS, Dedicated VPS, Cloud',
  `tallySerial` VARCHAR(100) DEFAULT '' COMMENT 'Tally Serial Number assigned to this server',
  `ipPort` VARCHAR(100) NOT NULL COMMENT 'Primary IP address and RDP/TSplus Port (e.g., 192.168.1.100:3389)',
  `httpUrl` VARCHAR(255) DEFAULT '' COMMENT 'HTTP Web Access URL',
  `httpsUrl` VARCHAR(255) DEFAULT '' COMMENT 'HTTPS Secured Web Access URL',
  `superClientUser` VARCHAR(100) DEFAULT 'Superclient' COMMENT 'SuperClient admin Windows account username',
  `superClientPass` VARCHAR(2048) DEFAULT '' COMMENT 'Encrypted/Managed password for SuperClient account',
  `totalUsersLimit` INT DEFAULT 30 COMMENT 'Maximum concurrent client limit allowed on this VPS',
  `specs` VARCHAR(255) DEFAULT '' COMMENT 'Hardware specifications (CPU cores, RAM size, disk capacity)',
  `portSerial` VARCHAR(50) DEFAULT '' COMMENT 'Port Serial / Internal Identifier',
  `status` VARCHAR(50) DEFAULT 'Active' COMMENT 'Operational status: Active, Maintenance, Offline',
  `availableDrives` TEXT COMMENT 'JSON Array of available storage drive letters (e.g. ["C:", "D:", "E:"])',
  `apiKey` VARCHAR(255) DEFAULT NULL COMMENT 'Agent API authentication key for this server node',
  `previousApiKey` VARCHAR(255) DEFAULT NULL COMMENT 'Hash of the replaced agent key, valid until previousKeyExpiresAt (rotation grace window)',
  `previousKeyExpiresAt` BIGINT DEFAULT NULL COMMENT 'Epoch milliseconds when the previous agent key stops being accepted',
  `meta` LONGTEXT DEFAULT NULL COMMENT 'JSON of server runtime attributes (see lib/serverMeta.js)',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Record creation timestamp',
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last updated timestamp'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 2: `client_subscriptions`
-- Purpose: Holds all customer accounts, Windows local user links, subscriptions, and expiry dates.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `client_subscriptions` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Subscription ID (e.g., user-1740000000)',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Foreign Key linking to vps_servers(id)',
  `clientType` VARCHAR(50) DEFAULT 'Shared' COMMENT 'Account type: Shared, Dedicated, Multi-User',
  `username` VARCHAR(100) NOT NULL COMMENT 'Windows Local Username on VPS (e.g., shree_ji)',
  `password` VARCHAR(2048) NOT NULL COMMENT 'Managed Windows VPS password',
  `tallySerialNo` VARCHAR(100) DEFAULT '' COMMENT 'Client-specific Tally License Serial Number',
  `company` VARCHAR(255) NOT NULL COMMENT 'Client / Company Name',
  `paymentType` VARCHAR(50) DEFAULT 'Online / Bank' COMMENT 'Billing method (Online, Cash, Cheque, Bank Transfer)',
  `amount` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Subscription fee amount in INR / Currency',
  `billDate` VARCHAR(50) DEFAULT NULL COMMENT 'Date subscription was billed (YYYY-MM-DD)',
  `expiryDate` VARCHAR(50) NOT NULL COMMENT 'Subscription expiration date (YYYY-MM-DD)',
  `salesAgent` VARCHAR(100) DEFAULT '' COMMENT 'Assigned salesperson or sales partner',
  `drive` VARCHAR(50) NOT NULL COMMENT 'Assigned storage drive letter on VPS (e.g., D:)',
  `customerPhone` VARCHAR(50) DEFAULT '' COMMENT 'Customer WhatsApp / Mobile phone number',
  `customerEmail` VARCHAR(100) DEFAULT '' COMMENT 'Customer primary notification email address',
  `notes` TEXT COMMENT 'Internal administration notes, GSTIN, or billing details',
  `status` VARCHAR(50) DEFAULT 'ACTIVE' COMMENT 'Account status: ACTIVE, Disabled, Suspended, Expired',
  `lastActiveAt` VARCHAR(100) DEFAULT NULL COMMENT 'Last detected active session timestamp',
  `tallyVersion` VARCHAR(50) DEFAULT '' COMMENT 'Client Tally version (used for migrations)',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Subscription creation date',
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last modification date',
  INDEX `idx_client_server` (`serverId`),
  INDEX `idx_client_status` (`status`),
  INDEX `idx_client_expiry` (`expiryDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 3: `portal_users`
-- Purpose: Holds staff, administrators, managers, and sales personnel portal credentials.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `portal_users` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Employee / Staff ID',
  `name` VARCHAR(255) NOT NULL COMMENT 'Full Name of the staff member',
  `username` VARCHAR(100) NOT NULL UNIQUE COMMENT 'Login username for Web Management Portal',
  `password` VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed password',
  `role` VARCHAR(50) DEFAULT 'EMPLOYEE' COMMENT 'Access Role: SUPER_ADMIN, ADMIN, EMPLOYEE, SALESPERSON, VIEWER',
  `status` VARCHAR(50) DEFAULT 'ACTIVE' COMMENT 'Account status: ACTIVE, SUSPENDED, INACTIVE',
  `email` VARCHAR(255) DEFAULT '' COMMENT 'Staff email address for notifications and 2FA',
  `two_factor_enabled` TINYINT(1) DEFAULT 0 COMMENT '1 if Google Authenticator 2FA is active, 0 if disabled',
  `two_factor_secret` VARCHAR(512) DEFAULT NULL COMMENT 'Base32 RFC 6238 TOTP shared secret',
  `two_factor_temp_secret` VARCHAR(512) DEFAULT NULL COMMENT 'Temporary secret during QR code setup confirmation',
  `two_factor_backup_codes` TEXT DEFAULT NULL COMMENT 'JSON array of 8-character emergency backup recovery codes',
  `lastLogin` VARCHAR(100) DEFAULT NULL COMMENT 'Last portal login timestamp',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Account creation date'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 4: `audit_logs`
-- Purpose: Tamper-evident ledger tracking every administrative action and security event.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Audit Record ID',
  `timestamp` VARCHAR(50) NOT NULL COMMENT 'Action timestamp (YYYY-MM-DD HH:mm:ss)',
  `operator` VARCHAR(100) NOT NULL COMMENT 'Staff member or system service who performed the action',
  `role` VARCHAR(50) NOT NULL COMMENT 'Role of the operator at the time of execution',
  `action` VARCHAR(100) NOT NULL COMMENT 'Action tag (e.g. USER_CREATED, PASS_CHANGED, ACCOUNT_LOCKED, SESSION_KICKED)',
  `target` VARCHAR(255) DEFAULT '' COMMENT 'Target entity (Company Name, Username, or Server Node)',
  `details` TEXT COMMENT 'Detailed audit description and parameters',
  `ipAddress` VARCHAR(100) DEFAULT '' COMMENT 'Origin IP address of the operator',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Record insert timestamp'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 5: `sessions`
-- Purpose: Backend session tracking with isolated tab security and token hashing.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(120) PRIMARY KEY COMMENT 'Unique Session ID',
  `employee_id` VARCHAR(100) NOT NULL COMMENT 'Linked portal_users(id)',
  `session_token_hash` VARCHAR(255) NOT NULL COMMENT 'SHA-256 hashed session token for HttpOnly cookie',
  `tab_id` VARCHAR(100) DEFAULT '' COMMENT 'Unique browser tab identifier for tab isolation',
  `ip_address` VARCHAR(100) DEFAULT '' COMMENT 'Client IP address',
  `user_agent` TEXT COMMENT 'Browser user agent string',
  `status` VARCHAR(50) DEFAULT 'ACTIVE' COMMENT 'Session status: ACTIVE, TERMINATED, EXPIRED',
  `last_seen` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Heartbeat / activity timestamp',
  `expires_at` TIMESTAMP NOT NULL COMMENT 'Session expiry timestamp',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Login creation timestamp',
  INDEX `idx_sess_token` (`session_token_hash`),
  INDEX `idx_sess_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 6: `server_telemetry`
-- Purpose: Live node health metrics, RAM/CPU/Disk stats, and active/disconnected RDP sessions.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `server_telemetry` (
  `serverId` VARCHAR(100) PRIMARY KEY COMMENT 'Linked vps_servers(id)',
  `cpuUsage` INT DEFAULT 0 COMMENT 'Current CPU Load percentage (0-100%)',
  `ramTotalGB` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Total Physical RAM installed in Gigabytes',
  `ramUsedGB` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'RAM currently in active use in Gigabytes',
  `ramPercent` INT DEFAULT 0 COMMENT 'RAM utilization percentage (0-100%)',
  `disks` TEXT COMMENT 'JSON serialized disk telemetry array (drives, totalGB, freeGB, alerts)',
  `uptime` VARCHAR(100) DEFAULT '' COMMENT 'System uptime string reported by Windows agent',
  `activeUsersCount` INT DEFAULT 0 COMMENT 'Number of currently active online RDP sessions',
  `activeUsersList` TEXT COMMENT 'JSON array of active connected usernames',
  `disconnectedUsersCount` INT DEFAULT 0 COMMENT 'Number of disconnected idle sessions remaining in RAM',
  `disconnectedUsersList` LONGTEXT DEFAULT NULL COMMENT 'JSON array of disconnected sessions and usernames',
  `status` VARCHAR(50) DEFAULT 'ONLINE' COMMENT 'Node connectivity state: ONLINE, OFFLINE, WARNING',
  `lastPing` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Timestamp of last received telemetry heartbeat'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 7: `support_tickets`
-- Purpose: Helpdesk ticketing system with voice note attachments, priorities, and workflow.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` VARCHAR(50) PRIMARY KEY COMMENT 'Ticket Reference ID (e.g., TKT-1001)',
  `clientId` VARCHAR(100) NOT NULL COMMENT 'Linked client_subscriptions(id)',
  `clientName` VARCHAR(255) NOT NULL COMMENT 'Client Contact Name',
  `company` VARCHAR(255) NOT NULL COMMENT 'Company / Organization Name',
  `customerPhone` VARCHAR(50) DEFAULT '' COMMENT 'Customer WhatsApp / Mobile phone',
  `customerEmail` VARCHAR(100) DEFAULT '' COMMENT 'Customer Email',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `serverName` VARCHAR(255) DEFAULT '' COMMENT 'VPS Server Name',
  `drive` VARCHAR(50) DEFAULT '' COMMENT 'Assigned Drive',
  `issueCategory` VARCHAR(100) NOT NULL COMMENT 'Category: Tally Error, RDP Connection, Printing, Password, Performance',
  `subject` VARCHAR(255) NOT NULL COMMENT 'Ticket Subject Title',
  `description` TEXT COMMENT 'Full description of customer problem',
  `priority` VARCHAR(20) DEFAULT 'MEDIUM' COMMENT 'Priority: LOW, MEDIUM, HIGH, URGENT',
  `status` VARCHAR(20) DEFAULT 'OPEN' COMMENT 'Ticket status: OPEN, IN_PROGRESS, RESOLVED, CLOSED',
  `assignedTo` VARCHAR(100) DEFAULT '' COMMENT 'Assigned engineer / staff member name',
  `assignedToEmail` VARCHAR(100) DEFAULT '' COMMENT 'Assigned engineer email address',
  `resolutionNotes` TEXT COMMENT 'Technical resolution notes upon ticket closure',
  `voiceNoteUrl` TEXT COMMENT 'URL path to recorded voice note audio (WebM)',
  `createdBy` VARCHAR(100) DEFAULT 'Staff' COMMENT 'Creator of ticket (Staff, Customer, System)',
  `source` VARCHAR(30) DEFAULT '' COMMENT 'Origin: CUSTOMER_PORTAL, STAFF',
  `resolvedAt` VARCHAR(50) DEFAULT NULL COMMENT 'Resolution timestamp',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Ticket creation timestamp',
  INDEX `idx_tkt_client` (`clientId`),
  INDEX `idx_tkt_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 8: `user_inactivity_tracker`
-- Purpose: Tracks clients who have not logged into Windows VPS for 7+ consecutive days.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_inactivity_tracker` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Tracker ID (`track-${serverId}-${username}`)',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `username` VARCHAR(100) NOT NULL COMMENT 'Client Windows username',
  `company` VARCHAR(255) DEFAULT '' COMMENT 'Company Name',
  `lastActiveAt` VARCHAR(100) DEFAULT NULL COMMENT 'Last detected active session datetime',
  `firstDiscoveredAt` VARCHAR(100) DEFAULT NULL COMMENT 'First telemetry discovery datetime',
  `daysInactive` INT DEFAULT 0 COMMENT 'Number of days inactive without RDP login',
  `isInactiveOver7Days` TINYINT(1) DEFAULT 0 COMMENT 'Boolean flag (1 if inactive >= 7 days, 0 otherwise)',
  `lastCheckedAt` VARCHAR(100) DEFAULT NULL COMMENT 'Datetime of last evaluation'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 9: `server_session_events`
-- Purpose: Historical timeline of RDP logon, disconnect, reconnect, and logoff events.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `server_session_events` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Session Event ID',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `username` VARCHAR(100) NOT NULL COMMENT 'Client Windows username',
  `sessionId` VARCHAR(50) DEFAULT '' COMMENT 'Windows Session ID (qwinsta ID)',
  `eventState` VARCHAR(50) NOT NULL COMMENT 'Event Type: Logon, Disconnected, Reconnected, Logoff, ForceLogoff',
  `loginTime` VARCHAR(100) DEFAULT NULL COMMENT 'Session start timestamp',
  `logoutTime` VARCHAR(100) DEFAULT NULL COMMENT 'Session termination timestamp',
  `durationSeconds` INT DEFAULT 0 COMMENT 'Session duration in seconds',
  `eventTimestamp` VARCHAR(100) NOT NULL COMMENT 'Event recorded timestamp',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Insert timestamp',
  INDEX `idx_srv_user` (`serverId`, `username`),
  INDEX `idx_event_time` (`eventTimestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 10: `daily_user_activity`
-- Purpose: Aggregated daily usage summaries per client for billing and attendance metrics.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `daily_user_activity` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Day Activity ID',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `username` VARCHAR(100) NOT NULL COMMENT 'Client Windows username',
  `activityDate` VARCHAR(50) NOT NULL COMMENT 'Calendar Date (YYYY-MM-DD)',
  `firstLogin` VARCHAR(100) DEFAULT NULL COMMENT 'Time of first login today (HH:mm:ss)',
  `lastLogout` VARCHAR(100) DEFAULT NULL COMMENT 'Time of last logout today (HH:mm:ss)',
  `sessionCount` INT DEFAULT 1 COMMENT 'Total login sessions initiated today',
  `totalUsageSeconds` INT DEFAULT 0 COMMENT 'Cumulative total seconds connected today',
  `currentStatus` VARCHAR(50) DEFAULT 'Active' COMMENT 'Latest status: Active, Disconnected, Offline',
  `lastUpdated` VARCHAR(100) DEFAULT NULL COMMENT 'Timestamp of last update',
  UNIQUE KEY `srv_user_date_uniq` (`serverId`, `username`, `activityDate`),
  INDEX `idx_act_date` (`activityDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 11: `server_monitoring_alerts`
-- Purpose: System health alerts (Low Disk Space, High RAM, Offline VPS nodes).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `server_monitoring_alerts` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Alert ID',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `alertType` VARCHAR(50) NOT NULL COMMENT 'Alert Type: LOW_DISK, HIGH_RAM, NODE_OFFLINE, RECOVERY',
  `target` VARCHAR(100) DEFAULT '' COMMENT 'Target component (e.g. Drive C:, Node IP, RAM)',
  `message` TEXT COMMENT 'Human-readable diagnostic message',
  `severity` VARCHAR(20) DEFAULT 'WARNING' COMMENT 'Severity: INFO, WARNING, CRITICAL',
  `status` VARCHAR(20) DEFAULT 'ACTIVE' COMMENT 'Alert status: ACTIVE, ACKNOWLEDGED, RESOLVED',
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last alert update',
  INDEX `idx_srv_alert` (`serverId`, `alertType`),
  INDEX `idx_alert_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 12: `vps_provision_jobs`
-- Purpose: Asynchronous command dispatch queue for PowerShell Agent on Windows VPS.
-- Supported Actions:
--   1. PROVISION_TALLY_USER: Creates Windows local user, NTFS ACLs, directory tree & tally.ini
--   2. CHANGE_USER_PASSWORD: Runs Set-LocalUser / net user on VPS to sync password automatically
--   3. TOGGLE_USER_STATUS: Runs Disable-LocalUser / Enable-LocalUser to lock or unlock account
--   4. TERMINATE_SESSION: Runs logoff.exe <SessionId> / rwinsta to kick RDP session
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vps_provision_jobs` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique Job ID (e.g., job-1740000000)',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Target VPS Server ID for execution',
  `action` VARCHAR(50) DEFAULT 'PROVISION_TALLY_USER' COMMENT 'Action command: PROVISION_TALLY_USER, CHANGE_USER_PASSWORD, TOGGLE_USER_STATUS, TERMINATE_SESSION',
  `companyName` VARCHAR(255) NOT NULL COMMENT 'Client company name',
  `username` VARCHAR(100) NOT NULL COMMENT 'Windows local account username',
  `password` VARCHAR(2048) NOT NULL COMMENT 'User password or new password for change jobs',
  `drive` VARCHAR(50) NOT NULL COMMENT 'Target storage drive letter',
  `expiryDate` VARCHAR(50) DEFAULT NULL COMMENT 'Subscription expiry date',
  `setupTSplus` TINYINT DEFAULT 1 COMMENT 'Flag to configure TSplus application publishing',
  `sessionId` VARCHAR(50) DEFAULT NULL COMMENT 'Session ID for TERMINATE_SESSION jobs',
  `status` VARCHAR(50) DEFAULT 'PENDING' COMMENT 'Job lifecycle state: PENDING, IN_PROGRESS, COMPLETED, FAILED',
  `resultMessage` TEXT COMMENT 'Detailed output or error message returned by PowerShell agent',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Job creation timestamp',
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Job completion timestamp',
  INDEX `idx_pjob_server` (`serverId`),
  INDEX `idx_pjob_status` (`status`),
  INDEX `idx_pjob_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table 13: `server_telemetry_history`
-- Purpose: Time-series telemetry history for server performance graphs and reports.
-- Stores periodic snapshots of CPU %, RAM %, Disks, Active Users, and Disconnected Users.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `server_telemetry_history` (
  `id` VARCHAR(100) PRIMARY KEY COMMENT 'Unique History Record ID (hist-{serverId}-{timestamp})',
  `serverId` VARCHAR(100) NOT NULL COMMENT 'Linked vps_servers(id)',
  `cpuUsage` INT DEFAULT 0 COMMENT 'CPU load % at time of recording',
  `ramTotalGB` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Total RAM in GB',
  `ramUsedGB` DECIMAL(5,2) DEFAULT 0.00 COMMENT 'RAM used in GB',
  `ramPercent` INT DEFAULT 0 COMMENT 'RAM load % at time of recording',
  `disks` TEXT COMMENT 'JSON serialized disk usage array at time of snapshot',
  `activeUsersCount` INT DEFAULT 0 COMMENT 'Number of online active sessions',
  `disconnectedUsersCount` INT DEFAULT 0 COMMENT 'Number of disconnected idle sessions',
  `status` VARCHAR(50) DEFAULT 'ONLINE' COMMENT 'Server state: ONLINE, WARNING, OFFLINE',
  `timestamp` VARCHAR(50) NOT NULL COMMENT 'Readable timestamp (YYYY-MM-DD HH:mm:ss)',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp for time-series queries',
  INDEX `idx_hist_srv_time` (`serverId`, `createdAt`),
  INDEX `idx_hist_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ------------------------------------------------------------------------------
-- Table 14-17: Entity_Tables (`requests`, `renewals`, `migrations`, `deleted_servers`)
-- Purpose: Durable storage for requests, renewals, migrations (JSON document in `data`)
-- and deleted-server tombstones. Safe to run repeatedly; never drops or alters data.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `requests` (
  `id` VARCHAR(100) PRIMARY KEY,
  `status` VARCHAR(50),
  `createdAt` VARCHAR(50),
  `data` LONGTEXT NOT NULL,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `renewals` (
  `id` VARCHAR(100) PRIMARY KEY,
  `status` VARCHAR(50),
  `createdAt` VARCHAR(50),
  `data` LONGTEXT NOT NULL,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` VARCHAR(100) PRIMARY KEY,
  `status` VARCHAR(50),
  `createdAt` VARCHAR(50),
  `data` LONGTEXT NOT NULL,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `deleted_servers` (
  `token` VARCHAR(255) PRIMARY KEY,
  `serverId` VARCHAR(100),
  `deletedAt` VARCHAR(50),
  `snapshot` LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ------------------------------------------------------------------------------
-- Table 18: workspace_requests
-- Purpose: Public "request demo" workspace deployment leads (JSON document in `data`).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workspace_requests` (
  `id` VARCHAR(100) PRIMARY KEY,
  `createdAt` VARCHAR(50),
  `status` VARCHAR(50),
  `data` LONGTEXT NOT NULL,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ==============================================================================
-- End of Schema Definition
-- ==============================================================================
