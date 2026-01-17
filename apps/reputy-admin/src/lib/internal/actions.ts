'use server'

import { revalidatePath } from 'next/cache'
import { fetchInternal, Org } from './fetch-internal'

// ============ CREATE ORG ============

interface CreateOrgInput {
  name: string
  vertical: 'health' | 'food' | 'business'
}

interface CreateOrgResult {
  ok: boolean
  org?: Org
  error?: string
}

export async function createOrg(input: CreateOrgInput): Promise<CreateOrgResult> {
  const result = await fetchInternal<{ org: Org }>('/internal/orgs', {
    method: 'POST',
    body: input,
  })

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    return { ok: true, org: result.data.org }
  }

  return { ok: false, error: result.error }
}

// ============ UPDATE ORG ============

interface UpdateOrgInput {
  orgId: string
  name?: string
  vertical?: 'health' | 'food' | 'business'
  plan?: {
    code?: string
    basePriceCents?: number
    billingCycle?: 'monthly' | 'yearly'
  }
  negotiated?: {
    enabled?: boolean
    customPriceCents?: number | null
    discountPercent?: number | null
    notes?: string
    contractRef?: string | null
  }
  options?: {
    reviewRouting?: boolean
    widgetsSeo?: boolean
    multiLocations?: boolean
    prioritySupport?: boolean
  }
  quotas?: {
    smsIncluded?: number
    emailIncluded?: number
  }
}

interface UpdateOrgResult {
  ok: boolean
  org?: Org
  error?: string
}

export async function updateOrg(input: UpdateOrgInput): Promise<UpdateOrgResult> {
  const { orgId, ...body } = input
  
  const result = await fetchInternal<{ org: Org }>(`/internal/orgs/${orgId}`, {
    method: 'PUT',
    body,
  })

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { ok: true, org: result.data.org }
  }

  return { ok: false, error: result.error }
}

// ============ ADD CREDITS ============

interface AddCreditsInput {
  orgId: string
  sms?: number
  email?: number
  reason?: string
}

interface AddCreditsResult {
  ok: boolean
  newBalances?: { smsExtra: number; emailExtra: number }
  error?: string
}

export async function addCredits(input: AddCreditsInput): Promise<AddCreditsResult> {
  const { orgId, ...body } = input
  
  const result = await fetchInternal<{ org: Org; newBalances: { smsExtra: number; emailExtra: number } }>(
    `/internal/orgs/${orgId}/credits`,
    { method: 'POST', body }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { ok: true, newBalances: result.data.newBalances }
  }

  return { ok: false, error: result.error }
}

// ============ CHANGE STATUS ============

interface ChangeStatusInput {
  orgId: string
  status: 'active' | 'suspended' | 'cancelled'
}

interface ChangeStatusResult {
  ok: boolean
  previousStatus?: string
  error?: string
}

export async function changeStatus(input: ChangeStatusInput): Promise<ChangeStatusResult> {
  const { orgId, status } = input
  
  const result = await fetchInternal<{ org: Org; previousStatus: string }>(
    `/internal/orgs/${orgId}/status`,
    { method: 'POST', body: { status } }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { ok: true, previousStatus: result.data.previousStatus }
  }

  return { ok: false, error: result.error }
}

// ============ REFRESH DATA ============

export async function refreshClients() {
  revalidatePath('/internal/clients')
}

export async function refreshClient(orgId: string) {
  revalidatePath(`/internal/clients/${orgId}`)
}
