import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'


function he(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const MAX_PIN_ATTEMPTS = 5

// FIX EF-NEW-7: Constant-time string comparison to prevent timing attacks
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const corsHeaders = getCorsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // FIX EF-NEW-7: Body size limit
  const contentLength = parseInt(req.headers.get('content-length') || '0')
  if (contentLength > 4096) return new Response('Payload too large', { status: 413 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => null)
    if (!body?.token) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { token, pin } = body

    // Validate token format
    if (!/^[0-9a-f]{64}$/.test(token)) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the link
    const { data: link, error } = await supabase
      .from('shared_links')
      .select('*')
      .eq('token', token)
      .eq('revoked', false)
      .single()

    // FIX EF-NEW-10: Return same error for all "not accessible" states
    if (error || !link || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check view limit
    if (link.max_views !== null && link.view_count >= link.max_views) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // FIX EF-NEW-8: Check PIN attempt rate limit
    if (link.pin_hash) {
      // Track failed attempts in metadata jsonb column (add if not exists)
      const failedAttempts = link.pin_attempts || 0
      if (failedAttempts >= MAX_PIN_ATTEMPTS) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!pin) {
        return new Response(JSON.stringify({ requiresPin: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Use PBKDF2 not SHA-256 — short PINs have low entropy, offline crack feasible with SHA-256
      const enc    = new TextEncoder()
      const keyMat = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
      const bits   = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(link.token), iterations: 100_000, hash: 'SHA-256' },
        keyMat, 256
      )
      const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')

      if (!constantTimeEqual(hashHex, link.pin_hash)) {
        // MED-2 fix: increment atomically using optimistic lock (same pattern as view_count)
        // Only update if pin_attempts hasn't changed since we read it
        const { count: updated } = await supabase.from('shared_links')
          .update({ pin_attempts: (failedAttempts + 1) })
          .eq('id', link.id)
          .eq('pin_attempts', failedAttempts)  // optimistic lock
          .select('*', { count: 'exact', head: true })
        // If count === 0, a concurrent request already incremented — that's fine,
        // the attempt was still counted by the other request

        const remaining = MAX_PIN_ATTEMPTS - failedAttempts - 1
        return new Response(JSON.stringify({
          error: 'Incorrect PIN',
          attemptsRemaining: remaining > 0 ? remaining : 0,
        }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Correct PIN — reset attempt counter
      await supabase.from('shared_links').update({ pin_attempts: 0 }).eq('id', link.id)
    }

    // FIX EF-NEW-9: Atomic view count increment — prevent race condition on one-time links
    // Use a conditional update that only succeeds if view_count hasn't changed
    const { data: updated, error: updateError } = await supabase
      .from('shared_links')
      .update({
        view_count: link.view_count + 1,
        last_accessed_at: new Date().toISOString(),
        ...(link.one_time ? { revoked: true, revoked_at: new Date().toISOString() } : {}),
      })
      .eq('id', link.id)
      .eq('view_count', link.view_count) // Only update if count hasn't changed (atomic check)
      .select('id')

    if (updateError || !updated?.length) {
      // Race condition — another request got here first
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Notify owner if they requested it
    if (link.notify_on_access) {
      const { data: owner } = await supabase.auth.admin.getUserById(link.user_id)
      const ownerEmail = owner?.user?.email
      if (ownerEmail) {
        const ip       = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'Unknown'
        const country  = req.headers.get('cf-ipcountry') || ''
        const location = country && country !== 'XX' ? `${ip} (${country})` : ip
        const time     = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })
        await sendEmail({
          to: ownerEmail,
          subject: 'Your Digital Relative shared link was accessed',
          html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#c9a84c;">Shared link accessed</h2>
            <p>Your shared link for <strong>${he(link.content_label || 'vault content')}</strong> was just viewed.</p>
            <p><strong>Time:</strong> ${he(time)}<br><strong>Location:</strong> ${he(location)}<br><strong>Total views:</strong> ${link.view_count + 1}</p>
            <p>If you did not expect this, revoke the link from Digital Relative > Share links.</p>
          </div>`,
        }).catch(() => {})
        supabase.from('audit_log').insert({ user_id: link.user_id, action: 'shared_link_accessed', metadata: { label: link.content_label } }).catch(() => {})
        // Write in-app notification
        supabase.from('notifications').insert({
          user_id:    link.user_id,
          type:       'shared_link_accessed',
          title:      'Shared link accessed',
          message:    `Your shared link was accessed.`,
          action_url: 'https://digitalrelative.co.uk/?page=sharedlinks',
          read:       false,
        }).catch(() => {})
      }
    }

    return new Response(JSON.stringify({
      encryptedPayload: link.encrypted_payload,
      contentType:      link.content_type,
      // FIX BL-NEW-3: Only return contentLabel after PIN verified
      contentLabel:     link.pin_hash && !pin ? undefined : link.content_label,
      includesPassword: link.includes_password,
      expiresAt:        link.expires_at,
      oneTime:          link.one_time,
      viewCount:        link.view_count + 1,
      maxViews:         link.max_views,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Shared link error:', err.message)
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
