'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import type { Membership, MembershipRole, MembershipPermissions } from '@/types'
import { getSecureToken, setSecureToken, removeSecureToken } from './secure-token'
import { LOGIN_URL } from '@/lib/constants'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'

// ============ INACTIVITY TIMEOUT ============
/** Auto-logout after 10 minutes of inactivity (in milliseconds) */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
/** Events that count as "user activity" */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'mousedown', 'keypress', 'keydown',
  'scroll', 'touchstart', 'click', 'wheel',
]

// ============ TYPES ============

export type AuthMode = 'SUPER_ADMIN' | 'CLIENT' | 'NONE'

export interface ClientUser {
  id: string
  email: string
  /** @deprecated Use currentMembershipRole instead for RBAC */
  role: 'owner' | 'admin'
  name: string
  emailVerified: boolean
  createdAt: string
}

export interface ClientOrg {
  id: string
  name: string
  email?: string
  status: 'active' | 'pending' | 'suspended' | 'cancelled'
  publicKey: string
  vertical: 'health' | 'food' | 'business'
  // Establishment location (for competitor search)
  lat?: number | null
  lng?: number | null
  specialty?: string | null
  address?: string | null
  googlePlaceId?: string | null
  billing?: {
    periodStart?: string
    periodEnd?: string
    provider?: string
    stripeCustomerId?: string
    stripeSubscriptionId?: string
    stripeCouponId?: string
  }
  plan: {
    code: string
    basePriceCents: number
    currency: string
    billingCycle: string
  }
  options: {
    reviewRouting: boolean
    widgetsSeo: boolean
    multiLocations: boolean
    prioritySupport: boolean
  }
  creditsComputed?: {
    periodStart: string
    periodEnd: string
    subscription: {
      smsIncludedMonthly: number
      emailIncludedMonthly: number
      smsRemaining: number
      emailRemaining: number
      smsUsed: number
      emailUsed: number
      smsTotal: number
      emailTotal: number
      aiTotal?: number
      aiUsed?: number
      aiRemaining?: number
      smsGiftMonthly?: number
      emailGiftMonthly?: number
      aiGiftMonthly?: number
    }
    pack: {
      smsRemaining: number
      emailRemaining: number
      aiRemaining?: number
    }
    total: {
      smsRemaining: number
      emailRemaining: number
      aiRemaining?: number
    }
    canSend: boolean
    subscriptionActive: boolean
  }
  billingComputed?: {
    periodStart?: string
    periodEnd?: string
    periodEndFormatted?: string
    // Legacy pricing
    priceBaseCents: number
    priceMonthlyFinalCents: number
    discountPercent?: number
    isNegotiated?: boolean
    currency?: string
    // New effective billing
    priceCatalogCents?: number
    priceEffectiveCents?: number
    priceCatalogFormatted?: string
    priceEffectiveFormatted?: string
    hasDiscount?: boolean
    stripeCouponId?: string | null
    discount?: {
      type: string | null
      value: number | null
      label: string | null
    } | null
    couponInfo?: {
      id: string
      label: string
      description: string
    } | null
    // Prorata
    isProrata?: boolean
    ratio?: number
  }
}

export interface AuthState {
  mode: AuthMode
  loading: boolean
  // Client auth
  clientUser: ClientUser | null
  clientOrg: ClientOrg | null
  clientToken: string | null
  // Super admin (detected via cookie, managed elsewhere)
  isSuperAdmin: boolean
  // PR-8c: Multi-establishment
  memberships: Membership[]
  currentMembershipRole: MembershipRole | null
  currentPermissions: MembershipPermissions | null
}

export interface AuthContextValue extends AuthState {
  // Actions
  loginClient: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logoutClient: () => Promise<void>
  refreshClientSession: () => Promise<void>
  // PR-8c: Multi-establishment actions
  switchOrg: (orgId: string) => Promise<{ ok: boolean; error?: string }>
  fetchMemberships: () => Promise<void>
  // Helpers
  getClientToken: () => string | null
}

// ============ CONTEXT ============

const AuthContext = createContext<AuthContextValue | null>(null)

// ============ HELPERS ============

function checkSuperAdminCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes('admin_ok=1')
}

// ============ PROVIDER ============

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    mode: 'NONE',
    loading: true,
    clientUser: null,
    clientOrg: null,
    clientToken: null,
    isSuperAdmin: false,
    memberships: [],
    currentMembershipRole: null,
    currentPermissions: null,
  })

  // Fetch client session from /me + /client/org + /client/memberships
  const fetchClientSession = useCallback(async (token: string): Promise<boolean> => {
    try {
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }

      const response = await fetch(`${BACKEND_URL}/me`, { headers })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      
      // Fetch full org details from /client/org
      const orgResponse = await fetch(`${BACKEND_URL}/client/org`, { headers })

      let fullOrg = data.org
      if (orgResponse.ok) {
        const orgData = await orgResponse.json()
        fullOrg = orgData.org
      }

      // PR-8c: Fetch memberships
      let memberships: Membership[] = []
      let currentMembershipRole: MembershipRole | null = null
      let currentPermissions: MembershipPermissions | null = null
      try {
        const membershipsResponse = await fetch(`${BACKEND_URL}/client/memberships`, { headers })
        if (membershipsResponse.ok) {
          const membershipsData = await membershipsResponse.json()
          memberships = membershipsData.memberships || []
          // Extract role and permissions for current org
          const currentOrgId = fullOrg?.id || data.org?.id
          const currentMembership = memberships.find(
            (m: Membership) => m.orgId === currentOrgId && m.status === 'active'
          )
          currentMembershipRole = currentMembership?.role || null
          currentPermissions = currentMembership?.permissions || null
        }
      } catch {
        // Non-fatal: memberships endpoint may not be available
        console.warn('[AuthContext] Failed to fetch memberships')
      }

      setState(prev => ({
        ...prev,
        mode: 'CLIENT',
        loading: false,
        clientUser: data.user,
        clientOrg: fullOrg,
        clientToken: token,
        isSuperAdmin: false,
        memberships,
        currentMembershipRole,
        currentPermissions,
      }))

      return true
    } catch (err) {
      console.error('[AuthContext] Failed to fetch client session:', err)
      return false
    }
  }, [])

  // Initialize auth state (async — reads from secure storage)
  useEffect(() => {
    const initAuth = async () => {
      // 1. Check if super admin (cookie)
      const isSuperAdmin = checkSuperAdminCookie()
      if (isSuperAdmin) {
        setState(prev => ({
          ...prev,
          mode: 'SUPER_ADMIN',
          loading: false,
          isSuperAdmin: true,
        }))
        return
      }

      // 2. Check if client has token (Keychain on mobile, localStorage on web)
      const token = await getSecureToken()
      if (token) {
        const valid = await fetchClientSession(token)
        if (valid) {
          return
        }
        // Token invalid, remove it
        await removeSecureToken()
      }

      // 3. No auth
      setState(prev => ({
        ...prev,
        mode: 'NONE',
        loading: false,
      }))
    }

    initAuth()
  }, [fetchClientSession])

  // Listen for session-expired events (emitted by authed-fetch.ts on 401)
  useEffect(() => {
    const handleSessionExpired = () => {
      setState(prev => ({
        ...prev,
        mode: 'NONE',
        loading: false,
        clientUser: null,
        clientOrg: null,
        clientToken: null,
        memberships: [],
        currentMembershipRole: null,
        currentPermissions: null,
      }))
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = LOGIN_URL
      }
    }

    window.addEventListener('reputy:session-expired', handleSessionExpired)
    return () => window.removeEventListener('reputy:session-expired', handleSessionExpired)
  }, [])

  // ============ INACTIVITY AUTO-LOGOUT ============
  // Tracks user activity and auto-logs out after INACTIVITY_TIMEOUT_MS of inactivity
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Only active when user is logged in as CLIENT
    if (state.mode !== 'CLIENT' || !state.clientToken) {
      return
    }

    const handleLogoutInactivity = async () => {
      console.warn('[AuthContext] Auto-logout: inactivité détectée (10 min)')
      // Remove token
      await removeSecureToken()
      // Reset state
      setState({
        mode: 'NONE',
        loading: false,
        clientUser: null,
        clientOrg: null,
        clientToken: null,
        isSuperAdmin: false,
        memberships: [],
        currentMembershipRole: null,
        currentPermissions: null,
      })
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = LOGIN_URL
      }
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      inactivityTimerRef.current = setTimeout(handleLogoutInactivity, INACTIVITY_TIMEOUT_MS)
    }

    // Start initial timer
    resetTimer()

    // Attach activity listeners
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      // Cleanup timer and listeners
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.clientToken])

  // Login client
  const loginClient = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { ok: false, error: data.error || data.message || 'Erreur de connexion' }
      }

      if (data.ok && data.token) {
        await setSecureToken(data.token)
        await fetchClientSession(data.token)
        return { ok: true }
      }

      return { ok: false, error: data.message || 'Erreur inconnue' }
    } catch (err) {
      console.error('[AuthContext] Login error:', err)
      return { ok: false, error: 'Erreur de connexion au serveur' }
    }
  }, [fetchClientSession])

  // Logout client
  const logoutClient = useCallback(async () => {
    const token = state.clientToken
    
    // Try to call logout endpoint
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      } catch {
        // Ignore errors
      }
    }

    await removeSecureToken()
    
    setState({
      mode: 'NONE',
      loading: false,
      clientUser: null,
      clientOrg: null,
      clientToken: null,
      isSuperAdmin: false,
      memberships: [],
      currentMembershipRole: null,
      currentPermissions: null,
    })
  }, [state.clientToken])

  // PR-8c: Switch to another organization
  const switchOrg = useCallback(async (orgId: string): Promise<{ ok: boolean; error?: string }> => {
    const token = state.clientToken
    if (!token) {
      return { ok: false, error: 'Non authentifié' }
    }

    try {
      const response = await fetch(`${BACKEND_URL}/client/orgs/switch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orgId }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { ok: false, error: data.message || 'Erreur lors du changement' }
      }

      if (data.ok && data.token) {
        // Store new token, then full page reload to reset all state
        await setSecureToken(data.token)
        window.location.href = '/'
        return { ok: true }
      }

      return { ok: false, error: 'Réponse inattendue du serveur' }
    } catch (err) {
      console.error('[AuthContext] Switch org error:', err)
      return { ok: false, error: 'Erreur de connexion au serveur' }
    }
  }, [state.clientToken])

  // PR-8c: Fetch memberships list
  const fetchMemberships = useCallback(async () => {
    const token = state.clientToken
    if (!token) return

    try {
      const response = await fetch(`${BACKEND_URL}/client/memberships`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        const memberships: Membership[] = data.memberships || []
        
        setState(prev => {
          const currentOrgId = prev.clientOrg?.id
          const currentMembership = memberships.find(
            m => m.orgId === currentOrgId && m.status === 'active'
          )
          return {
            ...prev,
            memberships,
            currentMembershipRole: currentMembership?.role || prev.currentMembershipRole,
          }
        })
      }
    } catch (err) {
      console.error('[AuthContext] Failed to fetch memberships:', err)
    }
  }, [state.clientToken])

  // Refresh client session
  const refreshClientSession = useCallback(async () => {
    const token = await getSecureToken()
    if (token) {
      const valid = await fetchClientSession(token)
      if (!valid) {
        await removeSecureToken()
        setState(prev => ({
          ...prev,
          mode: 'NONE',
          clientUser: null,
          clientOrg: null,
          clientToken: null,
          memberships: [],
          currentMembershipRole: null,
          currentPermissions: null,
        }))
      }
    }
  }, [fetchClientSession])

  // Get client token (synchrone — retourne la valeur déjà en mémoire dans le state)
  const getClientToken = useCallback(() => {
    return state.clientToken
  }, [state.clientToken])

  const value: AuthContextValue = {
    ...state,
    loginClient,
    logoutClient,
    refreshClientSession,
    switchOrg,
    fetchMemberships,
    getClientToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ============ HOOK ============

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// ============ CONVENIENCE HOOKS ============

export function useIsClient(): boolean {
  const { mode } = useAuth()
  return mode === 'CLIENT'
}

export function useIsSuperAdmin(): boolean {
  const { mode } = useAuth()
  return mode === 'SUPER_ADMIN'
}

export function useClientOrg(): ClientOrg | null {
  const { clientOrg } = useAuth()
  return clientOrg
}
