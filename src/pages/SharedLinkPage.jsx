import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Decrypt with a link-specific key from URL fragment
async function decryptWithLinkKey(encryptedB64, linkKeyB64) {
  const keyBytes = Uint8Array.from(atob(linkKeyB64), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])

  const combined  = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0))
  const iv         = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, ciphertext)
  return JSON.parse(new TextDecoder().decode(plainBuf))
}

function TreeLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <g transform="translate(50,58)">
        <rect x="-4" y="6" width="8" height="24" rx="2" fill="#c9a84c"/>
        <path d="M-4,30 Q-11,36 -18,32 M4,30 Q11,36 18,32 M0,30 L0,36" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M0,6 L0,-5 M0,0 L-16,-14 M0,0 L16,-14 M-16,-14 L-26,-26 M-16,-14 L-10,-28 M16,-14 L26,-26 M16,-14 L10,-28 M0,-5 L-6,-21 M0,-5 L6,-21" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="-26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="-10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="-6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="0" cy="-38" r="7" fill="#c9a84c"/>
      </g>
    </svg>
  )
}

export default function SharedLinkPage() {
  const params  = new URLSearchParams(window.location.search)
  const token   = params.get('t')
  const linkKey = decodeURIComponent(window.location.hash.replace('#key=', ''))

  const [stage, setStage]   = useState('loading')
  // loading | pin_required | decrypting | ready | expired | error
  const [content, setContent]   = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState({})
  const [showSignup, setShowSignup] = useState(false)

  useEffect(() => { loadLink() }, [])

  async function loadLink(pin) {
    if (!token || !linkKey) { setStage('error'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('shared-link-access', {
        body: { token, pin: pin || undefined },
      })

      if (error) throw error

      if (data.requiresPin) { setStage('pin_required'); setLoading(false); return }
      if (data.error) {
        if (data.error.includes('expired') || data.error.includes('viewed')) setStage('expired')
        else if (data.error === 'Incorrect PIN') { setPinError('Incorrect PIN - try again'); setLoading(false); return }
        else setStage('error')
        setLoading(false)
        return
      }

      setMetadata(data)

      // Decrypt client-side with the key from the URL fragment
      const decrypted = await decryptWithLinkKey(data.encryptedPayload, linkKey)
      setContent(decrypted)
      setStage('ready')
    } catch (err) {
      console.error('Share link error')
      setStage('error')
    } finally {
      setLoading(false)
    }
  }

  async function handlePinSubmit(e) {
    e.preventDefault()
    if (!pinInput) return
    setPinError('')
    await loadLink(pinInput)
  }

  async function copyToClipboard(key, value) {
    await navigator.clipboard.writeText(value)
    setCopied(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 3000)
    // Clear password from clipboard after 60s
    if (key === 'password') {
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText()
          if (current === value) await navigator.clipboard.writeText('')
        } catch {}
      }, 60000)
    }
  }

  const wrapStyle = {
    minHeight: '100vh', background: 'var(--navy)', display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--sans)',
  }
  const containerStyle = {
    maxWidth: 560, margin: '0 auto', padding: '40px 24px', flex: 1,
  }

  if (stage === 'loading') {
    return (
      <div style={{ ...wrapStyle, alignItems: 'center', justifyContent: 'center' }}>
        <TreeLogo />
        <span className="spinner" style={{ marginTop: 20 }} />
      </div>
    )
  }

  if (stage === 'pin_required') {
    return (
      <div style={wrapStyle}>
        <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <TreeLogo size={28} />
          <span style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)' }}>Digital Relative</span>
        </div>
        <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card-static" style={{ padding: 32, textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔐</div>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>PIN required</h2>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 20 }}>The sender has protected this link with a PIN.</p>
            <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" type="text" placeholder="Enter PIN"
                value={pinInput} onChange={e => setPinInput(e.target.value)}
                autoFocus style={{ textAlign: 'center', fontSize: 18, padding: 12 }} />
              {pinError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{pinError}</div>}
              <button className="btn-primary" type="submit" disabled={loading || !pinInput} style={{ padding: 12 }}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Access →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'expired') {
    return (
      <div style={{ ...wrapStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 10 }}>This link has expired</h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>Ask the sender to create a new share link.</p>
        </div>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div style={{ ...wrapStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 10 }}>Link not found</h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>This link may have been revoked or never existed.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      {/* Header */}
      <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TreeLogo size={28} />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)' }}>Digital Relative</span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-sub)' }}>
          Secure shared content
        </div>
      </div>

      <div style={containerStyle}>
        {/* What was shared */}
        <div className="fade-up" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Shared with you
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--cream)', marginBottom: 6 }}>
            {metadata?.contentLabel || content?.label}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
            {metadata?.oneTime ? '⚠️ One-time view - this link is now destroyed' : `Expires: ${new Date(metadata?.expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
          </div>
        </div>

        {/* Content */}
        <div className="fade-up-2 card-static" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {content?.username && (
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Username / Account</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 14, color: 'var(--cream)', fontFamily: 'monospace' }}>{content.username}</div>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px', flexShrink: 0 }}
                    onClick={() => copyToClipboard('username', content.username)}>
                    {copied.username ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {content?.password && (
              <div>
                <div className="label" style={{ marginBottom: 4, color: 'var(--danger)' }}>⚠️ Password</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 14, color: 'var(--cream-dim)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    {'•'.repeat(12)}
                  </div>
                  <button className="btn-primary" style={{ fontSize: 11, padding: '5px 14px', flexShrink: 0, background: copied.password ? 'var(--success)' : undefined }}
                    onClick={() => copyToClipboard('password', content.password)}>
                    {copied.password ? '✓ Copied (clears in 60s)' : '🔐 Copy password'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                  Never shown on screen · Clipboard cleared after 60 seconds
                </div>
              </div>
            )}

            {content?.notes && (
              <div>
                <div className="label" style={{ marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{content.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Security notice */}
        <div className="fade-up-3" style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 24 }}>
          🔐 This content was end-to-end encrypted. The decryption key was in the link - Digital Relative cannot read this data.
        </div>

        {/* Signup prompt */}
        {!showSignup ? (
          <div className="fade-up-4 card-static" style={{ textAlign: 'center', borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 8 }}>
              Want your own secure vault?
            </div>
            <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.6, marginBottom: 16 }}>
              Digital Relative keeps your passwords, documents, and important details safe for your family. Free to start.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn-ghost" style={{ fontSize: 12 }}
                onClick={() => window.location.href = '/?signup=true'}>
                Create free account
              </button>
              <button className="btn-primary" style={{ fontSize: 12 }}
                onClick={() => window.location.href = '/plan'}>
                See plans →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
