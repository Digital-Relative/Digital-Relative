import { useState } from 'react'
import { useBeneficiaries } from '../hooks/useBeneficiaries'
import { useAuth } from '../context/AuthContext'
import { PLANS } from '../lib/stripe'
import toast from 'react-hot-toast'

const ACCESS_LEVELS = ['Full access', 'Read only', 'Specific categories only']

function BenModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', relation: '', email: '', access_level: 'Full access' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name || !form.email) { toast.error('Name and email are required'); return }
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
            <input className="input" placeholder="e.g. Spouse, Son, Solicitor" value={form.relation} onChange={e => set('relation', e.target.value)} />
          </div>
          <div>
            <label className="label">Email address *</label>
            <input className="input" type="email" placeholder="jane@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Access level</label>
            <select className="input" value={form.access_level} onChange={e => set('access_level', e.target.value)}>
              {ACCESS_LEVELS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--gold-dim)', borderRadius: 'var(--r)', border: '1px solid var(--gold-border)', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
          An invite email will be sent to confirm they're a beneficiary. They won't be able to access your vault until the dead man's switch is triggered or you grant direct access.
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

export default function BeneficiariesPage({ onNav }) {
  const { profile } = useAuth()
  const { beneficiaries, loading, addBeneficiary, removeBeneficiary } = useBeneficiaries()
  const [showModal, setShowModal] = useState(false)

  const planId = profile?.plan || 'free'
  const plan   = PLANS[planId] || PLANS.free
  const atLimit = beneficiaries.length >= plan.beneficiaryLimit

  async function handleAdd(form) {
    await addBeneficiary(form)
    toast.success('Invite sent to ' + form.email)
  }

  async function handleRemove(id, name) {
    if (!confirm(`Remove ${name} as a beneficiary?`)) return
    await removeBeneficiary(id)
    toast.success('Beneficiary removed')
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
          Beneficiaries only gain access to your vault when the dead man's switch triggers — after your chosen check-in period lapses with no response — or if you manually grant access below. They receive an encrypted invite and must verify their identity to unlock vault contents.
        </p>
      </div>

      {/* List */}
      <div className="fade-up-3">
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
            {beneficiaries.map(b => (
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
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 2 }}>{b.access_level}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge badge-${b.status === 'confirmed' ? 'green' : 'muted'}`}>{b.status}</span>
                  <button className="btn-danger" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => handleRemove(b.id, b.name)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && <BenModal onClose={() => setShowModal(false)} onSave={handleAdd} />}
    </div>
  )
}
