// Twilio SMS helper — only sends if TWILIO_ACCOUNT_SID is configured
// Falls back silently if not configured (SMS is optional - email still sent)

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 10_000): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

  // SMS not configured - silently skip
  if (!accountSid || !authToken || !fromNumber) return false

  // Validate E.164 format before sending
  if (!/^\+[1-9]\d{7,14}$/.test(to)) return false

  // Sanitise body - strip any HTML and limit length
  const safeBody = body.replace(/<[^>]*>/g, '').slice(0, 160)

  try {
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: safeBody }).toString(),
      }
    )
    return res.ok
  } catch {
    return false
  }
}
