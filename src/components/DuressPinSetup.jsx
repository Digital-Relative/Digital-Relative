import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { deriveKey, setSessionKey, encrypt } from '../lib/crypto'
import { validatePin, formatPin } from '../lib/vaultPin'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Default convincing decoy entries
const DECOY_TEMPLATES = [
  { category: 'banking',   title: 'Barclays Current Account',   username: 'dan.taylor@gmail.com', password: '********', notes: '' },
  { category: 'banking',   title: 'Savings Account ISA',        username: '20-14-88 / 74821930',  password: '',          notes: 'Fixed rate ISA - matures Jan 2026' },
  { category: 'email',     title: 'Gmail',                      username: 'dan.taylor@gmail.com', password: '********', notes: '' },
  { category: 'utilities', title: 'British Gas',                username: 'dan.taylor@gmail.com', password: '********', notes: 'Account ref: BG-48821' },
]

export default function DuressPinSetup({ onComplete, onCancel }) {
  const { user, profile, updateProfile } = useAuth()
  const [pin, setPin]         = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep]       = useState(1) // 1=set pin, 2=review decoy entries

  async function handleSetPin(e) {
    e.preventDefault()
    const err = validatePin(pin)
    if (err) { toast.error(err); return }
    if (pin !== confirm) { toast.error('PINs do not match'); return }
    // Make sure duress PIN differs from real PIN
    if (pin === sessionStorage.getItem('_check_real_pin')) {
      toast.error('Duress PIN must be different from your real PIN')
      return
    }
    setStep(2)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!user?.id || !profile?.encryption_salt) return
    setLoading(true)
    try {
      const salt    = profile.encryption_salt
      const dKey    = await deriveKey(pin, user.id + '_duress', salt)

      // Store key temporarily to encrypt decoy entries
      setSessionKey(dKey)

      // Encrypt and save decoy entries
      const decoyRows = await Promise.all(DECOY_TEMPLATES.map(async t => ({
        user_id:  user.id,
        category: t.category,
        title:    t.title,
        username: t.username ? await encrypt(t.username) : null,
        password: t.password ? await encrypt(t.password) : null,
        notes:    t.notes    ? await encrypt(t.notes)    : null,
      })))

      // Delete any existing decoy entries first
      await supabase.from('decoy_entries').delete().eq('user_id', user.id)
      await supabase.from('decoy_entries').insert(decoyRows)

      // Encrypt a test value with the duress key for verification
      const verification = await encrypt('dr_duress_ok')

      // Restore real session key (not duress key)
      const { clearSessionKey } = await import('../lib/crypto')
      clearSessionKey()

      await updateProfile({ duress_pin_set: true, duress_key_verification: verification })
      toast.success('Duress PIN set')
      onComplete()
    } catch (err) {
      toast.error('Could not save duress PIN')
    } finally {
      setLoading(false)
    }
  }

  if (step === 2) {
    return (
      <div>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Review your decoy vault</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 16, lineHeight: 1.7 }}>
          When your duress PIN is entered, the person will see these entries. They look convincing but contain no real data.
          You can edit them in your vault after setup.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {DECOY_TEMPLATES.map((t, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 2 }}>{t.category}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>Back</button>
          <button className="btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 2 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Set duress PIN'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Set a duress PIN</h3>
      <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 16, lineHeight: 1.7 }}>
        If you are ever forced to reveal your PIN, give this one instead. The person will see a convincing but fake vault.
        You will receive a silent alert and so will our security team.
      </p>
      <form onSubmit={handleSetPin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="label">Duress PIN</label>
          <input className="input" type="password" inputMode="numeric" placeholder="Min 6 digits"
            value={pin} onChange={e => setPin(formatPin(e.target.value))} maxLength={12}
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em' }} autoFocus />
        </div>
        <div>
          <label className="label">Confirm duress PIN</label>
          <input className="input" type="password" inputMode="numeric" placeholder="Repeat PIN"
            value={confirm} onChange={e => setConfirm(formatPin(e.target.value))} maxLength={12}
            style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={pin.length < 6 || confirm.length < 6} style={{ flex: 2 }}>
            Next
          </button>
        </div>
      </form>
    </div>
  )
}
