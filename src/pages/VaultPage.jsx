import { useState } from 'react'
import { useVault } from '../hooks/useVault'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES } from '../lib/categories'
import { PLANS } from '../lib/stripe'
import toast from 'react-hot-toast'

function EntryModal({ entry, onClose, onSave, onDelete }) {
  const isEdit = !!entry?.id
  const [form, setForm] = useState(entry || { category: 'banking', title: '', username: '', password: '', notes: '' })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try { await onSave(form); onClose() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 22 }}>
          {isEdit ? 'Edit entry' : 'New vault entry'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account / service name *</label>
            <input className="input" placeholder="e.g. Barclays Current Account" value={form.title}
              onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label className="label">Username / email / account number</label>
            <input className="input" placeholder="e.g. john@email.com" value={form.username}
              onChange={e => set('username', e.target.value)} />
          </div>
          <div>
            <label className="label">Password or PIN</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPass ? 'text' : 'password'}
                placeholder="Stored encrypted" value={form.password}
                onChange={e => set('password', e.target.value)}
                style={{ paddingRight: 44 }} />
              <button onClick={() => setShowPass(p => !p)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: 13, cursor: 'pointer',
              }}>{showPass ? 'hide' : 'show'}</button>
            </div>
          </div>
          <div>
            <label className="label">Notes & instructions</label>
            <textarea className="input" placeholder="Sort code, account number, security questions, contact numbers, important notes for family…"
              value={form.notes} onChange={e => set('notes', e.target.value)} style={{ height: 100 }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'space-between' }}>
          <div>
            {isEdit && (
              <button className="btn-danger" onClick={() => { onDelete(entry.id); onClose() }}>Delete</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VaultPage({ onNav }) {
  const { profile } = useAuth()
  const { entries, loading, addEntry, updateEntry, deleteEntry } = useVault()
  const [filter, setFilter] = useState('all')
  const [search, setSearch]  = useState('')
  const [modal, setModal]    = useState(null) // null | 'new' | entry object
  const [expanded, setExpanded] = useState(null)

  const planId  = profile?.plan || 'free'
  const plan    = PLANS[planId] || PLANS.free
  const atLimit = plan.entryLimit !== Infinity && entries.length >= plan.entryLimit

  const filtered = entries.filter(e => {
    const matchCat  = filter === 'all' || e.category === filter
    const matchText = !search || e.title.toLowerCase().includes(search.toLowerCase()) || (e.username || '').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchText
  })

  async function handleSave(form) {
    if (modal === 'new') await addEntry(form)
    else await updateEntry(modal.id, form)
    toast.success(modal === 'new' ? 'Entry added' : 'Entry updated')
  }

  async function handleDelete(id) {
    await deleteEntry(id)
    toast.success('Entry deleted')
  }

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">My Vault</h1>
          <p className="page-sub">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · end-to-end encrypted</p>
        </div>
        <button className="btn-primary" onClick={() => atLimit ? onNav('plan') : setModal('new')}
          style={{ opacity: 1 }}>
          {atLimit ? 'Upgrade to add more' : '+ Add entry'}
        </button>
      </div>

      {atLimit && (
        <div className="fade-up card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--gold)', fontWeight: 500 }}>Free plan limit reached ({plan.entryLimit} entries)</div>
            <div style={{ color: 'var(--text-sub)', fontSize: 13 }}>Upgrade to Single (£18/yr) for unlimited entries</div>
          </div>
          <button className="btn-primary" onClick={() => onNav('plan')}>Upgrade</button>
        </div>
      )}

      {/* Filters */}
      <div className="fade-up-2" style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Search entries…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select className="input" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
      </div>

      {/* Entry list */}
      <div className="fade-up-3">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⬡</div>
            <div className="empty-text">{search || filter !== 'all' ? 'No matching entries' : 'No entries yet'}</div>
            <div>{search ? 'Try a different search' : 'Add your first entry above'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => {
              const cat = CATEGORIES.find(c => c.id === e.category)
              const isOpen = expanded === e.id
              return (
                <div key={e.id} className="card-static" style={{
                  cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: isOpen ? 'var(--gold-border)' : 'var(--border)',
                }} onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 20 }}>{cat?.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{e.username || 'No username stored'}</div>
                    </div>
                    <span className="badge badge-muted">{cat?.label}</span>
                    <span style={{ color: 'var(--text-sub)', fontSize: 16, transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'none' }}>⌄</span>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }} onClick={e2 => e2.stopPropagation()}>
                      {e.password && (
                        <div style={{ marginBottom: 12 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Password</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 14, background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6, letterSpacing: '0.08em', color: 'var(--cream-dim)' }}>
                            {'•'.repeat(Math.min(e.password.length, 20))}
                          </div>
                        </div>
                      )}
                      {e.notes && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{e.notes}</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => setModal(e)}>Edit</button>
                        <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => { if (confirm('Delete this entry?')) handleDelete(e.id) }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(modal === 'new' || (modal && modal.id)) && (
        <EntryModal
          entry={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
