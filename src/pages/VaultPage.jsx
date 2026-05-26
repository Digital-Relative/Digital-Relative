import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useVault } from '../hooks/useVault'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES } from '../lib/categories'
import AddressLookup from '../components/AddressLookup'
import ImportCSV from '../components/ImportCSV'
import { PLANS } from '../lib/stripe'
import { searchCompanies, UK_COMPANIES } from '../lib/companies'
import { validateVaultTitle } from '../lib/validation'
import PasswordReveal from '../components/PasswordReveal'
import ShareModal from '../components/ShareModal'
import { decryptEntry } from '../lib/crypto'
import toast from 'react-hot-toast'

const REMINDER_PRESETS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
]

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / 86400000)
}

function ExpiryBadge({ date }) {
  if (!date) return null
  const days = daysUntilExpiry(date)
  if (days < 0)  return <span className="badge badge-danger">Expired</span>
  if (days <= 7)  return <span className="badge badge-danger">Expires in {days}d</span>
  if (days <= 30) return <span className="badge" style={{ background: 'rgba(232,164,76,0.15)', color: '#e8a44c', border: '1px solid rgba(232,164,76,0.3)' }}>Expires in {days}d</span>
  return <span className="badge badge-muted">Exp: {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
}

function CompanySearch({ value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleInput(e) {
    const q = e.target.value
    onChange(q)
    if (q.length >= 1) {
      setResults(searchCompanies(q))
      setOpen(true)
    } else {
      setResults([])
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="input" placeholder="Search banks, insurers, utilities… or type any name"
        value={value} onChange={handleInput} onFocus={() => value && setOpen(true)} />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#0d1e30', border: '1px solid var(--border-md)',
          borderRadius: 'var(--r)', marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {results.map(r => (
            <button key={r.id} onMouseDown={() => { onSelect(r); setOpen(false) }} style={{
              width: '100%', textAlign: 'left', padding: '10px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text)', fontFamily: 'var(--sans)',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--border)',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 18 }}>{r.logo}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{CATEGORIES.find(c => c.id === r.category)?.label}</div>
              </div>
            </button>
          ))}
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-sub)', borderTop: '1px solid var(--border)' }}>
            Not listed? Just type the name and continue
          </div>
        </div>
      )}
    </div>
  )
}

const STRUCTURED_FIELDS = {
  banking: [
    { key: 'sort_code',       label: 'Sort code',        placeholder: 'e.g. 20-00-00' },
    { key: 'account_number',  label: 'Account number',   placeholder: 'e.g. 12345678' },
    { key: 'iban',            label: 'IBAN (optional)',  placeholder: 'e.g. GB29NWBK...' },
  ],
  investments: [
    { key: 'account_ref',     label: 'Account / policy reference', placeholder: 'e.g. HL-123456' },
    { key: 'provider',        label: 'Provider',         placeholder: 'e.g. Hargreaves Lansdown' },
  ],
  insurance: [
    { key: 'policy_number',   label: 'Policy number',    placeholder: 'e.g. POL-1234567' },
    { key: 'sum_assured',     label: 'Sum assured',      placeholder: 'e.g. £250,000' },
    { key: 'renewal_date',    label: 'Renewal date',     placeholder: 'e.g. 01/03/2026' },
  ],
  government: [
    { key: 'ni_number',       label: 'National Insurance number', placeholder: 'e.g. QQ 12 34 56 A' },
    { key: 'reference',       label: 'Reference number', placeholder: 'e.g. UTR, NHR...' },
  ],
  medical: [
    { key: 'nhs_number',      label: 'NHS number',       placeholder: 'e.g. 123 456 7890' },
    { key: 'gp_surgery',      label: 'GP surgery',       placeholder: 'e.g. Elm Street Surgery' },
  ],
  property: [
    { key: 'title_number',    label: 'Land Registry title number', placeholder: 'e.g. GR123456' },
    { key: 'mortgage_lender', label: 'Mortgage lender',  placeholder: 'e.g. Halifax, Nationwide' },
    { key: 'mortgage_ref',    label: 'Mortgage reference', placeholder: 'e.g. MOC-1234567' },
  ],
  legal: [
    { key: 'solicitor',       label: 'Solicitor / firm', placeholder: 'e.g. Smith & Co Solicitors' },
    { key: 'reference',       label: 'File reference',   placeholder: 'e.g. REF/2024/001' },
  ],
}

function EntryModal({ entry, onClose, onSave, onDelete }) {
  const isEdit = !!entry?.id
  const DRAFT_KEY = 'dr_entry_draft'
  const [form, setForm] = useState(() => {
    if (entry?.id) return entry
    try { const s = sessionStorage.getItem(DRAFT_KEY); if (s) return JSON.parse(s) } catch {}
    return entry || { address: '', category: 'banking', title: '', username: '', password: '', notes: '', secure_content: '', structured_data: {}, expiry_date: '', expiry_reminder_days: 30 }
  })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleCompanySelect(company) {
    setForm(f => ({
      ...f,
      title: company.name,
      category: company.category,
      // Store bereavement info as separate display-only fields (not in notes)
      _bereavePhone: company.bereavePhone || '',
      _bereaveUrl: company.bereaveUrl || '',
      _bereaveNote: company.bereaveNote || '',
    }))
  }

  function toggleReminder(days) {
    setForm(f => {
      const current = f.expiry_reminder_days || [30]
      const next = current.includes(days)
        ? current.filter(d => d !== days)
        : [...current, days].sort((a, b) => a - b)
      return { ...f, expiry_reminder_days: next.length ? next : [30] }
    })
  }

  async function fetchVersions(entryId) {
    const { data } = await supabase
      .from('vault_entry_versions')
      .select('id, saved_at, username, password, notes, secure_content')
      .eq('entry_id', entryId)
      .order('saved_at', { ascending: false })
      .limit(3)
    if (data) setVersionsMap(v => ({ ...v, [entryId]: data }))
  }

  async function restoreVersion(entryId, version) {
    if (!confirm('Restore this version? The current version will be saved as a previous version first.')) return
    setRestoringId(entryId)
    try {
      // updateEntry saves a version before overwriting, so restore is just an update
      await updateEntry(entryId, {
        username:       version.username,
        password:       version.password,
        notes:          version.notes,
        secure_content: version.secure_content || null,
      })
      await fetchVersions(entryId)
      toast.success('Version restored')
    } catch {
      toast.error('Could not restore version')
    } finally {
      setRestoringId(null)
    }
  }

  async function handleSave() {
    const titleErr = validateVaultTitle(form.title)
    if (titleErr) { toast.error(titleErr); return }

    // Validate expiry date - must be YYYY-MM-DD or empty
    const rawDate = (form.expiry_date || '').trim()
    if (rawDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        toast.error('Please use the date picker to select a valid date')
        return
      }
      const parsed = new Date(rawDate)
      if (isNaN(parsed.getTime()) || parsed.getFullYear() > 9999 || parsed.getFullYear() < 1900) {
        toast.error('Please enter a valid date')
        return
      }
    }

    setSaving(true)
    try {
      // Strip display-only fields before saving to DB
      const { _bereavePhone, _bereaveUrl, _bereaveNote, ...saveForm } = form
      // secure_content passes through in saveForm - it's encrypted server-side like notes
      // Convert empty string to null for the date column
      const finalForm = { ...saveForm, expiry_date: rawDate || null }
      await onSave(finalForm)
      onClose()
    }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const cat = CATEGORIES.find(c => c.id === form.category)

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 20 }}>
          {isEdit ? 'Edit entry' : 'New vault entry'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Company search */}
          <div>
            <label className="label">Account / service name *</label>
            <CompanySearch
              value={form.title}
              onChange={v => set('title', v)}
              onSelect={handleCompanySelect}
            />
            {/* Bereavement contact info shown after company selection */}
            {(form._bereavePhone || form._bereaveUrl) && (
              <div style={{
                marginTop: 8, padding: '12px 14px',
                background: 'rgba(76,175,130,0.08)', border: '1px solid rgba(76,175,130,0.2)',
                borderRadius: 'var(--r)', fontSize: 12, lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>
                  Bereavement contact for {form.title}
                </div>
                {form._bereaveNote && <div style={{ color: 'var(--cream-dim)', marginBottom: 6 }}>{form._bereaveNote}</div>}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {form._bereavePhone && (
                    <span style={{ color: 'var(--text-sub)' }}>
                      📞 <strong style={{ color: 'var(--text)' }}>{form._bereavePhone}</strong>
                    </span>
                  )}
                  {form._bereaveUrl && (
                    <a href={form._bereaveUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                      🔗 Bereavement page
                    </a>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--success)', opacity: 0.8 }}>
                  Saved to your notes so beneficiaries can see it.
                </div>
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>

          {/* Username / Password - hidden for secure notes */}
          {form.category !== 'secure_note' && (
          <div>
            <label className="label">Username / email / account number</label>
            <input className="input" placeholder="e.g. john@email.com or account: 12345678"
              value={form.username} onChange={e => set('username', e.target.value)} />
          </div>
          )}

          {/* Structured fields per category */}
          {STRUCTURED_FIELDS[form.category] && (
            <>
              {STRUCTURED_FIELDS[form.category].map(field => (
                <div key={field.key}>
                  <label className="label">{field.label}</label>
                  <input className="input" placeholder={field.placeholder}
                    value={(form.structured_data || {})[field.key] || ''}
                    onChange={e => set('structured_data', { ...(form.structured_data || {}), [field.key]: e.target.value })} />
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-sub)', lineHeight: 1.6, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                These reference fields are stored without encryption. For highly sensitive data such as full account numbers, passwords, or PINs, use the Password field above which is encrypted with your vault key.
              </div>
            </>
          )}

          {/* Address lookup - shown for relevant categories */}
          {['property', 'medical', 'legal', 'utilities', 'banking', 'insurance', 'other'].includes(form.category) && (
            <div>
              <label className="label">Address (optional)</label>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6 }}>
                Helps your family locate this account or premises
              </div>
              <AddressLookup
                value={form.address || ''}
                onChange={v => set('address', v)}
                placeholder="Enter postcode to find address…"
              />
            </div>
          )}

          {/* Password */}
          <div>
            <label className="label">Password or PIN</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPass ? 'text' : 'password'}
                placeholder="Stored encrypted" value={form.password}
                onChange={e => set('password', e.target.value)} style={{ paddingRight: 44 }} />
              <button onClick={() => setShowPass(p => !p)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--text-sub)',
                fontSize: 12, cursor: 'pointer',
              }}>{showPass ? 'hide' : 'show'}</button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes & instructions for family</label>
            <textarea className="input" style={{ height: 80 }}
              placeholder="Sort code, account number, security questions, phone number, policy number, important details…"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {/* Secure note content - full-width encrypted text for secure_note category */}
          {form.category === 'secure_note' && (
            <div>
              <label className="label">Secure note content</label>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6 }}>
                Encrypted with your vault key. Use this for passport numbers, NI numbers, will location, insurance policy details, PIN codes, or anything sensitive.
              </div>
              <textarea className="input" rows={10}
                placeholder="Enter your secure note content here..."
                value={form.secure_content || ''}
                onChange={e => set('secure_content', e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 }} />
            </div>
          )}

          {/* Expiry date */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label className="label">Expiry date (optional)</label>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 6 }}>
              Useful for insurance policies, passports, driving licences, contracts
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="date" value={form.expiry_date || ''}
                onChange={e => set('expiry_date', e.target.value)}
                style={{ flex: 1 }} />
              {form.expiry_date && (
                <button type="button" onClick={() => set('expiry_date', '')} style={{
                  background: 'transparent', border: '1px solid var(--border-md)',
                  borderRadius: 'var(--r)', color: 'var(--text-sub)', padding: '0 12px',
                  cursor: 'pointer', fontSize: 12, fontFamily: 'var(--sans)',
                }}>Clear</button>
              )}
            </div>
            {form.expiry_date && isNaN(new Date(form.expiry_date).getTime()) && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Please enter a valid date</div>
            )}
          </div>

          {/* Reminder days */}
          {form.expiry_date && (
            <div>
              <label className="label">Remind me before expiry</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {REMINDER_PRESETS.map(r => {
                  const active = (form.expiry_reminder_days || [30]).includes(r.value)
                  return (
                    <button key={r.value} onClick={() => toggleReminder(r.value)} style={{
                      padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12,
                      background: active ? 'var(--gold)' : 'transparent',
                      color: active ? '#0d1b2a' : 'var(--text-sub)',
                      border: active ? 'none' : '1px solid var(--border-md)',
                      cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
                    }}>{r.label}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'space-between' }}>
          <div>
            {isEdit && <button className="btn-danger" onClick={() => { onDelete(entry.id); onClose() }}>Delete</button>}
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

// Structured fields shown per category
export default function VaultPage({ onNav }) {
  // Check if duress mode is active - show decoy vault instead of real entries
  const isDuressMode = sessionStorage.getItem('dr_duress_active') === '1'
  const { user, profile } = useAuth()
  const { entries: realEntries, loading: realLoading, addEntry, updateEntry, deleteEntry } = useVault()
  const [decoyEntries, setDecoyEntries] = useState([])
  const [decoyLoading, setDecoyLoading] = useState(false)

  // Load decoy entries when duress mode is active. Username/password/notes are
  // AES-256-GCM encrypted with the duress key (which is the current session key
  // in duress mode), so we run them through decryptEntry like real entries.
  useEffect(() => {
    if (!isDuressMode || !user?.id) return
    setDecoyLoading(true)
    supabase.from('decoy_entries').select('*').eq('user_id', user.id)
      .then(async ({ data }) => {
        const decrypted = await Promise.all((data || []).map(decryptEntry))
        setDecoyEntries(decrypted)
        setDecoyLoading(false)
      })
      .catch(() => setDecoyLoading(false))
  }, [isDuressMode, user?.id])

  // Mark body when vault is unlocked so Crisp hides itself (HIGH-5 fix)
  useEffect(() => {
    document.body.dataset.vaultOpen = 'true'
    return () => { document.body.dataset.vaultOpen = 'false' }
  }, [])

  // Read wizard prefill from sessionStorage - set by Dashboard complete-my-vault flow
  useEffect(() => {
    const raw = sessionStorage.getItem('dr_vault_prefill')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      sessionStorage.removeItem('dr_vault_prefill')
      // LOW-1: strict schema validation - only accept known safe string fields
      const title    = typeof parsed?.title    === 'string' ? parsed.title.slice(0, 200)    : ''
      const category = typeof parsed?.category === 'string' && ['banking','email','investments','property','insurance','subscriptions','government','social','utilities','medical','legal','secure_note','other'].includes(parsed.category) ? parsed.category : 'other'
      if (!atLimit) {
        setForm(f => ({ ...f, title, category }))
        setModal('new')
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entries = isDuressMode ? decoyEntries : realEntries
  const loading = isDuressMode ? decoyLoading : realLoading
  const [filter, setFilter] = useState('all')
  const [search, setSearch]  = useState('')
  const [modal, setModal]    = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [versionsMap, setVersionsMap] = useState({})
  const [restoringId, setRestoringId] = useState(null)
  const [showExpired, setShowExpired] = useState(false)
  const [revealEntry, setRevealEntry] = useState(null)
  const [showImport, setShowImport]   = useState(false)
  const [shareEntry, setShareEntry]   = useState(null)

  const planId  = profile?.plan || 'free'
  const plan    = PLANS[planId] || PLANS.free
  const atLimit = plan.entryLimit !== Infinity && entries.length >= plan.entryLimit

  // Entries needing attention
  const expiring = entries.filter(e => {
    if (!e.expiry_date) return false
    const d = daysUntilExpiry(e.expiry_date)
    return d !== null && d <= 30
  })

  const filtered = entries.filter(e => {
    const matchCat  = filter === 'all' || e.category === filter
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || (e.username || '').toLowerCase().includes(search.toLowerCase())
    const matchExpired = !showExpired || (e.expiry_date && daysUntilExpiry(e.expiry_date) <= 30)
    return matchCat && matchSearch && (!showExpired || matchExpired)
  })

  async function handleSave(form) {
    if (modal === 'new') {
      await addEntry(form)
      supabase.from('audit_log').insert({ user_id: user.id, action: 'vault_entry_created', metadata: { category: form.category } })
        .then(({ error }) => { if (error) console.error('[audit_log] vault_entry_created insert failed:', error.message) })
        .catch(e => console.error('[audit_log] vault_entry_created insert failed:', e))
    } else {
      // Save current version before overwriting (keep max 3)
      const current = entries.find(e => e.id === modal.id)
      if (current) {
        await supabase.from('vault_entry_versions').insert({
          entry_id: modal.id, user_id: user.id,
          title:    current.title,
          category: current.category,
          username: current.username, password: current.password,
          notes: current.notes, address: current.address,
          secure_content: current.secure_content || null,
        })
        // Prune to 3 versions: fetch oldest beyond limit and delete
        const { data: versions } = await supabase
          .from('vault_entry_versions').select('id, saved_at')
          .eq('entry_id', modal.id).order('saved_at', { ascending: false })
        if (versions && versions.length > 3) {
          const toDelete = versions.slice(3).map(v => v.id)
          await supabase.from('vault_entry_versions').delete().in('id', toDelete)
        }
      }
      await updateEntry(modal.id, form)
      supabase.from('audit_log').insert({ user_id: user.id, action: 'vault_entry_updated', metadata: { category: form.category } })
        .then(({ error }) => { if (error) console.error('[audit_log] vault_entry_updated insert failed:', error.message) })
        .catch(e => console.error('[audit_log] vault_entry_updated insert failed:', e))
    }
    toast.success(modal === 'new' ? 'Entry added' : 'Entry updated')
  }

  async function handleDelete(id) {
    await deleteEntry(id)
    supabase.from('audit_log').insert({ user_id: user.id, action: 'vault_entry_deleted' })
      .then(({ error }) => { if (error) console.error('[audit_log] vault_entry_deleted insert failed:', error.message) })
      .catch(e => console.error('[audit_log] vault_entry_deleted insert failed:', e))
    toast.success('Entry deleted')
  }

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">My Vault</h1>
          <p className="page-sub">{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · end-to-end encrypted</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!atLimit && (
            <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ fontSize: 13 }}>
              ⬆ Import CSV
            </button>
          )}
          <button className="btn-primary" onClick={() => atLimit ? onNav('plan') : (()=>{ try{sessionStorage.setItem('dr_modal_open','new')}catch{} setModal('new') })()}>
            {atLimit ? 'Upgrade to add more' : '+ Add entry'}
          </button>
        </div>
      </div>

      {/* Expiring alert banner */}
      {expiring.length > 0 && (
        <div className="fade-up card-static" style={{
          borderColor: 'rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.06)',
          marginBottom: 18, cursor: 'pointer',
        }} onClick={() => setShowExpired(p => !p)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--danger)', fontWeight: 500, marginBottom: 4 }}>
                ⚠️ {expiring.length} {expiring.length === 1 ? 'entry needs' : 'entries need'} attention
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                {expiring.map(e => e.title).join(', ')} - expired or expiring soon
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 12, borderColor: 'rgba(224,82,82,0.3)', color: 'var(--danger)' }}>
              {showExpired ? 'Show all' : 'View these'}
            </button>
          </div>
        </div>
      )}

      {atLimit && (
        <div className="fade-up card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--gold)', fontWeight: 500 }}>Free plan limit reached</div>
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
          <div style={{ textAlign: 'center', padding: '60px 0' }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⬡</div>
            <div className="empty-text">{search || filter !== 'all' ? 'No matching entries' : 'No entries yet'}</div>
            <div>{search ? 'Try a different search' : 'Add your first entry above'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => {
              const cat    = CATEGORIES.find(c => c.id === e.category)
              const isOpen = expanded === e.id
              const days   = daysUntilExpiry(e.expiry_date)
              const isExpiring = days !== null && days <= 30
              return (
                <div key={e.id} className="card-static" style={{
                  cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: isOpen ? 'var(--gold-border)' : isExpiring ? 'rgba(224,82,82,0.25)' : 'var(--border)',
                }} onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 20 }}>{cat?.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{e.title}</span>
                    {e.is_shared && (
                      <span style={{ fontSize: 10, background: 'rgba(201,168,76,0.15)', border: '1px solid var(--gold-border)', color: 'var(--gold)', borderRadius: 4, padding: '1px 6px' }}>Shared</span>
                    )}
                  </div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{e.username || 'No username stored'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {e.expiry_date && <ExpiryBadge date={e.expiry_date} />}
                      <span className="badge badge-muted">{cat?.label}</span>
                    </div>
                    <span style={{ color: 'var(--text-sub)', fontSize: 16, transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'none' }}>⌄</span>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }} onClick={e2 => e2.stopPropagation()}>
                      {/* Expiry warning */}
                      {e.expiry_date && days !== null && days <= 30 && (
                        <div style={{ marginBottom: 12, padding: '10px 12px', background: days < 0 ? 'var(--danger-dim)' : 'rgba(232,164,76,0.1)', borderRadius: 'var(--r)', border: `1px solid ${days < 0 ? 'rgba(224,82,82,0.3)' : 'rgba(232,164,76,0.3)'}` }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: days < 0 ? 'var(--danger)' : '#e8a44c' }}>
                            {days < 0 ? `⚠️ Expired ${Math.abs(days)} days ago - please update` : `⏰ Expires in ${days} days - consider renewing`}
                          </div>
                        </div>
                      )}
                      {e.password && (
                        <div style={{ marginBottom: 12 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Password</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ fontFamily: 'monospace', fontSize: 14, background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6, letterSpacing: '0.08em', color: 'var(--cream-dim)', flex: 1 }}>
                              {'•'.repeat(12)}
                            </div>
                            <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px', flexShrink: 0 }}
                              onClick={ev => { ev.stopPropagation(); setRevealEntry(e) }}>
                              🔐 Reveal
                            </button>
                          </div>
                        </div>
                      )}
                      {e.notes && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{e.notes}</div>
                        </div>
                      )}

                      {e.address && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Address</div>
                          <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>{e.address}</div>
                        </div>
                      )}

                      {/* Structured fields display */}
                      {e.structured_data && Object.keys(e.structured_data).filter(k => e.structured_data[k]).length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          {(STRUCTURED_FIELDS[e.category] || []).map(field => e.structured_data[field.key] ? (
                            <div key={field.key} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-sub)', minWidth: 140 }}>{field.label}</span>
                              <span style={{ fontSize: 13, color: 'var(--cream-dim)', fontFamily: 'monospace' }}>{e.structured_data[field.key]}</span>
                            </div>
                          ) : null)}
                        </div>
                      )}

                      {e.secure_content && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Secure note</div>
                          <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.8, fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>{e.secure_content}</div>
                        </div>
                      )}

                      {/* Version history */}
                      {(versionsMap[e.id] || []).length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 8 }}>Previous versions</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {(versionsMap[e.id] || []).map((v, i) => (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                                  Version {(versions[e.id] || []).length - i} - {new Date(v.saved_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                                <button onClick={() => restoreVersion(e.id, v)} disabled={restoringId === e.id} style={{
                                  background: 'transparent', border: '1px solid var(--border-md)',
                                  borderRadius: 4, padding: '3px 10px', fontSize: 11,
                                  color: 'var(--gold)', cursor: 'pointer', fontFamily: 'var(--sans)',
                                }}>Restore</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Bereavement contact section - shown if company is in our database */}
                      {(() => {
                        const company = UK_COMPANIES.find(c =>
                          c.name.toLowerCase() === (e.title || '').toLowerCase() ||
                          (e.title || '').toLowerCase().includes(c.name.toLowerCase())
                        )
                        if (!company || (!company.bereavePhone && !company.bereaveUrl)) return null
                        return (
                          <div style={{ marginBottom: 14 }}>
                            <div className="label" style={{ marginBottom: 8 }}>Bereavement contact</div>
                            <div style={{
                              background: 'rgba(76,175,130,0.06)', border: '1px solid rgba(76,175,130,0.2)',
                              borderRadius: 8, padding: '12px 14px',
                            }}>
                              {company.bereaveNote && (
                                <div style={{ fontSize: 12, color: 'var(--cream-dim)', marginBottom: 8, lineHeight: 1.6 }}>
                                  {company.bereaveNote}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: company.bereaveRequirements ? 10 : 0 }}>
                                {company.bereavePhone && (
                                  <a href={`tel:${company.bereavePhone.replace(/\s/g, '')}`}
                                    onClick={ev => ev.stopPropagation()}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                                    📞 {company.bereavePhone}
                                  </a>
                                )}
                                {company.bereaveUrl && (
                                  <a href={company.bereaveUrl} target="_blank" rel="noopener noreferrer"
                                    onClick={ev => ev.stopPropagation()}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-sub)', textDecoration: 'none', fontSize: 12 }}>
                                    🔗 Bereavement support page →
                                  </a>
                                )}
                              </div>
                              {company.bereaveRequirements && (
                                <div style={{ borderTop: '1px solid rgba(76,175,130,0.15)', paddingTop: 8, marginTop: 4 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sub)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    What they'll need
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {company.bereaveRequirements.map((req, i) => (
                                      <div key={i} style={{ fontSize: 12, color: 'var(--cream-dim)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                        <span style={{ color: 'var(--success)', flexShrink: 0 }}>✓</span>
                                        {req}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      {e.expiry_date && (
                        <div style={{ marginBottom: 14 }}>
                          <div className="label" style={{ marginBottom: 4 }}>Expiry</div>
                          <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
                            {new Date(e.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            {e.expiry_reminder_days?.length > 0 && ` · Reminders: ${e.expiry_reminder_days.join(', ')} days before`}
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setModal(e)}>Edit</button>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShareEntry(e)}>🔗 Share</button>
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

      {revealEntry && (
        <PasswordReveal
          encryptedPassword={revealEntry.password}
          onClose={() => setRevealEntry(null)}
        />
      )}

      {shareEntry && (
        <ShareModal
          item={shareEntry}
          itemType="entry"
          onClose={() => setShareEntry(null)}
        />
      )}

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <ImportCSV
              onImport={async (row) => {
                await addEntry({
                  ...row,
                  category: row.category || 'other',
                })
              }}
              onClose={() => { setShowImport(false); }}
              planEntryLimit={plan.entryLimit}
              currentCount={entries.length}
            />
          </div>
        </div>
      )}

      {(modal === 'new' || (modal && modal.id)) && (
        <EntryModal
          entry={modal === 'new' ? null : modal}
          onClose={() => { try{sessionStorage.removeItem('dr_modal_open');sessionStorage.removeItem('dr_entry_draft')}catch{} setModal(null) }}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
