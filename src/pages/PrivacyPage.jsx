export default function PrivacyPage() {
  const LAST_UPDATED = '1 June 2025'

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-sub">Last updated {LAST_UPDATED}</p>
      </div>

      <div className="fade-up-2 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>Who we are</h2>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          Digital Relative is a digital legacy vault service for UK families. We are the data controller for personal data processed through this service.
          Contact us at <a href="mailto:privacy@digitalrelative.co.uk" style={{ color: 'var(--gold)' }}>privacy@digitalrelative.co.uk</a> with any data protection queries.
        </p>
      </div>

      <div className="fade-up-2 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>What data we collect</h2>
        <div style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>We collect the following categories of data:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Account data', 'Your name, email address, and encrypted password hash. Collected at registration.'],
              ['Vault data', 'The account names, usernames, notes, and addresses you store. All vault fields are encrypted with AES-256-GCM using a key derived from your vault PIN. We cannot read this data.'],
              ['Beneficiary data', 'Names and email addresses of people you designate as beneficiaries.'],
              ['Payment data', 'Handled entirely by Stripe. We store only a Stripe customer ID - no card numbers.'],
              ['Identity verification data', 'If you or a beneficiary uses our emergency access feature, photo ID and a death certificate may be submitted. This is processed by Onfido, a UK company.'],
              ['Device and security data', 'IP addresses and device type are logged when you sign in to detect unauthorised access. Approximate location is derived from Cloudflare infrastructure headers without any third-party lookup.'],
              ['Communications', 'If you contact us by email, we retain that correspondence.'],
            ].map(([name, desc]) => (
              <div key={name} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: 4 }}>{name}</div>
                <div>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>Legal basis for processing</h2>
        <div style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>Under UK GDPR we process your data on the following bases:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Contract', 'Account registration, vault storage, and subscription management are necessary to provide the service you signed up for.'],
              ['Legitimate interests', 'Security logging (device and sign-in records) to protect you from unauthorised access to your account.'],
              ['Legal obligation', 'Retaining transaction records as required by UK financial regulation.'],
              ['Consent', 'Marketing emails and partner offers, where you have opted in. You can withdraw consent at any time in Settings.'],
            ].map(([basis, desc]) => (
              <div key={basis} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--gold)' }}>{basis}: </span>{desc}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>Where your data is stored</h2>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 14 }}>
          All vault data is stored in the UK. We do not transfer personal data outside the UK except as described below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { name: 'Supabase (London)', location: 'UK', purpose: 'Database, authentication, file storage. AWS eu-west-2, physically in the UK. All vault data.' },
            { name: 'Onfido', location: 'UK', purpose: 'Identity verification and death certificate processing. UK company, London HQ.' },
            { name: 'GetAddress.io', location: 'UK', purpose: 'UK postcode lookup. UK company, UK servers. Only a postcode is sent - no personal data.' },
            { name: 'Stripe', location: 'UK', purpose: 'Payment processing. Stripe Payments UK Ltd is authorised by the FCA. No card data passes through our servers.' },
            { name: 'Resend', location: 'UK/EU', purpose: 'Transactional email delivery. UK entity. Emails contain your name and notification content but never vault data.' },
            { name: 'Cloudflare', location: 'Global CDN', purpose: 'Serves the application\'s static files (code, images). No personal data. Location information for security alerts is derived from Cloudflare\'s own headers - no data is sent to Cloudflare by us.' },
          ].map(p => (
            <div key={p.name} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>{p.purpose}</div>
              </div>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 99, flexShrink: 0, whiteSpace: 'nowrap',
                background: p.location === 'UK' ? 'rgba(76,175,130,0.15)' : 'rgba(255,255,255,0.06)',
                color: p.location === 'UK' ? 'var(--success)' : 'var(--text-sub)',
                border: `1px solid ${p.location === 'UK' ? 'rgba(76,175,130,0.3)' : 'var(--border)'}`,
              }}>{p.location}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>How long we keep your data</h2>
        <div style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          {[
            ['Active accounts', 'Kept for the duration of your account and 30 days after deletion to allow recovery.'],
            ['Deleted accounts', 'All vault data and personal information is permanently deleted. Audit logs are anonymised (user ID removed) but retained for security purposes.'],
            ['Payment records', 'Stripe transaction IDs are retained for 7 years as required by UK financial regulation. No card data is stored by us.'],
            ['Device logs', 'Sign-in logs are retained for 90 days then automatically deleted.'],
          ].map(([period, desc]) => (
            <div key={period} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, color: 'var(--cream)' }}>{period}: </span>{desc}
            </div>
          ))}
        </div>
      </div>

      <div className="fade-up-4 card-static" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>Your rights under UK GDPR</h2>
        <div style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>You have the following rights regarding your personal data:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Right of access', 'Request a copy of all data we hold about you. Use the data export feature in Settings.'],
              ['Right to rectification', 'Correct inaccurate data. Update your profile in Settings at any time.'],
              ['Right to erasure', 'Delete your account and all associated data permanently. Use the delete account option in Settings.'],
              ['Right to restriction', 'Ask us to restrict processing of your data while a complaint is being investigated.'],
              ['Right to portability', 'Receive your data in a machine-readable format. Use the data export in Settings.'],
              ['Right to object', 'Object to processing based on legitimate interests, including marketing emails. Opt out in Settings.'],
            ].map(([right, desc]) => (
              <div key={right} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: 2 }}>{right}</div>
                <div>{desc}</div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 14 }}>
            To exercise any right, contact <a href="mailto:privacy@digitalrelative.co.uk" style={{ color: 'var(--gold)' }}>privacy@digitalrelative.co.uk</a>.
            You also have the right to lodge a complaint with the ICO at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>ico.org.uk</a>.
          </p>
        </div>
      </div>

      <div className="fade-up-4 card-static">
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 12 }}>Changes to this policy</h2>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          We will notify you by email of any material changes to this policy. The current version is always available on this page.
          Continued use of the service after notification constitutes acceptance.
        </p>
      </div>
    </div>
  )
}
