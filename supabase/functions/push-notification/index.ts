// push-notification edge function
// Sends a Web Push notification to a user's subscribed browser(s)
// Uses the Web Push Protocol (RFC 8030) with proper VAPID/ES256 (RFC 8292)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── VAPID JWT builder (RFC 8292) ─────────────────────────────────────────────
// Uses ES256 (ECDSA P-256 + SHA-256) as required by the spec

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad    = '='.repeat((4 - padded.length % 4) % 4)
  return Uint8Array.from(atob(padded + pad), c => c.charCodeAt(0))
}

async function buildVapidJwt(
  audience:    string,
  subject:     string,
  publicKeyB64:  string,
  privateKeyB64: string,
): Promise<string> {
  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64url(JSON.stringify({ aud: audience, exp: now + 86400, sub: subject }))
  const signing = `${header}.${claims}`

  // Import P-256 private key (raw 32-byte scalar in PKCS8 wrapper)
  const rawPriv = b64urlDecode(privateKeyB64)

  // Build a minimal PKCS8 structure for P-256
  // OID for EC + OID for P-256 curve
  const oidEC    = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01])
  const oidP256  = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
  const ecPriv   = new Uint8Array([0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, ...oidEC, 0x06, 0x08, ...oidP256, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20, ...rawPriv])

  const privKey = await crypto.subtle.importKey(
    'pkcs8', ecPriv.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(signing)
  )

  // Convert DER signature to raw R||S (64 bytes) for JOSE
  const der = new Uint8Array(sigBytes)
  let offset = 3
  const rLen = der[offset++]
  const rStart = offset + (der[offset] === 0 ? 1 : 0)
  const r = der.slice(rStart, offset + rLen).slice(-32)
  offset += rLen + 1
  const sLen = der[offset++]
  const sStart = offset + (der[offset] === 0 ? 1 : 0)
  const s = der.slice(sStart, offset + sLen).slice(-32)

  const sig64 = new Uint8Array(64)
  sig64.set(r.length < 32 ? new Uint8Array([...new Uint8Array(32 - r.length), ...r]) : r, 0)
  sig64.set(s.length < 32 ? new Uint8Array([...new Uint8Array(32 - s.length), ...s]) : s, 32)

  return `${signing}.${b64url(sig64)}`
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Internal only - CRON_SECRET bearer token, no CORS
  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.json()
  const { user_id, title, message, url = '/', tag = 'dr-notification' } = body

  if (!user_id || !title || !message) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id)
    .eq('active', true)

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'No subscriptions' }), { status: 200 })
  }

  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY') || ''
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
  const vapidSubject = 'mailto:security@digitalrelative.co.uk'

  const payload = JSON.stringify({ title, body: message, url, tag })

  let sent = 0
  const expired: string[] = []

  for (const sub of subs) {
    try {
      const audience  = new URL(sub.endpoint).origin
      const jwt       = await buildVapidJwt(audience, vapidSubject, vapidPublic, vapidPrivate)
      const vapidAuth = `vapid t=${jwt},k=${vapidPublic}`

      const ctrl    = new AbortController()
      const timer   = setTimeout(() => ctrl.abort(), 10_000)
      let res: Response
      try {
        res = await fetch(sub.endpoint, {
          method:  'POST',
          headers: {
            'Authorization': vapidAuth,
            'Content-Type':  'application/octet-stream',
            'TTL':           String(86400),
          },
          body:   new TextEncoder().encode(payload),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (res.status === 201 || res.status === 200 || res.status === 202) {
        sent++
      } else if (res.status === 410 || res.status === 404) {
        expired.push(sub.id)
      }
    } catch {
      // Network error - skip this subscription silently
    }
  }

  if (expired.length > 0) {
    await supabase.from('push_subscriptions')
      .update({ active: false })
      .in('id', expired)
  }

  return new Response(JSON.stringify({ sent, expired: expired.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
