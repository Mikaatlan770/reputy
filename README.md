# Monorepo Reputy / avis-doctolib

Ce dépôt regroupe :
- `apps/backend` : API locale minimale (token bearer, endpoint `/api/send-review-request`, healthcheck `/health`).
- `apps/extension` : extension Chrome MV3 (Avis Doctolib).
- `apps/reputy-admin` : front SaaS Reputy (Next.js 13+).
- `packages/` : espace libre pour partager types/clients/utilitaires (actuellement vide).

## Prérequis
- Node.js 18+ (idéal 20+)
- Chrome (pour charger l’extension)

## Scripts racine (npm workspaces)
- `npm run dev:backend` : lance l’API locale.
- `npm run start:backend` : démarre l’API en mode prod simple.
- `npm run dev:reputy` / `build:reputy` / `lint:reputy` : commandes Next.js dans `apps/reputy-admin`.
- `npm run dev:extension` : rappel pour charger l’extension via `chrome://extensions` (mode développeur).

## Backend (apps/backend)
- URL par défaut : `http://localhost:8787`
- Token attendu : `CABINET_API_TOKEN`
- Endpoints : `GET /health`, `POST /api/send-review-request` (retourne `reviewUrl`, `requestId`).
- Config exemple (`apps/backend/.env.example`) :
  - `PORT=8787`
  - `CABINET_API_TOKEN=dev-token`
  - `REVIEWS_BASE_URL=http://localhost:8787`
- Démarrage :
  ```bash
  cd apps/backend
  cp .env.example .env   # à adapter
  npm install
  npm run dev
  ```

## Extension Chrome (apps/extension)
1) Ouvrir `chrome://extensions`, activer le Mode développeur.
2) Charger l’extension non empaquetée → dossier `apps/extension/`.
3) Dans les **Options** de l’extension, renseigner :
   - Backend URL : `http://localhost:8787`
   - Token : la valeur de `CABINET_API_TOKEN`

## Reputy Admin (apps/reputy-admin)
```bash
cd apps/reputy-admin
npm install
npm run dev
```

## Notes
- Les anciens fichiers de plan restent à la racine (`PLAN_PROJET_COMPLET*.md`, `ROADMAP_REPUTY.html`).
- Pour partager des types/clients entre l’extension et l’admin, ajouter un package dans `packages/` (ex. `packages/shared/`).
- Si des tokens/API changent côté Reputy, veille à aligner la configuration de l’extension et du backend.

