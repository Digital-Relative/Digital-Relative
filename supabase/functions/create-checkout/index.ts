import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const ALLOWED_ORIGINS = new Set([
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
  'https://legatum-chi.vercel.app',
  'https://digital-relative.vercel.app',
])

// FIX EF-2: Return no CORS headers for unknown origins so preflight fails
function corsHeaders(origin: string): Record<string, string> {
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const VALID_PRICE_IDS = new Set([
  Deno.env.get('STRIPE_PRICE_SINGLE_ANNUAL')   || '',
  Deno.env.get('STRIPE_PRICE_COUPLES_MONTHLY') || '',
  Deno.env.get('STRIPE_PRICE_COUPLES_ANNUAL')  || '',
].filter(Boolean))

const VALID_REDIRECT_ORIGINS = [
  'https://digitalrelative.co.uk',
  'https://www.digitalrelative.co.uk',
  'https://legatum-chi.vercel.app',
  'https://digital-relative.vercel.app',
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// FIX EF-9: Wrap fetch with timeout
async function fetchWithTimeout(url: string, opts: RequestInit, ms = 10_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  const hdrs   = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return Object.keys(hdrs).length
      ? new Response('ok', { headers: hdrs })
      : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
  const jwt = authHeader.slice(7)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')        || ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY')   || ''

  try {
    const body = await req.json().catch(() => null)
    if (!body) return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: hdrs })

    const { priceId, userId, successUrl, cancelUrl } = body

    if (!priceId || !userId || !successUrl || !cancelUrl)
      throw new Error('Missing required fields')
    if (!VALID_PRICE_IDS.has(priceId))
      throw new Error('Invalid price ID')
    if (!UUID_RE.test(userId))
      throw new Error('Invalid user ID format')
    if (!VALID_REDIRECT_ORIGINS.some(o => successUrl.startsWith(o)))
      throw new Error('Invalid redirect URL')
    if (!VALID_REDIRECT_ORIGINS.some(o => cancelUrl.startsWith(o)))
      throw new Error('Invalid redirect URL')

    // FIX EF-1: Verify JWT belongs to the userId in the request body
    const meRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': serviceKey },
    })
    if (!meRes.ok) throw new Error('Invalid session')
    const meData = await meRes.json()
    if (meData.id !== userId) throw new Error('User ID mismatch')
    const email = meData.email || ''

    // Get profile
    const profileRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id,full_name`,
      { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
    )
    const profiles = await profileRes.json()
    const profile  = profiles?.[0]
    let customerId = profile?.stripe_customer_id

    // FIX EF-3 & EF-4: Create customer with conflict-safe PATCH check
    if (!customerId) {
      const customerRes = await fetchWithTimeout('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email,
          name: (profile?.full_name || '').substring(0, 100),
          'metadata[supabase_user_id]': userId,
        }),
      })
      const customer = await customerRes.json()
      if (customer.error) throw new Error('Payment setup failed')
      customerId = customer.id

      // Verify PATCH succeeded — FIX EF-4
      const patchRes = await fetchWithTimeout(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey,
          'Content-Type': 'application/json', 'Prefer': 'return=representation',
        },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      })
      if (!patchRes.ok) console.error('Failed to save stripe_customer_id - duplicate customer risk')
    }

    const sessionRes = await fetchWithTimeout('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer: customerId,
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        'metadata[supabase_user_id]': userId,
        'subscription_data[metadata][supabase_user_id]': userId,
      }),
    })
    const session = await sessionRes.json()
    if (session.error) throw new Error('Payment session creation failed')

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      headers: { ...hdrs, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Checkout error:', err.message)
    return new Response(JSON.stringify({ error: 'Checkout failed. Please try again.' }), {
      status: 400, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
