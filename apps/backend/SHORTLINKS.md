# Shortlinks API (QR/NFC)

Documentation des endpoints shortlinks pour la génération de QR codes et liens NFC.

## Concept

Les **shortlinks** permettent de créer des liens courts Reputy (`/r/:code`) qui redirigent vers une URL cible (généralement l'URL de review Google).

- **QR Code**: Un shortlink associé à un QR code téléchargeable (PNG ou SVG)
- **NFC Tag**: Un shortlink à écrire sur un tag NFC (via une app tierce)

## Quotas par Plan

| Plan | QR inclus | NFC inclus |
|------|-----------|------------|
| Bronze (basic) | 1 | 0 |
| Silver (pro) | 3 | 1 |
| Gold (enterprise) | 10 | 3 |

**Important**: La suppression d'un shortlink ne restitue PAS les crédits consommés.

## Endpoints

### Lister les shortlinks

```
GET /client/shortlinks
Authorization: Bearer <session_token>
```

**Réponse**:
```json
{
  "shortlinks": [
    {
      "code": "AbCd1234",
      "type": "qr",
      "label": "QR Salle d'attente",
      "targetUrl": "https://g.page/r/.../review",
      "shortUrl": "http://localhost:8787/r/AbCd1234",
      "clicks": 42,
      "createdAt": "2026-02-02T10:00:00.000Z",
      "lastClickedAt": "2026-02-02T15:30:00.000Z"
    }
  ],
  "stats": {
    "totalQr": 1,
    "totalNfc": 0,
    "totalClicks": 42
  }
}
```

### Créer un shortlink

```
POST /client/shortlinks
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "type": "qr",           // "qr" ou "nfc"
  "label": "QR Accueil",  // optionnel
  "targetUrl": "https://g.page/r/.../review"  // obligatoire
}
```

**Réponse (201)**:
```json
{
  "ok": true,
  "shortlink": {
    "code": "XyZ98765",
    "type": "qr",
    "label": "QR Accueil",
    "targetUrl": "https://g.page/r/.../review",
    "shortUrl": "http://localhost:8787/r/XyZ98765",
    "createdAt": "2026-02-02T12:00:00.000Z"
  }
}
```

**Erreur quota (402)**:
```json
{
  "ok": false,
  "errorCategory": "QUOTA_QR_EXCEEDED",
  "message": "Quota QR atteint. Vous pouvez acheter un crédit supplémentaire (5€ HT).",
  "action": "BUY_QR_ADDON"
}
```

### Télécharger le QR code

```
GET /client/shortlinks/:code/qr?format=png
GET /client/shortlinks/:code/qr?format=svg
Authorization: Bearer <session_token>
```

**Paramètres**:
- `format`: `png` (défaut) ou `svg`

**Réponse**:
- `Content-Type: image/png` ou `image/svg+xml`
- Corps: image binaire

**Important**: Le QR code encode l'URL courte (`/r/:code`), PAS l'URL cible.

### Supprimer un shortlink

```
DELETE /client/shortlinks/:code
Authorization: Bearer <session_token>
```

**Réponse (200)**:
```json
{
  "ok": true,
  "message": "Shortlink supprimé"
}
```

**Note**: La suppression NE restitue PAS le quota consommé.

### Redirection publique

```
GET /r/:code
(Pas d'authentification)
```

**Comportement**:
1. Recherche le shortlink par code
2. Incrémente le compteur de clics
3. Met à jour `lastClickedAt`
4. Redirige (302) vers `targetUrl`

**Erreur (404)**:
Page HTML "Lien invalide"

## Exemples curl

### Lister

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/client/shortlinks
```

### Créer un QR

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"qr","label":"Test","targetUrl":"https://g.page/r/test/review"}' \
  http://localhost:8787/client/shortlinks
```

### Télécharger QR PNG

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -o qr.png \
  "http://localhost:8787/client/shortlinks/AbCd1234/qr?format=png"
```

### Télécharger QR SVG

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -o qr.svg \
  "http://localhost:8787/client/shortlinks/AbCd1234/qr?format=svg"
```

### Supprimer

```bash
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/client/shortlinks/AbCd1234
```

### Tester la redirection

```bash
curl -I http://localhost:8787/r/AbCd1234
# HTTP/1.1 302 Found
# Location: https://g.page/r/test/review
```

## Script de test

```bash
# Depuis apps/backend/
AUTH_TOKEN=<votre_session_token> npm run test:shortlinks
```

Le script teste:
1. Listing des shortlinks
2. Création d'un shortlink QR
3. Vérification en liste
4. Redirection publique `/r/:code`
5. Incrémentation des clics
6. Téléchargement QR PNG
7. Téléchargement QR SVG
8. Validation format invalide
9. Suppression
10. Vérification suppression
11. Test quota

## Instructions NFC

Pour les shortlinks de type NFC, l'utilisateur doit:

1. Copier l'URL courte (`shortUrl`)
2. Ouvrir une application NFC (ex: NFC Tools sur Android/iOS)
3. Écrire l'URL sur le tag NFC
4. Coller le tag dans un endroit visible (comptoir, table, etc.)

## Erreurs structurées

| errorCategory | Message | action |
|---------------|---------|--------|
| QUOTA_QR_EXCEEDED | Quota QR atteint... | BUY_QR_ADDON |
| QUOTA_NFC_EXCEEDED | Quota NFC atteint... | BUY_NFC_ADDON |
| NOT_FOUND | Shortlink introuvable | CHECK_URL |
| INVALID_FORMAT | Format invalide... | FIX_INPUT |
| SESSION_EXPIRED | Session expirée... | LOGIN |
