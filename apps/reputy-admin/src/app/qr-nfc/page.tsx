'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSecureToken } from '@/lib/auth/secure-token'
import { useRouter } from 'next/navigation'
import { useAuth, useIsClient } from '@/lib/auth'
import { parseBackendError, isErrorResponse } from '@/lib/error-messages'
import { 
  Plus,
  QrCode,
  Smartphone,
  Copy,
  CheckCircle,
  Trash2,
  Loader2,
  AlertCircle,
  ExternalLink,
  Download,
  MousePointer2,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'

interface Shortlink {
  code: string
  type: 'qr' | 'nfc'
  label: string
  targetUrl: string
  shortUrl: string
  clicks: number
  createdAt: string
  lastClickedAt: string | null
}

interface Stats {
  totalQr: number
  totalNfc: number
  totalClicks: number
}

export default function QrNfcPage() {
  const router = useRouter()
  const { loading: authLoading, clientOrg } = useAuth()
  const isClient = useIsClient()
  
  const [shortlinks, setShortlinks] = useState<Shortlink[]>([])
  const [stats, setStats] = useState<Stats>({ totalQr: 0, totalNfc: 0, totalClicks: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<'qr' | 'nfc'>('qr')
  const [newLabel, setNewLabel] = useState('')
  const [newTargetUrl, setNewTargetUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [newShortlink, setNewShortlink] = useState<Shortlink | null>(null)
  const [copied, setCopied] = useState(false)
  
  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Shortlink | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Token auth via secure-token (clé correcte: reputy_client_token_prod)
  const getAuthToken = useCallback(async () => {
    return await getSecureToken()
  }, [])

  // Fetch shortlinks
  const fetchShortlinks = useCallback(async () => {
    const token = await getAuthToken()
    if (!token) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/shortlinks`, {
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
      
      setShortlinks(data.shortlinks || [])
      setStats(data.stats || { totalQr: 0, totalNfc: 0, totalClicks: 0 })
    } catch (err) {
      setError('Impossible de charger les shortlinks')
    } finally {
      setLoading(false)
    }
  }, [getAuthToken])

  // Create shortlink
  const handleCreate = async () => {
    const token = await getAuthToken()
    if (!token) return
    
    if (!newTargetUrl) {
      setError('L\'URL de destination est requise')
      return
    }
    
    setCreating(true)
    setError(null)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/shortlinks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          type: createType,
          targetUrl: newTargetUrl,
          label: newLabel || `${createType.toUpperCase()} ${new Date().toLocaleDateString('fr-FR')}`
        })
      })
      
      const data = await response.json()
      
      if (isErrorResponse(data)) {
        const errorDisplay = parseBackendError(data)
        setError(errorDisplay.message)
        return
      }
      
      setNewShortlink(data.shortlink)
      fetchShortlinks()
    } catch (err) {
      setError('Impossible de créer le shortlink')
    } finally {
      setCreating(false)
    }
  }

  // Delete shortlink
  const handleDelete = async () => {
    if (!deleteTarget) return
    
    const token = await getAuthToken()
    if (!token) return
    
    setDeleting(true)
    
    try {
      const response = await fetch(`${BACKEND_URL}/client/shortlinks/${deleteTarget.code}`, {
        method: 'DELETE',
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
      
      fetchShortlinks()
      setDeleteTarget(null)
    } catch (err) {
      setError('Impossible de supprimer le shortlink')
    } finally {
      setDeleting(false)
    }
  }

  // Copy to clipboard
  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Download QR code (PNG) from backend endpoint
  const downloadQr = useCallback(async (code: string) => {
    const token = await getAuthToken()
    if (!token) return
    
    fetch(`${BACKEND_URL}/client/shortlinks/${code}/qr?format=png`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `qr-${code}.png`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => {
        setError('Erreur lors du téléchargement du QR code')
      })
  }, [getAuthToken])

  // Close create dialog
  const closeCreateDialog = () => {
    setCreateOpen(false)
    setNewLabel('')
    setNewTargetUrl('')
    setNewShortlink(null)
    setCopied(false)
  }

  // Open create dialog with type - pre-fill with Google Review URL if available
  const openCreateDialog = (type: 'qr' | 'nfc') => {
    setCreateType(type)
    // Pre-fill URL with Google Review URL from org settings
    const googleReviewUrl = (clientOrg as any)?.options?.googleReviewUrl || ''
    setNewTargetUrl(googleReviewUrl)
    setCreateOpen(true)
  }

  // Initial load
  useEffect(() => {
    if (!authLoading && isClient) {
      fetchShortlinks()
    }
  }, [authLoading, isClient, fetchShortlinks])

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

  const qrLinks = shortlinks.filter(s => s.type === 'qr')
  const nfcLinks = shortlinks.filter(s => s.type === 'nfc')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">QR Codes & NFC</h1>
        <p className="text-muted-foreground">
          Créez des liens courts pour vos QR codes et tags NFC
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <QrCode className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalQr}</p>
                <p className="text-sm text-muted-foreground">QR codes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalNfc}</p>
                <p className="text-sm text-muted-foreground">Tags NFC</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <MousePointer2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalClicks}</p>
                <p className="text-sm text-muted-foreground">Clics total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="qr">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="qr" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              QR Codes ({qrLinks.length})
            </TabsTrigger>
            <TabsTrigger value="nfc" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Tags NFC ({nfcLinks.length})
            </TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openCreateDialog('qr')}>
              <QrCode className="h-4 w-4 mr-2" />
              Nouveau QR
            </Button>
            <Button onClick={() => openCreateDialog('nfc')}>
              <Smartphone className="h-4 w-4 mr-2" />
              Nouveau NFC
            </Button>
          </div>
        </div>

        <TabsContent value="qr">
          {qrLinks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Aucun QR code créé
                </p>
                <Button onClick={() => openCreateDialog('qr')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un QR code
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ShortlinkList 
              shortlinks={qrLinks} 
              onCopy={copyUrl}
              onDelete={setDeleteTarget}
              onDownloadQr={downloadQr}
              copied={copied}
            />
          )}
        </TabsContent>

        <TabsContent value="nfc">
          {/* NFC Instructions */}
          <Card className="mb-4 bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Smartphone className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-purple-900 mb-1">Comment configurer un tag NFC ?</h3>
                  <ol className="text-sm text-purple-700 list-decimal list-inside space-y-1">
                    <li>Créez un nouveau lien NFC ci-dessous</li>
                    <li>Copiez l'URL courte générée</li>
                    <li>Utilisez une application comme "NFC Tools" pour programmer votre tag</li>
                    <li>Choisissez "URL" et collez votre lien court</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {nfcLinks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Aucun tag NFC créé
                </p>
                <Button onClick={() => openCreateDialog('nfc')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un lien NFC
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ShortlinkList 
              shortlinks={nfcLinks} 
              onCopy={copyUrl}
              onDelete={setDeleteTarget}
              onDownloadQr={downloadQr}
              copied={copied}
            />
          )}
        </TabsContent>
      </Tabs>

      <CreateShortlinkDialog
        open={createOpen}
        createType={createType}
        newShortlink={newShortlink}
        newLabel={newLabel}
        setNewLabel={setNewLabel}
        newTargetUrl={newTargetUrl}
        setNewTargetUrl={setNewTargetUrl}
        googleReviewUrl={(clientOrg as any)?.options?.googleReviewUrl || ''}
        copied={copied}
        creating={creating}
        onClose={closeCreateDialog}
        onCreate={handleCreate}
        onCopyUrl={copyUrl}
        getAuthToken={getAuthToken}
      />

      <DeleteShortlinkDialog
        target={deleteTarget}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onDelete={handleDelete}
      />
    </div>
  )
}

function CreateShortlinkDialog({
  open,
  createType,
  newShortlink,
  newLabel,
  setNewLabel,
  newTargetUrl,
  setNewTargetUrl,
  googleReviewUrl,
  copied,
  creating,
  onClose,
  onCreate,
  onCopyUrl,
  getAuthToken,
}: {
  open: boolean
  createType: 'qr' | 'nfc'
  newShortlink: Shortlink | null
  newLabel: string
  setNewLabel: (v: string) => void
  newTargetUrl: string
  setNewTargetUrl: (v: string) => void
  googleReviewUrl: string
  copied: boolean
  creating: boolean
  onClose: () => void
  onCreate: () => void
  onCopyUrl: (url: string) => void
  getAuthToken: () => Promise<string | null>
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !newShortlink && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {newShortlink 
              ? `✅ ${createType === 'qr' ? 'QR Code' : 'Lien NFC'} créé !`
              : `Nouveau ${createType === 'qr' ? 'QR Code' : 'lien NFC'}`}
          </DialogTitle>
          <DialogDescription>
            {newShortlink 
              ? 'Votre lien court est prêt à utiliser.'
              : 'Configurez votre nouveau lien court.'}
          </DialogDescription>
        </DialogHeader>

        {!newShortlink ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom (optionnel)</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Comptoir accueil, Table 1..."
                  className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm font-medium">URL de destination *</label>
                <input
                  type="url"
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  placeholder="https://g.page/r/votre-lien/review"
                  className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {newTargetUrl && googleReviewUrl === newTargetUrl
                    ? '✅ Pré-rempli avec votre URL Google Review'
                    : "L'URL vers laquelle les utilisateurs seront redirigés"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={onCreate} disabled={creating || !newTargetUrl}>
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
          <>
            <div className="space-y-4">
              <div className="bg-slate-900 text-white rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">URL courte</p>
                <p className="font-mono text-lg text-amber-300 break-all">
                  {newShortlink.shortUrl}
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="flex-1"
                  variant={copied ? 'default' : 'outline'}
                  onClick={() => onCopyUrl(newShortlink.shortUrl)}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Copié !
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copier l'URL
                    </>
                  )}
                </Button>
                <Button variant="outline" asChild>
                  <a href={newShortlink.shortUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Tester
                  </a>
                </Button>
              </div>
              
              {createType === 'qr' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Téléchargez votre QR code :
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" asChild>
                      <a 
                        href={`${BACKEND_URL}/client/shortlinks/${newShortlink.code}/qr?format=png`}
                        download={`qr-${newShortlink.code}.png`}
                        onClick={async (e) => {
                          e.preventDefault()
                          const token = await getAuthToken()
                          if (!token) return
                          fetch(`${BACKEND_URL}/client/shortlinks/${newShortlink.code}/qr?format=png`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                          })
                            .then(res => res.blob())
                            .then(blob => {
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `qr-${newShortlink.code}.png`
                              a.click()
                              URL.revokeObjectURL(url)
                            })
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        PNG
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a 
                        href={`${BACKEND_URL}/client/shortlinks/${newShortlink.code}/qr?format=svg`}
                        download={`qr-${newShortlink.code}.svg`}
                        onClick={async (e) => {
                          e.preventDefault()
                          const token = await getAuthToken()
                          if (!token) return
                          fetch(`${BACKEND_URL}/client/shortlinks/${newShortlink.code}/qr?format=svg`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                          })
                            .then(res => res.blob())
                            .then(blob => {
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `qr-${newShortlink.code}.svg`
                              a.click()
                              URL.revokeObjectURL(url)
                            })
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        SVG
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={onClose}>
                Fermer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteShortlinkDialog({
  target,
  deleting,
  onClose,
  onDelete,
}: {
  target: Shortlink | null
  deleting: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <Dialog open={!!target} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer ce lien ?</DialogTitle>
          <DialogDescription>
            Cette action est irréversible. Les QR codes et tags NFC utilisant ce lien ne fonctionneront plus.
          </DialogDescription>
        </DialogHeader>
        
        {target && (
          <div className="bg-muted rounded-lg p-4">
            <p className="font-medium">{target.label}</p>
            <p className="text-sm text-muted-foreground font-mono">{target.shortUrl}</p>
            <p className="text-sm text-muted-foreground mt-1">{target.clicks} clics</p>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            variant="destructive" 
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Suppression...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShortlinkList({ 
  shortlinks, 
  onCopy, 
  onDelete,
  onDownloadQr,
  copied 
}: { 
  shortlinks: Shortlink[]
  onCopy: (url: string) => void
  onDelete: (s: Shortlink) => void
  onDownloadQr: (code: string) => void
  copied: boolean
}) {
  return (
    <div className="grid gap-4">
      {shortlinks.map((shortlink) => (
        <Card key={shortlink.code}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  shortlink.type === 'qr' ? 'bg-blue-100' : 'bg-purple-100'
                }`}>
                  {shortlink.type === 'qr' 
                    ? <QrCode className="h-5 w-5 text-blue-600" />
                    : <Smartphone className="h-5 w-5 text-purple-600" />
                  }
                </div>
                <div>
                  <h3 className="font-medium">{shortlink.label}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">
                      {shortlink.shortUrl}
                    </code>
                    <span className="flex items-center gap-1">
                      <MousePointer2 className="h-3 w-3" />
                      {shortlink.clicks} clics
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(shortlink.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCopy(shortlink.shortUrl)}
                  title="Copier l'URL"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {shortlink.type === 'qr' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownloadQr(shortlink.code)}
                    title="Télécharger le QR code (PNG)"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  title="Tester le lien"
                >
                  <a href={shortlink.shortUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => onDelete(shortlink)}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
