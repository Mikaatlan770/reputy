# 🛡️ OPS — Backup & Restore SQLite (P0.5)

## Vue d'ensemble

Reputy utilise SQLite en production avec **WAL mode**. Le script de backup utilise
l'API `better-sqlite3 .backup()` qui encapsule l'**API Online Backup de SQLite**,
garantissant un snapshot **atomique et cohérent**, même pendant des
écritures concurrentes.

## ⚠️ Prérequis d'exécution

**Tous les scripts doivent être lancés depuis la racine du monorepo** (`avis-doctolib/`).

Les chemins par défaut (`apps/backend/reputy.db`, `./backups`) sont résolus relativement
à `__dirname` du script (= `scripts/`), donc ils fonctionnent indépendamment du `cwd`,
mais les commandes `npm run db:*` doivent être lancées depuis la racine.

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `REPUTY_DB_PATH` | Chemin vers la base SQLite live | `apps/backend/reputy.db` |
| `BACKUP_DIR` | Dossier de stockage des backups | `./backups` |
| `BACKUP_KEEP` | Nombre de backups à conserver (rotation) | `14` |
| `PM2_APP_NAME` | Nom du process PM2 (pour le check restore) | `reputy-backend` |
| `REPUTY_BACKEND_PORT` | Port backend (fallback: `PORT`, puis `8787`) | `8787` |

## Backup manuel

```bash
# Backup simple (depuis la racine du repo)
npm run db:backup

# Avec variables custom
REPUTY_DB_PATH=/data/reputy.db BACKUP_DIR=/mnt/backups BACKUP_KEEP=30 npm run db:backup

# Vérifier les backups existants
npm run db:backup:verify
```

Le script de backup :
- Ouvre la DB en readwrite (compatibilité maximale avec l'API Online Backup)
- Crée un fichier `reputy-YYYYMMDDHHMMSS.db` dans `BACKUP_DIR`
- Vérifie que le fichier n'est pas vide + `SELECT 1` + comptage tables
- Applique la rotation (supprime les plus anciens au-delà de `BACKUP_KEEP`)

## Restauration

```bash
# 1. Arrêter le serveur (OBLIGATOIRE)
npm run pm2:stop

# 2. Lister les backups disponibles
npm run db:backup:verify

# 3. Restaurer depuis un backup
npm run db:restore -- backups/reputy-20260210143055.db

# 4. Redémarrer
npm run pm2:start

# 5. Vérifier
npm run pm2:logs
```

Le script de restore :
- **Refuse** de s'exécuter si le serveur tourne (PM2 `PM2_APP_NAME` ou port actif)
- Sauvegarde la DB actuelle en `.pre-restore.bak`
- Supprime les fichiers `-wal` et `-shm` (liés à l'ancienne session)
- Copie le backup vers `REPUTY_DB_PATH`
- Vérifie l'intégrité de la DB restaurée (`SELECT 1` + comptage tables, `orgs` en best-effort)

### Rollback d'un restore

Si le restore échoue ou pose problème :

```bash
npm run pm2:stop
cp apps/backend/reputy.db.pre-restore.bak apps/backend/reputy.db
npm run pm2:start
```

## Fréquence recommandée

| Quand | Action |
|-------|--------|
| **Quotidien** | Backup automatique (cron/systemd) |
| **Avant migration** | `npm run db:backup` manuel |
| **Avant déploiement** | `npm run db:backup` manuel |
| **Hebdomadaire** | `npm run db:backup:verify` pour vérifier l'intégrité |

## Planification automatique

### Option A — Cron (recommandé avec PM2)

```bash
# Éditer crontab
crontab -e

# Backup quotidien à 03:00 UTC + log
0 3 * * * cd /home/deploy/avis-doctolib && /usr/bin/node scripts/db-backup.js >> logs/db-backup.log 2>&1
```

### Option B — Systemd Timer

```ini
# /etc/systemd/system/reputy-backup.service
[Unit]
Description=Reputy SQLite Backup
After=network.target

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/home/deploy/avis-doctolib
ExecStart=/usr/bin/node scripts/db-backup.js
Environment=NODE_ENV=production

# /etc/systemd/system/reputy-backup.timer
[Unit]
Description=Reputy daily backup timer

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now reputy-backup.timer
sudo systemctl list-timers | grep reputy
```

### Option C — PM2 cron (alternative)

```javascript
// Dans ecosystem.config.cjs, ajouter un second app :
{
  name: 'reputy-backup',
  script: 'scripts/db-backup.js',
  cron_restart: '0 3 * * *',
  autorestart: false,
  watch: false,
}
```

> ⚠️ PM2 `cron_restart` relance l'app à l'heure cron. Avec `autorestart: false`,
> le script tourne une fois à 03:00 puis s'arrête. C'est fonctionnel mais moins
> élégant qu'un vrai cron/systemd timer.

## Stockage des backups

- ❌ **Ne PAS stocker dans un conteneur éphémère** (Docker sans volume)
- ✅ **Recommandé** : volume persistant monté (`/mnt/backups`, EBS, NFS…)
- 💡 **Bonus** : synchro vers S3/GCS/B2 avec `rclone` ou `aws s3 sync` après le backup
- Le dossier `backups/` est dans `.gitignore`

## Arborescence

```
avis-doctolib/
├── scripts/
│   ├── db-backup.js          ← Backup WAL-safe + rotation
│   ├── db-restore.js         ← Restore + vérification
│   ├── db-backup-verify.js   ← Inventaire des backups
│   └── check-no-secrets.js   ← (existant) Guard P0.1
├── backups/                   ← Dossier auto-créé (gitignored)
│   ├── reputy-20260210030000.db
│   ├── reputy-20260209030000.db
│   └── ...
├── OPS.md                     ← Ce fichier
└── ecosystem.config.cjs       ← Config PM2
```

## Commandes npm

| Commande | Description |
|----------|-------------|
| `npm run db:backup` | Backup WAL-safe + rotation |
| `npm run db:restore -- <fichier>` | Restore depuis un backup |
| `npm run db:backup:verify` | Lister les backups + intégrité |

---

# 🔑 P5 — Retrait progressif de `validateAuth` (legacy global token)

## Contexte

`validateAuth(req)` est l'ancien mécanisme d'auth backend : un token global
`CABINET_API_TOKEN` partagé entre l'extension et le admin dashboard. Il a été
remplacé par deux mécanismes plus sécurisés :

- **JWT session (org-scoped)** via `getAuthUser(req, data)` — pour les utilisateurs dashboard
- **`requireAdmin(req)`** via `x-admin-token` — pour le backoffice super-admin (constant-time)

`validateAuth` est conservé temporairement en fallback sur 6 routes, mais
instrumenté et contrôlable par kill-switch.

## Routes encore legacy

| Route | Méthode | Type | Handler |
|-------|---------|------|---------|
| `/api/feedbacks` | GET | read | `handleGetFeedbacks` |
| `/api/requests` | GET | read (PII) | `handleGetRequests` |
| `/api/settings` | GET | read | `handleGetSettings` |
| `/api/settings` | POST | write | `handleSaveSettings` |
| `/api/settings/review-routing` | GET | read | `handleGetReviewRouting` |
| `/api/settings/review-routing` | PUT | write | `handleSaveReviewRouting` |

> **Toutes** ces routes ont le pattern : JWT d'abord → legacy en fallback.
> En mode JWT, les données sont **toujours org-scopées**.
> En mode legacy, les données sont **globales** (pas de filtre org).

## Instrumentation

`legacyAuth(req, routeName)` remplace `validateAuth(req)` sur tous les call-sites.

Il fait :
- Compteur en mémoire par route (reset au restart PM2)
- Log `WARN` rate-limité (1 par minute max) avec : route, IP, UA, totalHits
- **Ne log jamais le token**

### Monitoring via endpoint admin

```bash
curl -H "x-admin-token: $INTERNAL_ADMIN_TOKEN" \
  http://localhost:8787/internal/admin/legacy-auth-stats
```

Réponse :
```json
{
  "totalHits": 42,
  "topRoutes": [
    { "route": "/api/feedbacks", "count": 30 },
    { "route": "/api/settings:GET", "count": 12 }
  ],
  "disabled": false
}
```

## Kill-switch : `DISABLE_LEGACY_AUTH`

| Valeur | Comportement |
|--------|-------------|
| `0` (défaut) | `legacyAuth()` fonctionne normalement (instrumenté) |
| `1` | `legacyAuth()` retourne toujours `{ ok: false, error: "legacy_auth_disabled" }` → 401 |

### Changement : nécessite un restart PM2

```bash
# Activer le kill-switch
pm2 set DISABLE_LEGACY_AUTH 1
# OU modifier .env et restart :
pm2 restart reputy-backend
```

## Plan de migration (3 phases)

### Phase 1 — Monitoring (en cours)

1. Déployer avec `DISABLE_LEGACY_AUTH=0`
2. Surveiller 24–48h via `/internal/admin/legacy-auth-stats`
3. Identifier les call-sites qui utilisent encore le legacy token
4. Si `totalHits > 0` : migrer les call-sites vers JWT ou admin token

### Phase 2 — Coupure

1. Confirmer `totalHits = 0` stable sur 24h
2. Passer `DISABLE_LEGACY_AUTH=1`
3. Restart PM2 : `pm2 restart reputy-backend`
4. Surveiller les erreurs 401 pendant 24–48h
5. Si aucun incident : continuer vers Phase 3

### Phase 3 — Suppression

1. Supprimer `legacyAuth()`, `validateAuth()`, et les compteurs associés
2. Supprimer les branches legacy dans les 6 handlers
3. Supprimer `DISABLE_LEGACY_AUTH` de `env.example`
4. Optionnel : supprimer `CABINET_API_TOKEN` du backend si plus aucun usage
   (l'extension utilise `validateExtensionAuth` avec publicKey+apiToken org-scoped)

## Changements P5 effectués

- ✅ `requireAdmin()` utilise `safeTokenCompare()` (constant-time)
- ✅ `legacyAuth()` instrumenté avec compteurs + logs rate-limités
- ✅ Kill-switch `DISABLE_LEGACY_AUTH` (lu à chaque appel)
- ✅ Nouvel endpoint `/internal/admin/feedbacks` (admin-only, `Cache-Control: no-store`)
- ✅ Nouvel endpoint `/internal/admin/legacy-auth-stats` (monitoring)
- ✅ `fetch-feedbacks.ts` migré vers `fetchInternal('/internal/admin/feedbacks')`
- ✅ `CABINET_API_TOKEN` supprimé du reputy-admin (0 référence)
- ✅ `feedback.repo.js` : ajout `listAll()` pour l'endpoint admin
- ✅ `DISABLE_LEGACY_AUTH=0` ajouté dans `env.example`
