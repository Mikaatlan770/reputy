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
 * La page est INVISIBLE (return null) — la redirection est quasi instantanée (~100ms).
 */
function AuthCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token')
      const redirect = searchParams.get('redirect') || '/'

      if (!token) {
        window.location.href = REPUTY_WEB_URL
        return
      }

      try {
        const response = await fetch(`${BACKEND_URL}/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (!response.ok) {
          console.error('[AUTH-CALLBACK] Token invalide, HTTP', response.status)
          window.location.href = REPUTY_WEB_URL
          return
        }

        await setSecureToken(token)
        window.location.href = redirect
      } catch (err) {
        console.error('[AUTH-CALLBACK] Erreur fetch /me:', err)
        window.location.href = REPUTY_WEB_URL
      }
    }

    handleCallback()
  }, [searchParams])

  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  )
}
