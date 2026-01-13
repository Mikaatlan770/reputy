# 📋 PLAN PROJET — Plateforme de Collecte d'Avis

**Date** : Janvier 2026  
**Version** : 2.0 (enrichie)

---

## 📌 VISION GLOBALE

Créer une **plateforme SaaS** de collecte d'avis clients, accessible à :
- **Professionnels de santé** (via extension Chrome Doctolib)
- **Restaurants** (via QR Code multifonction : menu + commande + paiement + avis)
- **Commerces** (via interface web manuelle + QR Code)

**Positionnement** : Plus simple et moins cher que la concurrence (SmileMood, Partoo, Guest Suite, Sunday).

---

## 🎯 CIBLES

| Segment | Besoin | Solution |
|---------|--------|----------|
| Médecins / Dentistes / Kinés (Doctolib) | Collecter des avis après RDV | Extension Chrome + SMS/Email |
| Restaurants / Bars / Cafés | Collecter des avis + menu + commande + paiement | QR Code multifonction |
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
  - [ ] Activer "Commander" (restaurants)

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
┌─────────────────────────────────────────────────────┐
│                                                     │
│        Bienvenue chez [Nom Restaurant]              │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │  📍 Table n°12  (ou "À emporter")           │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │     📖 Voir le menu / Commander             │   │
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

---

### 🍽️ FONCTIONNALITÉ AVANCÉE : COMMANDE + PAIEMENT + AVIS

#### Concept
Le QR Code devient un **système complet** pour restaurants :
1. Le client scanne le QR Code sur la table
2. Il **commande** directement depuis son téléphone
3. Il **paie** (avec pourboire optionnel)
4. Il **laisse un avis** après le paiement

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
│  │   🥜 Gluten │ 🔥 Végétarien                      │
│  ├─ Pâtes Carbonara ................. 14,50€  [+]   │
│  │   🥜 Gluten │ 🥚 Œuf                             │
│  └─ Burger Maison ................... 15,00€  [+]   │
│                                                     │
│  🍰 DESSERTS                                        │
│  ├─ Tiramisu ......................... 7,00€  [+]   │
│  └─ Panna Cotta ...................... 6,50€  [+]   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🛒 Panier : 3 articles              Total: 35,50€  │
│  [Voir mon panier]                                  │
└─────────────────────────────────────────────────────┘
```

#### Étape 3 : Détail produit avec options

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  🍕 Pizza Margherita — 12,00€                       │
│                                                     │
│  [📷 Photo du plat]                                 │
│                                                     │
│  Tomate, mozzarella, basilic, huile d'olive         │
│                                                     │
│  🥜 Contient : Gluten                               │
│  🌱 Végétarien                                      │
│                                                     │
│  ── Options ──────────────────────────────          │
│                                                     │
│  Suppléments :                                      │
│  ☐ Jambon ........................ +2,00€           │
│  ☐ Champignons ................... +1,50€           │
│  ☐ Double fromage ................ +2,50€           │
│                                                     │
│  Commentaire :                                      │
│  [Sans oignon svp________________]                  │
│                                                     │
│  Quantité : [-] 1 [+]                               │
│                                                     │
│  [Ajouter au panier — 12,00€]                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Étape 4 : Récapitulatif + Pourboire + Paiement

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
│  ── Paiement fractionné ? ──────────────────        │
│  ○ Payer la totalité                                │
│  ○ Diviser en 2 (22,55€ chacun)                     │
│  ○ Diviser en 3 (15,03€ chacun)                     │
│  ○ Payer en 3x sans frais (Alma)                    │
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

#### Étape 5 : Confirmation + Demande d'avis

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              ✅ Paiement réussi !                   │
│                                                     │
│  Commande #1234                                     │
│  Table n°12                                         │
│  Total payé : 45,10€ (dont 4,10€ de pourboire)      │
│                                                     │
│  ⏱️ Temps estimé : ~15 min                          │
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

#### Réglages Restaurant

| Option | Description |
|--------|-------------|
| **Activer la commande** | ☑️ Permettre aux clients de commander via QR Code |
| **Mode de service** | ○ Sur place ○ À emporter ○ Les deux |
| **Nombre de tables** | De 1 à [___] |
| **Pourboire** | ☑️ Activer |
| **% pourboire proposés** | [5%] [10%] [15%] (modifiable) |
| **Partage addition** | ☑️ Permettre de diviser la note |
| **Paiement fractionné** | ☑️ Activer (Alma, Klarna) |
| **Notifications** | ☑️ Email ☑️ Son tablette ☐ SMS |

#### Menu > Gérer le menu

| Fonctionnalité | Description |
|----------------|-------------|
| **Catégories** | Entrées, Plats, Desserts, Boissons... |
| **Produits** | Nom, description, prix, photo |
| **Allergènes** | Gluten, lactose, œuf, etc. |
| **Options/Suppléments** | Bacon +2€, Double cheese +2,50€... |
| **Disponibilité** | Marquer "épuisé" temporairement |
| **Horaires** | Menu midi / soir (optionnel) |
| **Happy Hour** | Prix réduits sur certains horaires |
| **Multi-langues** | Menu en FR/EN/ES (touristes) |

---

### 💰 FORFAITS RESTAURANT

| Plan | Prix | Inclus |
|------|------|--------|
| **Restaurant Start** | 49€/mois | Menu digital + Paiement + Avis + 50 SMS |
| **Restaurant Pro** | 99€/mois | + Commande en ligne + Pourboires + Partage addition + Stats |
| **Restaurant Premium** | 149€/mois | + Click & Collect + Multi-établissements + Intégration caisse |

#### Commission sur paiements (2 options)

| Modèle | Description |
|--------|-------------|
| **Sans commission** | Abonnement seul, 0% sur les transactions |
| **Avec commission** | Abonnement réduit + 1-2% par transaction |

*Note : Stripe prélève ~1,4% + 0,25€/transaction en plus.*

---

## 🩺 FONCTIONNALITÉS MÉDECINS / PROS DE SANTÉ

### Ce qu'on a déjà prévu
- Extension Doctolib (clic "Vu" → envoi)
- SMS/Email avec lien d'avis
- Page de feedback
- Portail admin

### Fonctionnalités supplémentaires à ajouter

| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| **Prise de RDV intégrée** | Bouton "Prendre RDV" sur la page d'avis (lien Doctolib) | ⭐⭐ |
| **Rappel automatique** | Si le patient n'a pas répondu après X jours → rappel SMS/email | ⭐⭐⭐ |
| **Segmentation patients** | Envoyer seulement aux patients "réguliers" ou "satisfaits" | ⭐⭐ |
| **Téléconsultation** | Lien vers une téléconsultation (Doctolib, Qare, etc.) | ⭐ |
| **Ordonnances digitales** | Envoi d'ordonnance par email après RDV | ⭐ |
| **Facturation** | Génération de factures/notes d'honoraires | ⭐ |
| **Synchronisation agenda** | Importer les RDV depuis Doctolib/Google Calendar | ⭐⭐ |
| **Multi-praticiens** | Un cabinet = plusieurs médecins, chacun ses stats | ⭐⭐ |
| **Questionnaire pré-RDV** | Envoyer un formulaire avant le RDV (symptômes, etc.) | ⭐⭐ |
| **Suivi post-consultation** | "Comment allez-vous 7 jours après votre RDV ?" | ⭐⭐ |
| **Statistiques détaillées** | Taux de réponse par praticien, par type de RDV | ⭐⭐ |
| **Export données** | Exporter les feedbacks en CSV/Excel | ⭐ |

### Forfaits Médecins

| Plan | Prix | Inclus |
|------|------|--------|
| **Santé Start** | 39€/mois | Extension Doctolib + 25 SMS + 100 emails + QR Code |
| **Santé Pro** | 69€/mois | + Rappels auto + IA réponses + Stats + Multi-praticiens |
| **Santé Groupe** | Sur devis | Multi-établissements + API + Support dédié |

---

## 🏪 FONCTIONNALITÉS COMMERCES (coiffeurs, garages, boutiques, etc.)

### Ce qu'on a déjà prévu
- Interface web manuelle (entrer tel/email → envoyer)
- QR Code basique
- SMS/Email avec lien d'avis
- Portail admin

### Fonctionnalités supplémentaires à ajouter

| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| **Prise de RDV en ligne** | Calendrier + créneaux dispo (comme Calendly/Planity) | ⭐⭐⭐ |
| **Rappel de RDV** | SMS/email 24h avant le RDV | ⭐⭐⭐ |
| **Carte de fidélité** | "5 coupes = 1 gratuite" (digitale) | ⭐⭐⭐ |
| **Promotions ciblées** | "C'est votre anniversaire → -20%" | ⭐⭐ |
| **Base clients** | Fiche client (nom, historique, préférences) | ⭐⭐⭐ |
| **Devis en ligne** | Générer et envoyer un devis (garages, artisans) | ⭐⭐ |
| **Paiement en ligne** | Régler une prestation à distance | ⭐⭐ |
| **Paiement fractionné** | Payer en 3x/4x (gros montants) | ⭐⭐ |
| **Signature électronique** | Signer un devis/contrat en ligne | ⭐ |
| **Galerie photos** | Montrer ses réalisations (coiffeur, tatoueur, etc.) | ⭐⭐ |
| **Formulaire contact** | "Demander un devis" depuis le QR Code | ⭐⭐ |
| **Horaires d'ouverture** | Afficher les horaires sur la page QR | ⭐⭐ |
| **Itinéraire** | Bouton "Y aller" (Google Maps) | ⭐⭐ |
| **Réseaux sociaux** | Liens Instagram, Facebook, etc. | ⭐ |
| **Click & Collect** | Réserver un produit, retirer en boutique | ⭐⭐ |
| **Catalogue produits** | Afficher les produits vendus (boutiques) | ⭐⭐ |
| **Marketing automatisé** | "Ça fait 30 jours qu'on ne vous a pas vu" → SMS promo | ⭐⭐ |

### Forfaits Commerces

| Plan | Prix | Inclus |
|------|------|--------|
| **Commerce Start** | 29€/mois | Interface manuelle + 25 SMS + 100 emails + QR Code |
| **Commerce Pro** | 59€/mois | + Carte fidélité + Rappels + IA + Stats |
| **Commerce Premium** | 99€/mois | + RDV en ligne + Paiement + Marketing auto |

---

## 🍽️ FONCTIONNALITÉS RESTAURANT (supplémentaires)

En plus du menu + commande + paiement + avis déjà prévus :

| Fonctionnalité | Description | Priorité |
|----------------|-------------|----------|
| **Partage d'addition** | "On divise en 2 ?" → chacun paie sa part | ⭐⭐⭐ |
| **Paiement fractionné** | Payer en 3x/4x (Alma, Klarna) | ⭐⭐ |
| **Click & Collect** | Commander en ligne, retirer sur place | ⭐⭐⭐ |
| **Livraison** | Intégration Uber Eats / Deliveroo ou propre système | ⭐⭐ |
| **Réservation de table** | Réserver en ligne (comme TheFork) | ⭐⭐ |
| **Carte de fidélité** | "10 repas = 1 offert" (digitale) | ⭐⭐⭐ |
| **Marketing automatisé** | "Ça fait 30 jours qu'on ne vous a pas vu" → SMS promo | ⭐⭐ |
| **Allergènes** | Afficher les allergènes sur le menu | ⭐⭐⭐ |
| **Photos des plats** | Menu avec photos appétissantes | ⭐⭐⭐ |
| **Options/Suppléments** | "Ajouter bacon +2€", "Cuisson de la viande ?" | ⭐⭐⭐ |
| **Commentaires commande** | "Sans oignon svp" | ⭐⭐⭐ |
| **Temps d'attente estimé** | "Votre commande sera prête dans ~15 min" | ⭐⭐ |
| **Notification cuisine** | Alerte sonore/visuelle quand nouvelle commande | ⭐⭐⭐ |
| **Gestion des stocks** | Marquer un plat "épuisé" automatiquement | ⭐⭐ |
| **Happy Hour** | Prix réduits sur certains horaires | ⭐ |
| **Multi-langues menu** | Menu en FR/EN/ES/etc. (touristes) | ⭐⭐ |
| **Intégration caisse** | Synchro avec Zelty, Lightspeed, Tiller, etc. | ⭐⭐ |
| **Imprimante cuisine** | Envoi direct des tickets en cuisine | ⭐⭐⭐ |

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

### Évolutions possibles IA
- Classification automatique des feedbacks (positif/neutre/négatif)
- Détection des sujets mentionnés (accueil, attente, prix, qualité...)
- Alertes intelligentes
- Résumé hebdomadaire des tendances
- Analyse du sentiment

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
- Menu restaurant

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
- CA et pourboires (restaurants)
- Commandes par jour/semaine/mois (restaurants)

### Graphiques
- Courbe d'évolution de la moyenne
- Histogramme des notes
- Volume d'envois par semaine/mois
- CA par période (restaurants)

---

## 🔔 ALERTES

### Types d'alertes
- **Avis négatif** (note 1-2-3) → notification email immédiate
- **Quota épuisé** → notification + suggestion upgrade
- **Nouvel avis Google** (si intégration API Google)
- **Nouvelle commande** (restaurants) → notification temps réel
- **Patient n'a pas répondu** (après X jours) → suggestion rappel

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
- Lié au compte SaaS (pas de token manuel)

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

## 📞 CONCURRENCE — Benchmark Complet

### Concurrents "Avis clients"

| Concurrent | Prix | Points forts | Points faibles |
|------------|------|--------------|----------------|
| SmileMood | 59-99€/mois | Extension Doctolib, IA | Prix élevé |
| Partoo | 100-200€/mois | Multi-établissements | Complexe, cher |
| Guest Suite | 100-300€/mois | Hôtellerie/resto | Trop cher pour petits |
| Trustpilot | 200-1000€/mois | Notoriété, SEO | E-commerce surtout |

### Concurrents "Restaurant" (Paiement & Commande)

#### Sunday (levée 100M€ en 2021)
**Spécialité** : Paiement à table par QR Code

| Fonctionnalité | Inclus chez Sunday |
|----------------|--------------------|
| QR Code sur table | ✅ |
| Voir l'addition | ✅ |
| Partage d'addition | ✅ |
| Pourboire intégré | ✅ |
| Paiement fractionné (3x) | ✅ |
| Intégration caisse | ✅ |
| Collecte d'avis | ✅ |
| Dashboard restaurateur | ✅ |
| Menu digital | ❌ |
| Commande en ligne | ❌ |
| Click & Collect | ❌ |

**Leur limite** : Ils font uniquement le paiement, pas la commande ni le menu.

#### Obypay
**Spécialité** : Commande & Paiement tout-en-un

| Fonctionnalité | Inclus chez Obypay |
|----------------|-------------------|
| Menu digital | ✅ |
| Commande sur place | ✅ |
| Click & Collect | ✅ |
| Livraison | ✅ |
| Paiement | ✅ |
| Carte de fidélité | ✅ |
| Marketing SMS/email | ✅ |
| Multi-établissements | ✅ |
| Collecte d'avis Google | ❌ |

**Leur limite** : Pas d'intégration forte avec Google Avis.

#### Zelty
**Spécialité** : Caisse enregistreuse + écosystème

| Fonctionnalité | Inclus chez Zelty |
|----------------|-------------------|
| Caisse tactile | ✅ |
| Gestion stocks | ✅ |
| Planning staff | ✅ |
| Click & Collect | ✅ |
| Livraison | ✅ |
| Reporting avancé | ✅ |
| Multi-sites | ✅ |
| QR Code client | ❌ |
| Collecte d'avis | ❌ |

**Leur limite** : Focus sur la caisse, pas sur l'expérience client.

### Concurrents "RDV" (Coiffeurs, Commerces)

| Concurrent | Spécialité | Prix |
|------------|-----------|------|
| Planity | RDV coiffure/beauté | 49-99€/mois |
| Calendly | RDV général | 12-20€/mois |
| SimplyBook | RDV + paiement | 10-50€/mois |

### Notre positionnement unique

| Notre avantage | Explication |
|----------------|-------------|
| **Prix** | 30-40% moins cher que la concurrence |
| **Tout-en-un** | Avis + Menu + Commande + Paiement (ce que Sunday ne fait pas) |
| **Multi-segments** | Médecins + Restaurants + Commerces (même plateforme) |
| **Multi-langues** | FR / EN / Hébreu dès le départ |
| **Extension Doctolib** | Avantage compétitif pour les pros de santé |
| **QR Code polyvalent** | Un QR = plusieurs fonctions |

---

## 💸 POURQUOI LES STARTUPS RESTO LÈVENT AUTANT D'ARGENT ?

### Le cas Sunday (100M€ levés en 2021)

Sunday a levé énormément parce que leur modèle a des **coûts massifs** :

| Poste de dépense | Explication | Coût estimé |
|------------------|-------------|-------------|
| **Équipe commerciale terrain** | Commerciaux qui démarchent restaurant par restaurant | 50-100k€/commercial/an |
| **Intégration caisse** | Développer des connecteurs pour chaque logiciel (Zelty, Lightspeed, Tiller...) | 100-500k€ par intégration |
| **Support technique 24/7** | Un resto bloqué un samedi soir = catastrophe | Équipe dédiée permanente |
| **Hardware subventionné** | Tablettes, bornes, imprimantes cuisine offertes | 200-500€/resto |
| **Marketing B2B** | Salons pro (Sirha, NRA Show), pub LinkedIn, événements | 500k-2M€/an |
| **Expansion internationale** | Bureaux à l'étranger, équipes locales, adaptation légale | Millions €/an |

### Le problème de leur modèle économique

```
Revenue = Commission (1-2%) × Volume de transactions
```

**Exemple concret** :
- Un restaurant fait 15 000€/mois via Sunday
- Commission Sunday : 1,5% = **225€/mois**
- Coût d'acquisition du client : ~500-1000€
- **Rentabilité** : 3-5 mois minimum

Avec un churn (clients qui partent) de 10-20%/an, c'est **très dur d'être rentable** → d'où les levées massives pour "tenir" jusqu'à l'échelle.

### Timeline des levées Sunday

| Date | Montant | Objectif |
|------|---------|----------|
| 2021 | 100M$ | Expansion US/UK, développement produit |
| 2023 | 18M€ | Consolidation, passage au tout-en-un |
| Nov 2025 | 21M$ | Doubler la taille d'ici été 2026 |

### Leçon pour nous

**Notre avantage** : On n'a PAS ces coûts !
- Pas de commercial terrain (vente en ligne)
- Pas d'intégration caisse complexe (on est standalone)
- Pas de hardware à offrir
- Coûts fixes très bas → **rentabilité rapide**

---

## 🌍 ANALYSE CONCURRENTIELLE PAR PAYS

### 🇫🇷 FRANCE

#### Médecins / Santé

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **SmileMood** | Extension Doctolib + IA | 59-99€/mois | Leader sur Doctolib |
| **Partoo** | Multi-établissements, réputation | 100-200€/mois | Plutôt grands groupes |
| **Guest Suite** | Avis + enquêtes satisfaction | 100-300€/mois | Orienté hôtellerie/santé |
| **Doctolib** (natif) | Demande d'avis intégrée | Inclus | Basique, pas de QR/SMS |
| **Trustpilot** | Avis génériques | 200€+/mois | Pas adapté santé |

**🎯 Notre avantage** : Extension Doctolib + prix bas + QR Code

#### Restaurants

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Sunday** | Paiement QR + pourboire | Commission 1-2% | Pas de commande/menu |
| **Obypay** | Commande + paiement + fidélité | 50-100€/mois + % | Complet mais cher |
| **Zelty** | Caisse + Click & Collect | 69-149€/mois | Focus caisse |
| **L'Addition** | Caisse iPad | 49-99€/mois | Pas de QR client |
| **Lightspeed** | Caisse + e-commerce | 69€+/mois | International |
| **Tiller** | Caisse + intégrations | Sur devis | Grands restos |

**🎯 Notre avantage** : Tout-en-un (avis + menu + commande + paiement) à prix bas

#### Commerces

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Planity** | RDV coiffure/beauté | 49-99€/mois | Niche coiffure |
| **Treatwell** | RDV beauté + marketplace | Commission | Prend des clients |
| **SimplyBook** | RDV général | 10-50€/mois | International |
| **Calendly** | RDV simple | 12-20€/mois | Pas de fidélité |
| **Partoo** | Réputation locale | 100€+/mois | Trop cher |

**🎯 Notre avantage** : Avis + RDV + fidélité en un seul outil

---

### 🇮🇱 ISRAËL

#### Médecins / Santé

| Concurrent | Spécialité | Notes |
|------------|------------|-------|
| **Clalit/Maccabi/Meuhedet** (HMO apps) | Systèmes internes des caisses de santé | Fermés, pas d'avis publics |
| **Camoni** (כמוני) | Comparateur médecins | Avis mais pas d'envoi automatique |
| **Google Reviews** | Avis génériques | Pas d'outil dédié santé |
| **ZocDoc** (tentative) | N'a pas percé en Israël | Marché différent |

**🎯 OPPORTUNITÉ** : Marché **quasi vierge** pour une solution dédiée aux médecins privés !

#### Restaurants

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Tabit** (טאביט) | Caisse + commande + paiement | Leader local | Très répandu, dominant |
| **Presto** | Commande + livraison | Commission | |
| **Wolt** | Livraison | Commission | Très populaire |
| **10bis** (תן ביס) | Tickets resto + livraison | B2B + commission | Subventionné employeurs |
| **Mishloha** (משלוחה) | Livraison | Commission | |

**⚠️ Challenge** : Tabit est TRÈS dominant. Stratégie : s'intégrer ou proposer niche (avis + fidélité).

#### Commerces

| Concurrent | Spécialité | Notes |
|------------|------------|-------|
| **Booksy** | RDV beauté (international) | Présent mais pas dominant |
| **Solutions locales** | Fragmenté | Pas de leader clair |
| **WhatsApp Business** | Communication | Utilisé massivement en Israël |

**🎯 OPPORTUNITÉ** : Marché **fragmenté**, pas de leader clair pour avis + RDV

---

### 🇺🇸 ÉTATS-UNIS

#### Médecins / Santé

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Zocdoc** | RDV + avis | Commission/patient ou abo | **LEADER** |
| **Healthgrades** | Annuaire + avis | Freemium | Très utilisé |
| **RateMDs** | Avis médecins | Gratuit | Canada/US |
| **Vitals** | Avis + assurances | Gratuit | |
| **WebMD** | Info santé + annuaire | Gratuit | |
| **Yelp Health** | Avis génériques | Freemium | |
| **Birdeye** | Réputation multi-plateforme | 299$+/mois | Cher |
| **Podium** | SMS + avis + paiement | 289$+/mois | Populaire |

**⚠️ Challenge** : Marché TRÈS concurrentiel. Zocdoc est le leader.

#### Restaurants

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Toast** | Caisse + commande + paiement | 0$ + commission ou 69$+/mois | **LEADER** |
| **Square** | Caisse + paiement | 0$ + 2,6%+10¢/transaction | Très populaire |
| **Clover** | Caisse + apps | Hardware + abo | |
| **Resy** | Réservation haut de gamme | Commission | Restos premium |
| **OpenTable** | Réservation | Commission/couvert | Leader résa |
| **Yelp** | Avis + réservation | Freemium + pub | |
| **DoorDash/Uber Eats** | Livraison | 15-30% commission | |

**⚠️ Challenge** : Toast et Square sont DOMINANTS. Marché très mature.

#### Commerces

| Concurrent | Spécialité | Prix | Notes |
|------------|------------|------|-------|
| **Podium** | SMS + avis + paiement | 289$+/mois | Populaire |
| **Birdeye** | Réputation + survey | 299$+/mois | Cher |
| **Yext** | SEO local + réputation | 199$+/mois | |
| **Vagaro** | RDV beauté | 25-85$/mois | |
| **Square Appointments** | RDV + paiement | 0-69$/mois | |
| **Yelp for Business** | Avis + pub | Pub payante | |

**🎯 Opportunité** : Prix élevés des concurrents = possibilité de casser les prix

---

## 📊 MATRICE D'OPPORTUNITÉS PAR PAYS

| Pays | Médecins | Restaurants | Commerces | Priorité |
|------|----------|-------------|-----------|----------|
| 🇫🇷 **France** | ✅ Facile | ⚠️ Moyen | ✅ Facile | **#1** |
| 🇮🇱 **Israël** | ✅✅ **VIERGE** | ❌ Difficile | ✅ Facile | **#2** |
| 🇺🇸 **USA** | ❌ Difficile | ❌ Difficile | ⚠️ Moyen | #3 |

### Légende
- ✅ = Peu de concurrence, opportunité claire
- ⚠️ = Concurrence moyenne, différenciation nécessaire
- ❌ = Forte concurrence, marché mature

---

## 🎯 STRATÉGIE RECOMMANDÉE PAR PAYS

### 🇫🇷 France (Priorité #1)

| Segment | Stratégie | Timeline |
|---------|-----------|----------|
| **Médecins** | Lancer en premier, SmileMood seul concurrent | Mois 1-6 |
| **Commerces** | Lancer en parallèle, Planity = niche coiffure | Mois 3-9 |
| **Restaurants** | Attendre, Sunday/Obypay bien installés | Mois 9+ |

### 🇮🇱 Israël (Priorité #2)

| Segment | Stratégie | Timeline |
|---------|-----------|----------|
| **Médecins** | **PRIORITÉ** — Marché vierge ! | Mois 6-12 |
| **Commerces** | Marché fragmenté, opportunité | Mois 9-15 |
| **Restaurants** | Éviter (Tabit domine) ou partenariat | Plus tard |

### 🇺🇸 USA (Priorité #3)

| Segment | Stratégie | Timeline |
|---------|-----------|----------|
| **Commerces** | Casser les prix (Podium/Birdeye = 300$/mois, nous = 50$) | Mois 12+ |
| **Médecins** | Difficile (Zocdoc), peut-être niche | Plus tard |
| **Restaurants** | Éviter (Toast/Square) | Non prioritaire |

---

## 🗓️ PLAN DE DÉVELOPPEMENT

### Phase 1 — MVP Complet ✅ (fait)
- [x] Backend Node.js
- [x] Extension Chrome Doctolib
- [x] Page de feedback patient
- [x] Portail admin basique

### Phase 2 — Produit (priorité)
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
- [ ] Rappels automatiques (si pas de réponse)
- [ ] Carte de fidélité digitale

### Phase 4 — Restaurant Complet
- [ ] QR Code avec choix (Menu / Commander / Payer / Avis)
- [ ] Menu digital avec photos et allergènes
- [ ] Options/suppléments sur les produits
- [ ] Commande avec envoi en cuisine
- [ ] Paiement intégré (Stripe Connect)
- [ ] Partage d'addition
- [ ] Pourboire intégré
- [ ] Click & Collect

### Phase 5 — Commerces Avancé
- [ ] Prise de RDV en ligne
- [ ] Rappels de RDV
- [ ] Galerie de réalisations
- [ ] Devis en ligne
- [ ] Paiement en ligne

### Phase 6 — Scale
- [ ] Multi-établissements
- [ ] Rôles utilisateurs (admin/secrétaire)
- [ ] API publique
- [ ] Widget site web (afficher ses avis)
- [ ] Intégration caisses (Zelty, Lightspeed, Tiller)
- [ ] Imprimante cuisine

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

## 📈 RÉSUMÉ DES FORFAITS

### Médecins / Pros de Santé

| Plan | Prix | Inclus |
|------|------|--------|
| Santé Start | 39€/mois | Extension Doctolib + 25 SMS + 100 emails + QR Code |
| Santé Pro | 69€/mois | + Rappels auto + IA + Stats + Multi-praticiens |
| Santé Groupe | Sur devis | Multi-établissements + API + Support dédié |

### Restaurants

| Plan | Prix | Inclus |
|------|------|--------|
| Restaurant Start | 49€/mois | Menu digital + Paiement + Avis + 50 SMS |
| Restaurant Pro | 99€/mois | + Commande + Pourboires + Partage + Stats |
| Restaurant Premium | 149€/mois | + Click & Collect + Multi-sites + Intégration caisse |

### Commerces

| Plan | Prix | Inclus |
|------|------|--------|
| Commerce Start | 29€/mois | Interface manuelle + 25 SMS + 100 emails + QR Code |
| Commerce Pro | 59€/mois | + Carte fidélité + Rappels + IA + Stats |
| Commerce Premium | 99€/mois | + RDV en ligne + Paiement + Marketing auto |

---

*Document généré le 5 janvier 2026 — Version 2.0 enrichie*

