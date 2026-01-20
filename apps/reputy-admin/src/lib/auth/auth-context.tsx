'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'
const TOKEN_KEY = 'reputy_client_token'

// ============ TYPES ============

export type AuthMode = 'SUPER_ADMIN' | 'CLIENT' | 'NONE'

export interface ClientUser {
  id: string
  email: string
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
    }
    pack: {
      smsRemaining: number
      emailRemaining: number
    }
    total: {
      smsRemaining: number
      emailRemaining: number
    }
    canSend: boolean
    subscriptionActive: boolean
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
}

export interface AuthContextValue extends AuthState {
  // Actions
  loginClient: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logoutClient: () => Promise<void>
  refreshClientSession: () => Promise<void>
  // Helpers
  getClientToken: () => string | null
}

// ============ CONTEXT ============

const AuthContext = createContext<AuthContextValue | null>(null)

// ============ HELPERS ============

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

function setStoredToken(token: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
}

function removeStoredToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

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
  })

  // Fetch client session from /me
  const fetchClientSession = useCallback(async (token: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BACKEND_URL}/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      
      // Also fetch full org details from /client/org
      const orgResponse = await fetch(`${BACKEND_URL}/client/org`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      let fullOrg = data.org
      if (orgResponse.ok) {
        const orgData = await orgResponse.json()
        fullOrg = orgData.org
      }

      setState(prev => ({
        ...prev,
        mode: 'CLIENT',
        loading: false,
        clientUser: data.user,
        clientOrg: fullOrg,
        clientToken: token,
        isSuperAdmin: false,
      }))

      return true
    } catch (err) {
      console.error('[AuthContext] Failed to fetch client session:', err)
      return false
    }
  }, [])

  // Initialize auth state
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

      // 2. Check if client has token
      const token = getStoredToken()
      if (token) {
        const valid = await fetchClientSession(token)
        if (valid) {
          return
        }
        // Token invalid, remove it
        removeStoredToken()
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
        setStoredToken(data.token)
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
    const token = getStoredToken()
    
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

    removeStoredToken()
    
    setState({
      mode: 'NONE',
      loading: false,
      clientUser: null,
      clientOrg: null,
      clientToken: null,
      isSuperAdmin: false,
    })
  }, [])

  // Refresh client session
  const refreshClientSession = useCallback(async () => {
    const token = getStoredToken()
    if (token) {
      const valid = await fetchClientSession(token)
      if (!valid) {
        removeStoredToken()
        setState(prev => ({
          ...prev,
          mode: 'NONE',
          clientUser: null,
          clientOrg: null,
          clientToken: null,
        }))
      }
    }
  }, [fetchClientSession])

  // Get client token
  const getClientToken = useCallback(() => {
    return getStoredToken()
  }, [])

  const value: AuthContextValue = {
    ...state,
    loginClient,
    logoutClient,
    refreshClientSession,
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
