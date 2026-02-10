# P0.7 — Email Deliverability Monitoring & Alerting

## Objectif

Fournir une visibilité admin sur la délivrabilité des emails :
- Stats globales et par org (sent, delivered, bounce, complaint, click)
- Détection automatique d'anomalies (taux complaint/bounce, webhook silence, warming trop long)
- Endpoints JSON exploitables pour un futur backoffice

**Aucune migration DB** — utilise les tables existantes `email_outbox`, `email_events`, `webhook_events`.

---

## Endpoints Admin

Tous les endpoints nécessitent le header `x-internal-admin-token` (ou `x-admin-token`).

### 1. GET /api/email/admin/health

Dashboard global de délivrabilité.

**Paramètres :**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `window` | `24h\|7d\|30d` | `7d` | Fenêtre temporelle |
| `include` | CSV | `topRisk,lastWebhook` | Sections à inclure. Valeurs: `topRisk`, `lastWebhook`, `alerts` |
| `limit` | int | `20` | Max orgs dans topRisk (max 100) |

> **Note** : `alerts` n'est PAS inclus par défaut (coûteux). Ajouter `include=topRisk,lastWebhook,alerts`.

**Exemple :**
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/health?window=7d" \
  -H "x-internal-admin-token: super-admin-secret"
```

**Réponse :**
```json
{
  "ok": true,
  "window": "7d",
  "sinceISO": "2026-02-02T15:00:00.000Z",
  "global": {
    "sentCount": 150,
    "deliveredCount": 140,
    "bounceCount": 5,
    "complaintCount": 0,
    "clickCount": 30,
    "pendingCount": 3,
    "failedCount": 2,
    "bounceRate": 0.033333,
    "complaintRate": 0,
    "deliveryRate": 0.933333,
    "clickRate": 0.2
  },
  "lastSesWebhook": {
    "lastSeenAt": "2026-02-09T14:00:00.000Z",
    "hoursSince": 2.5
  },
  "topRiskOrgs": [...]
}
```

### 2. GET /api/email/admin/org-stats

Stats détaillées d'une org + état warm-up.

**Paramètres :**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `org_id` | string | ✅ | ID de l'org |
| `window` | `24h\|7d\|30d` | Non (default `7d`) | Fenêtre |

**Exemple :**
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/org-stats?org_id=b1d90a236338cb931b6e6688&window=7d" \
  -H "x-internal-admin-token: super-admin-secret"
```

**Réponse :**
```json
{
  "ok": true,
  "orgId": "b1d90a236338cb931b6e6688",
  "orgName": "Centre medico dentaire cesson",
  "plan": "health_platinum",
  "window": "7d",
  "stats": {
    "sentCount": 45,
    "deliveredCount": 42,
    "bounceCount": 2,
    "complaintCount": 0,
    "clickCount": 10,
    "bounceRate": 0.044444,
    "complaintRate": 0,
    "deliveryRate": 0.933333,
    "clickRate": 0.222222
  },
  "warmupState": { "status": "warm", "day": null, "limits": null }
}
```

### 3. GET /api/email/admin/alerts

Calcule et retourne les alertes à la demande.

**Paramètres :**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `window` | `24h\|7d\|30d` | `7d` | Fenêtre pour l'analyse |

**Exemple :**
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/alerts?window=7d" \
  -H "x-internal-admin-token: super-admin-secret"
```

**Réponse :**
```json
{
  "ok": true,
  "window": "7d",
  "alertCount": 2,
  "alerts": [
    {
      "id": "complaint_red_org1",
      "severity": "red",
      "type": "ORG_COMPLAINT_RATE",
      "message": "Org1: complaint rate 0.150% dépasse le seuil critique (0.10%)",
      "orgId": "org1",
      "meta": { "complaintRate": 0.0015, "complaints": 3, "sent": 2000, "threshold": 0.001 }
    },
    {
      "id": "webhook_silence_orange",
      "severity": "orange",
      "type": "GLOBAL_WEBHOOK_SILENCE",
      "message": "Dernier webhook SES reçu il y a 14.3h (> 12h). À surveiller.",
      "meta": { "lastSeenAt": "...", "hoursSince": 14.3, "sent24h": 5, "threshold": 12 }
    }
  ]
}
```

### 4. GET /api/email/admin/webhooks/last-seen

Dernier webhook SES reçu.

```bash
curl -s "http://127.0.0.1:8787/api/email/admin/webhooks/last-seen" \
  -H "x-internal-admin-token: super-admin-secret"
```

```json
{
  "ok": true,
  "provider": "ses",
  "lastSeenAt": "2026-02-09T14:00:00.000Z",
  "hoursSince": 2.5
}
```

---

## Seuils d'alerte

| Alerte | Orange | Red |
|--------|--------|-----|
| Complaint rate (par org) | ≥ 0.05% | ≥ 0.1% |
| Bounce rate (par org) | ≥ 2% | ≥ 5% |
| Webhook silence (global) | ≥ 12h | ≥ 24h |
| Warming trop long (par org) | ≥ 10 jours | — |

**Notes importantes :**
- **Webhook silence** : alerte uniquement si `sentCount 24h > 0` (pas d'alerte en mode inactif).
- **Delivery rate** : best-effort, pas d'alerte basée dessus (SES ne renvoie pas toujours les delivery events).
- Les seuils sont définis en constantes dans `lib/email/monitoring.js` (`ALERT_THRESHOLDS`).

---

## Comment vérifier que les webhooks SES arrivent

1. **Via endpoint** :
   ```bash
   curl -s "http://127.0.0.1:8787/api/email/admin/webhooks/last-seen" \
     -H "x-internal-admin-token: super-admin-secret"
   ```
   → `hoursSince` devrait être < 24h si des emails sont envoyés.

2. **Via DB** :
   ```sql
   SELECT MAX(created_at) as last, COUNT(*) as total
   FROM webhook_events WHERE provider='ses';
   ```

3. **En production** : si `lastSeenAt = null` et que des emails partent → la config SNS/SES est incomplète.

---

## Interpréter les taux

| Taux | Bon | Attention | Critique |
|------|-----|-----------|----------|
| **Complaint** | < 0.05% | 0.05% - 0.1% | > 0.1% (risque suspension SES) |
| **Bounce** | < 2% | 2% - 5% | > 5% (qualité de la liste) |
| **Delivery** | > 95% | — | — (best-effort, pas d'alerte) |
| **Click** | variable | — | — (indicateur engagement uniquement) |

> ⚠️ **SES suspend les comptes à ~0.1% complaint rate**. C'est le taux le plus critique à surveiller.

---

## Performance

- Les queries utilisent les index existants (`idx_outbox_org_status`, `idx_email_events_type`, `idx_email_events_outbox`).
- `getTopRiskOrgs` fait une seule query agrégée + N lookups org (limité par `limit`, default 20).
- Les alertes (`computeAlerts`) scannent toutes les orgs pour `WARMING_TOO_LONG` — acceptable car le nombre d'orgs est faible.
- **Recommandation** : ne pas appeler `/health?include=alerts` plus de quelques fois par minute.
