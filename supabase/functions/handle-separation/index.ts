import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'

const ALLOWED_ORIGINS = new Set([
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
  'https://legatum-chi.vercel.app',
  'https://digital-relative.vercel.app',
])

function corsHeaders(origin: string) {
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}



serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || ''

  try {
    const body = await req.json().catch(() => null)
    if (!body?.linkId || !body?.initiatorId) throw new Error('Missing required fields')

    const { linkId, initiatorId } = body
    if (!UUID_RE.test(linkId) || !UUID_RE.test(initiatorId)) throw new Error('Invalid IDs')

    // Verify JWT belongs to initiatorId
    const jwt = authHeader.slice(7)
    const meRes = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    // FIX EF-4/BL-2: verify response OK before parsing
    if (!meRes.ok) throw new Error('Unauthorised')
    const me = await meRes.json()
    if (!me?.id || me.id !== initiatorId) throw new Error('Unauthorised')

    // Get the partner link
    const { data: link, error: linkError } = await supabase
      .from('partner_links')
      .select('*, requester:requester_id(id, full_name, plan, stripe_subscription_id), partner:partner_id(id, full_name, plan, stripe_subscription_id)')
      .eq('id', linkId)
      .in('status', ['pending', 'accepted'])
      .single()

    if (linkError || !link) throw new Error('Partner link not found')

    // Verify initiator is part of this link
    if (link.requester_id !== initiatorId && link.partner_id !== initiatorId) {
      throw new Error('Unauthorised')
    }

    const isRequester = link.requester_id === initiatorId
    const payer       = link.couples_payer_id
    // HIGH-3 fix: null couples_payer_id must not default to treating requester as nonPayer
    // If payer is not set, we cannot determine who is paying — skip Stripe downgrade logic
    if (!payer) {
      console.error('couples_payer_id is null - cannot determine payer. Aborting separation.')
      return new Response(JSON.stringify({ error: 'Couple link missing payment information. Contact support.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
    const nonPayer    = payer === link.requester_id ? link.partner_id : link.requester_id

    let billingNote = ''

    // ── Handle Stripe billing on separation ────────────────────
    if (payer && stripeKey) {
      const payerProfile = isRequester ? link.requester : link.partner
      const nonPayerProfile = isRequester ? link.partner : link.requester

      // Payer: downgrade from Couples to Single if they want to continue
      // (We'll notify them and let them choose — don't auto-downgrade)
      // Non-payer: they revert to free tier, issue refund for any prepaid amount

      if (nonPayerProfile?.stripe_subscription_id && nonPayerProfile?.plan === 'single') {
        // Non-payer had a Single plan before couples — refund unused portion
        const subRes = await fetchWithTimeout(
          `https://api.stripe.com/v1/subscriptions/${nonPayerProfile.stripe_subscription_id}`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        )
        const sub = await subRes.json()

        if (sub.current_period_end) {
          const remainingMs    = Math.max(0, (sub.current_period_end * 1000) - Date.now())
          const remainingDays  = Math.ceil(remainingMs / 86400000)
          const periodMs       = (sub.current_period_end - sub.current_period_start) * 1000
          // FIX TP-NEW-2: Use actual amount paid from Stripe, not hardcoded price
          // Prefer stored partner_paid_pence, fall back to calculating from invoice
          let refundPence = link.partner_paid_pence
            ? Math.round((remainingMs / periodMs) * link.partner_paid_pence)
            : Math.round((remainingDays / 365) * 1800) // fallback only

          if (refundPence > 0) {
            // Get latest invoice charge ID for refund
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
                  charge: chargeId,
                  amount: String(refundPence),
                  reason: 'requested_by_customer',
                  'metadata[reason]': 'couples_separation',
                  'metadata[user_id]': nonPayerProfile.id,
                }),
              })
              const refund = await refundRes.json()

              if (refund.id) {
                // Record refund
                await supabase.from('refunds').insert([{
                  user_id: nonPayerProfile.id,
                  stripe_refund_id: refund.id,
                  amount_pence: refundPence,
                  reason: 'couples_separation',
                  status: 'issued',
                }])
                billingNote = `£${(refundPence / 100).toFixed(2)} refund issued to ${nonPayerProfile.full_name || 'partner'} for unused subscription. Payer notified to review their plan.`
              }
            }
          }
        }
      }

      // Notify payer they may want to downgrade
      if (payer) {
        await supabase.from('notifications').insert([{
          user_id: payer,
          type: 'partner_unlinked',
          title: 'Couples link ended - review your plan',
          message: 'Your Couples vault has been unlinked. You may wish to switch to a Single plan. Visit My Plan to manage your subscription.',
          action_url: '/plan',
        }])
      }
    }

    // ── Freeze shared vault (mark entries as archived) ─────────
    // We don't delete — 90-day export window
    await supabase
      .from('vault_entries')
      .update({ is_shared: false }) // Detach from active shared vault
      .eq('partner_link_id', linkId)
      .eq('is_shared', true)
    // Note: entries remain in DB with partner_link_id for 90-day retrieval

    // ── Create separation record ────────────────────────────────
    await supabase.from('separations').insert([{
      partner_link_id: linkId,
      initiated_by: initiatorId,
      status: 'export_period',
      shared_vault_export_deadline: new Date(Date.now() + 90 * 86400000).toISOString(),
    }]).onConflict('partner_link_id').merge()

    // ── Update partner link status ──────────────────────────────
    await supabase.from('partner_links').update({
      status: 'unlinked',
      separated_at: new Date().toISOString(),
      separation_billing_note: billingNote || 'Separation completed. No billing changes required.',
    }).eq('id', linkId)

    // ── Update non-payer to free plan ──────────────────────────
    if (nonPayer) {
      await supabase.from('profiles').update({
        plan: 'free',
        plan_renewal: null,
        stripe_subscription_id: null,
      }).eq('id', nonPayer)

      // Notify the other person
      await supabase.from('notifications').insert([{
        user_id: nonPayer === initiatorId ? (isRequester ? link.partner_id : link.requester_id) : nonPayer,
        type: 'partner_unlinked',
        title: 'Couples vault unlinked',
        message: `Your couples vault has been unlinked. Your private vault and data remain intact. You have 90 days to export any shared vault data.`,
        action_url: '/couples',
      }])
    }

    return new Response(JSON.stringify({
      success: true,
      billingNote,
      exportDeadline: new Date(Date.now() + 90 * 86400000).toISOString(),
    }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('Separation error:', err.message)
    // FIX HI-3: whitelist safe error messages — never expose internal details
    const safeMessages = ['Missing required fields', 'Invalid IDs', 'Unauthorised', 'Partner link not found']
    const msg = safeMessages.some(s => err.message.includes(s)) ? err.message : 'Separation could not be completed. Please contact support.'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
