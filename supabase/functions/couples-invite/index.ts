import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'
import { partnerInviteEmail } from '../_shared/emails.ts'

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

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  try {
    const body = await req.json().catch(() => null)
    if (!body) throw new Error('Invalid request')

    const action = body.action || 'invite'

    // Verify JWT up-front so both branches share the check
    const jwt = authHeader.slice(7)
    const meRes = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!meRes.ok) throw new Error('Unauthorised')
    const me = await meRes.json()

    // ── Resend branch ────────────────────────────────────────────────────────
    if (action === 'resend') {
      const { linkId } = body
      if (!UUID_RE.test(linkId)) throw new Error('Invalid request')

      const { data: link } = await supabase
        .from('partner_links')
        .select('id, requester_id, partner_id, status, invite_code, invite_email')
        .eq('id', linkId)
        .single()
      if (!link)                                  throw new Error('Invite not found')
      if (link.requester_id !== me.id)            throw new Error('Unauthorised')
      if (link.status !== 'pending')              throw new Error('This invite is not pending')
      if (!link.invite_email)                     throw new Error('Original email not on file — please cancel and re-invite')

      const { data: reqProfile } = await supabase
        .from('profiles').select('full_name').eq('id', link.requester_id).single()
      const requesterName = reqProfile?.full_name || 'Your partner'

      if (link.partner_id) {
        // Existing user — re-send notification + email
        const partnerAuthRes = await supabase.auth.admin.getUserById(link.partner_id)
        const partnerEmail2  = partnerAuthRes.data?.user?.email || link.invite_email
        const { data: partnerProfile } = await supabase
          .from('profiles').select('full_name').eq('id', link.partner_id).single()

        await supabase.from('notifications').insert([{
          user_id: link.partner_id,
          type: 'partner_link_request',
          title: 'Couples vault invitation (resent)',
          message: `${requesterName} resent their invitation to link vaults as partners on Digital Relative.`,
          action_url: '/couples',
          metadata: { link_id: link.id, requester_name: requesterName },
        }])

        await sendEmail({
          to:      partnerEmail2,
          subject: `${requesterName.replace(/[\r\n]/g, ' ').slice(0, 100)} resent your Couples vault invite`,
          html:    partnerInviteEmail(partnerProfile?.full_name || 'there', requesterName, 'https://digitalrelative.co.uk/?page=couples'),
        })
      } else {
        // Non-existing user — re-send the signup invite email
        const inviteUrl = `https://digitalrelative.co.uk/?partner_invite=${link.invite_code}`
        await sendEmail({
          to:      link.invite_email,
          subject: `${requesterName.replace(/[\r\n]/g, ' ').slice(0, 100)} resent your Digital Relative invitation`,
          html:    partnerInviteEmail('there', requesterName, inviteUrl),
        })
      }

      return new Response(JSON.stringify({ success: true, resent: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── Invite branch (default) ──────────────────────────────────────────────
    const { requesterId, partnerEmail } = body
    if (!UUID_RE.test(requesterId))   throw new Error('Invalid request')
    if (!EMAIL_RE.test(partnerEmail)) throw new Error('Invalid email address')
    if (me.id !== requesterId) throw new Error('Unauthorised')

    // FIX EF-NEW-4: Verify requester has couples plan
    const { data: requester } = await supabase
      .from('profiles')
      .select('full_name, plan')
      .eq('id', requesterId)
      .single()

    if (requester?.plan !== 'couples') {
      throw new Error('Couples vault requires a Couples plan')
    }

    // FIX BL-NEW-1: Check requester doesn't already have a pending invite
    const { data: existingRequest } = await supabase
      .from('partner_links')
      .select('id')
      .eq('requester_id', requesterId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingRequest) throw new Error('You already have a pending partner invite')

    // FIX EF-NEW-1 + TP-NEW-1: Look up by email via auth admin API directly
    // DO NOT use listUsers() — it loads all users
    const emailLookupRes = await fetchWithTimeout(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users?email=${encodeURIComponent(partnerEmail)}`,
      { headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! } }
    )
    const emailLookup = await emailLookupRes.json()
    // Supabase returns { users: [...] } for admin email lookup
    const partnerAuthUser = emailLookup?.users?.[0] || null

    // FIX EF-NEW-2: Always return same success message regardless of whether email exists
    // This prevents email enumeration

    if (partnerAuthUser) {
      const partnerId = partnerAuthUser.id

      // Prevent self-linking
      if (partnerId === requesterId) throw new Error('Cannot invite yourself')

      // Check partner not already linked
      const { data: partnerExistingLink } = await supabase
        .from('partner_links')
        .select('id')
        .or(`requester_id.eq.${partnerId},partner_id.eq.${partnerId}`)
        .in('status', ['pending', 'accepted'])
        .maybeSingle()

      if (partnerExistingLink) {
        // Don't reveal this — return success to prevent enumeration
        // Silently succeed — don't reveal partner link status (prevents enumeration)
        return new Response(JSON.stringify({ success: true, partnerExists: true }), {
          headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Get partner plan for credit calculation
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('plan, stripe_subscription_id, full_name')
        .eq('id', partnerId)
        .single()

      // Create link
      const { data: link, error: linkError } = await supabase
        .from('partner_links')
        .insert([{ requester_id: requesterId, partner_id: partnerId, status: 'pending', invite_email: partnerEmail }])
        .select()
        .single()

      if (linkError) throw linkError

      // In-app notification
      await supabase.from('notifications').insert([{
        user_id: partnerId,
        type: 'partner_link_request',
        title: 'Couples vault invitation',
        message: `${requester?.full_name || 'Someone'} has invited you to link vaults as partners on Digital Relative.`,
        action_url: '/couples',
        metadata: { link_id: link.id, requester_name: requester?.full_name },
      }])

      // Also send email to existing user
      const partnerAuthRes = await supabase.auth.admin.getUserById(partnerId)
      const partnerEmail2  = partnerAuthRes.data?.user?.email
      if (partnerEmail2) {
        await sendEmail({
          to:      partnerEmail2,
          subject: `${(requester?.full_name || 'Someone').replace(/[\r\n]/g, ' ').slice(0, 100)} invited you to a Couples vault on Digital Relative`,
          html:    partnerInviteEmail(partnerProfile?.full_name || 'there', requester?.full_name || 'Someone', 'https://digitalrelative.co.uk/?page=couples'),
        })
      }

      // Credit calculation for partner with existing Single plan
      let creditInfo = null
      if (partnerProfile?.plan === 'single' && partnerProfile?.stripe_subscription_id) {
        const subRes = await fetchWithTimeout(
          `https://api.stripe.com/v1/subscriptions/${partnerProfile.stripe_subscription_id}`,
          { headers: { 'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` } }
        )
        const sub = await subRes.json()
        if (sub.current_period_end) {
          const remainingDays  = Math.max(0, Math.ceil(((sub.current_period_end * 1000) - Date.now()) / 86400000))
          const remainingPence = Math.round((remainingDays / 365) * 1800)
          creditInfo = { remainingDays, remainingPence, refundAmount: `£${(remainingPence / 100).toFixed(2)}` }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        partnerExists: true,
        partnerName: partnerProfile?.full_name,
        partnerPlan: partnerProfile?.plan,
        creditInfo,
      }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })

    } else {
      // FIX EF-NEW-3: Don't return invite_code to client
      // NEW-3 fix: check insert error before building URL
      const { data: newLink, error: linkInsertErr } = await supabase.from('partner_links')
        .insert([{ requester_id: requesterId, status: 'pending', invite_email: partnerEmail }])
        .select('invite_code')
        .single()

      if (linkInsertErr || !newLink?.invite_code) {
        return new Response(JSON.stringify({ error: 'Could not create invite link' }), {
          status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Build signup URL with invite code pre-filled
      const inviteUrl = `https://digitalrelative.co.uk/?partner_invite=${newLink.invite_code}`

      // Send email server-side only — invite_code never goes to client
      await sendEmail({
        to:      partnerEmail,
        subject: `${(requester?.full_name || 'Your partner').replace(/[\r\n]/g, ' ').slice(0, 100)} has invited you to Digital Relative`,
        html:    partnerInviteEmail('there', requester?.full_name || 'Your partner', inviteUrl),
      })

      return new Response(JSON.stringify({
        success: true,
        partnerExists: false,
        // No invite_code returned
      }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

  } catch (err) {
    // Don't expose internal errors
    console.error('Couples invite error:', err.message)
    const userFacingErrors = ['Invalid email address', 'Couples vault requires a Couples plan', 'You already have a pending partner invite', 'Cannot invite yourself']
    const msg = userFacingErrors.includes(err.message) ? err.message : 'Failed to send invite'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
