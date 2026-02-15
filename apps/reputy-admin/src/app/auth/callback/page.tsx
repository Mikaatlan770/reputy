'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { BACKEND_URL, REPUTY_WEB_URL } from '@/lib/constants'
import { setSecureToken } from '@/lib/auth/secure-token'

/**
 * Auth Callback Page - Connexion automatique depuis reputy-web
 *
 * Flow :
 *   reputy-web (3001) login → redirect ici avec ?token=xxx → validation → stockage → dashboard
 *
 * ⚠️ IMPORTANT : Ce fichier importe setSecureToken qui utilise un import Capacitor
 *   caché via `new Function()` pour éviter que Next.js ne casse le build web.
 *   Ne PAS ajouter d'import statique de plugins Capacitor ici.
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
        // Valider le token auprès du backend
        const response = await fetch(`${BACKEND_URL}/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (!response.ok) {
          console.error('[AUTH-CALLBACK] Token invalide, HTTP', response.status)
          window.location.href = REPUTY_WEB_URL
          return
        }

        // Token OK → stocker et rediriger vers le dashboard
        await setSecureToken(token)
        window.location.href = redirect

      } catch (err) {
        console.error('[AUTH-CALLBACK] Erreur fetch /me:', err)
        window.location.href = REPUTY_WEB_URL
      }
    }

    handleCallback()
  }, [searchParams])

  // Écran de chargement minimal pendant la validation
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, margin: '0 auto 16px',
          border: '3px solid #333', borderTopColor: '#22c55e', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 14, opacity: 0.7 }}>Connexion en cours…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        background: '#0a0a0a', color: '#fff', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui',
      }}>
        Chargement…
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
