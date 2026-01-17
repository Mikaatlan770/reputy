'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Lock, Shield } from 'lucide-react'

export default function InternalLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/internal/clients'
  
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    console.log('[Login] Submitting token...')

    try {
      const res = await fetch('/internal/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      console.log('[Login] Response status:', res.status)

      if (res.ok) {
        console.log('[Login] Success, redirecting to:', redirect)
        router.push(redirect)
        router.refresh()
      } else {
        const data = await res.json()
        console.log('[Login] Error:', data)
        setError(data.error || 'Token invalide')
      }
    } catch (err) {
      console.error('[Login] Fetch error:', err)
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl text-white">Backoffice Reputy</CardTitle>
            <CardDescription className="text-slate-400">
              Accès réservé aux administrateurs
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium text-slate-300">
                Token d&apos;accès
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Entrez le token admin"
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              disabled={loading || !token}
            >
              {loading ? 'Vérification...' : 'Accéder au backoffice'}
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-slate-500">
            Ce backoffice permet de gérer les clients Reputy.
            <br />
            Contactez le support si vous avez perdu votre token.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
