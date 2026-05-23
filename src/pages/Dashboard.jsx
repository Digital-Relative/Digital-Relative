import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useVault } from '../hooks/useVault'
import { useBeneficiaries } from '../hooks/useBeneficiaries'
import { CATEGORIES } from '../lib/categories'
import { supabase } from '../lib/supabase'
import GettingStarted from '../components/GettingStarted'
import toast from 'react-hot-toast'

// Vault completeness score
// L-1 fix: only count categories that have at least one entry with a real title
function completenessScore(entries) {
  const ideal = ['banking','investments','insurance','government','property','legal','digital','medical']
  // A category is "covered" only if it has at least one entry with a non-empty title
  const coveredCategories = new Set(
    entries
      .filter(e => e.title && e.title.trim().length > 0)
      .map(e => e.category)
  )
  const covered = ideal.filter(c => coveredCategories.has(c)).length
  const pct = Math.round((covered / ideal.length) * 100)
  const missing = ideal.filter(c => !coveredCategories.has(c))
  return { pct, covered, total: ideal.length, missing }
}

export default function Dashboard({ onNav }) {
  const { user, profile, updateProfile } = useAuth()
  const { entries, loading: vLoading } = useVault()
  const { beneficiaries, loading: bLoading } = useBeneficiaries()

  const hasExecutor    = beneficiaries?.some(b => b.is_executor) ?? false
  const hasCheckin     = !!(profile?.last_checkin)
  const [hasAfterIAmGone, setHasAfterIAmGone] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('after_i_am_gone').select('id').eq('user_id', user.id).limit(1)
      .then(({ data }) => setHasAfterIAmGone(!!(data && data.length > 0)))
  }, [user])

  // Quick check-in from dashboard (feature 2)
  async function handleQuickCheckIn() {
    // Idempotency: ignore if checked in within the last 60 seconds
    if (profile?.last_checkin) {
      const since = Date.now() - new Date(profile.last_checkin).getTime()
      if (since < 60_000) { toast('Already checked in'); return }
    }
    setCheckingIn(true)
    try {
      await updateProfile({
        last_checkin: new Date().toISOString(),
        checkin_frequency_days: profile?.checkin_frequency_days || 30,
      })
      toast.success('Check-in recorded')
    } catch (e) { toast.error(e.message) }
    finally { setCheckingIn(false) }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile?.full_name || 'there').split(' ')[0]

  const cats      = new Set(entries.map(e => e.category)).size
  const confirmed = beneficiaries.filter(b => ['email_confirmed','id_verified','access_granted'].includes(b.status)).length

  // Check-in countdown (feature 9)
  const lastCheckin    = profile?.last_checkin ? new Date(profile.last_checkin) : null
  const freq           = profile?.checkin_frequency_days || 30
  const nextDue        = lastCheckin ? new Date(lastCheckin.getTime() + freq * 86400000) : null
  const daysUntil      = nextDue ? Math.max(0, Math.ceil((nextDue - Date.now()) / 86400000)) : null
  const isOverdue      = daysUntil === 0

  // Vault completeness (feature 1)
  const completeness = completenessScore(entries)

  // Beneficiaries who haven't created account yet (feature 5 dashboard widget)
  const notCreated = beneficiaries.filter(b => b.status === 'invited')
  const confirmed2 = beneficiaries.filter(b => ['email_confirmed','id_verified','access_granted'].includes(b.status))

  const stats = [
    { label: 'Vault entries',  value: vLoading ? '…' : entries.length, sub: `across ${cats} categor${cats === 1 ? 'y' : 'ies'}` },
    { label: 'Beneficiaries',  value: bLoading ? '…' : beneficiaries.length, sub: `${confirmed} confirmed` },
    {
      label: 'Check-in',
      value: !lastCheckin ? 'Not set' : isOverdue ? '⚠️' : `${daysUntil}d`,
      sub: !lastCheckin ? 'Tap to activate' : isOverdue ? 'Overdue' : `due ${nextDue.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      action: handleQuickCheckIn,
      actionLabel: checkingIn ? null : (!lastCheckin || isOverdue ? "I'm well" : 'Check in'),
      actionColor: isOverdue ? 'var(--danger)' : 'var(--gold)',
    },
    { label: 'Vault health', value: `${completeness.pct}%`, sub: `${completeness.covered} of ${completeness.total} areas covered` },
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

      <div className="fade-up page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">{greeting}, {firstName}</h1>
          <p className="page-sub">Your vault is secure and up to date.</p>
        </div>
        {/* Quick add entry (feature 4) */}
        <button className="btn-primary" onClick={() => onNav('vault')} style={{ fontSize: 13, padding: '8px 18px' }}>
          + Add entry
        </button>
      </div>

      {/* Stats row */}
      <div className="fade-up-2 stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
        {stats.map((s, i) => (
          <div key={i} className="card-static" style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600, color: 'var(--gold)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '6px 0 2px' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: s.action ? 8 : 0 }}>{s.sub}</div>
            {s.action && (
              <button onClick={s.action} disabled={checkingIn} style={{
                background: s.actionColor, border: 'none', borderRadius: 6,
                color: '#0d1b2a', fontSize: 11, fontWeight: 600, padding: '5px 12px',
                cursor: 'pointer', fontFamily: 'var(--sans)',
              }}>
                {checkingIn ? '...' : s.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Vault health breakdown (feature 10) */}
      {!vLoading && completeness.pct < 100 && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--cream)' }}>Vault health</h3>
            <button className="btn-ghost" onClick={() => onNav('vault')} style={{ fontSize: 12, padding: '5px 12px' }}>Add entries</button>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${completeness.pct}%`, background: completeness.pct >= 75 ? 'var(--success)' : completeness.pct >= 50 ? 'var(--gold)' : 'var(--danger)', borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
          {completeness.missing.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 8 }}>Missing categories:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {completeness.missing.map(cat => {
                  const c = CATEGORIES.find(x => x.id === cat)
                  return (
                    <button key={cat} onClick={() => onNav('vault')} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--text-sub)',
                      cursor: 'pointer', fontFamily: 'var(--sans)',
                    }}>
                      {c?.icon} {c?.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Beneficiaries not yet signed up (feature 5 widget) */}
      {!bLoading && notCreated.length > 0 && (
        <div className="fade-up-3 card-static" style={{ marginBottom: 22, borderColor: 'rgba(224,82,82,0.2)', background: 'rgba(224,82,82,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--cream)' }}>
              {notCreated.length} beneficiar{notCreated.length === 1 ? 'y has' : 'ies have'} not yet created an account
            </h3>
            <button className="btn-ghost" onClick={() => onNav('beneficiaries')} style={{ fontSize: 12, padding: '5px 12px' }}>Manage</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notCreated.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--text-sub)',
                }}>
                  {(b.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{b.email} - invite not yet accepted</div>
                </div>
                <span className="badge badge-muted" style={{ fontSize: 10 }}>invited</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 10, lineHeight: 1.6 }}>
            These beneficiaries received an invite email but have not yet signed up. You can resend invites from the Beneficiaries page.
          </p>
        </div>
      )}

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

      {/* Beneficiaries confirmed */}
      <div className="fade-up-4" style={{ marginBottom: 28 }}>
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
            {beneficiaries.filter(b => b.status !== 'invited').map(b => (
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
                <span className={`badge badge-${ b.status === 'access_granted' ? 'gold' : ['email_confirmed','id_verified'].includes(b.status) ? 'green' : ['declined','revoked'].includes(b.status) ? 'danger' : 'muted' }`}>{b.status?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Will writing referral (feature 11) */}
      <div className="fade-up-4 card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 28 }}>📜</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Don't have a will?</div>
            <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
              A will ensures your wishes are followed. Farewill offers simple, affordable wills from £90.
            </div>
          </div>
          <a href="https://farewill.com" target="_blank" rel="noopener noreferrer" style={{
            flexShrink: 0, background: 'var(--gold)', color: '#0d1b2a', border: 'none',
            borderRadius: 'var(--r)', padding: '8px 18px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none', fontFamily: 'var(--sans)',
          }}>Write a will →</a>
        </div>
      </div>
    </div>
  )
}
