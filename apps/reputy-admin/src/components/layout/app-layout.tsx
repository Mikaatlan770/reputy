'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { sidebarOpen, initialize } = useAppStore()
  const { mode, loading: authLoading } = useAuth()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Routes /internal/* utilisent leur propre layout (backoffice super-admin)
  if (pathname?.startsWith('/internal')) {
    return <>{children}</>
  }

  // Routes /auth/* ne nécessitent pas de layout (callback d'authentification)
  if (pathname?.startsWith('/auth')) {
    return <>{children}</>
  }

  // Routes /login ne nécessitent pas de layout
  if (pathname === '/login') {
    return <>{children}</>
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Si pas connecté (ni client ni super-admin via cookie), rediriger vers login
  // Sauf si on est sur la page login
  if (mode === 'NONE' && pathname !== '/login') {
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

// URL du site principal (reputy-web)
const REPUTY_WEB_URL = process.env.NEXT_PUBLIC_REPUTY_WEB_URL || 'http://localhost:3001'

// Composant séparé pour la redirection vers reputy-web
function RedirectToLogin() {
  useEffect(() => {
    // Rediriger vers reputy-web (site principal) au lieu de /login local
    window.location.href = REPUTY_WEB_URL
  }, [])

  // Page invisible pendant la redirection
  return null
}
