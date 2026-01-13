import { NextRequest, NextResponse } from 'next/server'
import type { GenericWebhookEvent } from '@/lib/billing/types'
import { verifyStripeSignature, toStripeAdapterEvent } from '@/lib/billing/stripe/adapter'
import { eventStore } from '@/lib/billing/event-store'
import { orgStore } from '@/lib/billing/org-store'
import { processEvent } from '@/lib/billing/processor'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

const supportedTypes = new Set<GenericWebhookEvent['type']>([
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
])

function logAudit(msg: string, data?: Record<string, unknown>) {
  // Pas de PII, pas de payload complet
  console.log('[billing:webhook]', msg, data ?? {})
}

function resolveOrgIdFromMetadata(adapterEvent: ReturnType<typeof toStripeAdapterEvent>): string | null {
  const metaOrg = adapterEvent.metadata?.orgId
  return metaOrg || null
}

export async function POST(request: NextRequest) {
  try {
    // 0) Config check
    if (!WEBHOOK_SECRET) {
      logAudit('server_misconfigured_missing_webhook_secret')
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
    }

    // 1) Raw body
    const buf = Buffer.from(await request.arrayBuffer())
    const signature = request.headers.get('stripe-signature')

    // 2) Verify signature -> 400 if invalid
    let stripeEvent
    try {
      stripeEvent = verifyStripeSignature(buf, signature, WEBHOOK_SECRET)
    } catch (err: any) {
      logAudit('invalid_signature', { message: String(err?.message || '') })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
    }

    const adapterEvent = toStripeAdapterEvent(stripeEvent)

    // 3) Idempotence check
    if (await eventStore.has(adapterEvent.id)) {
      logAudit('duplicate_event', { eventId: adapterEvent.id })
      return NextResponse.json({ received: true, duplicate: true })
    }

    // 4) Ignore unsupported events (return 200 to avoid retries)
    if (!supportedTypes.has(adapterEvent.type as any)) {
      logAudit('unhandled_event', { eventId: adapterEvent.id, type: adapterEvent.type })

      // Option: save as processed to avoid re-processing duplicates
      await eventStore.save({
        eventId: adapterEvent.id,
        type: adapterEvent.type,
        created: adapterEvent.created,
        processedAt: Date.now(),
      })

      return NextResponse.json({ received: true, ignored: true })
    }

    // 5) Resolve org
    let orgId = resolveOrgIdFromMetadata(adapterEvent)
    if (!orgId && adapterEvent.customerId) {
      orgId = await orgStore.getOrgIdByCustomer(adapterEvent.customerId)
    }
    if (!orgId) {
      logAudit('org_not_found', {
        eventId: adapterEvent.id,
        type: adapterEvent.type,
        customerId: adapterEvent.customerId,
      })
      return NextResponse.json({ error: 'org_not_found' }, { status: 400 })
    }

    // 6) Bind mapping for future events
    if (adapterEvent.customerId) {
      await orgStore.linkCustomerToOrg(adapterEvent.customerId, orgId)
    }

    // 7) Build generic event (safe because supportedTypes check)
    const genericEvent: GenericWebhookEvent = {
      id: adapterEvent.id,
      type: adapterEvent.type as GenericWebhookEvent['type'],
      created: adapterEvent.created,
      customerId: adapterEvent.customerId,
      subscriptionId: adapterEvent.subscriptionId,
      invoiceId: adapterEvent.invoiceId,
      paymentIntentId: adapterEvent.paymentIntentId,
      mode: adapterEvent.mode,
      metadata: adapterEvent.metadata,
      subscription: undefined, // enrich later from DB
    }

    // 8) Process (errors => 500 so Stripe retries; idempotent)
    await processEvent(genericEvent, orgId)

    // 9) Save idempotence ONLY after success
    await eventStore.save({
      eventId: adapterEvent.id,
      type: adapterEvent.type,
      created: adapterEvent.created,
      orgId,
      processedAt: Date.now(),
    })

    return NextResponse.json({ received: true })
  } catch (err: any) {
    logAudit('processing_failed', { message: String(err?.message || '') })
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}


