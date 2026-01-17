'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Send,
  MessageSquare,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Star,
  ExternalLink,
  Search,
  Filter,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Phone,
  User,
  ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PatientInfo {
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

interface FeedbackInfo {
  rating: number
  comment: string
  submittedAt: string
  routing?: {
    mode: 'PUBLIC_REVIEW' | 'INTERNAL_FEEDBACK'
    target?: string
  }
}

interface Request {
  id: string
  createdAt: string
  lastSentAt?: string
  sendCount?: number
  channel: 'sms' | 'email'
  patient: PatientInfo
  feedbackUrl: string
  status: 'pending' | 'completed' | 'expired'
  feedback: FeedbackInfo | null
  isExpired: boolean
  meta?: {
    source?: string
    pageUrl?: string
  }
}

interface Stats {
  total: number
  pending: number
  completed: number
  expired: number
  conversionRate: number
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8787'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || 'dev-token'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'completed':
      return {
        label: 'Répondu',
        color: 'bg-green-100 text-green-700 border-green-200',
        icon: CheckCircle,
      }
    case 'expired':
      return {
        label: 'Expiré',
        color: 'bg-gray-100 text-gray-500 border-gray-200',
        icon: XCircle,
      }
    case 'pending':
    default:
      return {
        label: 'En attente',
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        icon: Clock,
      }
  }
}

function getChannelConfig(channel: string) {
  switch (channel) {
    case 'email':
      return {
        label: 'Email',
        icon: Mail,
        color: 'text-orange-600 bg-orange-100',
      }
    case 'sms':
    default:
      return {
        label: 'SMS',
        icon: MessageSquare,
        color: 'text-green-600 bg-green-100',
      }
  }
}

export default function HistoryPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterChannel, setFilterChannel] = useState<string>('all')

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${BACKEND_URL}/api/requests`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      })
      if (response.ok) {
        const data = await response.json()
        setRequests(data.requests || [])
        setStats(data.stats || null)
      }
    } catch (err) {
      console.error('Failed to load requests:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtrage
  const filteredRequests = requests.filter((request) => {
    // Recherche
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesName = request.patient.name?.toLowerCase().includes(search)
      const matchesPhone = request.patient.phone?.includes(search)
      const matchesEmail = request.patient.email?.toLowerCase().includes(search)
      if (!matchesName && !matchesPhone && !matchesEmail) return false
    }
    
    // Filtre statut
    if (filterStatus !== 'all' && request.status !== filterStatus) return false
    
    // Filtre canal
    if (filterChannel !== 'all' && request.channel !== filterChannel) return false
    
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Historique des envois</h1>
          <p className="text-muted-foreground mt-1">
            Traçabilité complète des demandes d'avis envoyées
          </p>
        </div>
        <Button onClick={fetchRequests} variant="outline" className="gap-2">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total envoyé</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">En attente</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Répondus</p>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expirés</p>
                  <p className="text-2xl font-bold">{stats.expired}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20 text-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taux réponse</p>
                  <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, téléphone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-background"
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="completed">Répondus</option>
                <option value="expired">Expirés</option>
              </select>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-background"
              >
                <option value="all">Tous les canaux</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Demandes d'avis ({filteredRequests.length})
          </CardTitle>
          <CardDescription>
            Liste chronologique de toutes les demandes envoyées
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <Send className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold">Aucune demande</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {searchTerm || filterStatus !== 'all' || filterChannel !== 'all'
                  ? 'Aucun résultat pour ces filtres'
                  : 'Les demandes d\'avis apparaîtront ici'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((request) => {
                const statusConfig = getStatusConfig(request.status)
                const channelConfig = getChannelConfig(request.channel)
                const StatusIcon = statusConfig.icon
                const ChannelIcon = channelConfig.icon

                return (
                  <div
                    key={request.id}
                    className={cn(
                      'p-4 rounded-xl border transition-colors hover:bg-muted/50',
                      request.status === 'completed' && 'border-green-200 bg-green-50/30',
                      request.status === 'expired' && 'border-gray-200 bg-gray-50/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Info principale */}
                      <div className="flex items-start gap-4 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {getInitials(request.patient.name || 'N/A')}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {request.patient.firstName && request.patient.lastName
                                ? `${request.patient.firstName} ${request.patient.lastName}`
                                : request.patient.name}
                            </span>
                            <Badge variant="outline" className={statusConfig.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                            <div className={cn('p-1 rounded', channelConfig.color)}>
                              <ChannelIcon className="h-3 w-3" />
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            {request.patient.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {request.patient.phone}
                              </span>
                            )}
                            {request.patient.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {request.patient.email}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Envoyé le {formatDateShort(request.createdAt)}
                            </span>
                            {request.sendCount && request.sendCount > 1 && (
                              <span className="flex items-center gap-1 text-amber-600">
                                <RefreshCw className="h-3 w-3" />
                                {request.sendCount} envois
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Feedback info */}
                      <div className="flex flex-col items-end gap-2">
                        {request.feedback ? (
                          <>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    'h-4 w-4',
                                    i <= request.feedback!.rating
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-gray-200'
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Répondu le {formatDateShort(request.feedback.submittedAt)}
                            </span>
                            {request.feedback.routing?.mode === 'PUBLIC_REVIEW' && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                <ArrowUpRight className="h-3 w-3 mr-1" />
                                Redirigé Google
                              </Badge>
                            )}
                            {request.feedback.comment && (
                              <p className="text-xs text-muted-foreground max-w-[200px] truncate" title={request.feedback.comment}>
                                "{request.feedback.comment}"
                              </p>
                            )}
                          </>
                        ) : request.status === 'pending' ? (
                          <a
                            href={request.feedbackUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            Voir le lien
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Pas de réponse
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
