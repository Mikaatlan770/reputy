'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Building2,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Clients', href: '/internal/clients', icon: Users },
]

interface BackofficeLayoutProps {
  children: React.ReactNode
}

export function BackofficeLayout({ children }: BackofficeLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await fetch('/internal/api/auth', { method: 'DELETE' })
    router.push('/internal/login')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-slate-800 border-r border-slate-700 transition-transform lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
          <Link href="/internal/clients" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-white">Backoffice</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-slate-400"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-slate-700/50"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-slate-800/80 backdrop-blur border-b border-slate-700 flex items-center px-4 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-slate-400"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 text-slate-400">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-medium">Super Admin</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
