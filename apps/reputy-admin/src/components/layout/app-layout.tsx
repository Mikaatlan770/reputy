'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const { sidebarOpen, initialize } = useAppStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Routes /internal/* utilisent leur propre layout (backoffice)
  if (pathname?.startsWith('/internal')) {
    return <>{children}</>
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
