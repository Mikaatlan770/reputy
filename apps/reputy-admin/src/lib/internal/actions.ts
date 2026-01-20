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
    aiIncluded?: number
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
  ai?: number
  source: 'gift' | 'pack'
  label?: string
}

interface CreditAllocation {
  id: string
  source: 'included' | 'gift' | 'pack'
  smsAllocated: number
  emailAllocated: number
  smsUsed: number
  emailUsed: number
  periodStart: string
  periodEnd: string
  createdAt: string
}

interface AddCreditsResult {
  ok: boolean
  allocation?: CreditAllocation
  expiresAt?: string
  message?: string
  error?: string
}

export async function addCredits(input: AddCreditsInput): Promise<AddCreditsResult> {
  const { orgId, ...body } = input
  
  const result = await fetchInternal<{ 
    org: Org
    allocation: CreditAllocation
    expiresAt: string
    message: string
  }>(
    `/internal/orgs/${orgId}/credits`,
    { method: 'POST', body }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { 
      ok: true, 
      allocation: result.data.allocation,
      expiresAt: result.data.expiresAt,
      message: result.data.message
    }
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

// ============ RESET PUBLIC KEY ============

interface ResetPublicKeyInput {
  orgId: string
}

interface ResetPublicKeyResult {
  ok: boolean
  oldPublicKey?: string
  newPublicKey?: string
  error?: string
}

export async function resetPublicKey(input: ResetPublicKeyInput): Promise<ResetPublicKeyResult> {
  const { orgId } = input
  
  const result = await fetchInternal<{ 
    ok: boolean
    oldPublicKey: string
    newPublicKey: string 
  }>(
    `/internal/orgs/${orgId}/reset-public-key`,
    { method: 'POST' }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { 
      ok: true, 
      oldPublicKey: result.data.oldPublicKey,
      newPublicKey: result.data.newPublicKey 
    }
  }

  return { ok: false, error: result.error }
}

// ============ P1.3: API TOKEN MANAGEMENT ============

interface ApiTokenInfo {
  apiTokenMasked: string
  apiTokenCreatedAt: string | null
  apiTokenLastRotatedAt: string | null
  previousTokenActive: boolean
  previousTokenMasked: string | null
  previousTokenExpiresAt: string | null
}

interface GetApiTokenResult {
  ok: boolean
  tokenInfo?: ApiTokenInfo
  error?: string
}

export async function getApiToken(orgId: string): Promise<GetApiTokenResult> {
  const result = await fetchInternal<ApiTokenInfo>(
    `/internal/orgs/${orgId}/api-token`,
    { method: 'GET' }
  )

  if (result.ok && result.data) {
    return { ok: true, tokenInfo: result.data }
  }

  return { ok: false, error: result.error }
}

interface RotateApiTokenResult {
  ok: boolean
  newApiToken?: string
  previousTokenValidUntil?: string
  message?: string
  error?: string
}

export async function rotateApiToken(orgId: string): Promise<RotateApiTokenResult> {
  const result = await fetchInternal<{
    newApiToken: string
    previousTokenValidUntil: string
    message: string
  }>(
    `/internal/orgs/${orgId}/rotate-api-token`,
    { method: 'POST' }
  )

  if (result.ok && result.data) {
    revalidatePath('/internal/clients')
    revalidatePath(`/internal/clients/${orgId}`)
    return { 
      ok: true, 
      newApiToken: result.data.newApiToken,
      previousTokenValidUntil: result.data.previousTokenValidUntil,
      message: result.data.message
    }
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
