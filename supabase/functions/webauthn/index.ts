// webauthn edge function
// Handles server-side challenge generation and assertion verification
// for WebAuthn registration and authentication

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_URL = 'https://digitalrelative.co.uk'
const ALLOWED_ORIGINS = [APP_URL, 'https://www.digitalrelative.co.uk']

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs: Record<string, string> = ALLOWED_ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
    : {}

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: hdrs })
  if (req.method !== 'POST')   return new Response('Method not allowed', { status: 405, headers: hdrs })

  const authHeader = req.headers.get('Authorization') || ''
  const supabase   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Verify caller JWT
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }

  const body   = await req.json()
  const action = body.action

  // ── Generate registration challenge ────────────────────────────────────────
  if (action === 'registration_challenge') {
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32))
    const challenge      = btoa(String.fromCharCode(...challengeBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    // Store challenge with 5-minute TTL
    await supabase.from('webauthn_challenges').upsert({
      user_id:    user.id,
      challenge,
      purpose:    'registration',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    }, { onConflict: 'user_id,purpose' })

    return new Response(JSON.stringify({ challenge, rpId: new URL(APP_URL).hostname }), {
      headers: { ...hdrs, 'Content-Type': 'application/json' }
    })
  }

  // ── Verify registration + store credential ─────────────────────────────────
  if (action === 'registration_verify') {
    const { challenge: sentChallenge, credential_id, public_key, device_name } = body
    if (!sentChallenge || !credential_id || !public_key) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // NEW-8 fix: atomic DELETE...RETURNING — only first concurrent request succeeds
    const { data: stored } = await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('purpose', 'registration')
      .select('challenge, expires_at')
      .single()

    if (!stored || stored.challenge !== sentChallenge || new Date(stored.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Challenge invalid or expired' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Store credential
    const { error: insertErr } = await supabase.from('webauthn_credentials').insert({
      user_id:       user.id,
      credential_id: credential_id.slice(0, 500), // max 500 chars
      public_key,
      device_name:   (device_name || 'Security key').slice(0, 50),
      sign_count:    0,
    })

    if (insertErr) return new Response(JSON.stringify({ error: 'Could not save credential' }), { status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ success: true }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }

  // ── Generate assertion challenge ───────────────────────────────────────────
  if (action === 'assertion_challenge') {
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32))
    const challenge      = btoa(String.fromCharCode(...challengeBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    await supabase.from('webauthn_challenges').upsert({
      user_id:    user.id,
      challenge,
      purpose:    'assertion',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    }, { onConflict: 'user_id,purpose' })

    const { data: creds } = await supabase
      .from('webauthn_credentials')
      .select('credential_id')
      .eq('user_id', user.id)

    return new Response(JSON.stringify({
      challenge,
      allowCredentials: (creds || []).map(c => ({ type: 'public-key', id: c.credential_id })),
    }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }

  // ── Verify assertion + replay protection ───────────────────────────────────
  if (action === 'assertion_verify') {
    const { challenge: sentChallenge, credential_id, authenticator_data, sign_count: newCount } = body

    if (!sentChallenge || !credential_id) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // NEW-8 fix: atomic DELETE...RETURNING - only first concurrent request succeeds
    const { data: stored } = await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('user_id', user.id)
      .eq('purpose', 'assertion')
      .select('challenge, expires_at')
      .single()

    if (!stored || stored.challenge !== sentChallenge || new Date(stored.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Challenge invalid or expired' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Fetch stored credential for sign_count comparison
    const { data: cred } = await supabase
      .from('webauthn_credentials')
      .select('id, sign_count')
      .eq('user_id', user.id)
      .eq('credential_id', credential_id)
      .single()

    if (!cred) return new Response(JSON.stringify({ error: 'Credential not found' }), { status: 404, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    // HIGH-2 fix: validate sign_count strictly (replay protection)
    const storedCount = cred.sign_count || 0
    const incoming    = typeof newCount === 'number' ? newCount : 0
    if (storedCount > 0 && incoming <= storedCount) {
      // Possible replay attack - reject and alert
      await supabase.from('notifications').insert({
        user_id:    user.id,
        type:       'security_alert',
        title:      'Security key replay attempt detected',
        message:    'A possible replay attack was detected on your security key. Your account is safe but consider removing this key.',
        action_url: `${APP_URL}/?page=settings`,
        read:       false,
      }).catch(() => {})
      return new Response(JSON.stringify({ error: 'Sign count invalid - possible replay attack' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
    }

    // Update credential (challenge already atomically deleted above)
    await supabase.from('webauthn_credentials').update({
      sign_count:   incoming,
      last_used_at: new Date().toISOString(),
    }).eq('id', cred.id)

    return new Response(JSON.stringify({ success: true }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' } })
})
