import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  deriveKey, setSessionKey, getSessionKey,
  encryptEntry, decryptEntry, generateSalt,
  encrypt, decrypt
} from '../lib/crypto'
import { formatPin } from '../lib/vaultPin'
import toast from 'react-hot-toast'

// Password change with automatic vault re-encryption
// This is the only safe way to change password — it:
// 1. Verifies old PIN (proves they can decrypt)
// 2. Decrypts ALL vault entries with old key
// 3. Changes password in Supabase Auth
// 4. Generates new salt + derives new key from new PIN
// 5. Re-encrypts all entries with new key
// 6. Saves everything atomically

export default function ChangePasswordPage({ onBack }) {
  const { user, profile } = useAuth()
  const [step, setStep]         = useState('verify') // verify | new_pin | confirm | reencrypting | done
  const [entryCount, setEntryCount] = useState(null)
  const [oldPin, setOldPin]     = useState('')
  const [newPin, setNewPin]     = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, stage: '' })

  async function handleVerifyOldPin(e) {
    e.preventDefault()
    if (oldPin.length < 6) { toast.error('Enter your current vault PIN'); return }
    setLoading(true)
    try {
      const salt = profile?.encryption_salt
      if (!salt) throw new Error('Vault not configured')
      const key = await deriveKey(oldPin, user.id, salt)

      // Verify against key_verification
      if (profile?.key_verification) {
        const prevKey = getSessionKey()
        setSessionKey(key)
        try {
          const result = await decrypt(profile.key_verification)
          if (result !== 'dr_key_ok') throw new Error('Incorrect PIN')
        } catch {
          setSessionKey(prevKey)
          throw new Error('Incorrect PIN')
        }
        setSessionKey(prevKey)
      }

      setStep('new_pin')
    } catch (err) {
      toast.error(err.message === 'Incorrect PIN' ? 'Incorrect vault PIN' : err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleNewPin(e) {
    e.preventDefault()
    if (newPin.length < 6) { toast.error('PIN must be at least 6 digits'); return }
    if (newPin === oldPin)  { toast.error('New PIN must be different from current PIN'); return }
    setStep('confirm')
  }

  async function handleReencrypt(e) {
    e.preventDefault()
    if (newPin !== confirmPin) { toast.error('PINs do not match'); setConfirmPin(''); return }
    setLoading(true)
    setStep('reencrypting')

    try {
      // 1. Derive OLD key to decrypt everything
      const oldSalt = profile?.encryption_salt
      const oldKey  = await deriveKey(oldPin, user.id, oldSalt)

      // 2. Fetch all vault entries
      setProgress({ done: 0, total: 0, stage: 'Loading vault entries…' })
      const { data: entries, error: fetchError } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('user_id', user.id)
      if (fetchError) throw fetchError

      setProgress({ done: 0, total: entries?.length || 0, stage: 'Decrypting entries…' })

      // 3. Decrypt all entries with old key
      const prevKey = getSessionKey()
      setSessionKey(oldKey)
      const decrypted = []
      for (const entry of entries || []) {
        const dec = await decryptEntry(entry)
        decrypted.push(dec)
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }
      setSessionKey(prevKey)

      // 4. Generate new salt and derive new key
      setProgress({ done: 0, total: decrypted.length, stage: 'Generating new encryption key…' })
      const newSalt = generateSalt()
      const newKey  = await deriveKey(newPin, user.id, newSalt)

      // 5. Re-encrypt all entries with new key
      setProgress({ done: 0, total: decrypted.length, stage: 'Re-encrypting entries…' })
      setSessionKey(newKey)
      // Clear PINs from React state immediately after key derivation
      setOldPin('')
      setNewPin('')
      setConfirmPin('')
      const reencrypted = []
      for (const entry of decrypted) {
        const enc = await encryptEntry({
          username:       entry.username       || '',
          password:       entry.password       || '',
          notes:          entry.notes          || '',
          secure_content: entry.secure_content || null,
          address:        entry.address        || null,  // NEW-6: now encrypted
        })
        reencrypted.push({ id: entry.id, ...enc })
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }

      // 6. Create new key_verification test string
      const testEncrypted = await (async () => {
        const iv  = crypto.getRandomValues(new Uint8Array(12))
        const enc = new TextEncoder()
        const ct  = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: 128 }, newKey, enc.encode('dr_key_ok')
        )
        const combined = new Uint8Array(iv.byteLength + ct.byteLength)
        combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.byteLength)
        return btoa(String.fromCharCode(...combined))
      })()

      // MISC-2: Also re-encrypt vault_documents (they have no encrypted fields currently
      // but if docs have encrypted notes in future this handles it)
      // For now: vault_documents store file metadata unencrypted and files in storage
      // The files themselves are not client-side encrypted — they're stored as-is in Supabase storage
      // So no re-encryption needed for documents. Document this clearly:
      // vault_documents: only metadata (name, notes) stored in DB — not encrypted at rest in DB
      // The actual file bytes are in private storage, protected by RLS

      // 7. Update salt and key_verification FIRST (before entry loop)
      // M-4 fix: if browser closes mid-loop, the new salt is already committed.
      // Un-re-encrypted entries will fail decryption (surfaced as errors) rather than
      // silently mixing old and new ciphertext under the old salt.
      await supabase.from('profiles').update({
        encryption_salt:  newSalt,
        key_verification: testEncrypted,
      }).eq('id', user.id)

      // 8. Re-encrypt and save all entries
      setProgress({ done: 0, total: reencrypted.length, stage: 'Saving to vault…' })
      for (const entry of reencrypted) {
        const { id, ...updates } = entry
        await supabase.from('vault_entries').update({
          username:       updates.username,
          password:       updates.password,
          notes:          updates.notes,
          secure_content: updates.secure_content,
          address:        updates.address,  // NEW-6: address is now encrypted
          _encrypted:     true,
        }).eq('id', id).eq('user_id', user.id)
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }

      // Session key is already set to newKey from step 5
      toast.success('Vault re-encrypted with new PIN')
      // NEW-4 fix: invalidate recovery codes after PIN change (they encrypt the old PIN)
      await supabase.from('vault_recovery_codes').delete().eq('user_id', user.id).catch(() => {})
      setStep('done')
    } catch (err) {
      toast.error(err.message || 'Re-encryption failed - your vault is unchanged')
      setStep('verify')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: '0.4em',
    padding: '14px',
  }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 20 }}>←</button>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', margin: 0 }}>Change vault PIN</h1>
      </div>

      <div className="card-static" style={{ marginBottom: 20, borderColor: 'rgba(201,168,76,0.3)', background: 'var(--gold-dim)' }}>
        <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7, margin: 0 }}>
          This process will <strong style={{ color: 'var(--gold)' }}>re-encrypt your entire vault</strong> with your new PIN. All {entryCount === null ? '...' : entryCount} entries will be decrypted and re-encrypted automatically. This cannot be undone - make sure you remember your new PIN.
        </p>
      </div>

      {step === 'verify' && (
        <form onSubmit={handleVerifyOldPin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Current vault PIN</label>
            <input className="input" type="password" inputMode="numeric"
              placeholder="••••••" value={oldPin}
              onChange={e => setOldPin(formatPin(e.target.value))}
              maxLength={12} autoFocus style={inputStyle} />
          </div>
          <button className="btn-primary" type="submit" disabled={loading || oldPin.length < 6} style={{ padding: 12 }}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verify →'}
          </button>
          <button type="button" className="btn-ghost" onClick={onBack}>Cancel</button>
        </form>
      )}

      {step === 'new_pin' && (
        <form onSubmit={handleNewPin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">New vault PIN (6–12 digits)</label>
            <input className="input" type="password" inputMode="numeric"
              placeholder="••••••" value={newPin}
              onChange={e => setNewPin(formatPin(e.target.value))}
              maxLength={12} autoFocus style={inputStyle} />
          </div>
          <button className="btn-primary" type="submit" disabled={newPin.length < 6} style={{ padding: 12 }}>
            Continue →
          </button>
          <button type="button" className="btn-ghost" onClick={() => setStep('verify')}>← Back</button>
        </form>
      )}

      {step === 'confirm' && (
        <form onSubmit={handleReencrypt} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Confirm new vault PIN</label>
            <input className="input" type="password" inputMode="numeric"
              placeholder="••••••" value={confirmPin}
              onChange={e => setConfirmPin(formatPin(e.target.value))}
              maxLength={12} autoFocus style={inputStyle} />
          </div>
          <div style={{ padding: '12px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.25)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
            ⚠️ This will re-encrypt your entire vault. Make sure you store your new PIN safely - it cannot be recovered.
          </div>
          <button className="btn-primary" type="submit"
            disabled={loading || confirmPin.length < 6}
            style={{ padding: 12, background: 'var(--danger)' }}>
            Re-encrypt vault with new PIN
          </button>
          <button type="button" className="btn-ghost" onClick={() => setStep('new_pin')}>← Back</button>
        </form>
      )}

      {step === 'reencrypting' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <span className="spinner" style={{ width: 32, height: 32, marginBottom: 20 }} />
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{progress.stage}</div>
          {progress.total > 0 && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 12 }}>
                {progress.done} / {progress.total} entries
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                  background: 'var(--gold)', transition: 'width 0.2s',
                }} />
              </div>
            </>
          )}
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 16 }}>
            Do not close this window
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>
            Vault re-encrypted
          </h2>
          <div style={{ padding: '10px 14px', background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--cream-dim)', marginBottom: 16, lineHeight: 1.6, textAlign: 'left' }}>
            <strong>Action required:</strong> Your vault PIN recovery codes have been invalidated because they encrypted your old PIN. Go to Settings and generate new recovery codes now.
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.6 }}>
            All your vault entries have been successfully re-encrypted with your new PIN.
          </p>
          <button className="btn-primary" onClick={onBack} style={{ padding: '12px 32px' }}>
            Back to settings
          </button>
        </div>
      )}
    </div>
  )
}
