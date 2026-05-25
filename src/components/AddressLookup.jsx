import { useState, useRef, useEffect, useCallback } from 'react'

// Royal Mail AddressNow Capture integration
// Type any part of an address or postcode - autocompletes against full PAF database
// Falls back to structured manual entry if key not configured

const ADDRESSNOW_KEY = import.meta.env.VITE_ADDRESSNOW_KEY || ''

function parseAddress(str) {
  if (!str) return { line1: '', line2: '', line3: '', town: '', county: '', postcode: '' }
  const parts = str.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
  return {
    line1:    parts[0] || '',
    line2:    parts[1] || '',
    line3:    parts[2] || '',
    town:     parts[3] || '',
    county:   parts[4] || '',
    postcode: parts[5] || '',
  }
}

function joinAddress(f) {
  return [f.line1, f.line2, f.line3, f.town, f.county, f.postcode]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(', ')
}

// AddressNow find + retrieve API calls
async function addressNowFind(query, lastId = '') {
  const params = new URLSearchParams({
    Key: ADDRESSNOW_KEY,
    Text: query,
    IsMiddleware: 'false',
    Container: lastId,
    Origin: '',
    Countries: 'GBR',
    Limit: '7',
    Language: 'en-gb',
  })
  const res = await fetch(`https://api.addressnow.co.uk/capture/interactive/find/v1.10/json3.ws?${params}`)
  const data = await res.json()
  return data.Items || []
}

async function addressNowRetrieve(id) {
  const params = new URLSearchParams({
    Key: ADDRESSNOW_KEY,
    Id: id,
    Field1Format: '{Line1}',   // house number/name + street
    Field2Format: '{Line2}',   // locality/area (often blank)
    Field3Format: '{Line3}',   // district (often blank)
    Field4Format: '{Line4}',   // post town (e.g. Sheffield) - NOT {City}
    Field5Format: '{Line5}',   // county (e.g. South Yorkshire)
    Field6Format: '{PostalCode}', // postcode
  })
  const res = await fetch(`https://api.addressnow.co.uk/capture/interactive/retrieve/v1.20/json3.ws?${params}`)
  const data = await res.json()
  return data.Items?.[0] || null
}

export default function AddressLookup({ value, onChange }) {
  const [fields, setFields]         = useState(() => parseAddress(value))
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]       = useState(false)
  const [open, setOpen]             = useState(false)
  const [useManual, setUseManual]   = useState(!ADDRESSNOW_KEY)
  const dropdownRef                 = useRef(null)
  const debounceRef                 = useRef(null)

  // Sync incoming value changes
  const prevValue = useRef(value)
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      setFields(parseAddress(value))
    }
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (text, containerId = '') => {
    if (!text || text.length < 2) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    try {
      const items = await addressNowFind(text, containerId)
      setSuggestions(items)
      setOpen(items.length > 0)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleQueryChange(e) {
    const v = e.target.value
    setQuery(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 200)
  }

  async function handleSelect(item) {
    if (item.Type === 'Container') {
      // Drill into this container (e.g. a building with multiple flats)
      await search(query, item.Id)
      return
    }
    // Retrieve full address
    setLoading(true)
    try {
      const addr = await addressNowRetrieve(item.Id)
      if (addr) {
        // Line1 = house/street, Line2 = locality, Line3 = district
        // Line4 = post town, Line5 = county, PostalCode = postcode
        // Combine locality+district into line2/line3, skip blanks
        const locality = addr.Field2 || ''
        const district = addr.Field3 || ''
        const next = {
          line1: addr.Field1 || '',
          line2: locality,
          line3: locality && district && locality !== district ? district : (!locality ? district : ''),
          town:  addr.Field4 || '',
          county: addr.Field5 || '',
          postcode: addr.Field6 || '',
        }
        setFields(next)
        onChange(joinAddress(next))
        setQuery(joinAddress(next))
        setOpen(false)
        setSuggestions([])
        setUseManual(true)  // show fields for any tweaks
      }
    } catch {
      // fallback - use description
      setQuery(item.Description || item.Text || '')
    } finally {
      setLoading(false)
    }
  }

  function setField(k, v) {
    const next = { ...fields, [k]: v }
    setFields(next)
    onChange(joinAddress(next))
  }

  const hasValue = !!(fields.line1 || fields.town || fields.postcode)

  return (
    <div>
      {/* Search box */}
      {!useManual && (
        <div style={{ position: 'relative', marginBottom: hasValue ? 10 : 0 }} ref={dropdownRef}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="Start typing an address, street or postcode..."
              value={query}
              onChange={handleQueryChange}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              autoComplete="off"
              style={{ flex: 1 }}
            />
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px',
                color: 'var(--text-sub)', fontSize: 12 }}>...</div>
            )}
          </div>

          {open && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
              background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
              borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              maxHeight: 260, overflowY: 'auto', marginTop: 4,
            }}>
              {suggestions.map((item, i) => (
                <button key={i} type="button"
                  onClick={() => handleSelect(item)}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                    padding: '10px 14px', background: 'transparent', border: 'none',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                    color: 'var(--cream-dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.Text}</span>
                    {item.Description && (
                      <span style={{ color: 'var(--text-sub)', marginLeft: 6, fontSize: 12 }}>
                        {item.Description}
                      </span>
                    )}
                  </div>
                  {item.Type === 'Container' && (
                    <span style={{ fontSize: 11, color: 'var(--text-sub)', flexShrink: 0 }}>
                      {item.Count} addresses ›
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-sub)' }}>
            Search by house name, street, business name or postcode.{' '}
            <button type="button" onClick={() => setUseManual(true)} style={{
              background: 'transparent', border: 'none', color: 'var(--text-sub)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0, textDecoration: 'underline',
            }}>Enter manually instead</button>
          </div>
        </div>
      )}

      {/* Structured fields - shown after selection or in manual mode */}
      {(useManual || hasValue) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>
              House / flat / building name or number
            </label>
            <input className="input" placeholder="e.g. 42, Flat 3, The Old Mill" value={fields.line1}
              onChange={e => setField('line1', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>
              Street
            </label>
            <input className="input" placeholder="e.g. High Street" value={fields.line2}
              onChange={e => setField('line2', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-sub)', display: 'block', marginBottom: 3 }}>
              Address line 3 (optional)
            </label>
            <input className="input" placeholder="e.g. Thornton Business Park" value={fields.line3}
              onChange={e => setField('line3', e.target.value)} />
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

          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            {ADDRESSNOW_KEY && (
              <button type="button" onClick={() => {
                setUseManual(false)
                setQuery('')
                setSuggestions([])
              }} style={{
                background: 'transparent', border: 'none', color: 'var(--gold)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0,
              }}>
                Search again
              </button>
            )}
            {hasValue && (
              <button type="button" onClick={() => {
                const empty = { line1:'', line2:'', line3:'', town:'', county:'', postcode:'' }
                setFields(empty)
                onChange('')
                setQuery('')
                setUseManual(!ADDRESSNOW_KEY)
              }} style={{
                background: 'transparent', border: 'none', color: 'var(--text-sub)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--sans)', padding: 0,
              }}>
                Clear address
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
