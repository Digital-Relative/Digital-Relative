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
      <div style={{ padding: '28px 24px 18px' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.01em' }}>
          Digital Relative
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-sub)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 3 }}>
          Digital Vault
        </div>
      </div>

      <div className="divider" style={{ margin: '0 20px 14px' }} />

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
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.55 }}>{n.icon}</span>
              {n.label}
            </button>
          )
        })}
      </nav>

      {/* Plan badge */}
      <div style={{
        margin: '8px 14px 10px',
        padding: '12px 14px',
        background: 'var(--gold-dim)',
        border: '1px solid var(--gold-border)',
        borderRadius: 'var(--r)',
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
