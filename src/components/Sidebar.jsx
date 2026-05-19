import { useAuth } from '../context/AuthContext'
import { PLANS } from '../lib/stripe'

const NAV = [
  { id: 'dashboard',     label: 'Dashboard',     icon: '◈' },
  { id: 'vault',         label: 'My Vault',      icon: '⬡' },
  { id: 'beneficiaries', label: 'Beneficiaries', icon: '◉' },
  { id: 'checkin',       label: 'Check-in',      icon: '◎' },
  { id: 'plan',          label: 'My Plan',       icon: '◇' },
  { id: 'settings',      label: 'Settings',      icon: '⚙' },
]

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
  const planId = profile?.plan || 'free'
  const plan = PLANS[planId] || PLANS.free

  return (
    <aside style={{
      width: 'var(--sidebar)', minHeight: '100vh',
      background: '#07111c',
      borderRight: '1px solid var(--border)',
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

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 10px' }}>
        {NAV.map(n => {
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
      <div style={{
        margin: '8px 14px 10px', padding: '12px 14px',
        background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)',
      }}>
        <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Plan</div>
        <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>{plan.name}</div>
        {profile?.plan_renewal && (
          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
            Renews {new Date(profile.plan_renewal).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* User + sign out */}
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
        <button onClick={signOut} title="Sign out" style={{
          background: 'transparent', border: 'none', color: 'var(--text-sub)',
          fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1,
        }}>⎋</button>
      </div>
    </aside>
  )
}
