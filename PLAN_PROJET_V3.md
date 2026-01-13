# 📋 PLAN PROJET COMPLET V3
## Plateforme E-Réputation & Paiement Digital Multi-Secteurs

**Version** : 3.0  
**Date** : Janvier 2026  
**Statut** : Spécifications détaillées

---

## 🎯 VISION GLOBALE

Une plateforme **tout-en-un** qui combine :
- **Gestion de l'e-réputation** (avis Google, réponses IA)
- **Paiement digital** (à table, click & collect)
- **Commande restaurant** (menu digital, QR code)

### Marchés cibles
| Secteur | Solution principale | Solution secondaire |
|---------|---------------------|---------------------|
| **Médical** | Extension Chrome Doctolib | Dashboard stats + IA |
| **Commerce** | QR Code avis | Dashboard + Campagnes |
| **Restauration** | App commande/paiement | Menu digital + Avis |

---

## 🏗️ ARCHITECTURE DES 3 AXES

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND CENTRAL (API)                        │
│              Node.js + PostgreSQL + Redis + S3                  │
├─────────────────────────────────────────────────────────────────┤
│ Auth │ Users │ Orders │ Payments │ Reviews │ AI │ Analytics     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
  ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
  │ AXE 1   │        │  AXE 2    │       │  AXE 3    │
  │Extension│        │   Site    │       │Application│
  │ Chrome  │        │ Vitrine + │       │  Mobile   │
  │Doctolib │        │ Dashboard │       │Restaurant │
  └─────────┘        └───────────┘       └───────────┘
```

---

# 🏥 AXE 1 — EXTENSION CHROME MÉDECINS

## 1.1 Fonctionnalités

### Injection Doctolib Pro
- Détection automatique du bouton "Vu" (fin de consultation)
- Modal de demande d'avis avec pré-remplissage patient
- Choix du canal : SMS ou Email

### Workflow Patient
1. Patient reçoit SMS/Email avec lien court
2. Page de feedback : note 1-5 étoiles
3. Si ≥4★ → Redirection Google Avis
4. Si <4★ → Formulaire feedback privé

### Administration
- Accès au dashboard (via Site Vitrine)
- Stats : taux de réponse, note moyenne, évolution
- Historique des demandes envoyées

## 1.2 Stack Technique
- **Manifest V3** (Chrome Extension)
- **Content Script** : injection UI Doctolib
- **Service Worker** : communication API
- **Storage** : chrome.storage pour config locale

## 1.3 Permissions requises
```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://pro.doctolib.fr/*",
    "https://api.votredomaine.com/*"
  ]
}
```

---

# 🌐 AXE 2 — SITE VITRINE + ESPACE CLIENT

## 2.1 Site Vitrine (Public)

### Pages principales

#### Page d'accueil
- Hero section impactante
- Proposition de valeur claire
- CTA vers inscription
- Témoignages clients

#### Page "Médecins"
- Problématique : avis négatifs non gérés
- Solution : extension + IA
- Comparaison vs Smilemood
- Tarifs secteur médical

#### Page "Commerces"
- Importance de l'e-réputation locale
- Solution QR code + Dashboard
- Cas d'usage : coiffeurs, garagistes, etc.
- Tarifs

#### Page "Restaurants"
- Double valeur : avis + commande/paiement
- Comparaison vs Sunday, Zelty
- Démo interactive
- Tarifs restauration

#### Page "Paiement Digital"
- Avantages du paiement à table
- Gains de temps serveurs
- Augmentation pourboires (+20% constaté)
- Click & Collect simplifié

#### Page Tarifs
- Tableau comparatif 3 plans
- Simulateur de ROI
- FAQ tarification

#### Page Blog/Ressources
- Articles SEO e-réputation
- Guides pratiques
- Études de cas

### Design Site Vitrine
- **Style** : Moderne, épuré, professionnel
- **Couleurs** : Noir / Gris / Bleu Doctolib (#107ACA)
- **Typo** : Inter ou Manrope (moderne, lisible)
- **Animations** : Subtiles, scroll reveal
- **Mobile-first** : 100% responsive

---

## 2.2 Espace Client (Dashboard)

### Authentification
- Inscription : Email + Nom établissement
- Email de confirmation avec MDP provisoire
- Changement MDP obligatoire à 1ère connexion
- Option : SSO Google/Apple

### Dashboard Principal

#### Widget Note Google
```
┌────────────────────────────────┐
│  ⭐ 4.7 / 5  (+0.2 ce mois)   │
│  📊 127 avis total            │
│  📈 Évolution sur 12 mois     │
└────────────────────────────────┘
```

#### Widget Activité
```
┌────────────────────────────────┐
│  📤 Demandes envoyées : 45    │
│  ✅ Réponses reçues : 38      │
│  📊 Taux de réponse : 84%     │
└────────────────────────────────┘
```

#### Widget Forfait
```
┌────────────────────────────────┐
│  📱 SMS restants : 18/50      │
│  📧 Emails restants : 89/200  │
│  🔄 Renouvellement : 15 jan   │
└────────────────────────────────┘
```

### Section Messages/Avis

| Date | Client | Note | Commentaire | Action |
|------|--------|------|-------------|--------|
| 06/01 | Marie D. | ⭐⭐⭐⭐⭐ | "Excellent accueil..." | [Répondre] |
| 05/01 | Jean P. | ⭐⭐⭐ | "Attente trop longue" | [Répondre] |

#### Réponse IA
- Bouton "Générer réponse IA"
- Suggestions personnalisées selon le ton du commentaire
- Modification avant envoi
- Historique des réponses

### Section Conseils IA
```
┌────────────────────────────────────────────────┐
│ 💡 Suggestions d'amélioration                  │
├────────────────────────────────────────────────┤
│ • Vos temps d'attente sont mentionnés 3x      │
│   → Suggestion : améliorer le planning        │
│                                                │
│ • 5 avis mentionnent la propreté (+)          │
│   → Continuez ainsi !                         │
│                                                │
│ • Aucun avis ce mois sur l'accueil            │
│   → Encouragez les retours sur ce point       │
└────────────────────────────────────────────────┘
```

### Section Campagnes (Option payante)
- Création campagne email/SMS
- Templates personnalisables
- Planification envoi
- Stats : taux d'ouverture, clics, conversions

### Section Paramètres
- Informations établissement
- Lien Google Avis (avec aide "?")
- Personnalisation messages SMS/Email
- Gestion abonnement
- Factures

---

## 2.3 Gestion des Abonnements

### Plans tarifaires

| | **STARTER** | **PRO** | **BUSINESS** |
|---|-------------|---------|--------------|
| **Prix/mois** | Gratuit* | 29€ | 79€ |
| **SMS/mois** | 20 | 100 | 500 |
| **Emails/mois** | 50 | 500 | Illimité |
| **Dashboard** | ✅ Basique | ✅ Complet | ✅ Complet |
| **Réponse IA** | ❌ | ✅ 50/mois | ✅ Illimité |
| **Conseils IA** | ❌ | ✅ | ✅ |
| **Campagnes** | ❌ | ❌ | ✅ |
| **Multi-établ.** | 1 | 3 | Illimité |
| **Support** | Email | Email + Chat | Prioritaire |

*Gratuit : offre découverte unique (non renouvelable)

### Intégration Paiement
- **Stripe** : CB, Apple Pay, Google Pay
- **PayPal** : option alternative
- Facturation automatique
- Gestion TVA européenne

---

# 📱 AXE 3 — APPLICATION MOBILE RESTAURANT

## 3.1 Application Client (iOS + Android)

### Onboarding
1. Téléchargement App Store / Play Store
2. Pas de compte obligatoire (guest mode)
3. Scan QR code = accès direct au restaurant

### Écran Menu

```
┌─────────────────────────────────────┐
│  🍽️ Restaurant Le Gourmet          │
│  Table 12                           │
├─────────────────────────────────────┤
│  [Entrées] [Plats] [Desserts] [🍷] │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ 🖼️ Photo plat              │   │
│  │ Salade César        12,50€ │   │
│  │ Laitue, poulet, parmesan   │   │
│  │ [- 0 +]        [Ajouter]   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ⚠️ INDISPONIBLE            │   │
│  │ Tartare de bœuf     18,00€ │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Écran Panier
```
┌─────────────────────────────────────┐
│  🛒 Votre commande                  │
├─────────────────────────────────────┤
│  Salade César x2          25,00€   │
│  Entrecôte                28,00€   │
│  Tiramisu                  8,50€   │
│  Vin rouge (bouteille)    24,00€   │
├─────────────────────────────────────┤
│  Sous-total               85,50€   │
│                                     │
│  [📤 Envoyer la commande]          │
└─────────────────────────────────────┘
```

### Écran Paiement

```
┌─────────────────────────────────────┐
│  💳 Paiement                        │
├─────────────────────────────────────┤
│  Total : 85,50€                     │
│                                     │
│  Combien de payeurs ?               │
│  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [+]       │
│                                     │
│  ─────────────────────────────────  │
│  Payeur 1/2 : 42,75€               │
│  ─────────────────────────────────  │
│                                     │
│  💝 Ajouter un pourboire ?          │
│  [ 0% ] [10%] [15%] [20%] [Autre]  │
│                                     │
│  Nouveau total : 49,16€            │
│                                     │
│  [Apple Pay]  [Google Pay]  [CB]   │
│              [PayPal]               │
└─────────────────────────────────────┘
```

### Fonctionnalités Paiement
- **Paiement partagé** : 1 à 10 personnes
- **Division équitable** ou par plat
- **Flash QR successifs** : chaque payeur scanne, paie sa part
- **Pourboire** : % configurable par le restaurateur
- **Méthodes** : Apple Pay, Google Pay, CB, PayPal

### Flow Click & Collect
1. Scan QR (ou lien web)
2. Mode "À emporter" sélectionné
3. Saisie nom/prénom
4. Commande + Paiement
5. Notification quand prêt

### Fin de repas
- Notification "Merci pour votre visite !"
- Invitation à laisser un avis Google
- Bonus : code promo prochaine visite (option)

---

## 3.2 Interface Restaurateur (Back-office)

### Dashboard Principal
```
┌─────────────────────────────────────────────────────────────┐
│  📊 Tableau de bord - Le Gourmet                           │
├───────────────┬───────────────┬───────────────┬─────────────┤
│  CA Jour      │  Commandes    │  Pourboires   │  Note       │
│  1 245,80€    │  47           │  186,30€      │  ⭐ 4.6     │
│  +12% vs hier │  +8 vs hier   │  Moy: 14.9%   │  +0.1       │
└───────────────┴───────────────┴───────────────┴─────────────┘
```

### Gestion Menu

#### Liste des plats
| Plat | Catégorie | Prix | Dispo | Actions |
|------|-----------|------|-------|---------|
| Salade César | Entrées | 12,50€ | 🟢 | [✏️] [🗑️] |
| Tartare | Plats | 18,00€ | 🔴 | [✏️] [🗑️] |

#### Édition plat
```
┌─────────────────────────────────────┐
│  ✏️ Modifier : Salade César         │
├─────────────────────────────────────┤
│  Nom : [Salade César            ]  │
│  Description : [Laitue, poulet..]  │
│  Prix : [12,50] €                  │
│  Catégorie : [Entrées ▼]           │
│  Photo : [📷 Changer]              │
│                                     │
│  Disponible : [🔘 OUI] [ ] NON     │
│                                     │
│  [Annuler]           [Enregistrer] │
└─────────────────────────────────────┘
```

### Suivi Commandes (Temps réel)

```
┌─────────────────────────────────────────────────────────────┐
│  🔔 NOUVELLES COMMANDES                                     │
├─────────────────────────────────────────────────────────────┤
│  ⏰ 14:32 - Table 8                                         │
│  • 2x Salade César                                          │
│  • 1x Entrecôte (saignant)                                  │
│  • 1x Frites                                                │
│  [✅ Accepter] [❌ Refuser]                                 │
├─────────────────────────────────────────────────────────────┤
│  ⏰ 14:28 - Click & Collect - Jean Dupont                   │
│  • 3x Burger maison                                         │
│  • 3x Frites                                                │
│  • 3x Coca                                                  │
│  [🔔 Notifier "Prêt"]                                       │
└─────────────────────────────────────────────────────────────┘
```

### Statistiques détaillées
- CA par jour/semaine/mois
- Plats les plus commandés
- Heures de pointe
- Pourboires moyens
- Évolution note Google
- Taux de conversion avis

### Paramètres Restaurant
- Informations (nom, adresse, horaires)
- Lien Google Maps / Avis
- % pourboire suggéré (5%, 10%, 15%, 20%)
- Notifications (email, push)
- QR codes à imprimer (PDF)
- Gestion équipe (accès multiples)

---

# 💻 STACK TECHNIQUE COMPLÈTE

## Backend Central

| Composant | Technologie | Usage |
|-----------|-------------|-------|
| **Runtime** | Node.js 20 LTS | Serveur principal |
| **Framework** | Express.js ou Fastify | API REST |
| **WebSocket** | Socket.io | Temps réel (commandes) |
| **BDD** | PostgreSQL | Données relationnelles |
| **Cache** | Redis | Sessions, cache |
| **Stockage** | AWS S3 / Cloudflare R2 | Images plats |
| **Email** | SendGrid / AWS SES | Transactionnel |
| **SMS** | Twilio / OVH | Envoi SMS |
| **Paiement** | Stripe | CB, Apple/Google Pay |
| **IA** | OpenAI GPT-4 | Réponses intelligentes |

## Frontend Web (Site + Dashboard)

| Composant | Technologie |
|-----------|-------------|
| **Framework** | Next.js 14 (App Router) |
| **UI** | Tailwind CSS + shadcn/ui |
| **State** | Zustand ou Jotai |
| **Forms** | React Hook Form + Zod |
| **Charts** | Recharts |
| **i18n** | next-intl (FR/EN/HE) |

## Application Mobile

| Composant | Technologie |
|-----------|-------------|
| **Framework** | React Native + Expo |
| **Navigation** | React Navigation |
| **UI** | NativeWind (Tailwind) |
| **State** | Zustand |
| **Paiement** | Stripe SDK |
| **Push** | Expo Notifications |
| **QR** | expo-barcode-scanner |

## Extension Chrome

| Composant | Technologie |
|-----------|-------------|
| **Manifest** | V3 |
| **Build** | Vite + CRXJS |
| **UI** | Vanilla JS ou React |

## Infrastructure

| Service | Provider |
|---------|----------|
| **Hosting API** | Railway / Render / AWS |
| **Hosting Web** | Vercel |
| **CDN** | Cloudflare |
| **Domaine** | OVH / Cloudflare |
| **Monitoring** | Sentry |
| **Analytics** | Plausible / PostHog |

---

# 💰 ESTIMATION DES COÛTS

## Coûts de développement (one-time)

| Module | Estimation | Si externalisé |
|--------|------------|----------------|
| Extension Chrome | 2-3 semaines | 3 000 - 5 000€ |
| Site Vitrine | 2-3 semaines | 4 000 - 8 000€ |
| Dashboard Client | 4-6 semaines | 8 000 - 15 000€ |
| App Mobile | 8-12 semaines | 20 000 - 40 000€ |
| Backend API | 4-6 semaines | 10 000 - 20 000€ |
| **TOTAL** | **20-30 semaines** | **45 000 - 88 000€** |

## Coûts récurrents (mensuels)

| Service | Coût estimé |
|---------|-------------|
| Hébergement (API + Web) | 50 - 200€ |
| BDD PostgreSQL | 20 - 50€ |
| Redis | 10 - 30€ |
| Stockage S3 | 10 - 50€ |
| SendGrid (emails) | 20 - 100€ |
| SMS (achat gros) | Variable |
| Stripe (2.9% + 0.25€/tx) | Variable |
| OpenAI API | 50 - 200€ |
| Domaine + SSL | 15€/an |
| **TOTAL FIXE** | **~150 - 500€/mois** |

## Coût unitaire par client

| Volume clients | Coût infra/client |
|----------------|-------------------|
| 10 clients | ~30€/client |
| 100 clients | ~5€/client |
| 500 clients | ~1-2€/client |
| 1000+ clients | <1€/client |

---

# 📅 ROADMAP DE DÉVELOPPEMENT

## Phase 1 : MVP Extension + Backend (Mois 1-2)
- [x] Backend Node.js basique
- [x] Extension Chrome fonctionnelle
- [x] Page feedback + redirection Google
- [x] Dashboard admin basique
- [ ] Design professionnel
- [ ] Tests utilisateurs

## Phase 2 : Site Vitrine (Mois 2-3)
- [ ] Design UI/UX complet
- [ ] Développement Next.js
- [ ] Pages sectorielles
- [ ] SEO optimisé
- [ ] Formulaire contact/démo

## Phase 3 : Dashboard Client (Mois 3-4)
- [ ] Système auth complet
- [ ] Dashboard stats
- [ ] Intégration Stripe
- [ ] Réponse IA (GPT)
- [ ] Multi-langue (FR/EN/HE)

## Phase 4 : Application Mobile (Mois 4-7)
- [ ] App React Native
- [ ] Menu digital
- [ ] Système commandes
- [ ] Paiement Stripe
- [ ] Paiement partagé
- [ ] Back-office restaurateur
- [ ] Tests + Publication stores

## Phase 5 : Optimisation (Mois 7-8)
- [ ] Analytics avancés
- [ ] Campagnes marketing
- [ ] A/B testing
- [ ] Optimisation performance
- [ ] Documentation API

---

# 🎨 CHARTE GRAPHIQUE (Proposition)

## Couleurs

| Usage | Couleur | Hex |
|-------|---------|-----|
| **Primaire** | Bleu Doctolib | #107ACA |
| **Secondaire** | Bleu foncé | #0A4D7C |
| **Accent** | Vert succès | #10B981 |
| **Warning** | Orange | #F59E0B |
| **Danger** | Rouge | #EF4444 |
| **Neutre clair** | Gris clair | #F3F4F6 |
| **Neutre** | Gris | #6B7280 |
| **Neutre foncé** | Gris foncé | #1F2937 |
| **Fond** | Noir | #111827 |

## Typographie

| Usage | Police | Poids |
|-------|--------|-------|
| **Titres** | Manrope | Bold (700) |
| **Corps** | Inter | Regular (400) |
| **Boutons** | Inter | Semi-bold (600) |
| **Code** | JetBrains Mono | Regular |

## Composants UI

- **Boutons** : Coins arrondis (8px), shadow subtile
- **Cards** : Fond légèrement plus clair, border radius 12px
- **Inputs** : Border 1px gris, focus bleu
- **Modales** : Backdrop blur, animation fade

---

# 🌍 MULTI-LANGUE

## Langues supportées

| Code | Langue | Marché |
|------|--------|--------|
| `fr` | Français | France, Belgique, Suisse |
| `en` | Anglais | UK, USA, International |
| `he` | Hébreu | Israël |

## Organisation fichiers i18n

```
/locales
  /fr
    common.json
    dashboard.json
    landing.json
  /en
    common.json
    dashboard.json
    landing.json
  /he
    common.json
    dashboard.json
    landing.json
```

## Gestion RTL (Hébreu)

- Direction automatique `dir="rtl"`
- Tailwind : classes `rtl:` pour ajustements
- Fonts adaptées (Heebo pour hébreu)

---

# 📊 ANALYSE CONCURRENTIELLE

## E-Réputation Médicale

| Critère | Smilemood | Notre solution |
|---------|-----------|----------------|
| Prix | 49-149€/mois | 29-79€/mois |
| Extension Doctolib | ✅ | ✅ |
| Réponse IA | ✅ | ✅ |
| Multi-langue | ❌ | ✅ FR/EN/HE |
| App mobile | ❌ | ✅ |

## Paiement Restaurant

| Critère | Sunday | Notre solution |
|---------|--------|----------------|
| Paiement table | ✅ | ✅ |
| Pourboires | ✅ | ✅ |
| Commande | ❌ | ✅ |
| Click & Collect | ❌ | ✅ |
| Gestion avis | Basique | ✅ Complet |
| Prix | 1.5%/tx | À définir |

## Menu Digital

| Critère | Zelty | Notre solution |
|---------|-------|----------------|
| Menu digital | ✅ | ✅ |
| Commande | ✅ | ✅ |
| Paiement intégré | ✅ | ✅ |
| E-réputation | ❌ | ✅ |
| Prix | 79-199€/mois | 79€/mois |

---

# ✅ PROCHAINES ÉTAPES IMMÉDIATES

1. **Définir le nom du produit**
   - Suggestions : ReviewBoost, AvisPlus, ReputaGo, DigiFeedback

2. **Créer le logo**
   - Brief designer ou génération IA

3. **Wireframes**
   - Maquettes basse fidélité des écrans clés
   - Validation du flow utilisateur

4. **Design System**
   - Composants UI réutilisables
   - Guide de style complet

5. **Priorisation développement**
   - Recommandation : Extension Chrome → Site Vitrine → Dashboard → App Mobile

---

# 📎 ANNEXES

## Templates SMS (1 segment = 160 caractères)

### Médecin
```
Dr [NOM]: Merci de votre visite! Votre avis compte: [LIEN] (2min)
```
**Longueur** : ~70 caractères ✅

### Restaurant
```
[RESTO]: Merci pour votre repas! Donnez-nous votre avis: [LIEN]
```
**Longueur** : ~65 caractères ✅

### Commerce
```
[COMMERCE] vous remercie! Partagez votre expérience: [LIEN]
```
**Longueur** : ~60 caractères ✅

## QR Code - Formats à générer

- **Autocollant table** : 5x5 cm
- **Chevalet table** : 10x15 cm
- **Affiche vitrine** : A4
- **Carte PVC** : Format CB

---

*Document généré le 7 janvier 2026*
*Version 3.0 - Spécifications complètes*








