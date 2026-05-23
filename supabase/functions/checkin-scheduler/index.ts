import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3?target=deno'
import { sendEmail } from '../_shared/resend.ts'
import {
  checkinReminderEmail,
  deadMansSwitchEmail,
  accessGrantedEmail,
  expiryReminderEmail,
} from '../_shared/emails.ts'

// FIX EF-1: Constants only — supabase client created inside handler
const APP_URL = 'https://digitalrelative.co.uk'

// FIX EF-6: Constant-time auth comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aB = new TextEncoder().encode(a)
  const bB = new TextEncoder().encode(b)
  let diff = 0
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i]
  return diff === 0
}

serve(async (req) => {
  // FIX EF-1: Create supabase client per-request, not at module level
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const CRON_SECRET = Deno.env.get('CRON_SECRET')
  // FIX EF-CS-1: now inside handler
  const now = new Date()
  const authHeader = req.headers.get('Authorization') ?? ''
  const cronSecret = req.headers.get('x-cron-secret')  ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const bearerValid = authHeader.startsWith('Bearer ') &&
    timingSafeEqual(authHeader.slice(7), serviceKey)
  const cronValid = !!CRON_SECRET && timingSafeEqual(cronSecret, CRON_SECRET)

  if (!bearerValid && !cronValid) {
    return new Response('Forbidden', { status: 403 })
  }

  const contentLength = parseInt(req.headers.get('content-length') || '0')
  if (contentLength > 1024) return new Response('Payload too large', { status: 413 })

  const results = { checked: 0, checkinReminders: 0, switchTriggered: 0, expiryEmails: 0, errors: 0 }

  // ── 1. Check-in reminders and check-in protection ───────────────────────────
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, checkin_frequency_days, last_checkin, plan, switch_triggered_at')
    .in('plan', ['single', 'couples'])
    .not('last_checkin', 'is', null)

  if (usersError) {
    console.error('Failed to fetch profiles:', usersError.message)
    return new Response('Internal error', { status: 500 })
  }

  results.checked = users?.length ?? 0

  for (const user of users ?? []) {
    try {
      const last      = new Date(user.last_checkin)
      const freqMs    = user.checkin_frequency_days * 86_400_000
      const elapsed   = now.getTime() - last.getTime()
      const overdue   = elapsed - freqMs
      if (overdue < 0) continue

      const overdueDays = Math.floor(overdue / 86_400_000)

      // Send reminder at 3, 7, 14 days overdue
      if ([3, 7, 14].includes(overdueDays)) {
        const { data: authUser } = await supabase.auth.admin.getUserById(user.id)
        const email    = authUser?.user?.email
        const fullName = authUser?.user?.user_metadata?.full_name || 'there'

        if (email) {
          const sent = await sendEmail({
            to:      email,
            subject: `Digital Relative - check-in reminder (${overdueDays} days overdue)`,
            html:    checkinReminderEmail(fullName, overdueDays, `${APP_URL}/?checkin=1`),
          })
          if (sent) results.checkinReminders++
        }
      }

      // Trigger check-in protection — only once
      if (overdueDays >= user.checkin_frequency_days && !user.switch_triggered_at) {
        await triggerDeadMansSwitch(user.id, supabase, now)
        results.switchTriggered++
      }
    } catch (err) {
      console.error(`Error processing user ${user.id.slice(0,8)}:`, err.message)
      results.errors++
    }
  }

  // ── 2. Expiry reminders ───────────────────────────────────────────────────
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // FIX MISC-4: Only fetch entries expiring within ±90 days to avoid full table scans
    const windowStart = new Date(today); windowStart.setDate(windowStart.getDate() - 1)
    const windowEnd   = new Date(today); windowEnd.setDate(windowEnd.getDate() + 91)
    const { data: entries } = await supabase
      .from('vault_entries')
      .select('id, user_id, title, expiry_date, expiry_reminder_days, expiry_notified_at')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', windowStart.toISOString().split('T')[0])
      .lte('expiry_date', windowEnd.toISOString().split('T')[0])

    // Group entries by user
    const byUser: Record<string, Array<{id: string, title: string, expiryDate: string, daysLeft: number}>> = {}

    for (const entry of entries ?? []) {
      const expiry   = new Date(entry.expiry_date)
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000)
      const reminders = entry.expiry_reminder_days || [30]

      if (!reminders.includes(daysLeft)) continue

      // Don't send duplicate notifications within 2 days
      if (entry.expiry_notified_at) {
        const lastNotified = new Date(entry.expiry_notified_at)
        if ((today.getTime() - lastNotified.getTime()) < 2 * 86_400_000) continue
      }

      if (!byUser[entry.user_id]) byUser[entry.user_id] = []
      byUser[entry.user_id].push({
        id: entry.id, title: entry.title,
        expiryDate: entry.expiry_date, daysLeft,
      })
    }

    // Send one email per user with all their expiring entries
    for (const [userId, userEntries] of Object.entries(byUser)) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId)
        const email    = authUser?.user?.email
        const fullName = authUser?.user?.user_metadata?.full_name || 'there'

        if (email) {
          const sent = await sendEmail({
            to:      email,
            subject: `Digital Relative - ${userEntries.length} vault ${userEntries.length === 1 ? 'entry' : 'entries'} need attention`,
            html:    expiryReminderEmail(fullName, userEntries, `${APP_URL}/?page=vault`),
          })

          if (sent) {
            results.expiryEmails++
            // Mark all as notified
            await supabase.from('vault_entries')
              .update({ expiry_notified_at: now.toISOString() })
              .in('id', userEntries.map(e => e.id))
          }
        }
      } catch (err) {
        console.error(`Expiry email error for ${userId.slice(0,8)}:`, err.message)
      }
    }
  } catch (err) {
    console.error('Expiry check failed:', err.message)
    results.errors++
  }

  // ── 3. Process onfido_verified requests past their 48h hold ──────────────────
  try {
    const { data: pendingGrants } = await supabase
      .from('access_requests')
      .select('*')
      .in('status', ['onfido_verified', 'manually_approved'])
      .not('access_grant_after', 'is', null)
      .lt('access_grant_after', now.toISOString())

    for (const req of pendingGrants ?? []) {
      try {
        // Check if owner denied during hold period
        if (req.owner_response === 'alive_deny') {
          await supabase.from('access_requests').update({ status: 'owner_notified' }).eq('id', req.id)
          continue
        }
        // Grant access — 48h hold has passed
        await grantVaultAccess(req, supabase)
        results.switchTriggered++ // reuse counter for access grants
      } catch (err) {
        console.error('Hold period grant failed:', err.message)
        results.errors++
      }
    }
  } catch (err) {
    console.error('Hold period check failed:', err.message)
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function triggerDeadMansSwitch(userId: string, supabase: any, now: Date) {
  const { data: bens } = await supabase
    .from('beneficiaries')
    .select('id, email, invite_token, name, status')
    .eq('user_id', userId)
    // BL-4: Policy decision — check-in protection fires for beneficiaries who have
    // accepted the nomination (confirmed) OR completed ID verification (id_verified).
    // email_confirmed status = email verified but Onfido not done — intentionally excluded.
    // These beneficiaries get Tier 1 access once they complete verification.
    // If the ONLY beneficiary is in email_confirmed state, no one gets notified.
    // This is intentional: we require at least email confirmation before firing.
    // FIX MD-4: 'confirmed' status no longer exists — use 'email_confirmed' (round4 schema)
    .in('status', ['email_confirmed', 'id_verified'])

  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const rawOwnerName = authUser?.user?.user_metadata?.full_name || 'Your family member'
  // L-3 fix: strip newlines and limit length to prevent email header injection
  const ownerName = rawOwnerName.replace(/[\r\n]/g, ' ').slice(0, 100)

  for (const ben of bens ?? []) {
    // Generate a fresh access token — never reuse the original invite_token
    const freshToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b: number) => b.toString(16).padStart(2, '0')).join('')

    await supabase.from('beneficiaries').update({
      status: 'access_granted',
      emergency_access_token: freshToken,
    }).eq('id', ben.id)

    const accessUrl = `${APP_URL}/beneficiary?token=${freshToken}`
    await sendEmail({
      to:      ben.email,
      subject: `${ownerName} has set up Digital Relative for you`,
      html:    accessGrantedEmail(ben.name || 'there', rawOwnerName || ownerName, accessUrl),
    })
  }

  // Record trigger — prevents re-firing
  await supabase.from('profiles')
    .update({ switch_triggered_at: now.toISOString() })
    .eq('id', userId)

  await supabase.from('audit_log').insert([{
    user_id:  userId,
    action:   'dead_mans_switch_triggered',
    metadata: { beneficiary_count: bens?.length ?? 0 },
  }]).catch(e => console.error('Audit log failed:', e.message))
}


async function grantVaultAccess(request: any, supabase: any) {
  const { vault_owner_id, id: requestId } = request
  const APP_URL = 'https://digitalrelative.co.uk'
  // HIGH-1 fix: also select access_requirement so we only grant to beneficiaries
  // whose individual requirement has been satisfied by this verification event.
  // trust_only beneficiaries are granted at acceptance time — exclude them here.
  // death_certificate and id_only beneficiaries are granted when a request completes.
  const { data: bens } = await supabase
    .from('beneficiaries')
    .select('id, email, name, invite_token, id_verified_at, access_requirement')
    .eq('user_id', vault_owner_id)
    .in('status', ['email_confirmed', 'id_verified'])
    .in('access_requirement', ['death_certificate', 'id_only'])

  const ownerAuth = await supabase.auth.admin.getUserById(vault_owner_id)
  const rawOwnerName = ownerAuth.data?.user?.user_metadata?.full_name || 'Your family member'
  // MED-2 fix: sanitise ownerName before email subject interpolation
  const ownerName = rawOwnerName.replace(/[\r\n]/g, ' ').slice(0, 100)

  for (const ben of bens ?? []) {
    const newTier    = ben.id_verified_at ? 2 : 1
    const freshToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b: number) => b.toString(16).padStart(2, '0')).join('')

    await supabase.from('beneficiaries').update({
      status: 'access_granted', access_tier: newTier, emergency_access_token: freshToken,
    }).eq('id', ben.id)

    const accessUrl = `${APP_URL}/beneficiary?token=${freshToken}`
    await sendEmail({
      to:      ben.email,
      subject: `Access to ${ownerName}'s Digital Relative vault has been granted`,
      html:    accessGrantedEmail(ben.name || 'there', rawOwnerName || ownerName, accessUrl),
    })
  }

  await supabase.from('access_requests').update({ status: 'access_granted' }).eq('id', requestId)
}
