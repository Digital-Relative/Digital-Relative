import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

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

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}



serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: hdrs })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')        || ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY')   || ''

  try {
    const body = await req.json().catch(() => null)
    if (!body?.userId) throw new Error('Missing userId')

    const { userId, returnUrl } = body
    if (!UUID_RE.test(userId)) throw new Error('Invalid userId')

    // Verify JWT belongs to userId
    const jwt = authHeader.slice(7)
    const meRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': serviceKey },
    })
    if (!meRes.ok) throw new Error('Invalid session')
    const me = await meRes.json()
    if (me.id !== userId) throw new Error('User ID mismatch')

    // Get Stripe customer ID
    const profileRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
      { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
    )
    const profiles   = await profileRes.json()
    const customerId = profiles?.[0]?.stripe_customer_id
    if (!customerId) throw new Error('No billing account found')

    // FIX EF-NEW-11: Validate returnUrl against allowed origins before using it
    const VALID_RETURN_ORIGINS = ['https://digitalrelative.co.uk', 'https://legatum-chi.vercel.app']
    const safeReturnUrl = returnUrl && VALID_RETURN_ORIGINS.some((o: string) => returnUrl.startsWith(o))
      ? returnUrl
      : 'https://digitalrelative.co.uk'

    // Create Stripe Customer Portal session
    const portalRes = await fetchWithTimeout('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer:   customerId,
        return_url: safeReturnUrl,
      }),
    })
    const portal = await portalRes.json()
    if (portal.error) throw new Error('Could not create billing portal')

    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { ...hdrs, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Portal error:', err.message)
    return new Response(JSON.stringify({ error: 'Could not open billing portal' }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
