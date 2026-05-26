// couples-accept edge function
// Handles partner B's acceptance of a couples invite. Service-role-only fields
// (couples_payer_id, profile.plan) are updated here so partner B isn't bounced
// to Stripe and double-charged.
//
// Flow:
//   1. Verify caller JWT and that they are the invited partner on this link.
//   2. Update partner_links: status='accepted', accepted_at=now(),
//      couples_payer_id=requester_id.
//   3. If partner B currently has a paid Single subscription, cancel it
//      immediately and refund the unused portion pro-rata.
//   4. Set partner B's profile.plan='couples' and clear their stripe_*
//      fields (they're no longer paying anything — requester is the payer).
//
// Couples-invite already blocks the case where partner B is on 'couples', and
// requester_id was already validated to be on 'couples' when the invite was
// sent. So the cases we have to handle here are: partner on 'free' (easy) or
// partner on 'single' (refund + cancel).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'

const ALLOWED_ORIGINS = new Set([
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
  'https://legatum-chi.vercel.app',
  'https://digital-relative.vercel.app',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function corsHeaders(origin: string): Record<string, string> {
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':                         'Origin',
  }
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)
  const json   = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { ...init, headers: { ...hdrs, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => null)
    if (!body) throw new Error('Invalid request')
    const { linkId } = body
    if (!UUID_RE.test(linkId)) throw new Error('Invalid request')

    // Verify JWT
    const jwt = authHeader.slice(7)
    const { data: { user: me }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !me) throw new Error('Unauthorised')

    // Load link + profiles
    const { data: link } = await supabase
      .from('partner_links')
      .select('id, requester_id, partner_id, status, partner:partner_id(id, plan, stripe_subscription_id)')
      .eq('id', linkId)
      .single()
    if (!link)                             throw new Error('Invite not found')
    if (link.partner_id !== me.id)         throw new Error('Not your invite to accept')
    if (link.status !== 'pending')         throw new Error('This invite is no longer pending')

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    let billingNote = ''

    // ── Step 1: handle partner B's existing Stripe sub, if any ────────────
    // Done BEFORE flipping the link so we don't end up with link='accepted'
    // + partner still has an active Single sub running.
    const partnerProfile: any = link.partner
    if (partnerProfile?.plan === 'single' && partnerProfile?.stripe_subscription_id && stripeKey) {
      const subRes = await fetchWithTimeout(
        `https://api.stripe.com/v1/subscriptions/${partnerProfile.stripe_subscription_id}`,
        { headers: { 'Authorization': `Bearer ${stripeKey}` } }
      )
      const sub = await subRes.json()

      if (sub.current_period_end) {
        // Cancel immediately — partner is moving to couples-funded plan.
        await fetchWithTimeout(
          `https://api.stripe.com/v1/subscriptions/${partnerProfile.stripe_subscription_id}`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${stripeKey}` } }
        ).catch(() => {})

        // Pro-rata refund the unused portion.
        const remainingMs   = Math.max(0, (sub.current_period_end * 1000) - Date.now())
        const periodMs      = (sub.current_period_end - sub.current_period_start) * 1000
        const yearlyPence   = 1800 // £18/yr Single fallback if invoice lookup fails
        const refundPence   = periodMs > 0
          ? Math.round((remainingMs / periodMs) * yearlyPence)
          : 0

        if (refundPence > 0) {
          const invoicesRes = await fetchWithTimeout(
            `https://api.stripe.com/v1/invoices?customer=${sub.customer}&subscription=${sub.id}&limit=1&status=paid`,
            { headers: { 'Authorization': `Bearer ${stripeKey}` } }
          )
          const invoices = await invoicesRes.json()
          const chargeId = invoices.data?.[0]?.charge
          if (chargeId) {
            const refundRes = await fetchWithTimeout('https://api.stripe.com/v1/refunds', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                charge:              chargeId,
                amount:              String(refundPence),
                reason:              'requested_by_customer',
                'metadata[reason]':  'couples_acceptance',
                'metadata[user_id]': me.id,
              }),
            })
            const refund = await refundRes.json()
            if (refund.id) {
              await supabase.from('refunds').insert([{
                user_id:          me.id,
                stripe_refund_id: refund.id,
                amount_pence:     refundPence,
                reason:           'couples_acceptance',
                status:           'issued',
              }])
              billingNote = `£${(refundPence / 100).toFixed(2)} refunded for unused Single subscription.`
            }
          }
        }
      }
    }

    // ── Step 2: flip the link to accepted + set payer ─────────────────────
    const { error: linkErr } = await supabase
      .from('partner_links')
      .update({
        status:            'accepted',
        accepted_at:       new Date().toISOString(),
        couples_payer_id:  link.requester_id,
      })
      .eq('id', linkId)
    if (linkErr) throw new Error('Could not accept invite')

    // ── Step 3: upgrade partner B's profile ───────────────────────────────
    // Service role bypasses the profile.plan RLS pin.
    await supabase
      .from('profiles')
      .update({
        plan:                   'couples',
        stripe_customer_id:     null,
        stripe_subscription_id: null,
        plan_renewal:           null,
      })
      .eq('id', me.id)

    // ── Step 4: notify requester ──────────────────────────────────────────
    await supabase.from('notifications').insert([{
      user_id:    link.requester_id,
      type:       'partner_accepted',
      title:      'Your partner accepted the Couples invite',
      message:    `${billingNote ? billingNote + ' ' : ''}You now share a Couples vault.`,
      action_url: '/?page=couples',
    }]).catch(() => {})

    return json({ success: true, billingNote })
  } catch (err) {
    console.error('couples-accept error:', err.message)
    const userFacing = ['Invalid request', 'Unauthorised', 'Invite not found', 'Not your invite to accept', 'This invite is no longer pending', 'Could not accept invite']
    const msg = userFacing.includes(err.message) ? err.message : 'Could not accept invite'
    return json({ error: msg }, { status: 400 })
  }
})
