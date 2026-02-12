'use client'

import { useAppStore } from '@/lib/store'
import { useAuth, useIsClient } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bell,
  Search,
  Menu,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { LOGOUT_REDIRECT_URL } from '@/lib/constants'

// Role labels for display
const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Directeur',
  agent: 'Secrétaire',
}

export function Topbar() {
  const { 
    currentUser,
    sidebarOpen,
    toggleSidebar 
  } = useAppStore()
  
  const { mode, clientUser, clientOrg, logoutClient, memberships, currentMembershipRole, switchOrg } = useAuth()
  const isClient = useIsClient()

  // Handle logout for clients - redirect to reputy-web
  const handleLogout = async () => {
    await logoutClient()
    window.location.href = LOGOUT_REDIRECT_URL
  }

  // Handle org switch
  const handleOrgSwitch = async (orgId: string) => {
    // Don't switch if already on this org
    if (orgId === clientOrg?.id) return
    await switchOrg(orgId)
    // switchOrg does window.location.href = '/' on success
  }
  
  // Get display name based on auth mode
  const displayName = isClient && clientOrg 
    ? clientOrg.name 
    : currentUser 
      ? `${currentUser.civility} ${currentUser.firstName} ${currentUser.lastName}` 
      : ''
  
  // PR-8c: Use membership role, not user role
  const displayRole = isClient && currentMembershipRole
    ? roleLabels[currentMembershipRole] || currentMembershipRole
    : isClient && clientUser 
      ? clientUser.role 
      : currentUser?.role || ''
  
  const initials = isClient && clientOrg
    ? clientOrg.name.substring(0, 2).toUpperCase()
    : currentUser 
      ? `${currentUser.lastName[0]}${currentUser.firstName[0]}`.toUpperCase()
      : 'U'

  // PR-8c: Determine if we have multiple orgs to show the picker
  const hasMultipleOrgs = memberships.length > 1

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 bg-card border-b border-border transition-all duration-300',
        sidebarOpen ? 'left-64' : 'left-16'
      )}
    >
      <div className="flex h-full items-center justify-between px-6">
        {/* Left: Mobile menu + Org selector */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* PR-8c: Org picker — real memberships */}
          {isClient && hasMultipleOrgs ? (
            <Select
              value={clientOrg?.id || ''}
              onValueChange={handleOrgSwitch}
            >
              <SelectTrigger className="w-[300px] bg-background">
                <SelectValue placeholder="Sélectionner un établissement" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.orgId} value={m.orgId}>
                    <div className="flex items-center gap-2">
                      <span>{m.orgName}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {roleLabels[m.role] || m.role}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : isClient && clientOrg ? (
            // Single org: just show the name, no dropdown
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="font-medium text-sm">{clientOrg.name}</span>
            </div>
          ) : null}
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un avis, un client..."
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center gap-3">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive text-[10px] font-bold text-white rounded-full flex items-center justify-center">
              3
            </span>
          </Button>

          {/* Profile */}
          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {displayRole}
              </p>
            </div>
            <Avatar className="h-9 w-9">
              <AvatarImage src={currentUser?.avatar} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            {/* Logout button for clients */}
            {isClient && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
