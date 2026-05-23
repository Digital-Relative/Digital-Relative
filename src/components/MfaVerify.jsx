import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Shown after PIN entry when MFA is enrolled
// Handles both TOTP (app) and email OTP verification
export default function MfaVerify({ onVerified, onSignOut }) {
  const { user, profile } = useAuth()
  const [code, setCode]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [useEmail, setUseEmail] = useState(false) // toggle between app and email
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending]     = useState(false)
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')

  const usesEmailMfa = profile?.mfa_email_fallback === true

  async function verifyApp() {
    if (code.length !== 6) { toast.error('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      // Get TOTP factors
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpFactor = factors?.totp?.find(f => f.status === 'verified')
      if (!totpFactor) throw new Error('No authenticator app found')

      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id })
      const { error } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id, challengeId: challenge.id, code,
      })
      if (error) throw error
      onVerified()
    } catch (err) {
      toast.error('Incorrect code - check your app')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function verifyRecovery() {
    if (!recoveryCode.trim()) { toast.error('Enter your recovery code'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'verify_recovery_code', userId: user.id, code: recoveryCode.trim() },
      })
      if (error || data?.error) throw new Error(data?.error || 'Invalid recovery code')
      // Pass flag to indicate recovery was used — App.jsx will prompt re-enroll
      onVerified({ usedRecovery: true })
    } catch (err) {
      toast.error(err.message || 'Invalid recovery code')
      setRecoveryCode('')
    } finally {
      setLoading(false)
    }
  }

  async function sendEmailCode() {
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'send_code', userId: user.id },
      })
      if (error) throw error
      setCodeSent(true)
      toast.success('Code sent to your email')
    } catch (err) {
      toast.error('Could not send code - please try again')
    } finally {
      setSending(false)
    }
  }

  async function verifyEmail() {
    if (code.length !== 6) { toast.error('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'verify_code', userId: user.id, code },
      })
      if (error || data?.error) throw new Error(data?.error || 'Verification failed')
      onVerified()
    } catch (err) {
      toast.error(err.message || 'Incorrect code')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const showingEmail = useEmail || usesEmailMfa

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: 16, padding: '40px 36px', width: 400, maxWidth: '92vw',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>{showingEmail ? '✉️' : '📱'}</div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 8 }}>
          Verify your identity
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.6 }}>
          {showingEmail
            ? codeSent
              ? <>Enter the code sent to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong></>
              : 'We\'ll send a 6-digit code to your email'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>

        {/* Email: send button first */}
        {showingEmail && !codeSent && (
          <button className="btn-primary" onClick={sendEmailCode} disabled={sending} style={{ width: '100%', padding: 14, marginBottom: 12 }}>
            {sending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Send code to my email'}
          </button>
        )}

        {/* Code input */}
        {(!showingEmail || codeSent) && (
          <>
            <input className="input" type="text" inputMode="numeric" placeholder="000000"
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.4em', padding: '18px', marginBottom: 12 }}
              autoFocus maxLength={6} />
            <button className="btn-primary" onClick={showingEmail ? verifyEmail : verifyApp}
              disabled={loading || code.length !== 6} style={{ width: '100%', padding: 14, marginBottom: 12 }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify'}
            </button>
            {showingEmail && (
              <button type="button" className="btn-ghost" onClick={sendEmailCode} disabled={sending} style={{ width: '100%', marginBottom: 8 }}>
                Resend code
              </button>
            )}
          </>
        )}

        {/* Toggle between methods */}
        {!usesEmailMfa && (
          <button type="button" onClick={() => { setUseEmail(!useEmail); setCode(''); setCodeSent(false) }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: 12, cursor: 'pointer', marginTop: 4, fontFamily: 'var(--sans)', textDecoration: 'underline' }}>
            {showingEmail ? 'Use authenticator app instead' : 'Use email code instead'}
          </button>
        )}

        {!useRecovery ? (
          <button type="button" onClick={() => { setUseRecovery(true); setCode('') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: 12, cursor: 'pointer', marginTop: 8, fontFamily: 'var(--sans)', textDecoration: 'underline' }}>
            Use a recovery code instead
          </button>
        ) : (
          <div style={{ marginTop: 16, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 10 }}>Enter one of your recovery codes:</div>
            <input className="input" type="text" placeholder="XXXXX-XXXXX"
              value={recoveryCode} onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
              style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 16, letterSpacing: '0.1em', marginBottom: 10 }}
              autoFocus />
            <button className="btn-primary" onClick={verifyRecovery} disabled={loading || !recoveryCode.trim()}
              style={{ width: '100%', padding: 12, marginBottom: 8 }}>
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Use recovery code'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setUseRecovery(false); setRecoveryCode('') }}
              style={{ width: '100%' }}>
              ← Back
            </button>
          </div>
        )}

        <br />
        <button type="button" onClick={onSignOut}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', fontSize: 12, cursor: 'pointer', marginTop: 12, fontFamily: 'var(--sans)' }}>
          Sign out instead
        </button>
      </div>
    </div>
  )
}
