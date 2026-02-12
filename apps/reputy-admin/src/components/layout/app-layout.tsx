'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { LOGIN_URL } from '@/lib/constants'
import type { Location, UserCivility } from '@/types'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const { sidebarOpen, initialize, setMemberships, setUserLocations, setCurrentLocation, setCurrentUser, setOrgSettings } = useAppStore()
  const auth = useAuth()

  useEffect(() => {
    initialize()
  }, [initialize])

  // PR-8c+8d: Hydrate store from auth-context when memberships are loaded
  // Guard: only when CLIENT mode + memberships available (avoids flicker)
  useEffect(() => {
    if (auth.mode === 'CLIENT' && auth.memberships && auth.memberships.length > 0) {
      setMemberships(auth.memberships)
      
      // Map memberships → Location[] for rétrocompat with topbar/other pages
      const locs: Location[] = auth.memberships.map(m => ({
        id: m.orgId,
        name: m.orgName,
        address: '',
        city: '',
        country: 'France',
        googleConnected: false,
        googleSessionValid: false,
        reviewLink: '',
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
      <Sidebar />
      <Topbar />
      <main
        className={cn(
          'pt-16 transition-all duration-300',
          sidebarOpen ? 'pl-64' : 'pl-16'
        )}
      >
        <div className="p-6">{children}</div>
      </main>
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
