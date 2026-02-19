'use client'

/**
 * Banner sticky affiché quand la connexion tombe en cours d'utilisation.
 * Utile en web ET en mobile — preuve Apple 4.2.
 */

import React from 'react'

export function OfflineBanner({
  online,
  onRetry,
}: {
  online: boolean
  onRetry: () => void
}) {
  if (online) return null

  return (
    <div className="sticky top-0 z-50 px-4 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm flex items-center gap-3">
      {/* Indicateur visuel */}
      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />

      <span className="font-semibold text-sm">Hors ligne</span>

      <span className="text-muted-foreground text-xs flex-1">
        Certaines actions sont indisponibles.
      </span>

      <button
        onClick={onRetry}
        className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-accent transition-colors"
      >
        Réessayer
      </button>
    </div>
  )
}
