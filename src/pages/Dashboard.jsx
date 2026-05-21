import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useVault } from '../hooks/useVault'
import { useBeneficiaries } from '../hooks/useBeneficiaries'
import { CATEGORIES } from '../lib/categories'
import { supabase } from '../lib/supabase'
import GettingStarted from '../components/GettingStarted'

export default function Dashboard({ onNav }) {
  const { user, profile } = useAuth()
  const { entries, loading: vLoading } = useVault()
  const { beneficiaries, loading: bLoading } = useBeneficiaries()

  // For GettingStarted checklist
  const hasExecutor     = beneficiaries?.some(b => b.is_executor) ?? false
  const hasCheckin      = !!(profile?.last_checkin) // true once user has checked in at least once
  const [hasAfterIAmGone, setHasAfterIAmGone] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('after_i_am_gone').select('id').eq('user_id', user.id).limit(1)
      .then(({ data }) => setHasAfterIAmGone(!!(data && data.length > 0)))
  }, [user])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile?.full_name || 'there').split(' ')[0]

  const cats = new Set(entries.map(e => e.category)).size
  const confirmed = beneficiaries.filter(b => ['email_confirmed','id_verified','access_granted'].includes(b.status)).length

  const stats = [
    { label: 'Vault entries',   value: vLoading ? '…' : entries.length,       sub: `across ${cats} categories` },
    { label: 'Beneficiaries',   value: bLoading ? '…' : beneficiaries.length, sub: `${confirmed} confirmed` },
    { label: 'Check-in status',
     value: profile?.last_checkin ? (
       Date.now() - new Date(profile.last_checkin).getTime() > (profile?.checkin_frequency_days || 30) * 86400000
         ? '⚠️ Overdue' : '✓ Active'
     ) : 'Not set',
     sub: profile?.last_checkin
       ? `Next due: ${new Date(new Date(profile.last_checkin).getTime() + (profile?.checkin_frequency_days || 30) * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
       : 'Check in to activate the switch'
   },
    { label: 'Vault health',    value: entries.length > 0 ? 'Good' : 'Empty',  sub: entries.length > 0 ? 'Entries added' : 'Add your first entry' },
  ]

  return (
    <div>
      <GettingStarted
        onNav={onNav}
        vaultEntryCount={entries?.length ?? 0}
        beneficiaryCount={beneficiaries?.length ?? 0}
        hasExecutor={hasExecutor}
        hasCheckin={hasCheckin}
        hasAfterIAmGone={hasAfterIAmGone}
      />
      <div className="fade-up page-header">
        <h1 className="page-title">{greeting}, {firstName}</h1>
        <p className="page-sub">Your vault is secure and up to date.</p>
      </div>

      {/* Stats */}
      <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
        {stats.map((s, i) => (
          <div key={i} className="card-static" style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600, color: 'var(--gold)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '6px 0 2px' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent entries */}
      <div className="fade-up-3" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)' }}>Recent entries</h2>
          <button className="btn-ghost" onClick={() => onNav('vault')} style={{ padding: '6px 14px', fontSize: 12 }}>View all</button>
        </div>

        {entries.length === 0 ? (
          <div className="card-static" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-sub)' }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>⬡</div>
            <div>No entries yet.</div>
            <button className="btn-primary" onClick={() => onNav('vault')} style={{ marginTop: 12, fontSize: 12 }}>Add your first entry</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.slice(0, 4).map(e => {
              const cat = CATEGORIES.find(c => c.id === e.category)
              return (
                <div key={e.id} className="card-static" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', cursor: 'pointer' }}
                  onClick={() => onNav('vault')}>
                  <span style={{ fontSize: 20 }}>{cat?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{e.username}</div>
                  </div>
                  <span className="badge badge-muted">{cat?.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Beneficiaries */}
      <div className="fade-up-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)' }}>Beneficiaries</h2>
          <button className="btn-ghost" onClick={() => onNav('beneficiaries')} style={{ padding: '6px 14px', fontSize: 12 }}>Manage</button>
        </div>

        {beneficiaries.length === 0 ? (
          <div className="card-static" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-sub)' }}>
            <div>No beneficiaries added yet.</div>
            <button className="btn-primary" onClick={() => onNav('beneficiaries')} style={{ marginTop: 12, fontSize: 12 }}>Add beneficiary</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {beneficiaries.map(b => (
              <div key={b.id} className="card-static" style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--gold)',
                }}>
                  {(b.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{b.relation} · {b.access_level}</div>
                </div>
                <span className={`badge badge-${ b.status === 'access_granted' ? 'gold' : ['email_confirmed','id_verified'].includes(b.status) ? 'green' : ['declined','revoked'].includes(b.status) ? 'danger' : 'muted' }`}>{b.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
