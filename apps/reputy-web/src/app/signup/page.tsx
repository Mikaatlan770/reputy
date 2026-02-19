'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { signup } from '@/lib/auth'
import { Mail, Lock, Building2, ArrowRight, Loader2, Briefcase } from 'lucide-react'

const VERTICALS = [
  { value: 'health', label: 'Santé', description: 'Médecins, dentistes, kiné...' },
  { value: 'food', label: 'Restauration', description: 'Restaurants, cafés, bars...' },
  { value: 'business', label: 'Services', description: 'Commerces, artisans, autres...' },
]

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan') || 'or'
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    orgName: '',
    vertical: 'health',
    plan: planParam,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await signup({
        email: formData.email,
        password: formData.password,
        orgName: formData.orgName,
        vertical: formData.vertical,
        plan: formData.plan,
      })
      
      if (response.ok && response.next === 'verify') {
        // Redirect to verification page
        router.push(`/verify?email=${encodeURIComponent(formData.email)}`)
      } else {
        setError(response.message || 'Une erreur est survenue')
      }
    } catch (err: any) {
      if (err.error === 'EMAIL_ALREADY_EXISTS') {
        setError('Un compte existe déjà avec cet email. Connectez-vous ou utilisez un autre email.')
      } else {
        setError(err.message || 'Une erreur est survenue. Veuillez réessayer.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Créer un compte
        </h1>
        <p className="text-gray-600">
          Commencez à collecter des avis en quelques minutes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-2">
            Nom de l'établissement
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="orgName"
              name="orgName"
              type="text"
              value={formData.orgName}
              onChange={handleChange}
              placeholder="Cabinet Médical Dupont"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor="vertical" className="block text-sm font-medium text-gray-700 mb-2">
            Secteur d'activité
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              id="vertical"
              name="vertical"
              value={formData.vertical}
              onChange={handleChange}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors appearance-none bg-white"
            >
              {VERTICALS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} - {v.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email professionnel
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="vous@cabinet.fr"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="8 caractères minimum"
              required
              minLength={8}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            required
            className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <label htmlFor="terms" className="text-sm text-gray-600">
            J'accepte les{' '}
            <Link href="/legal/terms" className="text-primary-600 hover:underline">
              conditions d'utilisation
            </Link>{' '}
            et la{' '}
            <Link href="/legal/privacy" className="text-primary-600 hover:underline">
              politique de confidentialité
            </Link>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-primary-900 text-white font-semibold rounded-xl hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Création...
            </>
          ) : (
            <>
              Créer mon compte
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <p className="text-gray-600">
          Déjà un compte ?{' '}
          <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
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
            <SignupForm />
          </Suspense>
        </div>
      </main>

      <Footer />
    </>
  )
}
