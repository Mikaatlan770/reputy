'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { users, auditLogs } from '@/lib/mock-data'
import { formatDateTime, getInitials } from '@/lib/utils'
import {
  Plus,
  Shield,
  User,
  Users,
  MoreHorizontal,
  Mail,
} from 'lucide-react'

export default function TeamPage() {
  const roleColors = {
    admin: 'bg-purple-100 text-purple-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-800',
  }

  const roleIcons = {
    admin: Shield,
    manager: Users,
    staff: User,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Équipe & Rôles</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les membres de votre équipe et leurs permissions
          </p>
        </div>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          Inviter un membre
        </Button>
      </div>

      {/* Roles Overview */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          {
            role: 'Admin',
            description: 'Accès complet : campagnes, facturation, paramètres',
            count: users.filter((u) => u.role === 'admin').length,
            color: 'purple',
          },
          {
            role: 'Manager',
            description: 'Gestion des avis, équipe, analytics',
            count: users.filter((u) => u.role === 'manager').length,
            color: 'blue',
          },
          {
            role: 'Staff',
            description: 'Répondre aux avis, voir inbox',
            count: users.filter((u) => u.role === 'staff').length,
            color: 'gray',
          },
        ].map((item) => (
          <Card key={item.role}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div
                  className={`p-2 rounded-lg bg-${item.color}-100`}
                >
                  <Shield className={`h-5 w-5 text-${item.color}-600`} />
                </div>
                <span className="text-2xl font-bold">{item.count}</span>
              </div>
              <p className="font-medium mt-2">{item.role}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membres de l'équipe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => {
              const RoleIcon = roleIcons[user.role]
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={roleColors[user.role]}>
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {user.locationIds.length} établissement(s)
                    </span>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal d'activité</CardTitle>
          <CardDescription>Dernières actions de l'équipe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(log.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">{log.userName}</span>
                      {' a effectué '}
                      <span className="text-primary">{log.action}</span>
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





