// ===== STORE EMBED (MVP in-memory) =====
// NOTE: Préparé pour migration DB - toutes les fonctions sont async-ready

import { randomBytes } from 'crypto'
import type { 
  EmbedConfig, 
  EmbedConfigPublic,
  EmbedEvent, 
  EmbedConfigPatch,
  DEFAULT_EMBED_CONFIG 
} from './types'
import { DEFAULT_EMBED_CONFIG as defaults } from './types'

// ===== IN-MEMORY STORES =====
// NOTE: En production, remplacer par des appels DB

const embedConfigs = new Map<string, EmbedConfig>()           // key: locationId
const embedConfigsByPublicKey = new Map<string, EmbedConfig>() // key: publicKey
const embedEvents: EmbedEvent[] = []

// ===== HELPERS =====

function generatePublicKey(): string {
  return `emb_${randomBytes(12).toString('hex')}`
}

function generateSecretKey(): string {
  return `sk_${randomBytes(24).toString('hex')}`
}

function generateEventId(): string {
  return `evt_${randomBytes(8).toString('hex')}`
}

function nowISO(): string {
  return new Date().toISOString()
}

// ===== CONFIG CRUD =====

/**
 * Récupère ou crée une config pour un établissement
 */
export async function getOrCreateEmbedConfig(locationId: string): Promise<EmbedConfigPublic> {
  let config = embedConfigs.get(locationId)
  
  if (!config) {
    // Créer une config par défaut
    const now = nowISO()
    config = {
      id: `cfg_${randomBytes(8).toString('hex')}`,
      locationId,
      publicKey: generatePublicKey(),
      secretKey: generateSecretKey(),
      ...defaults,
      createdAt: now,
      updatedAt: now,
    }
    
    embedConfigs.set(locationId, config)
    embedConfigsByPublicKey.set(config.publicKey, config)
  }
  
  // Retourner sans la secretKey
  const { secretKey, ...publicConfig } = config
  return publicConfig
}

/**
 * Récupère une config par sa publicKey
 */
export async function getEmbedConfigByPublicKey(publicKey: string): Promise<EmbedConfig | null> {
  return embedConfigsByPublicKey.get(publicKey) || null
}

/**
 * Met à jour une config
 */
export async function updateEmbedConfig(
  locationId: string, 
  patch: EmbedConfigPatch
): Promise<EmbedConfigPublic> {
  const existing = embedConfigs.get(locationId)
  
  if (!existing) {
    // Créer d'abord
    await getOrCreateEmbedConfig(locationId)
    return updateEmbedConfig(locationId, patch)
  }
  
  // Appliquer le patch
  const updated: EmbedConfig = {
    ...existing,
    mode: patch.mode ?? existing.mode,
    autoRules: {
      ...existing.autoRules,
      ...patch.autoRules,
    },
    manualSelectedReviewIds: patch.manualSelectedReviewIds ?? existing.manualSelectedReviewIds,
    displayOptions: {
      ...existing.displayOptions,
      ...patch.displayOptions,
      initialsOnly: true, // Toujours forcé à true
    },
    trackingEnabled: patch.trackingEnabled ?? existing.trackingEnabled,
    updatedAt: nowISO(),
  }
  
  embedConfigs.set(locationId, updated)
  embedConfigsByPublicKey.set(updated.publicKey, updated)
  
  const { secretKey, ...publicConfig } = updated
  return publicConfig
}

/**
 * Ajoute/retire un avis de la sélection manuelle
 */
export async function toggleManualReview(
  locationId: string, 
  reviewId: string, 
  selected: boolean
): Promise<EmbedConfigPublic> {
  const config = await getOrCreateEmbedConfig(locationId)
  const fullConfig = embedConfigs.get(locationId)!
  
  let selectedIds = [...fullConfig.manualSelectedReviewIds]
  
  if (selected && !selectedIds.includes(reviewId)) {
    selectedIds.push(reviewId)
  } else if (!selected) {
    selectedIds = selectedIds.filter(id => id !== reviewId)
  }
  
  return updateEmbedConfig(locationId, { manualSelectedReviewIds: selectedIds })
}

/**
 * Vérifie si un avis est sélectionné pour le widget
 */
export async function isReviewSelectedForEmbed(
  locationId: string,
  reviewId: string
): Promise<boolean> {
  const config = embedConfigs.get(locationId)
  if (!config) return false
  return config.manualSelectedReviewIds.includes(reviewId)
}

// ===== EVENTS TRACKING =====

/**
 * Enregistre un événement (impression ou clic)
 */
export async function recordEmbedEvent(
  publicKey: string,
  type: 'IMPRESSION' | 'CLICK',
  metadata?: { pageUrl?: string; referrer?: string; userAgent?: string }
): Promise<void> {
  const config = embedConfigsByPublicKey.get(publicKey)
  if (!config || !config.trackingEnabled) return
  
  const event: EmbedEvent = {
    id: generateEventId(),
    locationId: config.locationId,
    embedPublicKey: publicKey,
    type,
    pageUrl: metadata?.pageUrl,
    referrer: metadata?.referrer,
    userAgent: metadata?.userAgent,
    createdAt: nowISO(),
  }
  
  embedEvents.push(event)
  
  // Limiter à 10000 événements en mémoire (MVP)
  if (embedEvents.length > 10000) {
    embedEvents.splice(0, embedEvents.length - 10000)
  }
}

/**
 * Récupère les stats pour un établissement
 */
export async function getEmbedStats(
  locationId: string,
  period: '7d' | '30d'
): Promise<{ impressions: number; clicks: number; ctr: number }> {
  const days = period === '7d' ? 7 : 30
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  
  const config = embedConfigs.get(locationId)
  if (!config) {
    return { impressions: 0, clicks: 0, ctr: 0 }
  }
  
  const relevantEvents = embedEvents.filter(
    e => e.locationId === locationId && new Date(e.createdAt) >= cutoff
  )
  
  const impressions = relevantEvents.filter(e => e.type === 'IMPRESSION').length
  const clicks = relevantEvents.filter(e => e.type === 'CLICK').length
  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0
  
  return { impressions, clicks, ctr }
}

// ===== EXPORT ALL =====

export {
  embedConfigs,
  embedEvents,
}
