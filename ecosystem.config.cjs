/**
 * PM2 process definition for the Portal_Backend.
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Reload:  pm2 restart portal-backend
 *
 * Log rotation (run once on the host; reference for the Runbook):
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 10M
 *   pm2 set pm2-logrotate:retain 14
 */
module.exports = {
  apps: [
    {
      name: 'portal-backend',
      script: 'server.js',

      // SINGLE INSTANCE ONLY. Do not raise `instances` or switch to cluster mode.
      // The portal keeps state in process memory: `memoryStore` (server.js ~line 417),
      // the session cache fallback, `telemetryStore` (~line 2519), the long-poll emitters
      // `agentJobEmitter` and `liveScreenWaiters` (~lines 16-21), `liveScreenStore` (~line 20),
      // `preAuthStore` (~line 1459), `otpStore` (~line 8748), the in-memory rate-limit maps
      // (~lines 199-201), and the agent key status map. With more than one process, a login,
      // OTP, or long-poll could land on a different process than the one holding its state.
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
      },

      // Restart policy
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 1000,
      max_memory_restart: '512M',

      // Logs: separate error and output files, timestamped lines
      error_file: './logs/portal-backend-error.log',
      out_file: './logs/portal-backend-out.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
