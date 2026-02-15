/**
 * Wrapper fetch authentifié avec gestion des 401.
 *
 * Résout 2 cas critiques :
 *   Cas A — Anti-boucle : un flag isHandling401 empêche de retry indéfiniment
 *   Cas B — Requêtes parallèles : une seule promise reloginPromise partagée
 *           → 10 appels 401 = 1 seul re-login, les 9 autres attendent
 *
 * Émet un CustomEvent 'reputy:session-expired' écouté par AuthProvider
 * pour purger le state et rediriger vers le login.
 */

import { getSecureToken, removeSecureToken } from './secure-token'

// Mutex : une seule tentative de re-login en vol
let reloginPromise: Promise<void> | null = null

// Anti-boucle : empêche les retry infinis sur 401
let isHandling401 = false

/**
 * Gère l'expiration de session : purge le token et émet un événement global.
 * N'est exécuté qu'une seule fois grâce au flag isHandling401.
 */
async function handleSessionExpired(): Promise<void> {
  if (isHandling401) return
  isHandling401 = true

  try {
    await removeSecureToken()
    // Événement global écouté par AuthProvider (auth-context.tsx)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reputy:session-expired'))
    }
  } finally {
    // Reset après un délai (laisse le temps au redirect de s'exécuter)
    setTimeout(() => {
      isHandling401 = false
    }, 5000)
  }
}

/**
 * Fetch authentifié — injecte le Bearer token et intercepte les 401.
 *
 * Usage identique à fetch() natif :
 *   const res = await authedFetch('/api/feedbacks')
 *   const data = await res.json()
 */
export async function authedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getSecureToken()

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (res.status === 401) {
    // Mutex : toutes les requêtes parallèles attendent le même re-login
    if (!reloginPromise) {
      reloginPromise = handleSessionExpired().finally(() => {
        reloginPromise = null
      })
    }
    await reloginPromise
  }

  return res
}
