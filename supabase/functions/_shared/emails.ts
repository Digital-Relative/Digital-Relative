// Shared email templates for Digital Relative
// All emails are plain HTML — no external dependencies

// HTML-encode user-supplied content to prevent XSS in emails
function he(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const BASE_STYLE = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background: #0d1b2a;
  margin: 0; padding: 0;
`
const CARD_STYLE = `
  max-width: 560px; margin: 40px auto; padding: 40px 36px;
  background: #0f2236; border-radius: 12px;
  border: 1px solid rgba(201,168,76,0.2);
`
const GOLD = '#c9a84c'
const TEXT = '#dde5ee'
const MUTED = '#7a93aa'

function layout(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Digital Relative</title></head>
<body style="${BASE_STYLE}">
<div style="${CARD_STYLE}">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:${GOLD};font-weight:600;">Digital Relative</div>
    <div style="font-size:11px;color:${MUTED};letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">Secure Legacy Vault</div>
  </div>
  ${content}
  <div style="margin-top:36px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;font-size:11px;color:${MUTED};">
    Digital Relative · Secure Legacy Vault<br>
    <a href="https://digitalrelative.co.uk/privacy.html" style="color:${MUTED};">Privacy Policy</a> ·
    <a href="https://digitalrelative.co.uk/terms.html" style="color:${MUTED};">Terms</a><br><br>
    This email was sent because you have an account at digitalrelative.co.uk.<br>
    If you did not request this, you can safely ignore it.
  </div>
</div>
</body></html>`
}

function heading(text: string): string {
  text = he(text)
  return `<h1 style="font-family:Georgia,serif;font-size:26px;color:#f0ece2;margin:0 0 10px;font-weight:400;">${text}</h1>`
}

function para(text: string): string {
  // Note: para() may receive pre-built HTML — don't encode here
  // callers must encode any user content before passing to para()
  return `<p style="font-size:14px;color:${TEXT};line-height:1.7;margin:0 0 16px;">${text}</p>`
}

function button(text: string, url: string): string {
  // FIX CR-2/TP-1: validate URL and encode text
  if (!url.startsWith('https://')) url = '#'
  text = he(text)
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;
      font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;">${text}</a>
  </div>`
}

function callout(text: string, type: 'info' | 'warning' = 'info'): string {
  const bg = type === 'warning' ? 'rgba(224,82,82,0.1)' : 'rgba(201,168,76,0.08)'
  const border = type === 'warning' ? 'rgba(224,82,82,0.3)' : 'rgba(201,168,76,0.25)'
  return `<div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px;color:${TEXT};line-height:1.6;">${text}</div>`
}

// ── Email templates ──────────────────────────────────────────────────────────

export function checkinReminderEmail(userName: string, overdueDays: number, checkinUrl: string): string {
  return layout(`
    ${heading("It's time to check in")}
    ${para(`Hi ${he(userName || 'there')},`)}
    ${para(`Your Digital Relative check-in is <strong style="color:#e8a44c;">${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue</strong>. Checking in confirms you're well and keeps your vault locked for your beneficiaries.`)}
    ${button("Check in now →", checkinUrl)}
    ${callout("If you don't check in, your beneficiaries will be notified after your chosen check-in period. This is how the service is designed to work - your family's security depends on regular check-ins.", 'info')}
    ${para(`If you no longer need Digital Relative, you can cancel your account in <a href="${checkinUrl}" style="color:${GOLD};">Settings</a>.`)}
  `)
}

export function deadMansSwitchEmail(beneficiaryName: string, ownerName: string, accessUrl: string): string {
  return layout(`
    ${heading("You've been granted vault access")}
    ${para(`Dear ${he(beneficiaryName || 'there')},`)}
    ${para(`We're sorry for your loss. <strong style="color:#f0ece2;">${he(ownerName || 'Your family member')}</strong> has set up Digital Relative to ensure their important information reaches you when needed.`)}
    ${para(`They have nominated you as a beneficiary of their vault. You can now access the information and guidance they've prepared for you.`)}
    ${callout("You will need to verify your identity before accessing any sensitive information. This protects you and the estate.", 'info')}
    ${button("Access vault →", accessUrl)}
    ${para(`If you have any questions or need support during this difficult time, please contact us at <a href="mailto:support@digitalrelative.co.uk" style="color:${GOLD};">support@digitalrelative.co.uk</a>.`)}
    ${para(`<span style="color:${MUTED};font-size:13px;">We're here to help.</span>`)}
  `)
}

export function accessGrantedEmail(beneficiaryName: string, ownerName: string, accessUrl: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Vault access granted</h1>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">Dear ${he(beneficiaryName)},</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">The 48-hour review period for <strong style="color:#f0ece2;">${he(ownerName)}</strong>'s Digital Relative vault has passed. Access has now been granted.</p>
    <p style="font-size:14px;color:${TEXT};line-height:1.7;">You can now view the vault using the link below. Your access level has been set based on the configuration left by ${he(ownerName)}.</p>
    <div style="text-align:center;margin:24px 0;"><a href="${accessUrl}" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;">Access vault →</a></div>
    <p style="font-size:13px;color:${MUTED};line-height:1.7;">If you did not request this access or believe this was sent in error, contact us at support@digitalrelative.co.uk</p>
  `)
}

export function beneficiaryInviteEmail(beneficiaryName: string, ownerName: string, confirmUrl: string): string {
  return layout(`
    ${heading("You've been added as a beneficiary")}
    ${para(`Hi ${he(beneficiaryName || 'there')},`)}
    ${para(`<strong style="color:#f0ece2;">${he(ownerName || 'Someone')}</strong> has added you as a beneficiary on Digital Relative - a secure vault for important passwords, documents, and instructions for family.`)}
    ${para(`This means if something happens to them, you'll be able to access vital information they've stored for you. Please accept this nomination to confirm.`)}
    ${button("Accept nomination →", confirmUrl)}
    ${callout("You don't need an account to accept - just click the button above. If you'd like to store your own information, you can create a free account after accepting.", 'info')}
    ${para(`If you don't recognise this request, you can safely ignore this email. No action is required.`)}
  `)
}

export function partnerInviteEmail(partnerName: string, requesterName: string, inviteUrl: string): string {
  return layout(`
    ${heading("Couples vault invitation")}
    ${para(`Hi ${he(partnerName || 'there')},`)}
    ${para(`<strong style="color:#f0ece2;">${he(requesterName || 'Your partner')}</strong> has invited you to link your Digital Relative vaults as a couple.`)}
    ${para(`Once linked, you'll each keep your own private vault, and get a shared space for joint accounts. You can also choose to share your private vault with your partner - this is optional and can be changed at any time.`)}
    ${button("Create your account →", inviteUrl)}
    ${para(`If you already have a Digital Relative account, sign in and accept the invitation from your dashboard.`)}
    ${callout("If you currently pay for a Single plan, you'll receive a refund for any unused subscription time when you join the Couples vault.", 'info')}
    ${para(`If you don't want to join, you can safely ignore this email.`)}
  `)
}

export function expiryReminderEmail(userName: string, entries: Array<{title: string, expiryDate: string, daysLeft: number}>, vaultUrl: string): string {
  const entryRows = entries.map(e =>
    `<tr><td style="padding:10px 14px;color:${TEXT};font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">${he(e.title)}</td>
     <td style="padding:10px 14px;color:${e.daysLeft < 0 ? '#e05252' : '#e8a44c'};font-size:13px;font-weight:500;border-bottom:1px solid rgba(255,255,255,0.06);">
       ${e.daysLeft < 0 ? `Expired ${Math.abs(e.daysLeft)} days ago` : `Expires in ${e.daysLeft} days`}
     </td></tr>`
  ).join('')

  return layout(`
    ${heading("Vault entries need attention")}
    ${para(`Hi ${he(userName || 'there')},`)}
    ${para(`The following items in your Digital Relative vault are expired or expiring soon:`)}
    <table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.03);border-radius:8px;overflow:hidden;margin:16px 0;">
      <thead><tr>
        <th style="padding:10px 14px;text-align:left;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid rgba(255,255,255,0.1);">Entry</th>
        <th style="padding:10px 14px;text-align:left;font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid rgba(255,255,255,0.1);">Status</th>
      </tr></thead>
      <tbody>${entryRows}</tbody>
    </table>
    ${button("Update in vault →", vaultUrl)}
    ${para(`Keeping your vault up to date ensures your family has accurate information when they need it most.`)}
  `)
}

export function passwordResetWarningEmail(userName: string): string {
  return layout(`
    ${heading("Your login password has been changed")}
    ${para(`Hi ${he(userName || 'there')},`)}
    ${para("Your Digital Relative login password has been successfully changed.")}
    ${callout("<strong>Your vault is unaffected.</strong> Your vault data is encrypted using your vault PIN, which is separate from your login password. You do not need to take any action - your vault will unlock normally when you enter your PIN.")}
    ${para("If you did not request this password change, please contact us immediately at <a href=\"mailto:security@digitalrelative.co.uk\" style=\"color:${GOLD}\">security@digitalrelative.co.uk</a>.")}
  `)
}

export function duressAlertEmail(ownerName: string, time: string, location: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#e05252;margin:0 0 14px;font-weight:400;">⚠️ Duress PIN used</h1>
    ${para(`Hi ${he(ownerName)},`)}
    ${callout("<strong>Your duress PIN was used to access your Digital Relative vault.</strong> If you entered this PIN under coercion or by accident, your real vault data has not been exposed. The person who accessed your account saw only your decoy vault.")}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 12px;background:rgba(255,255,255,0.04);font-size:13px;color:${TEXT};font-weight:600;">Time</td><td style="padding:8px 12px;font-size:13px;color:${TEXT};">${he(time)}</td></tr>
      <tr><td style="padding:8px 12px;background:rgba(255,255,255,0.04);font-size:13px;color:${TEXT};font-weight:600;">Location</td><td style="padding:8px 12px;font-size:13px;color:${TEXT};">${he(location)}</td></tr>
    </table>
    ${para("If this was you by accident, you can log in normally with your real vault PIN. If you are in danger, please contact the relevant emergency services.")}
    ${para("If you need to change your duress PIN, sign in and go to Settings.")}
  `)
}

export function duressAdminAlertEmail(userEmail: string, time: string, location: string): string {
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#e05252;margin:0 0 14px;font-weight:400;">Admin: Duress PIN triggered</h1>
    ${para("A duress PIN was used on the following account:")}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 12px;background:rgba(255,255,255,0.04);font-size:13px;color:${TEXT};font-weight:600;">Account</td><td style="padding:8px 12px;font-size:13px;color:${TEXT};">${he(userEmail)}</td></tr>
      <tr><td style="padding:8px 12px;background:rgba(255,255,255,0.04);font-size:13px;color:${TEXT};font-weight:600;">Time</td><td style="padding:8px 12px;font-size:13px;color:${TEXT};">${he(time)}</td></tr>
      <tr><td style="padding:8px 12px;background:rgba(255,255,255,0.04);font-size:13px;color:${TEXT};font-weight:600;">Location</td><td style="padding:8px 12px;font-size:13px;color:${TEXT};">${he(location)}</td></tr>
    </table>
    ${para("The user saw the decoy vault only. No real vault data was exposed. This is an automated security alert.")}
  `)
}

export function monthlyHealthEmail(userName: string, entryCount: number, issues: string[]): string {
  const hasIssues = issues.length > 0
  return layout(`
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#f0ece2;margin:0 0 14px;font-weight:400;">Your monthly vault summary</h1>
    ${para(`Hi ${he(userName)},`)}
    ${para(`Your Digital Relative vault currently has <strong style="color:var(--gold)">${entryCount}</strong> entr${entryCount === 1 ? 'y' : 'ies'} stored.`)}
    ${hasIssues
      ? callout(`<strong>Items that may need attention:</strong><ul style="margin:8px 0 0;padding-left:20px;">${issues.map(i => `<li style="margin-bottom:4px;">${he(i)}</li>`).join('')}</ul>`)
      : callout('Everything looks good. Your vault is up to date and your beneficiaries are confirmed.')
    }
    ${para('Keeping your vault up to date means your family will have everything they need when it matters most.')}
    <div style="text-align:center;margin:24px 0;">
      <a href="https://digitalrelative.co.uk" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;">Review your vault</a>
    </div>
  `)
}

export function newBeneficiaryNotificationEmail(ownerName: string, beneficiaryName: string, beneficiaryEmail: string, settingsUrl: string): string {
  return layout(`
    ${heading("A new beneficiary has been added to your vault")}
    ${para(`Hi ${he(ownerName)},`)}
    ${para(`<strong style="color:var(--cream-c)">${he(beneficiaryName)}</strong> (${he(beneficiaryEmail)}) has been added as a beneficiary on your Digital Relative vault.`)}
    ${callout("If you did not add this person, please remove them immediately and change your password. Your vault data is encrypted and cannot be read without your vault PIN, but a malicious beneficiary could submit a fake death certificate.")}
    <div style="text-align:center;margin:20px 0;">
      <a href="${settingsUrl}" style="display:inline-block;background:${GOLD};color:#0d1b2a;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Review beneficiaries</a>
    </div>
    ${para(`If you added this person yourself, no action is needed.`)}
  `)
}
