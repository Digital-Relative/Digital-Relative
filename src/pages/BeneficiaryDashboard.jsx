import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Shown when a user has a beneficiary account
// They can see all vaults they're nominated for
// They can also upgrade to get their own vault
function TreeLogo({ size = 28 }) {
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

const STATUS_CONFIG = {
  invited:        { label: 'Invited',          color: 'var(--text-sub)',  badge: 'badge-muted',   icon: '📧' },
  email_confirmed:{ label: 'Email confirmed',  color: '#e8a44c',          badge: 'badge-muted',   icon: '✉️' },
  id_verified:    { label: 'ID verified',      color: 'var(--success)',   badge: 'badge-green',   icon: '✓' },
  access_granted: { label: 'Access granted',   color: 'var(--gold)',      badge: 'badge-gold',    icon: '🔓' },
  declined:       { label: 'Declined',         color: 'var(--danger)',    badge: 'badge-danger',  icon: '✗' },
}

export default function BeneficiaryDashboard({ onNav }) {
  const { user, profile, signOut } = useAuth()
  const [nominations, setNominations] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!user) return
    // Find all beneficiary records linked to this user's account
    supabase
      .from('beneficiaries')
      .select(`
        id, user_id, name, relation, email, access_level, access_requirement,
        status, invite_token, emergency_access_token, is_executor, linked_user_id,
        owner:user_id (id, full_name)
      `)
      .eq('linked_user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNominations(data || [])
        setLoading(false)
      })
  }, [user])

  async function handleDecline(benId) {
    if (!confirm('Decline this nomination? The vault owner will be notified.')) return
    await supabase.from('beneficiaries').update({ status: 'declined' }).eq('id', benId).eq('linked_user_id', user.id)
    setNominations(prev => prev.map(n => n.id === benId ? { ...n, status: 'declined' } : n))
    toast.success('Nomination declined')
  }

  async function handleAccept(benId) {
    const nomination = nominations.find(n => n.id === benId)
    const isTrustOnly = nomination?.access_requirement === 'trust_only'

    if (isTrustOnly) {
      // trust_only: use service-role edge function to grant access
      // (direct DB update is blocked by RLS - status can only be email_confirmed or declined by beneficiary)
      const { error } = await supabase.functions.invoke('send-beneficiary-invite', {
        body: { beneficiaryId: benId, action: 'accept_trust_only' },
      })
      if (error) { toast.error('Could not accept nomination'); return }
      setNominations(prev => prev.map(n => n.id === benId ? { ...n, status: 'access_granted' } : n))
      toast.success('Accepted - vault access granted')
    } else {
      // id_only or death_certificate: just confirm email, Onfido/cert still required
      await supabase.from('beneficiaries')
        .update({ status: 'email_confirmed' })
        .eq('id', benId)
        .eq('linked_user_id', user.id)
      setNominations(prev => prev.map(n => n.id === benId ? { ...n, status: 'email_confirmed' } : n))
      toast.success('Nomination accepted')
    }
  }

  const hasOwnVault = profile?.plan && profile.account_origin !== 'beneficiary'
  const activeNominations = nominations.filter(n => !['declined', 'revoked'].includes(n.status))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      {/* Header */}
      <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <TreeLogo />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--gold)' }}>Digital Relative</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
          {profile?.full_name || user?.email}
        </div>
        <button onClick={signOut} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 'var(--r)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>

        {/* Welcome */}
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, color: 'var(--cream)', marginBottom: 6 }}>
            Welcome, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)' }}>
            You have a beneficiary account. Here you can see the vaults you're nominated for.
          </p>
        </div>

        {/* Upgrade prompt */}
        {!hasOwnVault && (
          <div className="fade-up-2 card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--gold)', marginBottom: 4 }}>
                  Want your own Digital Relative vault?
                </div>
                <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
                  Store your own passwords and documents for your family. Free to start - 5 entries, 1 beneficiary.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => onNav && onNav('plan')}>
                  Free tier
                </button>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => onNav && onNav('plan')}>
                  Upgrade →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nominations */}
        <div className="fade-up-3">
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 16 }}>
            Vaults you're nominated for
          </h2>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}><span className="spinner" /></div>
          ) : nominations.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">◉</div>
              <div className="empty-text">No vault nominations yet</div>
              <div>When someone adds you as a beneficiary, it will appear here</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {nominations.map(n => {
                const config = STATUS_CONFIG[n.status] || STATUS_CONFIG.invited
                return (
                  <div key={n.id} className="card-static">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--gold)',
                      }}>
                        {(n.owner?.full_name || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 3 }}>
                          {n.owner?.full_name || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 8 }}>
                          {n.relation ? `${n.relation} · ` : ''}
                          Access level: {n.access_level} ·{' '}
                          Added {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>

                        {/* Status */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className={`badge ${config.badge}`}>{config.icon} {config.label}</span>

                          {/* Actions based on status */}
                          {n.status === 'invited' && (
                            <>
                              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                                onClick={() => handleAccept(n.id)}>Accept nomination</button>
                              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }}
                                onClick={() => handleDecline(n.id)}>Decline</button>
                            </>
                          )}

                          {n.status === 'email_confirmed' && (
                            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}
                              onClick={() => toast('ID verification flow - requires Onfido integration')}>
                              Verify your identity →
                            </button>
                          )}

                          {n.status === 'id_verified' && (
                            <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                              Vault access will be granted when needed
                            </span>
                          )}

                          {n.status === 'access_granted' && (
                            <a href={`/beneficiary?token=${n.emergency_access_token || n.invite_token}`}
                              style={{ fontSize: 11, color: 'var(--gold)', textDecoration: 'none', padding: '4px 12px', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 6 }}>
                              Access vault →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ID verification explainer */}
        {activeNominations.some(n => ['invited', 'email_confirmed'].includes(n.status)) && (
          <div className="fade-up-4 card-static" style={{ marginTop: 24 }}>
            <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 10 }}>
              Why we verify your identity
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
              Digital Relative vaults contain sensitive personal and financial information. We require identity verification (a photo ID and quick selfie) to ensure only the right people can access a vault. This is a one-time process - once verified, you won't need to re-verify for any vault you're nominated for.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
