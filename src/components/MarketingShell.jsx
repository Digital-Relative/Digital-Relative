import { useState } from 'react'

const GOLD = '#c9a84c'
const NAVY = '#0d1b2a'
const CREAM = '#f0ece2'
const CREAM_DIM = '#dde5ee'
const TEXT_SUB = '#7a93aa'
const BORDER = 'rgba(255,255,255,0.08)'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Resources' },
]

export default function MarketingShell({ children, activePath }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: NAVY, color: CREAM, fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(13,27,42,0.92)', backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
        }}>
          <a href="/" style={{
            fontFamily: 'var(--serif)', fontSize: 22, color: GOLD,
            textDecoration: 'none', fontWeight: 600, letterSpacing: 0.3,
          }}>
            Digital Relative
          </a>

          <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="dr-marketing-nav-desktop">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                aria-current={activePath === l.href ? 'page' : undefined}
                style={{
                  color: activePath === l.href ? GOLD : CREAM_DIM,
                  textDecoration: 'none', fontSize: 14, fontWeight: 500,
                }}
              >
                {l.label}
              </a>
            ))}
            <a href="/?login=1" style={{ color: CREAM_DIM, textDecoration: 'none', fontSize: 14 }}>Sign in</a>
            <a
              href="/?signup=1"
              style={{
                background: GOLD, color: NAVY, padding: '8px 16px',
                borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600,
              }}
            >
              Get started
            </a>
          </nav>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            className="dr-marketing-nav-mobile"
            style={{
              display: 'none', background: 'transparent', border: 'none',
              color: CREAM, fontSize: 22, cursor: 'pointer', padding: 4,
            }}
          >
            {open ? '✕' : '☰'}
          </button>
        </div>

        {open && (
          <div className="dr-marketing-nav-mobile-panel" style={{
            display: 'none', flexDirection: 'column', gap: 12,
            padding: '16px 24px', borderTop: `1px solid ${BORDER}`,
          }}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} style={{ color: CREAM_DIM, textDecoration: 'none', fontSize: 15 }}>{l.label}</a>
            ))}
            <a href="/?login=1" style={{ color: CREAM_DIM, textDecoration: 'none', fontSize: 15 }}>Sign in</a>
            <a href="/?signup=1" style={{ color: GOLD, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>Get started</a>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px 80px' }}>
        {children}
      </main>

      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '32px 24px', marginTop: 40 }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, color: TEXT_SUB,
        }}>
          <div>© {new Date().getFullYear()} Digital Relative. Made in the UK.</div>
          <nav aria-label="Footer" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <a href="/about" style={{ color: TEXT_SUB, textDecoration: 'none' }}>About</a>
            <a href="/blog" style={{ color: TEXT_SUB, textDecoration: 'none' }}>Resources</a>
            <a href="/privacy" style={{ color: TEXT_SUB, textDecoration: 'none' }}>Privacy</a>
            <a href="/terms" style={{ color: TEXT_SUB, textDecoration: 'none' }}>Terms</a>
            <a href="/security-policy.html" style={{ color: TEXT_SUB, textDecoration: 'none' }}>Security</a>
            <a href="mailto:support@digitalrelative.co.uk" style={{ color: TEXT_SUB, textDecoration: 'none' }}>Support</a>
          </nav>
        </div>
      </footer>

      <style>{`
        @media (max-width: 720px) {
          .dr-marketing-nav-desktop { display: none !important; }
          .dr-marketing-nav-mobile { display: inline-flex !important; }
          .dr-marketing-nav-mobile-panel { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
