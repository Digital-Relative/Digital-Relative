export default function AboutPage() {
  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">About Digital Relative</h1>
        <p className="page-sub">Why we built this and how it works</p>
      </div>

      <div className="fade-up-2 card-static" style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 14 }}>Our story</h2>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 12 }}>
          Digital Relative was built after we watched families struggle in the aftermath of a bereavement. Not just with grief, but with the practical chaos that follows - trying to find passwords, cancel subscriptions, locate insurance policies, and figure out who to notify.
        </p>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 12 }}>
          The average person has 90 online accounts. Families typically spend over 400 hours dealing with estate administration. We built Digital Relative to change that.
        </p>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          Our goal is simple: when the time comes, your family should be able to focus on each other - not on admin.
        </p>
      </div>

      <div className="fade-up-3 card-static" style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 14 }}>How your data is protected</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            ['🔑 Zero-knowledge encryption', 'Your vault PIN never leaves your device. We use it to derive an AES-256 encryption key entirely in your browser. We cannot read your vault data - ever. Not even in a data breach, not even under legal compulsion.'],
            ['🔒 Military-grade encryption', 'Every vault entry is encrypted with AES-256-GCM, the same standard used by governments and financial institutions. Each encryption uses a unique random initialisation vector.'],
            ['🔢 600,000 PBKDF2 iterations', 'Your PIN is hardened with 600,000 rounds of PBKDF2-SHA256 - well above OWASP 2024 recommendations. This makes brute-force attacks computationally infeasible.'],
            ['🛡️ Two-factor authentication', 'Email and password users are required to set up two-factor authentication using an authenticator app or email codes. Google users benefit from Google\'s own 2FA.'],
            ['⏰ Inactivity auto-lock', 'Your vault automatically locks after 30 minutes of inactivity. Re-entry of your PIN is required to decrypt your data again.'],
            ['🏛️ UK data storage', 'All vault data is stored in Supabase\'s London region (physically located in the UK). We are registered with the ICO and comply with UK GDPR. Your data never leaves the UK.'],
          ].map(([title, detail]) => (
            <div key={title} style={{ display: 'flex', gap: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{title.split(' ')[0]}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--cream)' }}>{title.slice(3)}</div>
                <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-up-4 card-static" style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 14 }}>Data storage and sub-processors</h2>
        <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 14 }}>
          We are committed to keeping your data in the UK wherever possible. Here is exactly where your data goes and why.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { flag: '🇬🇧', name: 'Supabase (London)', purpose: 'Database, authentication, file storage, and edge functions. All vault data is stored here. AWS eu-west-2, physically in the UK.', uk: true },
            { flag: '🇬🇧', name: 'Onfido', purpose: 'Identity verification and death certificate processing for beneficiary access. UK company, London HQ.', uk: true },
            { flag: '🇬🇧', name: 'Royal Mail AddressNow', purpose: 'UK address lookup using the Postcode Address File (PAF). Royal Mail, UK servers.', uk: true },
            { flag: '🇬🇧', name: 'Resend', purpose: 'Transactional email delivery (OTP codes, notifications, invites). UK entity available; email content contains names but never vault data.', uk: true },
            { flag: '🇬🇧', name: 'Stripe', purpose: 'Payment processing. Stripe has a UK entity and processes UK payments under UK financial regulation.', uk: true },
            { flag: '🌐', name: 'Cloudflare', purpose: 'Serves the application globally via CDN. Static files only - no user data. Approximate location data derived from Cloudflare headers without any third-party lookup.', uk: false },
          ].map(p => (
            <div key={p.name} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{p.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>{p.purpose}</div>
              </div>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 99, flexShrink: 0,
                background: p.uk ? 'rgba(76,175,130,0.15)' : 'rgba(255,255,255,0.06)',
                color: p.uk ? 'var(--success)' : 'var(--text-sub)',
                border: `1px solid ${p.uk ? 'rgba(76,175,130,0.3)' : 'var(--border)'}`,
              }}>{p.uk ? 'UK/EU' : 'Global CDN'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-up-4 card-static">
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 14 }}>Contact us</h2>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          Questions, feedback, or concerns - we'd love to hear from you.
        </p>
        <a href="mailto:hello@digitalrelative.co.uk" style={{ color: 'var(--gold)', fontSize: 14 }}>
          hello@digitalrelative.co.uk
        </a>
      </div>
    </div>
  )
}
