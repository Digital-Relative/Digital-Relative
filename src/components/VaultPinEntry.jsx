import { useState, useEffect } from 'react'
import { RedeemRecoveryCode } from './VaultRecoveryCodes'
import { useAuth } from '../context/AuthContext'
import { deriveKey, setSessionKey, getSessionKey, decrypt, saveTrustedPin, loadTrustedPin, hasTrustedDevice, clearTrustedDevice, migrateTrustedDevice } from '../lib/crypto'
import { supabase } from '../lib/supabase'
import { formatPin } from '../lib/vaultPin'
import toast from 'react-hot-toast'

// Shown when user is logged in but vault PIN has not been entered this session
// (e.g. after inactivity lock, or first load for OAuth users)
export default function VaultPinEntry({ onUnlocked, onSignOut }) {
  const { user, profile } = useAuth()
  const [pin, setPin]       = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts]   = useState(0)
  const [trustDevice, setTrustDevice] = useState(false)
  const [autoUnlocking, setAutoUnlocking] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const MAX_ATTEMPTS = 5

  // Auto-unlock if this device was previously trusted
  useEffect(() => {
    async function tryAutoUnlock() {
      if (!user?.id || !profile?.encryption_salt) return
      if (!hasTrustedDevice(user.id)) return
      setAutoUnlocking(true)
      try {
        const savedPin = await loadTrustedPin(user.id)
        if (!savedPin) { setAutoUnlocking(false); return }
        const salt = profile.encryption_salt
        const key  = await deriveKey(savedPin, user.id, salt)
        if (profile?.key_verification) {
          const prevKey = getSessionKey()
          setSessionKey(key)
          try {
            const result = await decrypt(profile.key_verification)
            if (result !== 'dr_key_ok') {
              setSessionKey(prevKey)
              // Saved PIN no longer works (PIN was changed) - clear trust
              clearTrustedDevice(user.id)
              setAutoUnlocking(false)
              return
            }
          } catch {
            setSessionKey(prevKey)
            clearTrustedDevice(user.id)
            setAutoUnlocking(false)
            return
          }
        }
        setSessionKey(key)
        // Reset absolute session timer on auto-unlock
        sessionStorage.setItem('dr_session_start', String(Date.now()))
        onUnlocked()
      } catch {
        setAutoUnlocking(false)
      }
    }
    tryAutoUnlock()
  }, [user?.id, profile?.encryption_salt])

  async function handleSubmit(e) {
    e.preventDefault()
    if (pin.length < 6) { toast.error('Enter your vault PIN'); return }
    if (attempts >= MAX_ATTEMPTS) {
      toast.error('Too many incorrect attempts - please sign out and sign back in')
      return
    }

    setLoading(true)
    try {
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault configuration error - please contact support')

      // Derive the key from the entered PIN
      const key = await deriveKey(pin, user.id, salt)

      // Verify the key is correct by attempting to decrypt a test value
      // We store a small encrypted test string in the profile for this purpose
      if (profile?.key_verification) {
        const prevKey = getSessionKey()
        setSessionKey(key)
        try {
          const result = await decrypt(profile.key_verification)
          if (result !== 'dr_key_ok') {
            setSessionKey(prevKey)
            throw new Error('Incorrect PIN')
          }
        } catch {
          setSessionKey(prevKey)
          throw new Error('Incorrect PIN')
        }
      }

      // Check if this is the duress PIN (separate key verification)
      let isDuress = false
      if (profile?.duress_key_verification && profile?.duress_pin_set) {
        try {
          const dKey = await deriveKey(unenrollCode || pin, user.id + '_duress', profile.encryption_salt)
          const prevKey = getSessionKey()
          setSessionKey(dKey)
          try {
            const dResult = await decrypt(profile.duress_key_verification)
            isDuress = dResult === 'dr_duress_ok'
          } catch { /* not duress */ }
          if (!isDuress) setSessionKey(prevKey)
        } catch { /* not duress */ }
      }

      if (isDuress) {
        // Silently alert owner and admin, then show decoy vault
        supabase.functions.invoke('duress-alert').catch(() => {})
        // E-1 fix: set the DURESS key (not real key) so decoy entries decrypt correctly
        // The duress key only decrypts decoy_entries, not real vault_entries
        const dKeyForSession = await deriveKey(pin, user.id + '_duress', profile.encryption_salt)
        setSessionKey(dKeyForSession)
        sessionStorage.setItem('dr_duress_active', '1')
        toast.success('Vault unlocked')
        onUnlocked()
        return
      }

      setSessionKey(key)
      if (trustDevice) {
        await saveTrustedPin(pin, user.id, user.email)
      } else {
        // Silently upgrade an existing legacy trusted device to PRF (Touch ID /
        // Windows Hello). Fire-and-forget so unlock isn't blocked by the
        // biometric prompt; the migration internally defers 24h on cancel.
        migrateTrustedDevice(pin, user.id, user.email).catch(() => {})
      }
      toast.success('Vault unlocked')
      onUnlocked()
    } catch (err) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      if (newAttempts >= MAX_ATTEMPTS) {
        toast.error('Too many incorrect attempts - sign out and try again')
      } else {
        toast.error(`Incorrect PIN · ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining`)
      }
    } finally {
      setLoading(false)
    }
  }

  const isOAuth = user?.app_metadata?.provider === 'google' ||
                  user?.app_metadata?.provider === 'apple'
  const provider = user?.app_metadata?.provider

  if (showRecovery) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 16, padding: '40px 36px', width: 380, maxWidth: '92vw',
        }}>
          <RedeemRecoveryCode
            onUnlocked={onUnlocked}
            onCancel={() => setShowRecovery(false)}
          />
        </div>
      </div>
    )
  }

  if (autoUnlocking) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <div style={{ color: 'var(--text-sub)', fontSize: 14 }}>Unlocking vault...</div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: 16, padding: '40px 36px', width: 380, maxWidth: '92vw',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 8 }}>
          Enter your vault PIN
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 28, lineHeight: 1.6 }}>
          {isOAuth
            ? `You're signed in with ${provider === 'google' ? 'Google' : 'Apple'}. Enter your vault PIN to decrypt your data.`
            : 'Enter your vault PIN to unlock your encrypted data.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="••••••"
            value={pin}
            onChange={e => setPin(formatPin(e.target.value))}
            maxLength={12}
            autoFocus
            disabled={attempts >= MAX_ATTEMPTS}
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.4em', padding: '18px' }}
          />

          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <div style={{ fontSize: 12, color: 'var(--danger)' }}>
              {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 8, justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={e => setTrustDevice(e.target.checked)}
              style={{ accentColor: 'var(--gold)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-sub)' }}>Trust this device</span>
          </label>

          <button className="btn-primary" type="submit"
            disabled={loading || pin.length < 6 || attempts >= MAX_ATTEMPTS}
            style={{ padding: 14, fontSize: 15 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Unlock vault'}
          </button>
        </form>

        <button onClick={onSignOut} style={{
          background: 'transparent', border: 'none', color: 'var(--text-sub)',
          fontSize: 12, cursor: 'pointer', marginTop: 20, textDecoration: 'underline',
        }}>
          Sign out instead
        </button>

        <p style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 16, lineHeight: 1.5 }}>
          Forgot your PIN? Unfortunately we cannot recover it - your data is encrypted with it. You would need to reset your vault.
        </p>
      </div>
    </div>
  )
}
