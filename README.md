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

# Dashboard Admin - Port 3000
npm run dev:admin

# Site Vitrine - Port 3001
npm run dev:web

# Tout lancer en parallèle (nécessite concurrently)
npm run dev:all
```

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
CABINET_API_TOKEN=dev-token
REVIEWS_BASE_URL=http://localhost:8787
INTERNAL_ADMIN_TOKEN=super-admin-secret  # Token pour le backoffice
```

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

## 🔒 Sécurité

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

