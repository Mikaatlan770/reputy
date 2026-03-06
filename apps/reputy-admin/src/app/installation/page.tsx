'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useIsClient } from '@/lib/auth'
import { 
  Copy, 
  CheckCircle, 
  Chrome, 
  Key,
  TrendingUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Mail,
  Package,
  Calendar,
  Shield,
  RotateCw,
  Eye,
  EyeOff,
  Lock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'
const CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore/detail/reputy/nfmjafgkhmociachlhiaegkfhodhgkoc'

/**
 * Page Installation - CLIENT ONLY
 * Affiche la publicKey et les instructions pour configurer l'extension Chrome
 */
export default function InstallationPage() {
  const router = useRouter()
  const { loading, clientOrg, getClientToken } = useAuth()
  const isClient = useIsClient()
  const [copied, setCopied] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [apiToken, setApiToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenRevealed, setTokenRevealed] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [tokenMeta, setTokenMeta] = useState<{
    apiTokenCreatedAt: string | null
    apiTokenLastRotatedAt: string | null
  }>({ apiTokenCreatedAt: null, apiTokenLastRotatedAt: null })

  // Rediriger si pas client
  useEffect(() => {
    if (!loading && !isClient) {
      router.push('/')
    }
  }, [loading, isClient, router])

  const handleCopyKey = async () => {
    if (!clientOrg?.publicKey) return
    
    try {
      await navigator.clipboard.writeText(clientOrg.publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = clientOrg.publicKey
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Fetch token metadata
  const fetchTokenInfo = useCallback(async () => {
    const token = getClientToken()
    if (!token) return
    try {
      const res = await fetch(`${BACKEND_URL}/client/api-token`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setHasToken(data.hasApiToken)
        setTokenMeta({
          apiTokenCreatedAt: data.apiTokenCreatedAt,
          apiTokenLastRotatedAt: data.apiTokenLastRotatedAt,
        })
      }
    } catch {
      // silent
    }
  }, [getClientToken])

  useEffect(() => {
    if (isClient && clientOrg) {
      fetchTokenInfo()
    }
  }, [isClient, clientOrg, fetchTokenInfo])

  const handleRotateToken = async () => {
    if (!confirm('⚠️ Générer un nouveau Token API ?\n\nL\'ancien token restera valide 24h.\nVous devrez mettre à jour l\'extension avec le nouveau token.')) return
    
    setTokenLoading(true)
    try {
      const token = getClientToken()
      const res = await fetch(`${BACKEND_URL}/client/api-token/rotate`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()
      if (res.ok && data.newApiToken) {
        setApiToken(data.newApiToken)
        setTokenRevealed(true)
        setHasToken(true)
        await fetchTokenInfo()
      } else {
        alert(data.message || 'Erreur lors de la génération du token')
      }
    } catch {
      alert('Erreur de connexion au serveur')
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCopyToken = async () => {
    if (!apiToken) return
    try {
      await navigator.clipboard.writeText(apiToken)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = apiToken
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not client (should redirect)
  if (!isClient || !clientOrg) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Accès réservé aux clients</p>
        </div>
      </div>
    )
  }

  const credits = clientOrg.creditsComputed

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Installation</h1>
        <p className="text-muted-foreground">
          Configurez l'extension Chrome Reputy pour commencer à collecter des avis
        </p>
      </div>

      {/* Credits Overview */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">SMS</span>
            </div>
            <div className="text-2xl font-bold">
              {credits?.subscription?.smsUsed || 0} / {credits?.subscription?.smsTotal || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {credits?.subscription?.smsRemaining || 0} restants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Mail className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Email</span>
            </div>
            <div className="text-2xl font-bold">
              {credits?.subscription?.emailUsed || 0} / {credits?.subscription?.emailTotal || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {credits?.subscription?.emailRemaining || 0} restants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Package className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Packs SMS</span>
            </div>
            <div className="text-2xl font-bold">
              {credits?.pack?.smsRemaining || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              persistants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Renouvellement</span>
            </div>
            <div className="text-2xl font-bold">
              {credits?.periodStart 
                ? new Date(credits.periodStart).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              fin de période
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Public Key Card */}
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Key className="h-5 w-5" />
            Votre Clé Publique
          </CardTitle>
          <CardDescription className="text-slate-300">
            Utilisez cette clé pour configurer l'extension Chrome Reputy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 flex items-center justify-between gap-4">
            <code className="font-mono text-lg text-amber-300 break-all">
              {clientOrg.publicKey}
            </code>
            <Button
              onClick={handleCopyKey}
              variant={copied ? 'default' : 'secondary'}
              className={copied ? 'bg-green-500 hover:bg-green-600' : ''}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copier
                </>
              )}
            </Button>
          </div>
          
          <div className="mt-4 flex items-start gap-2 text-sm text-slate-300">
            <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Cette clé identifie votre compte. Ne la partagez pas publiquement.
            </span>
          </div>
        </CardContent>
      </Card>

      <ApiTokenCard
        apiToken={apiToken}
        tokenRevealed={tokenRevealed}
        setTokenRevealed={setTokenRevealed}
        copiedToken={copiedToken}
        hasToken={hasToken}
        tokenMeta={tokenMeta}
        tokenLoading={tokenLoading}
        onCopyToken={handleCopyToken}
        onRotateToken={handleRotateToken}
      />

      <SetupInstructions
        publicKey={clientOrg.publicKey}
        onCopyKey={handleCopyKey}
      />

      {/* Help */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-semibold text-blue-900 mb-2">Besoin d'aide ?</h3>
            <p className="text-blue-700 text-sm mb-4">
              Notre équipe est là pour vous accompagner dans la configuration.
            </p>
            <Button asChild variant="default" className="bg-blue-600 hover:bg-blue-700">
              <a href="mailto:support@reputyapp.com">
                <Mail className="h-4 w-4 mr-2" />
                Contacter le support
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ApiTokenCard({
  apiToken,
  tokenRevealed,
  setTokenRevealed,
  copiedToken,
  hasToken,
  tokenMeta,
  tokenLoading,
  onCopyToken,
  onRotateToken,
}: {
  apiToken: string | null
  tokenRevealed: boolean
  setTokenRevealed: (v: boolean) => void
  copiedToken: boolean
  hasToken: boolean
  tokenMeta: { apiTokenCreatedAt: string | null; apiTokenLastRotatedAt: string | null }
  tokenLoading: boolean
  onCopyToken: () => void
  onRotateToken: () => void
}) {
  return (
    <Card className="bg-gradient-to-br from-amber-900 to-amber-800 text-white border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Lock className="h-5 w-5" />
          Token API (Extension)
        </CardTitle>
        <CardDescription className="text-amber-200">
          Ce token secret est nécessaire pour connecter l&apos;extension Chrome à votre compte.
          Collez-le dans le champ &quot;Token API&quot; des paramètres de l&apos;extension.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {apiToken ? (
          <TokenDisplayView
            apiToken={apiToken}
            tokenRevealed={tokenRevealed}
            setTokenRevealed={setTokenRevealed}
            copiedToken={copiedToken}
            onCopyToken={onCopyToken}
          />
        ) : (
          <TokenGenerateView
            hasToken={hasToken}
            tokenMeta={tokenMeta}
            tokenLoading={tokenLoading}
            onRotateToken={onRotateToken}
          />
        )}
      </CardContent>
    </Card>
  )
}

function SetupInstructions({
  publicKey,
  onCopyKey,
}: {
  publicKey: string
  onCopyKey: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Configurer Reputy
        </CardTitle>
        <CardDescription>
          Suivez ces étapes pour commencer à collecter des avis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-bold text-sm">1</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Installez l'extension Chrome</h3>
            <p className="text-muted-foreground text-sm mb-3">
              L'extension Reputy s'intègre directement à Doctolib Pro pour vous permettre d'envoyer des demandes d'avis.
            </p>
            <Button asChild variant="outline">
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Chrome className="h-4 w-4 mr-2" />
                Installer l'extension
                <ExternalLink className="h-3 w-3 ml-2" />
              </a>
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-bold text-sm">2</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Ouvrez les paramètres de l'extension</h3>
            <p className="text-muted-foreground text-sm">
              Cliquez sur l'icône Reputy dans la barre d'outils Chrome, puis sur "Options" ou faites clic-droit → "Options".
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-bold text-sm">3</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Configurez l&apos;extension</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Renseignez les 3 champs dans les paramètres de l&apos;extension :
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 mb-3">
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[130px]">URL Backend :</span>
                <code className="px-2 py-0.5 bg-muted rounded text-xs">https://api.reputyapp.com</code>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[130px]">Token API :</span>
                <span>Générez-le ci-dessus puis collez-le</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[130px]">Clé publique :</span>
                <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{publicKey}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onCopyKey}
                  title="Copier"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">C'est prêt !</h3>
            <p className="text-muted-foreground text-sm">
              Rendez-vous sur Doctolib Pro. Un bouton "Envoyer une demande d'avis" apparaîtra sur les fiches patients.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TokenDisplayView({
  apiToken,
  tokenRevealed,
  setTokenRevealed,
  copiedToken,
  onCopyToken,
}: {
  apiToken: string
  tokenRevealed: boolean
  setTokenRevealed: (v: boolean) => void
  copiedToken: boolean
  onCopyToken: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="bg-white/10 backdrop-blur rounded-xl p-4 flex items-center justify-between gap-4">
        <code className="font-mono text-sm text-green-300 break-all">
          {tokenRevealed ? apiToken : '••••••••••••••••••••••••••••••••'}
        </code>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setTokenRevealed(!tokenRevealed)}
            variant="ghost"
            size="icon"
            className="text-white hover:text-white hover:bg-white/10"
            title={tokenRevealed ? 'Masquer' : 'Afficher'}
          >
            {tokenRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            onClick={onCopyToken}
            variant={copiedToken ? 'default' : 'secondary'}
            className={copiedToken ? 'bg-green-500 hover:bg-green-600' : ''}
          >
            {copiedToken ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copier
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="flex items-start gap-2 text-sm text-amber-200">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          ⚠️ Copiez ce token maintenant ! Il ne sera plus affiché après avoir quitté cette page.
        </span>
      </div>
    </div>
  )
}

function TokenGenerateView({
  hasToken,
  tokenMeta,
  tokenLoading,
  onRotateToken,
}: {
  hasToken: boolean
  tokenMeta: { apiTokenCreatedAt: string | null; apiTokenLastRotatedAt: string | null }
  tokenLoading: boolean
  onRotateToken: () => void
}) {
  return (
    <div className="space-y-3">
      {hasToken && (
        <div className="bg-white/10 backdrop-blur rounded-xl p-4">
          <p className="text-sm text-amber-200">
            Un token API existe déjà pour votre organisation.
            {tokenMeta.apiTokenLastRotatedAt && (
              <span className="block mt-1 text-xs text-amber-300">
                Dernière rotation : {new Date(tokenMeta.apiTokenLastRotatedAt).toLocaleString('fr-FR')}
              </span>
            )}
          </p>
        </div>
      )}
      <Button
        onClick={onRotateToken}
        disabled={tokenLoading}
        variant="secondary"
        className="w-full"
      >
        {tokenLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Génération...
          </>
        ) : (
          <>
            <RotateCw className="h-4 w-4 mr-2" />
            {hasToken ? 'Régénérer le Token API' : 'Générer le Token API'}
          </>
        )}
      </Button>
      <p className="text-xs text-amber-300">
        {hasToken
          ? "L'ancien token restera valide 24h après la rotation."
          : "Vous devrez copier ce token dans les paramètres de l'extension Chrome."
        }
      </p>
    </div>
  )
}
