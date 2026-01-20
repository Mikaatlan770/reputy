'use client'

import { useState, useEffect } from 'react'
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
  Shield
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore/detail/reputy/EXTENSION_ID'

/**
 * Page Installation - CLIENT ONLY
 * Affiche la publicKey et les instructions pour configurer l'extension Chrome
 */
export default function InstallationPage() {
  const router = useRouter()
  const { mode, loading, clientOrg, clientUser } = useAuth()
  const isClient = useIsClient()
  const [copied, setCopied] = useState(false)

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
  const periodEnd = credits?.periodStart 
    ? new Date(credits.periodStart).toLocaleDateString('fr-FR') 
    : 'N/A'

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

      {/* Setup Instructions */}
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
          {/* Step 1 */}
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

          {/* Step 2 */}
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

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-bold text-sm">3</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Collez votre clé publique</h3>
              <p className="text-muted-foreground text-sm mb-3">
                Copiez la clé ci-dessus et collez-la dans le champ "Clé publique" de l'extension.
              </p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 bg-muted rounded-lg text-sm font-mono">
                  {clientOrg.publicKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyKey}
                  title="Copier"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Step 4 */}
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

      {/* Help */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-semibold text-blue-900 mb-2">Besoin d'aide ?</h3>
            <p className="text-blue-700 text-sm mb-4">
              Notre équipe est là pour vous accompagner dans la configuration.
            </p>
            <Button asChild variant="default" className="bg-blue-600 hover:bg-blue-700">
              <a href="mailto:support@reputy.fr">
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
