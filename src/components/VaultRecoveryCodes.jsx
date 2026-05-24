import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { deriveKey, setSessionKey, decrypt, generateVaultRecoveryCodes, redeemVaultRecoveryCode } from '../lib/crypto'
import { formatPin } from '../lib/vaultPin'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Generate recovery codes (shown in Settings after PIN entry) ──────────────
export function GenerateRecoveryCodes({ onDone, onCancel }) {
  const { user, profile } = useAuth()
  const [pin, setPin]       = useState('')
  const [loading, setLoading] = useState(false)
  const [codes, setCodes]   = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  async function handleGenerate(e) {
    e.preventDefault()
    if (pin.length < 6) { toast.error('Enter your vault PIN'); return }
    setLoading(true)
    try {
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault not configured')

      // Verify PIN first
      const key = await deriveKey(pin, user.id, salt)
      setSessionKey(key)
      try {
        const result = await decrypt(profile.key_verification)
        if (result !== 'dr_key_ok') throw new Error('Incorrect PIN')
      } catch {
        throw new Error('Incorrect PIN')
      }

      // Generate 8 recovery codes
      const generated = await generateVaultRecoveryCodes(pin, user.id)

      // Save encrypted codes to DB (replace any existing codes)
      await supabase.from('vault_recovery_codes').delete().eq('user_id', user.id)
      await supabase.from('vault_recovery_codes').insert(
        generated.map(c => ({
          user_id:       user.id,
          code_index:    c.code_index,
          encrypted_pin: c.encrypted_pin,
        }))
      )

      setCodes(generated.map(c => c.plain))
      toast.success('Recovery codes generated')
    } catch (err) {
      toast.error(err.message || 'Could not generate codes')
    } finally {
      setLoading(false)
    }
  }

  if (codes) {
    return (
      <div>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
          Your recovery codes
        </h3>
        <div style={{ padding: '12px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, marginBottom: 16 }}>
          <strong>Save these now.</strong> Each code can only be used once. Store them somewhere safe - a printed copy in a physical safe, or a trusted password manager. We cannot show them again.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          {codes.map((code, i) => (
            <div key={i} style={{
              padding: '10px 14px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontFamily: 'monospace', fontSize: 14, color: 'var(--cream)',
              letterSpacing: '0.1em', textAlign: 'center',
            }}>
              {code}
            </div>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
            style={{ accentColor: 'var(--gold)', width: 16, height: 16 }} />
          <span style={{ fontSize: 13, color: 'var(--text-sub)' }}>I have saved my recovery codes</span>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" disabled={!confirmed} onClick={onDone} style={{ flex: 1 }}>
            Done
          </button>
          <button className="btn-ghost" onClick={() => {
            const text = codes.join('\n')
            navigator.clipboard.writeText(text).then(() => toast.success('Codes copied'))
          }} style={{ flex: 1, fontSize: 12 }}>
            Copy all
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
        Generate recovery codes
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 16 }}>
        Recovery codes let you unlock your vault if you forget your PIN. Each code can only be used once.
        Generating new codes invalidates any previous ones.
      </p>
      <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="label">Confirm your vault PIN</label>
          <input className="input" type="password" inputMode="numeric"
            placeholder="Vault PIN"
            value={pin} onChange={e => setPin(formatPin(e.target.value))}
            maxLength={12} autoFocus
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.4em' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={loading || pin.length < 6} style={{ flex: 2 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Generate 8 codes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Redeem a recovery code in the VaultPinEntry screen ─────────────────────
export function RedeemRecoveryCode({ onUnlocked, onCancel }) {
  const { user, profile } = useAuth()
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRedeem(e) {
    e.preventDefault()
    const clean = code.replace(/\s/g, '').toUpperCase()
    if (clean.replace(/-/g, '').length < 12) {
      toast.error('Enter a valid recovery code')
      return
    }
    setLoading(true)
    try {
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault not configured')

      // Find an unused code that matches this index
      const { data: storedCodes } = await supabase
        .from('vault_recovery_codes')
        .select('id, code_index, encrypted_pin, used_at, fetch_count')
        .eq('user_id', user.id)
        .is('used_at', null)

      // M-4: increment fetch_count to detect exfiltration (alert after 3+ bulk reads)
      if (storedCodes?.length) {
        const ids = storedCodes.map(c => c.id)
        const maxFetch = Math.max(...storedCodes.map(c => c.fetch_count || 0))
        await supabase.from('vault_recovery_codes')
          .update({ fetch_count: maxFetch + 1 })
          .in('id', ids)
          .catch(() => {})
        // Warn user if blobs have been read multiple times (potential exfiltration)
        if (maxFetch >= 3) {
          toast.error('Warning: your recovery codes have been read multiple times. Consider regenerating them in Settings.')
        }
      }

      if (!storedCodes?.length) throw new Error('No recovery codes found')

      // Try each unused code until one decrypts correctly
      let recoveredPin = null
      let matchedId    = null
      for (const stored of storedCodes) {
        try {
          recoveredPin = await redeemVaultRecoveryCode(clean, user.id, stored.encrypted_pin)
          matchedId    = stored.id
          break
        } catch {
          // Wrong code, try next
        }
      }

      if (!recoveredPin || !matchedId) throw new Error('Invalid recovery code')

      // Derive the vault key from the recovered PIN
      const key = await deriveKey(recoveredPin, user.id, salt)
      setSessionKey(key)

      // L-3 fix: key_verification is mandatory - do not mark code used without confirmed match
      const verifier = profile?.key_verification
      if (!verifier) throw new Error('Vault not fully set up. Please sign in normally and visit Settings.')
      const verifyResult = await decrypt(verifier).catch(() => null)
      if (verifyResult !== 'dr_key_ok') throw new Error('Recovery code did not match this vault')

      // Only mark as used after confirmed vault access
      await supabase.from('vault_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', matchedId)

      toast.success('Vault unlocked with recovery code')
      onUnlocked()
    } catch (err) {
      toast.error(err.message || 'Invalid recovery code')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 8 }}>
        Use a recovery code
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14, lineHeight: 1.6 }}>
        Enter one of your 8 one-time recovery codes. Each code can only be used once.
      </p>
      <form onSubmit={handleRedeem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" type="text" placeholder="XXXX-XXXX-XXXX"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={14} autoFocus
          style={{ textAlign: 'center', fontSize: 18, letterSpacing: '0.15em', fontFamily: 'monospace' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
            Back to PIN
          </button>
          <button type="submit" className="btn-primary"
            disabled={loading || code.replace(/-/g, '').length < 12} style={{ flex: 2 }}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Unlock with code'}
          </button>
        </div>
      </form>
    </div>
  )
}
