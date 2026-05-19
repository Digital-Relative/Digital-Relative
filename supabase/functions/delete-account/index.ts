// supabase/functions/delete-account/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe   = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { userId } = await req.json()

  // Verify the requesting user is deleting their own account
  const authHeader = req.headers.get('Authorization')
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') || '')
  if (!user || user.id !== userId) {
    return new Response('Unauthorised', { status: 403, headers: corsHeaders })
  }

  try {
    // 1. Cancel Stripe subscription
    const { data: profile } = await supabase.from('profiles').select('stripe_subscription_id').eq('id', userId).single()
    if (profile?.stripe_subscription_id) {
      await stripe.subscriptions.cancel(profile.stripe_subscription_id)
    }

    // 2. Delete all storage files
    const { data: files } = await supabase.storage.from('vault-files').list(userId)
    if (files?.length) {
      await supabase.storage.from('vault-files').remove(files.map(f => `${userId}/${f.name}`))
    }

    // 3. Delete all DB data (cascades via FK: vault_entries, beneficiaries, checkin_log)
    await supabase.from('profiles').delete().eq('id', userId)

    // 4. Delete auth user
    await supabase.auth.admin.deleteUser(userId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
