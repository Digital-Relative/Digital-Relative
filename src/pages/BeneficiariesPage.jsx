import { useState, useEffect, useRef } from 'react'
import { useBeneficiaries } from '../hooks/useBeneficiaries'
import { useAuth } from '../context/AuthContext'
import { PLANS } from '../lib/stripe'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { validateEmail, validateName, sanitiseText } from '../lib/validation'

const COMMON_RELATIONS = [
  'Spouse', 'Partner', 'Civil partner',
  'Son', 'Daughter', 'Child',
  'Father', 'Mother', 'Parent',
  'Brother', 'Sister', 'Sibling',
  'Grandfather', 'Grandmother', 'Grandparent',
  'Grandson', 'Granddaughter', 'Grandchild',
  'Uncle', 'Aunt', 'Nephew', 'Niece', 'Cousin',
  'Stepson', 'Stepdaughter', 'Stepparent',
  'Friend', 'Close friend',
  'Solicitor', 'Accountant', 'Financial advisor',
  'Executor', 'Business partner', 'Carer', 'Other',
]


const ACCESS_LEVELS = ['Full access', 'Read only', 'Specific categories only']

function BenModal({ onClose, onSave, beneficiaries = [] }) {
  const DRAFT_KEY = 'dr_ben_draft'
  const [form, setForm] = useState(() => {
    // Restore draft from sessionStorage if available
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return { name: '', relation: '', email: '', access_level: 'Full access', access_requirement: 'trust_only', group_name: '' }
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch {}
    return next
  })

  async function handleSave() {
    const nameErr = validateName(form.name)
    const emailErr = validateEmail(form.email)
    if (nameErr) { toast.error(nameErr); return }
    if (emailErr) { toast.error(emailErr); return }
    setSaving(true)
    try { await onSave(form); onClose() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 22 }}>Add beneficiary</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label">Full name *</label>
            <input className="input" placeholder="Jane Smith" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Relationship</label>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>Pick from the list or type your own.</div>
            <ComboboxInput
              value={form.relation}
              onChange={v => set('relation', v)}
              options={COMMON_RELATIONS}
              placeholder="e.g. Spouse, Son, Solicitor"
            />
            <label className="label" style={{ marginTop: 10 }}>Group (optional)</label>
            <ComboboxInput
              value={form.group_name || ''}
              onChange={v => set('group_name', v === 'None' ? '' : v)}
              options={['None', ...Array.from(new Set((beneficiaries || []).map(b => b.group_name).filter(Boolean)))]}
              placeholder="Select or create a group"
            />
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>Type to filter existing groups or create a new one. Select "None" for no group.</div>

          </div>
          <div>
            <label className="label">Email address *</label>
            <input className="input" type="email" placeholder="jane@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Access level</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'Full access', label: 'Full access', icon: '🔓',
                  detail: "Can see all vault entries, documents, and the After I'm Gone guide. Passwords are never accessible." },
                { id: 'Read only', label: 'Read only', icon: '👁️',
                  detail: "Can see account names and the After I'm Gone guide only. Cannot see usernames, notes, or documents." },
                { id: 'Specific categories only', label: 'Specific categories', icon: '🗂️',
                  detail: 'Can only see entries you specifically mark as shared with them. Good for solicitors or accountants.' },
              ].map(opt => (
                <label key={opt.id} onClick={() => set('access_level', opt.id)} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '12px 14px', borderRadius: 'var(--r)',
                  border: `1px solid ${form.access_level === opt.id ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: form.access_level === opt.id ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{opt.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: form.access_level === opt.id ? 'var(--gold)' : 'var(--text)', marginBottom: 3 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                      {opt.detail}
                    </div>
                  </div>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `2px solid ${form.access_level === opt.id ? 'var(--gold)' : 'var(--border-md)'}`,
                    background: form.access_level === opt.id ? 'var(--gold)' : 'transparent',
                    transition: 'all 0.15s',
                  }} />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-sub)', lineHeight: 1.6, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              Passwords are never accessible to beneficiaries regardless of access level.
            </div>
          </div>
        </div>
          <div>
            <label className="label">Access requirement</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'death_certificate', label: 'Death certificate required', icon: '📋',
                  detail: 'They must upload a death certificate and verify their identity. Highest security. Recommended for financial accounts.' },
                { id: 'id_only', label: 'Identity verification only', icon: '🪪',
                  detail: 'They verify who they are via photo ID, but do not need to submit a death certificate. Faster access.' },
                { id: 'trust_only', label: 'Trust only', icon: '🤝',
                  detail: 'They confirm their email and accept the invite. No ID or certificate needed. Best for close family with simple information.' },
              ].map(opt => (
                <label key={opt.id} onClick={() => set('access_requirement', opt.id)} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 'var(--r)',
                  border: `1px solid ${form.access_requirement === opt.id ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: form.access_requirement === opt.id ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{opt.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: form.access_requirement === opt.id ? 'var(--gold)' : 'var(--text)', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5 }}>{opt.detail}</div>
                  </div>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                    border: `2px solid ${form.access_requirement === opt.id ? 'var(--gold)' : 'var(--border-md)'}`,
                    background: form.access_requirement === opt.id ? 'var(--gold)' : 'transparent',
                  }} />
                </label>
              ))}
            </div>
          </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--gold-dim)', borderRadius: 'var(--r)', border: '1px solid var(--gold-border)', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
          An invite email will be sent to confirm they're a beneficiary. They won't be able to access your vault until the check-in protection is triggered or you grant direct access.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  )
}


// Filterable combobox - type to filter, pick from list or keep typed value
function ComboboxInput({ value, onChange, options, placeholder, allowNew = true }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState(value || '')
  const ref                 = useRef(null)

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || (allowNew && query)) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
          borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 200, overflowY: 'auto', marginTop: 4,
        }}>
          {filtered.map((opt, i) => (
            <button key={i} type="button" onClick={() => { onChange(opt); setQuery(opt); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'transparent', border: 'none',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                color: 'var(--cream-dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >{opt}</button>
          ))}
          {allowNew && query && !options.find(o => o.toLowerCase() === query.toLowerCase()) && (
            <button type="button" onClick={() => { onChange(query); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'rgba(201,168,76,0.06)', border: 'none',
                color: 'var(--gold)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
              + Use "{query}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function BeneficiariesPage({ onNav }) {
  const { profile } = useAuth()
  const { beneficiaries, loading, addBeneficiary, removeBeneficiary } = useBeneficiaries()
  const [groupFilter, setGroupFilter] = useState('all')

  // Unique groups for filter tabs
  const groups = ['all', ...new Set(beneficiaries.filter(b => b.group_name).map(b => b.group_name))]
  const [showModal, setShowModal] = useState(() => {
    try { return sessionStorage.getItem('dr_ben_modal') === 'open' } catch { return false }
  })

  const planId = profile?.plan || 'free'
  const plan   = PLANS[planId] || PLANS.free
  const atLimit = beneficiaries.length >= plan.beneficiaryLimit

  async function handleAdd(form) {
    await addBeneficiary(form)
    toast.success('Invite sent to ' + form.email)
    supabase.from('audit_log').insert({ action: 'beneficiary_added', user_id: form.user_id }).then(() => {}).then(() => {}).catch(() => {})
  }

  async function handleToggleExecutor(id, currentIsExecutor) {
    if (!currentIsExecutor) {
      // First, remove executor status from any existing executor
      await supabase.from('beneficiaries').update({ is_executor: false }).eq('user_id', profile.id).eq('is_executor', true)
    }
    const { error } = await supabase.from('beneficiaries').update({ is_executor: !currentIsExecutor }).eq('id', id)
    if (error) { toast.error('Failed to update executor'); return }
    toast.success(currentIsExecutor ? 'Executor status removed' : '⭐ Executor set - this person can submit emergency access requests')
    // Refresh beneficiaries list
    const { data } = await supabase.from('beneficiaries').select('*').eq('user_id', profile.id)
    // Update local state via the hook's reload
  }

  async function handleResendInvite(b) {
    try {
      const { error } = await supabase.functions.invoke('send-beneficiary-invite', {
        body: { beneficiaryId: b.id },
      })
      if (error) throw new Error('Could not resend invite')
      toast.success('Invite resent to ' + b.email)
    } catch (e) {
      toast.error(e.message || 'Could not resend invite')
    }
  }

  async function handleRemove(id, name) {
    if (!confirm(`Remove ${name} as a beneficiary?`)) return
    await removeBeneficiary(id)
    toast.success('Beneficiary removed')
    supabase.from('audit_log').insert({ action: 'beneficiary_removed' }).then(() => {}).then(() => {}).catch(() => {})
  }

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Beneficiaries</h1>
          <p className="page-sub">{beneficiaries.length} of {plan.beneficiaryLimit} slots used</p>
        </div>
        <button className="btn-primary" onClick={() => atLimit ? onNav('plan') : setShowModal(true)}>
          {atLimit ? 'Upgrade for more' : '+ Add beneficiary'}
        </button>
      </div>

      {/* How it works */}
      <div className="fade-up-2 card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 22 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--gold)', marginBottom: 8 }}>How access works</h3>
        <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
          Beneficiaries only gain access to your vault when the check-in protection triggers - after your chosen check-in period lapses with no response - or if you manually grant access below. They receive an encrypted invite and must verify their identity to unlock vault contents.
        </p>
      </div>

      {/* List */}
      <div className="fade-up-3">
        {/* Group filter tabs */}
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {groups.map(g => (
            <button key={g} onClick={() => setGroupFilter(g)} style={{
              padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--sans)', border: '1px solid',
              borderColor: groupFilter === g ? 'var(--gold-border)' : 'var(--border)',
              background:  groupFilter === g ? 'var(--gold-dim)' : 'transparent',
              color:       groupFilter === g ? 'var(--gold)' : 'var(--text-sub)',
            }}>
              {g === 'all' ? 'All' : g}
              {g !== 'all' && (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>
                  {beneficiaries.filter(b => b.group_name === g).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="spinner" /></div>
        ) : beneficiaries.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◉</div>
            <div className="empty-text">No beneficiaries added yet</div>
            <div>Add someone who should have access to your vault</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {beneficiaries.filter(b => groupFilter === 'all' || b.group_name === groupFilter).map(b => (
              <div key={b.id} className="card-static" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--gold)',
                }}>
                  {(b.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    {b.relation && `${b.relation} · `}{b.email}
                  </div>
                  {b.group_name && (
                    <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, marginTop: 3, display: 'inline-block', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}>
                      {b.group_name}
                    </span>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 2 }}>{b.access_level}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
                    {b.access_requirement === 'id_only' ? '🪪 ID only' : (b.access_requirement === 'trust_only' || b.access_requirement === 'none') ? '🤝 Trust only' : '📋 Death certificate required'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge badge-${
      b.status === 'access_granted' ? 'gold' :
      b.status === 'id_verified' ? 'green' :
      b.status === 'email_confirmed' ? 'green' :
      b.status === 'declined' || b.status === 'revoked' ? 'danger' :
      'muted'
    }`}>{b.status.replace('_', ' ')}</span>
                  {b.status === 'invited' && (
                    <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }}
                      onClick={() => handleResendInvite(b)}>
                      Resend invite
                    </button>
                  )}
                  <button
                    className={`btn-ghost`}
                    style={{ fontSize: 10, padding: '4px 10px', borderColor: b.is_executor ? 'var(--gold-border)' : undefined, color: b.is_executor ? 'var(--gold)' : undefined }}
                    onClick={() => handleToggleExecutor(b.id, b.is_executor)}
                    title="The executor is the trusted person who can submit emergency access requests">
                    {b.is_executor ? '⭐ Executor' : 'Set executor'}
                  </button>
                  <button className="btn-danger" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => handleRemove(b.id, b.name)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && <BenModal onClose={() => { try { sessionStorage.removeItem('dr_ben_draft'); sessionStorage.removeItem('dr_ben_modal') } catch {} setShowModal(false) }} onSave={handleAdd} beneficiaries={beneficiaries} />}
    </div>
  )
}
