import 'server-only'

/**
 * Helper pour appeler les routes /internal/* du backend
 * IMPORTANT: Ce fichier ne doit être utilisé que côté serveur (Server Components, Server Actions, Route Handlers)
 * Le token INTERNAL_ADMIN_TOKEN n'est JAMAIS exposé au navigateur
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8787'
// En mode dev, fallback sur le token par défaut
const INTERNAL_ADMIN_TOKEN = process.env.INTERNAL_ADMIN_TOKEN || 'super-admin-secret'

export interface FetchInternalOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: Record<string, unknown>
  revalidate?: number | false
}

export interface FetchInternalResult<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

/**
 * Appelle une route /internal/* du backend avec le token admin
 * @param path - Chemin relatif (ex: '/internal/orgs')
 * @param options - Options de requête
 */
export async function fetchInternal<T = unknown>(
  path: string,
  options: FetchInternalOptions = {}
): Promise<FetchInternalResult<T>> {
  const { method = 'GET', body, revalidate = false } = options

  if (!INTERNAL_ADMIN_TOKEN) {
    console.error('[fetchInternal] INTERNAL_ADMIN_TOKEN not configured')
    return { ok: false, status: 500, error: 'Token admin non configuré' }
  }

  const url = `${BACKEND_URL}${path}`
  
  try {
    const fetchOptions: RequestInit & { next?: { revalidate: number | false } } = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': INTERNAL_ADMIN_TOKEN,
      },
      ...(revalidate !== undefined && { next: { revalidate } }),
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    
    if (!response.ok) {
      let errorData: { error?: string } = {}
      try {
        errorData = await response.json()
      } catch {
        // Ignore JSON parse errors
      }
      return {
        ok: false,
        status: response.status,
        error: errorData.error || `HTTP ${response.status}`,
      }
    }

    const data = await response.json() as T
    return { ok: true, status: response.status, data }
  } catch (err) {
    console.error('[fetchInternal] Error:', err)
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Erreur de connexion',
    }
  }
}

// Types pour les réponses API

export interface Org {
  id: string
  name: string
  vertical: 'health' | 'food' | 'business'
  status: 'active' | 'suspended' | 'cancelled'
  createdAt: string
  updatedAt: string
  billing: {
    provider: 'none' | 'stripe' | 'gocardless'
    stripeCustomerId?: string | null
    gocardlessMandateId?: string | null
  }
  plan: {
    code: string
    basePriceCents: number
    currency: string
    billingCycle: 'monthly' | 'yearly'
  }
  negotiated: {
    enabled: boolean
    customPriceCents?: number | null
    discountPercent?: number | null
    notes?: string
    contractRef?: string | null
  }
  options: {
    reviewRouting: boolean
    widgetsSeo: boolean
    multiLocations: boolean
    prioritySupport: boolean
    custom: Record<string, unknown>
  }
  quotas: {
    smsIncluded: number
    emailIncluded: number
  }
  balances: {
    smsExtra: number
    emailExtra: number
  }
  // Computed in list
  usage30d?: {
    sms: number
    email: number
    total: number
  }
  effectivePriceCents?: number
}

export interface UsageEntry {
  id: string
  orgId: string
  type: 'sms' | 'email'
  qty: number
  ts: string
  meta?: Record<string, unknown>
}

export interface TelemetryEntry {
  id: string
  orgId: string
  source: 'extension' | 'backend' | 'admin'
  level: 'info' | 'warn' | 'error'
  code?: string
  message: string
  stack?: string
  version?: string
  ts: string
}

export interface ListOrgsResponse {
  orgs: Org[]
  total: number
}

export interface GetOrgResponse {
  org: Org
  usage: {
    days7: { sms: number; email: number; total: number }
    days30: { sms: number; email: number; total: number }
  }
  recentUsage: UsageEntry[]
  recentTelemetry: TelemetryEntry[]
}

export interface UsageResponse {
  entries: UsageEntry[]
  summary: { sms: number; email: number }
  range: string
}

export interface TelemetryResponse {
  entries: TelemetryEntry[]
  total: number
}
