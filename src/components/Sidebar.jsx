import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../lib/i18n'
import { PLANS } from '../lib/stripe'
import NotificationBell from './NotificationBell'

const NAV = [
  { id: 'dashboard',     label: 'Dashboard',       icon: '◈' },
  { id: 'vault',         label: t('nav_vault'),         icon: '⬡' },
  { id: 'documents',     label: t('nav_documents'),        icon: '📁' },
  { id: 'beneficiaries', label: t('nav_beneficiaries'),   icon: '◉' },
  { id: 'couples',       label: 'Couples vault',    icon: '💑', couplesOnly: true },
  { id: 'family',        label: t('nav_family'),           icon: '👨‍👩‍👧‍👦' },
  { id: 'checkin',       label: t('nav_checkin'),         icon: '◎' },
  { id: 'afteriamgone',  label: 'After I\'m Gone',  icon: '💛' },
  { id: 'sharedlinks',   label: t('nav_shared'),      icon: '🔗' },
  { id: 'plan',          label: t('nav_plan'),          icon: '◇' },
  { id: 'blog',          label: t('nav_blog'),        icon: '📖', alwaysShow: true },
  { id: 'about',         label: t('nav_about'),            icon: 'ℹ',  alwaysShow: true },
  { id: 'privacy',       label: t('nav_privacy'),          icon: '🔏', alwaysShow: true },
  { id: 'terms',         label: t('nav_terms'),            icon: '📄', alwaysShow: true },
  { id: 'settings',      label: t('nav_settings'),         icon: '⚙' },
]

// Bottom nav shown on mobile — show the most important items
const MOBILE_NAV = ['dashboard', 'vault', 'beneficiaries', 'checkin', 'settings']

function TreeMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
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

export default function Sidebar({ active, onNav }) {
  const { profile, signOut } = useAuth()
  const t = useTranslation(profile?.preferred_language || 'en')
  const planId    = profile?.plan || 'free'
  const plan      = PLANS[planId] || PLANS.free
  const isCouples = planId === 'couples'
  const [isMobile, setIsMobile] = useState(false) // initialise false, set after mount
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    // Set initial value after mount (avoids SSR/window undefined issues)
    setIsMobile(window.innerWidth <= 768)
    let timeout
    const handle = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setIsMobile(window.innerWidth <= 768), 100) // debounced
    }
    window.addEventListener('resize', handle)
    return () => { window.removeEventListener('resize', handle); clearTimeout(timeout) }
  }, [])

  const navItems = NAV.filter(n => !n.couplesOnly || isCouples)
  const mobileItems = navItems.filter(n => MOBILE_NAV.includes(n.id))

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
          background: '#07111c', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TreeMark size={26} />
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--gold)', fontWeight: 600 }}>
              Digital Relative
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell onNav={onNav} />
            <button onClick={() => setMenuOpen(true)} style={{
              background: 'transparent', border: '1px solid var(--border-md)',
              borderRadius: 6, color: 'var(--text-sub)', padding: '6px 10px',
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>☰ Menu</button>
          </div>
        </div>

        {/* Spacer for fixed top bar */}
        <div style={{ height: 56 }} />

        {/* Full screen menu overlay */}
        {menuOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: '#07111c', display: 'flex', flexDirection: 'column',
          }}>
            {/* Menu header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TreeMark size={28} />
                <div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)', fontWeight: 600 }}>Digital Relative</div>
                  <div style={{ fontSize: 10, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Secure Legacy Vault</div>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} style={{
                background: 'transparent', border: 'none', color: 'var(--text-sub)',
                fontSize: 24, cursor: 'pointer', lineHeight: 1,
              }}>✕</button>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {navItems.map(n => {
                const isActive = active === n.id
                return (
                  <button key={n.id} onClick={() => { onNav(n.id); setMenuOpen(false) }} style={{
                    width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 4,
                    borderRadius: 10,
                    background: isActive ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
                    color: isActive ? 'var(--gold)' : 'var(--text)',
                    border: isActive ? '1px solid var(--gold-border)' : '1px solid var(--border)',
                    fontSize: 15, fontWeight: isActive ? 500 : 400,
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 18 }}>{n.icon}</span>
                    {n.label}
                  </button>
                )
              })}
            </nav>

            {/* User + sign out */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--gold)',
                }}>
                  {(profile?.full_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{profile?.full_name || 'My Account'}</div>
                  <div style={{ fontSize: 11, color: 'var(--gold)' }}>{plan.name} plan</div>
                </div>
              </div>
              <button onClick={signOut} style={{
                width: '100%', padding: '12px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border-md)',
                color: 'var(--text-sub)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--sans)',
              }}>
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Bottom nav bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
          background: '#07111c', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '8px 4px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}>
          {mobileItems.map(n => {
            const isActive = active === n.id
            return (
              <button key={n.id} onClick={() => onNav(n.id)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 4px', background: 'transparent', border: 'none',
                color: isActive ? 'var(--gold)' : 'var(--text-sub)',
                cursor: 'pointer', fontSize: 10, fontFamily: 'var(--sans)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 20 }}>{n.icon}</span>
                <span style={{ lineHeight: 1 }}>{n.label}</span>
              </button>
            )
          })}
          <button onClick={() => setMenuOpen(true)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 4px', background: 'transparent', border: 'none',
            color: 'var(--text-sub)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--sans)',
          }}>
            <span style={{ fontSize: 20 }}>☰</span>
            <span>More</span>
          </button>
        </div>
      </>
    )
  }

  // Desktop sidebar (unchanged)
  return (
    <aside style={{
      width: 'var(--sidebar)', minHeight: '100vh',
      background: '#07111c', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TreeMark size={34} />
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, color: 'var(--gold)', lineHeight: 1.15 }}>
            Digital Relative
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-sub)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
            Secure Legacy Vault
          </div>
        </div>
      </div>

      <div className="divider" style={{ margin: '0 16px 12px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 10px' }}>
        {navItems.map(n => {
          const isActive = active === n.id
          return (
            <button key={n.id} onClick={() => onNav(n.id)} style={{
              width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 3,
              borderRadius: 'var(--r)',
              background: isActive ? 'var(--gold-dim)' : 'transparent',
              color: isActive ? 'var(--gold)' : 'var(--text-sub)',
              border: isActive ? '1px solid var(--gold-border)' : '1px solid transparent',
              fontSize: 13, fontWeight: isActive ? 500 : 400,
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.15s', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.55 }}>{n.icon}</span>
              {n.label}
            </button>
          )
        })}
      </nav>

      {/* Plan badge */}
      <div style={{ margin: '8px 14px 10px', padding: '12px 14px', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)' }}>
        <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Plan</div>
        <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>{plan.name}</div>
        {profile?.plan_renewal && (
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
            Renews {new Date(profile.plan_renewal).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* User row */}
      <div style={{ padding: '10px 14px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)', flexShrink: 0,
        }}>
          {(profile?.full_name || 'U')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.full_name || 'My Account'}
          </div>
        </div>
        <NotificationBell onNav={onNav} />
        <button onClick={signOut} style={{
          background: 'transparent', border: 'none', color: 'var(--text-sub)',
          fontSize: 12, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
          fontFamily: 'var(--sans)', display: 'flex', alignItems: 'center', gap: 5,
          borderRadius: 6, transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-sub)'}>
          ⎋ Log out
        </button>
      </div>
    </aside>
  )
}
