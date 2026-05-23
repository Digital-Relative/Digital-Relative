import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'

// Onfido identity verification Edge Function
// Handles two operations:
//   1. create_check — starts a new ID verification for a beneficiary
//   2. webhook — Onfido calls this when verification completes

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

// FIX TP-3: timeout wrapper for all third-party API calls
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

const ONFIDO_BASE       = 'https://api.eu.onfido.com/v3.6' // URL constant - not a secret
const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  // L-4 fix: read inside handler so values are fresh after secret rotation
  const ONFIDO_API_KEY       = Deno.env.get('ONFIDO_API_KEY') || ''
  const ONFIDO_WEBHOOK_TOKEN = Deno.env.get('ONFIDO_WEBHOOK_TOKEN') || ''
  const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const url = new URL(req.url)

  // ── Onfido webhook callback ──────────────────────────────────────────────
  if (url.pathname.endsWith('/webhook')) {
    // FIX EF-6: guard empty token
    if (!ONFIDO_WEBHOOK_TOKEN) {
      console.error('ONFIDO_WEBHOOK_TOKEN not configured - rejecting all webhooks')
      return new Response('Forbidden', { status: 403 })
    }

    const signature = req.headers.get('x-sha2-signature') || ''
    const rawBody   = await req.text()

    // FIX TP-1: wrap atob in try/catch — invalid base64 would throw and return 500
    let sigBytes: Uint8Array
    try {
      sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))
    } catch {
      return new Response('Forbidden', { status: 403 })
    }

    const key   = await crypto.subtle.importKey('raw', new TextEncoder().encode(ONFIDO_WEBHOOK_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(rawBody))

    if (!valid) return new Response('Forbidden', { status: 403 })

    const event = JSON.parse(rawBody)
    const checkId = event?.payload?.object?.id

    if (!checkId) return new Response('OK', { status: 200 })

    // Look up verification by check ID
    const { data: verification } = await supabase
      .from('beneficiary_verifications')
      .select('*, beneficiaries(*)')
      .eq('provider_check_id', checkId)
      .single()

    if (!verification) return new Response('OK', { status: 200 })

    const status = event?.payload?.action === 'check.completed'
      ? (event?.payload?.object?.status === 'complete' ? 'verified' : 'failed')
      : 'submitted'

    // Prevent status regression — never downgrade a verified record
    // H-2 fix: use verification.beneficiary_id (UUID), not checkId (Onfido string)
    const { data: existingStatus } = await supabase
      .from('beneficiary_verifications')
      .select('verification_status')
      .eq('beneficiary_id', verification.beneficiary_id)
      .single()
    if (existingStatus?.verification_status === 'verified' && status !== 'verified') {
      return new Response('OK', { status: 200 })
    }

    // Update verification status
    await supabase.from('beneficiary_verifications').update({
      verification_status: status,
      ...(status === 'verified' ? { verified_at: new Date().toISOString() } : {}),
      ...(status === 'failed' ? { failed_reason: event?.payload?.object?.result } : {}),
    }).eq('id', verification.id)

    if (status === 'verified') {
      // Update beneficiary to id_verified
      await supabase.from('beneficiaries').update({
        id_verified_at: new Date().toISOString(),
        status: 'id_verified',
        access_tier: 2,
      }).eq('id', verification.beneficiary_id)

      // Notify vault owner
      const { data: ben } = await supabase
        .from('beneficiaries')
        .select('user_id, name')
        .eq('id', verification.beneficiary_id)
        .single()

      if (ben) {
        await supabase.from('notifications').insert([{
          user_id: ben.user_id,
          type: 'beneficiary_accepted',
          title: 'Beneficiary verified',
          message: `${ben.name} has successfully verified their identity and has Tier 2 vault access.`,
          action_url: '/beneficiaries',
        }])
      }
    }

    return new Response('OK', { status: 200 })
  }

  // ── Create verification check ────────────────────────────────────────────
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    // FIX EF-EA-7: Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
    }
    const jwt = authHeader.slice(7)
    // FIX LO-2: use fetchWithTimeout for JWT verification
    const meRes = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!meRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
    }
    const caller = await meRes.json()
    const callerId = caller?.id

    const body = await req.json().catch(() => null)
    if (!body?.beneficiaryId || !body?.firstName || !body?.lastName || !body?.email) {
      throw new Error('Missing required fields: beneficiaryId, firstName, lastName, email')
    }

    const { beneficiaryId, firstName, lastName, email } = body

    if (!UUID_RE.test(beneficiaryId)) throw new Error('Invalid beneficiary ID')
    if (!ONFIDO_API_KEY) throw new Error('Onfido not configured')

    // Verify the beneficiary exists
    const { data: ben, error: benError } = await supabase
      .from('beneficiaries')
      .select('id, user_id, status, id_verified_at, linked_user_id')
      .eq('id', beneficiaryId)
      .single()

    if (benError || !ben) throw new Error('Beneficiary not found')
    if (ben.id_verified_at) throw new Error('Already verified')

    // FIX EF-5: verify caller is the beneficiary's linked user OR the vault owner
    const callerIsLinked = ben.linked_user_id && ben.linked_user_id === callerId
    const callerIsOwner  = ben.user_id === callerId
    if (!callerIsLinked && !callerIsOwner) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
    }

    // Rate limit: max 3 verification attempts per hour per beneficiary
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: recentAttempts } = await supabase
      .from('beneficiary_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('beneficiary_id', beneficiaryId)
      .gt('created_at', oneHourAgo)
    if ((recentAttempts ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Too many verification attempts. Please try again later.' }), {
        status: 429, headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // Reuse existing applicant_id if already created
    const { data: existingVerif } = await supabase
      .from('beneficiary_verifications')
      .select('provider_check_id')
      .eq('beneficiary_id', beneficiaryId)
      .not('provider_check_id', 'is', null)
      .single()

    let applicantId: string | null = existingVerif?.provider_check_id || null

    if (!applicantId) {
      // 1. Create Onfido applicant
      const safeFirst = firstName.trim().slice(0, 100)
      const safeLast  = lastName.trim().slice(0, 100)
      if (!safeFirst || !safeLast) throw new Error('Name is required')

      const applicantRes = await fetchWithTimeout(`${ONFIDO_BASE}/applicants`, {
        method: 'POST',
        headers: { 'Authorization': `Token token=${ONFIDO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: safeFirst, last_name: safeLast, email }),
      })
      const applicant = await applicantRes.json()
      if (!applicant.id) throw new Error('Failed to create Onfido applicant')

      // 2. Generate SDK token
      const sdkRes = await fetchWithTimeout(`${ONFIDO_BASE}/sdk_token`, {
        method: 'POST',
        headers: { 'Authorization': `Token token=${ONFIDO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicant_id: applicant.id, referrer: 'https://digitalrelative.co.uk/*' }),
      })
      const sdkToken = await sdkRes.json()

      // 3. Create verification record
      const { data: verification } = await supabase
        .from('beneficiary_verifications')
        .upsert([{
          beneficiary_id:        beneficiaryId,
          verification_status:   'pending',
          verification_provider: 'onfido',
          provider_check_id:     applicant.id,
        }], { onConflict: 'beneficiary_id' })
        .select().single()

      return new Response(JSON.stringify({
        sdkToken: sdkToken.token,
        applicantId: applicant.id,
        verificationId: verification?.id,
      }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })

    } else {
      // Reuse existing applicant — generate a fresh SDK token only
      const sdkRes = await fetchWithTimeout(`${ONFIDO_BASE}/sdk_token`, {
        method: 'POST',
        headers: { 'Authorization': `Token token=${ONFIDO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicant_id: applicantId, referrer: 'https://digitalrelative.co.uk/*' }),
      })
      const sdkToken = await sdkRes.json()
      return new Response(JSON.stringify({
        sdkToken: sdkToken.token,
        applicantId,
      }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

  } catch (err) {
    console.error('Verify identity error:', err.message)
    // FIX EF-VI-1: Never expose internal Onfido errors
    const safeMsg = err.message === 'Invalid beneficiary ID' ? err.message : 'Verification could not be started. Please try again.'
    return new Response(JSON.stringify({ error: safeMsg }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
