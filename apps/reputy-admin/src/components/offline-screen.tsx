'use client'

/**
 * Écran plein affiché quand l'app n'a pas de connexion au launch.
 * Preuve Apple 4.2 : l'app réagit proprement au mode offline.
 */

import React from 'react'

export function OfflineScreen({
  onRetry,
  subtitle,
}: {
  onRetry: () => void
  subtitle?: string
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center">
        {/* Icône wifi barré */}
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 12.86a10 10 0 0 1 5.17-2.86" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="text-xl font-bold mb-2">Pas de connexion</h1>

        <p className="text-muted-foreground mb-6 leading-relaxed">
          {subtitle ??
            'Reputy nécessite une connexion internet. Vérifie ton réseau puis réessaie.'}
        </p>

        <button
          onClick={onRetry}
          className="h-11 px-6 rounded-xl border border-border font-semibold hover:bg-accent transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
