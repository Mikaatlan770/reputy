# P0.5 — SES Webhooks (SNS) : Bounce/Complaint/Delivery

## Architecture

```
SES → Configuration Set → Event Destination (SNS) → SNS Topic → HTTPS Subscription → POST /webhooks/ses
```

Chaque événement SES (bounce, complaint, delivery) est envoyé par SNS en tant que `Notification` JSON sur l'endpoint webhook du backend.

## Configuration AWS — Pas à pas

### 1. Créer un SNS Topic

```bash
aws sns create-topic --name reputy-ses-events --region eu-west-3
```

Notez l'ARN retourné : `arn:aws:sns:eu-west-3:ACCOUNT_ID:reputy-ses-events`

### 2. Créer un SES Configuration Set

Console SES → Configuration Sets → Create :
- Nom : `reputy-main`

Ou via CLI :
```bash
aws sesv2 create-configuration-set --configuration-set-name reputy-main
```

### 3. Créer l'Event Destination (SNS)

Console SES → Configuration Sets → `reputy-main` → Event destinations → Add :
- **Events** : Bounce, Complaint, Delivery
- **Destination** : SNS Topic → `reputy-ses-events`

Ou via CLI :
```bash
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name reputy-main \
  --event-destination-name ses-to-sns \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["BOUNCE", "COMPLAINT", "DELIVERY"],
    "SnsDestination": {
      "TopicArn": "arn:aws:sns:eu-west-3:ACCOUNT_ID:reputy-ses-events"
    }
  }'
```

### 4. Ajouter la subscription HTTPS au topic SNS

Console SNS → Topics → `reputy-ses-events` → Create subscription :
- **Protocol** : HTTPS
- **Endpoint** : `https://api.reputyapp.com/webhooks/ses`

⚠️ L'URL doit être **publiquement accessible en HTTPS**.

### 5. Confirmation automatique

Quand la subscription est créée, SNS envoie un `SubscriptionConfirmation` à l'endpoint.
Le backend l'auto-confirme en appelant le `SubscribeURL` (implémenté dans `ses-webhooks.js`).

Vérifier le statut dans la console SNS → Subscriptions : il doit passer à **Confirmed**.

### 6. Configurer SES pour utiliser le Configuration Set

Lors de l'envoi avec nodemailer, ajouter le header :
```javascript
headers: {
  'X-SES-CONFIGURATION-SET': 'reputy-main',
}
```

> ⚠️ Ce header est déjà prêt dans `provider.js`. À activer quand le configuration set est créé.

## Variables d'environnement

```env
# ARN du topic SNS (OBLIGATOIRE en production)
SES_SNS_TOPIC_ARN=arn:aws:sns:eu-west-3:123456789:reputy-ses-events
```

En dev/sandbox, la variable peut être absente : un warning sera loggé mais les events seront acceptés.
En production, si la variable est absente, les webhooks seront rejetés (401).

## Sécurité

Le handler valide :
1. **Header** `x-amz-sns-message-type` (présent)
2. **TopicArn** comparé à `SES_SNS_TOPIC_ARN`
3. **SigningCertURL** : doit être HTTPS + hostname `*.amazonaws.com`
4. **Signature RSA** : certificat téléchargé + caché 1h, vérification RSA-SHA1/SHA256

## Déduplication

Chaque événement est dédupliqué via `webhook_events.id` avec le format :
```
ses:{eventType}:{mail.messageId}:{recipientEmail}
```

Exemple : `ses:bounce:010201234-abcd:patient@example.com`

Si un événement identique est reçu une seconde fois, il est ignoré (skip).

## Comportement par type d'événement

| Type       | email_outbox | email_events | email_unsubscribes | webhook_events |
|------------|-------------|-------------|-------------------|---------------|
| Bounce     | → `failed` + error `ses:bounce:Permanent` | ✅ `bounce` | ✅ `reason='bounce'` | ✅ dedup |
| Complaint  | → `failed` + error `ses:complaint:abuse` | ✅ `complaint` | ✅ `reason='complaint'` | ✅ dedup |
| Delivery   | (inchangé, reste `sent`) | ✅ `delivered` | — | ✅ dedup |

⚠️ La suppression automatique (`email_unsubscribes`) n'est insérée **que si l'outbox est retrouvée** (= on connaît l'`org_id`). Sinon, l'événement est quand même enregistré dans `webhook_events` pour audit.

## Tester en local

### Simuler un Bounce SNS

```bash
curl -X POST http://127.0.0.1:8787/webhooks/ses \
  -H "Content-Type: application/json" \
  -H "x-amz-sns-message-type: Notification" \
  -d '{
    "Type": "Notification",
    "MessageId": "test-msg-001",
    "TopicArn": "arn:aws:sns:eu-west-3:123456789:test-topic",
    "Timestamp": "2026-02-09T12:00:00.000Z",
    "SigningCertURL": "https://sns.eu-west-3.amazonaws.com/cert.pem",
    "Signature": "test",
    "SignatureVersion": "1",
    "Message": "{\"eventType\":\"Bounce\",\"mail\":{\"messageId\":\"test-ses-123\",\"source\":\"no-reply@reputyapp.com\",\"destination\":[\"bounce@example.com\"]},\"bounce\":{\"bounceType\":\"Permanent\",\"bounceSubType\":\"General\",\"bouncedRecipients\":[{\"emailAddress\":\"bounce@example.com\",\"status\":\"5.1.1\",\"diagnosticCode\":\"smtp; 550 User unknown\"}]}}"
  }'
```

### Simuler une SubscriptionConfirmation

```bash
curl -X POST http://127.0.0.1:8787/webhooks/ses \
  -H "Content-Type: application/json" \
  -H "x-amz-sns-message-type: SubscriptionConfirmation" \
  -d '{
    "Type": "SubscriptionConfirmation",
    "MessageId": "sub-001",
    "TopicArn": "arn:aws:sns:eu-west-3:123456789:test-topic",
    "Timestamp": "2026-02-09T12:00:00.000Z",
    "Token": "test-token",
    "SubscribeURL": "https://sns.eu-west-3.amazonaws.com/confirm?token=xxx",
    "SigningCertURL": "https://sns.eu-west-3.amazonaws.com/cert.pem",
    "Signature": "test",
    "SignatureVersion": "1",
    "Message": "You have chosen to subscribe to the topic..."
  }'
```

> En dev (sans `SES_SNS_TOPIC_ARN`), la validation signature sera laxiste. En prod, seuls les vrais messages SNS signés seront acceptés.

### Vérifier en DB

```bash
cd apps/backend && node -e "
const db = require('./lib/db');
console.log('webhook_events SES:');
console.log(db.all(\"SELECT id, event_type, org_id FROM webhook_events WHERE provider='ses' ORDER BY created_at DESC LIMIT 10\"));
console.log('email_unsubscribes récents:');
console.log(db.all('SELECT org_id, email, reason FROM email_unsubscribes ORDER BY created_at DESC LIMIT 10'));
"
```

## Checklist production

- [ ] `SES_SNS_TOPIC_ARN` configuré dans `.env` prod
- [ ] SNS subscription confirmée (statut "Confirmed")
- [ ] URL webhook publique HTTPS accessible (`https://api.reputyapp.com/webhooks/ses`)
- [ ] SES Configuration Set créé + Event Destination SNS activée
- [ ] Envoi d'emails avec header `X-SES-CONFIGURATION-SET: reputy-main`
- [ ] Tester avec un vrai bounce (adresse `bounce@simulator.amazonses.com`)
- [ ] Vérifier suppression automatique dans `email_unsubscribes`
