import type { GenericWebhookEvent, Subscription } from './types'

export interface ProcessResult {
  handled: boolean
}

function nowTs() {
  return Date.now()
}

// ===== Stubs métiers (à remplacer par DB/logic métier) =====

async function activateOrUpdateSubscription(_: {
  orgId: string
  subscriptionId?: string
  stripeCustomerId?: string
  metadata?: Record<string, string>
}) {
  // TODO: créer/activer sub en BDD
}

async function creditPack(_: { orgId: string; packId: string; quantity?: number }) {
  // TODO: créditer le pack en BDD
}

async function markInvoicePaid(_: { orgId: string; invoiceId?: string }) {
  // TODO: marquer facture payée + reset quotas
}

async function markInvoicePastDue(_: { orgId: string; invoiceId?: string }) {
  // TODO: passer en past_due, suspendre envoi, relance
}

/**
 * Ce handler doit :
 * - marquer "providerEnded=true"
 * - ne pas couper l'accès tant que now < cancelEffectiveAt
 * - couper seulement si now >= cancelEffectiveAt (si tu le fais ici)
 */
async function markSubscriptionProviderEnded(_: {
  orgId: string
  subscriptionId?: string
  cancelEffectiveAt?: number
  revokeNow?: boolean
}) {
  // TODO:
  // - set providerEnded=true
  // - if revokeNow=true => status=canceled and revoke features
}

function resolveCancelEffectiveAt(sub?: Subscription): number | undefined {
  if (!sub) return undefined
  if (sub.cancelEffectiveAt) return new Date(sub.cancelEffectiveAt).getTime()

  // IMPORTANT: do NOT fallback to currentPeriodEnd here because business rule is "1-month notice"
  // If cancelEffectiveAt isn't set by the app, we cannot safely compute it in the webhook processor.
  return undefined
}

function parseQuantity(metadata?: Record<string, string>): number | undefined {
  if (!metadata?.quantity) return undefined
  return Number(metadata.quantity)
}

async function handleCheckoutCompleted(
  event: GenericWebhookEvent,
  orgId: string
): Promise<ProcessResult> {
  if (event.mode === 'subscription') {
    await activateOrUpdateSubscription({
      orgId,
      subscriptionId: event.subscriptionId,
      stripeCustomerId: event.customerId,
      metadata: event.metadata,
    })
    return { handled: true }
  }
  if (event.mode === 'payment' && event.metadata?.packId) {
    await creditPack({
      orgId,
      packId: event.metadata.packId,
      quantity: parseQuantity(event.metadata),
    })
    return { handled: true }
  }
  return { handled: true }
}

async function handlePaymentSucceeded(
  event: GenericWebhookEvent,
  orgId: string
): Promise<ProcessResult> {
  if (event.metadata?.packId) {
    await creditPack({
      orgId,
      packId: event.metadata.packId,
      quantity: parseQuantity(event.metadata),
    })
  }
  return { handled: true }
}

async function handleSubscriptionDeleted(
  event: GenericWebhookEvent,
  orgId: string
): Promise<ProcessResult> {
  const cancelEffectiveAt = resolveCancelEffectiveAt(event.subscription)
  const revokeNow = !!cancelEffectiveAt && nowTs() >= cancelEffectiveAt

  await markSubscriptionProviderEnded({
    orgId,
    subscriptionId: event.subscriptionId,
    cancelEffectiveAt,
    revokeNow,
  })
  return { handled: true }
}

export async function processEvent(
  event: GenericWebhookEvent,
  orgId: string
): Promise<ProcessResult> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event, orgId)
    case 'payment_intent.succeeded':
      return handlePaymentSucceeded(event, orgId)
    case 'payment_intent.payment_failed':
      return { handled: true }
    case 'invoice.paid':
      await markInvoicePaid({ orgId, invoiceId: event.invoiceId })
      return { handled: true }
    case 'invoice.payment_failed':
      await markInvoicePastDue({ orgId, invoiceId: event.invoiceId })
      return { handled: true }
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event, orgId)
    default:
      return { handled: false }
  }
}




