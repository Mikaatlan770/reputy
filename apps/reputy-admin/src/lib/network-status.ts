'use client'

/**
 * Hook de détection réseau (online/offline).
 * Fonctionne en web ET dans la WebView Capacitor.
 * Guard SSR : typeof window !== 'undefined'.
 */

import * as React from 'react'

export function useNetworkStatus(): { online: boolean; since: number } {
  const [online, setOnline] = React.useState(true)
  const [since, setSince] = React.useState(Date.now())

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const update = () => {
      const next = navigator.onLine
      setOnline(next)
      setSince(Date.now())
    }

    // Init
    update()

    window.addEventListener('online', update)
    window.addEventListener('offline', update)

    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return { online, since }
}
