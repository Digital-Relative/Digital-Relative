import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'
import { duressAlertEmail, duressAdminAlertEmail } from '../_shared/emails.ts'

const ALLOWED_ORIGINS = [
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
]
const ADMIN_EMAIL = 'security@digitalrelative.co.uk'

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || ''
  // N-6 fix: return empty CORS for unknown origins (matches all other edge functions)
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null
  const hdrs: Record<string, string> = {
    ...(allowedOrigin ? {
      'Access-Control-Allow-Origin':  allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    } : {}),
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: hdrs })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: hdrs })

  try {
    // Auth
    const authHeader = req.headers.get('Authorization') || ''
    const jwt        = authHeader.replace('Bearer ', '')
    const supabase   = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' } })

    const ip      = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'Unknown'
    const country = req.headers.get('cf-ipcountry') || ''
    const location = country && country !== 'XX' ? `${ip} (${country})` : ip
    const time     = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })

    const ownerEmail = user.email || ''
    const rawName    = user.user_metadata?.full_name || 'there'
    const ownerName  = rawName.replace(/[\r\n]/g, ' ').slice(0, 100)

    // Alert owner
    if (ownerEmail) {
      await sendEmail({
        to:      ownerEmail,
        subject: '⚠️ Digital Relative - Duress PIN used on your account',
        html:    duressAlertEmail(ownerName, time, location),
      }).catch(() => {})
    }

    // Alert admin
    await sendEmail({
      to:      ADMIN_EMAIL,
      subject: '[Admin] Duress PIN triggered',
      html:    duressAdminAlertEmail(ownerEmail, time, location),
    }).catch(() => {})

    // Write to audit log
    await supabase.from('audit_log').insert({
      user_id:    user.id,
      action:     'duress_pin_used',
      ip_address: ip,
      metadata:   { location, time },
    }).catch(() => {})

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' } })
  }
})
