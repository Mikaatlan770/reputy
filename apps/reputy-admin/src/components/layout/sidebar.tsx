'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  LayoutDashboard,
  Star,
  MessageSquare,
  QrCode,
  Megaphone,
  BarChart3,
  Users2,
  Building2,
  Settings,
  Swords,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Avis', href: '/reviews', icon: Star },
  { name: 'Réponses', href: '/inbox', icon: MessageSquare },
  { name: 'Collecte', href: '/collect', icon: QrCode },
  { name: 'Campagnes', href: '/campaigns', icon: Megaphone },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Concurrence', href: '/competitors', icon: Swords },
  { name: 'Établissements', href: '/locations', icon: Building2 },
  { name: 'Équipe', href: '/team', icon: Users2 },
  { name: 'Facturation', href: '/billing', icon: CreditCard },
  { name: 'Paramètres', href: '/settings', icon: Settings },
  { name: 'Aide', href: '/help', icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useAppStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        {sidebarOpen && (
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="font-bold text-lg text-foreground">Reputy</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn('h-8 w-8', !sidebarOpen && 'mx-auto')}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                !sidebarOpen && 'justify-center px-2'
              )}
              title={!sidebarOpen ? item.name : undefined}
            >
              <item.icon className={cn('h-5 w-5 flex-shrink-0')} />
              {sidebarOpen && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {sidebarOpen && (
        <div className="absolute bottom-4 left-4 right-4">
          <div className="rounded-lg bg-primary/5 p-4">
            <p className="text-xs text-muted-foreground">
              Plan Pro • 2000 avis/mois
            </p>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-3/4 bg-primary rounded-full" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              1,523 / 2,000 utilisés
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}

