'use client'

import { useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { MobileBottomNav } from './mobile-bottom-nav'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { LOGIN_URL } from '@/lib/constants'
import { useNetworkStatus } from '@/lib/network-status'
import { OfflineScreen } from '@/components/offline-screen'
import { OfflineBanner } from '@/components/offline-banner'
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh'
import { hapticImpact } from '@/lib/haptics'
import type { Location, UserCivility } from '@/types'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const { sidebarOpen, initialize, setMemberships, setUserLocations, setCurrentLocation, setCurrentUser, setOrgSettings } = useAppStore()
  const auth = useAuth()
  const { online } = useNetworkStatus()

  // Pull-to-refresh : reload + haptic feedback (V1)
  const handlePullRefresh = useCallback(async () => {
    await hapticImpact('light')
    window.location.reload()
  }, [])
  usePullToRefresh(handlePullRefresh, { disabled: !online })

  useEffect(() => {
    initialize()
  }, [initialize])

  // PR-8c+8d: Hydrate store from auth-context when memberships are loaded
  // Guard: only when CLIENT mode + memberships available (avoids flicker)
  useEffect(() => {
    if (auth.mode === 'CLIENT' && auth.memberships && auth.memberships.length > 0) {
      setMemberships(auth.memberships)
      
      // Map memberships → Location[] for rétrocompat with topbar/other pages
      // Include lat/lng/specialty/address from clientOrg for the active org
      const clientOrg = auth.clientOrg
      const locs: Location[] = auth.memberships.map(m => ({
        id: m.orgId,
        name: m.orgName,
        address: (m.orgId === clientOrg?.id ? clientOrg?.address : '') || '',
        city: '',
        country: 'France',
        googleConnected: false,
        googleSessionValid: false,
        reviewLink: '',
        // Establishment info for competitor search
        ...(m.orgId === clientOrg?.id ? {
          lat: clientOrg?.lat ?? undefined,
          lng: clientOrg?.lng ?? undefined,
          specialty: (clientOrg?.specialty as Location['specialty']) ?? undefined,
          establishmentType: (clientOrg?.vertical === 'health' ? 'health' : clientOrg?.vertical === 'food' ? 'restaurant' : 'commerce') as Location['establishmentType'],
        } : {}),
        healthMode: m.orgVertical === 'health',
        createdAt: m.acceptedAt || '',
      }))
      setUserLocations(locs)
      
      // Set current location = org active de la session
      const currentLoc = locs.find(l => l.id === auth.clientOrg?.id) || locs[0]
      if (currentLoc) setCurrentLocation(currentLoc)
    }

    // PR-8d: Hydrate currentUser from clientUser (for pages that read store.currentUser)
    if (auth.mode === 'CLIENT' && auth.clientUser) {
      const nameParts = (auth.clientUser.name || '').split(' ')
      setCurrentUser({
        id: auth.clientUser.id,
        civility: 'Dr' as UserCivility, // Fallback — not available in clientUser
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: auth.clientUser.email,
        role: 'admin', // Decorative only — real RBAC uses auth.currentMembershipRole
        locationIds: auth.memberships?.map(m => m.orgId) || [],
      })
    }

    // PR-8d: Hydrate orgSettings from clientOrg (for AI quota, plan display, etc.)
    if (auth.mode === 'CLIENT' && auth.clientOrg) {
      const credits = auth.clientOrg.creditsComputed
      setOrgSettings({
        id: auth.clientOrg.id,
        name: auth.clientOrg.name,
        plan: (auth.clientOrg.plan?.code as 'free' | 'starter' | 'pro' | 'enterprise') || 'free',
        aiEnabled: (credits?.subscription?.aiTotal ?? 0) > 0,
        aiQuota: {
          monthlyLimit: credits?.subscription?.aiTotal ?? 0,
          usedThisMonth: credits?.subscription?.aiUsed ?? 0,
          // Safe fallback: use periodEnd or current date to avoid Invalid Date
          resetDate: credits?.periodEnd || new Date().toISOString(),
        },
        healthModeDefault: auth.clientOrg.vertical === 'health',
        createdAt: '',
      })
    }
  }, [auth.mode, auth.memberships, auth.clientOrg, auth.clientUser, setMemberships, setUserLocations, setCurrentLocation, setCurrentUser, setOrgSettings])

  // Routes /internal/* utilisent leur propre layout (backoffice super-admin)
  if (pathname?.startsWith('/internal')) {
    return <>{children}</>
  }

  // Routes /auth/* ne nécessitent pas de layout (callback d'authentification)
  if (pathname?.startsWith('/auth')) {
    return <>{children}</>
  }

  // Routes /login - redirection vers le site web (sécurité)
  // Cette page ne devrait jamais s'afficher sur 3002, mais par sécurité on la laisse passer
  // car elle redirige immédiatement vers 3001
  if (pathname === '/login') {
    return <>{children}</>
  }

  // Phase B: Offline screen — pas de réseau au launch
  // SUPER_ADMIN garde l'accès (lecture cache navigateur possible)
  if (!online && auth.mode !== 'SUPER_ADMIN') {
    return <OfflineScreen onRetry={() => window.location.reload()} />
  }

  // Loading state
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Si pas connecté (ni client ni super-admin via cookie), rediriger vers login
  // Sauf si on est sur la page login
  if (auth.mode === 'NONE' && pathname !== '/login') {
    // Utiliser useEffect pour la redirection côté client
    // pour éviter les erreurs de rendu
    return (
      <RedirectToLogin />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Phase B: Banner offline si perte réseau en cours d'utilisation */}
      <OfflineBanner online={online} onRetry={() => window.location.reload()} />

      {/* Sidebar — desktop only (hidden on mobile, bottom nav replaces it) */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <Topbar />

      <main
        className={cn(
          'transition-all duration-300',
          // Mobile: no left padding (sidebar hidden), bottom padding for bottom nav
          'pl-0 pb-[calc(var(--bottomnav-h)+var(--safe-bottom))]',
          // Mobile: top padding = topbar height + safe area
          'pt-[calc(var(--topbar-h)+var(--safe-top))]',
          // Desktop: left padding depends on sidebar state, normal top/bottom padding
          sidebarOpen ? 'md:pl-64' : 'md:pl-16',
          'md:pt-16 md:pb-0'
        )}
      >
        <div className="p-4 md:p-6">{children}</div>
      </main>

      {/* Mobile bottom navigation — md:hidden built-in */}
      <MobileBottomNav />
    </div>
  )
}

// Composant séparé pour la redirection vers la page de login
// VERROUILLÉ : Toujours rediriger vers le site web (3001), jamais vers /login local
function RedirectToLogin() {
  useEffect(() => {
    // Redirection OBLIGATOIRE vers le site web principal
    // Le reputy-admin (3002) ne gère PAS l'authentification
    window.location.href = LOGIN_URL
  }, [])

  // Page invisible pendant la redirection
  return null
}
