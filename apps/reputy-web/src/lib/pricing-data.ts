// ════════════════════════════════════════════════════════════════
// DONNÉES TARIFAIRES REPUTY
// Source de vérité unique pour tous les tarifs
// Version: 2.0.0 - Mise à jour grille tarifaire complète
// ════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────

export type PlanId = 'bronze' | 'argent' | 'or' | 'platinum'

export interface Plan {
  id: PlanId
  name: string
  subtitle: string
  price: number
  period: string
  isTrial: boolean
  isPopular: boolean
  quotas: {
    sms: number
    email: number
    ai: number
    qr: number
    nfc: number
    qrScans: number  // Scans par QR
    nfcScans: number // Scans par NFC
  }
  included: string[]
  excluded: string[]
  cta: string
  ctaHref: string
}

export interface Addon {
  id: string
  name: string
  description: string
  price: number | null
  isComingSoon: boolean
  features?: string[]
  isPopular?: boolean
}

export interface Vertical {
  id: string
  name: string
  tagline: string
  description: string
  icon: string
  isAvailable: boolean
  href?: string
}

// ────────────────────────────────────────────────────────────────
// FORFAITS REPUTY HEALTH
// ────────────────────────────────────────────────────────────────

export const HEALTH_PLANS: Plan[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    subtitle: 'Gratuit, sans limite de durée',
    price: 0,
    period: 'Gratuit',
    isTrial: false,
    isPopular: false,
    quotas: { sms: 0, email: 0, ai: 0, qr: 1, nfc: 0, qrScans: 50, nfcScans: 0 },
    included: [
      'Accès complet au ReputyBoard',
      'Réponses aux avis via le board',
      '1 QR Code (50 scans inclus)',
      'Accès aux campagnes via packs',
    ],
    excluded: [
      'SMS inclus',
      'Emails inclus',
      'Réponses IA',
      'Module Doctolib',
      'Reporting avancé',
    ],
    cta: 'Commencer gratuitement',
    ctaHref: '/signup?plan=bronze',
  },
  {
    id: 'argent',
    name: 'Argent',
    subtitle: 'Le plus populaire',
    price: 59,
    period: '/mois HT',
    isTrial: false,
    isPopular: true,
    quotas: { sms: 100, email: 500, ai: 0, qr: 3, nfc: 1, qrScans: 500, nfcScans: 500 },
    included: [
      '1 licence Reputy Health',
      '100 SMS / mois',
      '500 emails / mois',
      'Accès complet au ReputyBoard',
      '3 QR Codes (500 scans chacun)',
      '1 Tag NFC (500 scans)',
      'Module Doctolib',
      'Multi-utilisateurs',
      'Rapport trimestriel',
    ],
    excluded: [],
    cta: 'Choisir Argent',
    ctaHref: '/signup?plan=argent',
  },
  {
    id: 'or',
    name: 'Or',
    subtitle: 'Pour les cabinets actifs',
    price: 99,
    period: '/mois HT',
    isTrial: false,
    isPopular: false,
    quotas: { sms: 200, email: 1000, ai: 75, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
    included: [
      '1 licence Reputy Health',
      '200 SMS / mois',
      '1 000 emails / mois',
      '75 réponses IA / mois',
      'Accès complet au ReputyBoard',
      '10 QR Codes (500 scans chacun)',
      '3 Tags NFC (500 scans)',
      'Module Doctolib',
      'Multi-utilisateurs',
      'Rapport mensuel',
    ],
    excluded: [],
    cta: 'Choisir Or',
    ctaHref: '/signup?plan=or',
  },
  {
    id: 'platinum',
    name: 'Platinum',
    subtitle: 'Performance maximale',
    price: 129,
    period: '/mois HT',
    isTrial: false,
    isPopular: false,
    quotas: { sms: 400, email: 2000, ai: 150, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
    included: [
      '1 licence Reputy Health',
      '400 SMS / mois',
      '2 000 emails / mois',
      '150 réponses IA / mois',
      'Accès complet au ReputyBoard',
      '10 QR Codes (500 scans chacun)',
      '3 Tags NFC (500 scans)',
      'Module Doctolib',
      'Multi-utilisateurs',
      'Rapport mensuel avancé',
      'Support prioritaire',
    ],
    excluded: [],
    cta: 'Choisir Platinum',
    ctaHref: '/signup?plan=platinum',
  },
]

// ────────────────────────────────────────────────────────────────
// PACKS ADDITIONNELS
// ────────────────────────────────────────────────────────────────

export const ADDONS = {
  sms: [
    {
      id: 'sms-150',
      name: 'Pack SMS 150',
      description: '150 SMS supplémentaires',
      price: 29,
      isComingSoon: false,
      features: ['150 SMS'],
    },
    {
      id: 'sms-300',
      name: 'Pack SMS 300',
      description: '300 SMS supplémentaires',
      price: 49,
      isComingSoon: false,
      features: ['300 SMS'],
      isPopular: true,
    },
  ] as Addon[],
  email: [
    {
      id: 'email-1000',
      name: 'Pack Email 1000',
      description: '1 000 emails supplémentaires',
      price: 19,
      isComingSoon: false,
      features: ['1 000 emails'],
    },
    {
      id: 'email-2000',
      name: 'Pack Email 2000',
      description: '2 000 emails supplémentaires',
      price: 39,
      isComingSoon: false,
      features: ['2 000 emails'],
      isPopular: true,
    },
  ] as Addon[],
  ia: [
    {
      id: 'ia-mini',
      name: 'Pack IA Mini',
      description: '25 réponses IA',
      price: 19,
      isComingSoon: false,
      features: ['25 réponses IA'],
    },
    {
      id: 'ia-maxi',
      name: 'Pack IA Maxi',
      description: '75 réponses IA',
      price: 39,
      isComingSoon: false,
      features: ['75 réponses IA'],
      isPopular: true,
    },
  ] as Addon[],
  qrNfc: [
    {
      id: 'qr',
      name: 'QR Code',
      description: 'QR code supplémentaire (500 scans)',
      price: 5,
      isComingSoon: false,
    },
    {
      id: 'nfc',
      name: 'Tag NFC',
      description: 'Tag NFC supplémentaire (500 scans)',
      price: 15,
      isComingSoon: false,
    },
  ] as Addon[],
}

// Alias pour rétrocompatibilité
export const ADDONS_LEGACY = {
  communication: [
    ...ADDONS.sms,
    ...ADDONS.email,
  ],
  ia: ADDONS.ia,
  qrNfc: ADDONS.qrNfc,
}

// ────────────────────────────────────────────────────────────────
// VERTICALES
// ────────────────────────────────────────────────────────────────

export const VERTICALS: Vertical[] = [
  {
    id: 'health',
    name: 'Reputy Health',
    tagline: 'Pour les professionnels de santé',
    description: 'Médecins, dentistes, kinés, cliniques... Gérez votre réputation en conformité avec la déontologie médicale.',
    icon: 'Stethoscope',
    isAvailable: true,
    href: '/health',
  },
  {
    id: 'food',
    name: 'Reputy Food',
    tagline: 'Pour la restauration',
    description: 'Restaurants, cafés, brasseries... Boostez vos avis Google et TripAdvisor.',
    icon: 'UtensilsCrossed',
    isAvailable: false,
  },
  {
    id: 'business',
    name: 'Reputy Business',
    tagline: 'Pour les entreprises',
    description: 'PME, franchises, multi-sites... Centralisez la gestion de votre réputation.',
    icon: 'Building2',
    isAvailable: false,
  },
]

// ────────────────────────────────────────────────────────────────
// FONCTIONNALITÉS
// ────────────────────────────────────────────────────────────────

export const FEATURES = [
  {
    icon: 'Star',
    title: 'Collecte d\'avis',
    description: 'Envoyez des demandes d\'avis personnalisées par SMS ou email.',
  },
  {
    icon: 'Shield',
    title: 'Conforme santé',
    description: 'Adapté à la déontologie médicale. Données hébergées en France.',
  },
  {
    icon: 'BarChart3',
    title: 'ReputyBoard',
    description: 'Tableau de bord complet pour suivre votre réputation.',
  },
  {
    icon: 'Sparkles',
    title: 'Assistant IA',
    description: 'Suggestions de réponses personnalisées pour chaque avis.',
  },
  {
    icon: 'Chrome',
    title: 'Module Doctolib',
    description: 'Envoyez des demandes d\'avis directement depuis Doctolib, en 1 clic.',
  },
  {
    icon: 'Globe',
    title: 'Widget d\'avis',
    description: 'Affichez vos meilleurs avis sur votre site en quelques minutes.',
  },
]

// ────────────────────────────────────────────────────────────────
// ÉTAPES "COMMENT ÇA MARCHE"
// ────────────────────────────────────────────────────────────────

export const STEPS = [
  {
    step: '01',
    title: 'Envoyez une demande',
    description: 'Après chaque consultation, envoyez une demande d\'avis par SMS ou email en 1 clic.',
  },
  {
    step: '02',
    title: 'Le patient répond',
    description: 'Il attribue une note et peut laisser un commentaire sur son expérience.',
  },
  {
    step: '03',
    title: 'Gérez vos retours',
    description: 'Consultez tous les retours sur votre ReputyBoard et répondez facilement.',
  },
]

// ────────────────────────────────────────────────────────────────
// TÉMOIGNAGES
// ────────────────────────────────────────────────────────────────

export const TESTIMONIALS = [
  {
    content: 'Reputy a transformé notre relation avec les patients. Notre note Google est passée de 4.1 à 4.7 en 3 mois.',
    author: 'Dr. Marie Dupont',
    role: 'Médecin généraliste, Paris',
    rating: 5,
  },
  {
    content: 'L\'assistant IA est un gain de temps incroyable. Je réponds à tous mes avis en quelques clics.',
    author: 'Cabinet dentaire Smile',
    role: 'Lyon',
    rating: 5,
  },
  {
    content: 'Simple, efficace, et le support client est réactif. Je recommande vivement.',
    author: 'Dr. Laurent Martin',
    role: 'Kinésithérapeute, Bordeaux',
    rating: 5,
  },
]

// ────────────────────────────────────────────────────────────────
// STATISTIQUES
// ────────────────────────────────────────────────────────────────

export const STATS = [
  { value: '+0.6', label: 'pts de note moyenne' },
  { value: '3x', label: 'plus d\'avis Google' },
  { value: '92%', label: 'taux de satisfaction' },
  { value: '2min', label: 'temps de réponse IA' },
]

// ────────────────────────────────────────────────────────────────
// FAQ SANTÉ
// ────────────────────────────────────────────────────────────────

export const HEALTH_FAQ = [
  {
    question: 'Comment fonctionne la collecte d\'avis ?',
    answer: 'Après chaque rendez-vous, envoyez une demande par SMS ou email via le ReputyBoard ou l\'extension Doctolib. Le patient reçoit un lien pour donner son avis.',
  },
  {
    question: 'Est-ce conforme au RGPD et à la déontologie médicale ?',
    answer: 'Oui, Reputy est 100% conforme au RGPD. Les données sont hébergées en France et notre solution est adaptée aux spécificités du secteur médical.',
  },
  {
    question: 'Le forfait Bronze est-il vraiment gratuit ?',
    answer: 'Oui ! Le forfait Bronze est gratuit et sans limite de durée. Vous avez accès au ReputyBoard et à 1 QR code (50 scans). Pour envoyer des SMS ou emails, vous pouvez acheter des packs à la demande.',
  },
  {
    question: 'Comment fonctionne l\'extension Doctolib ?',
    answer: 'L\'extension s\'installe sur les navigateurs Chrome des postes souhaités (secrétariat, accueil). Elle permet d\'envoyer des demandes d\'avis en 1 clic depuis Doctolib. Disponible à partir du forfait Argent.',
  },
  {
    question: 'Puis-je installer l\'extension sur plusieurs postes ?',
    answer: 'Oui, vous pouvez installer l\'extension sur autant de postes que nécessaire. Chaque installation est traçable et révocable depuis votre ReputyBoard.',
  },
  {
    question: 'Que se passe-t-il si j\'ai besoin de plus de SMS ou emails ?',
    answer: 'Vous pouvez acheter des packs additionnels à tout moment. Les crédits s\'ajoutent instantanément à votre compte et ne se réinitialisent pas.',
  },
  {
    question: 'Puis-je changer de forfait à tout moment ?',
    answer: 'Oui, vous pouvez upgrader ou downgrader votre forfait à tout moment. Le changement prend effet immédiatement avec prorata.',
  },
]

// ────────────────────────────────────────────────────────────────
// CONSTANTES QUOTAS (pour le backend)
// ────────────────────────────────────────────────────────────────

export const PLAN_QUOTAS = {
  bronze: { sms: 0, email: 0, ai: 0, qr: 1, nfc: 0, qrScans: 50, nfcScans: 0 },
  argent: { sms: 100, email: 500, ai: 0, qr: 3, nfc: 1, qrScans: 500, nfcScans: 500 },
  or: { sms: 200, email: 1000, ai: 75, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
  platinum: { sms: 400, email: 2000, ai: 150, qr: 10, nfc: 3, qrScans: 500, nfcScans: 500 },
} as const

export const PLAN_PRICES_HT = {
  bronze: 0,
  argent: 5900,    // 59€ en centimes
  or: 9900,        // 99€ en centimes
  platinum: 12900, // 129€ en centimes
} as const

export const PACK_PRICES_HT = {
  'sms-150': 2900,     // 29€
  'sms-300': 4900,     // 49€
  'email-1000': 1900,  // 19€
  'email-2000': 3900,  // 39€ (2000 emails)
  'ia-mini': 1900,     // 19€ (25 réponses IA)
  'ia-maxi': 3900,     // 39€ (75 réponses IA)
  'qr': 500,           // 5€
  'nfc': 1500,         // 15€
} as const
