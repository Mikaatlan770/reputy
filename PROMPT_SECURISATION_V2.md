# PROMPT SÉCURISATION & STABILISATION REPUTY SAAS - V2

## OBJECTIF

Je veux un plan d'exécution + implémentation concrète dans le code (monorepo) pour sécuriser et stabiliser la SaaS, SANS CASSER l'existant.

**Priorité absolue** : P0 puis P1. P2 = seulement préparation (notes / interfaces), car on migrera en DB plus tard.

---

## CONTRAINTES (NE RIEN CASSER)

- ❌ Ne pas casser le flux actuel extension → backend
- ❌ Ne pas casser le backoffice super-admin ni ses routes `/internal/*`
- ❌ Ne pas casser l'authentification client existante (signup/login/verify)
- ✅ Les changements P0/P1 doivent être **ADDITIFS** et compatibles : pas de refactor massif
- ✅ Toute nouvelle sécurité doit garder un **mode DEV simple** (DX) mais empêcher les erreurs en PROD

---

## SCOPE

| App | Port | Chemin |
|-----|------|--------|
| Backend | 8787 | `apps/backend` |
| Dashboard Client (reputy-admin) | 3002 | `apps/reputy-admin` |
| Vitrine (reputy-web) | 3001 | `apps/reputy-web` |
| Extension Chrome | - | `apps/extension` |

---

## P0 (À FAIRE TOUT DE SUITE) - SÉCURITÉ CRITIQUE

### P0.1 — FAIL-FAST secrets en PROD (pas de fallback)

**But** : Empêcher un déploiement avec valeurs par défaut type `dev-token` / `super-admin-secret` / `mvp-secret`

**Implémentation** :
- Détecter l'environnement (`NODE_ENV=production`)
- En **production** :
  - Refuser de démarrer si `INTERNAL_ADMIN_TOKEN`, `JWT_SECRET`, `CABINET_API_TOKEN`, `ADMIN_COOKIE_SECRET` ne sont pas définis (throw + log clair)
  - Refuser si ces valeurs sont égales aux valeurs de fallback connues (`dev-token`, `super-admin-secret`, `mvp-secret`)
- En **dev** : Conserver les fallbacks actuels pour faciliter la mise en route locale

**Livrables** :
- [ ] Code modifié dans `apps/backend/server.js` (fonction `validateProductionSecrets()`)
- [ ] Message d'erreur explicite avec liste des variables manquantes
- [ ] Documenter dans README les env vars requises en prod

---

### P0.2 — Nettoyage repo / zip / gitignore

**But** : Éliminer artefacts build et dépendances du versionnement / zips

**Implémentation** :
- Ajouter / vérifier dans `.gitignore` :
  ```
  node_modules/
  .next/
  dist/
  .turbo/
  *.log
  .env*
  !.env.example
  ```
- ⚠️ **NE PLUS ignorer** `package-lock.json` (il doit être versionné)
- Ajouter scripts npm :
  - `clean` : supprime node_modules, .next, dist
  - `pack:safe` : crée un zip propre

**Livrables** :
- [ ] `.gitignore` corrigé
- [ ] `package.json` (root) : scripts `clean` / `pack:safe`
- [ ] README : comment générer un zip propre

---

### P0.3 — Sécuriser le super-admin (cookie signé HMAC)

**État actuel** : Le middleware front se base sur cookie `admin_ok=1` (trop faible).

**But** : Garder `x-admin-token` côté backend inchangé, mais rendre le login/admin UI robuste avec un cookie signé.

**Implémentation** :
- Utiliser un secret dédié `ADMIN_COOKIE_SECRET` pour signer/vérifier le cookie admin
- **Fail-fast en prod** si `ADMIN_COOKIE_SECRET` absent ou égal à un fallback
- Ajouter endpoint Next (reputy-admin) `/internal/api/auth` (route handler) :
  - Prend le secret admin saisi
  - Valide via comparaison avec `ADMIN_UI_PASSWORD` (env var)
  - En cas de succès : set-cookie `HttpOnly` + `Secure` (en prod) + `SameSite=Lax`
  - Cookie contient un token signé HMAC-SHA256 avec expiration (12h)
  - Format payload : `{ exp: timestamp, iat: timestamp }`
- Modifier `middleware.ts` (reputy-admin) :
  - Vérifier la signature HMAC + expiration du cookie
  - Si invalide → redirect `/internal/login`
- En DEV : accepter le fallback `ADMIN_COOKIE_SECRET=dev-admin-cookie-secret`

**Livrables** :
- [ ] Route handler `internal/api/auth/route.ts`
- [ ] Utils signature HMAC (`lib/internal/cookie-auth.ts`) : `signToken()`, `verifyToken()`
- [ ] `middleware.ts` modifié pour vérifier signature
- [ ] Page `internal/login` branche sur cet endpoint

---

### P0.4 — Rate limiting basique (NEW)

**But** : Éviter le brute-force sur endpoints sensibles

**Implémentation** :
- Limiter `/auth/login` et `/auth/verify` à **5 tentatives/minute par IP**
- Stocker les tentatives en mémoire (Map) avec cleanup périodique
- En **DEV** : désactivé ou limite très haute (100/min)
- En **PROD** : actif avec limite stricte
- Retourner `429 Too Many Requests` avec header `Retry-After`

**Livrables** :
- [ ] Middleware `rateLimiter()` dans `apps/backend/server.js`
- [ ] Application sur routes `/auth/login`, `/auth/verify`, `/auth/resend-code`
- [ ] Tests manuels documentés

---

## P1 (DANS LA FOULÉE) - CONSOLIDATION

### P1.1 — Page Installation dans reputy-admin ✅ DONE

**Statut** : Déjà implémenté

**Vérification uniquement** :
- [ ] Vérifier que l'onglet "Installation" apparaît uniquement pour les clients (pas super-admin)
- [ ] Vérifier que la page `/installation` affiche correctement `publicKey` + instructions
- [ ] Vérifier le bouton copier fonctionne

---

### P1.2 — Redirection 3001 → 3002/login (Option A)

**But** : Après signup/verify/login sur reputy-web, l'utilisateur doit aller sur 3002 (dashboard).

**Choix** : **Option A - Re-login obligatoire** (simple, sécurisé, pas de token en URL)

**Implémentation** :
- Après `verify` OK sur reputy-web : redirect vers `http://localhost:3002/login`
- Après `login` OK sur reputy-web : redirect vers `http://localhost:3002/login`
- Afficher message explicatif : "Votre compte est validé. Connectez-vous au tableau de bord."
- Ne PAS passer le token dans l'URL

**Livrables** :
- [ ] Modifier `apps/reputy-web/src/app/verify/page.tsx` : redirect 3002/login
- [ ] Modifier `apps/reputy-web/src/app/login/page.tsx` : redirect 3002/login
- [ ] Ajuster textes UI : "Accéder au tableau de bord" avec explication

---

### P1.3 — Token extension per-org + rotation avec période de grâce

**But** : Remplacer `CABINET_API_TOKEN` global par un token par org avec rotation sécurisée.

**Implémentation** :

1. **Modèle org étendu** (dans `data.json`) :
   ```json
   {
     "apiToken": "random-token-32-chars",
     "apiTokenCreatedAt": "2026-01-19T...",
     "apiTokenLastRotatedAt": null,
     "apiTokenPrevious": null,
     "apiTokenPreviousExpiresAt": null
   }
   ```

2. **Rotation avec période de grâce** :
   - Lors de la rotation : copier `apiToken` → `apiTokenPrevious`
   - Définir `apiTokenPreviousExpiresAt` = now + 24h
   - Générer nouveau `apiToken`
   - Accepter l'ancien token pendant 24h après rotation

3. **Endpoints super-admin** :
   - `POST /internal/orgs/:id/rotate-token` : rotation du token
   - `GET /internal/orgs/:id/token` : afficher le token (une seule fois ou masqué)

4. **Validation backend** :
   - Pour endpoints extension : vérifier `x-api-token` == `org.apiToken` OU (`org.apiTokenPrevious` si non expiré)
   - Lookup org via `publicKey`
   - **Compat DEV** : si `NODE_ENV !== 'production'`, accepter `dev-token` comme fallback

5. **Extension** :
   - Dans options, stocker `apiToken` spécifique du client
   - Ne plus utiliser `dev-token` global en prod

**Livrables** :
- [ ] Modèle org mis à jour avec champs token
- [ ] Fonction `validateExtensionToken(publicKey, token)` avec période de grâce
- [ ] Endpoints rotation + affichage token
- [ ] UI backoffice pour rotation (bouton dans client-detail)
- [ ] Extension : champ apiToken dans options

---

### P1.4 — Logs structurés JSON (NEW)

**But** : Traçabilité des actions sensibles sans casser l'existant

**Implémentation** :
- Créer fonction `auditLog(action, data)` qui écrit en `console.log` format JSON
- Format :
  ```json
  {
    "timestamp": "2026-01-19T15:30:00.000Z",
    "action": "LOGIN_SUCCESS",
    "orgId": "org_xxx",
    "userId": "user_xxx",
    "ip": "192.168.1.1",
    "userAgent": "...",
    "details": {}
  }
  ```
- Actions à logger :
  - `SIGNUP_START`, `SIGNUP_SUCCESS`, `SIGNUP_FAIL`
  - `VERIFY_SUCCESS`, `VERIFY_FAIL`
  - `LOGIN_SUCCESS`, `LOGIN_FAIL`
  - `LOGOUT`
  - `SEND_REVIEW` (avec count)
  - `ADD_CREDITS` (avec amounts)
  - `ADMIN_LOGIN_SUCCESS`, `ADMIN_LOGIN_FAIL`
  - `TOKEN_ROTATION`

**Livrables** :
- [ ] Fonction `auditLog()` dans `apps/backend/server.js`
- [ ] Intégration dans tous les handlers concernés
- [ ] Documentation format logs

---

## P2 (PRÉPARATION SEULEMENT) - MIGRATION DB FUTURE

⚠️ **Ne pas implémenter la migration DB maintenant.** Seulement préparer.

### P2.1 — Storage Interface (Repository Pattern)

- Introduire une couche abstraction autour de `data.json`
- Centraliser lectures/écritures derrière des fonctions :
  ```typescript
  interface StorageInterface {
    getOrgById(id: string): Promise<Org | null>
    getOrgByPublicKey(key: string): Promise<Org | null>
    saveOrg(org: Org): Promise<void>
    getUserByEmail(email: string): Promise<User | null>
    createUser(user: User): Promise<User>
    appendAuditEvent(event: AuditEvent): Promise<void>
    // ...
  }
  ```

### P2.2 — Types TypeScript centralisés

- Définir tous les types dans `packages/types/` ou `apps/backend/types/`
- Types : `Org`, `User`, `Session`, `EmailVerification`, `AuditEvent`, `CreditTransaction`

### P2.3 — Tests essentiels (stubs)

- Structure tests avec vitest ou jest
- 2-3 tests essentiels :
  - Test auth flow (signup → verify → login)
  - Test rate limiting
  - Test token validation

### P2.4 — Audit trail append-only

- Préparer structure pour event sourcing léger
- Chaque action crée un event immuable

**Livrables P2 (préparation)** :
- [ ] Interface Storage définie (TypeScript)
- [ ] TODO list migration SQLite/Postgres
- [ ] Structure dossier tests + 2 tests stubs
- [ ] Documentation architecture cible

---

## ATTENDU DE LA RÉPONSE

1. **Analyse** de l'état actuel du repo : où mettre chaque changement (fichiers exacts)
2. **Plan de commits** (P0.1 → P0.2 → P0.3 → P0.4 → P1.2 → P1.3 → P1.4)
3. **Code concret** pour chaque tâche P0 et P1
4. **Check-list tests manuels** après chaque étape

---

## RAPPELS CRITIQUES

```
⚠️ NE PAS FAIRE DE REFACTOR MASSIF
⚠️ NE PAS CASSER L'EXISTANT
⚠️ CHANGEMENTS ADDITIFS UNIQUEMENT
⚠️ TESTER APRÈS CHAQUE ÉTAPE
```

---

## VARIABLES D'ENVIRONNEMENT REQUISES

### Production (obligatoires)
| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `INTERNAL_ADMIN_TOKEN` | Token super-admin (≠ `super-admin-secret`) |
| `JWT_SECRET` | Secret JWT sessions client (≠ `mvp-secret`) |
| `CABINET_API_TOKEN` | Token legacy extension (≠ `dev-token`) |
| `ADMIN_COOKIE_SECRET` | Secret HMAC cookie admin (≠ `dev-admin-cookie-secret`) |
| `ADMIN_UI_PASSWORD` | Mot de passe UI super-admin |

### Développement (fallbacks acceptés)
| Variable | Fallback DEV |
|----------|--------------|
| `INTERNAL_ADMIN_TOKEN` | `super-admin-secret` |
| `JWT_SECRET` | `mvp-secret` |
| `CABINET_API_TOKEN` | `dev-token` |
| `ADMIN_COOKIE_SECRET` | `dev-admin-cookie-secret` |
| `ADMIN_UI_PASSWORD` | `admin` |
