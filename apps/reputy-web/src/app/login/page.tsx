'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { login, selectOrg, DASHBOARD_URL } from '@/lib/auth'
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, Building2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // PR-8e: Multi-org org-picker state
  const [mode, setMode] = useState<'credentials' | 'org-selection'>('credentials')
  const [pendingToken, setPendingToken] = useState('')
  const [pendingOrgs, setPendingOrgs] = useState<Array<{ orgId: string; orgName: string; role: string }>>([])
  const [selectingOrg, setSelectingOrg] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await login(email, password)
      
      // PR-8e: Multi-org — show org-picker inline
      if (response.requireOrgSelection) {
        setPendingToken(response.pendingToken!)
        setPendingOrgs(response.orgs!)
        setMode('org-selection')
        setLoading(false)
        return
      }

      if (response.ok && response.token) {
        // Redirect to reputy-admin with token for seamless auth
        window.location.href = `${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(response.token)}`
      } else if (response.ok) {
        // Fallback: redirect to login (shouldn't happen)
        window.location.href = `${DASHBOARD_URL}/login`
      } else {
        setError(response.message || 'Erreur de connexion')
      }
    } catch (err: any) {
      const errorMessages: Record<string, string> = {
        'INVALID_CREDENTIALS': 'Email ou mot de passe incorrect',
        'EMAIL_NOT_VERIFIED': 'Veuillez d\'abord vérifier votre email',
        'ORG_CANCELLED': 'Votre compte a été annulé. Contactez le support.',
        'RATE_LIMITED': err.message || 'Trop de tentatives. Veuillez patienter.',
      }
      
      if (err.error === 'EMAIL_NOT_VERIFIED') {
        // Redirect to verify page
        router.push(`/verify?email=${encodeURIComponent(err.email || email)}`)
        return
      }
      
      setError(errorMessages[err.error] || err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  // PR-8e: Select an org from the multi-org picker
  const handleSelectOrg = async (orgId: string) => {
    setSelectingOrg(true)
    setError('')
    try {
      const response = await selectOrg(pendingToken, orgId)
      if (response.ok && response.token) {
        window.location.href = `${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(response.token)}`
      } else {
        setError(response.message || 'Erreur de sélection')
      }
    } catch (err: any) {
      if (err.error === 'INVALID_TOKEN') {
        // Token expired — back to credentials
        setMode('credentials')
        setPendingToken('')
        setPendingOrgs([])
        setError('Session expirée. Veuillez vous reconnecter.')
      } else {
        setError(err.message || 'Une erreur est survenue')
      }
    } finally {
      setSelectingOrg(false)
    }
  }

  // PR-8e: Go back to credentials mode
  const handleBackToLogin = () => {
    setMode('credentials')
    setPendingToken('')
    setPendingOrgs([])
    setError('')
  }

  return (
    <>
      <Header />
      
      <main className="min-h-screen pt-32 pb-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8">

            {/* ========== MODE: CREDENTIALS ========== */}
            {mode === 'credentials' && (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Connexion
                  </h1>
                  <p className="text-gray-600">
                    Accédez à votre tableau de bord Reputy
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@exemple.com"
                        required
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        Mot de passe
                      </label>
                      <Link href="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">
                        Mot de passe oublié ?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Connexion...
                      </>
                    ) : (
                      <>
                        Se connecter
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                  <p className="text-gray-600">
                    Pas encore de compte ?{' '}
                    <Link href="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
                      Créer un compte
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* ========== MODE: ORG SELECTION (PR-8e) ========== */}
            {mode === 'org-selection' && (
              <>
                <div className="text-center mb-8">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-6 w-6 text-primary-600" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Choisissez un établissement
                  </h1>
                  <p className="text-gray-600">
                    Sélectionnez l&apos;établissement auquel vous souhaitez accéder
                  </p>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  {pendingOrgs.map((org) => (
                    <button
                      key={org.orgId}
                      onClick={() => handleSelectOrg(org.orgId)}
                      disabled={selectingOrg}
                      className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-colors text-left disabled:opacity-50"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{org.orgName}</p>
                        <p className="text-sm text-gray-500 capitalize">{org.role}</p>
                      </div>
                      {selectingOrg ? (
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      ) : (
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleBackToLogin}
                  className="mt-6 w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ← Retour à la connexion
                </button>
              </>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
