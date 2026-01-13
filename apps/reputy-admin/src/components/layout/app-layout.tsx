'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { sidebarOpen, initialize } = useAppStore()

  useEffect(() => {
    initialize()
  }, [initialize])

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
