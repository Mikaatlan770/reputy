/**
 * P0.2 — PM2 Ecosystem Configuration
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 logs reputy-backend
 *   pm2 stop reputy-backend
 * 
 * Prerequisites:
 *   npm install -g pm2
 * 
 * Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'reputy-backend',
      script: 'apps/backend/server.js',
      cwd: './',

      // === Restart policy ===
      autorestart: true,
      max_restarts: 15,              // Max 15 restarts before stopping
      min_uptime: '10s',             // Consider "started" after 10s uptime
      restart_delay: 3000,           // Wait 3s between restarts
      max_memory_restart: '512M',    // Restart if memory exceeds 512MB

      // === Shutdown ===
      kill_timeout: 6000,            // Wait 6s for graceful shutdown before SIGKILL
      listen_timeout: 10000,         // Wait 10s for app to signal ready
      shutdown_with_message: false,

      // === Logs ===
      error_file: './logs/reputy-backend-error.log',
      out_file: './logs/reputy-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // === Watch (dev only — keep false in prod) ===
      watch: false,

      // === Env: Development (default) ===
      env: {
        NODE_ENV: 'development',
        PORT: 8787,
        REPUTY_STORAGE: 'sqlite',
      },

      // === Env: Production ===
      // IMPORTANT: Secrets (STRIPE_SECRET_KEY, JWT_SECRET, etc.)
      // MUST come from real env vars or .env file, NOT from this config.
      env_production: {
        NODE_ENV: 'production',
        PORT: 8787,
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // P2: Daily MRR snapshot (00:05 UTC)
    // cron_restart relaunches the stopped process at cron time.
    // With autorestart: false, it runs once then stops until next cron tick.
    {
      name: 'snapshot-mrr',
      script: 'apps/backend/lib/scripts/snapshot-mrr.js',
      cwd: './',
      cron_restart: '5 0 * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/snapshot-mrr-error.log',
      out_file: './logs/snapshot-mrr-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── Worker: Email Outbox (every 5 min) ──
    // Processes pending emails from email_outbox table
    {
      name: 'worker-email',
      script: 'apps/backend/lib/scripts/process-email-outbox.js',
      cwd: './',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/worker-email-error.log',
      out_file: './logs/worker-email-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── Worker: SMS Scheduled Sends (every 5 min) ──
    // Processes delayed SMS sends from scheduled_sends table
    {
      name: 'worker-sms',
      script: 'apps/backend/lib/scripts/process-scheduled-sends.js',
      cwd: './',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/worker-sms-error.log',
      out_file: './logs/worker-sms-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── Worker: AI Auto-Reply (every 10 min) ──
    // Generates AI draft replies for eligible reviews (4-5★)
    {
      name: 'worker-auto-reply',
      script: 'apps/backend/lib/scripts/process-auto-replies.js',
      cwd: './',
      cron_restart: '*/10 * * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/worker-auto-reply-error.log',
      out_file: './logs/worker-auto-reply-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── Watchdog: System Health Monitor (every 10 min) ──
    // Checks /health endpoint via HTTP, outputs JSON for alerting
    // Adjust --url to your public domain in production
    {
      name: 'watchdog',
      script: 'apps/backend/lib/scripts/watchdog.js',
      args: '--json',
      cwd: './',
      cron_restart: '*/10 * * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/watchdog-error.log',
      out_file: './logs/watchdog-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── Sync Competitors: Google Places (weekly Monday 04:00 UTC) ──
    // Fetches nearby competitors for all orgs with lat/lng configured
    {
      name: 'sync-competitors',
      script: 'apps/backend/lib/scripts/sync-competitors.js',
      cwd: './',
      cron_restart: '0 4 * * 1',
      autorestart: false,
      watch: false,
      error_file: './logs/sync-competitors-error.log',
      out_file: './logs/sync-competitors-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },

    // ── DB Backup (daily at 02:00 UTC) ──
    // Creates a WAL-safe SQLite backup with rotation
    {
      name: 'db-backup',
      script: 'apps/backend/lib/scripts/db-backup.js',
      cwd: './',
      cron_restart: '0 2 * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/db-backup-error.log',
      out_file: './logs/db-backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REPUTY_STORAGE: 'sqlite',
      },
    },
  ],
};
