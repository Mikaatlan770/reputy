// ===== UTILS EMBED =====

import type { EmbedReviewItem, EmbedConfig, ReviewSource } from './types'
import type { Review } from '@/types'

/**
 * Convertit un nom complet en initiales
 * "Sophie Durand" -> "S. D."
 * "Jean-Claude" -> "J."
 * "Isabelle" -> "I."
 */
export function toInitials(name: string): string {
  if (!name || typeof name !== 'string') return '?'
  
  const parts = name.trim().split(/\s+/).filter(Boolean)
  
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    return `${parts[0][0].toUpperCase()}.`
  }
  
  return parts
    .map(part => `${part[0].toUpperCase()}.`)
    .join(' ')
}

/**
 * Interface interne pour un feedback Reputy
 */
interface ReputyFeedback {
  requestId: string
  rating: number
  comment?: string
  createdAt: string
  patient: {
    name: string
    firstName?: string
    lastName?: string
  }
}

/**
 * Convertit un avis Google (mock) en item widget
 */
export function googleReviewToEmbedItem(review: Review): EmbedReviewItem {
  return {
    id: review.id,
    initials: toInitials(review.author),
    rating: review.rating,
    text: review.content || undefined,
    date: review.date,
    source: 'google',
  }
}

/**
 * Convertit un feedback Reputy en item widget
 */
export function reputyFeedbackToEmbedItem(feedback: ReputyFeedback): EmbedReviewItem {
  const name = feedback.patient.firstName && feedback.patient.lastName
    ? `${feedback.patient.firstName} ${feedback.patient.lastName}`
    : feedback.patient.name
  
  return {
    id: feedback.requestId,
    initials: toInitials(name),
    rating: feedback.rating,
    text: feedback.comment || undefined,
    date: feedback.createdAt,
    source: 'reputy',
  }
}

/**
 * Filtre et trie les avis selon les règles AUTO
 */
export function filterAndSortReviews(
  items: EmbedReviewItem[],
  config: EmbedConfig
): EmbedReviewItem[] {
  const { autoRules } = config
  
  // Filtrer par note minimum
  let filtered = items.filter(item => item.rating >= autoRules.minRating)
  
  // Filtrer par texte requis
  if (autoRules.requireText) {
    filtered = filtered.filter(item => item.text && item.text.trim().length > 0)
  }
  
  // Trier
  if (autoRules.sort === 'BEST') {
    filtered.sort((a, b) => {
      // D'abord par note décroissante
      if (b.rating !== a.rating) return b.rating - a.rating
      // Puis par date décroissante
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  } else {
    // RECENT: par date décroissante
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
  
  // Limiter le nombre
  return filtered.slice(0, autoRules.maxItems)
}

/**
 * Sélectionne les avis en mode MANUAL (dans l'ordre de sélection)
 */
export function selectManualReviews(
  items: EmbedReviewItem[],
  selectedIds: string[]
): EmbedReviewItem[] {
  const itemsMap = new Map(items.map(item => [item.id, item]))
  
  return selectedIds
    .map(id => itemsMap.get(id))
    .filter((item): item is EmbedReviewItem => item !== undefined)
}

/**
 * Calcule la note moyenne et le total
 */
export function calculateStats(items: EmbedReviewItem[]): { average: number; total: number } {
  if (items.length === 0) {
    return { average: 0, total: 0 }
  }
  
  const sum = items.reduce((acc, item) => acc + item.rating, 0)
  const average = Math.round((sum / items.length) * 10) / 10
  
  return { average, total: items.length }
}

/**
 * Génère le code d'intégration widget
 */
export function generateWidgetCode(publicKey: string, domain: string): string {
  return `<script>
  (function(){
    var s=document.createElement('script');
    s.src='${domain}/embed/widget.js?key=${publicKey}';
    s.async=true;
    document.head.appendChild(s);
  })();
</script>
<div id="reputy-widget" data-reputy-key="${publicKey}"></div>
<noscript><a href="${domain}/reviews/${publicKey}">Voir nos avis</a></noscript>`
}

/**
 * Génère le code d'intégration badge
 */
export function generateBadgeCode(publicKey: string, domain: string): string {
  return `<div id="reputy-badge" data-reputy-key="${publicKey}"></div>
<script src="${domain}/embed/badge.js?key=${publicKey}" async></script>`
}
