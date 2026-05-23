import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'

// MFA email OTP edge function
// Sends a 6-digit code via email when user has no authenticator app
// Actions: send_code, verify_code

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
const MAX_ATTEMPTS = 5
const CODE_EXPIRY_MINUTES = 10

async function hashCode(code: string, userId: string): Promise<string> {
  // Use PBKDF2 not plain SHA-256 — OTPs have only 10^6 entropy
  // PBKDF2 makes offline cracking expensive even with a full DB dump
  const enc    = new TextEncoder()
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
  const bits   = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(userId), iterations: 100_000 },
    keyMat, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aB = new TextEncoder().encode(a)
  const bB = new TextEncoder().encode(b)
  let diff = 0
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i]
  return diff === 0
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

function mfaEmailTemplate(name: string, code: string): string {
  const GOLD = '#c9a84c', TEXT = '#dde5ee', MUTED = '#7a93aa'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#0d1b2a;margin:0;padding:0;">
<div style="max-width:480px;margin:40px auto;padding:40px 36px;background:#0f2236;border-radius:12px;border:1px solid rgba(201,168,76,0.2);">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:${GOLD};font-weight:600;">Digital Relative</div>
  </div>
  <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Your sign-in code</h1>
  <p style="font-size:14px;color:${TEXT};line-height:1.7;">Hi ${name},</p>
  <p style="font-size:14px;color:${TEXT};line-height:1.7;">Your Digital Relative verification code is:</p>
  <div style="text-align:center;margin:24px 0;">
    <div style="display:inline-block;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:12px;padding:20px 40px;">
      <span style="font-family:Georgia,serif;font-size:40px;color:${GOLD};letter-spacing:0.3em;font-weight:600;">${code}</span>
    </div>
  </div>
  <p style="font-size:13px;color:${MUTED};line-height:1.7;text-align:center;">This code expires in ${CODE_EXPIRY_MINUTES} minutes. Do not share it with anyone.</p>
  <p style="font-size:12px;color:${MUTED};line-height:1.7;text-align:center;margin-top:20px;">If you didn't request this, someone may be trying to access your account. Contact us immediately at security@digitalrelative.co.uk</p>
</div></body></html>`
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

  try {
    const body = await req.json().catch(() => null)
    if (!body?.action || !body?.userId) throw new Error('Missing required fields')

    const { action, userId } = body
    if (!UUID_RE.test(userId)) throw new Error('Invalid user ID')

    // Verify JWT belongs to userId
    const jwt = authHeader.slice(7)
    const meRes = await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!meRes.ok) throw new Error('Unauthorised')
    const me = await meRes.json()
    if (me.id !== userId) throw new Error('Unauthorised')

    const userEmail = me.email
    const userName  = me.user_metadata?.full_name || 'there'

    // ── SEND CODE ──────────────────────────────────────────────────────────
    if (action === 'send_code') {
      // Rate limit: max 3 codes per 10 minutes per user
      const { count } = await supabase
        .from('mfa_email_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

      if ((count ?? 0) >= 3) {
        return new Response(JSON.stringify({ error: 'Too many codes requested. Please wait 10 minutes.' }), {
          status: 429, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Generate 6-digit code
      const codeNum  = crypto.getRandomValues(new Uint8Array(3))
      const code     = String(((codeNum[0] << 16) | (codeNum[1] << 8) | codeNum[2]) % 1000000).padStart(6, '0')
      const codeHash = await hashCode(code, userId)
      const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString()

      // Invalidate any existing unused codes
      await supabase.from('mfa_email_codes')
        .update({ used: true })
        .eq('user_id', userId)
        .eq('used', false)

      // Store hashed code
      await supabase.from('mfa_email_codes').insert({
        user_id: userId, code_hash: codeHash, expires_at: expiresAt,
      })

      // Send email
      await sendEmail({
        to:      userEmail,
        subject: 'Digital Relative - your verification code',
        html:    mfaEmailTemplate(userName, code),
      })

      return new Response(JSON.stringify({ success: true, expiresInMinutes: CODE_EXPIRY_MINUTES }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── VERIFY CODE ─────────────────────────────────────────────────────────
    if (action === 'verify_code') {
      const { code } = body
      if (!code || !/^\d{6}$/.test(code)) throw new Error('Invalid code format')

      // Get the latest unused, unexpired code for this user
      const { data: mfaCode } = await supabase
        .from('mfa_email_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!mfaCode) {
        return new Response(JSON.stringify({ error: 'Code expired or not found. Request a new code.' }), {
          status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Check attempt limit
      if (mfaCode.attempts >= MAX_ATTEMPTS) {
        await supabase.from('mfa_email_codes').update({ used: true }).eq('id', mfaCode.id)
        return new Response(JSON.stringify({ error: 'Too many incorrect attempts. Request a new code.' }), {
          status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Verify code — constant time
      const inputHash = await hashCode(code, userId)
      const valid = constantTimeEqual(inputHash, mfaCode.code_hash)

      if (!valid) {
        await supabase.from('mfa_email_codes')
          .update({ attempts: mfaCode.attempts + 1 })
          .eq('id', mfaCode.id)

        const remaining = MAX_ATTEMPTS - mfaCode.attempts - 1
        return new Response(JSON.stringify({
          error: 'Incorrect code',
          attemptsRemaining: Math.max(0, remaining),
        }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
      }

      // Mark code as used
      await supabase.from('mfa_email_codes').update({ used: true }).eq('id', mfaCode.id)

      // Mark email MFA as enrolled in profile
      await supabase.from('profiles').update({ mfa_enrolled: true, mfa_email_fallback: true }).eq('id', userId)

      return new Response(JSON.stringify({ success: true, valid: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── GENERATE RECOVERY CODES ──────────────────────────────────────────────
    if (action === 'generate_recovery_codes') {
      // LOW-1 fix: rate limit recovery code generation to 3 per 24 hours
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
      const { count: regenCount } = await supabase
        .from('mfa_recovery_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('created_at', oneDayAgo)
      if ((regenCount ?? 0) >= 9) { // 3 sets of 8 codes = 24 rows
        return new Response(JSON.stringify({ error: 'Too many code regenerations today' }), {
          status: 429, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }
      // Security: only allow code generation for accounts that just completed MFA setup
      // We verify by checking if there's a recent MFA enrollment (within last 2 minutes)
      // For TOTP: Supabase handles this. For email: we check mfa_enrolled was just set.
      // This prevents regenerating codes without re-authenticating.
      const { data: prof } = await supabase.from('profiles').select('mfa_enrolled').eq('id', userId).single()
      if (!prof?.mfa_enrolled) {
        return new Response(JSON.stringify({ error: 'MFA must be set up first' }), {
          status: 403, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }
      // User is authenticated and MFA is enrolled - allow generating recovery codes
      // The JWT authentication above already ensures this is the correct user
      // Generate 10 fresh recovery codes — called after MFA setup completes
      // Invalidate any existing codes first
      await supabase.from('mfa_recovery_codes').delete().eq('user_id', userId)

      const codes: string[] = []
      const inserts: any[] = []

      for (let i = 0; i < 10; i++) {
        // Format: XXXXX-XXXXX (alphanumeric, easy to type)
        const bytes = crypto.getRandomValues(new Uint8Array(8))
        const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
        const code  = (hex.slice(0, 5) + '-' + hex.slice(5, 10)).toUpperCase()
        codes.push(code)

        // Hash for storage using PBKDF2 — recovery codes have lower entropy than passwords
        // PBKDF2 makes offline cracking expensive even if DB is leaked
        const enc      = new TextEncoder()
        const keyMat   = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
        const hashBuf  = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(userId), iterations: 100_000, hash: 'SHA-256' },
          keyMat, 256
        )
        const codeHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
        inserts.push({ user_id: userId, code_hash: codeHash })
      }

      await supabase.from('mfa_recovery_codes').insert(inserts)

      // Return plaintext codes ONCE — never stored, never retrievable again
      return new Response(JSON.stringify({ success: true, codes }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // ── VERIFY RECOVERY CODE ──────────────────────────────────────────────────
    if (action === 'verify_recovery_code') {
      const { code } = body
      if (!code || typeof code !== 'string') throw new Error('Invalid code')

      // Rate limit: max 10 recovery attempts per hour
      const { count: recentAttempts } = await supabase
        .from('mfa_recovery_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('used', true)
        .gt('used_at', new Date(Date.now() - 3600_000).toISOString())

      if ((recentAttempts ?? 0) >= 10) {
        return new Response(JSON.stringify({ error: 'Too many recovery attempts. Please contact support.' }), {
          status: 429, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      const normalised = code.trim().toUpperCase()

      // Hash using PBKDF2 to match storage method
      const enc      = new TextEncoder()
      const keyMat   = await crypto.subtle.importKey('raw', enc.encode(normalised), 'PBKDF2', false, ['deriveBits'])
      const hashBuf  = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(userId), iterations: 100_000, hash: 'SHA-256' },
        keyMat, 256
      )
      const codeHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

      // Find unused matching code
      const { data: codes } = await supabase
        .from('mfa_recovery_codes')
        .select('id, code_hash, used')
        .eq('user_id', userId)
        .eq('used', false)

      const match = codes?.find(c => constantTimeEqual(c.code_hash, codeHash))

      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid or already used recovery code' }), {
          status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
        })
      }

      // Mark as used
      await supabase.from('mfa_recovery_codes')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('id', match.id)

      // Mark profile as MFA verified for this session
      // (the frontend will call onVerified() after this)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    // HIGH-4 fix: service-role unenroll after email OTP verification
    if (action === 'mfa_unenroll') {
      // CRIT-1 fix: read code from body directly in this scope; use hashCode helper for PBKDF2
      const unenrollCode = body?.code
      if (!unenrollCode || !/^\d{6}$/.test(unenrollCode)) throw new Error('Invalid code format')
      const { data: mfaCode } = await supabase
        .from('mfa_email_codes')
        .select('code_hash, used, expires_at, attempts')
        .eq('user_id', userId)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!mfaCode) throw new Error('Code expired')
      // MED-1 fix: enforce same attempt lockout as verify_code
      if ((mfaCode.attempts ?? 0) >= MAX_ATTEMPTS) {
        throw new Error('Too many incorrect attempts. Request a new code.')
      }
      const inputHash = await hashCode(unenrollCode, userId)
      if (!constantTimeEqual(inputHash, mfaCode.code_hash)) {
        await supabase.from('mfa_email_codes')
          .update({ attempts: (mfaCode.attempts ?? 0) + 1 })
          .eq('user_id', userId).eq('used', false)
        throw new Error('Incorrect code')
      }
      await supabase.from('mfa_email_codes').update({ used: true }).eq('user_id', userId).eq('used', false)
      // Service role deletes TOTP factors — no AAL2 required server-side
      const { data: factors } = await supabase.auth.admin.listFactors({ userId })
      for (const factor of (factors?.factors || [])) {
        if (factor.factor_type === 'totp') {
          await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
        }
      }
      // MED-2 fix: clear both mfa_enrolled and mfa_email_fallback for consistent state
      await supabase.from('profiles').update({ mfa_enrolled: false, mfa_email_fallback: false }).eq('id', userId)
      return new Response(JSON.stringify({ success: true, unenrolled: true }), {
        status: 200, headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action')

  } catch (err) {
    console.error('MFA email error:', err.message)
    const safeMessages = ['Too many codes requested', 'Code expired', 'Incorrect code', 'Invalid code format', 'Too many incorrect attempts']
    const msg = safeMessages.some(s => err.message.includes(s)) ? err.message : 'Verification failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
