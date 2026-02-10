'use server'

/**
 * P0.9 — Server Actions for Email Health & Ops
 * 
 * All functions run server-side only. They use fetchInternal()
 * which sends x-admin-token (never exposed to the browser).
 */

import { revalidatePath } from 'next/cache'
import { fetchInternal } from './fetch-internal'

// ============ TYPES ============

export interface GlobalStats {
  sentCount: number
  bounceCount: number
  complaintCount: number
  deliveredCount: number
  clickCount: number
  bounceRate: number
  complaintRate: number
  deliveryRate: number
  clickRate: number
  sinceISO: string
  window: string
}

export interface LastSesWebhook {
  lastSeenAt: string | null
  hoursSince: number | null
}

export interface TopRiskOrg {
  org_id: string
  org_name: string
  plan: string
  sent: number
  bounces: number
  complaints: number
  delivered: number
  bounceRate: number
  complaintRate: number
  warmupStatus: string
  warmupDay: number | null
}

export interface EmailAlert {
  id: string
  severity: 'red' | 'orange' | 'info'
  type: string
  message: string
  orgId?: string
  orgName?: string
  meta?: Record<string, unknown>
}

export interface EmailHealthResponse {
  ok: boolean
  window: string
  sinceISO: string
  global: GlobalStats
  lastSesWebhook?: LastSesWebhook
  topRiskOrgs?: TopRiskOrg[]
  alerts?: EmailAlert[]
  error?: string
}

export interface EmailAlertsResponse {
  ok: boolean
  window: string
  alertCount: number
  alerts: EmailAlert[]
  error?: string
}

export interface OrgEmailStats {
  sentCount: number
  bounceCount: number
  complaintCount: number
  deliveredCount: number
  clickCount: number
  bounceRate: number
  complaintRate: number
  deliveryRate: number
  clickRate: number
  sinceISO: string
  window: string
}

export interface WarmupState {
  status: 'cold' | 'warming' | 'warm'
  startedAt: string | null
  day: number
  limits: { daily: number; hourly: number } | null
}

export interface OrgEmailStatsResponse {
  ok: boolean
  orgId: string
  orgName: string
  plan: string
  window: string
  stats: OrgEmailStats
  warmupState: WarmupState
  error?: string
}

export interface PauseStateResponse {
  ok: boolean
  orgId: string
  paused: boolean
  reason: string | null
  error?: string
}

export interface ActionResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

// ============ READ OPERATIONS (called from Server Components) ============

export async function fetchEmailHealth(
  window: string = '7d',
  include: string[] = ['topRisk', 'lastWebhook']
): Promise<EmailHealthResponse> {
  const includeStr = include.join(',')
  const result = await fetchInternal<EmailHealthResponse>(
    `/api/email/admin/health?window=${window}&include=${includeStr}`,
    { revalidate: 0 }
  )
  if (result.ok && result.data) {
    return result.data
  }
  return { ok: false, window, sinceISO: '', global: {} as GlobalStats, error: result.error }
}

export async function fetchEmailAlerts(
  window: string = '7d'
): Promise<EmailAlertsResponse> {
  const result = await fetchInternal<EmailAlertsResponse>(
    `/api/email/admin/alerts?window=${window}`,
    { revalidate: 0 }
  )
  if (result.ok && result.data) {
    return result.data
  }
  return { ok: false, window, alertCount: 0, alerts: [], error: result.error }
}

export async function fetchOrgEmailStats(
  orgId: string,
  window: string = '7d'
): Promise<OrgEmailStatsResponse> {
  const result = await fetchInternal<OrgEmailStatsResponse>(
    `/api/email/admin/org-stats?org_id=${encodeURIComponent(orgId)}&window=${window}`,
    { revalidate: 0 }
  )
  if (result.ok && result.data) {
    return result.data
  }
  return {
    ok: false, orgId, orgName: '', plan: '', window,
    stats: {} as OrgEmailStats, warmupState: {} as WarmupState,
    error: result.error,
  }
}

export async function fetchOrgPauseState(
  orgId: string
): Promise<PauseStateResponse> {
  const result = await fetchInternal<PauseStateResponse>(
    `/api/email/admin/pause-state?org_id=${encodeURIComponent(orgId)}`,
    { revalidate: 0 }
  )
  if (result.ok && result.data) {
    return result.data
  }
  return { ok: false, orgId, paused: false, reason: null, error: result.error }
}

// ============ MUTATIONS (Server Actions) ============

export async function pauseOrg(input: {
  orgId: string
  paused: boolean
  reason?: string
}): Promise<ActionResult> {
  const result = await fetchInternal<ActionResult>(
    '/api/email/admin/pause',
    {
      method: 'POST',
      body: {
        org_id: input.orgId,
        paused: input.paused,
        reason: input.reason || undefined,
      },
    }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/email')
    return result.data
  }

  return { ok: false, error: result.error || 'Failed to update pause state' }
}

export async function forceWarm(input: {
  orgId: string
}): Promise<ActionResult> {
  const result = await fetchInternal<ActionResult>(
    '/api/email/admin/force-warm',
    {
      method: 'POST',
      body: { org_id: input.orgId },
    }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/email')
    return result.data
  }

  return { ok: false, error: result.error || 'Failed to force warm' }
}

// ============ HELPERS ============

/**
 * Build the URL for CSV download (opened directly in browser — no token needed client-side
 * because the download goes through a Next.js API route that proxies to backend).
 * 
 * For P0.9 we use a direct link with the backend URL since the admin is already
 * authenticated via the backoffice cookie. The CSV endpoint requires x-admin-token
 * so we'll proxy it through a Next.js route handler.
 */
export async function getTopRiskCsvUrl(window: string = '7d', limit: number = 50): Promise<string> {
  return `/internal/email/api/top-risk-csv?window=${window}&limit=${limit}`
}
