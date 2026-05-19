// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook
// Add webhook URL in Stripe: https://<project>.supabase.co/functions/v1/stripe-webhook
// Events to listen for: customer.subscription.created, updated, deleted

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
const secret  = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Map Stripe price IDs to plan names
const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_SINGLE_ANNUAL')  || '']: 'single',
  [Deno.env.get('STRIPE_PRICE_COUPLES_MONTHLY') || '']: 'couples',
  [Deno.env.get('STRIPE_PRICE_COUPLES_ANNUAL')  || '']: 'couples',
}

serve(async (req) => {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }

  // Idempotency — skip already-processed events
  const { data: existing } = await supabase.from('stripe_events').select('id').eq('id', event.id).single()
  if (existing) return new Response('Already processed', { status: 200 })

  try {
    await handleEvent(event)
    await supabase.from('stripe_events').insert({ id: event.id, type: event.type, payload: event.data })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(`Handler error: ${err.message}`, { status: 500 })
  }

  return new Response('OK', { status: 200 })
})

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub     = event.data.object as Stripe.Subscription
      const userId  = sub.metadata.supabase_user_id
      const priceId = sub.items.data[0]?.price.id
      const plan    = PRICE_TO_PLAN[priceId] || 'free'
      const renewal = new Date(sub.current_period_end * 1000).toISOString()

      await supabase.from('profiles').update({
        plan,
        plan_renewal:           renewal,
        stripe_subscription_id: sub.id,
      }).eq('id', userId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub    = event.data.object as Stripe.Subscription
      const userId = sub.metadata.supabase_user_id
      await supabase.from('profiles').update({
        plan:                   'free',
        plan_renewal:           null,
        stripe_subscription_id: null,
      }).eq('id', userId)
      break
    }
  }
}
