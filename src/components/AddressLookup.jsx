import { useState, useRef, useEffect } from 'react'

// GetAddress.io UK address lookup
// API key stored client-side (public key - read-only, rate-limited by domain in GetAddress.io dashboard)
const GETADDRESS_API_KEY = import.meta.env.VITE_GETADDRESS_API_KEY || ''

// Validate postcode format before hitting the API
function isValidPostcode(pc) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(pc.trim())
}

// Format a GetAddress result line array into a clean single string
function formatAddress(result) {
  const parts = [
    result.line_1, result.line_2, result.line_3, result.line_4,
    result.locality, result.town_or_city, result.county,
  ].filter(Boolean)
  return parts.join(', ')
}

export default function AddressLookup({ value, onChange, placeholder = 'Start typing a postcode…' }) {
  const [postcode, setPostcode]     = useState('')
  const [results, setResults]       = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [mode, setMode]             = useState('lookup') // lookup | manual
  const dropdownRef                 = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLookup() {
    const pc = postcode.trim().toUpperCase()
    if (!isValidPostcode(pc)) {
      setError('Please enter a valid UK postcode')
      return
    }
    if (!GETADDRESS_API_KEY) {
      setError('Address lookup not configured')
      setMode('manual')
      return
    }
    setLoading(true)
    setError('')
    setResults([])
    try {
      const res = await fetch(
        `https://api.getaddress.io/find/${encodeURIComponent(pc)}?api-key=${GETADDRESS_API_KEY}&expand=true`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (res.status === 404) { setError('No addresses found for this postcode'); setLoading(false); return }
      if (!res.ok) { setError('Address lookup failed - enter manually'); setLoading(false); return }
      const data = await res.json()
      const addresses = (data.addresses || []).map(a => formatAddress(a) + ', ' + pc)
      setResults(addresses)
      setShowDropdown(true)
    } catch {
      setError('Could not reach address lookup - enter manually')
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(address) {
    onChange(address)
    setShowDropdown(false)
    setPostcode('')
    setResults([])
  }

  if (mode === 'manual') {
    return (
      <div>
        <textarea className="input" style={{ minHeight: 72, resize: 'vertical' }}
          placeholder="Enter full address"
          value={value}
          onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => setMode('lookup')} style={{
          marginTop: 4, background: 'transparent', border: 'none',
          color: 'var(--gold)', fontSize: 12, cursor: 'pointer',
          fontFamily: 'var(--sans)', padding: 0,
        }}>
          Use postcode lookup instead
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Current value display */}
      {value && (
        <div style={{
          padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-md)', borderRadius: 'var(--r)',
          fontSize: 13, color: 'var(--cream-dim)', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ lineHeight: 1.5 }}>{value}</span>
          <button type="button" onClick={() => onChange('')} style={{
            flexShrink: 0, background: 'transparent', border: 'none',
            color: 'var(--text-sub)', fontSize: 16, cursor: 'pointer',
            lineHeight: 1, padding: '0 2px',
          }}>x</button>
        </div>
      )}

      {/* Postcode input + lookup button */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder={placeholder}
          value={postcode}
          onChange={e => { setPostcode(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLookup())}
          style={{ flex: 1, textTransform: 'uppercase' }}
          maxLength={8}
        />
        <button type="button" onClick={handleLookup} disabled={loading || !postcode.trim()} style={{
          background: 'var(--gold)', border: 'none', borderRadius: 'var(--r)',
          color: '#0d1b2a', fontWeight: 600, fontSize: 13, padding: '0 16px',
          cursor: loading || !postcode.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !postcode.trim() ? 0.6 : 1,
          fontFamily: 'var(--sans)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {loading ? '...' : 'Find address'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{error}</div>}

      {/* Results dropdown */}
      {showDropdown && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--navy-lt)', border: '1px solid var(--border-md)',
          borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 260, overflowY: 'auto', marginTop: 4,
        }}>
          {results.map((addr, i) => (
            <button key={i} type="button" onClick={() => handleSelect(addr)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px', background: 'transparent',
              border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
              color: 'var(--cream-dim)', fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--sans)', lineHeight: 1.5,
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {addr}
            </button>
          ))}
        </div>
      )}

      {/* Manual entry link */}
      <button type="button" onClick={() => setMode('manual')} style={{
        marginTop: 4, background: 'transparent', border: 'none',
        color: 'var(--text-sub)', fontSize: 12, cursor: 'pointer',
        fontFamily: 'var(--sans)', padding: 0,
      }}>
        Enter address manually instead
      </button>
    </div>
  )
}
