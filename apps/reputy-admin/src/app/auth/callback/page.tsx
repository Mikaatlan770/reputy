'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { BACKEND_URL, REPUTY_WEB_URL } from '@/lib/constants'

const TOKEN_KEY = 'reputy_client_token'

/**
 * Auth Callback Page - Connexion automatique INVISIBLE depuis reputy-web
 * Flow: reputy-web login → redirect ici avec ?token=xxx → stockage → dashboard
 * 
 * Cette page ne s'affiche pas visuellement - elle traite le token et redirige.
 */
function AuthCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token')
      const redirect = searchParams.get('redirect') || '/'

      // Pas de token → retour site principal
      if (!token) {
        window.location.href = REPUTY_WEB_URL
        return
      }

      try {
        // Vérification rapide du token
        const response = await fetch(`${BACKEND_URL}/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error('Token invalide')
        }

        // Token OK → stocker et rediriger vers dashboard
        localStorage.setItem(TOKEN_KEY, token)
        window.location.href = redirect

      } catch {
        // Erreur → retour site principal
        window.location.href = REPUTY_WEB_URL
      }
    }

    handleCallback()
  }, [searchParams])

  // Page INVISIBLE - rien à afficher
  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  )
}
