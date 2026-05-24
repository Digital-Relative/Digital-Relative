import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'

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

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 8_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

const APP_URL = 'https://digitalrelative.co.uk'

function he(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}



serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 })

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    const body      = await req.json().catch(() => ({}))

    // Rate limit: max 10 device log entries per user per hour
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: recentCount } = await supabase
      .from('device_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('created_at', oneHourAgo)
    if ((recentCount ?? 0) >= 10) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...hdrs, 'Content-Type': 'application/json' },
      })
    }
    const userAgent = req.headers.get('user-agent') || body.userAgent || 'Unknown'
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'Unknown'

    // Geolocation via Cloudflare infrastructure headers only - no third-party IP lookup
    // CF-IPCountry is set by Cloudflare/Supabase edge infrastructure
    let location = 'Unknown'
    const cfCountry = req.headers.get('cf-ipcountry')
    const cfCity    = req.headers.get('cf-ipcity')
    if (cfCity && cfCountry && cfCountry !== 'XX') {
      // Sanitise Cloudflare values before use
      const safeCity    = String(cfCity).replace(/[<>"'&]/g, '').slice(0, 100)
      const safeCountry = String(cfCountry).replace(/[<>"'&]/g, '').slice(0, 100)
      location = `${safeCity}, ${safeCountry}`
    }
    // No third-party IP lookup - all geolocation via Cloudflare headers only
    // This keeps IP addresses within UK/EU infrastructure (no data sent to US services)

    // Normalise UA to browser family + OS to avoid false positives on minor version bumps
    // e.g. "Chrome/125" and "Chrome/126" treated as same device
    function normaliseUA(ua: string): string {
      const browser = ua.match(/(?:Chrome|Firefox|Safari|Edge|OPR|Edg)\/(\d+)/)?.[0]?.replace(/\/\d+/, '') || 'Unknown'
      const os = ua.includes('Windows') ? 'Windows'
               : ua.includes('Mac OS') ? 'Mac'
               : ua.includes('Linux') ? 'Linux'
               : ua.includes('Android') ? 'Android'
               : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
               : 'Unknown'
      return `${browser}/${os}`
    }
    const normalisedUA = normaliseUA(userAgent)

    // Check if new device (not seen in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { count: knownCount } = await supabase
      .from('device_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('user_agent', normalisedUA)
      .gt('created_at', thirtyDaysAgo)

    const isNewDevice = (knownCount ?? 0) === 0

    await supabase.from('device_log').insert({ user_id: user.id, ip_address: ipAddress, user_agent: normalisedUA, location })

    if (isNewDevice) {
      // Write in-app notification for new device sign-in
      await supabase.from('notifications').insert({
        user_id:    user.id,
        type:       'new_device',
        title:      'New device sign-in',
        message:       `Your account was accessed from a new device. If this was not you, change your password immediately.`,
        action_url: `${APP_URL}/?page=settings`,
        read:       false,
      }).catch(() => {})

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      const name       = profile?.full_name || 'there'
      const deviceType = userAgent.includes('Mobile') ? 'mobile device' : userAgent.includes('iPad') ? 'tablet' : 'computer'
      const time       = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })

      await sendEmail({
        to:      user.email!,
        subject: 'New sign-in to Digital Relative',
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#333;">
          <h2 style="color:#c9a84c;">New sign-in detected</h2>
          <p>Hi ${he(name)},</p>
          <p>We noticed a new sign-in to your Digital Relative account.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;">Time</td><td style="padding:8px;">${he(time)}</td></tr>
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;">Device</td><td style="padding:8px;">${he(deviceType)}</td></tr>
            <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold;">Location</td><td style="padding:8px;">${he(location)}</td></tr>
          </table>
          <p>If this was you, no action is needed.</p>
          <p><strong>If this was not you</strong>, change your password immediately and contact us at security@digitalrelative.co.uk</p>
          <p style="color:#999;font-size:12px;">Digital Relative - <a href="${APP_URL}">digitalrelative.co.uk</a></p>
        </div>`,
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ success: true, isNewDevice }), { headers: { ...hdrs, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }
})
