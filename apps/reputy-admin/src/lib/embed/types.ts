// ===== TYPES EMBED WIDGET & BADGE =====

/**
 * Mode de sélection des avis pour le widget
 */
export type EmbedMode = 'AUTO' | 'MANUAL'

/**
 * Tri des avis en mode AUTO
 */
export type EmbedSort = 'RECENT' | 'BEST'

/**
 * Type d'événement de tracking
 */
export type EmbedEventType = 'IMPRESSION' | 'CLICK'

/**
 * Source d'un avis (Google ou Reputy interne)
 */
export type ReviewSource = 'google' | 'reputy'

/**
 * Règles automatiques de sélection des avis
 */
export interface EmbedAutoRules {
  minRating: number       // 4 ou 5 (défaut: 4)
  requireText: boolean    // Exiger un commentaire (défaut: true)
  maxItems: number        // Max avis affichés (défaut: 10, max: 20)
  sort: EmbedSort         // Tri: récent ou meilleur
}

/**
 * Options d'affichage du widget
 */
export interface EmbedDisplayOptions {
  initialsOnly: true      // TOUJOURS true (anonymisation obligatoire)
  showStars: boolean      // Afficher les étoiles
  showDate: boolean       // Afficher la date
  showSource: boolean     // Afficher "Google" ou "Reputy"
  accentColor?: string    // Couleur accent (optionnel)
  theme?: 'light' | 'dark' // Thème (optionnel)
}

/**
 * Configuration du widget/badge pour un établissement
 * NOTE: Pour migration DB, créer UNIQUE INDEX sur (locationId) et (publicKey)
 */
export interface EmbedConfig {
  id: string
  locationId: string
  publicKey: string       // Identifiant public (ex: "emb_xxx") - exposé
  secretKey: string       // Clé secrète (jamais exposée côté client)
  mode: EmbedMode
  autoRules: EmbedAutoRules
  manualSelectedReviewIds: string[]
  displayOptions: EmbedDisplayOptions
  trackingEnabled: boolean
  createdAt: string       // UTC ISO
  updatedAt: string       // UTC ISO
}

/**
 * Configuration publique (sans secretKey)
 */
export type EmbedConfigPublic = Omit<EmbedConfig, 'secretKey'>

/**
 * Événement de tracking (impression/clic)
 * NOTE: Pour migration DB, indexer sur (locationId, createdAt) et (embedPublicKey)
 */
export interface EmbedEvent {
  id: string
  locationId: string
  embedPublicKey: string
  type: EmbedEventType
  pageUrl?: string
  referrer?: string
  userAgent?: string
  createdAt: string       // UTC ISO
}

/**
 * Avis formaté pour le widget (anonymisé)
 */
export interface EmbedReviewItem {
  id: string
  initials: string        // "S. D." pour "Sophie Durand"
  rating: number
  text?: string
  date: string
  source: ReviewSource
}

/**
 * Réponse de l'endpoint /api/embed/items
 */
export interface EmbedItemsResponse {
  items: EmbedReviewItem[]
  locationName: string
  averageRating: number
  totalCount: number
  config: {
    showStars: boolean
    showDate: boolean
    showSource: boolean
    accentColor?: string
    theme?: string
  }
}

/**
 * Statistiques du widget
 */
export interface EmbedStats {
  impressions: number
  clicks: number
  ctr: number             // Click-through rate (%)
  period: '7d' | '30d'
}

/**
 * Paramètres de mise à jour de la config
 */
export interface EmbedConfigPatch {
  mode?: EmbedMode
  autoRules?: Partial<EmbedAutoRules>
  manualSelectedReviewIds?: string[]
  displayOptions?: Partial<Omit<EmbedDisplayOptions, 'initialsOnly'>>
  trackingEnabled?: boolean
}

/**
 * Valeurs par défaut
 */
export const DEFAULT_EMBED_CONFIG: Omit<EmbedConfig, 'id' | 'locationId' | 'publicKey' | 'secretKey' | 'createdAt' | 'updatedAt'> = {
  mode: 'AUTO',
  autoRules: {
    minRating: 4,
    requireText: true,
    maxItems: 10,
    sort: 'RECENT',
  },
  manualSelectedReviewIds: [],
  displayOptions: {
    initialsOnly: true,
    showStars: true,
    showDate: true,
    showSource: true,
  },
  trackingEnabled: true,
}
