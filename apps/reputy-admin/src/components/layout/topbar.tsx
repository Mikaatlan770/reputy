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
        'fixed top-0 right-0 z-40 h-16 bg-card border-b border-border transition-all duration-300',
        // Mobile: full-width (sidebar hidden). Desktop: respect sidebar width.
        'left-0',
        sidebarOpen ? 'md:left-64' : 'md:left-16'
      )}
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left: Org selector (mobile compact) */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          {/* Desktop sidebar toggle — hidden on mobile (bottom nav instead) */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex lg:hidden"
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
              {/* Mobile: compact / Desktop: full width */}
              <SelectTrigger className="max-w-[200px] md:max-w-[300px] bg-background truncate">
                <SelectValue placeholder="Établissement" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.orgId} value={m.orgId}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{m.orgName}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {roleLabels[m.role] || m.role}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : isClient && clientOrg ? (
            // Single org: just show the name
            <div className="flex items-center gap-2 px-2 md:px-3 py-1.5 min-w-0">
              <span className="font-medium text-sm truncate">{clientOrg.name}</span>
            </div>
          ) : null}
        </div>

        {/* Center: Search — hidden on mobile */}
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
        <div className="flex items-center gap-2 md:gap-3">
          {/* Notifications — placeholder, fonctionnalité à venir */}
          <Button variant="ghost" size="icon" className="relative" title="Notifications (bientôt disponible)">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </Button>

          {/* Profile */}
          <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-3 border-l border-border">
            {/* Name/role — hidden on small screens */}
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium truncate max-w-[150px]">
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {displayRole}
              </p>
            </div>
            <Avatar className="h-8 w-8 md:h-9 md:w-9">
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
                className="h-8 w-8 md:h-9 md:w-9"
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
