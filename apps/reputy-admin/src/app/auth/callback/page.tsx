'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'
const REPUTY_WEB_URL = process.env.NEXT_PUBLIC_REPUTY_WEB_URL || 'http://localhost:3001'
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
