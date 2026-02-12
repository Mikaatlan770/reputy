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

## 🔍 Monitoring externe (P1.1)

### Endpoints de santé

| Endpoint | Auth | Usage |
|----------|------|-------|
| `GET /health` | Aucune | Ping basique (load-balancer, PM2, Docker) |
| `GET /internal/admin/health` | `x-admin-token` | Health check riche (monitoring profond) |

### Health check riche — `/internal/admin/health`

Retourne un JSON avec :
- **status** : `ok` / `degraded` / `503 error`
- **db** : WAL mode, foreign keys, integrity check, latency
- **backups** : dernier backup, nombre sur 24h
- **process** : mémoire RSS/heap, uptime

#### Exemple curl

```bash
curl -s -H "x-admin-token: $INTERNAL_ADMIN_TOKEN" \
  http://localhost:8787/internal/admin/health | jq .
```

#### Réponse type (status: ok)

```json
{
  "status": "ok",
  "version": "0.7.0",
  "uptime_seconds": 86400,
  "node": { "version": "v20.11.0" },
  "storage": { "mode": "sqlite" },
  "db": {
    "status": "ok",
    "wal_mode": true,
    "foreign_keys": true,
    "integrity_ok": true,
    "latency_ms": 0
  },
  "backups": {
    "last_backup_utc": "2026-02-11T10:00:00.000Z",
    "count_24h": 4,
    "dir": "backups"
  },
  "process": {
    "rss_mb": 85.2,
    "heap_used_mb": 42.1,
    "heap_total_mb": 68.5,
    "uptime_seconds": 86400,
    "event_loop_lag_ms": null
  }
}
```

#### Codes HTTP

| Code | Signification |
|------|--------------|
| 200 | `ok` ou `degraded` (système fonctionnel) |
| 503 | `error` (DB inaccessible ou intégrité KO) |
| 401 | Token admin manquant ou invalide |

#### Logique de status

- **ok** : DB OK + integrity OK + ≥1 backup en 24h + WAL + FK
- **degraded** : DB OK mais backup absent, WAL inactif ou FK désactivées
- **error** : DB inaccessible ou integrity_check échoué

### Configuration UptimeRobot / BetterStack

1. **Ping basique** : `GET http://votre-domaine:8787/health` — pas de headers
2. **Deep check** : `GET http://votre-domaine:8787/internal/admin/health`
   - Header : `x-admin-token: <votre token>`
   - Attendu : HTTP 200, body contient `"status":"ok"`
   - Alerte si : HTTP ≠ 200 **ou** body contient `"status":"error"`
3. Fréquence recommandée : **toutes les 2–5 minutes**

## 📊 P1.2 — Metrics Admin (Business Observability)

### Endpoint

```
GET /internal/admin/metrics
GET /internal/admin/metrics?since=7d
GET /internal/admin/metrics?since=90d
```

Protégé par `x-admin-token`. Toujours HTTP 200 (même partiellement vide).

### Paramètre `since`

| Valeur | Description |
|--------|-------------|
| `7d` | 7 derniers jours |
| `30d` | 30 derniers jours (défaut) |
| `90d` | 90 derniers jours |

### Exemple curl

```bash
curl -s -H "x-admin-token: $INTERNAL_ADMIN_TOKEN" \
  http://localhost:8787/internal/admin/metrics?since=30d | jq .
```

### Réponse type

```json
{
  "generated_at_utc": "2026-02-11T12:00:00.000Z",
  "period": { "since": "2026-01-12T00:00:00.000Z", "days": 30 },
  "orgs": { "total": 16, "active": 14 },
  "usage": { "emails_sent": 842, "sms_sent": 120, "ai_used": 45 },
  "feedback": { "total": 15, "in_period": 8 },
  "requests": { "total": 67, "in_period": 32 }
}
```

### Migration requise

Avant la première utilisation en production, appliquer la migration 006 pour les index de performance :

```bash
cd /chemin/vers/repo && npm run db:migrate-v2
```

Cela crée les index `idx_usage_created`, `idx_feedbacks_created`, `idx_rr_created` sur les colonnes `created_at`.

---

# 📈 P2 — MRR Snapshots (Revenue History)

## Vue d'ensemble

Le script `snapshot-mrr.js` calcule un snapshot quotidien de la MRR et le persiste dans
la table `mrr_snapshots` (une row par jour UTC). Le snapshot est **idempotent** :
relancer le script le même jour écrase la row existante.

La logique de calcul (MRR, tiers, négocié) est **identique** à celle de
`GET /internal/admin/metrics` (mêmes expressions SQL `CASE/json_extract`).

## Table `mrr_snapshots`

| Colonne | Type | Description |
|---------|------|-------------|
| `snapshot_date` | TEXT PK | `YYYY-MM-DD` (UTC) |
| `mrr_total_cents` | INTEGER | MRR totale en centimes |
| `orgs_paid` | INTEGER | Nombre d'orgs payantes |
| `orgs_free` | INTEGER | Nombre d'orgs gratuites |
| `arpu_cents` | INTEGER | ARPU en centimes |
| `mrr_by_tier_json` | TEXT | JSON `{ bronze, argent, gold, platinum, custom }` |
| `negotiated_orgs` | INTEGER | Orgs avec tarif négocié |
| `negotiated_percent` | REAL | % d'orgs payantes négociées |

## Exécution manuelle

```bash
# Depuis apps/backend/
npm run snapshot:mrr          # Calcule et persiste le snapshot du jour
npm run snapshot:mrr:dry      # Calcule sans écrire (preview)
```

## Vérification

```bash
# Vérifier les snapshots enregistrés
sqlite3 -header -column apps/backend/reputy.db \
  "SELECT * FROM mrr_snapshots ORDER BY snapshot_date DESC LIMIT 10;"

# Vérifier via l'API admin
curl -s -H "x-admin-token: $INTERNAL_ADMIN_TOKEN" \
  http://localhost:8787/internal/admin/mrr-history?days=30 | jq .
```

## Planification automatique (PM2)

Le process `snapshot-mrr` est configuré dans `ecosystem.config.cjs` :
- **Heure** : 00:05 UTC quotidien (`cron_restart: '5 0 * * *'`)
- **Mode** : `autorestart: false` → tourne une fois puis s'arrête

```bash
# Vérifier le statut
pm2 list
pm2 logs snapshot-mrr --lines 20
```

## Endpoint API

```
GET /internal/admin/mrr-history?days=90
```

- Auth : `x-admin-token` (requireAdmin)
- `days` : 1–365 (défaut 90)
- Retourne les snapshots en snake_case, cohérent avec `/internal/admin/metrics`

---

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
