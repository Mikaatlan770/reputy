'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth'
import {
  Plus,
  Building2,
  CheckCircle,
  Loader2,
} from 'lucide-react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  agent: 'Agent',
}

const verticalLabels: Record<string, string> = {
  health: 'Santé',
  beauty: 'Beauté',
  legal: 'Juridique',
  restaurant: 'Restaurant',
  other: 'Autre',
}

export default function LocationsPage() {
  const { clientOrg, memberships, switchOrg, fetchMemberships, getClientToken } = useAuth()
  
  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createVertical, setCreateVertical] = useState('health')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [switching, setSwitching] = useState<string | null>(null)

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === clientOrg?.id) return
    setSwitching(orgId)
    await switchOrg(orgId)
    // switchOrg does window.location.href = '/' on success
  }

  const handleCreateOrg = async () => {
    if (!createName.trim()) {
      setCreateError('Le nom est requis')
      return
    }

    setCreating(true)
    setCreateError('')

    try {
      const token = getClientToken()
      const response = await fetch(`${BACKEND_URL}/client/orgs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: createName.trim(), vertical: createVertical }),
      })

      const data = await response.json()

      if (!response.ok) {
        setCreateError(data.message || 'Erreur lors de la création')
        setCreating(false)
        return
      }

      // Refresh memberships list
      await fetchMemberships()
      
      // Reset dialog
      setShowCreateDialog(false)
      setCreateName('')
      setCreateVertical('health')
      setCreating(false)
    } catch {
      setCreateError('Erreur de connexion au serveur')
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Établissements</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos différents établissements
          </p>
        </div>
        <Button className="gap-1" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          Ajouter un établissement
        </Button>
      </div>

      {/* Locations Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {memberships.map((m) => {
          const isCurrent = clientOrg?.id === m.orgId
          const isLoading = switching === m.orgId

          return (
            <Card
              key={m.id}
              className={`hover:shadow-card-hover transition-all cursor-pointer ${
                isCurrent ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => !isCurrent && !isLoading && handleSwitchOrg(m.orgId)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex gap-1">
                    {isCurrent && (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Actif
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {roleLabels[m.role] || m.role}
                    </Badge>
                  </div>
                </div>

                <h3 className="font-semibold text-lg">{m.orgName}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {verticalLabels[m.orgVertical] || m.orgVertical}
                </p>

                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={m.orgStatus === 'active' ? 'success' : 'secondary'}>
                      {m.orgStatus === 'active' ? 'Actif' : m.orgStatus}
                    </Badge>
                  </div>

                  {/* Plan */}
                  {m.orgPlan && typeof m.orgPlan === 'object' && 'code' in m.orgPlan && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Plan</span>
                      <span className="text-sm font-medium">{String(m.orgPlan.code)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="flex-1" disabled>
                      Établissement actif
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      disabled={isLoading}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSwitchOrg(m.orgId)
                      }}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Changement...
                        </>
                      ) : (
                        'Sélectionner'
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {/* Add New Card */}
        <Card
          className="border-dashed hover:border-primary transition-colors cursor-pointer"
          onClick={() => setShowCreateDialog(true)}
        >
          <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[280px]">
            <div className="p-3 bg-muted rounded-full mb-3">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Ajouter un établissement</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Créer un nouvel établissement
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Org Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel établissement</DialogTitle>
            <DialogDescription>
              Créez un nouvel établissement pour votre organisation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom de l&apos;établissement *</label>
              <Input
                placeholder="Ex: Cabinet Dr. Martin"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={creating}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Secteur d&apos;activité</label>
              <Select value={createVertical} onValueChange={setCreateVertical} disabled={creating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="health">🏥 Santé</SelectItem>
                  <SelectItem value="beauty">💇 Beauté</SelectItem>
                  <SelectItem value="restaurant">🍽️ Restaurant</SelectItem>
                  <SelectItem value="legal">⚖️ Juridique</SelectItem>
                  <SelectItem value="other">📋 Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Annuler
            </Button>
            <Button onClick={handleCreateOrg} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
