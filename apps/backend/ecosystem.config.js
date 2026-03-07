/**
 * PM2 Ecosystem Config — Reputy Backend
 * VPS OVH / Node.js
 *
 * Usage :
 *   pm2 start ecosystem.config.js          # démarre tout
 *   pm2 restart ecosystem.config.js        # redémarre tout
 *   pm2 stop ecosystem.config.js           # stoppe tout
 *   pm2 logs                               # logs en temps réel
 *   pm2 monit                              # monitoring interactif
 *   pm2 save                               # sauvegarde la config
 *   pm2 startup                            # génère la commande boot (à exécuter)
 *
 * Après toute modification de ce fichier :
 *   pm2 restart ecosystem.config.js --update-env
 */

'use strict';

module.exports = {
  apps: [

    // ══════════════════════════════════════════════════════════════
    // 1. BACKEND — Serveur HTTP principal
    // ══════════════════════════════════════════════════════════════
    {
      name: 'reputy-backend',
      script: 'server.js',
      cwd: '/root/apps/backend',          // ← adapter au chemin réel sur le VPS
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,               // attendre 5s avant de redémarrer (laisse le port se libérer)
      kill_timeout: 8000,                // attendre 8s pour l'arrêt gracieux avant SIGKILL
      min_uptime: '10s',                 // considéré stable après 10s
      max_memory_restart: '512M',        // redémarre si > 512 Mo RAM
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
      error_file: '/root/logs/reputy-backend-error.log',
      out_file: '/root/logs/reputy-backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 2. WORKER — Email Outbox (toutes les 2 minutes)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'worker-email-outbox',
      script: 'lib/scripts/process-email-outbox.js',
      cwd: '/root/apps/backend',
      cron_restart: '*/2 * * * *',
      autorestart: false,               // cron job : pas de restart en boucle
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/logs/worker-email-outbox-error.log',
      out_file: '/root/logs/worker-email-outbox-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 3. WORKER — SMS Scheduled Sends (toutes les 2 minutes)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'worker-scheduled-sms',
      script: 'lib/scripts/process-scheduled-sends.js',
      cwd: '/root/apps/backend',
      cron_restart: '*/2 * * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/logs/worker-scheduled-sms-error.log',
      out_file: '/root/logs/worker-scheduled-sms-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 4. WORKER — AI Auto-Reply (toutes les 15 minutes)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'worker-auto-reply',
      script: 'lib/scripts/process-auto-replies.js',
      cwd: '/root/apps/backend',
      cron_restart: '*/15 * * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/logs/worker-auto-reply-error.log',
      out_file: '/root/logs/worker-auto-reply-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 5. WORKER — Sync Concurrents (tous les dimanches à 03h00)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'worker-sync-competitors',
      script: 'lib/scripts/sync-competitors.js',
      cwd: '/root/apps/backend',
      cron_restart: '0 3 * * 0',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/logs/worker-sync-competitors-error.log',
      out_file: '/root/logs/worker-sync-competitors-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 6. WORKER — MRR Snapshot (1er de chaque mois à 01h00)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'worker-mrr-snapshot',
      script: 'lib/scripts/snapshot-mrr.js',
      cwd: '/root/apps/backend',
      cron_restart: '0 1 1 * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/logs/worker-mrr-snapshot-error.log',
      out_file: '/root/logs/worker-mrr-snapshot-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ══════════════════════════════════════════════════════════════
    // 7. WATCHDOG — Surveillance santé (toutes les 5 minutes)
    // ══════════════════════════════════════════════════════════════
    {
      name: 'watchdog',
      script: 'lib/scripts/watchdog.js',
      cwd: '/root/apps/backend',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production',
        WATCHDOG_JSON: 'false',
      },
      error_file: '/root/logs/watchdog-error.log',
      out_file: '/root/logs/watchdog-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

  ],
};
