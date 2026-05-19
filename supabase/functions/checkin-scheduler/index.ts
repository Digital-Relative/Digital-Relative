// supabase/functions/checkin-scheduler/index.ts
// Deploy: supabase functions deploy checkin-scheduler
// Schedule: set up a pg_cron job or Supabase cron to call this daily
// In Supabase SQL Editor:
//   select cron.schedule('daily-checkin-check', '0 9 * * *', $$
//     select net.http_post('https://<project>.supabase.co/functions/v1/checkin-scheduler',
//       headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb) $$);

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async () => {
  const now = new Date()

  // Find all paid users
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, full_name, last_checkin, checkin_frequency_days, plan')
    .in('plan', ['single', 'couples'])
    .not('last_checkin', 'is', null)

  if (error) return new Response(error.message, { status: 500 })

  const results = { reminders: 0, triggers: 0 }

  for (const user of users || []) {
    const last    = new Date(user.last_checkin)
    const freqMs  = user.checkin_frequency_days * 86400000
    const elapsed = now.getTime() - last.getTime()
    const overdue = elapsed - freqMs

    if (overdue < 0) continue // Not overdue yet

    const overdueDays = Math.floor(overdue / 86400000)

    if ([3, 7, 14].includes(overdueDays)) {
      // Send reminder email via Supabase Auth (or your email provider)
      await sendReminderEmail(user, overdueDays)
      results.reminders++
    }

    if (overdueDays >= user.checkin_frequency_days) {
      // Trigger dead man's switch — notify beneficiaries
      await triggerDeadMansSwitch(user.id)
      results.triggers++
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function sendReminderEmail(user: { id: string; full_name: string }, overdueDays: number) {
  // Get user email from auth
  const { data } = await supabase.auth.admin.getUserById(user.id)
  const email    = data.user?.email
  if (!email) return

  // Use Supabase's built-in email or integrate Resend/SendGrid here
  console.log(`Sending ${overdueDays}-day reminder to ${email}`)
  // await resend.emails.send({ to: email, subject: '...', html: '...' })
}

async function triggerDeadMansSwitch(userId: string) {
  // Fetch beneficiaries
  const { data: bens } = await supabase
    .from('beneficiaries')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'confirmed')

  for (const ben of bens || []) {
    // Send access invite email with invite_token
    console.log(`Triggering access for beneficiary ${ben.email} (token: ${ben.invite_token})`)
    // In production: send email with link to /access?token=<invite_token>
  }

  // Log the trigger event
  await supabase.from('checkin_log').insert({
    user_id: userId,
    checked_in_at: new Date().toISOString(),
    ip_address: 'SWITCH_TRIGGERED',
  })
}
