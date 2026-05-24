import { useState, useRef } from 'react'
import Papa from 'papaparse'
import toast from 'react-hot-toast'

// Supported password manager export formats
// Each mapper returns { title, username, password, notes, category } or null to skip
const MAPPERS = {
  '1password': {
    label: '1Password',
    detect: h => h.includes('Title') && h.includes('Username') && h.includes('Password') && h.includes('OTPAuth'),
    map: row => ({
      title:    row['Title']    || row['title']    || '',
      username: row['Username'] || row['username'] || '',
      password: row['Password'] || row['password'] || '',
      notes:    row['Notes']    || row['notes']    || '',
      category: 'other',
    }),
  },
  bitwarden: {
    label: 'Bitwarden',
    detect: h => h.includes('name') && h.includes('login_username') && h.includes('login_password'),
    map: row => ({
      title:    row['name']           || '',
      username: row['login_username'] || row['username'] || '',
      password: row['login_password'] || row['password'] || '',
      notes:    row['notes']          || '',
      category: row['type'] === '2' ? 'secure_note' : 'other',
    }),
  },
  lastpass: {
    label: 'LastPass',
    detect: h => h.includes('url') && h.includes('username') && h.includes('password') && h.includes('grouping'),
    map: row => ({
      title:    row['name']     || row['url'] || '',
      username: row['username'] || '',
      password: row['password'] || '',
      notes:    row['extra']    || '',
      category: row['grouping'] ? guessCategory(row['grouping']) : 'other',
    }),
  },
  chrome: {
    label: 'Chrome / Edge',
    detect: h => h.includes('name') && h.includes('url') && h.includes('username') && h.includes('password') && !h.includes('grouping'),
    map: row => ({
      title:    row['name']     || row['url'] || '',
      username: row['username'] || '',
      password: row['password'] || '',
      notes:    '',
      category: 'other',
    }),
  },
  generic: {
    label: 'Generic CSV',
    detect: () => true,
    map: row => {
      const title    = row['title']    || row['name']     || row['Title']    || row['Name']     || ''
      const username = row['username'] || row['email']    || row['Username'] || row['Email']    || row['login'] || ''
      const password = row['password'] || row['Password'] || ''
      const notes    = row['notes']    || row['Notes']    || row['comment']  || row['Comments'] || ''
      if (!title && !username) return null
      return { title, username, password, notes, category: 'other' }
    },
  },
}

function guessCategory(grouping) {
  const g = (grouping || '').toLowerCase()
  if (g.includes('bank') || g.includes('finance') || g.includes('money')) return 'banking'
  if (g.includes('email') || g.includes('mail')) return 'email'
  if (g.includes('social') || g.includes('social media')) return 'social'
  if (g.includes('medical') || g.includes('health')) return 'medical'
  if (g.includes('insurance')) return 'insurance'
  if (g.includes('utility') || g.includes('utilities')) return 'utilities'
  if (g.includes('invest') || g.includes('pension')) return 'investments'
  return 'other'
}

function detectFormat(headers) {
  const h = headers.map(s => s.trim())
  for (const [key, mapper] of Object.entries(MAPPERS)) {
    if (key !== 'generic' && mapper.detect(h)) return key
  }
  return 'generic'
}

export default function ImportCSV({ onImport, onClose, planEntryLimit, currentCount }) {
  const [step, setStep]         = useState('upload')  // upload | preview | importing | done
  const [rows, setRows]         = useState([])
  const [format, setFormat]     = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [progress, setProgress] = useState(0)
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped]   = useState(0)
  const fileRef = useRef(null)

  const remaining = planEntryLimit === Infinity
    ? Infinity
    : Math.max(0, planEntryLimit - currentCount)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please select a .csv file')
      return
    }

    Papa.parse(file, {
      header:           true,
      skipEmptyLines:   true,
      transformHeader:  h => h.trim(),
      complete: (result) => {
        if (!result.data?.length) { toast.error('No rows found in file'); return }
        const headers = result.meta.fields || []
        const fmt     = detectFormat(headers)
        const mapper  = MAPPERS[fmt]
        const mapped  = result.data
          .slice(0, 500)       // hard cap on raw rows before mapping (prevents memory abuse)
          .map(mapper.map)
          .filter(r => r && r.title)

        setFormat(fmt)
        setRows(mapped)
        setSelected(new Set(mapped.map((_, i) => i)))
        setStep('preview')
      },
      error: () => toast.error('Could not read file'),
    })
  }

  async function handleImport() {
    const toImport = rows.filter((_, i) => selected.has(i))
    const limit    = remaining === Infinity ? toImport.length : Math.min(toImport.length, remaining)
    if (limit === 0) {
      toast.error('No entries to import or plan limit reached')
      return
    }

    setStep('importing')
    let done = 0, skip = 0
    for (let i = 0; i < limit; i++) {
      try {
        await onImport(toImport[i])
        done++
      } catch { skip++ }
      setProgress(Math.round(((i + 1) / limit) * 100))
    }
    setImported(done)
    setSkipped(skip)
    setStep('done')
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((_, i) => i)))
  }

  if (step === 'upload') return (
    <div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>
        Import from password manager
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 20 }}>
        Import accounts from 1Password, Bitwarden, LastPass, Chrome, Edge, or any CSV export.
        All data is encrypted with your vault key before saving.
      </p>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 10 }}>Supported formats:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.values(MAPPERS).filter(m => m.label !== 'Generic CSV').map(m => (
            <span key={m.label} style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 12,
              background: 'rgba(201,168,76,0.1)', border: '1px solid var(--gold-border)',
              color: 'var(--gold)',
            }}>{m.label}</span>
          ))}
          <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>Generic CSV</span>
        </div>
      </div>

      <div style={{
        border: '2px dashed var(--border-md)', borderRadius: 12, padding: '36px 24px',
        textAlign: 'center', cursor: 'pointer', marginBottom: 16,
        transition: 'border-color 0.15s',
      }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile({ target: { files: [f] } }) }}
      >
        <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
        <div style={{ fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>Drop your CSV file here</div>
        <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>or click to browse</div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile}
          style={{ display: 'none' }} />
      </div>

      <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6, marginBottom: 16 }}>
        🔐 Your CSV never leaves your device. Passwords are encrypted with your vault key before being saved.
      </div>

      <button className="btn-ghost" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
    </div>
  )

  if (step === 'preview') {
    const limitedRows = remaining === Infinity ? rows : rows.slice(0, remaining)
    const overLimit   = rows.length > remaining && remaining !== Infinity
    return (
      <div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 6 }}>
          Preview import
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 12, lineHeight: 1.6 }}>
          Detected format: <strong style={{ color: 'var(--gold)' }}>{MAPPERS[format]?.label}</strong>
          {' '}&middot; {rows.length} entries found &middot; {selected.size} selected
        </p>

        {overLimit && (
          <div style={{ padding: '10px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--cream-dim)', marginBottom: 12 }}>
            Your plan allows {remaining} more {remaining === 1 ? 'entry' : 'entries'}. Only the first {remaining} selected entries will be imported. <a href="/?page=plan" style={{ color: 'var(--gold)' }}>Upgrade</a> for unlimited.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={toggleAll} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0 }}>
            {selected.size === rows.length ? 'Deselect all' : 'Select all'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{selected.size} of {rows.length}</span>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {rows.map((row, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 8, cursor: 'pointer', opacity: i >= remaining && remaining !== Infinity ? 0.4 : 1,
              background: selected.has(i) ? 'rgba(201,168,76,0.06)' : 'transparent',
              border: `1px solid ${selected.has(i) ? 'var(--gold-border)' : 'var(--border)'}`,
            }}>
              <input type="checkbox" checked={selected.has(i)}
                onChange={() => {
                  const next = new Set(selected)
                  next.has(i) ? next.delete(i) : next.add(i)
                  setSelected(next)
                }}
                style={{ accentColor: 'var(--gold)', flexShrink: 0 }}
                disabled={i >= remaining && remaining !== Infinity} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.title || '(no title)'}
                </div>
                {row.username && <div style={{ fontSize: 11, color: 'var(--text-sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.username}</div>}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-sub)', flexShrink: 0 }}>{row.category}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setStep('upload')} style={{ flex: 1 }}>Back</button>
          <button className="btn-primary" onClick={handleImport}
            disabled={selected.size === 0}
            style={{ flex: 2, padding: 12 }}>
            Import {Math.min(selected.size, remaining === Infinity ? selected.size : remaining)} entries
          </button>
        </div>
      </div>
    )
  }

  if (step === 'importing') return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🔐</div>
      <div style={{ fontSize: 15, color: 'var(--cream)', marginBottom: 8 }}>Encrypting and saving...</div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', margin: '16px 0' }}>
        <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 99, width: `${progress}%`, transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{progress}% complete</div>
    </div>
  )

  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>
        Import complete
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.7 }}>
        {imported} {imported === 1 ? 'entry' : 'entries'} imported and encrypted.
        {skipped > 0 && ` ${skipped} skipped due to errors.`}
      </p>
      <button className="btn-primary" onClick={onClose} style={{ padding: '12px 32px' }}>
        Done
      </button>
    </div>
  )
}
