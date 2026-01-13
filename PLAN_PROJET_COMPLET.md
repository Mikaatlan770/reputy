# 📋 PLAN PROJET — Plateforme de Collecte d'Avis

**Date** : Janvier 2026  
**Version** : 1.0

---

## 📌 VISION GLOBALE

Créer une **plateforme SaaS** de collecte d'avis clients, accessible à :
- **Professionnels de santé** (via extension Chrome Doctolib)
- **Commerces et restaurants** (via interface web manuelle + QR Code)

**Positionnement** : Plus simple et moins cher que la concurrence (SmileMood, Partoo, Guest Suite).

---

## 🎯 CIBLES

| Segment | Besoin | Solution |
|---------|--------|----------|
| Médecins / Dentistes / Kinés (Doctolib) | Collecter des avis après RDV | Extension Chrome + SMS/Email |
| Restaurants / Bars / Cafés | Collecter des avis + afficher menu + paiement | QR Code multifonction |
| Commerces (coiffeurs, garages, etc.) | Collecter des avis facilement | Interface web manuelle + QR Code |

---

## 💰 MODÈLE ÉCONOMIQUE

### Forfaits proposés

| Plan | Prix | Inclus |
|------|------|--------|
| **Free** (une fois) | 0€ | 20 SMS + 100 emails pour tester |
| **Start** | 39-49€/mois | 25 SMS + 100 emails/mois + QR Code + IA (10 réponses) |
| **Boost** | 79-99€/mois | 100 SMS + 250 emails/mois + QR Code + IA (50 réponses) + Stats avancées |

### Coûts estimés par client

| Poste | Coût unitaire |
|-------|---------------|
| SMS France | ~0,05€/SMS |
| Email | ~0,001€/email |
| IA (réponse) | ~0,001€/appel |
| **Coût variable/client/mois** (forfait Start) | **~1,40€** |
| **Marge brute** (si vendu 49€) | **~97%** |

---

## 🏗️ ARCHITECTURE TECHNIQUE

### 3 composants principaux

```
┌─────────────────────────────────────────────────────────────────┐
│                     SITE VITRINE (public)                       │
│                     www.nom-du-produit.fr                       │
├─────────────────────────────────────────────────────────────────┤
│  Accueil, Fonctionnalités, Tarifs, E-réputation, Contact        │
│  → Objectif : convaincre et convertir                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ESPACE CLIENT (privé)                        │
│                    app.nom-du-produit.fr                        │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard, Envoyer, Messages, QR Code, Réglages, Forfait       │
│  → Objectif : gérer son compte et collecter des avis            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 EXTENSION CHROME (Doctolib)                     │
├─────────────────────────────────────────────────────────────────┤
│  Clic "Vu" → Modale → Envoi SMS/Email automatique               │
│  → Objectif : simplifier pour les pros de santé                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🌐 SITE VITRINE — Structure

### Pages

| Page | Contenu |
|------|---------|
| **Accueil** | Hero + Problème + Solution + Comment ça marche + CTA |
| **Fonctionnalités** | Liste détaillée des features |
| **Tarifs** | 3 plans avec comparatif |
| **E-réputation** | Article éducatif (SEO + confiance) |
| **Contact** | Formulaire |
| **Connexion** | Lien vers l'espace client |

### Contenu clé "E-réputation"

- 88% des consommateurs font confiance aux avis en ligne
- 1 étoile de plus = +5-9% de chiffre d'affaires
- 72% des patients choisissent leur médecin selon les avis Google
- Un avis négatif non traité peut coûter 30 clients

---

## 👤 ESPACE CLIENT — Fonctionnalités

### Menu (sidebar)

```
🏠 Dashboard        → Vue d'ensemble
✉️ Envoyer          → Envoyer une demande d'avis
📬 Messages         → Historique des feedbacks
📊 Statistiques     → Graphiques et tendances
🔲 QR Code          → Télécharger / configurer
⚙️ Réglages         → Nom, lien Google, templates, langue
💳 Mon forfait      → Gérer abonnement (Stripe)
❓ Aide             → Tutoriels et FAQ
🚪 Déconnexion
```

### Détail des pages

#### Dashboard
- Moyenne Google (si configuré)
- Derniers feedbacks reçus
- Quotas restants (SMS/emails)
- Alertes (avis négatifs)

#### Envoyer
- Champ téléphone ET/OU email
- Bouton "Envoyer la demande d'avis"
- Confirmation + lien copié

#### Messages
- Liste des feedbacks (date, note ⭐, commentaire)
- Bouton "Suggérer une réponse (IA)"
- Bouton "Ouvrir Google pour répondre"
- Filtre par note / date / statut

#### QR Code
- Aperçu du QR Code
- Télécharger PNG / PDF (haute résolution)
- Options :
  - [ ] Activer "Voir le menu" (restaurants)
  - [ ] Activer "Payer l'addition" (restaurants)

#### Réglages
- Nom affiché (ex: "Cabinet Dr Michael ATLAN")
- Lien Google Avis (avec bouton "?" pour tutoriel)
- Templates SMS / Email personnalisables
- Langue (Français / English / עברית)
- Catégorie (Médecin, Restaurant, Commerce, etc.)

#### Mon forfait
- Plan actuel + quotas utilisés
- Bouton "Changer de forfait"
- Historique des factures
- Moyen de paiement (Stripe)

---

## 📱 QR CODE — Fonctionnalités

### Pour tous les clients
- QR Code unique généré à l'inscription
- Pointe vers : `https://domaine.fr/qr/CODE-CLIENT`
- Téléchargeable en PNG / PDF
- Peut être imprimé sur carte PVC (offert ou en option)

### Pour les restaurants (fonctionnalités avancées)

#### Écran après scan du QR Code

```
┌─────────────────────────────────────────┐
│                                         │
│      Bienvenue chez [Nom Restaurant]    │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │     📖 Voir le menu             │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │     💳 Régler ma table          │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │     ⭐ Laisser un avis          │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

#### Fonctionnalité "Menu"
- Le restaurateur upload son menu (PDF ou crée un menu digital)
- Le client clique "Voir le menu" → affiche le menu
- Mise à jour possible depuis l'espace client

#### Fonctionnalité "Paiement" (Régler ma table)
- Le restaurateur configure :
  - Numéro de table (optionnel)
  - Lien vers son logiciel métier (ou intégration directe)
- Le client :
  1. Clique "Régler ma table"
  2. Entre le montant ou sélectionne sa table
  3. Paie via Apple Pay / Google Pay / CB
  4. Après paiement → **proposition automatique de laisser un avis**

#### Flux complet restaurant — Version BASIQUE

```
Client scanne QR Code
        │
        ▼
┌─ Voir le menu ────────────────────────────────┐
│                                               │
└───────────────────────────────────────────────┘
        │
        ▼
┌─ Régler ma table ─────────────────────────────┐
│  1. Choix du montant / table                  │
│  2. Paiement (Apple Pay, Google Pay, CB)      │
│  3. Confirmation                              │
└───────────────────────────────────────────────┘
        │
        ▼
┌─ Laisser un avis ─────────────────────────────┐
│  "Merci pour votre paiement !                 │
│   Prenez 30 sec pour nous laisser un avis"    │
│                                               │
│  ⭐⭐⭐⭐⭐ (note 1-5)                         │
│  [Commentaire optionnel]                      │
│  [Envoyer]                                    │
└───────────────────────────────────────────────┘
```

---

### 🍽️ FONCTIONNALITÉ AVANCÉE : COMMANDE + PAIEMENT + AVIS

#### Concept
Le QR Code devient un **système complet** pour restaurants :
1. Le client scanne le QR Code sur la table
2. Il **commande** directement depuis son téléphone
3. Il **paie** (avec pourboire optionnel)
4. Il **laisse un avis** après le paiement

#### Écran d'accueil après scan (version avancée)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│        Bienvenue chez [Nom Restaurant]              │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │  📍 Table n°12  (ou "À emporter")           │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │     📖 Commander                            │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │     💳 Régler ma table                      │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │     ⭐ Laisser un avis                      │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Étape 1 : Identification (sur place ou à emporter)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Comment souhaitez-vous être servi ?                │
│                                                     │
│  ○ Sur place — Table n° [____]                      │
│                                                     │
│  ○ À emporter — Votre nom : [____________]          │
│                                                     │
│  [Continuer →]                                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Étape 2 : Menu & Commande

```
┌─────────────────────────────────────────────────────┐
│  📖 MENU — Restaurant Bella Italia                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🥗 ENTRÉES                                         │
│  ├─ Salade César ..................... 8,50€  [+]   │
│  ├─ Bruschetta ....................... 6,00€  [+]   │
│  └─ Soupe du jour .................... 5,50€  [+]   │
│                                                     │
│  🍝 PLATS                                           │
│  ├─ Pizza Margherita ................ 12,00€  [+]   │
│  ├─ Pâtes Carbonara ................. 14,50€  [+]   │
│  ├─ Risotto aux champignons ......... 13,00€  [+]   │
│  └─ Burger Maison ................... 15,00€  [+]   │
│                                                     │
│  🍰 DESSERTS                                        │
│  ├─ Tiramisu ......................... 7,00€  [+]   │
│  └─ Panna Cotta ...................... 6,50€  [+]   │
│                                                     │
│  🍷 BOISSONS                                        │
│  ├─ Coca-Cola ........................ 3,50€  [+]   │
│  ├─ Eau minérale ..................... 2,50€  [+]   │
│  └─ Verre de vin rouge ............... 5,00€  [+]   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🛒 Panier : 3 articles              Total: 35,50€  │
│  [Voir mon panier]                                  │
└─────────────────────────────────────────────────────┘
```

#### Étape 3 : Récapitulatif + Pourboire + Paiement

```
┌─────────────────────────────────────────────────────┐
│  🧾 RÉCAPITULATIF                                   │
│                                                     │
│  📍 Table n°12                                      │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  1x Pizza Margherita .............. 12,00€  │    │
│  │  1x Burger Maison ................. 15,00€  │    │
│  │  2x Coca-Cola ...................... 7,00€  │    │
│  │  1x Tiramisu ....................... 7,00€  │    │
│  ├─────────────────────────────────────────────┤    │
│  │  Sous-total ....................... 41,00€  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  💝 Ajouter un pourboire ? (optionnel)              │
│                                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐            │
│  │  5%  │ │ 10%  │ │ 15%  │ │ Autre €  │            │
│  │ 2,05€│ │ 4,10€│ │ 6,15€│ │ [____]   │            │
│  └──────┘ └──────┘ └──────┘ └──────────┘            │
│                                                     │
│  ════════════════════════════════════════════════   │
│  💰 TOTAL À PAYER : 45,10€                          │
│  ════════════════════════════════════════════════   │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │          Payer avec Apple Pay              │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │          Payer avec Google Pay             │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │          Payer par carte bancaire          │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Étape 4 : Confirmation + Demande d'avis

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              ✅ Paiement réussi !                   │
│                                                     │
│  Commande #1234                                     │
│  Table n°12                                         │
│  Total payé : 45,10€ (dont 4,10€ de pourboire)      │
│                                                     │
│  Votre commande est transmise en cuisine.           │
│  Temps estimé : ~15 min                             │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🙏 Merci pour votre visite !                       │
│                                                     │
│  Aidez-nous à nous améliorer en laissant            │
│  un petit avis (30 secondes) :                      │
│                                                     │
│         ☆   ☆   ☆   ☆   ☆                          │
│         1   2   3   4   5                           │
│                                                     │
│  [Commentaire (optionnel)...]                       │
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │  Envoyer l'avis  │  │   Non merci      │         │
│  └──────────────────┘  └──────────────────┘         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### 🖥️ ESPACE CLIENT RESTAURATEUR

#### Réglages > Restaurant

| Option | Description |
|--------|-------------|
| **Activer la commande** | ☑️ Permettre aux clients de commander via QR Code |
| **Mode de service** | ○ Sur place ○ À emporter ○ Les deux |
| **Nombre de tables** | De 1 à [___] |
| **Pourboire** | ☑️ Activer |
| **% pourboire proposés** | [5%] [10%] [15%] (modifiable) |
| **Notifications** | ☑️ Email ☑️ Son tablette ☐ SMS |

#### Menu > Gérer le menu

| Fonctionnalité | Description |
|----------------|-------------|
| **Catégories** | Entrées, Plats, Desserts, Boissons... |
| **Produits** | Nom, description, prix, photo, allergènes |
| **Disponibilité** | Marquer "épuisé" temporairement |
| **Horaires** | Menu midi / soir (optionnel) |

#### Dashboard Restaurant

```
┌─────────────────────────────────────────────────────┐
│  📊 DASHBOARD — Aujourd'hui                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │     12     │ │   847€     │ │    68€     │       │
│  │ commandes  │ │    CA      │ │ pourboires │       │
│  └────────────┘ └────────────┘ └────────────┘       │
│                                                     │
│  🔔 Commandes en cours                              │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🟢 Table 5  │ 14:32 │ 35,00€ │ 2 plats    │    │
│  │ 🟡 Table 12 │ 14:28 │ 52,50€ │ En attente │    │
│  │ 🟢 Emporter │ 14:25 │ 15,00€ │ "Martin"   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  🟢 Payé   🟡 En attente                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### 💰 FORFAITS RESTAURANT

| Plan | Prix | Inclus |
|------|------|--------|
| **Restaurant Start** | 49€/mois | Menu digital + Paiement + Avis + 50 SMS |
| **Restaurant Pro** | 99€/mois | + Commande en ligne + Pourboires + Stats |
| **Restaurant Premium** | 149€/mois | + Multi-établissements + Intégration caisse |

#### Commission sur paiements (2 options)

| Modèle | Description |
|--------|-------------|
| **Sans commission** | Abonnement seul, 0% sur les transactions |
| **Avec commission** | Abonnement réduit + 1-2% par transaction |

*Note : Stripe prélève ~1,4% + 0,25€/transaction en plus.*

---

## 🤖 INTELLIGENCE ARTIFICIELLE

### Fonctionnalité "Réponse suggérée"
- Le client reçoit un feedback (positif ou négatif)
- Il clique "Suggérer une réponse"
- L'IA génère une réponse professionnelle et empathique
- Le client peut modifier puis copier vers Google

### Prompt IA (exemple)
```
Tu es un assistant pour un établissement professionnel.
Génère une réponse courte, professionnelle et empathique
au commentaire suivant. Reste poli et remercie le client.
Commentaire : "[commentaire du client]"
Note : [X]/5
```

### Coût IA
- ~0,001€ par réponse générée (API OpenAI GPT-4o-mini)
- Négligeable

### Évolutions possibles
- Classification automatique des feedbacks (positif/neutre/négatif)
- Détection des sujets mentionnés (accueil, attente, prix, qualité...)
- Alertes intelligentes

---

## 🌍 MULTI-LANGUE

### Langues prévues
1. **Français** (défaut)
2. **English**
3. **עברית** (Hébreu — RTL)

### Ce qui doit être traduit
- Interface espace client
- Extension Chrome (modale)
- Templates SMS / Email
- Page de feedback (patient/client)
- Site vitrine

### Implémentation
- Fichiers de traduction (i18n)
- Le client choisit sa langue dans les réglages
- Les messages aux patients peuvent être dans une langue différente

---

## 🔲 QR CODE PVC (physique)

### Offre
- Carte PVC avec QR Code personnalisé
- Format carte de visite ou plus grand
- Offert dans les forfaits payants OU option à ~5-10€

### Coût de revient
- Impression : ~0,50-1€/carte (selon volume)
- Envoi postal : ~1-2€
- **Total : ~2-3€ par client**

---

## 📊 STATISTIQUES & REPORTING

### Métriques affichées
- Moyenne des notes (évolution sur 30/90 jours)
- Nombre d'envois (SMS/email)
- Taux de réponse (% de feedbacks reçus)
- Répartition des notes (1-2-3 vs 4-5)
- Nombre d'avis Google générés (estimation)

### Graphiques
- Courbe d'évolution de la moyenne
- Histogramme des notes
- Volume d'envois par semaine/mois

---

## 🔔 ALERTES

### Types d'alertes
- **Avis négatif** (note 1-2-3) → notification email immédiate
- **Quota épuisé** → notification + suggestion upgrade
- **Nouvel avis Google** (si intégration API Google)

---

## 💳 PAIEMENT (Stripe)

### Flux d'inscription
1. Client crée son compte (gratuit)
2. Reçoit ses 20 SMS + 100 emails gratuits
3. Quand épuisé → proposition "Choisir un forfait"
4. Paiement via Stripe (CB, Apple Pay, Google Pay)
5. Abonnement mensuel récurrent

### Gestion des quotas
- Chaque envoi décrémente le compteur
- Compteur remis à zéro chaque mois (date anniversaire)
- Si quota épuisé avant fin de mois → bloquer l'envoi + proposer upgrade

---

## 📱 EXTENSION CHROME (Doctolib)

### Fonctionnement
1. Le pro de santé installe l'extension
2. Il configure : URL backend + Token + Nom affiché
3. Sur Doctolib, quand il clique "Vu" → modale s'ouvre
4. Il choisit SMS ou Email → clique Envoyer
5. Le patient reçoit le lien et peut donner son avis

### Améliorations prévues
- Pré-remplissage automatique (nom/email/tel depuis Doctolib)
- Nom du cabinet = celui du compte (pas à ressaisir)
- Toast avec "Copier le lien" + "Ouvrir"

---

## 📋 TEMPLATES SMS (1 segment = 160 caractères)

### Exemples optimisés (sans accents/emoji)

**T1 — Ultra court**
```
{NOM}: Votre avis compte. 30 sec: {LIEN}
```

**T2 — Poli**
```
Bonjour, {NOM}. Merci de donner votre avis (30 sec): {LIEN}
```

**T3 — Après RDV**
```
Suite a votre RDV chez {NOM}, votre avis (30 sec): {LIEN}
```

**T4 — Restaurant**
```
Merci pour votre visite chez {NOM}. Votre avis: {LIEN}
```

### Règles pour rester à 1 segment
- ≤ 160 caractères (GSM-7)
- Pas d'accents (é→e, à→a, etc.)
- Pas d'emoji
- Lien court (6-8 caractères d'ID)

---

## 🗓️ PLAN DE DÉVELOPPEMENT

### Phase 1 — MVP Complet ✅ (fait)
- [x] Backend Node.js
- [x] Extension Chrome Doctolib
- [x] Page de feedback patient
- [x] Portail admin basique

### Phase 2 — Produit (à faire)
- [ ] Site vitrine (landing page)
- [ ] Refonte espace client (design moderne + sidebar)
- [ ] Inscription complète (nom établissement, catégorie)
- [ ] Intégration Stripe (paiement + quotas)
- [ ] QR Code (génération + téléchargement)

### Phase 3 — Fonctionnalités avancées
- [ ] IA réponses suggérées
- [ ] Multi-langue (FR/EN/HE)
- [ ] Statistiques & graphiques
- [ ] Alertes (email si avis négatif)

### Phase 4 — Restaurant
- [ ] QR Code avec choix (Menu / Payer / Avis)
- [ ] Menu digital (upload PDF ou création)
- [ ] Paiement intégré (Stripe Connect)
- [ ] Flux : Paiement → Demande d'avis automatique

### Phase 5 — Scale
- [ ] Multi-établissements
- [ ] Rôles utilisateurs (admin/secrétaire)
- [ ] API publique
- [ ] Widget site web (afficher ses avis)

---

## 📞 CONCURRENCE — Benchmark

| Concurrent | Prix | Points forts | Points faibles |
|------------|------|--------------|----------------|
| SmileMood | 59-99€/mois | Extension Doctolib, IA | Prix élevé |
| Partoo | 100-200€/mois | Multi-établissements | Complexe, cher |
| Guest Suite | 100-300€/mois | Hôtellerie/resto | Trop cher pour petits |
| Trustpilot | 200-1000€/mois | Notoriété, SEO | E-commerce surtout |

### Notre positionnement
- **Prix** : 30-40% moins cher
- **Simplicité** : Interface épurée, prise en main rapide
- **Spécialisation** : Santé (Doctolib) + Commerces locaux + Restaurants
- **Innovation** : QR Code multifonction (menu + paiement + avis)

---

## ✅ CHECKLIST AVANT LANCEMENT

- [ ] Nom de domaine choisi et acheté
- [ ] Hébergement configuré
- [ ] Site vitrine en ligne
- [ ] Espace client fonctionnel
- [ ] Stripe configuré (test + prod)
- [ ] Extension Chrome publiée sur Chrome Web Store
- [ ] Templates SMS/Email validés
- [ ] CGV / CGU / Politique de confidentialité
- [ ] Compte Twilio (SMS) approvisionné
- [ ] Compte SendGrid (emails) configuré

---

## 📝 NOTES

- **Nom du produit** : à définir
- **Logo** : à créer
- **Couleurs** : Noir / Gris / Bleu (style Doctolib)

---

*Document généré le 5 janvier 2026*

