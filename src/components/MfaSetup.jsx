import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Shown when user hasn't set up MFA yet — forced after PIN entry
// Primary: authenticator app (TOTP)
// Fallback: email OTP (if no app available)
export default function MfaSetup({ onComplete, onSignOut }) {
  const { user } = useAuth()
  const [method, setMethod]       = useState(null) // 'app' | 'email'
  const [step, setStep]           = useState('choose') // 'choose' | 'app_setup' | 'email_verify'
  const [qrCode, setQrCode]       = useState(null)
  const [secret, setSecret]       = useState(null)
  const [factorId, setFactorId]   = useState(null)
  const [code, setCode]           = useState('')
  const [loading, setLoading]     = useState(false)
  const [codeSent, setCodeSent]   = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState(null) // shown once after setup
  const [showManual, setShowManual]       = useState(false) // toggle QR vs manual key entry

  const isOAuth = user?.app_metadata?.provider === 'google' ||
                  user?.app_metadata?.provider === 'apple'

  async function generateRecoveryCodes() {
    try {
      const { data } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'generate_recovery_codes', userId: user.id },
      })
      if (data?.codes) setRecoveryCodes(data.codes)
    } catch (err) {
      console.error('Could not generate recovery codes')
    }
  }

  async function startAppSetup() {
    // If we already have a QR code in state (user switched away and came back)
    // don't re-enroll — just show the existing QR code
    if (qrCode && factorId && step === 'app_setup') return

    setLoading(true)
    try {
      // Clean up any existing unverified TOTP factors first
      // These accumulate if setup was started but not completed
      const { data: existing } = await supabase.auth.mfa.listFactors()
      const unverified = existing?.totp?.filter(f => f.status === 'unverified') || []
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Digital Relative',
      })
      if (error) throw error
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setMethod('app')
      setStep('app_setup')
    } catch (err) {
      toast.error('Could not start app setup — try email instead')
    } finally {
      setLoading(false)
    }
  }

  async function verifyApp() {
    if (code.length !== 6) { toast.error('Enter the 6-digit code'); return }
    setLoading(true)
    try {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
      const { error } = await supabase.auth.mfa.verify({
        factorId, challengeId: challenge.id, code,
      })
      if (error) throw error
      // Mark enrolled in profile
      await supabase.from('profiles').update({ mfa_enrolled: true, mfa_email_fallback: false }).eq('id', user.id)
      toast.success('Authenticator app set up — save your recovery codes!')
      await generateRecoveryCodes()
    } catch (err) {
      toast.error('Incorrect code — check your app and try again')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function startEmailSetup() {
    setMethod('email')
    setStep('email_verify')
    await sendEmailCode()
  }

  async function sendEmailCode() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'send_code', userId: user.id },
      })
      if (error) throw error
      setCodeSent(true)
      toast.success('Verification code sent to your email')
    } catch (err) {
      toast.error('Could not send code — please try again')
    } finally {
      setLoading(false)
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
      toast.success('Email verification set up — save your recovery codes!')
      await generateRecoveryCodes()
    } catch (err) {
      toast.error(err.message || 'Incorrect code')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.05) 0%, transparent 60%)',
    }}>
      <div style={{ width: 460, maxWidth: '92vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--cream)', marginBottom: 8 }}>
            Secure your account
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            Digital Relative stores your most sensitive data. Two-factor authentication is required to protect your vault.
          </p>
        </div>

        <div className="card-static" style={{ padding: 32 }}>

          {/* CHOOSE METHOD */}
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 4 }}>
                Choose how you want to receive verification codes:
              </div>

              {/* Authenticator App — recommended */}
              <label onClick={startAppSetup} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 'var(--r)',
                border: '1px solid var(--gold-border)', background: 'var(--gold-dim)',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gold)', marginBottom: 3 }}>
                    Authenticator app
                    <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--gold)', color: '#0d1b2a', padding: '1px 7px', borderRadius: 99, fontWeight: 600 }}>Recommended</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    Use Google Authenticator, Authy, or 1Password. Works without internet. Most secure option.
                  </div>
                </div>
                {loading ? <span className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} /> : null}
              </label>

              {/* Email — fallback */}
              <label onClick={startEmailSetup} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 'var(--r)',
                border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>✉️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>
                    Email code
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    We'll send a 6-digit code to your email each time you sign in. Requires email access.
                  </div>
                </div>
              </label>

              <button type="button" onClick={onSignOut} style={{
                background: 'transparent', border: 'none', color: 'var(--text-sub)',
                fontSize: 12, cursor: 'pointer', marginTop: 8, fontFamily: 'var(--sans)',
              }}>
                Sign out instead
              </button>
            </div>
          )}

          {/* APP SETUP */}
          {step === 'app_setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Step 1 */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>1</div>
                <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  Open your authenticator app — <strong style={{ color: 'var(--text)' }}>Google Authenticator</strong>, <strong style={{ color: 'var(--text)' }}>Authy</strong>, or <strong style={{ color: 'var(--text)' }}>1Password</strong>.<br />
                  Don't have one? Download Google Authenticator from the App Store or Play Store.
                </div>
              </div>

              {/* Step 2 — QR or manual */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>2</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 12 }}>
                    Choose how to add the account to your app:
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setShowManual(false)} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
                      background: !showManual ? 'var(--gold-dim)' : 'transparent',
                      color: !showManual ? 'var(--gold)' : 'var(--text-sub)',
                      border: !showManual ? '1px solid var(--gold-border)' : '1px solid var(--border)',
                    }}>📷 Scan QR code</button>
                    <button onClick={() => setShowManual(true)} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
                      background: showManual ? 'var(--gold-dim)' : 'transparent',
                      color: showManual ? 'var(--gold)' : 'var(--text-sub)',
                      border: showManual ? '1px solid var(--gold-border)' : '1px solid var(--border)',
                    }}>⌨️ Enter key manually</button>
                  </div>

                  {!showManual ? (
                    <>
                      {qrCode && (
                        <div style={{ textAlign: 'center', padding: '12px', background: 'white', borderRadius: 8, display: 'inline-block' }}>
                          <img src={qrCode} alt="MFA QR Code" style={{ width: 180, height: 180, display: 'block' }} />
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 8, lineHeight: 1.6 }}>
                        In your authenticator app, tap <strong style={{ color: 'var(--text)' }}>+</strong> or <strong style={{ color: 'var(--text)' }}>Add account</strong>, then choose <strong style={{ color: 'var(--text)' }}>Scan QR code</strong>.
                      </div>
                    </>
                  ) : (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 8, lineHeight: 1.6 }}>
                        In your authenticator app, tap <strong style={{ color: 'var(--text)' }}>+</strong> → <strong style={{ color: 'var(--text)' }}>Enter a setup key</strong>. Then type:
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 4 }}>Account name: <strong style={{ color: 'var(--text)' }}>Digital Relative</strong></div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 8 }}>Key:</div>
                      {secret && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{
                            flex: 1, background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 6,
                            fontSize: 15, color: 'var(--gold)', letterSpacing: '0.15em', fontFamily: 'monospace',
                            wordBreak: 'break-all', lineHeight: 1.8,
                          }}>{secret}</code>
                          <button onClick={() => { navigator.clipboard.writeText(secret); toast.success('Key copied') }} style={{
                            background: 'transparent', border: '1px solid var(--border-md)', borderRadius: 6,
                            color: 'var(--text-sub)', cursor: 'pointer', padding: '8px 10px', fontSize: 12, fontFamily: 'var(--sans)',
                            flexShrink: 0,
                          }}>Copy</button>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 8 }}>
                        Key type: <strong style={{ color: 'var(--text)' }}>Time based (TOTP)</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>3</div>
                <div style={{ flex: 1 }}>
                  <label className="label" style={{ marginBottom: 8, display: 'block' }}>Enter the 6-digit code shown in your app</label>
                  <input className="input" type="text" inputMode="numeric" placeholder="000000"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', padding: 16 }}
                    maxLength={6} />
                </div>
              </div>

              <button className="btn-primary" onClick={verifyApp} disabled={loading || code.length !== 6} style={{ padding: 14 }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Confirm and activate'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setStep('choose'); setCode(''); setQrCode(null); setSecret(null); setFactorId(null) }}>
                ← Back
              </button>
            </div>
          )}

          {/* EMAIL VERIFY */}
          {step === 'email_verify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                {codeSent
                  ? <>We've sent a 6-digit code to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Enter it below to set up email verification.</>
                  : 'Sending code to your email...'}
              </div>
              {codeSent && (
                <>
                  <div>
                    <label className="label">Verification code</label>
                    <input className="input" type="text" inputMode="numeric" placeholder="000000"
                      value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', padding: 16 }}
                      autoFocus maxLength={6} />
                  </div>
                  <button className="btn-primary" onClick={verifyEmail} disabled={loading || code.length !== 6} style={{ padding: 14 }}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify and activate'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={sendEmailCode} disabled={loading}>
                    Resend code
                  </button>
                </>
              )}
              <button type="button" className="btn-ghost" onClick={() => { setStep('choose'); setCode('') }}>
                ← Back
              </button>
            </div>
          )}
        </div>

        {/* RECOVERY CODES — shown once after setup */}
        {recoveryCodes && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: '36px', width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🔑</div>
                <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>Save your recovery codes</h2>
                <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  If you lose access to your authenticator app or email, these codes let you sign in. <strong style={{ color: 'var(--danger)' }}>Each code can only be used once. Save them somewhere safe now — you won't see them again.</strong>
                </p>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 20, fontFamily: 'monospace', fontSize: 15, lineHeight: 2.2 }}>
                {recoveryCodes.map((code, i) => (
                  <div key={i} style={{ color: 'var(--cream)', letterSpacing: '0.1em' }}>{code}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => {
                  const text = 'Digital Relative Recovery Codes\n\n' + recoveryCodes.join('\n') + '\n\nEach code can only be used once. Store securely.'
                  const blob = new Blob([text], { type: 'text/plain' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href = url; a.download = 'digital-relative-recovery-codes.txt'; a.click()
                  URL.revokeObjectURL(url)
                }}>
                  ⬇ Download codes
                </button>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => {
                  navigator.clipboard.writeText(recoveryCodes.join('\n'))
                  toast.success('Copied to clipboard')
                }}>
                  Copy codes
                </button>
              </div>
              <div style={{ background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
                ⚠️ Store these in your password manager, print them, or save the downloaded file somewhere safe. Do not store them in Digital Relative itself.
              </div>
              <button className="btn-primary" style={{ width: '100%', padding: 14 }} onClick={() => { setRecoveryCodes(null); onComplete() }}>
                I've saved my codes — continue
              </button>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-sub)', marginTop: 14, lineHeight: 1.6 }}>
          You can change your 2FA method at any time in Settings
        </p>
      </div>
    </div>
  )
}
