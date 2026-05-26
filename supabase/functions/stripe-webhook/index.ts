import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'

// Stripe webhook handler — no Stripe npm package (incompatible with Deno edge runtime)
// Signature verification done manually using Web Crypto API

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PRICE_TO_PLAN at module level is safe — only reads env vars, no state
const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_SINGLE_ANNUAL')   || '']: 'single',
  [Deno.env.get('STRIPE_PRICE_COUPLES_MONTHLY') || '']: 'couples',
  [Deno.env.get('STRIPE_PRICE_COUPLES_ANNUAL')  || '']: 'couples',
}

// Verify Stripe webhook signature using Web Crypto API
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Parse the signature header: t=timestamp,v1=hash
    const parts: Record<string, string> = {}
    for (const part of signature.split(',')) {
      const [k, v] = part.split('=')
      parts[k] = v
    }
    const timestamp = parts['t']
    const v1        = parts['v1']
    if (!timestamp || !v1) return false

    // Check timestamp is within 5 minutes (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error('Stripe webhook timestamp too old:', timestamp)
      return false
    }

    // Compute expected signature: HMAC-SHA256(timestamp + '.' + body)
    const enc       = new TextEncoder()
    const keyData   = enc.encode(secret)
    const msgData   = enc.encode(`${timestamp}.${body}`)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sigBuf    = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const sigHex    = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    // Constant-time comparison
    if (sigHex.length !== v1.length) return false
    const aBytes = enc.encode(sigHex)
    const bBytes = enc.encode(v1)
    let diff = 0
    for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
    return diff === 0
  } catch (err) {
    console.error('Signature verification error:', err.message)
    return false
  }
}

// If userId is the active couples_payer_id on an accepted partner_link,
// transition that link to the 14-day separation grace period and notify
// the other partner. Called when the payer's Stripe subscription drops
// off Couples (changed plan or cancelled). Mirrors handle-separation.
async function startSeparationIfPayer(supabase: any, userId: string) {
  const { data: link } = await supabase
    .from('partner_links')
    .select('id, requester_id, partner_id, status, separation_deadline')
    .eq('couples_payer_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!link) return

  const deadline = new Date(Date.now() + 14 * 86400000)
  await supabase.from('partner_links').update({
    status:              'separation_pending',
    separation_deadline: deadline.toISOString(),
    separated_at:        new Date().toISOString(),
  }).eq('id', link.id)

  const otherId  = link.requester_id === userId ? link.partner_id : link.requester_id
  const deadlineStr = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

  // Notify both partners. The payer is notified too because their plan
  // change was made in Stripe (not via the in-app Unlink button), so they
  // may not realise the Couples link is now winding down — without this
  // they'd see the banner next time they open the app with no context.
  const rows: any[] = [{
    user_id:    userId,
    type:       'separation_pending',
    title:      'Couples plan ended — shared vault wind-down started',
    message:    `Your Stripe subscription is no longer the Couples plan, so your shared vault link will end on ${deadlineStr}. Visit the Couples page to review which shared entries you created should move to your private vault.`,
    action_url: '/?page=couples',
  }]
  if (otherId) {
    rows.push({
      user_id:    otherId,
      type:       'separation_pending',
      title:      'Your Couples plan is ending',
      message:    `Your partner's Couples subscription has changed. You have 14 days to review the shared vault and choose which entries you created should move to your private vault. After ${deadlineStr}, the shared vault will be detached and you'll be moved to the Free plan.`,
      action_url: '/?page=couples',
    })
  }
  await supabase.from('notifications').insert(rows).catch(() => {})
}

serve(async (req) => {
  // FIX MD-1: Create supabase client per-request, not at module level
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  const secret    = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

  // Verify Stripe signature
  const valid = await verifyStripeSignature(body, signature, secret)
  if (!valid) {
    console.error('Stripe signature verification failed')
    return new Response('Forbidden', { status: 403 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Idempotency — skip already-processed events
  try {
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle()
    if (existing) return new Response('OK', { status: 200 })
  } catch { /* not found = proceed */ }

  try {
    await handleEvent(event, supabase)
    await supabase.from('stripe_events').insert({
      id:      event.id,
      type:    event.type,
      // Store minimal metadata only (PII minimisation) — not full Stripe payload
      payload: {
        customer:     event.data?.object?.customer ?? null,
        subscription: event.data?.object?.id ?? null,
        status:       event.data?.object?.status ?? null,
      },
    })
  } catch (err) {
    console.error('Webhook handler error:', err.message)
    return new Response('Internal error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})

async function handleEvent(event: any, supabase: any) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub    = event.data?.object
      const userId = sub?.metadata?.supabase_user_id ?? ''

      if (!UUID_RE.test(userId)) {
        console.error('Invalid userId in subscription metadata:', userId)
        return
      }

      // Handle both old and new Stripe API formats for price ID
      const priceId = sub?.items?.data?.[0]?.price?.id
                   ?? sub?.plan?.id
                   ?? ''
      const plan    = PRICE_TO_PLAN[priceId]

      if (!plan) {
        console.error('Unknown price ID:', priceId, 'known:', Object.keys(PRICE_TO_PLAN))
        return
      }

      const renewal = new Date((sub?.current_period_end ?? 0) * 1000).toISOString()

      const { data: profile } = await supabase
        .from('profiles').select('id, plan').eq('id', userId).single()
      if (!profile) {
        console.error('User not found:', userId)
        return
      }
      const oldPlan = profile.plan

      const { error } = await supabase.from('profiles').update({
        plan,
        plan_renewal:           renewal,
        stripe_subscription_id: sub?.id,
      }).eq('id', userId)

      if (error) console.error('Profile update failed:', error.message)

      // If the user dropped off Couples while they're the active payer on
      // a partner link, kick off the 14-day separation grace period for
      // their partner. Matches the behaviour of the in-app Unlink button.
      if (oldPlan === 'couples' && plan !== 'couples') {
        await startSeparationIfPayer(supabase, userId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub    = event.data?.object
      const userId = sub?.metadata?.supabase_user_id ?? ''
      if (!UUID_RE.test(userId)) return

      const { data: profile } = await supabase
        .from('profiles').select('plan').eq('id', userId).single()
      const oldPlan = profile?.plan

      await supabase.from('profiles').update({
        plan:                   'free',
        plan_renewal:           null,
        stripe_subscription_id: null,
      }).eq('id', userId)

      // Full cancellation by a Couples payer: same as a plan change off Couples.
      if (oldPlan === 'couples') {
        await startSeparationIfPayer(supabase, userId)
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data?.object
      console.error('Payment failed for customer:', invoice?.customer)
      break
    }
  }
}
