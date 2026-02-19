'use client'

/**
 * Mobile Bottom Navigation — visible uniquement sous md: (< 768px)
 * 5 onglets principaux + "Plus" sheet pour les routes secondaires.
 * 
 * ⚠️ Ne modifie RIEN côté desktop — la sidebar reste intacte.
 * ⚠️ Respecte les mêmes permissions que sidebar.tsx.
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, useIsClient } from '@/lib/auth'
import { hapticImpact } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import type { MembershipPermissions } from '@/types'
import {
  LayoutDashboard,
  Star,
  MessageSquare,
  BarChart3,
  MoreHorizontal,
  X,
  ThumbsUp,
  History,
  QrCode,
  Megaphone,
  Swords,
  Building2,
  Users2,
  CreditCard,
  Settings,
  HelpCircle,
  Download,
  type LucideIcon,
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

interface TabItem {
  name: string
  href: string
  icon: LucideIcon
}

interface MoreItem {
  name: string
  href: string
  icon: LucideIcon
  clientOnly?: boolean
  requiredPermission?: keyof MembershipPermissions
}

// ============================================================
// Navigation config — synced with sidebar.tsx
// ============================================================

/** Main bottom tabs (always visible) */
const MAIN_TABS: TabItem[] = [
  { name: 'Accueil',  href: '/',          icon: LayoutDashboard },
  { name: 'Avis',     href: '/reviews',   icon: Star },
  { name: 'Inbox',    href: '/inbox',     icon: MessageSquare },
  { name: 'Stats',    href: '/analytics', icon: BarChart3 },
  // 5th slot = "Plus" (rendered separately)
]

/** Secondary routes shown in the "Plus" sheet */
const MORE_ITEMS: MoreItem[] = [
  { name: 'Installation',   href: '/installation',  icon: Download,    clientOnly: true },
  { name: 'Feedbacks',      href: '/feedbacks',     icon: ThumbsUp,    requiredPermission: 'reviews' },
  { name: 'Historique',     href: '/history',       icon: History,     requiredPermission: 'reviews' },
  { name: 'Collecte',       href: '/collect',       icon: QrCode },
  { name: 'Campagnes',      href: '/campaigns',     icon: Megaphone,   requiredPermission: 'campaigns' },
  { name: 'Concurrence',    href: '/competitors',   icon: Swords,      requiredPermission: 'stats' },
  { name: 'Établissements', href: '/locations',     icon: Building2 },
  { name: 'Équipe',         href: '/team',          icon: Users2,      requiredPermission: 'team' },
  { name: 'Facturation',    href: '/billing',       icon: CreditCard,  requiredPermission: 'billing' },
  { name: 'Paramètres',     href: '/settings',      icon: Settings,    requiredPermission: 'settings' },
  { name: 'Aide',           href: '/help',          icon: HelpCircle },
]

// ============================================================
// Helper — is this route active?
// ============================================================

function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

// ============================================================
// Component
// ============================================================

export function MobileBottomNav() {
  const pathname = usePathname()
  const { currentPermissions } = useAuth()
  const isClient = useIsClient()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Check if current page is in the "more" items (highlight "Plus" tab)
  const isMoreRouteActive = MORE_ITEMS.some(item => isRouteActive(pathname, item.href))

  // Filter "more" items by permissions (same logic as sidebar)
  const filteredMoreItems = MORE_ITEMS.filter(item => {
    if (item.clientOnly && !isClient) return false
    if (!currentPermissions) return true
    if (item.requiredPermission && currentPermissions[item.requiredPermission] === false) return false
    return true
  })

  const handleTabPress = useCallback(async () => {
    // Light haptic on tab change — feels native
    await hapticImpact('light')
  }, [])

  const handleMorePress = useCallback(async () => {
    await hapticImpact('light')
    setSheetOpen(prev => !prev)
  }, [])

  const handleMoreItemPress = useCallback(async () => {
    await hapticImpact('light')
    setSheetOpen(false)
  }, [])

  return (
    <>
      {/* ── Sheet overlay (More menu) ────────────────────────── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSheetOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Sheet content — slides up from bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl border-t border-border animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: 'calc(var(--bottomnav-h) + var(--safe-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 className="font-semibold text-base">Plus</h3>
              <button
                onClick={() => setSheetOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Grid of more items */}
            <div className="grid grid-cols-4 gap-1 px-3 pb-4 max-h-[50vh] overflow-y-auto">
              {filteredMoreItems.map((item) => {
                const active = isRouteActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleMoreItemPress}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted active:bg-muted'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[11px] font-medium leading-tight text-center">
                      {item.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom tab bar ───────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border md:hidden"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-stretch" style={{ height: 'var(--bottomnav-h)' }}>
          {/* Main 4 tabs */}
          {MAIN_TABS.map((tab) => {
            const active = isRouteActive(pathname, tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={handleTabPress}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground active:text-foreground'
                )}
              >
                <tab.icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
                <span className={cn(
                  'text-[10px] leading-tight',
                  active ? 'font-semibold' : 'font-medium'
                )}>
                  {tab.name}
                </span>
              </Link>
            )
          })}

          {/* "Plus" tab */}
          <button
            onClick={handleMorePress}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
              (sheetOpen || isMoreRouteActive)
                ? 'text-primary'
                : 'text-muted-foreground active:text-foreground'
            )}
          >
            <MoreHorizontal className={cn('h-5 w-5', (sheetOpen || isMoreRouteActive) && 'stroke-[2.5]')} />
            <span className={cn(
              'text-[10px] leading-tight',
              (sheetOpen || isMoreRouteActive) ? 'font-semibold' : 'font-medium'
            )}>
              Plus
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}
