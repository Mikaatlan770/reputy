'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { TeamMember, MembershipRole, MembershipPermissions } from '@/types'
import {
  Users,
  Shield,
  Crown,
  UserCheck,
  UserPlus,
  MoreVertical,
  Loader2,
  ShieldAlert,
  Trash2,
  Edit3,
  Clock,
  CheckCircle2,
} from 'lucide-react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============ PERMISSIONS CONFIG ============

const PERMISSION_LABELS: Record<keyof MembershipPermissions, { label: string; description: string }> = {
  reviews: { label: 'Avis', description: 'Voir et répondre aux avis' },
  stats: { label: 'Statistiques', description: 'Consulter les statistiques' },
  campaigns: { label: 'Campagnes', description: 'Gérer les campagnes SMS/email' },
  billing: { label: 'Facturation', description: 'Voir et modifier la facturation' },
  team: { label: 'Équipe', description: 'Gérer les membres de l\'équipe' },
  settings: { label: 'Paramètres', description: 'Modifier les paramètres' },
  ai: { label: 'Assistant IA', description: 'Utiliser l\'assistant IA' },
}

const DEFAULT_ADMIN_PERMISSIONS: MembershipPermissions = {
  reviews: true,
  stats: true,
  campaigns: true,
  billing: false,
  team: true,
  settings: true,
  ai: true,
}

const DEFAULT_AGENT_PERMISSIONS: MembershipPermissions = {
  reviews: true,
  stats: true,
  campaigns: false,
  billing: false,
  team: false,
  settings: false,
  ai: true,
}

function getDefaultPermissions(role: 'admin' | 'agent'): MembershipPermissions {
  return role === 'admin' ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_AGENT_PERMISSIONS }
}

// ============ ROLE HELPERS ============

const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Directeur',
  agent: 'Secrétaire',
}

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  agent: 'outline',
}

const statusLabels: Record<string, string> = {
  active: 'Actif',
  pending: 'En attente',
  revoked: 'Révoqué',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-orange-100 text-orange-800',
  revoked: 'bg-gray-100 text-gray-500',
}

// ============ PAGE ============

export default function TeamPage() {
  const { getClientToken, currentMembershipRole, clientUser } = useAuth()

  // Data state
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  // Invite dialog
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'agent'>('agent')
  const [invitePermissions, setInvitePermissions] = useState<MembershipPermissions>(getDefaultPermissions('agent'))
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // Edit role dialog
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'agent'>('agent')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null)
  const [revoking, setRevoking] = useState(false)

  // Action menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  // Success message
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const canManageTeam = currentMembershipRole === 'owner' || currentMembershipRole === 'admin'
  const isOwner = currentMembershipRole === 'owner'

  // ============ FETCH TEAM ============

  const fetchTeam = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAccessDenied(false)

    const token = getClientToken()
    if (!token) {
      setError('Non authentifié')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/client/team`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 403) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || 'Erreur lors du chargement de l\'équipe')
        setLoading(false)
        return
      }

      const data = await response.json()
      setTeam(data.team || [])
      setLoading(false)
    } catch {
      setError('Erreur de connexion au serveur')
      setLoading(false)
    }
  }, [getClientToken])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  // ============ INVITE ============

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('L\'email est requis')
      return
    }

    setInviting(true)
    setInviteError('')

    try {
      const token = getClientToken()
      const response = await fetch(`${BACKEND_URL}/client/team/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, permissions: invitePermissions }),
      })

      const data = await response.json()

      if (!response.ok) {
        setInviteError(data.message || 'Erreur lors de l\'invitation')
        setInviting(false)
        return
      }

      // Reset + refresh
      setShowInvite(false)
      setInviteEmail('')
      setInviteRole('agent')
      setInvitePermissions(getDefaultPermissions('agent'))
      setInviting(false)
      setSuccessMessage(`Invitation envoyée avec succès à ${data.membership?.email || inviteEmail.trim()}`)
      setTimeout(() => setSuccessMessage(null), 5000)
      await fetchTeam()
    } catch {
      setInviteError('Erreur de connexion au serveur')
      setInviting(false)
    }
  }

  // ============ UPDATE ROLE ============

  const handleUpdateRole = async () => {
    if (!editTarget) return

    setEditing(true)
    setEditError('')

    try {
      const token = getClientToken()
      const response = await fetch(`${BACKEND_URL}/client/team/${editTarget.membershipId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: editRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        setEditError(data.message || 'Erreur lors de la modification')
        setEditing(false)
        return
      }

      setEditTarget(null)
      setEditing(false)
      setSuccessMessage(`Rôle modifié avec succès`)
      setTimeout(() => setSuccessMessage(null), 5000)
      await fetchTeam()
    } catch {
      setEditError('Erreur de connexion au serveur')
      setEditing(false)
    }
  }

  // ============ REVOKE ============

  const handleRevoke = async () => {
    if (!revokeTarget) return

    setRevoking(true)

    try {
      const token = getClientToken()
      const response = await fetch(`${BACKEND_URL}/client/team/${revokeTarget.membershipId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        alert(data.message || 'Erreur lors de la révocation')
        setRevoking(false)
        return
      }

      setRevokeTarget(null)
      setRevoking(false)
      setSuccessMessage(`Accès révoqué avec succès`)
      setTimeout(() => setSuccessMessage(null), 5000)
      await fetchTeam()
    } catch {
      alert('Erreur de connexion au serveur')
      setRevoking(false)
    }
  }

  // ============ ROLE COUNTS ============

  const ownerCount = team.filter(m => m.role === 'owner' && m.status !== 'revoked').length
  const adminCount = team.filter(m => m.role === 'admin' && m.status !== 'revoked').length
  const agentCount = team.filter(m => m.role === 'agent' && m.status !== 'revoked').length
  const pendingCount = team.filter(m => m.status === 'pending').length

  // ============ ACCESS DENIED ============

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Équipe</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">Accès réservé aux administrateurs</h2>
            <p className="text-muted-foreground mt-2 max-w-md">
              Vous n&apos;avez pas les permissions nécessaires pour gérer l&apos;équipe de cet établissement.
              Contactez un administrateur ou le propriétaire.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ LOADING ============

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Équipe</h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  // ============ ERROR ============

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Équipe</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <Button onClick={fetchTeam} variant="outline" className="mt-4">
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Équipe</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les accès et les rôles de votre équipe
          </p>
        </div>
        {canManageTeam && (
          <Button className="gap-1" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4" />
            Inviter un membre
          </Button>
        )}
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:text-green-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Role Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Crown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{ownerCount}</p>
              <p className="text-xs text-muted-foreground">Propriétaires</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{adminCount}</p>
              <p className="text-xs text-muted-foreground">Directeurs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{agentCount}</p>
              <p className="text-xs text-muted-foreground">Secrétaires</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membres ({team.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucun membre dans l&apos;équipe</p>
            </div>
          ) : (
            <div className="space-y-2">
              {team.map((member) => {
                const isSelf = member.userId === clientUser?.id

                return (
                  <div
                    key={member.membershipId}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {member.email.substring(0, 2).toUpperCase()}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {member.name || member.email}
                          </p>
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              Vous
                            </Badge>
                          )}
                        </div>
                        {member.name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Role + Status */}
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant={roleBadgeVariant[member.role] || 'outline'}>
                        {roleLabels[member.role] || member.role}
                      </Badge>

                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[member.status] || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabels[member.status] || member.status}
                      </span>

                      {/* Actions menu */}
                      {canManageTeam && !isSelf && member.role !== 'owner' && member.status !== 'revoked' && (
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setMenuOpen(menuOpen === member.membershipId ? null : member.membershipId)}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>

                          {menuOpen === member.membershipId && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-50">
                              {isOwner && (
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                  onClick={() => {
                                    setEditTarget(member)
                                    setEditRole(member.role === 'admin' ? 'agent' : 'admin')
                                    setMenuOpen(null)
                                  }}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Modifier le rôle
                                </button>
                              )}
                              <button
                                className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-accent flex items-center gap-2"
                                onClick={() => {
                                  setRevokeTarget(member)
                                  setMenuOpen(null)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Révoquer l&apos;accès
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Log — Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Journal d&apos;activité</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          <p>Bientôt disponible</p>
        </CardContent>
      </Card>

      {/* ============ INVITE DIALOG ============ */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Envoyez une invitation par email pour rejoindre cet établissement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Email *</p>
              <Input
                type="email"
                placeholder="nom@exemple.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Rôle *</p>
              <Select value={inviteRole} onValueChange={(v) => {
                const role = v as 'admin' | 'agent'
                setInviteRole(role)
                setInvitePermissions(getDefaultPermissions(role))
              }} disabled={inviting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" />
                      Directeur / Directrice
                    </div>
                  </SelectItem>
                  <SelectItem value="agent">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5" />
                      Secrétaire
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {inviteRole === 'admin'
                  ? 'Peut gérer l\'équipe, inviter des membres et modifier les paramètres.'
                  : 'Peut répondre aux avis et consulter le tableau de bord.'}
              </p>
            </div>

            {/* Permissions granulaires */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Accès autorisés</p>
              <div className="border rounded-lg divide-y">
                {(Object.keys(PERMISSION_LABELS) as Array<keyof MembershipPermissions>).map((key) => (
                  <label
                    key={key}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium">{PERMISSION_LABELS[key].label}</p>
                      <p className="text-xs text-muted-foreground">{PERMISSION_LABELS[key].description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={invitePermissions[key]}
                      onChange={(e) => setInvitePermissions({ ...invitePermissions, [key]: e.target.checked })}
                      disabled={inviting}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            </div>

            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)} disabled={inviting}>
              Annuler
            </Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                'Envoyer l\'invitation'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT ROLE DIALOG ============ */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
            <DialogDescription>
              Modifier le rôle de {editTarget?.name || editTarget?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Nouveau rôle</p>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as 'admin' | 'agent')} disabled={editing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Directeur / Directrice</SelectItem>
                  <SelectItem value="agent">Secrétaire</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              Annuler
            </Button>
            <Button onClick={handleUpdateRole} disabled={editing}>
              {editing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Modification...
                </>
              ) : (
                'Confirmer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ REVOKE DIALOG ============ */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Révoquer l&apos;accès</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir révoquer l&apos;accès de {revokeTarget?.name || revokeTarget?.email} ?
              Cette personne ne pourra plus accéder à cet établissement.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Révocation...
                </>
              ) : (
                'Révoquer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
