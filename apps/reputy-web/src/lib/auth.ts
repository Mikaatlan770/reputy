/**
 * Auth helpers for Reputy Web
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8787'
const TOKEN_KEY = 'reputy_token'
// URL du dashboard client (reputy-admin)
export const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3002'

export interface User {
  id: string
  email: string
  role: string
  name: string
}

export interface Org {
  id: string
  name: string
  status: string
  publicKey: string
  plan: string
  vertical: string
}

export interface AuthResponse {
  ok: boolean
  token?: string
  orgId?: string
  user?: User
  error?: string
  message?: string
  next?: string
  email?: string
  // PR-8e: Multi-org login
  requireOrgSelection?: boolean
  pendingToken?: string
  orgs?: Array<{ orgId: string; orgName: string; role: string }>
  membership?: { orgId: string; role: string }
  mustChangePassword?: boolean
  orgName?: string
}

/**
 * Store auth token
 */
export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token)
  }
}

/**
 * Get auth token
 */
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY)
  }
  return null
}

/**
 * Remove auth token
 */
export function removeToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getToken()
}

/**
 * Make authenticated API call
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers,
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw { status: response.status, ...data }
  }
  
  return data
}

/**
 * Signup
 */
export async function signup(data: {
  email: string
  password: string
  orgName: string
  vertical?: string
  plan?: string
}): Promise<AuthResponse> {
  return apiCall('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Verify email code
 */
export async function verifyEmail(email: string, code: string): Promise<AuthResponse> {
  const response = await apiCall<AuthResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
  
  if (response.ok && response.token) {
    setToken(response.token)
  }
  
  return response
}

/**
 * Resend verification code
 */
export async function resendCode(email: string): Promise<{ ok: boolean; message?: string }> {
  return apiCall('/auth/resend-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/**
 * Login
 * PR-8e: If multi-org (requireOrgSelection), do NOT store token (no session yet).
 * Token is only stored for direct login (1 org) for legacy /app compat.
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await apiCall<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  
  // Store token ONLY for direct login (not multi-org selection)
  if (response.ok && response.token && !response.requireOrgSelection) {
    setToken(response.token)
  }
  
  return response
}

/**
 * Select org (multi-org login flow step 2)
 * PR-8e: No setToken — token is passed via URL to 3002/auth/callback
 */
export async function selectOrg(pendingToken: string, orgId: string): Promise<AuthResponse> {
  return apiCall<AuthResponse>('/auth/select-org', {
    method: 'POST',
    body: JSON.stringify({ pendingToken, orgId }),
  })
}

/**
 * Accept invitation via invite token
 * PR-8e: No setToken — token is passed via URL to 3002/auth/callback
 */
export async function acceptInvite(
  token: string,
  newPassword?: string
): Promise<AuthResponse> {
  const body: Record<string, string> = { token }
  if (newPassword) body.newPassword = newPassword
  return apiCall<AuthResponse>('/auth/accept-invite', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  try {
    await apiCall('/auth/logout', { method: 'POST' })
  } catch (e) {
    // Ignore errors
  }
  removeToken()
}

/**
 * Get current user
 */
export async function getMe(): Promise<{ user: User; org: Org | null }> {
  return apiCall('/me')
}

/**
 * Get client org details
 */
export async function getClientOrg(): Promise<{ org: any }> {
  return apiCall('/client/org')
}

/**
 * Get client usage
 */
export async function getClientUsage(): Promise<any> {
  return apiCall('/client/usage')
}
