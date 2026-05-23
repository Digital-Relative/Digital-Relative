// Resend email client
// Sign up at resend.com, add RESEND_API_KEY to Supabase secrets

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL     = 'Digital Relative <noreply@digitalrelative.co.uk>'

export interface SendEmailParams {
  to:      string | string[]
  subject: string
  html:    string
  replyTo?: string
}

// FIX TP-EA-2: Resend free tier = 100 emails/day, 3,000/month
// For production: upgrade to Resend Pro (starts at $20/month for 50,000 emails)
// At launch, monitor daily email count to avoid hitting limits
// Batch emails where possible (one expiry email per user, not per entry)

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - email not sent:', params.subject)
    return false
  }

  try {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          from:     FROM_EMAIL,
          to:       Array.isArray(params.to) ? params.to : [params.to],
          subject:  params.subject,
          html:     params.html,
          reply_to: params.replyTo || 'support@digitalrelative.co.uk',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Resend error:', err)
        return false
      }

      return true
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('Email send failed:', err.message)
    return false
  }
}
