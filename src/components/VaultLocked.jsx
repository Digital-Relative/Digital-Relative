import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { deriveKey, setSessionKey, getSessionKey, decrypt } from '../lib/crypto'
import { formatPin } from '../lib/vaultPin'
import toast from 'react-hot-toast'

// Shown when the vault is locked due to inactivity
// Always uses vault PIN — works for email, Google, and Apple users
export default function VaultLocked() {
  const { user, profile, signOut } = useAuth()
  const [pin, setPin]         = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const MAX_ATTEMPTS = 5

  const isOAuth = user?.app_metadata?.provider === 'google' ||
                  user?.app_metadata?.provider === 'apple'
  const provider = user?.app_metadata?.provider

  async function handleUnlock(e) {
    e.preventDefault()
    if (pin.length < 6) { toast.error('Enter your vault PIN'); return }
    if (attempts >= MAX_ATTEMPTS) return

    setLoading(true)
    try {
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault configuration error')

      const key = await deriveKey(pin, user.id, salt)

      // Verify PIN is correct before unlocking
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

      setSessionKey(key)
      toast.success('Vault unlocked')
      setPin('')
    } catch (err) {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      if (newAttempts >= MAX_ATTEMPTS) {
        toast.error('Too many incorrect attempts - please sign out')
      } else {
        toast.error(`Incorrect PIN · ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(5,12,20,0.97)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: 16, padding: '40px 36px', width: 380, maxWidth: '92vw',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 8 }}>
          Vault locked
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.6 }}>
          {isOAuth
            ? `Your vault was locked after inactivity. Enter your vault PIN to continue - this is separate from your ${provider === 'google' ? 'Google' : 'Apple'} account.`
            : 'Your vault was locked after 30 minutes of inactivity. Enter your vault PIN to continue.'}
        </div>

        <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.4em', padding: '16px' }}
          />

          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <div style={{ fontSize: 12, color: 'var(--danger)' }}>
              {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
            </div>
          )}

          <button className="btn-primary" type="submit"
            disabled={loading || pin.length < 6 || attempts >= MAX_ATTEMPTS}
            style={{ padding: 12 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Unlock vault'}
          </button>

          <button type="button" onClick={signOut} style={{
            background: 'transparent', border: 'none', color: 'var(--text-sub)',
            fontSize: 12, cursor: 'pointer', marginTop: 4, fontFamily: 'var(--sans)',
          }}>
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  )
}
