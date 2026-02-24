'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { verifyEmail, resendCode, DASHBOARD_URL } from '@/lib/auth'
import { Mail, ArrowRight, Loader2, RefreshCw, CheckCircle } from 'lucide-react'

function VerifyForm() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successToken, setSuccessToken] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return
    
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    setError('')
    
    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    
    // Auto-submit when all digits entered
    if (value && index === 5) {
      const fullCode = newCode.join('')
      if (fullCode.length === 6) {
        handleSubmit(fullCode)
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length === 6) {
      const newCode = pastedData.split('')
      setCode(newCode)
      inputRefs.current[5]?.focus()
      handleSubmit(pastedData)
    }
  }

  const handleSubmit = async (fullCode?: string) => {
    const codeToVerify = fullCode || code.join('')
    if (codeToVerify.length !== 6) {
      setError('Veuillez entrer le code à 6 chiffres')
      return
    }
    
    setLoading(true)
    setError('')

    try {
      const response = await verifyEmail(email, codeToVerify)
      
      if (response.ok && response.token) {
        setSuccessToken(response.token)
        setSuccess(true)
        // Redirect to reputy-admin dashboard after 2 seconds
        // On passe le token via /auth/callback pour une connexion automatique
        setTimeout(() => {
          window.location.href = `${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(response.token!)}`
        }, 2000)
      } else {
        setError(response.message || 'Code invalide')
        setCode(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch (err: any) {
      const errorMessages: Record<string, string> = {
        'CODE_NOT_FOUND': 'Aucun code trouvé. Demandez un nouveau code.',
        'CODE_EXPIRED': 'Ce code a expiré. Demandez un nouveau code.',
        'CODE_INVALID': 'Code incorrect. Veuillez réessayer.',
        'RATE_LIMITED': err.message || 'Trop de tentatives. Veuillez patienter.',
      }
      setError(errorMessages[err.error] || err.message || 'Une erreur est survenue')
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    
    setResending(true)
    setError('')
    
    try {
      await resendCode(email)
      setResendCooldown(60) // 60 second cooldown
    } catch (err: any) {
      if (err.error === 'RATE_LIMITED') {
        setError(`Trop de demandes. Réessayez dans ${err.retryAfter || 60} secondes.`)
      } else {
        setError(err.message || 'Impossible d\'envoyer un nouveau code')
      }
    } finally {
      setResending(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Compte vérifié !
        </h1>
        <p className="text-gray-600 mb-4">
          Votre compte est maintenant actif.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Accédez à votre tableau de bord pour commencer à utiliser Reputy.
        </p>
        
        {/* Manual button - with token for seamless auth */}
        <a
          href={successToken 
            ? `${DASHBOARD_URL}/auth/callback?token=${encodeURIComponent(successToken)}`
            : `${DASHBOARD_URL}/login`
          }
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

  if (!email) {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Email manquant
        </h1>
        <p className="text-gray-600 mb-6">
          Veuillez d'abord créer un compte.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 transition-colors"
        >
          Créer un compte
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Vérifiez votre email
        </h1>
        <p className="text-gray-600">
          Nous avons envoyé un code à 6 chiffres à
        </p>
        <p className="font-semibold text-gray-900 mt-1">{email}</p>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Code inputs */}
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <input
              key={`otp-${index}`}
              ref={(el) => { inputRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={loading}
              className="w-12 h-14 text-center text-2xl font-bold border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors disabled:opacity-50"
            />
          ))}
        </div>

        <button
          onClick={() => handleSubmit()}
          disabled={loading || code.join('').length !== 6}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Vérification...
            </>
          ) : (
            <>
              Vérifier
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        {/* Resend code */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">
            Vous n'avez pas reçu le code ?
          </p>
          <button
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi...
              </>
            ) : resendCooldown > 0 ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Renvoyer dans {resendCooldown}s
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Renvoyer le code
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <p className="text-gray-600 text-sm">
          Mauvais email ?{' '}
          <Link href="/signup" className="font-semibold text-primary-600 hover:text-primary-700">
            Recommencer
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function VerifyPage() {
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
            <VerifyForm />
          </Suspense>
        </div>
      </main>

      <Footer />
    </>
  )
}
