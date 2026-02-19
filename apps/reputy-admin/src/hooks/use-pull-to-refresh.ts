'use client'

/**
 * Hook pull-to-refresh natif-like.
 *
 * - Actif uniquement quand window.scrollY === 0 (haut de page)
 * - Déclenche au-delà d'un seuil (80px par défaut)
 * - Single trigger par gesture (pas de double-fire)
 * - Guard SSR : typeof window !== 'undefined'
 */

import * as React from 'react'

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  opts?: {
    thresholdPx?: number
    disabled?: boolean
  }
) {
  const thresholdPx = opts?.thresholdPx ?? 80
  const disabled = !!opts?.disabled

  const pullingRef = React.useRef(false)
  const startYRef = React.useRef<number | null>(null)
  const triggeredRef = React.useRef(false)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (disabled) return

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      if (e.touches.length !== 1) return
      startYRef.current = e.touches[0].clientY
      triggeredRef.current = false
      pullingRef.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return
      if (startYRef.current == null) return
      if (window.scrollY > 0) return

      const dy = e.touches[0].clientY - startYRef.current
      if (dy < 0) return

      if (dy >= thresholdPx && !triggeredRef.current) {
        triggeredRef.current = true
        Promise.resolve(onRefresh()).catch(() => {})
      }
    }

    const onTouchEnd = () => {
      pullingRef.current = false
      startYRef.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [disabled, thresholdPx, onRefresh])
}
