# Email Runbook — Reputy P0.8

Guide opérationnel pour réagir aux alertes email de Reputy.

---

## 🔴 Alertes RED — Action immédiate

### 1. ORG_COMPLAINT_RATE ≥ 0.1%

**Impact** : SES peut suspendre le compte entier si le taux de plainte dépasse 0.1%.

**Action immédiate** : PAUSE l'envoi pour l'org concernée.

```bash
curl -X POST http://127.0.0.1:8787/api/email/admin/pause \
  -H "x-internal-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<ORG_ID>","paused":true,"reason":"complaint_rate_red"}'
```

**Diagnostic** :
```bash
# Vérifier les stats détaillées
curl -s "http://127.0.0.1:8787/api/email/admin/org-stats?org_id=<ORG_ID>&window=30d" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool
```

**Investigation** :
- Vérifier le wording des emails (template aggressif ?)
- Vérifier que le lien d'unsubscribe est visible et fonctionnel
- Vérifier le consentement des destinataires (opt-in ?)
- Vérifier la fréquence d'envoi (trop souvent ?)
- Vérifier SPF/DKIM/DMARC via [MXToolbox](https://mxtoolbox.com/)

**Reprise** :
1. Corriger le problème identifié
2. Réduire le volume progressivement (re-warm-up)
3. Unpauser :
```bash
curl -X POST http://127.0.0.1:8787/api/email/admin/pause \
  -H "x-internal-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<ORG_ID>","paused":false}'
```

---

### 2. ORG_BOUNCE_RATE ≥ 5%

**Impact** : Bounce rate élevé dégrade la réputation d'envoi SES.

**Action immédiate** : Pause si extrême (>10%).

```bash
curl -X POST http://127.0.0.1:8787/api/email/admin/pause \
  -H "x-internal-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<ORG_ID>","paused":true,"reason":"bounce_rate_red"}'
```

**Investigation** :
- Vérifier la source des emails (import CSV ? scraping ?)
- Vérifier les hard bounces : les adresses invalides sont-elles supprimées ? (P0.5 le fait automatiquement via `email_unsubscribes`)
- Vérifier DNS : SPF/DKIM/DMARC correctement configurés
- Regarder les patterns : même domaine qui bounce ? Même type d'adresse ?

**Reprise** :
1. Nettoyer la liste de contacts
2. Unpauser + surveiller pendant 48h

---

### 3. GLOBAL_WEBHOOK_SILENCE (avec trafic récent)

**Impact** : Pas de feedback SES = pas de suppression auto des bounces/complaints.

**Action immédiate** : Vérifier l'infra SES/SNS.

```bash
# Vérifier le dernier webhook reçu
curl -s "http://127.0.0.1:8787/api/email/admin/webhooks/last-seen" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool
```

**Investigation** :
1. **Console AWS → SNS → Topics** : Vérifier que la subscription est "Confirmed"
2. **Console AWS → SES → Configuration Sets** : Vérifier que l'event destination pointe vers le bon SNS topic
3. **Logs serveur** : Chercher les erreurs `SES_WEBHOOK_*` ou `SNS_*`
4. **Endpoint accessible ?** : Vérifier que `https://<DOMAIN>/webhooks/ses` est accessible publiquement (pas bloqué par firewall/CORS)
5. **Certificat HTTPS** : SNS exige HTTPS valide

**Reprise** :
1. Corriger la subscription SNS
2. Forcer un envoi test pour générer un événement SES
3. Vérifier que le webhook arrive dans `/webhooks/ses`

---

## 🟠 Alertes ORANGE — Surveillance

### ORG_COMPLAINT_RATE 0.05%–0.1%

- Surveiller pendant 24-48h
- Vérifier template + fréquence d'envoi
- Pas de pause nécessaire sauf escalade

### ORG_BOUNCE_RATE 2%–5%

- Surveiller
- Les suppressions auto (P0.5) devraient réduire le taux naturellement
- Vérifier si l'org importe de nouvelles adresses non validées

### GLOBAL_WEBHOOK_SILENCE 12h–24h

- Si week-end sans trafic → normal (pas d'alerte si sent24h = 0)
- Si trafic récent → investiguer (voir section RED)

### ORG_WARMING_TOO_LONG (>10 jours)

- L'org est en warm-up depuis longtemps
- Causes possibles : très peu d'envois, erreurs silencieuses

```bash
# Vérifier le warm-up state
curl -s "http://127.0.0.1:8787/api/email/admin/warmup-state?org_id=<ORG_ID>" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool

# Forcer warm si la situation est sous contrôle
curl -X POST http://127.0.0.1:8787/api/email/admin/force-warm \
  -H "x-internal-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<ORG_ID>"}'
```

---

## 📊 Commandes de diagnostic utiles

### Dashboard global
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/health?window=7d&include=topRisk,lastWebhook,alerts" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool
```

### Alertes uniquement
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/alerts?window=7d" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool
```

### Export CSV top risk orgs
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/top-risk.csv?window=7d&limit=50" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" -o top-risk.csv
```

### Pause state d'une org
```bash
curl -s "http://127.0.0.1:8787/api/email/admin/pause-state?org_id=<ORG_ID>" \
  -H "x-internal-admin-token: $ADMIN_TOKEN" | python3 -m json.tool
```

---

## ⏰ Cron Health Ping

Le script `email-health-ping.js` exécute automatiquement la détection d'alertes et envoie des notifications.

### Crontab recommandée (toutes les 6h)
```
0 0,6,12,18 * * * cd /path/to/apps/backend && node lib/scripts/email-health-ping.js --window=7d --cooldownHours=6
```

### Exécution manuelle
```bash
cd apps/backend
node lib/scripts/email-health-ping.js --window=7d --includeOrange=true --cooldownHours=1
```

### Configuration alerting
```env
ALERTING_PROVIDER=webhook
ALERTING_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
# ou
ALERTING_PROVIDER=email
ALERTING_EMAIL_TO=admin@reputyapp.com
```

---

## 🔇 Mutes (P0.8 v1 — fichier uniquement)

Pour muter une alerte qui spamme pendant une investigation, éditer manuellement :

```bash
# Fichier: apps/backend/.data/alerting-mutes.json
{
  "ORG_COMPLAINT_RATE:abc123": {
    "mutedUntil": "2026-02-10T12:00:00.000Z",
    "reason": "Investigation en cours — ticket #42"
  },
  "GLOBAL_WEBHOOK_SILENCE:global": {
    "mutedUntil": "2026-02-09T18:00:00.000Z",
    "reason": "Maintenance SNS planifiée"
  }
}
```

> Les endpoints admin mute/unmute seront ajoutés en P0.9.

---

## 🔐 Sécurité admin (P0.8)

Les endpoints `/api/email/admin/*` sont protégés par :
1. **Token principal** : header `x-internal-admin-token`
2. **Second secret** (optionnel) : header `x-admin-second-secret` si `INTERNAL_ADMIN_SECOND_SECRET` est défini
3. **IP allowlist** (optionnel) : `ADMIN_IP_ALLOWLIST` (CSV)

```env
# Production recommandée
INTERNAL_ADMIN_SECOND_SECRET=<openssl rand -base64 32>
ADMIN_IP_ALLOWLIST=10.0.1.5,10.0.1.6
```

---

## Seuils d'alerte (rappel)

| Alerte | Orange | Red |
|--------|--------|-----|
| Complaint rate | ≥ 0.05% | ≥ 0.1% |
| Bounce rate | ≥ 2% | ≥ 5% |
| Webhook silence | ≥ 12h | ≥ 24h |
| Warming too long | ≥ 10 jours | — |
