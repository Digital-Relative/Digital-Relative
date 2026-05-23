import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { deriveKey, setSessionKey, generateSalt } from '../lib/crypto'
import { validatePin, formatPin } from '../lib/vaultPin'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Shown when a user has not yet set their vault PIN
// Triggered on first login for Google/Apple users, or
// for email users who signed up before PIN was introduced
export default function VaultPinSetup({ onComplete }) {
  const { user, profile, setProfile } = useAuth()
  const [pin, setPin]         = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep]       = useState(1) // 1=create, 2=confirm

  async function handleCreate(e) {
    e.preventDefault()
    const err = validatePin(pin)
    if (err) { toast.error(err); return }
    setStep(2)
  }

  async function handleConfirm(e) {
    e.preventDefault()
    if (pin !== confirm) { toast.error('PINs do not match - please try again'); setConfirm(''); return }

    setLoading(true)
    try {
      // Generate a new random salt for this user
      const salt = generateSalt()

      // Derive the encryption key from PIN + userId + salt
      const key = await deriveKey(pin, user.id, salt)
      setSessionKey(key)

      // Encrypt a known test string to verify PIN on future logins
      // This lets us confirm the PIN is correct without storing it
      const testEncrypted = await (async () => {
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const enc = new TextEncoder()
        const ct  = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: 128 }, key, enc.encode('dr_key_ok')
        )
        const combined = new Uint8Array(iv.byteLength + ct.byteLength)
        combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.byteLength)
        return btoa(String.fromCharCode(...combined))
      })()

      // Store salt + test string in profiles (NOT the PIN — we never store the PIN)
      await supabase.from('profiles').update({
        encryption_salt: salt,
        vault_pin_set: true,
        key_verification: testEncrypted,
      }).eq('id', user.id)

      // Update local profile state directly (vault_pin_set not in updateProfile whitelist by design)
      setProfile(prev => ({ ...prev, vault_pin_set: true, encryption_salt: salt, key_verification: testEncrypted }))

      toast.success('Vault PIN set - your data is now encrypted')
      onComplete()
    } catch (err) {
      toast.error(err.message || 'Failed to set PIN')
    } finally {
      setLoading(false)
    }
  }

  const isOAuth = user?.app_metadata?.provider === 'google' ||
                  user?.app_metadata?.provider === 'apple'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.05) 0%, transparent 60%)',
    }}>
      <div style={{ width: 420, maxWidth: '92vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🔐</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 30, color: 'var(--cream)', marginBottom: 8 }}>
            Set your vault PIN
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            {isOAuth
              ? `You signed in with ${user?.app_metadata?.provider === 'google' ? 'Google' : 'Apple'}. Create a separate vault PIN to encrypt your data - this is different from your ${user?.app_metadata?.provider === 'google' ? 'Google' : 'Apple'} password.`
              : 'Create a PIN to encrypt your vault. This is separate from your login password.'}
          </p>
        </div>

        <div className="card-static" style={{ padding: 32 }}>
          {step === 1 ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)', padding: '14px 16px', fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--gold)' }}>Important:</strong> Your PIN encrypts your vault. If you forget it, your data cannot be recovered - not even by us. Store it somewhere safe.
              </div>

              <div>
                <label className="label">Create vault PIN (6–12 digits)</label>
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••••"
                  value={pin}
                  onChange={e => setPin(formatPin(e.target.value))}
                  maxLength={12}
                  autoFocus
                  style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', padding: '16px' }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 6 }}>
                  {pin.length > 0 && `${pin.length} digit${pin.length !== 1 ? 's' : ''} entered`}
                </div>
              </div>

              <button className="btn-primary" type="submit" style={{ padding: 14, fontSize: 15 }}>
                Continue →
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-sub)' }}>
                Enter your PIN again to confirm
              </div>

              <div>
                <label className="label">Confirm vault PIN</label>
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  placeholder="••••••"
                  value={confirm}
                  onChange={e => setConfirm(formatPin(e.target.value))}
                  maxLength={12}
                  autoFocus
                  style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', padding: '16px' }}
                />
              </div>

              <button className="btn-primary" type="submit" disabled={loading || confirm.length < 6}
                style={{ padding: 14, fontSize: 15 }}>
                {loading
                  ? <span className="spinner" style={{ width: 18, height: 18 }} />
                  : 'Encrypt my vault'}
              </button>
              <button type="button" className="btn-ghost"
                onClick={() => { setStep(1); setConfirm('') }}>
                ← Back
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-sub)', marginTop: 16, lineHeight: 1.6 }}>
          Your PIN never leaves your device · AES-256-GCM encryption · We cannot recover it
        </p>
      </div>
    </div>
  )
}
