import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { deriveKey, decrypt, getSessionKey, setSessionKey, encrypt } from '../lib/crypto'
import { formatPin } from '../lib/vaultPin'
import toast from 'react-hot-toast'

const EXPIRY_OPTIONS = [
  { label: '1 hour',   seconds: 3600 },
  { label: '6 hours',  seconds: 21600 },
  { label: '12 hours', seconds: 43200 },
  { label: '24 hours', seconds: 86400 },
  { label: '3 days',   seconds: 259200 },
  { label: '7 days',   seconds: 604800 },
  { label: '14 days',  seconds: 1209600 },
  { label: '30 days',  seconds: 2592000 },
]

// Generate a random 256-bit key as base64
function generateLinkKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}

// Derive a CryptoKey from the link key string
async function linkKeyToCryptoKey(linkKeyB64) {
  const bytes = Uint8Array.from(atob(linkKeyB64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// Encrypt with a link-specific key (not the vault key)
async function encryptWithLinkKey(plaintext, linkKey) {
  const cryptoKey = await linkKeyToCryptoKey(linkKey)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, enc.encode(plaintext))
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

// Hash a PIN with token as salt (for server-side verification)
async function hashPin(pin, token) {
  // PBKDF2 matching shared-link-access.ts server-side verification
  const enc    = new TextEncoder()
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits   = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(token), iterations: 100_000, hash: 'SHA-256' },
    keyMat, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ShareModal({ item, itemType, onClose }) {
  const { user, profile } = useAuth()

  // Auth steps
  const [step, setStep]         = useState('auth')  // auth | mfa | configure | created
  const [pin, setPin]           = useState('')
  const [mfaCode, setMfaCode]   = useState('')
  const [loading, setLoading]   = useState(false)
  // Use ref not state — never store plaintext in React state (visible in DevTools)
  const decryptedRef = useRef(null)

  // Link configuration
  const [expiryIdx, setExpiryIdx]     = useState(3)    // default 24 hours
  const [oneTime, setOneTime]         = useState(false)
  const [notifyAccess, setNotifyAccess] = useState(true)
  const [includePassword, setIncludePassword] = useState(false)
  const [recipientPin, setRecipientPin]       = useState('')
  const [usePin, setUsePin]                   = useState(false)

  // Created link
  const [createdLink, setCreatedLink] = useState(null)
  const [copied, setCopied]           = useState(false)

  const hasPassword = !!(item?.password)

  async function handlePin(e) {
    e.preventDefault()
    if (pin.length < 6) { toast.error('Enter your vault PIN'); return }
    setLoading(true)
    try {
      // Re-derive key from PIN and decrypt item
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault configuration error')

      const key = await deriveKey(pin, user.id, salt)
      const prevKey = getSessionKey()
      setSessionKey(key)

      // Decrypt the item content
      const decrypted = {}
      if (item.username) decrypted.username = await decrypt(item.username).catch(() => '')
      if (item.password && includePassword) decrypted.password = await decrypt(item.password).catch(() => '')
      if (item.notes)    decrypted.notes    = await decrypt(item.notes).catch(() => '')
      // Store in ref not state — keeps plaintext out of React DevTools
      decryptedRef.current = { ...item, ...decrypted }

      setSessionKey(prevKey)

      // Check MFA
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasVerifiedMfa = factors?.totp?.some(f => f.status === 'verified')
      if (hasVerifiedMfa) {
        setStep('mfa')
      } else {
        setStep('configure')
      }
    } catch (err) {
      toast.error(err.message === 'Decryption failed - data may be corrupt or password incorrect'
        ? 'Incorrect PIN' : err.message || 'Incorrect PIN')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  async function handleMfa(e) {
    e.preventDefault()
    if (mfaCode.length !== 6) { toast.error('Enter your 6-digit code'); return }
    setLoading(true)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('No MFA factor found')
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      const { error } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code: mfaCode })
      if (error) throw new Error('Invalid code')
      setStep('configure')
    } catch (err) {
      toast.error(err.message || 'Verification failed')
      setMfaCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    setLoading(true)
    try {
      // Generate random link key — this goes in the URL fragment, NEVER the server
      const linkKey = generateLinkKey()

      // Build the payload to share
      const payload = {
        type:     itemType,
        label:    item.title || item.display_name || item.name || 'Shared item',
        username: decryptedRef.current?.username || '',
        notes:    decryptedRef.current?.notes || '',
        category: item.category,
        // Only include password if user explicitly chose to and passed auth
        ...(includePassword && decryptedRef.current?.password
          ? { password: decryptedRef.current.password }
          : {}),
      }

      // Encrypt payload with the link key (not vault key)
      const encryptedPayload = await encryptWithLinkKey(JSON.stringify(payload), linkKey)

      // Generate token
      const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
      const token      = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      // Hash recipient PIN if set
      let pinHash = null
      if (usePin && recipientPin.length >= 4) {
        pinHash = await hashPin(recipientPin, token)
      }

      // Calculate expiry
      const expiresAt = new Date(Date.now() + EXPIRY_OPTIONS[expiryIdx].seconds * 1000).toISOString()

      // Save to DB — server stores encrypted blob + metadata, NOT the key
      const { data: link, error } = await supabase.from('shared_links').insert([{
        user_id:           user.id,
        content_type:      itemType,
        content_id:        item.id,
        content_label:     payload.label,
        encrypted_payload: encryptedPayload,
        includes_password: includePassword && !!decryptedRef.current?.password,
        token,
        pin_hash:          pinHash,
        expires_at:        expiresAt,
        one_time:          oneTime,
        max_views:         oneTime ? 1 : null,
        notify_on_access:  notifyAccess,
      }]).select().single()

      if (error) throw error

      // Build the full share URL — key goes in fragment (#), never sent to server
      const shareUrl = `${window.location.origin}/share?t=${token}#key=${encodeURIComponent(linkKey)}`
      setCreatedLink({ url: shareUrl, expiresAt, oneTime, includesPassword: includePassword && !!decryptedRef.current?.password })

      setStep('created')
      toast.success('Share link created')
    } catch (err) {
      toast.error(err.message || 'Failed to create link')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(createdLink.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
    toast.success('Link copied to clipboard')
  }

  function shareVia(method) {
    const url   = createdLink.url
    const text  = `${user?.email || 'Someone'} shared "${item.title || item.name}" with you via Digital Relative`
    const encoded = encodeURIComponent(url)
    const textEncoded = encodeURIComponent(text + '\n\n' + url)

    const links = {
      whatsapp: `https://wa.me/?text=${textEncoded}`,
      email:    `mailto:?subject=${encodeURIComponent('Shared with you')}&body=${textEncoded}`,
      sms:      `sms:?body=${textEncoded}`,
    }
    if (links[method]) window.open(links[method], '_blank')
  }

  const expiryLabel = EXPIRY_OPTIONS[expiryIdx]?.label

  return (
    <div className="modal-overlay" onClick={step === 'created' ? onClose : undefined}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>

        {/* ── Step 1: PIN ── */}
        {step === 'auth' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>
                Verify to share
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                Enter your vault PIN to create a share link for <strong style={{ color: 'var(--text)' }}>"{item.title || item.display_name || item.name}"</strong>.
              </p>
            </div>

            {hasPassword && (
              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 16, background: includePassword ? 'var(--danger-dim)' : 'rgba(255,255,255,0.02)' }}>
                <input type="checkbox" checked={includePassword} onChange={e => setIncludePassword(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--danger)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: includePassword ? 'var(--danger)' : 'var(--text)', marginBottom: 2 }}>
                    Include stored password
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5 }}>
                    {includePassword
                      ? '⚠️ The password will be in the link. Anyone with it can copy the password.'
                      : 'The password will not be included. Only account details and notes.'}
                  </div>
                </div>
              </label>
            )}

            <form onSubmit={handlePin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="input" type="password" inputMode="numeric"
                placeholder="Vault PIN"
                value={pin} onChange={e => setPin(formatPin(e.target.value))}
                maxLength={12} autoFocus
                style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.4em', padding: '14px' }} />
              <button className="btn-primary" type="submit" disabled={loading || pin.length < 6} style={{ padding: 12, width: '100%' }}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Continue →'}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
            </form>
          </>
        )}

        {/* ── Step 2: MFA ── */}
        {step === 'mfa' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📱</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>Two-factor verification</h2>
              <p style={{ fontSize: 13, color: 'var(--text-sub)' }}>Enter the 6-digit code from your authenticator app.</p>
            </div>
            <form onSubmit={handleMfa} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="input" placeholder="000000"
                value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                maxLength={6} autoFocus
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', padding: '14px' }} />
              <button className="btn-primary" type="submit" disabled={loading || mfaCode.length !== 6} style={{ padding: 12, width: '100%' }}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verify →'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setStep('auth')} style={{ width: '100%' }}>← Back</button>
            </form>
          </>
        )}

        {/* ── Step 3: Configure ── */}
        {step === 'configure' && (
          <>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>
              Configure share link
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 22, lineHeight: 1.6 }}>
              Sharing: <strong style={{ color: 'var(--text)' }}>{item.title || item.display_name || item.name}</strong>
              {includePassword && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>· includes password</span>}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Expiry slider */}
              <div>
                <label className="label">Link expires after</label>
                <div style={{ padding: '0 4px' }}>
                  <input type="range" min={0} max={EXPIRY_OPTIONS.length - 1}
                    value={expiryIdx} onChange={e => setExpiryIdx(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-sub)', marginTop: 4 }}>
                    <span>1 hour</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 500, fontSize: 13 }}>{expiryLabel}</span>
                    <span>30 days</span>
                  </div>
                </div>
              </div>

              {/* One-time toggle */}
              <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--r)', border: `1px solid ${oneTime ? 'var(--gold-border)' : 'var(--border)'}`, background: oneTime ? 'var(--gold-dim)' : 'transparent', transition: 'all 0.15s' }}>
                <input type="checkbox" checked={oneTime} onChange={e => setOneTime(e.target.checked)}
                  style={{ accentColor: 'var(--gold)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: oneTime ? 'var(--gold)' : 'var(--text)' }}>One-time view only</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>Link is destroyed after the first person views it</div>
                </div>
              </label>

              {/* Notify on access */}
              <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', padding: '12px 14px', borderRadius: 'var(--r)', border: `1px solid ${notifyAccess ? 'rgba(76,175,130,0.3)' : 'var(--border)'}`, background: notifyAccess ? 'rgba(76,175,130,0.08)' : 'transparent', transition: 'all 0.15s' }}>
                <input type="checkbox" checked={notifyAccess} onChange={e => setNotifyAccess(e.target.checked)}
                  style={{ accentColor: 'var(--success)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: notifyAccess ? 'var(--success)' : 'var(--text)' }}>Notify me when accessed</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>Send me an email when someone opens this link</div>
                </div>
              </label>

              {/* Optional recipient PIN */}
              <div>
                <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', marginBottom: usePin ? 10 : 0 }}>
                  <input type="checkbox" checked={usePin} onChange={e => setUsePin(e.target.checked)}
                    style={{ accentColor: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Require a PIN to access</div>
                    <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>Recipient must enter a PIN you set - share it with them separately</div>
                  </div>
                </label>
                {usePin && (
                  <input className="input" type="text" placeholder="Set a PIN for the recipient (min 4 characters)"
                    value={recipientPin} onChange={e => setRecipientPin(e.target.value)} maxLength={20} autoFocus />
                )}
              </div>

              {/* Security note */}
              <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                🔐 Content is end-to-end encrypted. The decryption key is in the link itself - we cannot read it. Anyone with the full link can access the content, so share it carefully.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn-ghost" onClick={() => setStep('auth')} style={{ flex: 1 }}>← Back</button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading || (usePin && recipientPin.length < 4)}
                style={{ flex: 2, padding: 12 }}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create share link →'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Created ── */}
        {step === 'created' && createdLink && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 6 }}>Share link created</h2>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                Expires: {new Date(createdLink.expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                {createdLink.oneTime && ' · One-time view'}
                {createdLink.includesPassword && <span style={{ color: 'var(--danger)' }}> · Includes password</span>}
              </p>
            </div>

            {/* Link display */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 16, wordBreak: 'break-all', fontSize: 11, fontFamily: 'monospace', color: 'var(--cream-dim)' }}>
              {createdLink.url.split('#')[0]}<span style={{ color: 'var(--text-sub)' }}>#key=••••••••</span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <button className="btn-primary" onClick={copyLink} style={{ padding: 12, fontSize: 14 }}>
                {copied ? '✓ Copied!' : '📋 Copy link'}
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { id: 'whatsapp', label: '💬 WhatsApp' },
                  { id: 'email',    label: '✉️ Email' },
                  { id: 'sms',      label: '📱 SMS' },
                ].map(s => (
                  <button key={s.id} className="btn-ghost" onClick={() => shareVia(s.id)}
                    style={{ fontSize: 12, padding: '9px 6px', textAlign: 'center' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {usePin && (
              <div style={{ padding: '10px 14px', background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--cream-dim)', marginBottom: 16 }}>
                ⚠️ Remember to share the PIN with the recipient separately - not in the same message as the link.
              </div>
            )}

            <button className="btn-ghost" onClick={onClose} style={{ width: '100%' }}>Done</button>
          </>
        )}
      </div>
    </div>
  )
}
