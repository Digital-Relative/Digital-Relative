import { useState, useEffect } from 'react'
import SEO from '../components/SEO'

// ── Helpers ──────────────────────────────────────────────────────────────────
function TreeMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <g transform="translate(50,58)">
        <rect x="-4" y="6" width="8" height="24" rx="2" fill="#c9a84c"/>
        <path d="M-4,30 Q-11,36 -18,32 M4,30 Q11,36 18,32 M0,30 L0,36" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M0,6 L0,-5 M0,0 L-16,-14 M0,0 L16,-14 M-16,-14 L-26,-26 M-16,-14 L-10,-28 M16,-14 L26,-26 M16,-14 L10,-28 M0,-5 L-6,-21 M0,-5 L6,-21" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="-26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="-10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="-6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="0" cy="-38" r="7" fill="#c9a84c"/>
      </g>
    </svg>
  )
}

const GOLD = '#c9a84c'
const NAVY = '#0d1b2a'
const NAVY_MID = '#0f2236'
const NAVY_LT = '#162d44'
const CREAM = '#f0ece2'
const CREAM_DIM = '#dde5ee'
const TEXT_SUB = '#7a93aa'
const BORDER = 'rgba(255,255,255,0.08)'
const GOLD_BORDER = 'rgba(201,168,76,0.25)'
const GOLD_DIM = 'rgba(201,168,76,0.08)'

// ── Main component ─────────────────────────────────────────────────────────
function AnimatedTree() {
  return (
    <svg width="120" height="120" viewBox="0 0 100 100" style={{ margin: '0 auto 28px', display: 'block' }}>
      <style>{`
        @keyframes drawBranch { from { stroke-dashoffset: 200; } to { stroke-dashoffset: 0; } }
        @keyframes popCircle  { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeRoot   { from { opacity: 0; transform: scaleY(0); } to { opacity: 1; transform: scaleY(1); } }
        .dr-branch { stroke-dasharray: 200; stroke-dashoffset: 200; animation: drawBranch 1.2s ease forwards; }
        .dr-circle { transform-origin: center; transform: scale(0); opacity: 0; animation: popCircle 0.4s ease forwards; }
        .dr-root   { transform-origin: bottom; animation: fadeRoot 0.4s ease forwards; }
      `}</style>
      <g transform="translate(50,60)">
        {/* Trunk */}
        <rect className="dr-root" x="-4" y="4" width="8" height="22" rx="2" fill="#c9a84c"
          style={{ animationDelay: '0s' }} />
        {/* Root tendrils */}
        <path className="dr-branch" d="M-4,26 Q-11,32 -18,28 M4,26 Q11,32 18,28"
          fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"
          style={{ animationDelay: '0.3s' }} />
        {/* Main branches */}
        <path className="dr-branch" d="M0,4 L0,-6 M0,-1 L-16,-15 M0,-1 L16,-15"
          fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round"
          style={{ animationDelay: '0.5s' }} />
        {/* Secondary branches */}
        <path className="dr-branch" d="M-16,-15 L-26,-27 M-16,-15 L-10,-29 M16,-15 L26,-27 M16,-15 L10,-29 M0,-6 L-6,-22 M0,-6 L6,-22"
          fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"
          style={{ animationDelay: '0.8s' }} />
        {/* Foliage circles */}
        {[
          [-26,-31,7,'0s'],[-10,-33,5.5,'0.1s'],[26,-31,7,'0.15s'],[10,-33,5.5,'0.2s'],
          [-6,-26,4.5,'0.25s'],[6,-26,4.5,'0.3s'],[0,-39,8,'0.35s'],
        ].map(([cx,cy,r,delay], i) => (
          <circle key={i} className="dr-circle" cx={cx} cy={cy} r={r} fill="#c9a84c"
            opacity={i < 4 ? 0.9 : 0.85}
            style={{ animationDelay: `${1.0 + parseFloat(delay)}s`, transformOrigin: `${cx}px ${cy}px` }} />
        ))}
      </g>
    </svg>
  )
}

export default function LandingPage({ onLogin, onSignup, onPlan }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [billingAnnual, setBillingAnnual] = useState(true)
  const [faqOpen, setFaqOpen] = useState(null)

  const PRICE_IDS = {
    single_annual:   'price_1TYuBBAT0bYW1W6mK3STHKbN',
    couples_monthly: 'price_1TYuBOAT0bYW1W6mOOnhSy11',
    couples_annual:  'price_1TYuBcAT0bYW1W6mD5OGw2Mm',
  }

  useEffect(() => {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault()
        const el = document.querySelector(a.getAttribute('href'))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      })
    })
  }, [])

  const faqs = [
    { q: 'Is my data safe?', a: 'Your vault is encrypted with AES-256, the same standard used by banks and the military. Your data is stored exclusively in the UK (Supabase London). We cannot read your data even if we wanted to, and neither can anyone else without your PIN.' },
    { q: 'Who can access my vault?', a: 'Only the people you choose. You nominate beneficiaries and set their access level. They cannot access anything until the check-in protection fires or a verified death certificate is submitted, and even then there is a mandatory 48-hour hold before access is granted.' },
    { q: 'What is the check-in protection?', a: 'You set a check-in frequency, say every 30 days. If you stop checking in, Digital Relative sends you reminders. If you still do not check in after your full frequency period has passed, your nominated beneficiaries are notified. Nothing happens automatically without this trigger.' },
    { q: 'Do I need a will?', a: 'Digital Relative does not replace a will, but it works alongside one. We strongly recommend making a will if you have not. Your vault can store your solicitor\'s details and the location of your will so your family can find it quickly.' },
    { q: 'What if I forget my vault PIN?', a: 'Your vault PIN cannot be reset or recovered because we do not store it. If you forget it, your vault contents are permanently inaccessible. We recommend writing your PIN in a secure place, such as stored with your will or in a safe.' },
    { q: 'Can I cancel at any time?', a: 'Yes. Cancel from the My Plan page and your subscription ends at the next billing date. Your data remains accessible until then. After cancellation your account moves to the free plan.' },
    { q: 'Is Digital Relative available outside the UK?', a: 'Digital Relative is designed for UK users and UK laws, particularly around probate, inheritance, and the Tell Me Once service. International users can sign up but some guidance may not apply to their jurisdiction.' },
    { q: 'What if I become incapacitated rather than dying?', a: 'Your vault can be accessed by your executor if they submit a valid power of attorney document through the emergency access flow. The same 48-hour hold applies. We recommend storing your LPA details in your vault.' },
  ]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: NAVY, color: CREAM, overflowX: 'hidden' }}>
      <SEO
        title="Digital Relative — Secure UK Digital Legacy Vault for Your Family"
        description="The secure UK digital legacy vault. Store passwords, accounts, documents and final wishes in a zero-knowledge AES-256 encrypted vault your family can access when they need it. UK data residency, ICO-registered."
        path="/"
        jsonLd={faqJsonLd}
      />

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(13,27,42,0.96)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${BORDER}`,
        padding: '0 20px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <TreeMark size={28} />
          <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 17, color: GOLD, fontWeight: 600 }}>Digital Relative</span>
        </a>

        {/* Desktop nav links - hidden on mobile */}
        <div style={{ display: 'flex', gap: 24, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}
          className="landing-desktop-nav">
          {[['#how-it-works','How it works'],['#features','Features'],['#pricing','Pricing'],['#resources','Resources'],['#faq','FAQ']].map(([href,label]) => (
            <a key={href} href={href} style={{ fontSize: 13, color: TEXT_SUB, textDecoration: 'none', whiteSpace: 'nowrap' }}
              onMouseEnter={e => e.target.style.color = CREAM} onMouseLeave={e => e.target.style.color = TEXT_SUB}>
              {label}
            </a>
          ))}
        </div>

        {/* Right side - desktop buttons + mobile hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Desktop buttons */}
          <button onClick={onLogin} className="landing-desktop-nav" style={{
            background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 8, color: CREAM_DIM, padding: '7px 16px',
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Log in</button>
          <button onClick={onSignup} className="landing-desktop-nav" style={{
            background: GOLD, border: 'none',
            borderRadius: 8, color: NAVY, padding: '7px 16px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Get started free</button>

          {/* Mobile: just a get started button + hamburger */}
          <button onClick={onSignup} className="landing-mobile-nav" style={{
            background: GOLD, border: 'none', borderRadius: 8, color: NAVY,
            padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Start free</button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="landing-mobile-nav" style={{
            background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8,
            color: CREAM, padding: '7px 10px', fontSize: 16, cursor: 'pointer', lineHeight: 1,
          }}>☰</button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(13,27,42,0.99)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TreeMark size={28} />
              <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 17, color: GOLD, fontWeight: 600 }}>Digital Relative</span>
            </div>
            <button onClick={() => setMenuOpen(false)} style={{
              background: 'transparent', border: 'none', color: CREAM,
              fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* Nav links */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {[
              ['#how-it-works', 'How it works', '◈'],
              ['#features', 'Features', '⬡'],
              ['#pricing', 'Pricing', '◇'],
              ['#resources', 'Resources', '🔗'],
              ['#faq', 'FAQ', '?'],
            ].map(([href, label, icon]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 0', borderBottom: `1px solid ${BORDER}`,
                textDecoration: 'none', color: CREAM, fontSize: 17,
                fontFamily: "'Cormorant Garamond', Georgia, serif",
              }}>
                <span style={{ color: GOLD, fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
                {label}
              </a>
            ))}
          </nav>

          {/* CTA buttons */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { setMenuOpen(false); onSignup() }} style={{
              background: GOLD, color: NAVY, border: 'none',
              borderRadius: 10, padding: '14px', fontSize: 15,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Get started free</button>
            <button onClick={() => { setMenuOpen(false); onLogin() }} style={{
              background: 'transparent', color: CREAM, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '14px', fontSize: 15,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Log in</button>
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '120px 24px 80px',
        background: `radial-gradient(ellipse at 30% 40%, rgba(201,168,76,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(15,32,53,0.8) 0%, transparent 50%)`,
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 760 }}>
          <AnimatedTree />

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`,
            borderRadius: 99, padding: '6px 16px', marginBottom: 32,
            fontSize: 12, color: GOLD, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <span>Secure digital legacy vault for UK families</span>
          </div>

          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(42px, 7vw, 80px)',
            fontWeight: 400, lineHeight: 1.1,
            color: CREAM, marginBottom: 24,
            letterSpacing: '-0.02em',
          }}>
            Protect what matters.
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2.5vw, 20px)',
            color: CREAM_DIM, lineHeight: 1.8,
            maxWidth: 580, margin: '0 auto 16px',
          }}>
            Something that actually works when it matters most.
          </p>

          <p style={{
            fontSize: 15, color: TEXT_SUB, lineHeight: 1.8,
            maxWidth: 520, margin: '0 auto 44px',
          }}>
            Store your passwords, accounts, documents, and final wishes in an encrypted vault.
            Your family gets access when they need it. Not before.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onSignup} style={{
              background: GOLD, color: NAVY, border: 'none',
              borderRadius: 10, padding: '16px 36px',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 8px 32px rgba(201,168,76,0.25)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 12px 40px rgba(201,168,76,0.35)' }}
              onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 8px 32px rgba(201,168,76,0.25)' }}>
              Start for free
            </button>
            <a href="#how-it-works" style={{
              background: 'transparent', color: CREAM_DIM,
              border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: '16px 36px', fontSize: 15, cursor: 'pointer',
              textDecoration: 'none', display: 'inline-block',
              transition: 'border-color 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { e.target.style.borderColor = GOLD_BORDER; e.target.style.color = CREAM }}
              onMouseLeave={e => { e.target.style.borderColor = BORDER; e.target.style.color = CREAM_DIM }}>
              See how it works
            </a>
          </div>

          {/* Trust bar */}
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 56, flexWrap: 'wrap' }}>
            {['AES-256 encrypted','UK GDPR compliant','UK data storage','Zero-knowledge','Free to start'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TEXT_SUB }}>
                <span style={{ color: GOLD }}>✓</span> {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ── */}
      <section style={{ padding: '96px 24px', background: NAVY_MID }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 20 }}>
            What families face when someone dies
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, lineHeight: 1.8, maxWidth: 640, margin: '0 auto 56px' }}>
            The average family spends over 400 hours on estate administration after a bereavement. Most of that time is spent looking for information that should have been easy to find.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              { stat: '56%', label: 'of adults have no will', icon: '📜' },
              { stat: '£15bn', label: 'in unclaimed pensions in the UK', icon: '💰' },
              { stat: '400+', label: 'hours spent on estate admin', icon: '⏱️' },
              { stat: '1 in 3', label: 'families struggle to find key documents', icon: '📁' },
            ].map(({ stat, label, icon }) => (
              <div key={stat} style={{
                background: NAVY, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '28px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 36, color: GOLD, fontWeight: 600, marginBottom: 6 }}>{stat}</div>
                <div style={{ fontSize: 13, color: TEXT_SUB, lineHeight: 1.6 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 48, padding: '32px 36px',
            background: GOLD_DIM, border: `1px solid ${GOLD_BORDER}`,
            borderRadius: 14, textAlign: 'left', maxWidth: 640, margin: '48px auto 0',
          }}>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: CREAM, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
              "I built Digital Relative for my wife. Like most people, we had a document somewhere with the important things written down. But it was always out of date, and if something had happened to me, she would have been dealing with two young children and my death at the same time.
            </p>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: CREAM, lineHeight: 1.7, margin: '16px 0 0', fontStyle: 'italic' }}>
              Then I watched my dad lose his mum. The grief barely got a chance to land because he spent months fielding calls and chasing paperwork. He didn't really grieve until it was all sorted.
            </p>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: CREAM, lineHeight: 1.7, margin: '16px 0 0', fontStyle: 'italic' }}>
              Digital Relative is the thing I wished we had. Something that actually works when it matters most."
            </p>
            <div style={{ marginTop: 20, fontSize: 13, color: TEXT_SUB }}>Dan, founder of Digital Relative</div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 16 }}>
            How it works
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, marginBottom: 64 }}>Three simple steps. Set it up once, keep it updated, know your family is protected.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {[
              { step: '01', icon: '🔐', title: 'Add your information', body: 'Store passwords, bank accounts, pension details, insurance policies, and important documents in your encrypted vault. Everything in one place.' },
              { step: '02', icon: '👤', title: 'Choose your beneficiaries', body: 'Nominate the people who should have access. Set what each person can see. Designate an executor to manage the process.' },
              { step: '03', icon: '◎', title: 'Check in regularly', body: 'Set your check-in frequency. If you stop checking in, your beneficiaries are notified. Your family is protected without you having to do anything extra.' },
            ].map(({ step, icon, title, body }) => (
              <div key={step} style={{
                background: NAVY_MID, border: `1px solid ${BORDER}`,
                borderRadius: 14, padding: '36px 28px', textAlign: 'left',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 16, right: 20,
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 64, color: 'rgba(201,168,76,0.07)', fontWeight: 700, lineHeight: 1,
                }}>{step}</div>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: CREAM, marginBottom: 12, fontWeight: 400 }}>{title}</h3>
                <p style={{ fontSize: 14, color: TEXT_SUB, lineHeight: 1.8, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '96px 24px', background: NAVY_MID }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 16 }}>
            Everything your family needs
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, marginBottom: 64 }}>Built around what families actually struggle with after a bereavement.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { icon: '🔐', title: 'Encrypted vault', body: 'Store passwords, account details, and sensitive information. Encrypted with AES-256 before it ever leaves your device. We cannot read it.' },
              { icon: '📁', title: 'Document storage', body: 'Upload passports, birth certificates, insurance policies, and important documents. Accessible to your family when they need them.' },
              { icon: '💛', title: 'After I\'m Gone guide', body: 'Leave a personal guide for your family. Funeral wishes, messages to loved ones, what to do first. The most important thing you can leave behind.' },
              { icon: '◎', title: 'Check-in protection', body: 'Check in regularly. If you stop, your beneficiaries are notified automatically. Gives your family the access they need without any guesswork.' },
              { icon: '👤', title: 'Beneficiary access', body: 'Nominate who gets access and at what level. They verify their identity before accessing anything. Passwords are never accessible.' },
              { icon: '🔒', title: 'Zero-knowledge security', body: 'Your vault PIN never leaves your device. Your encryption key is derived from your PIN. Even if our servers were compromised, your data is unreadable.' },
              { icon: '👨‍👩‍👧‍👦', title: 'Family information', body: 'Store GP details, school contacts, emergency numbers, and family information your family would need immediately after a bereavement.' },
              { icon: '💑', title: 'Couples vault', body: 'Link vaults with your partner. Share entries, set joint beneficiaries, and ensure both of you are covered under a single subscription.' },
              { icon: '🔗', title: 'Secure share links', body: 'Share individual vault entries with someone securely, without giving them full access to your vault. Links expire automatically.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{
                background: NAVY, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '28px 24px', textAlign: 'left',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = GOLD_BORDER}
                onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: CREAM, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: TEXT_SUB, lineHeight: 1.7, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 16 }}>
            Simple, honest pricing
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, marginBottom: 36 }}>Start free. Upgrade when you are ready. Cancel any time.</p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 48 }}>
            {['Annual', 'Monthly'].map((label, i) => (
              <button key={label} onClick={() => setBillingAnnual(i === 0)} style={{
                padding: '8px 20px', borderRadius: 99, border: 'none',
                background: (i === 0) === billingAnnual ? GOLD : 'transparent',
                color: (i === 0) === billingAnnual ? NAVY : TEXT_SUB,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${(i === 0) === billingAnnual ? GOLD : BORDER}`,
              }}>
                {label} {i === 0 && <span style={{ fontSize: 11 }}>Save 25%</span>}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, alignItems: 'start' }}>
            {[
              {
                name: 'Free', price: '0', period: 'forever', highlight: false,
                badge: null,
                features: ['5 vault entries', '1 beneficiary', 'All categories', 'After I\'m Gone guide'],
                missing: ['Check-in protection', 'Document storage', 'Email support'],
                cta: 'Get started free', action: onSignup,
              },
              {
                name: 'Single', price: billingAnnual ? '18' : '2.50', period: billingAnnual ? 'per year' : 'per month',
                highlight: true, badge: 'Most popular',
                features: ['Unlimited entries', 'Up to 3 beneficiaries', 'All categories', 'Check-in protection', 'Document storage (1GB)', 'Email support', 'After I\'m Gone guide', 'Secure share links'],
                missing: [],
                cta: 'Get started with Single',
                action: () => onPlan('single', PRICE_IDS.single_annual),
              },
              {
                name: 'Couples', price: billingAnnual ? '45' : '5', period: billingAnnual ? 'per year' : 'per month',
                highlight: false, badge: null,
                features: ['Everything in Single', '2 vaults included', 'Up to 5 beneficiaries each', 'Shared couples vault', 'Document storage (5GB)', 'Check-in protection for both', 'Priority support'],
                missing: [],
                cta: 'Get started with Couples',
                action: () => onPlan('couples', billingAnnual ? PRICE_IDS.couples_annual : PRICE_IDS.couples_monthly),
              },
            ].map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? NAVY_LT : NAVY_MID,
                border: `1px solid ${plan.highlight ? GOLD_BORDER : BORDER}`,
                borderRadius: 16, padding: '36px 28px',
                position: 'relative',
                transform: plan.highlight ? 'scale(1.03)' : 'none',
                boxShadow: plan.highlight ? '0 20px 60px rgba(0,0,0,0.3)' : 'none',
              }}>
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: GOLD, color: NAVY, fontSize: 11, fontWeight: 700,
                    padding: '4px 14px', borderRadius: 99, whiteSpace: 'nowrap',
                  }}>{plan.badge}</div>
                )}
                <div style={{ fontSize: 13, color: TEXT_SUB, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 48, color: plan.highlight ? GOLD : CREAM, fontWeight: 600, lineHeight: 1 }}>
                  {plan.price === '0' ? 'Free' : `£${plan.price}`}
                </div>
                {plan.price !== '0' && <div style={{ fontSize: 13, color: TEXT_SUB, marginBottom: 4 }}>{plan.period}</div>}
                {plan.price === '0' && <div style={{ fontSize: 13, color: TEXT_SUB, marginBottom: 4 }}>forever</div>}

                <div style={{ margin: '24px 0', height: 1, background: BORDER }} />

                <div style={{ textAlign: 'left', marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 13, color: CREAM_DIM }}>
                      <span style={{ color: '#4caf82', flexShrink: 0 }}>✓</span> {f}
                    </div>
                  ))}
                  {plan.missing.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 13, color: TEXT_SUB, opacity: 0.5 }}>
                      <span style={{ flexShrink: 0 }}>○</span> {f}
                    </div>
                  ))}
                </div>

                <button onClick={plan.action} style={{
                  width: '100%', padding: '13px',
                  background: plan.highlight ? GOLD : 'transparent',
                  color: plan.highlight ? NAVY : CREAM,
                  border: plan.highlight ? 'none' : `1px solid ${BORDER}`,
                  borderRadius: 9, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { if (!plan.highlight) { e.target.style.borderColor = GOLD_BORDER; e.target.style.color = GOLD } }}
                  onMouseLeave={e => { if (!plan.highlight) { e.target.style.borderColor = BORDER; e.target.style.color = CREAM } }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 24, fontSize: 13, color: TEXT_SUB }}>Beneficiary access is always free. No card required to start.</p>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '96px 24px', background: NAVY_MID }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 64 }}>
            What our members say
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {[
              { quote: 'After my father died it took us six months to find everything. I set up Digital Relative the week after the funeral. I never want my children to go through what we did.', name: 'Sarah M.', role: 'Single plan member' },
              { quote: 'My wife and I set this up together on a Sunday afternoon. We feel genuinely better knowing it\'s all there. The couples plan made it easy to cover us both.', name: 'James T.', role: 'Couples plan member' },
              { quote: 'I\'m a solicitor and I recommend this to every client who comes to make a will. The After I\'m Gone guide alone is worth it. It asks the questions families never think to ask.', name: 'Rachel H.', role: 'Single plan member' },
            ].map(({ quote, name, role }) => (
              <div key={name} style={{
                background: NAVY, border: `1px solid ${BORDER}`,
                borderRadius: 14, padding: '28px 24px', textAlign: 'left',
              }}>
                <div style={{ fontSize: 20, color: GOLD, marginBottom: 14 }}>"</div>
                <p style={{ fontSize: 14, color: CREAM_DIM, lineHeight: 1.8, margin: '0 0 20px', fontStyle: 'italic' }}>{quote}</p>
                <div style={{ fontSize: 13, fontWeight: 600, color: CREAM }}>{name}</div>
                <div style={{ fontSize: 12, color: TEXT_SUB }}>{role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESOURCES ── */}
      <section id="resources" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 16 }}>
            Helpful resources
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, marginBottom: 56 }}>Free services and guidance for when someone dies in the UK.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, textAlign: 'left' }}>
            {[
              { name: 'Tell Me Once', url: 'https://www.gov.uk/tell-us-once', desc: 'Report a death to most government organisations in one go. Covers HMRC, DWP, passport office, DVLA, and more.', tag: 'Government' },
              { name: 'Death Notification Service', url: 'https://www.deathnotificationservice.co.uk', desc: 'Notify multiple banks and financial institutions about a death with a single notification.', tag: 'Finance' },
              { name: 'The Bereavement Register', url: 'https://www.thebereavementregister.org.uk', desc: 'Stop unwanted mail being sent to someone who has died. Free service, takes about five minutes.', tag: 'Admin' },
              { name: 'Cruse Bereavement Support', url: 'https://www.cruse.org.uk', desc: 'Free support for anyone who has been bereaved. Helpline, online support, and local groups across the UK.', tag: 'Support' },
              { name: 'Age UK', url: 'https://www.ageuk.org.uk/information-advice/money-legal/legal-issues/what-to-do-when-someone-dies/', desc: 'Step-by-step guide to what to do when someone dies, including probate, benefits, and practical tasks.', tag: 'Guidance' },
              { name: 'Citizens Advice', url: 'https://www.citizensadvice.org.uk/family/death-and-wills/', desc: 'Free, independent advice on wills, probate, funeral costs, and dealing with someone\'s estate.', tag: 'Guidance' },
              { name: 'GOV.UK Probate', url: 'https://www.gov.uk/wills-probate-inheritance', desc: 'Official government guidance on probate, inheritance tax, and dealing with a deceased person\'s estate.', tag: 'Government' },
              { name: 'Ofcom Digital Legacy', url: 'https://www.ofcom.org.uk', desc: 'Guidance on what happens to digital accounts, social media profiles, and online subscriptions after death.', tag: 'Digital' },
            ].map(({ name, url, desc, tag }) => (
              <a key={name} href={url} target="_blank" rel="noopener noreferrer" style={{
                background: NAVY_MID, border: `1px solid ${BORDER}`,
                borderRadius: 12, padding: '20px 20px', textDecoration: 'none',
                display: 'block', transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = GOLD_BORDER}
                onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: CREAM }}>{name}</div>
                  <span style={{
                    fontSize: 10, background: GOLD_DIM, color: GOLD,
                    border: `1px solid ${GOLD_BORDER}`, borderRadius: 99,
                    padding: '2px 8px', flexShrink: 0, marginLeft: 8,
                  }}>{tag}</span>
                </div>
                <p style={{ fontSize: 12, color: TEXT_SUB, lineHeight: 1.7, margin: 0 }}>{desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: '96px 24px', background: NAVY_MID }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', color: CREAM, marginBottom: 48, textAlign: 'center' }}>
            Common questions
          </h2>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{
                width: '100%', textAlign: 'left', padding: '20px 0',
                background: 'transparent', border: 'none', color: CREAM,
                fontSize: 15, fontWeight: 500, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'inherit',
              }}>
                {faq.q}
                <span style={{ color: GOLD, fontSize: 20, flexShrink: 0, marginLeft: 16, transition: 'transform 0.2s', transform: faqOpen === i ? 'rotate(45deg)' : 'none' }}>+</span>
              </button>
              {faqOpen === i && (
                <p style={{ fontSize: 14, color: TEXT_SUB, lineHeight: 1.8, paddingBottom: 20, margin: 0 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── SECURITY TRUST ── */}
      <section style={{ padding: '64px 24px', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { icon: '🔒', label: 'AES-256 encryption' },
              { icon: '🇬🇧', label: 'UK data - never leaves' },
              { icon: '🛡️', label: 'UK GDPR compliant' },
              { icon: '🔑', label: 'Zero-knowledge' },
              { icon: '📱', label: 'Two-factor auth' },
              { icon: '✓', label: 'No ads, ever' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT_SUB }}>
                <span style={{ fontSize: 16 }}>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: '120px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(32px, 5vw, 56px)', color: CREAM, marginBottom: 20, lineHeight: 1.2 }}>
            Start protecting what matters today
          </h2>
          <p style={{ fontSize: 16, color: TEXT_SUB, lineHeight: 1.8, marginBottom: 36 }}>
            Free to start. No card required. Set up in under ten minutes.
          </p>
          <button onClick={onSignup} style={{
            background: GOLD, color: NAVY, border: 'none',
            borderRadius: 10, padding: '18px 48px',
            fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 8px 32px rgba(201,168,76,0.25)',
          }}>
            Get started free
          </button>
          <div style={{ marginTop: 16, fontSize: 13, color: TEXT_SUB }}>
            Already have an account? <button onClick={onLogin} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0 }}>Log in</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#07111c', borderTop: `1px solid ${BORDER}`, padding: '48px 24px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <TreeMark size={24} />
                <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, color: GOLD }}>Digital Relative</span>
              </div>
              <p style={{ fontSize: 12, color: TEXT_SUB, lineHeight: 1.7 }}>Secure digital legacy vaults for UK families.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_SUB, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Product</div>
              {[['#features','Features'],['#pricing','Pricing'],['#how-it-works','How it works']].map(([href,label]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <a href={href} style={{ fontSize: 13, color: TEXT_SUB, textDecoration: 'none' }}>{label}</a>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_SUB, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Resources</div>
              {[['#resources','Helpful links'],['#faq','FAQ'],['mailto:support@digitalrelative.co.uk','Support']].map(([href,label]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <a href={href} style={{ fontSize: 13, color: TEXT_SUB, textDecoration: 'none' }}>{label}</a>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_SUB, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Legal</div>
              {[['/privacy','Privacy policy'],['/terms','Terms of service'],['mailto:security@digitalrelative.co.uk','Security']].map(([href,label]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <a href={href} style={{ fontSize: 13, color: TEXT_SUB, textDecoration: 'none' }}>{label}</a>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 12, color: TEXT_SUB }}>
              © {new Date().getFullYear()} Digital Relative Ltd. All rights reserved.
            </div>
            <div style={{ fontSize: 12, color: TEXT_SUB }}>
              ICO Registration: pending · All data stored in UK (London)
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
