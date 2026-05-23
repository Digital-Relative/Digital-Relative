import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const UUID_RE        = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ONFIDO_BASE    = 'https://api.eu.onfido.com/v3.6'
const APP_URL        = 'https://digitalrelative.co.uk'
const ADMIN_EMAIL    = 'admin@digitalrelative.co.uk'

// FIX EF-EA-8: Explicit extension map
const TYPE_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}

// FIX TP-EA-3: HTML encode user content in emails
function he(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// FIX EF-EA-2: Proper constant-time admin token verification

// FIX EF-EA-3: Safe JWT verification returning user ID
async function verifyJwt(supabase: any, authHeader: string): Promise<string | null> {
  if (!authHeader.startsWith('Bearer ')) return null
  const jwt = authHeader.slice(7)
  try {
    const res = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!res.ok) return null
    const user = await res.json()
    return UUID_RE.test(user.id) ? user.id : null
  } catch {
    return null
  }
}

// FIX EF-EA-5: Verify magic bytes of uploaded certificate
function verifyMagicBytes(bytes: Uint8Array, fileType: string): boolean {
  const sigs: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46],
    'image/jpeg':      [0xFF, 0xD8, 0xFF],
    'image/png':       [0x89, 0x50, 0x4E, 0x47],
    'image/webp':      [0x52, 0x49, 0x46, 0x46],
  }
  const expected = sigs[fileType]
  if (!expected) return false
  return expected.every((b, i) => bytes[i] === b)
}

// FIX TP-3: Timeout wrapper for all third-party API calls
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

// FIX BL-EA-1: Generate time-limited single-use review token (not the ADMIN_TOKEN)
function generateReviewToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
      const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // FIX EF-2: Read raw body first so webhook HMAC verification gets original bytes
  const rawBody = await req.text().catch(() => '')
  let body: any = null
  try { body = JSON.parse(rawBody) } catch { /* will be caught below */ }

  try {
    if (!body?.action) throw new Error('Missing action')

    // ── SUBMIT ──────────────────────────────────────────────────────────────
    if (body.action === 'submit') {
      // FIX EF-EA-1 & EF-EA-3: Verify JWT and extract caller's user ID
      const callerId = await verifyJwt(supabase, req.headers.get('Authorization') || '')
      if (!callerId) {
        return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
      }

      const { beneficiaryId, vaultOwnerId, certificateBase64, fileType } = body

      if (!UUID_RE.test(beneficiaryId) || !UUID_RE.test(vaultOwnerId)) throw new Error('Invalid IDs')
      if (!certificateBase64) throw new Error('No certificate provided')

      const allowedTypes = Object.keys(TYPE_TO_EXT)
      if (!allowedTypes.includes(fileType)) throw new Error('Invalid file type. Please upload PDF, JPG, PNG, or WebP.')
      if (certificateBase64.length > 35_000_000) throw new Error('File too large - maximum 25MB')

      // FIX EF-EA-1: Verify caller's user ID matches the beneficiary's linked_user_id
      const { data: ben, error: benError } = await supabase
        .from('beneficiaries')
        .select('id, user_id, name, email, is_executor, status, linked_user_id')
        .eq('id', beneficiaryId)
        .eq('user_id', vaultOwnerId)
        .eq('is_executor', true)
        .single()

      if (benError || !ben) throw new Error('Only a designated executor can submit an access request')

      // FIX EF-EA-1: Caller must be the linked account of this beneficiary
      if (ben.linked_user_id !== callerId) {
        throw new Error('Unauthorised - you are not the linked account for this beneficiary')
      }

      if (!['email_confirmed', 'id_verified', 'access_granted'].includes(ben.status)) {
        throw new Error('Executor must confirm their email before submitting')
      }

      // Check no active request
      const { data: existingReq } = await supabase
        .from('access_requests').select('id')
        .eq('vault_owner_id', vaultOwnerId)
        .not('status', 'in', '("manually_rejected","owner_notified")')
        .maybeSingle()

      if (existingReq) throw new Error('An active access request already exists for this vault')

      // FIX BL-3: Enforce 24h cooldown after rejection/denial
      const { data: recentRejected } = await supabase
        .from('access_requests')
        .select('updated_at')
        .eq('vault_owner_id', vaultOwnerId)
        .in('status', ['manually_rejected', 'owner_notified'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentRejected) {
        const cooldownMs = 24 * 3600 * 1000
        const timeSince  = Date.now() - new Date(recentRejected.updated_at).getTime()
        if (timeSince < cooldownMs) {
          const hoursLeft = Math.ceil((cooldownMs - timeSince) / 3600000)
          throw new Error(`Please wait ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} before resubmitting`)
        }
      }

      // Decode and verify magic bytes
      // FIX CR-3: atob throws on invalid base64 — catch it
      let fileBytes: Uint8Array
      try {
        fileBytes = Uint8Array.from(atob(certificateBase64), c => c.charCodeAt(0))
      } catch {
        throw new Error('Invalid file type. Please upload PDF, JPG, PNG, or WebP.')
      }
      if (!verifyMagicBytes(fileBytes, fileType)) {
        throw new Error('File content does not match the declared type. Please upload a real PDF or image.')
      }

      // FIX EF-EA-8: Use whitelisted extension
      const ext      = TYPE_TO_EXT[fileType]
      const fileName = `${vaultOwnerId}/${Date.now()}-certificate.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('death-certificates')
        .upload(fileName, fileBytes, { contentType: fileType, upsert: false })

      if (uploadError) throw new Error('Failed to store certificate securely')

      // FIX BL-EA-1: Generate a per-request review token (NOT the ADMIN_TOKEN)
      const reviewToken = generateReviewToken()

      const { data: request, error: reqError } = await supabase
        .from('access_requests')
        .insert([{
          vault_owner_id:   vaultOwnerId,
          submitted_by:     beneficiaryId,
          certificate_path: fileName,
          status:           'pending',
          review_token:     reviewToken, // stored for admin link verification
        }])
        .select().single()

      if (reqError) throw reqError

      // Notify vault owner
      const ownerAuth  = await supabase.auth.admin.getUserById(vaultOwnerId)
      const ownerEmail = ownerAuth.data?.user?.email
      const ownerName  = ownerAuth.data?.user?.user_metadata?.full_name || 'there'

      if (ownerEmail) {
        await sendEmail({
          to:      ownerEmail,
          subject: '⚠️ Digital Relative - Emergency access request submitted',
          html:    ownerAliveNotificationEmail(ownerName, ben.name, request.id, `${APP_URL}/?page=settings&deny_request=${request.id}`),
        })
        await supabase.from('access_requests')
          .update({ owner_notified_at: new Date().toISOString() })
          .eq('id', request.id)
      }

      // Start Onfido or fall to manual review
      // Read ONFIDO_API_KEY inside handler (not module level) for fresh value after rotation
      const ONFIDO_API_KEY = Deno.env.get('ONFIDO_API_KEY') || ''
      if (ONFIDO_API_KEY) {
        await startOnfidoDocumentCheck(ONFIDO_API_KEY, supabase, request.id, vaultOwnerId, ownerName, fileName, fileType)
      } else {
        await supabase.from('access_requests').update({ status: 'manual_review' }).eq('id', request.id)
        // FIX EF-EA-6: Send review URL with per-request token, NOT ADMIN_TOKEN
        await notifyAdminForReview(supabase, request.id, ben.name, reviewToken)
      }

      return new Response(JSON.stringify({
        success: true,
        requestId: request.id,
        message: 'Access request submitted. The vault owner has been notified and your certificate is being verified.',
      }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // ── ADMIN GET (fetch request details) ────────────────────────────────────
    if (body.action === 'admin_get') {
      // FIX EF-EA-4: Implement the missing admin_get action
      const adminToken = req.headers.get('x-admin-token') || ''
      const { requestId } = body
      if (!UUID_RE.test(requestId)) throw new Error('Invalid request ID')

      // Verify against per-request review_token stored in DB
      const { data: request } = await supabase
        .from('access_requests')
        .select('*, submitted_by(name, email)')
        .eq('id', requestId)
        .single()

      if (!request) throw new Error('Request not found')

      // Verify review token matches — constant-time
      const enc  = new TextEncoder()
      const tokenA = enc.encode(adminToken)
      const tokenB = enc.encode(request.review_token || '')
      // FIX EF-3: return 403 directly, don't throw (throwing returns 400)
      if (tokenA.length !== tokenB.length) return new Response('Forbidden', { status: 403 })
      let diff = 0
      for (let i = 0; i < tokenA.length; i++) diff |= tokenA[i] ^ tokenB[i]
      if (diff !== 0) return new Response('Forbidden', { status: 403 })

      // L-4 fix: return signed URL for certificate instead of routing through non-existent edge function
      let certificateUrl: string | null = null
      if (request.certificate_path) {
        const { data: signed } = await supabase.storage
          .from('death-certificates')
          .createSignedUrl(request.certificate_path, 300) // 5-minute signed URL
        certificateUrl = signed?.signedUrl || null
      }

      return new Response(JSON.stringify({ request, certificateUrl }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── ADMIN REVIEW (approve or reject) ─────────────────────────────────────
    if (body.action === 'admin_review') {
      // FIX EF-EA-2 & EF-EA-6: Use per-request token, not global ADMIN_TOKEN
      const adminToken = req.headers.get('x-admin-token') || ''
      const { requestId, decision, adminNotes } = body
      if (!UUID_RE.test(requestId)) throw new Error('Invalid request ID')
      if (!['approve', 'reject'].includes(decision)) throw new Error('Invalid decision')

      const { data: request } = await supabase
        .from('access_requests')
        .select('*, submitted_by:beneficiaries!submitted_by(name, email)')
        .eq('id', requestId)
        .single()

      if (!request) throw new Error('Request not found')

      // Verify per-request review token (constant-time)
      const enc = new TextEncoder()
      const tA  = enc.encode(adminToken)
      const tB  = enc.encode(request.review_token || '')
      // FIX EF-3: return 403 directly
      if (tA.length !== tB.length || !request.review_token) return new Response('Forbidden', { status: 403 })
      let diff = 0
      for (let i = 0; i < tA.length; i++) diff |= tA[i] ^ tB[i]
      if (diff !== 0) return new Response('Forbidden', { status: 403 })

      // FIX DB-EA-2: Check request is in a valid state for review
      if (['manually_approved', 'access_granted', 'onfido_verified'].includes(request.status)) {
        throw new Error('Request has already been processed')
      }

      if (decision === 'approve') {
        // HIGH-2 fix: admin approval must go through the same 48-hour hold as Onfido
        // Do NOT call grantVaultAccess directly — set access_grant_after and let scheduler process it
        const holdUntil = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        await supabase.from('access_requests').update({
          status: 'manually_approved', reviewed_by_admin: true,
          admin_notes: adminNotes || null,
          review_token: null, // Invalidate token after use
          access_grant_after: holdUntil,
        }).eq('id', requestId)
      } else {
        await supabase.from('access_requests').update({
          status: 'manually_rejected', reviewed_by_admin: true,
          rejected_reason: adminNotes || 'Document could not be verified',
          admin_notes: adminNotes || null,
          review_token: null,
        }).eq('id', requestId)

        const ben = request['submitted_by']
        if (ben?.email) {
          await sendEmail({
            to:      ben.email,
            subject: 'Digital Relative - Access request update',
            html:    rejectionEmail(ben.name || 'there', adminNotes || 'We were unable to verify the document provided.'),
          })
        }

        // FIX MISC-3: Clean up certificate from storage after rejection
        if (request.certificate_path) {
          await supabase.storage.from('death-certificates').remove([request.certificate_path])
        }
      }

      await supabase.from('admin_actions').insert([{
        action: `manual_${decision}`, request_id: requestId, admin_note: adminNotes || null,
      }])

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── OWNER RESPOND ─────────────────────────────────────────────────────────
    if (body.action === 'owner_respond') {
      // FIX EF-EA-3: Safe JWT verification
      const callerId = await verifyJwt(supabase, req.headers.get('Authorization') || '')
      if (!callerId) {
        return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
      }

      const { requestId, response } = body
      if (!UUID_RE.test(requestId)) throw new Error('Invalid request ID')
      if (!['alive_deny', 'alive_approve'].includes(response)) throw new Error('Invalid response')

      const { data: request } = await supabase
        .from('access_requests').select('*')
        .eq('id', requestId)
        .eq('vault_owner_id', callerId) // Must be the vault owner
        .single()

      if (!request) throw new Error('Request not found or you are not authorised')

      // FIX DB-EA-2: Only allow response if request is in a valid state
      if (['manually_approved', 'access_granted', 'manually_rejected'].includes(request.status)) {
        throw new Error('Request has already been resolved')
      }

      await supabase.from('access_requests').update({
        owner_response:     response,
        owner_responded_at: new Date().toISOString(),
        status: response === 'alive_approve' ? 'manually_approved' : 'owner_notified',
      }).eq('id', requestId)

      if (response === 'alive_approve') {
        // Apply 1-hour minimum hold even for owner-approved access
        // Prevents compromised owner account from immediately granting access to accomplice
        const holdUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        await supabase.from('access_requests')
          .update({ access_grant_after: holdUntil, status: 'manually_approved' })
          .eq('id', request.id)
        // Actual grant happens via scheduler when hold expires
      } else {
        // FIX MISC-3: Clean up certificate when denied
        if (request.certificate_path) {
          await supabase.storage.from('death-certificates').remove([request.certificate_path])
        }
      }

      // Record owner check-in
      await supabase.from('profiles').update({ last_checkin: new Date().toISOString() }).eq('id', callerId)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── ONFIDO WEBHOOK ────────────────────────────────────────────────────────
    // FIX BL-EA-4: Handle Onfido document check results for death certificates
    if (body.action === 'onfido_webhook') {
      const onfidoWebhookToken = Deno.env.get('ONFIDO_WEBHOOK_TOKEN') || ''
      // L-6 fix: reject all webhook calls when token is not configured
      if (!onfidoWebhookToken) {
        console.error('ONFIDO_WEBHOOK_TOKEN not configured - rejecting webhook')
        return new Response('Forbidden', { status: 403 })
      }
      const signature = req.headers.get('x-sha2-signature') || ''

      // HIGH-2 fix: signature must be present — reject immediately if absent
      if (!signature) {
        return new Response('Unauthorised', { status: 401 })
      }

      // MED-3 fix: both guards above guarantee these are truthy — remove redundant condition
      {
        // FIX MD-3: atob throws on invalid base64 — return 403
        let sigBuf: Uint8Array
        try {
          sigBuf = Uint8Array.from(atob(signature), c => c.charCodeAt(0))
        } catch {
          return new Response('Forbidden', { status: 403 })
        }
        const key   = await crypto.subtle.importKey('raw', new TextEncoder().encode(onfidoWebhookToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
        const valid = await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(rawBody))
        if (!valid) return new Response('Forbidden', { status: 403 })
      }

      const checkId = body?.payload?.object?.id
      if (!checkId) return new Response('OK', { status: 200 })

      const { data: request } = await supabase
        .from('access_requests').select('*')
        .eq('onfido_check_id', checkId)
        .single()

      if (!request) return new Response('OK', { status: 200 })

      const onfidoResult  = body?.payload?.object?.result
      const onfidoStatus  = body?.payload?.object?.status
      const isComplete    = body?.payload?.action === 'check.completed'

      if (!isComplete) return new Response('OK', { status: 200 })

      if (onfidoResult === 'clear') {
        // Check if the submitting beneficiary has id_only access_requirement
        // If so, grant access immediately without requiring a death certificate
        const { data: submittingBen } = await supabase
          .from('beneficiaries')
          .select('access_requirement')
          .eq('id', request?.submitted_by)
          .single()

        // Look up the beneficiary name for the notification email
        const submitterBenName = (await supabase.from('beneficiaries').select('name').eq('id', request.submitted_by).single())?.data?.name || 'A beneficiary'

        if (submittingBen?.access_requirement === 'id_only') {
          // HIGH-2 fix: id_only still goes through the 48-hour hold via the scheduler
          // MED-3 fix: notify vault owner so they have the denial window
          const idOnlyGrantAfter = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
          await supabase.from('access_requests')
            .update({ status: 'manually_approved', access_grant_after: idOnlyGrantAfter })
            .eq('id', request.id)
          // Notify vault owner — they have 48 hours to deny
          // CRIT-1 fix: pass correct 3 args; denyUrl points to app page where owner can deny
          const { data: ownerAuth } = await supabase.auth.admin.getUserById(request.vault_owner_id)
          const ownerEmail   = ownerAuth?.user?.email
          const rawOwnerName = ownerAuth?.user?.user_metadata?.full_name || 'there'
          const ownerName    = rawOwnerName.replace(/[\r\n]/g, ' ').slice(0, 100)
          const APP_URL_NOTIFY = 'https://digitalrelative.co.uk'
          // Deny URL goes to the app's emergency access settings page — user signs in and denies
          const denyUrl = `${APP_URL_NOTIFY}/?page=settings&deny_request=${request.id}`
          if (ownerEmail) {
            await sendEmail({
              to:      ownerEmail,
              subject: '⚠️ Digital Relative - Emergency access request submitted',
              html:    ownerAliveNotificationEmail(ownerName, submitterBenName || 'A beneficiary', request.id, denyUrl),
            }).catch(() => {})
          }
          return new Response('OK', { status: 200 })
        }

        // FIX BL-EA-1: Add mandatory hold period — do NOT grant immediately
        // Mark as onfido_verified and schedule access grant after hold period
        // FIX DB-2: Set access_grant_after for 48h mandatory hold
        const grantAfter = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
        await supabase.from('access_requests').update({
          status:            'onfido_verified',
          onfido_confidence:  'high',
          access_grant_after: grantAfter,
        }).eq('id', request.id)

        // FIX MISC-3: Clean up certificate after successful verification
        if (request.certificate_path) {
          await supabase.storage.from('death-certificates').remove([request.certificate_path])
        }

        // Notify admin and owner that verification succeeded (owner has 48h to deny)
        const reviewToken = generateReviewToken()
        await supabase.from('access_requests').update({ review_token: reviewToken }).eq('id', request.id)
        await notifyAdminForReview(supabase, request.id, 'Onfido-verified', reviewToken)
      } else {
        // Low confidence — escalate to manual review
        await supabase.from('access_requests').update({
          status: 'manual_review', onfido_confidence: 'low',
        }).eq('id', request.id)
        const reviewToken = generateReviewToken()
        await supabase.from('access_requests').update({ review_token: reviewToken }).eq('id', request.id)
        await notifyAdminForReview(supabase, request.id, 'Onfido-low-confidence', reviewToken)
      }

      return new Response('OK', { status: 200 })
    }

    throw new Error('Unknown action')

  } catch (err) {
    console.error('Emergency access error:', err.message)
    const safeMessages = [
      'Only a designated executor can submit',
      'An active access request already exists',
      'Invalid file type',
      'File too large',
      'Executor must confirm their email',
      'Invalid IDs',
      'File content does not match',
      'Request has already been processed',
      'Request has already been resolved',
    ]
    const msg = safeMessages.some(s => err.message.includes(s)) ? err.message : 'Request failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function startOnfidoDocumentCheck(
  apiKey: string,
  supabase: any, requestId: string, vaultOwnerId: string,
  ownerName: string, filePath: string, fileType: string
) {
  try {
    const [firstName, ...rest] = ownerName.split(' ')
    const applicantRes = await fetchWithTimeout(`${ONFIDO_BASE}/applicants`, {
      method: 'POST',
      headers: { 'Authorization': `Token token=${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName || 'Unknown', last_name: rest.join(' ') || 'Unknown' }),
    })
    const applicant = await applicantRes.json()
    if (!applicant.id) throw new Error('Onfido applicant creation failed')

    const { data: fileData } = await supabase.storage.from('death-certificates').download(filePath)
    const formData = new FormData()
    formData.append('applicant_id', applicant.id)
    formData.append('type', 'unknown')
    formData.append('file', new Blob([await fileData.arrayBuffer()], { type: fileType }), 'certificate')

    const docRes = await fetchWithTimeout(`${ONFIDO_BASE}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Token token=${apiKey}` },
      body: formData,
    })
    const doc = await docRes.json()
    if (!doc.id) throw new Error('Document upload failed')

    const checkRes = await fetchWithTimeout(`${ONFIDO_BASE}/checks`, {
      method: 'POST',
      headers: { 'Authorization': `Token token=${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicant_id: applicant.id, report_names: ['document'], document_ids: [doc.id] }),
    })
    const check = await checkRes.json()
    await supabase.from('access_requests').update({ status: 'onfido_processing', onfido_check_id: check.id }).eq('id', requestId)

  } catch (err) {
    console.error('Onfido document check failed:', err.message)
    await supabase.from('access_requests').update({ status: 'manual_review' }).eq('id', requestId)
    const reviewToken = generateReviewToken()
    await supabase.from('access_requests').update({ review_token: reviewToken }).eq('id', requestId)
    await notifyAdminForReview(supabase, requestId, 'Onfido-error', reviewToken)
  }
}

async function grantVaultAccess(supabase: any, request: any) {
  const { vault_owner_id } = request
  // HIGH-1 fix: only grant beneficiaries whose requirement is satisfied by a completed verification
  // trust_only beneficiaries are granted at acceptance time, not here
  const { data: bens } = await supabase
    .from('beneficiaries')
    .select('id, email, name, invite_token, id_verified_at')
    .eq('user_id', vault_owner_id)
    .in('status', ['email_confirmed', 'id_verified'])
    .in('access_requirement', ['death_certificate', 'id_only'])

  const ownerAuth = await supabase.auth.admin.getUserById(vault_owner_id)
  const ownerName = ownerAuth.data?.user?.user_metadata?.full_name || 'Your family member'

  for (const ben of bens ?? []) {
    const newTier    = ben.id_verified_at ? 2 : 1
    const freshToken = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')
    // LOW-1 fix: single atomic update — prevents orphaned access_granted with null token
    await supabase.from('beneficiaries').update({
      status: 'access_granted', access_tier: newTier, emergency_access_token: freshToken,
    }).eq('id', ben.id)
    const accessUrl = `${APP_URL}/beneficiary?token=${freshToken}`

    await sendEmail({
      to:      ben.email,
      subject: `Access to ${he(ownerName)}'s Digital Relative vault has been granted`,
      html:    accessGrantedEmail(ben.name || 'there', ownerName, accessUrl, newTier),
    })

    await supabase.from('notifications').insert([{
      user_id:    vault_owner_id,
      type:       'vault_access_granted',
      title:      'Vault access granted',
      message:    `${he(ben.name)} has been granted ${newTier === 2 ? 'full' : 'Tier 1'} access to your vault.`,
      action_url: '/beneficiaries',
    }]).catch(() => {})
  }

  await supabase.from('access_requests').update({ status: 'access_granted' }).eq('id', request.id)
}

async function notifyAdminForReview(supabase: any, requestId: string, submitterName: string, reviewToken: string) {
  // FIX EF-EA-6: Use per-request token in URL, not global ADMIN_TOKEN
  const reviewUrl = `${APP_URL}/admin/review?request=${requestId}&token=${reviewToken}`
  await sendEmail({
    to:      ADMIN_EMAIL,
    subject: `⚠️ Manual review required - Death certificate access request`,
    html:    adminReviewEmail(requestId, he(submitterName), reviewUrl),
  })
}

// ── Email templates ──────────────────────────────────────────────────────────
const GOLD = '#c9a84c', TEXT = '#dde5ee', MUTED = '#7a93aa'
const layout = (content: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Digital Relative</title></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#0d1b2a;margin:0;padding:0;">
<div style="max-width:560px;margin:40px auto;padding:40px 36px;background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);">
  <div style="text-align:center;margin-bottom:28px;"><div style="font-family:Georgia,serif;font-size:22px;color:${GOLD};font-weight:600;">Digital Relative</div></div>
  ${content}
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:11px;color:${MUTED};">Digital Relative · security@digitalrelative.co.uk</div>
</div></body></html>`

function ownerAliveNotificationEmail(ownerName: string, submitterName: string, requestId: string, denyUrl?: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">⚠️ Emergency access request</h1>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Hi ${he(ownerName)},</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;"><strong style="color:#f0ece2;">${he(submitterName)}</strong> has submitted a request for emergency access to your Digital Relative vault.</p>
    <div style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:14px;color:${TEXT};margin:0 0 ${denyUrl ? '14px' : '0'};line-height:1.7;"><strong>If you are alive and this is incorrect</strong>, deny this request immediately using the button below - or sign in to Digital Relative and go to Settings.</p>
      ${denyUrl ? `<div style="text-align:center;"><a href="${denyUrl}" style="display:inline-block;background:#e05252;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">I am alive - deny this request</a></div>` : ''}
    </div>
    <p style="font-size:13px;color:${MUTED};line-height:1.7;">We have a mandatory 48-hour review period before any access is granted. You have time to act.</p>
    <p style="font-size:13px;color:${MUTED};line-height:1.7;">Reference: ${he(requestId)}</p>
  `)
}

function adminReviewEmail(requestId: string, submitterName: string, reviewUrl: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Manual review required</h1>
    <p style="font-size:14px;color:${TEXT};"><strong>Submitted by:</strong> ${submitterName}</p>
    <p style="font-size:14px;color:${TEXT};"><strong>Request ID:</strong> ${requestId}</p>
    <p style="font-size:13px;color:${MUTED};">This link expires after use. Do not forward this email.</p>
    <div style="text-align:center;margin:24px 0;"><a href="${reviewUrl}" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;">Review request →</a></div>
  `)
}

function accessGrantedEmail(benName: string, ownerName: string, accessUrl: string, tier: number): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Vault access granted</h1>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Dear ${he(benName)},</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Access to <strong style="color:#f0ece2;">${he(ownerName)}</strong>'s Digital Relative vault has been verified and granted.</p>
    ${tier === 1
      ? `<p style="font-size:14px;color:${TEXT};line-height:1.7;">You have <strong>Tier 1 access</strong> - the guidance ${he(ownerName)} prepared. For passwords and documents, complete a brief identity check.</p>`
      : `<p style="font-size:14px;color:${TEXT};line-height:1.7;">You have <strong>full access</strong> to the vault contents.</p>`}
    <div style="text-align:center;margin:24px 0;"><a href="${accessUrl}" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;">Access vault →</a></div>
  `)
}

function rejectionEmail(benName: string, reason: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Access request update</h1>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Dear ${he(benName)},</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">We were unable to approve your request at this time.</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;"><strong>Reason:</strong> ${he(reason)}</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Contact <a href="mailto:support@digitalrelative.co.uk" style="color:${GOLD};">support@digitalrelative.co.uk</a> for assistance.</p>
  `)
}
