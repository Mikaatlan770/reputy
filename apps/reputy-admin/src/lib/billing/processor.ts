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

export async function processEvent(
  event: GenericWebhookEvent,
  orgId: string
): Promise<ProcessResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
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
          quantity: event.metadata.quantity ? Number(event.metadata.quantity) : undefined,
        })
        return { handled: true }
      }

      return { handled: true }
    }

    case 'payment_intent.succeeded': {
      // Pack only (never subscriptions here)
      if (event.metadata?.packId) {
        await creditPack({
          orgId,
          packId: event.metadata.packId,
          quantity: event.metadata.quantity ? Number(event.metadata.quantity) : undefined,
        })
      }
      return { handled: true }
    }

    case 'payment_intent.payment_failed': {
      // Optional: notify user / log audit
      return { handled: true }
    }

    case 'invoice.paid': {
      await markInvoicePaid({ orgId, invoiceId: event.invoiceId })
      return { handled: true }
    }

    case 'invoice.payment_failed': {
      await markInvoicePastDue({ orgId, invoiceId: event.invoiceId })
      return { handled: true }
    }

    case 'customer.subscription.deleted': {
      // Never cut access early. Preavis is internal.
      const cancelEffectiveAt = resolveCancelEffectiveAt(event.subscription)

      // If we don't know the effective date, we MUST NOT revoke here.
      if (!cancelEffectiveAt) {
        await markSubscriptionProviderEnded({
          orgId,
          subscriptionId: event.subscriptionId,
          cancelEffectiveAt: undefined,
          revokeNow: false,
        })
        return { handled: true }
      }

      // If still before effective date => keep active
      if (nowTs() < cancelEffectiveAt) {
        await markSubscriptionProviderEnded({
          orgId,
          subscriptionId: event.subscriptionId,
          cancelEffectiveAt,
          revokeNow: false,
        })
        return { handled: true }
      }

      // Only now we may revoke (after notice period)
      await markSubscriptionProviderEnded({
        orgId,
        subscriptionId: event.subscriptionId,
        cancelEffectiveAt,
        revokeNow: true,
      })
      return { handled: true }
    }

    default:
      return { handled: false }
  }
}




