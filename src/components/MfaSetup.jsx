import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function MfaSetup({ onComplete, onSignOut }) {
  const { user } = useAuth()
  const [step, setStep]         = useState('choose') // 'choose' | 'app_setup' | 'email_verify'
  const [qrCode, setQrCode]     = useState(null)
  const [secret, setSecret]     = useState(null)
  const [factorId, setFactorId] = useState(null)
  const [code, setCode]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function generateRecoveryCodes() {
    try {
      const { data } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'generate_recovery_codes', userId: user.id },
      })
      if (data?.codes) setRecoveryCodes(data.codes)
    } catch {
      // Non-fatal — user can generate from Settings
    }
  }

  async function cleanupUnverifiedFactors() {
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      const unverified = data?.totp?.filter(f => f.status === 'unverified') || []
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {})
      }
    } catch {}
  }

  // ── App setup ─────────────────────────────────────────────────────────────

  async function goToAppSetup() {
    // If QR already loaded for this session, just navigate to the screen — don't re-enroll
    if (qrCode && secret && factorId) {
      setStep('app_setup')
      return
    }

    setLoading(true)
    try {
      // Always clean up stuck unverified factors before enrolling
      await cleanupUnverifiedFactors()

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Digital Relative',
      })
      if (error) throw error

      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('app_setup')
    } catch (err) {
      toast.error('Could not start setup - please try again or use email instead')
    } finally {
      setLoading(false)
    }
  }

  function goBackFromApp() {
    // Go back to choose screen but KEEP qrCode/secret/factorId in state
    // so if user comes back to app setup we don't re-enroll
    setStep('choose')
    setCode('')
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
      await supabase.from('profiles')
        .update({ mfa_enrolled: true, mfa_email_fallback: false })
        .eq('id', user.id)
      toast.success('Authenticator app set up - save your recovery codes!')
      await generateRecoveryCodes()
    } catch {
      toast.error('Incorrect code - check your app and try again')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  // ── Email setup ───────────────────────────────────────────────────────────

  async function goToEmailSetup() {
    // If switching from app setup, clean up the unverified TOTP factor
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {})
      setFactorId(null)
      setQrCode(null)
      setSecret(null)
    }
    setStep('email_verify')
    setCodeSent(false)
    setCode('')
    await sendEmailCode()
  }

  function goBackFromEmail() {
    setStep('choose')
    setCode('')
    setCodeSent(false)
  }

  async function sendEmailCode() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('mfa-email', {
        body: { action: 'send_code', userId: user.id },
      })
      if (error || data?.error) throw new Error(data?.error || 'Failed')
      setCodeSent(true)
      toast.success('Verification code sent to your email')
    } catch (err) {
      toast.error(err.message?.includes('Too many') ? err.message : 'Could not send code - please try again')
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
      toast.success('Email verification set up - save your recovery codes!')
      await generateRecoveryCodes()
    } catch (err) {
      toast.error(err.message || 'Incorrect code')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.05) 0%, transparent 60%)',
    }}>
      <div style={{ width: 480, maxWidth: '92vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🔐</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 8 }}>
            Secure your account
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            Two-factor authentication is required to protect your vault.
          </p>
        </div>

        <div className="card-static" style={{ padding: 28 }}>

          {/* ── CHOOSE ── */}
          {step === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 4 }}>
                Choose your verification method:
              </div>

              <button onClick={goToAppSetup} disabled={loading} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 'var(--r)', textAlign: 'left', width: '100%',
                border: '1px solid var(--gold-border)', background: 'var(--gold-dim)',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gold)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Authenticator app
                    <span style={{ fontSize: 10, background: 'var(--gold)', color: '#0d1b2a', padding: '1px 7px', borderRadius: 99, fontWeight: 700 }}>Recommended</span>
                    {qrCode && <span style={{ fontSize: 10, color: 'var(--success)' }}>● Ready</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    Google Authenticator, Authy, or 1Password. Works offline. Most secure.
                  </div>
                </div>
                {loading ? <span className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} /> : <span style={{ color: 'var(--text-sub)', fontSize: 16 }}>→</span>}
              </button>

              <button onClick={goToEmailSetup} disabled={loading} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
                padding: '14px 16px', borderRadius: 'var(--r)', textAlign: 'left', width: '100%',
                border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>✉️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>
                    Email code
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    We send a 6-digit code to your email each time you sign in.
                  </div>
                </div>
                <span style={{ color: 'var(--text-sub)', fontSize: 16 }}>→</span>
              </button>

              <button onClick={onSignOut} style={{
                background: 'transparent', border: 'none', color: 'var(--text-sub)',
                fontSize: 12, cursor: 'pointer', marginTop: 4, fontFamily: 'var(--sans)',
              }}>
                Sign out instead
              </button>
            </div>
          )}

          {/* ── APP SETUP ── */}
          {step === 'app_setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Step 1 */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</div>
                <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  Open <strong style={{ color: 'var(--text)' }}>Google Authenticator</strong>, <strong style={{ color: 'var(--text)' }}>Authy</strong>, or <strong style={{ color: 'var(--text)' }}>1Password</strong> on your phone.
                  {' '}<span style={{ color: 'var(--text-sub)' }}>Don't have one? Download Google Authenticator first.</span>
                </div>
              </div>

              {/* Step 2 - QR / manual toggle */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <button onClick={() => setShowManual(false)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
                      background: !showManual ? 'var(--gold-dim)' : 'transparent',
                      color: !showManual ? 'var(--gold)' : 'var(--text-sub)',
                      border: !showManual ? '1px solid var(--gold-border)' : '1px solid var(--border)',
                    }}>📷 Scan QR code</button>
                    <button onClick={() => setShowManual(true)} style={{
                      flex: 1, padding: '7px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
                      background: showManual ? 'var(--gold-dim)' : 'transparent',
                      color: showManual ? 'var(--gold)' : 'var(--text-sub)',
                      border: showManual ? '1px solid var(--gold-border)' : '1px solid var(--border)',
                    }}>⌨️ Type key manually</button>
                  </div>

                  {!showManual ? (
                    <div>
                      {qrCode && (
                        <div style={{ background: 'white', borderRadius: 10, padding: 12, display: 'inline-block', marginBottom: 8 }}>
                          <img src={qrCode} alt="MFA QR Code" style={{ width: 176, height: 176, display: 'block' }} />
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                        In the app tap <strong style={{ color: 'var(--text)' }}>+</strong> → <strong style={{ color: 'var(--text)' }}>Scan a QR code</strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 10, lineHeight: 1.6 }}>
                        In the app tap <strong style={{ color: 'var(--text)' }}>+</strong> → <strong style={{ color: 'var(--text)' }}>Enter a setup key</strong>, then enter:
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 6 }}>
                        Account: <strong style={{ color: 'var(--cream)' }}>Digital Relative</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 8 }}>Key:</div>
                      {secret && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <code style={{
                            flex: 1, background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 6,
                            fontSize: 14, color: 'var(--gold)', letterSpacing: '0.12em',
                            wordBreak: 'break-all', lineHeight: 2, fontFamily: 'monospace',
                          }}>
                            {/* Format as groups of 4 for readability */}
                            {secret.match(/.{1,4}/g)?.join(' ')}
                          </code>
                          <button onClick={() => { navigator.clipboard.writeText(secret); toast.success('Key copied') }} style={{
                            background: 'transparent', border: '1px solid var(--border-md)', borderRadius: 6,
                            color: 'var(--text-sub)', cursor: 'pointer', padding: '8px 10px',
                            fontSize: 12, fontFamily: 'var(--sans)', flexShrink: 0,
                          }}>Copy</button>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 8 }}>
                        Type: <strong style={{ color: 'var(--text)' }}>Time based</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gold)', color: '#0d1b2a', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</div>
                <div style={{ flex: 1 }}>
                  <label className="label" style={{ marginBottom: 8, display: 'block' }}>
                    Enter the 6-digit code from your app
                  </label>
                  <input className="input" type="text" inputMode="numeric" placeholder="000000"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', padding: 14 }}
                    maxLength={6} autoComplete="one-time-code" />
                </div>
              </div>

              <button className="btn-primary" onClick={verifyApp}
                disabled={loading || code.length !== 6} style={{ padding: 13 }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Confirm and activate'}
              </button>

              <button className="btn-ghost" onClick={goBackFromApp}>
                ← Back to method selection
              </button>
            </div>
          )}

          {/* ── EMAIL VERIFY ── */}
          {step === 'email_verify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                {codeSent
                  ? <>Code sent to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Enter it below.</>
                  : <span>Sending code to your email{loading ? '...' : '.'}</span>}
              </div>

              {codeSent && (
                <>
                  <input className="input" type="text" inputMode="numeric" placeholder="000000"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', padding: 14 }}
                    autoFocus maxLength={6} autoComplete="one-time-code" />
                  <button className="btn-primary" onClick={verifyEmail}
                    disabled={loading || code.length !== 6} style={{ padding: 13 }}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify and activate'}
                  </button>
                  <button className="btn-ghost" onClick={sendEmailCode} disabled={loading}>
                    Resend code
                  </button>
                </>
              )}

              <button className="btn-ghost" onClick={goBackFromEmail}>
                ← Back to method selection
              </button>
            </div>
          )}
        </div>

        {/* RECOVERY CODES - shown once after setup */}
        {recoveryCodes && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,12,20,0.97)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0d1e30', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: 32, width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
                <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>Save your recovery codes</h2>
                <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  If you lose your phone, these codes let you sign in.{' '}
                  <strong style={{ color: 'var(--danger)' }}>Each code works once only. Save them now - you won't see them again.</strong>
                </p>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontFamily: 'monospace', fontSize: 15, lineHeight: 2.2 }}>
                {recoveryCodes.map((c, i) => (
                  <div key={i} style={{ color: 'var(--cream)', letterSpacing: '0.08em' }}>{c}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => {
                  const text = 'Digital Relative Recovery Codes\n\n' + recoveryCodes.join('\n') + '\n\nEach code can only be used once.'
                  const blob = new Blob([text], { type: 'text/plain' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href = url; a.download = 'digital-relative-recovery-codes.txt'; a.click()
                  URL.revokeObjectURL(url)
                }}>⬇ Download</button>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => {
                  navigator.clipboard.writeText(recoveryCodes.join('\n'))
                  toast.success('Copied')
                }}>Copy all</button>
              </div>
              <div style={{ background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
                ⚠️ Store in your password manager or print them. Do not save inside Digital Relative.
              </div>
              <button className="btn-primary" style={{ width: '100%', padding: 13 }}
                onClick={() => { setRecoveryCodes(null); onComplete() }}>
                I've saved my codes - continue →
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
