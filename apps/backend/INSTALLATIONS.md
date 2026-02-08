# Installations API

## Concept

Une **installation** représente un appareil ou poste de travail autorisé à utiliser l'API Reputy.
Chaque installation possède son propre token, révocable individuellement.

### Avantages

- **Sécurité** : Si un appareil est compromis, révoquez uniquement son token
- **Traçabilité** : Suivez quelle installation est utilisée (last_seen_at)
- **Gestion fine** : Créez des installations pour chaque poste/secrétaire

## Endpoints

### Lister les installations

```bash
curl -X GET http://localhost:8787/client/installations \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

**Réponse:**
```json
{
  "ok": true,
  "installations": [
    {
      "id": "abc123def456",
      "label": "Poste accueil",
      "tokenMasked": "***...***",
      "createdAt": "2026-02-02T10:00:00.000Z",
      "lastSeenAt": "2026-02-02T12:30:00.000Z",
      "status": "active"
    }
  ]
}
```

### Créer une installation

```bash
curl -X POST http://localhost:8787/client/installations \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"label": "Poste accueil"}'
```

**Réponse (token visible UNE SEULE FOIS):**
```json
{
  "ok": true,
  "installation": {
    "id": "abc123def456",
    "label": "Poste accueil",
    "tokenMasked": "rpt_abcd...wxyz",
    "createdAt": "2026-02-02T10:00:00.000Z"
  },
  "token": "rpt_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  "warning": "Copiez ce token maintenant, il ne sera plus affiché."
}
```

⚠️ **IMPORTANT** : Le token en clair n'est retourné qu'à la création. Conservez-le immédiatement !

### Révoquer une installation

```bash
curl -X POST http://localhost:8787/client/installations/<ID>/revoke \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

**Réponse:**
```json
{
  "ok": true,
  "message": "Installation révoquée"
}
```

### Régénérer le token (rotation)

```bash
curl -X POST http://localhost:8787/client/installations/<ID>/rotate \
  -H "Authorization: Bearer <SESSION_TOKEN>"
```

**Réponse (nouveau token visible UNE SEULE FOIS):**
```json
{
  "ok": true,
  "installation": {
    "id": "abc123def456",
    "label": "Poste accueil",
    "tokenMasked": "rpt_newt...oken",
    "createdAt": "2026-02-02T10:00:00.000Z"
  },
  "token": "rpt_newtokenabcdef1234567890...",
  "warning": "Copiez ce nouveau token maintenant, il ne sera plus affiché."
}
```

⚠️ La rotation **remplace immédiatement** l'ancien token (pas de période de grâce).

## Codes d'erreur

| Status | errorCategory | Description |
|--------|--------------|-------------|
| 401 | SESSION_EXPIRED | Session invalide, reconnectez-vous |
| 404 | NOT_FOUND | Installation introuvable |
| 409 | ALREADY_REVOKED | Installation déjà révoquée |
| 409 | INSTALLATION_REVOKED | Impossible de régénérer un token révoqué |
| 501 | SERVICE_UNAVAILABLE | SQLite non activé |

## Sécurité

- Les tokens sont **hashés** (SHA256) en base de données
- Le token en clair n'est visible **qu'à la création ou rotation**
- Les installations révoquées ne peuvent plus utiliser l'API
- Chaque org ne peut voir/gérer que ses propres installations
- Les logs d'audit ne contiennent **jamais** le token en clair

## Tests

### Prérequis

1. Démarrer le backend avec SQLite :
```bash
cd apps/backend
USE_SQLITE=1 node server.js
# Note : configurez INTERNAL_ADMIN_TOKEN dans votre fichier .env
```

2. Se connecter via l'UI admin (http://localhost:3002)

3. Récupérer le token de session :
   - Ouvrir DevTools (F12) > Application > Local Storage
   - Copier la valeur de `reputy_client_token`

### Lancer les tests

```bash
AUTH_TOKEN=<votre_session_token> node lib/scripts/test-installations.js
```

### Tests manuels avec curl

```bash
# Définir le token de session
export TOKEN="votre_session_token"

# Lister
curl -s http://localhost:8787/client/installations \
  -H "Authorization: Bearer $TOKEN" | jq

# Créer
curl -s -X POST http://localhost:8787/client/installations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Test CLI"}' | jq

# Avec l'ID retourné, tester rotate puis revoke
export ID="installation_id_ici"

# Rotate
curl -s -X POST http://localhost:8787/client/installations/$ID/rotate \
  -H "Authorization: Bearer $TOKEN" | jq

# Revoke
curl -s -X POST http://localhost:8787/client/installations/$ID/revoke \
  -H "Authorization: Bearer $TOKEN" | jq
```

## UI Admin

La page `/installations` dans reputy-admin permet de :
- Voir toutes les installations (actives et révoquées)
- Créer une nouvelle installation (affiche le token une fois)
- Révoquer une installation
- Copier le token lors de la création

## Schéma DB

```sql
CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  label TEXT,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  metadata_json TEXT DEFAULT '{}'
);

CREATE INDEX idx_installations_org ON installations(org_id);
CREATE INDEX idx_installations_active ON installations(org_id, revoked_at);
```
