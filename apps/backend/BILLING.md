# Reputy Billing System

## Vue d'ensemble

Le système de facturation Reputy gère les abonnements et paiements pour les forfaits :
- **Pack Bronze** : Essai gratuit 7 jours (pas de CB requise)
- **Pack Argent** : 59€ HT/mois
- **Pack Or** : 99€ HT/mois

## Providers supportés

### Stripe (Carte Bancaire)
- Checkout Sessions pour les nouveaux abonnements
- Customer Portal pour la gestion des moyens de paiement
- Webhooks pour les événements de paiement

### GoCardless (SEPA)
- **Status**: Stub implémenté, non fonctionnel en V1
- Mandate Flows pour les prélèvements SEPA
- À implémenter en V1.1

## Configuration

### Variables d'environnement requises

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_SILVER=price_...   # Pack Argent
STRIPE_PRICE_ID_GOLD=price_...     # Pack Or

# Optionnel
REPUTY_DOMAIN=https://reputyapp.com
SUPPORT_BILLING_EMAIL=support@reputyapp.com
```

### Configuration Stripe

1. **Créer les produits** dans [Stripe Dashboard](https://dashboard.stripe.com/products)
   - Produit "Pack Argent" avec prix récurrent 5900 EUR/mois
   - Produit "Pack Or" avec prix récurrent 9900 EUR/mois

2. **Copier les Price IDs** dans les variables d'environnement

3. **Configurer le webhook** dans Stripe Dashboard > Developers > Webhooks
   - URL: `https://api.reputyapp.com/webhooks/stripe`
   - Événements à écouter:
     - `checkout.session.completed`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`

4. **Copier le Webhook Secret** dans `STRIPE_WEBHOOK_SECRET`

## Endpoints API

### Client (authentifié)

```
GET  /client/billing/status     # Statut facturation + quotas
POST /client/billing/checkout   # Créer session Stripe Checkout
POST /client/billing/portal     # Accéder au portail Stripe
POST /client/billing/sepa       # Créer mandat SEPA (stub)
```

### Webhooks (signature vérifiée)

```
POST /webhooks/stripe      # Événements Stripe
POST /webhooks/gocardless  # Événements GoCardless (stub)
```

## Test local avec Stripe CLI

### Installation

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Ou télécharger depuis https://stripe.com/docs/stripe-cli
```

### Forward des webhooks

```bash
# Login
stripe login

# Forward vers backend local
stripe listen --forward-to http://localhost:8787/webhooks/stripe

# Copier le webhook secret affiché (whsec_...)
export STRIPE_WEBHOOK_SECRET=whsec_...

# Lancer le backend
USE_SQLITE=1 node server.js
```

### Test d'événements

```bash
# Simuler un checkout réussi
stripe trigger checkout.session.completed

# Simuler un paiement réussi
stripe trigger invoice.paid

# Simuler un échec de paiement
stripe trigger invoice.payment_failed

# Simuler une annulation
stripe trigger customer.subscription.deleted
```

## State Machine

Le système utilise une machine d'état pour gérer l'accès :

```
trial → active → past_due → read_only
                     ↓
                cancelled
```

### États

| État | Description | Accès |
|------|-------------|-------|
| `trial` | Essai gratuit 7 jours | Complet |
| `active` | Abonnement actif | Complet |
| `past_due` | Paiement en échec (grâce 7j) | Complet avec warning |
| `read_only` | Après 7j past_due | Lecture seule |
| `cancelled` | Abonnement résilié | Lecture seule |

### Actions par état

| Action | trial | active | past_due | read_only | cancelled |
|--------|-------|--------|----------|-----------|-----------|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| SMS/Email | ✓ | ✓ | ✓ | ✗ | ✗ |
| IA | ✓ | ✓ | ✓ | ✗ | ✗ |
| QR/NFC | ✓ | ✓ | ✓ | ✗ | ✗ |
| Settings | ✓ | ✓ | ✓ | ✗ | ✗ |

## Dunning (Relances)

En cas d'échec de paiement :

| Jour | Action |
|------|--------|
| J0 | Email de relance #1 |
| J3 | Email de relance #2 |
| J6 | Email de relance finale |
| J7 | Passage en `read_only` |

Le state dunning est stocké dans `org.options.dunning`.

## Idempotence Webhooks

Les événements sont stockés dans la table `webhook_events` :

```sql
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,        -- event.id Stripe/GC
  provider TEXT NOT NULL,     -- 'stripe' | 'gocardless'
  event_type TEXT NOT NULL,
  org_id TEXT,
  payload_json TEXT,
  created_at TEXT,
  processed_at TEXT           -- NULL = pas encore traité
);
```

Chaque événement n'est traité qu'une seule fois.

## Exemples curl

### Statut billing

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/client/billing/status
```

### Créer checkout

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"argent","provider":"stripe"}' \
  http://localhost:8787/client/billing/checkout
```

### Portail Stripe

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/client/billing/portal
```

## Fichiers

```
lib/billing/
├── stripe.js           # Module Stripe
├── gocardless.js       # Module GoCardless (stub)
├── dunning.js          # Système de relances
├── state-machine.js    # Machine d'état (existant)
└── webhook-events.repo.js  # Repository idempotence

emails/
└── billing-templates.js    # Templates emails FR

lib/migrations/
└── 002_add_webhook_events.sql  # Table idempotence
```

## TODO V1.1

- [ ] Implémentation complète GoCardless SEPA
- [ ] Envoi réel des emails (nodemailer)
- [ ] Cron job automatisé pour dunning
- [ ] Factures PDF
- [ ] Multi-devise (EUR par défaut)
