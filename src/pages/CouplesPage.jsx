import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePartner } from '../hooks/usePartner'
import { useVault } from '../hooks/useVault'
import { CATEGORIES } from '../lib/categories'
import { validateEmail } from '../lib/validation'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Invite form ────────────────────────────────────────────────────────────
function InviteForm({ onResult }) {
  const { user, profile } = useAuth()
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSend(e) {
    e.preventDefault()
    const err = validateEmail(email)
    if (err) { toast.error(err); return }
    if (email.toLowerCase() === user.email.toLowerCase()) {
      toast.error('You cannot link with yourself'); return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('couples-invite', {
        body: { requesterId: user.id, partnerEmail: email },
      })
      if (error) throw error
      onResult(data, email)
    } catch (err) {
      toast.error(err.message || 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label className="label">Partner's email address</label>
        <input className="input" type="email" placeholder="partner@email.com"
          value={email} onChange={e => setEmail(e.target.value)} autoFocus />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
        <strong style={{ color: 'var(--text)' }}>What happens next:</strong><br />
        If your partner already has a Digital Relative account, they'll see a notification in their dashboard and receive an email. If not, they'll receive an email to create their own account. Either way, both of you keep your own private vault - sharing is your choice.
      </div>
      <button className="btn-primary" type="submit" disabled={loading} style={{ padding: 12 }}>
        {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Send partner invite →'}
      </button>
    </form>
  )
}

// ── Credit info modal ──────────────────────────────────────────────────────
function CreditModal({ creditInfo, partnerName, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>
            Refund for {partnerName || 'your partner'}
          </h2>
        </div>
        <div style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)', padding: '16px 18px', marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
            {partnerName || 'Your partner'} currently has an active Single plan with <strong style={{ color: 'var(--gold)' }}>{creditInfo.remainingDays} days remaining</strong>.
          </p>
          <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.7, marginTop: 8 }}>
            When they accept the invite, their Single subscription will be cancelled and they'll receive a refund of <strong style={{ color: 'var(--gold)' }}>{creditInfo.refundAmount}</strong> to their original payment method. This typically appears within 5–10 business days.
          </p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 20 }}>
          Once linked, their vault access will be covered by your Couples subscription at no extra cost to them. They'll keep all their existing vault data.
        </p>
        <button className="btn-primary" onClick={onClose} style={{ width: '100%', padding: 12 }}>
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Sharing toggle ─────────────────────────────────────────────────────────
function SharingToggle({ link, isRequester, onToggle }) {
  const myShareField  = isRequester ? 'requester_shares_vault' : 'partner_shares_vault'
  const isSharing     = link?.[myShareField] ?? false

  return (
    <div className="card-static" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Share my vault with my partner</div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
            {isSharing
              ? 'Your partner can see your vault entries. They need your vault PIN to reveal any passwords.'
              : 'Your vault is private. Your partner cannot see your entries.'}
          </div>
        </div>
        <button onClick={onToggle} style={{
          flexShrink: 0, width: 48, height: 26, borderRadius: 13,
          background: isSharing ? 'var(--success)' : 'rgba(255,255,255,0.12)',
          border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
        }}>
          <div style={{
            position: 'absolute', top: 3, left: isSharing ? 25 : 3,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      </div>
    </div>
  )
}

// ── Partner's vault view (read-only) ──────────────────────────────────────
function PartnerVaultView({ partner, partnerEntries }) {
  if (partnerEntries.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">⬡</div>
        <div className="empty-text">{partner?.full_name?.split(' ')[0] || 'Your partner'} hasn't added any vault entries yet</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.6, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
        You can see account names and notes. To copy any stored password, {partner?.full_name?.split(' ')[0] || 'your partner'} needs to be present and enter <strong>their</strong> vault PIN.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {partnerEntries.map(e => {
          const cat = CATEGORIES.find(c => c.id === e.category)
          return (
            <div key={e.id} className="card-static" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 18 }}>{cat?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{e.username || 'No username stored'}</div>
                {e.notes && <div style={{ fontSize: 12, color: 'var(--cream-dim)', marginTop: 2, fontStyle: 'italic' }}>{e.notes.substring(0, 100)}{e.notes.length > 100 ? '…' : ''}</div>}
              </div>
              {e.password && (
                <div style={{ fontSize: 11, color: 'var(--text-sub)', padding: '4px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  🔐 PIN required
                </div>
              )}
              <span className="badge badge-muted">{cat?.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared vault ──────────────────────────────────────────────────────────
function SharedVault({ sharedEntries }) {
  const { addEntry } = useVault()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ category: 'banking', title: '', username: '', notes: '' })
  const [saving, setSaving]   = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleAdd() {
    if (!form.title) { toast.error('Title required'); return }
    setSaving(true)
    try {
      await addEntry({ ...form, is_shared: true })
      toast.success('Shared entry added')
      setShowAdd(false)
      setForm({ category: 'banking', title: '', username: '', notes: '' })
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
          {sharedEntries.length} shared {sharedEntries.length === 1 ? 'entry' : 'entries'} · both partners can add and edit
        </div>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ Add</button>
      </div>

      {sharedEntries.length === 0 && !showAdd && (
        <div className="empty">
          <div className="empty-icon">🤝</div>
          <div className="empty-text">No shared entries yet</div>
          <div>Add joint accounts, shared subscriptions, the mortgage, household bills</div>
          <button className="btn-primary" style={{ marginTop: 14, fontSize: 12 }} onClick={() => setShowAdd(true)}>
            Add your first shared entry
          </button>
        </div>
      )}

      {showAdd && (
        <div className="card-static" style={{ marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 16 }}>New shared entry</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            <input className="input" placeholder="Account name e.g. Joint Barclays" value={form.title} onChange={e => set('title', e.target.value)} />
            <input className="input" placeholder="Username / account number" value={form.username} onChange={e => set('username', e.target.value)} />
            <textarea className="input" style={{ height: 60 }} placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn-primary" onClick={handleAdd} disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Save'}
            </button>
            <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sharedEntries.map(e => {
          const cat = CATEGORIES.find(c => c.id === e.category)
          return (
            <div key={e.id} className="card-static" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 18 }}>{cat?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{e.username}</div>
              </div>
              <span className="badge badge-gold">Shared</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function CouplesPage({ onNav }) {
  const { user, profile } = useAuth()
  const { link, partner, loading, acceptLink, declineLink, unlink, refresh } = usePartner()
  const { entries } = useVault()
  const [activeTab, setActiveTab]   = useState('shared')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteResult, setInviteResult] = useState(null)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [creditModal, setCreditModal]   = useState(null)

  const isPaid = profile?.plan === 'couples'
  const isRequester = link?.requester_id === user?.id

  const sharedEntries  = entries.filter(e => e.is_shared)
  const partnerEntries = entries.filter(e =>
    !e.is_shared &&
    e.user_id !== user?.id &&
    (isRequester ? link?.partner_shares_vault : link?.requester_shares_vault)
  )

  function handleInviteResult(result, email) {
    setInviteEmail(email)
    setInviteResult(result)
    setShowInvite(false)
    if (result.creditInfo) setCreditModal(result)
    else if (result.partnerExists) {
      toast.success(`Invite sent to ${email} - they'll see it in their dashboard`)
    } else {
      toast.success(`Invite sent to ${email} - they'll receive an email to create their account`)
    }
    refresh()
  }

  async function toggleSharing() {
    const field = isRequester ? 'requester_shares_vault' : 'partner_shares_vault'
    const current = link?.[field] ?? false
    const { error } = await supabase
      .from('partner_links')
      .update({ [field]: !current })
      .eq('id', link.id)
    if (error) { toast.error('Failed to update sharing'); return }
    toast.success(!current ? 'Your vault is now shared with your partner' : 'Your vault is now private')
    refresh()
  }

  if (!isPaid) {
    return (
      <div>
        <div className="fade-up page-header">
          <h1 className="page-title">Couples vault</h1>
          <p className="page-sub">Share your vault with your partner</p>
        </div>
        <div className="fade-up-2 card-static" style={{ textAlign: 'center', padding: '48px 32px', borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💑</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 12 }}>Couples plan feature</h2>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 24px' }}>
            Link with your partner, share a joint vault for household accounts, and see each other's private vaults. One subscription covers both of you.
          </p>
          <button className="btn-primary" onClick={() => onNav('plan')} style={{ padding: '12px 32px' }}>
            Upgrade to Couples →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Couples vault</h1>
        <p className="page-sub">Your shared space and partner access</p>
      </div>

      {/* ── No link yet ── */}
      {!loading && !link && (
        <div className="fade-up-2">
          {!showInvite ? (
            <div className="card-static" style={{ textAlign: 'center', padding: '40px 32px', borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>💑</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>Link with your partner</h2>
              <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto 20px' }}>
                Invite your partner by email. You'll both keep your own private vaults, and get a shared space for joint accounts. Sharing your private vault with them is optional and can be changed at any time.
              </p>
              <button className="btn-primary" onClick={() => setShowInvite(true)} style={{ padding: '12px 32px' }}>
                Invite partner →
              </button>
            </div>
          ) : (
            <div className="card-static" style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 16 }}>Invite your partner</h3>
              <InviteForm onResult={handleInviteResult} />
              <button className="btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowInvite(false)}>Cancel</button>
            </div>
          )}

          {inviteResult && !inviteResult.partnerExists && (
            <div className="card-static" style={{ background: 'var(--success-dim)', borderColor: 'rgba(76,175,130,0.3)', textAlign: 'center', padding: '24px' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✉️</div>
              <div style={{ fontWeight: 500, color: 'var(--success)', marginBottom: 6 }}>Invite sent to {inviteEmail}</div>
              <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>They'll receive an email to create their account. Once they sign up and accept, your vaults will be linked.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Pending - waiting for partner ── */}
      {link?.status === 'pending' && isRequester && (
        <div className="fade-up-2 card-static" style={{ marginBottom: 24, textAlign: 'center', padding: '28px' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Waiting for your partner to accept</div>
          <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 16 }}>They'll see a notification in their dashboard and receive an email.</div>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={async () => {
              if (!confirm('Cancel this invite?\n\nYour partner will no longer be able to accept it. You can send a new invite afterwards if you change your mind.')) return
              try {
                await unlink(link.id)
                toast.success('Invite cancelled')
              } catch (err) {
                toast.error(err.message || 'Could not cancel invite')
              }
            }}>
            Cancel invite
          </button>
        </div>
      )}

      {/* ── Pending - they received an invite ── */}
      {link?.status === 'pending' && !isRequester && (
        <div className="fade-up-2 card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--gold)', marginBottom: 8 }}>Partner vault invitation</h3>
          <p style={{ fontSize: 13, color: 'var(--cream-dim)', marginBottom: 16, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>{link.requester?.full_name || 'Your partner'}</strong> has invited you to link your vaults. You'll each keep your own private vault. Sharing is optional and reversible at any time.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={async () => { await acceptLink(link.id); toast.success('Partner link accepted - your vaults are now linked') }}>
              Accept
            </button>
            <button className="btn-ghost" onClick={async () => { await declineLink(link.id); toast('Invitation declined') }}>
              Decline
            </button>
          </div>
        </div>
      )}

      {/* ── Active link ── */}
      {link?.status === 'accepted' && partner && (
        <>
          {/* Partner card */}
          <div className="fade-up-2 card-static" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--gold)', flexShrink: 0,
            }}>
              {(partner?.full_name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>{partner?.full_name || 'Partner'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                Linked partner ·{' '}
                {(isRequester ? link.partner_shares_vault : link.requester_shares_vault)
                  ? 'sharing their vault with you'
                  : 'vault private'}
              </div>
            </div>
            <span className="badge badge-green">Linked</span>
            <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={async () => {
                if (!confirm('Unlink from your partner?\n\nYour private vault remains yours. The shared vault will be available to export for 90 days then deleted. Billing will be adjusted automatically.')) return
                try {
                  const { data, error } = await supabase.functions.invoke('handle-separation', {
                    body: { linkId: link.id, initiatorId: user.id },
                  })
                  if (error) throw error
                  toast.success('Couples link ended. Check your notifications for billing details.')
                  if (data.billingNote) toast(data.billingNote, { duration: 8000 })
                  refresh()
                } catch (err) {
                  toast.error(err.message || 'Failed to unlink')
                }
              }}>Unlink</button>
          </div>

          {/* My sharing toggle */}
          <div className="fade-up-2">
            <SharingToggle link={link} isRequester={isRequester} onToggle={toggleSharing} />
          </div>

          {/* Tabs */}
          <div className="fade-up-3" style={{ display: 'flex', gap: 4, marginBottom: 22, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
            {[
              { id: 'shared', label: '🤝 Shared vault' },
              {
                id: 'partner',
                label: `👤 ${partner?.full_name?.split(' ')[0] || 'Partner'}'s vault`,
                disabled: !(isRequester ? link.partner_shares_vault : link.requester_shares_vault),
              },
            ].map(t => (
              <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} style={{
                flex: 1, padding: '9px', borderRadius: 6, border: 'none',
                background: activeTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: t.disabled ? 'rgba(122,147,170,0.4)' : activeTab === t.id ? 'var(--text)' : 'var(--text-sub)',
                fontSize: 13, fontWeight: activeTab === t.id ? 500 : 400,
                cursor: t.disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--sans)', transition: 'all 0.15s',
              }}>
                {t.label}
                {t.disabled && <span style={{ fontSize: 10, marginLeft: 4 }}>(private)</span>}
              </button>
            ))}
          </div>

          <div className="fade-up-4">
            {activeTab === 'shared' && <SharedVault sharedEntries={sharedEntries} />}
            {activeTab === 'partner' && <PartnerVaultView partner={partner} partnerEntries={partnerEntries} />}
          </div>
        </>
      )}

      {creditModal && (
        <CreditModal
          creditInfo={creditModal.creditInfo}
          partnerName={creditModal.partnerName}
          onClose={() => setCreditModal(null)}
        />
      )}
    </div>
  )
}
