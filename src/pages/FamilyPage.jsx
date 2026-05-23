import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { DEPENDENT_TYPES, PROFILE_FIELDS, SHARED_FAMILY_FIELDS, CHILD_ACCESS_OPTIONS } from '../lib/familyProfiles'
import { encrypt, decrypt, encryptEntry, decryptEntry } from '../lib/crypto'
import toast from 'react-hot-toast'

// ── Field renderer ─────────────────────────────────────────────────────────
function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <textarea className="input" style={{ height: 70 }}
        placeholder={field.label} value={value || ''}
        onChange={e => onChange(field.id, e.target.value)} />
    )
  }
  if (field.type === 'select') {
    return (
      <select className="input" value={value || ''} onChange={e => onChange(field.id, e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'date') {
    return (
      <input className="input" type="date" value={value || ''}
        onChange={e => onChange(field.id, e.target.value)} />
    )
  }
  return (
    <input className="input" type="text" placeholder={field.label}
      value={value || ''} onChange={e => onChange(field.id, e.target.value)} />
  )
}

// ── Dependant profile modal ────────────────────────────────────────────────
function DependantModal({ dependant, type, onClose, onSave }) {
  const isEdit = !!dependant?.id
  const fields = PROFILE_FIELDS[type?.id || 'child']
  const [data, setData] = useState(dependant?.profile_data || {})
  const [name, setName] = useState(dependant?.display_name || '')
  const [access, setAccess] = useState(dependant?.access_control || 'owner_only')
  const [saving, setSaving] = useState(false)

  function handleField(id, value) {
    setData(prev => ({ ...prev, [id]: value }))
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      await onSave({ display_name: name, profile_data: data, access_control: access })
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const t = DEPENDENT_TYPES.find(dt => dt.id === (type?.id || 'child'))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 20 }}>
          {isEdit ? `Edit ${t?.label}` : `Add ${t?.label}`}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name always first */}
          <div>
            <label className="label">Name *</label>
            <input className="input" placeholder={t?.label + ' name'}
              value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          {/* Type-specific fields */}
          {fields.filter(f => f.id !== 'full_name').map(f => (
            <div key={f.id}>
              <label className="label">
                {f.label}
                {f.sensitive && <span style={{ fontSize: 10, color: 'var(--gold)', marginLeft: 6 }}>🔐 encrypted</span>}
                {f.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </label>
              <FieldInput field={f} value={data[f.id]} onChange={handleField} />
            </div>
          ))}

          {/* Access control - only for children and dependants */}
          {(type?.id === 'child' || type?.id === 'dependant') && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label className="label">Who can see this information</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHILD_ACCESS_OPTIONS.map(opt => (
                  <label key={opt.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--r)', border: `1px solid ${access === opt.id ? 'var(--gold-border)' : 'var(--border)'}`, background: access === opt.id ? 'var(--gold-dim)' : 'transparent', transition: 'all 0.15s' }}>
                    <input type="radio" name="access" value={opt.id} checked={access === opt.id}
                      onChange={() => setAccess(opt.id)}
                      style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--gold)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: access === opt.id ? 'var(--gold)' : 'var(--text)' }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 2 }}>{opt.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared family info modal ───────────────────────────────────────────────
function SharedInfoModal({ info, onClose, onSave }) {
  const [data, setData] = useState(info || {})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave(data); onClose() }
    catch (err) { toast.error(err.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>
          Shared family information
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 20, lineHeight: 1.6 }}>
          This information is shared across all family profiles - GP, dentist, emergency contacts.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SHARED_FAMILY_FIELDS.map(f => (
            <div key={f.id}>
              <label className="label">{f.label}</label>
              <FieldInput field={f} value={data[f.id]}
                onChange={(id, val) => setData(prev => ({ ...prev, [id]: val }))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dependant card ─────────────────────────────────────────────────────────
function DependantCard({ dep, typeConfig, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const fields = PROFILE_FIELDS[dep.type] || []
  const data   = dep.profile_data || {}
  const access = CHILD_ACCESS_OPTIONS.find(o => o.id === dep.access_control)

  // Sensitive fields are shown masked
  const publicFields  = fields.filter(f => !f.sensitive && f.id !== 'full_name')
  const privateFields = fields.filter(f => f.sensitive)

  return (
    <div className="card-static" style={{ cursor: 'pointer', borderColor: expanded ? 'var(--gold-border)' : 'var(--border)' }}
      onClick={() => setExpanded(p => !p)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>{typeConfig?.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{dep.display_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
            {typeConfig?.label}
            {data.date_of_birth && (() => {
              const age = Math.floor((Date.now() - new Date(data.date_of_birth)) / (365.25 * 86400000))
              return ` · Age ${age}`
            })()}
          </div>
        </div>
        {access && <span className="badge badge-muted" style={{ fontSize: 10 }}>{access.label}</span>}
        <span style={{ color: 'var(--text-sub)', fontSize: 16, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}
          onClick={e => e.stopPropagation()}>

          {/* Public fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {publicFields.filter(f => data[f.id]).map(f => (
              <div key={f.id}>
                <div className="label" style={{ marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 13, color: 'var(--cream-dim)' }}>
                  {f.type === 'date' ? new Date(data[f.id]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : data[f.id]}
                </div>
              </div>
            ))}
          </div>

          {/* Private fields - shown masked */}
          {privateFields.some(f => data[f.id]) && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>🔐 Encrypted fields</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {privateFields.filter(f => data[f.id]).map(f => (
                  <div key={f.id}>
                    <div className="label" style={{ marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--cream-dim)' }}>••••••••</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => onEdit(dep)}>Edit</button>
            <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => { if (confirm(`Delete ${dep.display_name}'s profile? This cannot be undone.`)) onDelete(dep.id) }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function FamilyPage() {
  const { user } = useAuth()
  const [dependants, setDependants]   = useState([])
  const [sharedInfo, setSharedInfo]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(null) // {type: 'add'|'edit'|'shared', dep?, depType?}
  const [activeType, setActiveType]   = useState('child')

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('dependants').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('family_info').select('field_data').eq('user_id', user.id).single(),
    ]).then(([{ data: deps }, { data: info }]) => {
      setDependants(deps || [])
      setSharedInfo(info?.field_data || null)
      setLoading(false)
    })
  }, [user])

  async function handleSaveDependant({ display_name, profile_data, access_control }) {
    const payload = {
      user_id: user.id,
      type: modal.depType?.id || activeType,
      display_name,
      profile_data,
      access_control,
    }

    if (modal.dep?.id) {
      // Update
      const { data, error } = await supabase.from('dependants').update(payload).eq('id', modal.dep.id).select().single()
      if (error) throw error
      setDependants(prev => prev.map(d => d.id === modal.dep.id ? data : d))
      toast.success('Profile updated')
    } else {
      // Insert
      const { data, error } = await supabase.from('dependants').insert([payload]).select().single()
      if (error) throw error
      setDependants(prev => [...prev, data])
      toast.success('Profile added')
    }
  }

  async function handleSaveShared(data) {
    const { error } = await supabase.from('family_info').upsert({
      user_id: user.id,
      field_data: data,
    }, { onConflict: 'user_id' })
    if (error) throw error
    setSharedInfo(data)
    toast.success('Family information saved')
  }

  async function handleDelete(id) {
    await supabase.from('dependants').delete().eq('id', id).eq('user_id', user.id)
    setDependants(prev => prev.filter(d => d.id !== id))
    toast.success('Profile deleted')
  }

  const byType = (typeId) => dependants.filter(d => d.type === typeId)

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Family</h1>
          <p className="page-sub">Children, dependants, pets and shared family information</p>
        </div>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setModal({ type: 'shared' })}>
          ✏️ Edit shared info
        </button>
      </div>

      {/* Shared family info summary */}
      {sharedInfo && Object.values(sharedInfo).some(Boolean) && (
        <div className="fade-up-2 card-static" style={{ marginBottom: 22, borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)', marginBottom: 8 }}>Shared family information</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
                {SHARED_FAMILY_FIELDS.filter(f => sharedInfo[f.id]).slice(0, 4).map(f => (
                  <div key={f.id} style={{ fontSize: 12, color: 'var(--cream-dim)' }}>
                    <span style={{ color: 'var(--text-sub)' }}>{f.label}:</span> {sharedInfo[f.id]}
                  </div>
                ))}
                {Object.values(sharedInfo).filter(Boolean).length > 4 && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>+{Object.values(sharedInfo).filter(Boolean).length - 4} more fields</div>
                )}
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }}
              onClick={() => setModal({ type: 'shared' })}>Edit</button>
          </div>
        </div>
      )}

      {!sharedInfo && !loading && (
        <div className="fade-up-2 card-static" style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Add shared family information</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>GP surgery, dentist, emergency contacts - shown with all family profiles</div>
          </div>
          <button className="btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setModal({ type: 'shared' })}>
            Add now
          </button>
        </div>
      )}

      {/* Type tabs */}
      <div className="fade-up-3" style={{ display: 'flex', gap: 4, marginBottom: 22, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
        {DEPENDENT_TYPES.map(t => (
          <button key={t.id} onClick={() => setActiveType(t.id)} style={{
            flex: 1, padding: '9px', borderRadius: 6, border: 'none',
            background: activeType === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: activeType === t.id ? 'var(--text)' : 'var(--text-sub)',
            fontSize: 13, fontWeight: activeType === t.id ? 500 : 400,
            cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
          }}>
            {t.icon} {t.plural} ({byType(t.id).length})
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="fade-up-4" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setModal({ type: 'add', depType: DEPENDENT_TYPES.find(t => t.id === activeType) })}>
          + Add {DEPENDENT_TYPES.find(t => t.id === activeType)?.label}
        </button>
      </div>

      {/* Dependant list */}
      <div className="fade-up-4">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="spinner" /></div>
        ) : byType(activeType).length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{DEPENDENT_TYPES.find(t => t.id === activeType)?.icon}</div>
            <div className="empty-text">No {DEPENDENT_TYPES.find(t => t.id === activeType)?.plural.toLowerCase()} added yet</div>
            <div>Add a profile to store their important information</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byType(activeType).map(dep => (
              <DependantCard
                key={dep.id}
                dep={dep}
                typeConfig={DEPENDENT_TYPES.find(t => t.id === dep.type)}
                onEdit={d => setModal({ type: 'edit', dep: d, depType: DEPENDENT_TYPES.find(t => t.id === d.type) })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <DependantModal
          dependant={modal.dep}
          type={modal.depType}
          onClose={() => setModal(null)}
          onSave={handleSaveDependant}
        />
      )}
      {modal?.type === 'shared' && (
        <SharedInfoModal
          info={sharedInfo}
          onClose={() => setModal(null)}
          onSave={handleSaveShared}
        />
      )}
    </div>
  )
}
