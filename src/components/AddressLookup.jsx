import { useState, useRef, useEffect } from 'react'

// UK address entry with optional postcode lookup
// Full street address stored as structured lines joined with newline

function isValidPostcode(pc) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(pc.trim())
}

// Parse a flat address string into structured fields
function parseAddress(str) {
  if (!str) return { line1: '', line2: '', town: '', county: '', postcode: '' }
  // Try to split on commas or newlines
  const parts = str.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
  return {
    line1:    parts[0] || '',
    line2:    parts[1] || '',
    town:     parts[2] || '',
    county:   parts[3] || '',
    postcode: parts[4] || '',
  }
}

// Join structured fields into a single string for storage
function joinAddress(f) {
  return [f.line1, f.line2, f.town, f.county, f.postcode]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(', ')
}

export default function AddressLookup({ value, onChange, placeholder = 'Postcode lookup or enter manually' }) {
  const [fields, setFields] = useState(() => parseAddress(value))
  const [postcode, setPostcode] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showLookup, setShowLookup] = useState(!value)

  // Sync outward value changes in
  const prevValue = useRef(value)
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      setFields(parseAddress(value))
    }
  }, [value])

  function setField(k, v) {
    const next = { ...fields, [k]: v }
    setFields(next)
    onChange(joinAddress(next))
  }

  async function handleLookup() {
    const pc = postcode.trim().toUpperCase().replace(/\s+/g, '')
    if (!isValidPostcode(pc)) { setError('Please enter a valid UK postcode'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (res.status === 404) { setError('Postcode not found'); setLoading(false); return }
      if (!res.ok) { setError('Lookup failed'); setLoading(false); return }
      const data = await res.json()
      const r = data.result
      if (!r) { setError('No result found'); setLoading(false); return }

      // Fill postcode and town from lookup, leave house details blank for user
      const next = {
        ...fields,
        town: r.admin_district || r.region || '',
        postcode: r.postcode || pc,
      }
      setFields(next)
      onChange(joinAddress(next))
      setShowLookup(false)
      setPostcode('')
    } catch {
      setError('Could not reach postcode lookup')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border-md)', borderRadius: 'var(--r)',
    color: 'var(--cream)', fontFamily: 'var(--sans)', fontSize: 13,
    padding: '9px 12px', boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div>
      {/* Postcode lookup toggle */}
      {showLookup && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <input
              style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
              placeholder="Enter postcode to auto-fill town"
              value={postcode}
              onChange={e => { setPostcode(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLookup())}
              maxLength={8}
            />
            <button type="button" onClick={handleLookup}
              disabled={loading || !postcode.trim()}
              style={{
                background: 'var(--gold)', border: 'none', borderRadius: 'var(--r)',
                color: '#0d1b2a', fontWeight: 600, fontSize: 13, padding: '0 14px',
                cursor: loading || !postcode.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !postcode.trim() ? 0.6 : 1,
                fontFamily: 'var(--sans)', flexShrink: 0,
              }}>
              {loading ? '...' : 'Find'}
            </button>
          </div>
          {error && <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>{error}</div>}
          <button type="button" onClick={() => setShowLookup(false)} style={{
            background: 'transparent', border: 'none', color: 'var(--text-sub)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0,
          }}>
            Skip lookup, enter manually
          </button>
        </div>
      )}

      {/* Structured address fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>
            House name / number and street
          </label>
          <input className="input" placeholder="e.g. 42 High Street" value={fields.line1}
            onChange={e => setField('line1', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>
            Address line 2 (optional)
          </label>
          <input className="input" placeholder="e.g. Flat 3, Thornton Business Park" value={fields.line2}
            onChange={e => setField('line2', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>Town / City</label>
            <input className="input" placeholder="e.g. London" value={fields.town}
              onChange={e => setField('town', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>County (optional)</label>
            <input className="input" placeholder="e.g. Surrey" value={fields.county}
              onChange={e => setField('county', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>Postcode</label>
          <input className="input" placeholder="e.g. SW1A 1AA" value={fields.postcode}
            onChange={e => setField('postcode', e.target.value)}
            style={{ maxWidth: 140, textTransform: 'uppercase' }} />
        </div>
      </div>

      {/* Toggle postcode lookup */}
      {!showLookup && (
        <button type="button" onClick={() => setShowLookup(true)} style={{
          marginTop: 6, background: 'transparent', border: 'none',
          color: 'var(--gold)', fontSize: 11, cursor: 'pointer',
          fontFamily: 'var(--sans)', padding: 0,
        }}>
          Use postcode lookup to fill town
        </button>
      )}
    </div>
  )
}
