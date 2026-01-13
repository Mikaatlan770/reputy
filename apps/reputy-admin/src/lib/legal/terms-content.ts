/**
 * Contenu des Conditions Générales d'Utilisation et de Vente
 */

export const COMPANY_INFO = {
  name: 'REPUTY SAS',
  legalForm: 'Société par Actions Simplifiée',
  capital: '10 000 €',
  rcs: 'Paris B XXX XXX XXX',
  siret: 'XXX XXX XXX XXXXX',
  tva: 'FR XX XXX XXX XXX',
  address: {
    street: '123 Rue de la République',
    postalCode: '75001',
    city: 'Paris',
    country: 'France',
  },
  email: 'contact@reputy.fr',
  phone: '+33 1 XX XX XX XX',
  dpo: 'dpo@reputy.fr',
};

export const TERMS_VERSION = '1.0';
export const TERMS_DATE = '11 janvier 2026';

export interface TermsSection {
  id: string;
  title: string;
  content: string;
}

export const KEY_POINTS = [
  {
    title: 'Abonnement et facturation',
    summary: 'Abonnement mensuel avec prélèvement SEPA automatique. Facturation au début de chaque période.',
  },
  {
    title: 'Résiliation',
    summary: 'Résiliation possible à tout moment avec un préavis d\'un mois. Aucun remboursement.',
  },
  {
    title: 'Données personnelles',
    summary: 'Vos données sont hébergées en UE et protégées conformément au RGPD. Vous êtes responsable des données de vos clients.',
  },
  {
    title: 'Responsabilité',
    summary: 'Obligation de moyens uniquement. Exclusion des dommages indirects. Disponibilité sans SLA garanti.',
  },
  {
    title: 'Contenu',
    summary: 'Vous êtes responsable des messages envoyés via la plateforme. Interdiction de tout contenu illicite.',
  },
];

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'objet',
    title: 'Article 1 - Objet',
    content: `Les présentes Conditions Générales d'Utilisation et de Vente (ci-après "CGU/CGV") régissent l'utilisation du service REPUTY (ci-après le "Service"), plateforme SaaS de gestion de la réputation en ligne et de collecte d'avis clients, éditée par ${COMPANY_INFO.name}.

Le Service permet notamment :
- La collecte d'avis clients via SMS, email, QR code ou NFC
- La gestion et le suivi des avis Google Business Profile
- L'analyse de la réputation en ligne
- La génération de réponses aux avis avec assistance IA
- La veille concurrentielle

L'utilisation du Service implique l'acceptation pleine et entière des présentes CGU/CGV.`,
  },
  {
    id: 'abonnement',
    title: 'Article 4 - Abonnements et tarifs',
    content: `Le Service est proposé sous forme d'abonnement mensuel. Plusieurs formules sont disponibles, détaillées sur le site de l'Éditeur.

**4.1 Durée**
L'abonnement est conclu pour une durée indéterminée, avec une période minimale d'engagement d'un (1) mois.

**4.2 Tarifs**
Les tarifs sont indiqués en euros hors taxes (HT). La TVA applicable est ajoutée lors de la facturation.
L'Éditeur se réserve le droit de modifier ses tarifs à tout moment. Les nouveaux tarifs s'appliquent à compter du renouvellement suivant, avec un préavis de trente (30) jours.

**4.3 Crédits inclus**
Chaque formule inclut un volume de crédits mensuels (SMS, emails, requêtes IA). Les crédits non utilisés ne sont pas reportables.`,
  },
  {
    id: 'paiement',
    title: 'Article 5 - Paiement',
    content: `**5.1 Modalités de paiement**

L'abonnement est payable par prélèvement SEPA automatique. Le Client doit signer un mandat de prélèvement SEPA électronique.

**5.2 Mandat SEPA**

En signant le mandat SEPA, le Client autorise l'Éditeur à émettre des ordres de prélèvement sur son compte bancaire. Le Client bénéficie d'un droit à remboursement dans les conditions prévues par la convention conclue avec sa banque.

**5.3 Facturation**

Les factures sont émises mensuellement, en début de période. Les factures sont envoyées par email et téléchargeables depuis l'espace client.`,
  },
  {
    id: 'resiliation',
    title: 'Article 6 - Résiliation',
    content: `**6.1 Résiliation par le Client**

Le Client peut résilier son abonnement à tout moment depuis son espace client, en respectant un préavis d'un (1) mois.

La résiliation prend effet à la fin de la période de préavis. Pendant cette période :
- L'abonnement reste actif et le Service accessible
- La facturation est maintenue
- Les sommes déjà versées ne sont pas remboursables

**6.2 Résiliation par l'Éditeur**

L'Éditeur peut résilier l'abonnement en cas de non-paiement après mise en demeure restée sans effet pendant 15 jours, ou en cas de violation grave des présentes CGU/CGV.`,
  },
  {
    id: 'responsabilite',
    title: 'Article 7 - Responsabilité',
    content: `**7.1 Obligation de moyens**

L'Éditeur s'engage à fournir le Service avec diligence et selon les règles de l'art, dans le cadre d'une obligation de moyens.

**7.2 Disponibilité**

L'Éditeur s'efforce d'assurer une disponibilité optimale du Service mais ne garantit aucun niveau de service (SLA). Des interruptions pour maintenance peuvent survenir.

**7.3 Limitation de responsabilité**

La responsabilité de l'Éditeur ne saurait être engagée pour les dommages indirects (perte de clientèle, perte de chiffre d'affaires, atteinte à l'image, etc.).

En tout état de cause, la responsabilité totale de l'Éditeur est limitée au montant des sommes versées par le Client au cours des douze (12) derniers mois.`,
  },
  {
    id: 'donnees',
    title: 'Article 8 - Données personnelles et RGPD',
    content: `**8.1 Rôles respectifs**

Dans le cadre de l'utilisation du Service :
- Le Client est responsable de traitement pour les données de ses propres clients (patients, consommateurs)
- L'Éditeur agit en qualité de sous-traitant au sens du RGPD

**8.2 Hébergement**

Les données sont hébergées exclusivement au sein de l'Union Européenne, chez des hébergeurs certifiés.

**8.3 Données de santé**

Le Service n'est PAS destiné au traitement de données de santé au sens du RGPD. Le Client s'interdit d'utiliser le Service pour collecter ou transmettre des informations relatives à l'état de santé, aux traitements ou aux diagnostics de ses clients.`,
  },
  {
    id: 'droit-applicable',
    title: 'Article 13 - Droit applicable et juridiction',
    content: `Les présentes CGU/CGV sont soumises au droit français.

En cas de litige, les parties s'efforceront de trouver une solution amiable dans un délai de trente (30) jours.

À défaut d'accord amiable, tout litige relatif à l'interprétation ou à l'exécution des présentes sera soumis à la compétence exclusive des tribunaux de Paris.`,
  },
];
