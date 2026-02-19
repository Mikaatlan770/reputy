'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { acceptInvite, DASHBOARD_URL } from '@/lib/auth'
import { Lock, ArrowRight, Loader2, CheckCircle, XCircle, Building2 } from 'lucide-react'

function InviteAcceptContent() {
  const searchParams = useSearchParams()
  const hasAttempted = useRef(false) // Guard against StrictMode double-render

  const [status, setStatus] = useState<'loading' | 'set-password' | 'success' | 'error'>('loading')
  const [orgName, setOrgName] = useState('')
  const [resolvedToken, setResolvedToken] = useState('') // Session token for redirect to 3002
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const inviteToken = searchParams.get('token')

  // On mount: attempt to accept directly (works for existing users without must_change_password)
  useEffect(() => {
    if (hasAttempted.current) return
    hasAttempted.current = true

    if (!inviteToken) {
      setStatus('error')
      setError("Lien d'invitation invalide. Vérifiez le lien dans votre email.")
      return
    }

    const attemptAccept = async () => {
      try {
        const response = await acceptInvite(inviteToken)
        if (response.ok && response.token) {
          setOrgName(response.orgName || 'votre établissement')
          setResolvedToken(response.token)
          setStatus('success')
        }
      } catch (err: unknown) {
        const e = err as { error?: string; message?: string }
        if (e.error === 'PASSWORD_REQUIRED') {
          // New user: must set password first
          setStatus('set-password')
        } else if (e.error === 'INVITE_NOT_FOUND') {
          setStatus('error')
          setError("Invitation invalide ou expirée. Demandez une nouvelle invitation.")
        } else if (e.error === 'INVITE_ALREADY_USED') {
          setStatus('error')
          setError("Cette invitation a déjà été acceptée. Connectez-vous directement.")
        } else {
          setStatus('error')
          setError(e.message || 'Une erreur est survenue')
        }
      }
    }

    attemptAccept()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-redirect to dashboard after success
  useEffect(() => {
    if (status === 'success' && resolvedToken) {
      const timer = setTimeout(() => {
        window.location.href = `${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(resolvedToken)}`
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [status, resolvedToken])

  // Handle password form submission (new user flow)
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setSubmitting(true)

    try {
      const response = await acceptInvite(inviteToken!, newPassword)
      if (response.ok && response.token) {
        setOrgName(response.orgName || 'votre établissement')
        setResolvedToken(response.token)
        setStatus('success')
      } else {
        setError(response.message || 'Erreur lors de la création du compte')
      }
    } catch (err: unknown) {
      const e = err as { error?: string; message?: string }
      if (e.error === 'INVITE_ALREADY_USED') {
        setStatus('error')
        setError("Cette invitation a déjà été acceptée. Connectez-vous directement.")
      } else {
        setError(e.message || 'Une erreur est survenue')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ========== LOADING ==========
  if (status === 'loading') {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto mb-4" />
        <p className="text-gray-600">Vérification de votre invitation...</p>
      </div>
    )
  }

  // ========== SET PASSWORD (new user) ==========
  if (status === 'set-password') {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Bienvenue sur Reputy
          </h1>
          <p className="text-gray-600">
            Créez votre mot de passe pour accéder à votre tableau de bord
          </p>
        </div>

        <form onSubmit={handleSetPassword} className="space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8 caractères minimum"
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Création...
              </>
            ) : (
              <>
                Créer mon mot de passe
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>
      </div>
    )
  }

  // ========== SUCCESS ==========
  if (status === 'success') {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Vous avez rejoint {orgName} !
        </h1>
        <p className="text-gray-600 mb-4">
          Votre compte est maintenant actif.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Accédez à votre tableau de bord pour commencer.
        </p>

        <a
          href={`${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(resolvedToken)}`}
          className="inline-flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 transition-colors mb-4"
        >
          Accéder au tableau de bord
          <ArrowRight className="h-5 w-5" />
        </a>

        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirection automatique...
        </div>
      </div>
    )
  }

  // ========== ERROR ==========
  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <XCircle className="h-8 w-8 text-red-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Invitation invalide
      </h1>
      <p className="text-gray-600 mb-6">
        {error}
      </p>
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 transition-colors"
      >
        Retour à la connexion
        <ArrowRight className="h-5 w-5" />
      </Link>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <>
      <Header />

      <main className="min-h-screen pt-32 pb-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <Suspense fallback={
            <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600 mx-auto" />
            </div>
          }>
            <InviteAcceptContent />
          </Suspense>
        </div>
      </main>

      <Footer />
    </>
  )
}
