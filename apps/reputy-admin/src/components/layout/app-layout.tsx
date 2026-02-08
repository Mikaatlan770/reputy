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

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
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

  // Routes /login - redirection vers le site web (sécurité)
  // Cette page ne devrait jamais s'afficher sur 3002, mais par sécurité on la laisse passer
  // car elle redirige immédiatement vers 3001
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
