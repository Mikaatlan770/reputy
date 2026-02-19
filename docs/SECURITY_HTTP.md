# 🔒 P0.3 — Sécurité HTTP (CORS + Security Headers)

## Principe

- **CORS restrictif** : seules les origines listées dans `ALLOWED_ORIGINS` peuvent appeler l'API depuis un navigateur.
- **Headers de sécurité** : chaque réponse inclut des protections contre le clickjacking, le MIME sniffing, etc.
- **HSTS** activé uniquement en production.
- **CSP conditionnelle** : strict pour les réponses JSON, permissif pour les pages HTML (rating patients).

## Configuration

Dans `apps/backend/.env` :

```env
# Origines autorisées (séparées par des virgules, sans espace superflu)

# Dev :
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3001

# Prod (exemple) :
ALLOWED_ORIGINS=https://app.reputyapp.com,https://reputyapp.com
```

> ⚠️ **Ne jamais mettre `*`** dans `ALLOWED_ORIGINS` en production.
>
> ⚠️ **En production, le serveur refusera de démarrer si `ALLOWED_ORIGINS` est absent.** Si la variable contient `localhost` ou `127.0.0.1`, un warning sera affiché au boot.

## Comportement CORS

| Cas | Résultat |
|-----|----------|
| `curl` sans `Origin` (server-to-server) | Passe, aucun header CORS |
| Navigateur avec `Origin` autorisé | `Access-Control-Allow-Origin: <origin>` + headers CORS |
| Navigateur avec `Origin` non autorisé | **403 Forbidden** (logué en prod) |
| Requête `OPTIONS` (preflight) | **204** avec headers CORS (si origin autorisé) |

### Headers CORS retournés (quand autorisé)

| Header | Valeur |
|--------|--------|
| `Access-Control-Allow-Origin` | `<origin>` (jamais `*`) |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, X-Requested-With, x-admin-token, x-api-token, x-public-key, X-Internal-Admin-Token, X-Cabinet-Api-Token, X-Public-Key` |
| `Access-Control-Allow-Credentials` | `true` (pour admin-cookie cross-origin) |
| `Access-Control-Max-Age` | `86400` (24h de cache preflight) |
| `Vary` | `Origin` |

## Headers de sécurité (toutes les réponses)

| Header | Valeur |
|--------|--------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Resource-Policy` | `same-site` (global) / `cross-origin` (QR endpoints) |
| `Content-Security-Policy` | voir ci-dessous |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` *(prod only)* |

### CSP conditionnelle

- **API (JSON)** : `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`
- **HTML (pages rating)** : `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'`

## Comment tester

```bash
# 1. Démarrer le backend
cd apps/backend && USE_SQLITE=1 node server.js

# 2. Origin autorisé → doit renvoyer Access-Control-Allow-Origin
curl -i -H "Origin: http://localhost:3001" http://localhost:8787/health

# 3. Origin non autorisé → doit renvoyer 403
curl -i -H "Origin: https://evil.com" http://localhost:8787/health

# 4. Preflight → doit renvoyer 204 avec headers CORS
curl -i -X OPTIONS \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:8787/health

# 5. Sans Origin (curl normal) → doit passer sans headers CORS
curl -i http://localhost:8787/health
```

### Résultats attendus

| Test | Code HTTP | `Access-Control-Allow-Origin` | Security headers |
|------|-----------|-------------------------------|------------------|
| Origin autorisé | 200 | `http://localhost:3001` | ✅ Tous présents |
| Origin non autorisé | 403 | Absent | ✅ Tous présents |
| Preflight | 204 | `http://localhost:3001` | ✅ Tous présents |
| Sans Origin | 200 | Absent | ✅ Tous présents |

## Notes techniques

- `Access-Control-Allow-Credentials: true` est nécessaire pour le cookie admin cross-origin (reputy-admin ↔ backend).
- Les QR endpoints utilisent `Cross-Origin-Resource-Policy: cross-origin` car les images QR peuvent être embarquées cross-site.
- Les trailing slashes dans `ALLOWED_ORIGINS` ne sont pas normalisés — s'assurer qu'il n'y en a pas.
