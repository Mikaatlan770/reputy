// ===== DONNÉES MOCK REPUTY =====

import type { 
  Location, Review, Campaign, Competitor, Thread, User, 
  NfcTag, CollectChannel, KpiData, AnalyticsData, StarDistribution,
  ResponseTemplate, AuditLog
} from '@/types'

// ===== ÉTABLISSEMENTS =====
export const locations: Location[] = [
  {
    id: 'loc-1',
    name: 'Cabinet Dr. Atlan Michael',
    address: '15 Rue de la Santé',
    city: 'Paris',
    country: 'France',
    googleConnected: true,
    googleSessionValid: true,
    reviewLink: 'https://search.google.com/local/writereview?placeid=ChIJBYUcTs175kcRxEZXfCa2ZnE',
    healthMode: true,
    createdAt: '2024-01-15',
    establishmentType: 'health',
    specialty: 'generaliste',
    lat: 48.8566,
    lng: 2.3522,
  },
  {
    id: 'loc-2',
    name: 'Pharmacie du Centre',
    address: '42 Avenue Victor Hugo',
    city: 'Lyon',
    country: 'France',
    googleConnected: true,
    googleSessionValid: false,
    reviewLink: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDe...',
    healthMode: true,
    createdAt: '2024-02-20',
    establishmentType: 'health',
    specialty: 'pharmacien',
    lat: 45.7640,
    lng: 4.8357,
  },
  {
    id: 'loc-3',
    name: 'Le Petit Bistrot',
    address: '8 Place du Marché',
    city: 'Bordeaux',
    country: 'France',
    googleConnected: true,
    googleSessionValid: true,
    reviewLink: 'https://search.google.com/local/writereview?placeid=ChIJLf3t...',
    healthMode: false,
    createdAt: '2024-03-10',
    establishmentType: 'restaurant',
    lat: 44.8378,
    lng: -0.5792,
  },
]

// ===== AVIS =====
export const reviews: Review[] = [
  {
    id: 'rev-1',
    locationId: 'loc-1',
    platform: 'google',
    rating: 5,
    author: 'Marie Dupont',
    date: '2026-01-08',
    content: 'Excellent médecin, très à l\'écoute et professionnel. Le cabinet est moderne et propre. Je recommande vivement !',
    responded: true,
    responseText: 'Merci beaucoup pour votre retour Marie ! Nous sommes ravis que votre expérience ait été positive.',
    responseDate: '2026-01-08',
    tags: ['professionnel', 'accueil', 'propreté'],
    sentiment: 'positive',
  },
  {
    id: 'rev-2',
    locationId: 'loc-1',
    platform: 'google',
    rating: 4,
    author: 'Pierre Martin',
    date: '2026-01-07',
    content: 'Très bon praticien. Seul bémol : l\'attente était un peu longue (30 min). Mais la consultation était de qualité.',
    responded: false,
    tags: ['attente', 'qualité'],
    sentiment: 'positive',
  },
  {
    id: 'rev-3',
    locationId: 'loc-1',
    platform: 'google',
    rating: 2,
    author: 'Sophie Lefebvre',
    date: '2026-01-06',
    content: 'Déçue par l\'accueil. La secrétaire était peu aimable et j\'ai attendu 45 minutes sans explication.',
    responded: false,
    tags: ['accueil', 'attente'],
    sentiment: 'negative',
    assignedTo: 'user-1',
  },
  {
    id: 'rev-4',
    locationId: 'loc-1',
    platform: 'google',
    rating: 5,
    author: 'Jean-Claude Bernard',
    date: '2026-01-05',
    content: 'Médecin compétent et humain. Prend le temps d\'expliquer clairement. Cabinet bien situé.',
    responded: true,
    responseText: 'Merci pour ce témoignage encourageant !',
    responseDate: '2026-01-05',
    tags: ['compétence', 'communication'],
    sentiment: 'positive',
  },
  {
    id: 'rev-5',
    locationId: 'loc-2',
    platform: 'google',
    rating: 5,
    author: 'Isabelle Moreau',
    date: '2026-01-09',
    content: 'Pharmacie de quartier au top ! Personnel toujours disponible pour conseiller. Large choix de produits.',
    responded: false,
    tags: ['conseil', 'disponibilité'],
    sentiment: 'positive',
  },
  {
    id: 'rev-6',
    locationId: 'loc-2',
    platform: 'google',
    rating: 3,
    author: 'Marc Dubois',
    date: '2026-01-04',
    content: 'Service correct mais souvent en rupture de stock sur certains médicaments courants.',
    responded: false,
    tags: ['stock', 'service'],
    sentiment: 'neutral',
  },
  {
    id: 'rev-7',
    locationId: 'loc-3',
    platform: 'google',
    rating: 5,
    author: 'Claire Fontaine',
    date: '2026-01-10',
    content: 'Une vraie pépite ! Cuisine maison délicieuse, accueil chaleureux, prix raisonnables. On reviendra !',
    responded: true,
    responseText: 'Merci Claire ! Nous avons hâte de vous revoir. À très bientôt au Petit Bistrot !',
    responseDate: '2026-01-10',
    tags: ['cuisine', 'accueil', 'prix'],
    sentiment: 'positive',
  },
  {
    id: 'rev-8',
    locationId: 'loc-3',
    platform: 'google',
    rating: 4,
    author: 'Thomas Girard',
    date: '2026-01-08',
    content: 'Très bon restaurant. Le plat du jour est toujours une bonne surprise. Service un peu lent aux heures de pointe.',
    responded: false,
    tags: ['cuisine', 'service', 'attente'],
    sentiment: 'positive',
  },
  {
    id: 'rev-9',
    locationId: 'loc-3',
    platform: 'google',
    rating: 1,
    author: 'Laurent Petit',
    date: '2026-01-03',
    content: 'Très déçu. Réservation non honorée, nous avons dû attendre 40 minutes pour une table alors qu\'on avait réservé.',
    responded: false,
    tags: ['réservation', 'attente'],
    sentiment: 'negative',
  },
]

// ===== CAMPAGNES =====
export const campaigns: Campaign[] = [
  {
    id: 'camp-1',
    locationId: 'loc-1',
    name: 'Relance post-consultation Janvier',
    channel: 'sms',
    status: 'active',
    sent: 127,
    clicks: 89,
    reviewsGenerated: 23,
    conversionRate: 18.1,
    createdAt: '2026-01-02',
    template: 'Bonjour {prenom}, merci pour votre visite au Cabinet Dr. Atlan. Votre avis compte ! {lien}',
  },
  {
    id: 'camp-2',
    locationId: 'loc-1',
    name: 'Campagne Email Q1',
    channel: 'email',
    status: 'scheduled',
    scheduledAt: '2026-01-15',
    sent: 0,
    clicks: 0,
    reviewsGenerated: 0,
    conversionRate: 0,
    createdAt: '2026-01-10',
  },
  {
    id: 'camp-3',
    locationId: 'loc-3',
    name: 'Fidélisation clients',
    channel: 'email',
    status: 'completed',
    sent: 450,
    clicks: 112,
    reviewsGenerated: 34,
    conversionRate: 7.5,
    createdAt: '2025-12-15',
  },
]

// ===== CONCURRENTS =====
export const competitors: Competitor[] = [
  {
    id: 'comp-1',
    locationId: 'loc-1',
    name: 'Cabinet Dr. Martin',
    placeId: 'ChIJ...',
    rating: 4.6,
    reviewsCount: 89,
    trend30d: 5,
    distanceKm: 0.8,
    address: '22 Rue Montmartre, Paris',
  },
  {
    id: 'comp-2',
    locationId: 'loc-1',
    name: 'Centre Médical République',
    placeId: 'ChIJ...',
    rating: 4.2,
    reviewsCount: 234,
    trend30d: 12,
    distanceKm: 1.2,
    address: '5 Place de la République, Paris',
  },
  {
    id: 'comp-3',
    locationId: 'loc-3',
    name: 'Chez Marcel',
    placeId: 'ChIJ...',
    rating: 4.4,
    reviewsCount: 156,
    trend30d: 8,
    distanceKm: 0.3,
    address: '12 Place du Marché, Bordeaux',
  },
]

// ===== UTILISATEURS =====
export const users: User[] = [
  {
    id: 'user-1',
    civility: 'Dr',
    firstName: 'Michael',
    lastName: 'ATLAN',
    email: 'michael@cabinet-atlan.fr',
    role: 'admin',
    locationIds: ['loc-1', 'loc-2', 'loc-3'],
  },
  {
    id: 'user-2',
    civility: 'Mme',
    firstName: 'Sophie',
    lastName: 'DURAND',
    email: 'sophie@cabinet-atlan.fr',
    role: 'manager',
    locationIds: ['loc-1'],
  },
  {
    id: 'user-3',
    civility: 'M',
    firstName: 'Marc',
    lastName: 'LEROY',
    email: 'marc@petitbistrot.fr',
    role: 'staff',
    locationIds: ['loc-3'],
  },
]

// ===== TAGS NFC =====
export const nfcTags: NfcTag[] = [
  {
    id: 'nfc-1',
    locationId: 'loc-1',
    name: 'Comptoir accueil',
    shortUrl: 'https://rpty.io/abc123',
    scans: 234,
    conversions: 45,
    createdAt: '2025-11-15',
    active: true,
  },
  {
    id: 'nfc-2',
    locationId: 'loc-3',
    name: 'Table 1',
    shortUrl: 'https://rpty.io/def456',
    scans: 89,
    conversions: 12,
    createdAt: '2025-12-01',
    active: true,
  },
]

// ===== CANAUX DE COLLECTE =====
export const collectChannels: CollectChannel[] = [
  { id: 'ch-1', type: 'qr', locationId: 'loc-1', sent: 500, clicks: 234, reviewsGenerated: 67, conversionRate: 13.4 },
  { id: 'ch-2', type: 'nfc', locationId: 'loc-1', sent: 234, clicks: 189, reviewsGenerated: 45, conversionRate: 19.2 },
  { id: 'ch-3', type: 'sms', locationId: 'loc-1', sent: 127, clicks: 89, reviewsGenerated: 23, conversionRate: 18.1 },
  { id: 'ch-4', type: 'email', locationId: 'loc-1', sent: 450, clicks: 112, reviewsGenerated: 28, conversionRate: 6.2 },
  { id: 'ch-5', type: 'doctolib', locationId: 'loc-1', sent: 89, clicks: 67, reviewsGenerated: 19, conversionRate: 21.3 },
]

// ===== KPIs =====
export const kpiData: Record<string, KpiData> = {
  'loc-1': {
    averageRating: 4.3,
    totalReviews: 156,
    reviews30Days: 12,
    unrepliedReviews: 3,
    responseRate: 87,
    avgResponseTime: 4.2,
  },
  'loc-2': {
    averageRating: 4.1,
    totalReviews: 89,
    reviews30Days: 8,
    unrepliedReviews: 5,
    responseRate: 72,
    avgResponseTime: 12.5,
  },
  'loc-3': {
    averageRating: 4.5,
    totalReviews: 234,
    reviews30Days: 18,
    unrepliedReviews: 2,
    responseRate: 94,
    avgResponseTime: 2.1,
  },
}

// ===== ANALYTICS =====
export const analyticsData: AnalyticsData[] = [
  { period: '2025-12-01', reviews: 4, rating: 4.2 },
  { period: '2025-12-08', reviews: 6, rating: 4.5 },
  { period: '2025-12-15', reviews: 3, rating: 4.0 },
  { period: '2025-12-22', reviews: 8, rating: 4.3 },
  { period: '2025-12-29', reviews: 5, rating: 4.6 },
  { period: '2026-01-05', reviews: 7, rating: 4.4 },
  { period: '2026-01-12', reviews: 9, rating: 4.2 },
]

export const starDistribution: StarDistribution[] = [
  { stars: 5, count: 89, percentage: 57 },
  { stars: 4, count: 42, percentage: 27 },
  { stars: 3, count: 15, percentage: 10 },
  { stars: 2, count: 6, percentage: 4 },
  { stars: 1, count: 4, percentage: 2 },
]

// ===== TEMPLATES =====
export const responseTemplates: ResponseTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Remerciement pro',
    tone: 'professional',
    healthMode: false,
    content: 'Merci pour votre retour. Nous sommes ravis que votre expérience ait été positive. Au plaisir de vous revoir.',
  },
  {
    id: 'tpl-2',
    name: 'Remerciement chaleureux',
    tone: 'warm',
    healthMode: false,
    content: 'Un grand merci pour ce beau témoignage ! Votre satisfaction est notre plus belle récompense. À très bientôt ! 😊',
  },
  {
    id: 'tpl-3',
    name: 'Réponse courte',
    tone: 'short',
    healthMode: false,
    content: 'Merci pour votre avis !',
  },
  {
    id: 'tpl-4',
    name: 'Santé - Remerciement',
    tone: 'professional',
    healthMode: true,
    content: 'Merci pour votre retour. N\'hésitez pas à nous contacter directement pour toute question. Bien cordialement.',
  },
  {
    id: 'tpl-5',
    name: 'Santé - Avis négatif',
    tone: 'professional',
    healthMode: true,
    content: 'Nous vous remercions pour votre retour. Nous vous invitons à nous contacter directement au cabinet afin d\'échanger sur votre expérience. Bien cordialement.',
  },
]

// ===== THREADS (INBOX) =====
export const threads: Thread[] = [
  {
    id: 'thread-1',
    locationId: 'loc-1',
    type: 'message',
    subject: 'Question sur les horaires',
    status: 'open',
    priority: 'low',
    lastMessageAt: '2026-01-10T14:30:00',
    messages: [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        author: 'Client',
        authorType: 'user',
        content: 'Bonjour, êtes-vous ouvert le samedi matin ?',
        createdAt: '2026-01-10T14:30:00',
      },
    ],
  },
  {
    id: 'thread-2',
    locationId: 'loc-1',
    type: 'support',
    subject: 'Problème connexion Google',
    status: 'pending',
    priority: 'high',
    lastMessageAt: '2026-01-09T10:00:00',
    assignedTo: 'user-2',
    messages: [
      {
        id: 'msg-2',
        threadId: 'thread-2',
        author: 'Équipe',
        authorType: 'team',
        content: 'Nous avons détecté que votre session Google a expiré. Veuillez vous reconnecter.',
        createdAt: '2026-01-09T10:00:00',
      },
    ],
  },
]

// ===== AUDIT LOG =====
export const auditLogs: AuditLog[] = [
  { id: 'log-1', userId: 'user-1', userName: 'Dr Michael ATLAN', action: 'Réponse avis', target: 'rev-1', createdAt: '2026-01-08T15:30:00' },
  { id: 'log-2', userId: 'user-2', userName: 'Mme Sophie DURAND', action: 'Création campagne', target: 'camp-2', createdAt: '2026-01-10T09:00:00' },
  { id: 'log-3', userId: 'user-1', userName: 'Dr Michael ATLAN', action: 'Ajout concurrent', target: 'comp-1', createdAt: '2026-01-05T11:20:00' },
]

