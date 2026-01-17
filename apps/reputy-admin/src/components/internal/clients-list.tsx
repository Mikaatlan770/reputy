'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Org } from '@/lib/internal/fetch-internal'
import { createOrg, refreshClients } from '@/lib/internal/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle,
  Building2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  Store,
  Utensils,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientsListProps {
  initialOrgs: Org[]
  error?: string
}

const verticalIcons = {
  health: Stethoscope,
  food: Utensils,
  business: Store,
}

const verticalLabels = {
  health: 'Santé',
  food: 'Restauration',
  business: 'Commerce',
}

const statusColors = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const statusLabels = {
  active: 'Actif',
  suspended: 'Suspendu',
  cancelled: 'Annulé',
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ClientsList({ initialOrgs, error }: ClientsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [orgs] = useState(initialOrgs)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterVertical, setFilterVertical] = useState<string>('all')
  
  // Create modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createVertical, setCreateVertical] = useState<'health' | 'food' | 'business'>('health')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const filteredOrgs = orgs.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || org.status === filterStatus
    const matchesVertical = filterVertical === 'all' || org.vertical === filterVertical
    return matchesSearch && matchesStatus && matchesVertical
  })

  function handleRefresh() {
    startTransition(() => {
      refreshClients()
      router.refresh()
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateLoading(true)
    setCreateError('')

    const result = await createOrg({ name: createName, vertical: createVertical })
    
    if (result.ok) {
      setCreateOpen(false)
      setCreateName('')
      router.refresh()
    } else {
      setCreateError(result.error || 'Erreur lors de la création')
    }
    
    setCreateLoading(false)
  }

  if (error) {
    return (
      <Card className="bg-red-500/10 border-red-500/20">
        <CardContent className="p-6 flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>Erreur: {error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto">
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>
        
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="suspended">Suspendus</SelectItem>
            <SelectItem value="cancelled">Annulés</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterVertical} onValueChange={setFilterVertical}>
          <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-white">
            <SelectValue placeholder="Vertical" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="health">Santé</SelectItem>
            <SelectItem value="food">Restauration</SelectItem>
            <SelectItem value="business">Commerce</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isPending}
          className="border-slate-700 text-slate-400 hover:text-white"
        >
          <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
        </Button>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
              <Plus className="h-4 w-4" />
              Nouveau client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>Créer un nouveau client</DialogTitle>
              <DialogDescription className="text-slate-400">
                Ajoutez un nouveau client à la plateforme Reputy.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom du client</label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Cabinet Dr. Dupont"
                  className="bg-slate-700 border-slate-600"
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Secteur</label>
                <Select value={createVertical} onValueChange={(v: 'health' | 'food' | 'business') => setCreateVertical(v)}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="health">🏥 Santé</SelectItem>
                    <SelectItem value="food">🍽️ Restauration</SelectItem>
                    <SelectItem value="business">🏪 Commerce</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {createError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <p className="text-sm text-red-400">{createError}</p>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="border-slate-600">
                  Annuler
                </Button>
                <Button type="submit" disabled={createLoading} className="bg-amber-500 hover:bg-amber-600">
                  {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total clients</p>
            <p className="text-2xl font-bold text-white">{orgs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Actifs</p>
            <p className="text-2xl font-bold text-green-400">
              {orgs.filter(o => o.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Suspendus</p>
            <p className="text-2xl font-bold text-amber-400">
              {orgs.filter(o => o.status === 'suspended').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Annulés</p>
            <p className="text-2xl font-bold text-red-400">
              {orgs.filter(o => o.status === 'cancelled').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filteredOrgs.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-8 text-center text-slate-500">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun client trouvé</p>
            </CardContent>
          </Card>
        ) : (
          filteredOrgs.map((org) => {
            const VerticalIcon = verticalIcons[org.vertical]
            const effectivePrice = org.negotiated?.enabled 
              ? (org.negotiated.customPriceCents || org.plan.basePriceCents)
              : org.plan.basePriceCents
            
            return (
              <Link key={org.id} href={`/internal/clients/${org.id}`}>
                <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <VerticalIcon className="h-5 w-5 text-slate-400" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white truncate">{org.name}</h3>
                          <Badge variant="outline" className={statusColors[org.status]}>
                            {statusLabels[org.status]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span>{verticalLabels[org.vertical]}</span>
                          <span>•</span>
                          <span>{org.plan.code}</span>
                          <span>•</span>
                          <span>Créé le {formatDate(org.createdAt)}</span>
                        </div>
                      </div>

                      {/* Usage */}
                      <div className="hidden sm:flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-slate-400">
                            <MessageSquare className="h-3 w-3" />
                            <span>{org.usage30d?.sms || 0}</span>
                          </div>
                          <p className="text-xs text-slate-600">SMS/30j</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-slate-400">
                            <Mail className="h-3 w-3" />
                            <span>{org.usage30d?.email || 0}</span>
                          </div>
                          <p className="text-xs text-slate-600">Email/30j</p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="hidden md:block text-right">
                        <p className={cn(
                          'font-medium',
                          org.negotiated?.enabled ? 'text-amber-400' : 'text-white'
                        )}>
                          {formatPrice(effectivePrice)}
                        </p>
                        <p className="text-xs text-slate-600">
                          /{org.plan.billingCycle === 'monthly' ? 'mois' : 'an'}
                        </p>
                      </div>

                      <ChevronRight className="h-5 w-5 text-slate-600" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
