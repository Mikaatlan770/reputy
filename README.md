# Monorepo Reputy

Plateforme de gestion de la réputation en ligne pour professionnels de santé et commerces.

## 📁 Structure du monorepo

```
apps/
├── backend/        # API Node.js (collecte, feedback, settings)
├── reputy-admin/   # Dashboard Next.js (gestion des avis)
├── reputy-web/     # Site vitrine Next.js (marketing, auth)
└── extension/      # Extension Chrome pour Doctolib

packages/           # Packages partagés (types, utils) - vide pour l'instant
```

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+ (recommandé 20+)
- npm ou yarn
- Chrome (pour l'extension)

### Installation complète

```bash
# Installer toutes les dépendances
npm run install:all

# Ou manuellement :
npm install
cd apps/backend && npm install
cd ../reputy-admin && npm install
cd ../reputy-web && npm install
```

### Lancer les applications

```bash
# Backend (API) - Port 8787
npm run dev:backend

# Dashboard Client (reputy-admin) - Port 3002
npm run dev:admin

# Site Vitrine (reputy-web) - Port 3001
npm run dev:web

# Tout lancer en parallèle (nécessite concurrently)
npm run dev:all
```

### Ports par défaut

| Application | Port | URL |
|-------------|------|-----|
| Backend API | 8787 | http://localhost:8787 |
| reputy-web (vitrine) | 3001 | http://localhost:3001 |
| reputy-admin (dashboard) | 3002 | http://localhost:3002 |

## 📦 Applications

### Backend (`apps/backend`)

API Node.js pour la collecte et gestion des avis.

#### Endpoints publics (API Token)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/api/send-review-request` | POST | Créer une demande d'avis |
| `/api/feedbacks` | GET | Liste des feedbacks |
| `/api/requests` | GET | Historique des envois |
| `/api/settings` | GET/POST | Settings généraux |
| `/api/settings/review-routing` | GET/PUT | Config routing des avis |
| `/r/:id` | GET | Page de notation patient |
| `/r/:id` | POST | Soumettre un feedback |
| `/telemetry/extension` | POST | Logs depuis l'extension |

#### Endpoints internes (Super Admin Token)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/internal/orgs` | GET | Liste tous les clients |
| `/internal/orgs` | POST | Créer un client |
| `/internal/orgs/:orgId` | GET | Détail d'un client |
| `/internal/orgs/:orgId` | PUT | Modifier un client |
| `/internal/orgs/:orgId/credits` | POST | Ajouter des crédits SMS/Email |
| `/internal/orgs/:orgId/status` | POST | Changer le statut (active/suspended/cancelled) |
| `/internal/orgs/:orgId/usage` | GET | Historique d'usage |
| `/internal/orgs/:orgId/telemetry` | GET | Logs et erreurs |

**Variables d'environnement :**
```env
PORT=8787
REVIEWS_BASE_URL=http://localhost:8787

# === SECRETS (voir section Sécurité ci-dessous) ===
CABINET_API_TOKEN=dev-token              # Token extension (DEV only)
INTERNAL_ADMIN_TOKEN=super-admin-secret  # Token backoffice (DEV only)
JWT_SECRET=your-jwt-secret               # Secret JWT sessions
ADMIN_COOKIE_SECRET=your-cookie-secret   # Secret cookie admin
```

> ⚠️ **Important**: En production (`NODE_ENV=production`), les fallbacks DEV sont **interdits**. Voir la section [Sécurité - Secrets](#-secrets-production) pour les exigences de production.

### Dashboard Admin (`apps/reputy-admin`)

Interface de gestion des avis et feedbacks.

```bash
cd apps/reputy-admin
npm run dev    # http://localhost:3000
```

**Variables d'environnement :**
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
NEXT_PUBLIC_API_TOKEN=dev-token

# Pour le backoffice Super Admin (ne pas exposer au client!)
BACKEND_URL=http://localhost:8787
INTERNAL_ADMIN_TOKEN=super-admin-secret
```

#### Backoffice Super Admin

Accessible via `/internal/login` pour gérer tous les clients Reputy.

| Page | Description |
|------|-------------|
| `/internal/login` | Authentification par token |
| `/internal/clients` | Liste de tous les clients |
| `/internal/clients/[orgId]` | Détail client (plan, quotas, options, usage, telemetry) |

**Fonctionnalités :**
- Créer/modifier des clients
- Définir des conditions commerciales négociées
- Ajouter des crédits SMS/Email
- Activer/désactiver des options
- Suspendre/réactiver des comptes
- Voir l'usage et les erreurs

### Site Vitrine (`apps/reputy-web`)

Site marketing avec pages : Home, Features, Pricing, Login, Signup, Legal.

```bash
cd apps/reputy-web
npm run dev    # http://localhost:3001
```

**Variables d'environnement :**
```env
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
```

### Extension Chrome (`apps/extension`)

Extension pour Doctolib permettant d'envoyer des demandes d'avis en 1 clic.

1. Ouvrir `chrome://extensions`
2. Activer le "Mode développeur"
3. "Charger l'extension non empaquetée" → `apps/extension/`
4. Configurer via les Options de l'extension

## ⚙️ Feature: Review Routing

Le système de **Review Routing** permet de configurer le comportement de redirection des patients :

### Configuration

Dans le dashboard (`/settings`), section "Routing des avis" :

- **enabled** : Active/désactive le routing
- **threshold** : Seuil minimum (1-5 étoiles) pour redirection
- **publicTarget** : Plateforme cible (`DOCTOLIB` ou `GOOGLE`)

### Comportement

| Condition | Action |
|-----------|--------|
| `enabled = false` | Tout va en feedback interne |
| `rating >= threshold` | Redirection vers avis public (Google) |
| `rating < threshold` | Feedback interne uniquement |

### API

```bash
# Récupérer la config
GET /api/settings/review-routing
Authorization: Bearer <token>

# Mettre à jour
PUT /api/settings/review-routing
Content-Type: application/json
Authorization: Bearer <token>

{
  "enabled": true,
  "threshold": 4,
  "publicTarget": "GOOGLE"
}
```

## 📝 Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run dev:backend` | Lance le backend |
| `npm run start:backend` | Backend en mode production |
| `npm run dev:admin` | Lance le dashboard |
| `npm run build:admin` | Build le dashboard |
| `npm run dev:web` | Lance le site vitrine |
| `npm run build:web` | Build le site vitrine |
| `npm run install:all` | Installe toutes les dépendances |
| `npm run clean` | Nettoie node_modules, .next, dist, .turbo |
| `npm run pack:safe` | Génère un zip propre (sans artefacts) |

## 📦 Packaging / Repo Hygiene

### Pourquoi nettoyer avant de partager ?

Les dossiers suivants ne doivent **jamais** être partagés ou versionnés :

| Dossier | Raison |
|---------|--------|
| `node_modules/` | Dépendances lourdes, reconstruites via `npm install` |
| `.next/` | Build cache Next.js, spécifique à la machine |
| `out/` | Export statique Next.js |
| `dist/` | Build outputs |
| `.turbo/` | Cache Turborepo |
| `.env*` | Secrets et configuration locale |

### Nettoyer le repo

```bash
npm run clean
```

Supprime tous les artefacts de build et dépendances dans le monorepo.

### Générer un zip propre

```bash
npm run pack:safe
```

Crée `reputy-clean.zip` contenant uniquement le code source :
- ✅ Inclut : code, `package.json`, `package-lock.json`, README
- ❌ Exclut : `node_modules/`, `.next/`, `.git/`, `.env*`, `*.log`

> ⚠️ **Important** : `package-lock.json` est **versionné** (npm). Les autres lock files (`pnpm-lock.yaml`, `yarn.lock`) sont ignorés.

### Reconstruire après réception d'un zip

```bash
unzip reputy-clean.zip -d reputy
cd reputy
npm run install:all
npm run dev:all
```

## 🔒 Sécurité

### 🔐 Secrets (Production)

En mode **production** (`NODE_ENV=production`), le serveur backend **refuse de démarrer** si les secrets ne sont pas correctement configurés.

#### Variables requises

| Variable | Description | Fallback DEV (interdit en prod) |
|----------|-------------|--------------------------------|
| `INTERNAL_ADMIN_TOKEN` | Token API super-admin | `super-admin-secret` |
| `JWT_SECRET` | Secret signature sessions client | `reputy-mvp-secret-change-in-production` |
| `CABINET_API_TOKEN` | Token API extension Chrome | `dev-token` |
| `ADMIN_COOKIE_SECRET` | Secret HMAC cookie admin UI | `dev-admin-cookie-secret` |

#### Règles de validation

1. **En développement** : Les fallbacks sont acceptés pour faciliter le setup local
2. **En production** :
   - Toutes les variables doivent être définies explicitement
   - Aucune ne peut utiliser sa valeur de fallback DEV
   - Le serveur crashe immédiatement avec un message explicite si non respecté

#### Exemple `.env.production`

```env
NODE_ENV=production
PORT=8787

# SECRETS (générer des valeurs aléatoires uniques !)
INTERNAL_ADMIN_TOKEN=your-secure-random-token-32-chars-min
JWT_SECRET=another-secure-random-secret-for-jwt
CABINET_API_TOKEN=extension-api-token-unique
ADMIN_COOKIE_SECRET=hmac-cookie-signing-secret

REVIEWS_BASE_URL=https://api.reputy.fr
```

#### Génération de secrets sécurisés

```bash
# Générer un secret aléatoire (32 bytes en hex = 64 chars)
openssl rand -hex 32

# Ou avec Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 🚦 Rate Limiting (P0.4)

Protection anti brute-force sur les endpoints d'authentification.

| Endpoint | Limite PROD | Limite DEV |
|----------|-------------|------------|
| `POST /auth/login` | 5 req/min/IP | 1000 req/min/IP |
| `POST /auth/verify` | 5 req/min/IP | 1000 req/min/IP |
| `POST /auth/resend-code` | 5 req/min/IP | 1000 req/min/IP |

**Réponse si bloqué (429)** :
```json
{
  "ok": false,
  "error": "RATE_LIMITED",
  "message": "Too many attempts. Try again later.",
  "retryAfterSec": 45
}
```

**Headers** :
- `Retry-After: <seconds>` indique quand réessayer

**Logs** (JSON) :
```json
{
  "type": "RATE_LIMIT_BLOCKED",
  "timestamp": "2026-01-19T...",
  "ip": "192.168.1.1",
  "route": "/auth/login",
  "retryAfterSec": 45
}
```

### Autres protections

- **Anti-doublon** : Clé d'idempotence SHA256 pour éviter les demandes dupliquées
- **Expiration** : Les liens de feedback expirent après 30 jours
- **409 Conflict** : Protection contre les doubles soumissions de feedback
- **localStorage** : Protection côté client contre les doubles clics

## 📚 Documentation technique

### Modèle de données multi-tenant

Le système supporte plusieurs clients (orgs) avec le schéma suivant dans `data.json` :

```json
{
  "orgs": [{
    "id": "string",
    "name": "string",
    "vertical": "health|food|business",
    "status": "active|suspended|cancelled",
    "billing": { "provider": "none|stripe|gocardless" },
    "plan": { "code": "string", "basePriceCents": 4900, "billingCycle": "monthly" },
    "negotiated": { "enabled": false, "customPriceCents": null, "discountPercent": null },
    "options": { "reviewRouting": true, "widgetsSeo": false, "multiLocations": false },
    "quotas": { "smsIncluded": 50, "emailIncluded": 50 },
    "balances": { "smsExtra": 0, "emailExtra": 0 }
  }],
  "usageLedger": [{ "id", "orgId", "type": "sms|email", "qty", "ts", "meta" }],
  "telemetry": [{ "id", "orgId", "source", "level", "message", "ts" }]
}
```

### Quotas par défaut par plan

| Plan | SMS/mois | Email/mois |
|------|----------|------------|
| health_basic | 50 | 50 |
| health_pro | 200 | 200 |
| food_basic | 100 | 100 |
| business_basic | 30 | 200 |

### Index uniques pour migration DB future

```sql
-- Empêche les doubles envois de demandes d'avis
CREATE UNIQUE INDEX idx_requests_idempotency ON requests(idempotency_key);

-- Empêche les doubles soumissions de feedback
CREATE UNIQUE INDEX idx_feedbacks_request_id ON feedbacks(request_id);

-- Index pour orgs
CREATE UNIQUE INDEX idx_orgs_id ON orgs(id);
CREATE INDEX idx_usage_orgId ON usageLedger(orgId);
CREATE INDEX idx_telemetry_orgId ON telemetry(orgId);
```

### Clé d'idempotence

Format : `SHA256(channel|phone|email|appointmentDate|locationId)`

## 🛠️ TODO / Roadmap

- [ ] Authentification réelle (OAuth, magic link)
- [ ] Base de données (PostgreSQL/MongoDB)
- [ ] Intégration Stripe pour les paiements
- [ ] API Doctolib officielle (quand disponible)
- [ ] Notifications push/email
- [ ] Multi-langue (i18n)

## 📄 Licence

Propriétaire - Reputy SAS

