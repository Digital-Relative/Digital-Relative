import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => null)
    if (!body?.userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: hdrs })

    const { userId } = body
    if (!UUID_RE.test(userId)) return new Response(JSON.stringify({ error: 'Invalid userId' }), { status: 400, headers: hdrs })

    // Verify JWT belongs to the userId
    const jwt = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user || user.id !== userId) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 403, headers: hdrs })
    }

    // 1. Cancel Stripe subscription
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single()

    if (stripeKey && profile?.stripe_subscription_id) {
      await fetchWithTimeout(`https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      }).catch(e => console.error('Stripe cancel failed:', e.message))
    }

    // FIX EF-5: Recursively delete all files under userId prefix
    // List all files with the user's prefix (handles nested folders)
    const { data: files } = await supabase.storage
      .from('vault-files')
      .list(userId, { limit: 1000 })

    if (files?.length) {
      // For each subfolder, list its contents too
      const allPaths: string[] = []
      for (const item of files) {
        if (item.id === null) {
          // It's a folder — list its contents
          const { data: subFiles } = await supabase.storage
            .from('vault-files')
            .list(`${userId}/${item.name}`, { limit: 1000 })
          subFiles?.forEach(f => allPaths.push(`${userId}/${item.name}/${f.name}`))
        } else {
          allPaths.push(`${userId}/${item.name}`)
        }
      }
      if (allPaths.length > 0) {
        await supabase.storage.from('vault-files').remove(allPaths)
      }
    }

    // 2. Anonymise audit log (GDPR compliance — keep records, remove PII)
    await supabase.from('audit_log')
      .update({ user_id: null, ip_address: null, user_agent: null })
      .eq('user_id', userId)
      .catch(() => {})

    // 3. Delete profile (cascades via FK)
    await supabase.from('profiles').delete().eq('id', userId)

    // 4. Delete auth user (must be last)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) throw new Error('Failed to delete auth user')

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...hdrs, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Delete account error:', err.message)
    return new Response(JSON.stringify({ error: 'Account deletion failed. Contact support.' }), {
      status: 500, headers: { ...hdrs, 'Content-Type': 'application/json' },
    })
  }
})
