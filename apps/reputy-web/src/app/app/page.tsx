'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DASHBOARD_URL, isAuthenticated } from '@/lib/auth'
import { Loader2, ExternalLink, ArrowRight } from 'lucide-react'

/**
 * P1.2 - Page de redirection vers reputy-admin (3002)
 * 
 * Cette page redirige automatiquement vers le dashboard client (reputy-admin).
 * Elle existe pour la compatibilité avec les anciens liens.
 */
export default function AppRedirectPage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(3)
  const dashboardLoginUrl = `${DASHBOARD_URL}/login`

  useEffect(() => {
    // Si pas authentifié sur reputy-web, rediriger vers login
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }

    // Countdown et redirection automatique
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = dashboardLoginUrl
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router, dashboardLoginUrl])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 max-w-md w-full text-center">
        {/* Logo */}
        <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-bold text-2xl">R</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Redirection vers votre tableau de bord
        </h1>
        
        <p className="text-gray-600 mb-6">
          Vous allez être redirigé vers votre espace client Reputy dans {countdown} seconde{countdown > 1 ? 's' : ''}...
        </p>

        {/* Loading indicator */}
        <div className="flex justify-center mb-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>

        {/* Manual link */}
        <div className="space-y-3">
          <a
            href={dashboardLoginUrl}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 transition-colors"
          >
            Accéder au tableau de bord
            <ExternalLink className="h-5 w-5" />
          </a>

          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Retour à l'accueil
          </Link>
        </div>

        {/* Info */}
        <p className="mt-6 text-xs text-gray-400">
          Le tableau de bord client est hébergé sur{' '}
          <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
            {DASHBOARD_URL.replace('http://', '').replace('https://', '')}
          </code>
        </p>
      </div>
    </div>
  )
}
