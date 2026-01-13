import Stripe from 'stripe'

export interface StripeAdapterEvent {
  id: string
  type: string
  created: number
  raw: Stripe.Event
  customerId?: string
  subscriptionId?: string
  invoiceId?: string
  paymentIntentId?: string
  mode?: 'subscription' | 'payment'
  metadata?: Record<string, string>
}

function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(secret, { apiVersion: '2024-06-20' })
}

function extractCustomerId(obj: any): string | undefined {
  const c = obj?.customer
  if (typeof c === 'string') return c
  if (c && typeof c === 'object' && typeof c.id === 'string') return c.id
  return undefined
}

function extractMetadata(obj: any): Record<string, string> | undefined {
  const md = obj?.metadata
  if (!md || typeof md !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(md)) {
    if (typeof v === 'string') out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export function verifyStripeSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string
): Stripe.Event {
  if (!signature) throw new Error('Stripe signature missing')
  if (!secret) throw new Error('Stripe webhook secret missing')
  const stripe = getStripe()
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

export function toStripeAdapterEvent(event: Stripe.Event): StripeAdapterEvent {
  const obj: any = event.data?.object ?? {}
  const metadata = extractMetadata(obj)

  const type = event.type
  const isInvoice = type.startsWith('invoice.')
  const isPaymentIntent = type.startsWith('payment_intent.')

  const subscriptionId =
    typeof obj.subscription === 'string'
      ? obj.subscription
      : (obj.subscription && typeof obj.subscription.id === 'string' ? obj.subscription.id : undefined)

  const paymentIntentId = isPaymentIntent && typeof obj.id === 'string'
    ? obj.id
    : (typeof obj.payment_intent === 'string' ? obj.payment_intent : undefined)

  const mode = obj.mode === 'subscription' || obj.mode === 'payment' ? obj.mode : undefined

  return {
    id: event.id,
    type,
    created: event.created,
    raw: event,
    customerId: extractCustomerId(obj),
    subscriptionId,
    invoiceId: isInvoice && typeof obj.id === 'string' ? obj.id : undefined,
    paymentIntentId,
    mode,
    metadata,
  }
}




