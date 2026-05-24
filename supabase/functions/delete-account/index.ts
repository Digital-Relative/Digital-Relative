import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
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


// Module-level recursive storage listing for delete-account
async function listAllPathsFromBucket(supabase: any, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  // C-5 fix: limit recursion depth and total paths to prevent unbounded listing
  if (depth > 5) return []
  const { data: items } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (!items?.length) return []
  const paths: string[] = []
  for (const item of items) {
    if (paths.length >= 10_000) break  // safety cap
    if (item.id) {
      paths.push(`${prefix}/${item.name}`)
    } else {
      const subPaths = await listAllPathsFromBucket(supabase, bucket, `${prefix}/${item.name}`, depth + 1)
      paths.push(...subPaths)
    }
  }
  return paths
}

async function listAllPaths(supabase: any, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 5) return []
  const { data: items } = await supabase.storage.from('vault-files').list(prefix, { limit: 1000 })
  if (!items?.length) return []
  const paths: string[] = []
  for (const item of items) {
    if (item.id === null) {
      const subPaths = await listAllPaths(supabase, `${prefix}/${item.name}`, depth + 1)
      paths.push(...subPaths)
    } else {
      paths.push(`${prefix}/${item.name}`)
    }
  }
  return paths
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

    // G-2 fix: trigger separation first to protect partner's vault data before deletion
    const { data: activeLink } = await supabase
      .from('partner_links')
      .select('id, requester_id, partner_id')
      .or(`requester_id.eq.${userId},partner_id.eq.${userId}`)
      .eq('status', 'accepted')
      .maybeSingle()

    if (activeLink) {
      // Unlink partner before deletion so their vault is not destroyed
      await supabase.from('partner_links').update({ status: 'unlinked' }).eq('id', activeLink.id)
      // Notify the partner
      const partnerId = activeLink.requester_id === userId ? activeLink.partner_id : activeLink.requester_id
      await supabase.from('notifications').insert({
        user_id:    partnerId,
        type:       'partner_unlinked',
        title:      'Your partner has deleted their account',
        message:    'Your couples vault has been separated. Your vault data is safe and unchanged.',
        action_url: 'https://digitalrelative.co.uk/?page=settings',
        read:       false,
      }).catch(() => {})
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

    // 2. Recursively delete all storage files (GDPR Article 17 compliance)
    const allPaths = await listAllPaths(supabase, userId)
    if (allPaths.length > 0) {
      await supabase.storage.from('vault-files').remove(allPaths)
    }

    // N-7 fix: also delete death certificate files from the death-certificates bucket
    const certPaths = await listAllPathsFromBucket(supabase, 'death-certificates', userId)
    if (certPaths.length > 0) {
      await supabase.storage.from('death-certificates').remove(certPaths)
    }

    // 3. Anonymise audit log (GDPR compliance — keep records, remove PII)
    await supabase.from('audit_log')
      .update({ user_id: null, ip_address: null, user_agent: null })
      .eq('user_id', userId)
      .catch(() => {})

    // 4. Delete profile (cascades via FK)
    await supabase.from('profiles').delete().eq('id', userId)

    // 5. Delete auth user (must be last — if this fails the catch returns the error)
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
