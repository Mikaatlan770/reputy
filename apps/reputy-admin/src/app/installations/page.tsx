'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSecureToken } from '@/lib/auth/secure-token'
import { useRouter } from 'next/navigation'
import { useAuth, useIsClient } from '@/lib/auth'
import { parseBackendError, isErrorResponse } from '@/lib/error-messages'
import { 
  Plus,
  Copy,
  CheckCircle,
  Trash2,
  Key,
  Loader2,
  AlertCircle,
  Clock,
  Shield,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'

interface Installation {
  id: string
  label: string
  tokenMasked: string
  createdAt: string
  lastSeenAt: string | null
  status: 'active' | 'revoked'
}

export default function InstallationsPage() {
  const router = useRouter()
  const { mode, loading: authLoading, clientOrg } = useAuth()
  const isClient = useIsClient()
  
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [showToken, setShowToken] = useState(false)
  
  // Revoke dialog state
  const [revokeTarget, setRevokeTarget] = useState<Installation | null>(null)
  const [revoking, setRevoking] = useState(false)

  // Token auth via secure-token (clé correcte: reputy_client_token_prod)
  const getAuthToken = useCallback(async () => {
    return await getSecureToken()
  }, [])

  // Fetch installations
  const fetchInstallations = useCallback(async () => {
    const token = await getAuthToken()
    if (!token) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/installations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      setInstallations(data.installations || [])
    } catch (err) {
      setError('Impossible de charger les installations')
    } finally {
      setLoading(false)
    }
  }, [getAuthToken])

  // Create installation
  const handleCreate = async () => {
    const token = await getAuthToken()
    if (!token) return
    
    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/installations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ label: newLabel || 'Nouvelle installation' })
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      // Show the token (only time it's visible!)
      setNewToken(data.token)
      setShowToken(true)
      
      // Refresh list
      fetchInstallations()
    } catch (err) {
      setError('Impossible de créer l\'installation')
    } finally {
      setCreating(false)
    }
  }

  // Revoke installation
  const handleRevoke = async () => {
    if (!revokeTarget) return
    
    const token = await getAuthToken()
    if (!token) return
    
    setRevoking(true)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/installations/${revokeTarget.id}/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      // Refresh list
      fetchInstallations()
      setRevokeTarget(null)
    } catch (err) {
      setError('Impossible de révoquer l\'installation')
    } finally {
      setRevoking(false)
    }
  }

  // Copy token to clipboard
  const copyToken = async () => {
    if (!newToken) return
    
    try {
      await navigator.clipboard.writeText(newToken)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = newToken
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    }
  }

  // Close create dialog and reset
  const closeCreateDialog = () => {
    setCreateOpen(false)
    setNewLabel('')
    setNewToken(null)
    setShowToken(false)
    setTokenCopied(false)
  }

  // Initial load
  useEffect(() => {
    if (!authLoading && isClient) {
      fetchInstallations()
    }
  }, [authLoading, isClient, fetchInstallations])

  // Redirect if not client
  useEffect(() => {
    if (!authLoading && !isClient) {
      router.push('/')
    }
  }, [authLoading, isClient, router])

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not authorized
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Accès réservé aux clients</p>
        </div>
      </div>
    )
  }

  const activeInstallations = installations.filter(i => i.status === 'active')
  const revokedInstallations = installations.filter(i => i.status === 'revoked')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Installations</h1>
          <p className="text-muted-foreground">
            Gérez vos tokens d'API pour chaque appareil ou poste
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle installation
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Info card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 mb-1">Sécurité des tokens</h3>
              <p className="text-sm text-blue-700">
                Chaque installation possède son propre token. Si un appareil est compromis, 
                vous pouvez révoquer son token sans affecter les autres installations.
                Le token n'est affiché qu'une seule fois lors de la création.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active installations */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Installations actives ({activeInstallations.length})
        </h2>
        
        {activeInstallations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Aucune installation active
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer une installation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {activeInstallations.map((installation) => (
              <Card key={installation.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Key className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{installation.label}</h3>
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Actif
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                            {installation.tokenMasked}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Créé le {new Date(installation.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                          {installation.lastSeenAt && (
                            <span className="flex items-center gap-1">
                              <RefreshCw className="h-3 w-3" />
                              Dernière activité: {new Date(installation.lastSeenAt).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setRevokeTarget(installation)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Révoquer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Revoked installations */}
      {revokedInstallations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">
            Installations révoquées ({revokedInstallations.length})
          </h2>
          <div className="grid gap-4 opacity-60">
            {revokedInstallations.map((installation) => (
              <Card key={installation.id} className="bg-muted/50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Key className="h-5 w-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-muted-foreground">{installation.label}</h3>
                        <Badge variant="outline" className="text-gray-500 border-gray-300">
                          Révoqué
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Créé le {new Date(installation.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <CreateInstallationDialog
        open={createOpen}
        newToken={newToken}
        newLabel={newLabel}
        setNewLabel={setNewLabel}
        showToken={showToken}
        setShowToken={setShowToken}
        tokenCopied={tokenCopied}
        creating={creating}
        onClose={closeCreateDialog}
        onCreate={handleCreate}
        onCopyToken={copyToken}
      />

      <RevokeInstallationDialog
        target={revokeTarget}
        revoking={revoking}
        onClose={() => setRevokeTarget(null)}
        onRevoke={handleRevoke}
      />
    </div>
  )
}

function CreateInstallationDialog({
  open,
  newToken,
  newLabel,
  setNewLabel,
  showToken,
  setShowToken,
  tokenCopied,
  creating,
  onClose,
  onCreate,
  onCopyToken,
}: {
  open: boolean
  newToken: string | null
  newLabel: string
  setNewLabel: (v: string) => void
  showToken: boolean
  setShowToken: (v: boolean) => void
  tokenCopied: boolean
  creating: boolean
  onClose: () => void
  onCreate: () => void
  onCopyToken: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !newToken && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {newToken ? '🔑 Token créé !' : 'Nouvelle installation'}
          </DialogTitle>
          <DialogDescription>
            {newToken 
              ? 'Copiez ce token maintenant. Il ne sera plus affiché.'
              : 'Donnez un nom à cette installation pour l\'identifier facilement.'}
          </DialogDescription>
        </DialogHeader>

        {!newToken ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom de l'installation</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Poste accueil, iPhone Dr. Martin..."
                  className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={onCreate} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Créer
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <TokenCreatedView
            newToken={newToken}
            showToken={showToken}
            setShowToken={setShowToken}
            tokenCopied={tokenCopied}
            onCopyToken={onCopyToken}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevokeInstallationDialog({
  target,
  revoking,
  onClose,
  onRevoke,
}: {
  target: Installation | null
  revoking: boolean
  onClose: () => void
  onRevoke: () => void
}) {
  return (
    <Dialog open={!!target} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Révoquer l'installation ?</DialogTitle>
          <DialogDescription>
            Cette action est irréversible. L'appareil utilisant ce token ne pourra plus accéder à l'API.
          </DialogDescription>
        </DialogHeader>
        
        {target && (
          <div className="bg-muted rounded-lg p-4">
            <p className="font-medium">{target.label}</p>
            <p className="text-sm text-muted-foreground font-mono">{target.tokenMasked}</p>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            variant="destructive" 
            onClick={onRevoke}
            disabled={revoking}
          >
            {revoking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Révocation...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Révoquer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TokenCreatedView({
  newToken,
  showToken,
  setShowToken,
  tokenCopied,
  onCopyToken,
  onClose,
}: {
  newToken: string
  showToken: boolean
  setShowToken: (v: boolean) => void
  tokenCopied: boolean
  onCopyToken: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            ⚠️ Ce token ne sera affiché qu&apos;une seule fois. Copiez-le maintenant !
          </p>
        </div>

        <div className="relative">
          <div className="bg-slate-900 text-white rounded-lg p-4 font-mono text-sm break-all">
            {showToken ? newToken : '•'.repeat(newToken.length)}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-12"
            onClick={() => setShowToken(!showToken)}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            onClick={onCopyToken}
          >
            {tokenCopied ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={onCopyToken}
          variant={tokenCopied ? 'default' : 'outline'}
          className={tokenCopied ? 'bg-green-600 hover:bg-green-700' : ''}
        >
          {tokenCopied ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Copié !
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copier le token
            </>
          )}
        </Button>
        <Button onClick={onClose}>
          Fermer
        </Button>
      </DialogFooter>
    </>
  )
}
