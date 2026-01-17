# Reputy Web - Site Vitrine

Site marketing pour Reputy, plateforme de gestion de la réputation en ligne.

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+
- npm ou yarn

### Installation

```bash
cd apps/reputy-web
npm install
```

### Développement

```bash
npm run dev
# Le site sera accessible sur http://localhost:3001
```

### Production

```bash
npm run build
npm run start
```

## 📁 Structure

```
src/
├── app/                    # Pages (App Router)
│   ├── page.tsx           # Page d'accueil
│   ├── features/          # Page fonctionnalités
│   ├── pricing/           # Page tarifs
│   ├── login/             # Page connexion
│   ├── signup/            # Page inscription
│   └── legal/             # Pages légales
│       ├── privacy/       # Politique de confidentialité
│       └── terms/         # CGU
├── components/            # Composants réutilisables
│   ├── Header.tsx
│   └── Footer.tsx
└── lib/                   # Utilitaires
    └── utils.ts
```

## ⚙️ Configuration

Créez un fichier `.env.local` à la racine du projet :

```env
# URL du dashboard admin (redirect après login)
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000

# URL du backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:8787
```

## 🔗 Liens avec le monorepo

Ce site vitrine est conçu pour fonctionner avec :

- **reputy-admin** (Dashboard) : Les boutons "Se connecter" et "Créer un compte" redirigent vers le dashboard
- **backend** (API) : Pour l'authentification future

## 🎨 Stack technique

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Lucide Icons**

## 📝 TODO (Placeholders)

- [ ] Authentification réelle (OAuth, magic link, etc.)
- [ ] Intégration Stripe pour les paiements
- [ ] Blog / Documentation
- [ ] Internationalisation (i18n)
