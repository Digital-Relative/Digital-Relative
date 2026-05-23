export default function TermsPage() {
  const LAST_UPDATED = '1 June 2025'

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Terms of Service</h1>
        <p className="page-sub">Last updated {LAST_UPDATED} - Governing law: England and Wales</p>
      </div>

      <div className="fade-up-2 card-static" style={{ marginBottom: 4, borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
        <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
          Please read these terms carefully before using Digital Relative. By creating an account you agree to be bound by these terms.
        </p>
      </div>

      {[
        {
          title: '1. About the service',
          body: 'Digital Relative provides a secure digital legacy vault that allows users to store encrypted account credentials and personal information for access by nominated beneficiaries. The service is operated by Digital Relative, registered in England and Wales.',
        },
        {
          title: '2. Eligibility',
          body: 'You must be at least 18 years old to use the service. By registering, you confirm you are 18 or over and have the legal capacity to enter into this agreement.',
        },
        {
          title: '3. Your account',
          body: 'You are responsible for maintaining the confidentiality of your password and vault PIN. You must notify us immediately of any unauthorised access at security@digitalrelative.co.uk. We cannot recover lost vault contents if you forget your vault PIN - your data is end-to-end encrypted and we hold no copy of your encryption key. You are responsible for all activity that occurs under your account.',
        },
        {
          title: '4. Subscriptions and payment',
          content: (
            <div>
              <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 10 }}>We offer three plans:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {[
                  ['Free', 'Up to 5 vault entries and 1 beneficiary. No charge.'],
                  ['Single', 'Unlimited entries. £18 per year, billed annually.'],
                  ['Couples', 'Shared vault for two people. £5 per month or £45 per year.'],
                ].map(([plan, desc]) => (
                  <div key={plan} style={{ fontSize: 14, color: 'var(--cream-dim)', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <strong style={{ color: 'var(--cream)' }}>{plan}</strong> - {desc}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
                All prices include VAT where applicable. Payments are processed by Stripe Payments UK Ltd, authorised by the FCA. Subscriptions renew automatically unless cancelled. You may cancel at any time through Settings. No refunds for partial billing periods except where required by UK consumer law.
              </p>
            </div>
          ),
        },
        {
          title: '5. The check-in and dead man\'s switch',
          body: 'The check-in feature will notify your beneficiaries if you fail to check in within your chosen period. You are solely responsible for ensuring your check-in preferences are set correctly and that your beneficiaries\' contact details are accurate. Digital Relative accepts no liability for failure of beneficiary notification caused by incorrect contact details, email delivery failures, or beneficiaries not acting on notifications.',
          warning: 'If you do not check in and do not respond to reminder emails, your beneficiaries will receive access requests to your vault. Set your check-in frequency appropriately for your circumstances.',
        },
        {
          title: '6. Encryption and data recovery',
          body: 'Your vault contents are encrypted on your device using your vault PIN before transmission. Digital Relative has no access to your vault PIN or encryption key and cannot recover your data if you lose your PIN. You are solely responsible for maintaining access to your vault PIN. Resetting your login password does not affect vault encryption.',
        },
        {
          title: '7. Acceptable use',
          content: (
            <div>
              <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, marginBottom: 8 }}>You may not use the service to:</p>
              {[
                'Store illegal content or facilitate illegal activity',
                'Infringe the intellectual property rights of others',
                'Attempt to gain unauthorised access to other accounts or our systems',
                'Upload malware or malicious content',
                'Provide false information about the death of another person to gain beneficiary access',
                'Use the service for commercial resale without our written consent',
              ].map((item, i) => (
                <div key={i} style={{ fontSize: 14, color: 'var(--cream-dim)', padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--danger)', flexShrink: 0 }}>x</span>{item}
                </div>
              ))}
            </div>
          ),
        },
        {
          title: '8. Availability and changes',
          body: 'We aim for 99.9% uptime but do not guarantee uninterrupted service. We may modify, suspend, or discontinue the service at any time with reasonable notice. We will provide at least 30 days\' notice of any discontinuation, during which you may export your data free of charge.',
        },
        {
          title: '9. Limitation of liability',
          body: 'To the maximum extent permitted by English law, Digital Relative shall not be liable for any indirect, incidental, special, or consequential damages, including loss of data, arising from use of the service. Our total liability shall not exceed the total fees paid by you in the 12 months preceding the claim. Nothing in these terms excludes liability for death, personal injury caused by negligence, or fraud.',
        },
        {
          title: '10. Termination',
          body: 'We may terminate or suspend your account for breach of these terms, with or without notice depending on severity. You may delete your account at any time through Settings. On termination, all your data will be permanently deleted within 30 days, with audit logs anonymised as required by law.',
        },
        {
          title: '11. Governing law',
          body: 'These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
        },
        {
          title: '12. Changes to these terms',
          body: 'We will notify you by email at least 14 days before any material changes take effect. Continued use after the effective date constitutes acceptance. If you do not accept updated terms, you may close your account and export your data before changes take effect.',
        },
        {
          title: '13. Contact',
          content: (
            <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>
              For queries regarding these terms:{' '}
              <a href="mailto:legal@digitalrelative.co.uk" style={{ color: 'var(--gold)' }}>legal@digitalrelative.co.uk</a>
            </p>
          ),
        },
      ].map(section => (
        <div key={section.title} className="fade-up-2 card-static" style={{ marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--cream)', marginBottom: 10 }}>{section.title}</h2>
          {section.body && <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8 }}>{section.body}</p>}
          {section.content}
          {section.warning && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--danger)' }}>Important: </strong>{section.warning}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
