import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function b64ToBuf(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - padded.length % 4) % 4)
  return Uint8Array.from(atob(padded + padding), c => c.charCodeAt(0))
}

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function callWebAuthn(action, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body:    JSON.stringify({ action, ...extra }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'WebAuthn request failed')
  }
  return res.json()
}

export function WebAuthnSetup({ onDone, onCancel }) {
  const { user, profile } = useAuth()
  const [deviceName, setDeviceName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [credentials, setCredentials] = useState(null)

  useEffect(() => {
    supabase.from('webauthn_credentials')
      .select('id, device_name, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCredentials(data || []))
  }, [user.id])

  async function handleRegister() {
    if (!window.PublicKeyCredential) {
      toast.error('This browser does not support security keys')
      return
    }
    if (!deviceName.trim()) { toast.error('Give this key a name'); return }
    setLoading(true)
    try {
      // HIGH-1 fix: challenge generated server-side
      const { challenge, rpId } = await callWebAuthn('registration_challenge')

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: b64ToBuf(challenge),
          rp:        { name: 'Digital Relative', id: rpId },
          user: {
            id:          new TextEncoder().encode(user.id),
            name:        user.email || user.id,
            displayName: profile?.full_name || user.email || 'Vault owner',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7   },  // ES256
            { type: 'public-key', alg: -257 },  // RS256
          ],
          authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
          attestation: 'none',
          timeout: 60000,
        },
      })

      if (!cred) throw new Error('Registration cancelled')

      const credId   = bufToB64(cred.rawId)
      const pubKeyB64 = bufToB64(cred.response.getPublicKey())

      // HIGH-1 fix: server verifies challenge
      await callWebAuthn('registration_verify', {
        challenge,
        credential_id: credId,
        public_key:    pubKeyB64,
        device_name:   deviceName.trim().slice(0, 50),
      })

      toast.success('Security key registered')
      setCredentials(prev => [...(prev || []), { id: credId, device_name: deviceName, created_at: new Date().toISOString() }])
      setDeviceName('')
      onDone?.()
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        toast.error('Registration cancelled')
      } else {
        toast.error(err.message || 'Registration failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(credId) {
    if (!confirm('Remove this security key?')) return
    await supabase.from('webauthn_credentials').delete().eq('id', credId).eq('user_id', user.id)
    setCredentials(prev => (prev || []).filter(c => c.id !== credId))
    toast.success('Security key removed')
  }

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
        Security keys and passkeys
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 18 }}>
        Use a hardware security key (YubiKey), Windows Hello, Touch ID, or Face ID as a second factor.
      </p>

      {credentials && credentials.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {credentials.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--cream)' }}>🔑 {c.device_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>
                  Added {new Date(c.created_at).toLocaleDateString('en-GB')}
                  {c.last_used_at && ` - last used ${new Date(c.last_used_at).toLocaleDateString('en-GB')}`}
                </div>
              </div>
              <button onClick={() => handleRemove(c.id)} className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--danger)', borderColor: 'rgba(224,82,82,0.3)' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {window.PublicKeyCredential ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="input" placeholder="Name this key (e.g. YubiKey 5, MacBook Touch ID)"
            value={deviceName} onChange={e => setDeviceName(e.target.value)} maxLength={50} />
          <div style={{ display: 'flex', gap: 10 }}>
            {onCancel && <button className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>}
            <button className="btn-primary" onClick={handleRegister} disabled={loading || !deviceName.trim()} style={{ flex: 2 }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Register security key'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-sub)', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
          Your browser does not support security keys. Try Chrome, Edge, or Safari.
        </div>
      )}
    </div>
  )
}

export async function verifyWebAuthn(userId) {
  // Returns true if assertion succeeds
  const { data: { session } } = await supabase.auth.getSession()

  const { challenge, allowCredentials } = await callWebAuthn('assertion_challenge')
  if (!allowCredentials?.length) return false

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge:        b64ToBuf(challenge),
      timeout:          60000,
      userVerification: 'required',
      allowCredentials: allowCredentials.map(c => ({
        type: 'public-key',
        id:   b64ToBuf(c.id),
      })),
    },
  })

  if (!assertion) return false

  // Read sign_count from authenticator data (bytes 33-36, big-endian uint32)
  const authData  = new Uint8Array(assertion.response.getAuthenticatorData())
  const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36]

  // HIGH-1+2 fix: server verifies challenge and validates sign_count
  await callWebAuthn('assertion_verify', {
    challenge,
    credential_id:       bufToB64(assertion.rawId),
    authenticator_data:  bufToB64(assertion.response.getAuthenticatorData()),
    sign_count:          signCount,
  })

  return true
}
