import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'
import { beneficiaryInviteEmail, newBeneficiaryNotificationEmail } from '../_shared/emails.ts'

const ALLOWED_ORIGINS = new Set([
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
  'https://legatum-chi.vercel.app',
  'https://digital-relative.vercel.app',
])

function getCorsHeaders(origin: string): Record<string, string> {
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

const APP_URL = 'https://digitalrelative.co.uk'

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 })

  // Verify JWT — only authenticated vault owners can resend
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Verify the JWT and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    const body = await req.json().catch(() => null)
    if (!body?.beneficiaryId) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    const { beneficiaryId, action } = body

    if (!/^[0-9a-f-]{36}$/.test(beneficiaryId)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Handle trust_only acceptance - grant access immediately using service role
    if (action === 'accept_trust_only') {
      const { data: ben } = await supabase
        .from('beneficiaries')
        .select('id, user_id, linked_user_id, access_requirement, status')
        .eq('id', beneficiaryId)
        .eq('linked_user_id', user.id) // must be the linked beneficiary accepting
        .eq('status', 'invited')
        .single()

      if (!ben) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...hdrs, 'Content-Type': 'application/json' } })
      }

      if (ben.access_requirement !== 'trust_only') {
        return new Response(JSON.stringify({ error: 'This beneficiary requires additional verification' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
      }

      // Grant access immediately using service role (bypasses RLS restriction)
      // LOW-4 fix: repeat ownership filter on UPDATE as defence-in-depth
      await supabase.from('beneficiaries')
        .update({ status: 'access_granted' })
        .eq('id', beneficiaryId)
        .eq('linked_user_id', user.id)

      return new Response(JSON.stringify({ success: true, status: 'access_granted' }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Fetch beneficiary with ownership check
    const { data: beneficiary } = await supabase
      .from('beneficiaries')
      .select('id, user_id, name, email, invite_token, status, resend_requested_at')
      .eq('id', beneficiaryId)
      .eq('user_id', user.id) // ownership check
      .eq('status', 'invited')
      .single()

    if (!beneficiary) {
      return new Response(JSON.stringify({ error: 'Not found or already confirmed' }), { status: 404, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Rate limit: 1 hour between resends (skip for initial send)
    if (action !== 'send_initial_invite' && beneficiary.resend_requested_at) {
      const lastResend = new Date(beneficiary.resend_requested_at).getTime()
      if (Date.now() - lastResend < 3_600_000) {
        return new Response(JSON.stringify({ error: 'Please wait before resending' }), { status: 429, headers: { ...hdrs, 'Content-Type': 'application/json' } })
      }
    }

    // Get owner name
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const ownerName = (ownerProfile?.full_name || 'Someone').replace(/[\r\n]/g, ' ').slice(0, 100)
    const inviteUrl = `${APP_URL}/beneficiary?token=${beneficiary.invite_token}`

    // Send invite email to beneficiary
    await sendEmail({
      to:      beneficiary.email,
      subject: `${ownerName} has invited you to Digital Relative`,
      html:    beneficiaryInviteEmail(beneficiary.name, ownerName, inviteUrl),
    })

    // Notify the vault owner so they can spot unauthorised additions
    const ownerEmail = user.email || ''
    if (ownerEmail) {
      await sendEmail({
        to:      ownerEmail,
        subject: `New beneficiary added to your Digital Relative vault`,
        html:    newBeneficiaryNotificationEmail(
          ownerName,
          beneficiary.name,
          beneficiary.email,
          `${APP_URL}/?page=beneficiaries`,
        ),
      }).catch(() => {}) // best-effort - never block the invite
    }

    // Update resend timestamp
    await supabase.from('beneficiaries').update({ resend_requested_at: new Date().toISOString() }).eq('id', beneficiaryId)

    return new Response(JSON.stringify({ success: true }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })

  } catch {
    return new Response(JSON.stringify({ error: 'Failed to resend invite' }), { status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }
})
