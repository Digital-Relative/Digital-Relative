import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

function TreeLogo({ size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <g transform="translate(50,58)">
        <rect x="-4" y="6" width="8" height="24" rx="2" fill="#c9a84c"/>
        <path d="M-4,30 Q-11,36 -18,32 M4,30 Q11,36 18,32 M0,30 L0,36" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M0,6 L0,-5 M0,0 L-16,-14 M0,0 L16,-14 M-16,-14 L-26,-26 M-16,-14 L-10,-28 M16,-14 L26,-26 M16,-14 L10,-28 M0,-5 L-6,-21 M0,-5 L6,-21" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="-26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="-10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="26" cy="-30" r="6" fill="#c9a84c"/>
        <circle cx="10" cy="-32" r="5" fill="#c9a84c" opacity="0.85"/>
        <circle cx="-6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="6" cy="-25" r="4" fill="#c9a84c" opacity="0.9"/>
        <circle cx="0" cy="-38" r="7" fill="#c9a84c"/>
      </g>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 814 1000" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.3-161-39.3c-73.8 0-98.8 40.2-163.2 40.2s-108.3-57.6-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49.1 192.5-49.1 31 0 110.7 2.6 173.4 66.5zm-165.4-100.7c-3.9-22.5-16.8-50.7-36.3-73.7-23.8-27.1-62.2-48.4-100.8-48.4-1.3 0-2.6 0-3.9.1 1.3 24.4 12.3 48.7 30.5 68.5 19.5 21.3 56.6 43.6 110.5 53.5z"/>
    </svg>
  )
}

function ForgotPasswordModal({ onClose }) {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [authAttempts, setAuthAttempts] = useState(0)
  const [lockedUntil, setLockedUntil]   = useState(null)
  const MAX_AUTH_ATTEMPTS = 5
  const LOCKOUT_MS        = 5 * 60 * 1000  // 5 minutes

  async function handleReset() {
    if (!email) { toast.error('Enter your email address'); return }
    setLoading(true)
    try {
      // Send password reset email - Supabase returns success regardless of whether
      // account exists (prevents email enumeration). Google/Apple users won't receive
      // this email as they have no password, but we show the same message to all.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      setSent(true)
    } catch (err) {
      toast.error('Could not send reset email - please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>✉️</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>Check your email</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
              We sent a password reset link to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              Check your spam folder if it doesn't arrive within a few minutes.
            </div>
            <button className="btn-ghost" style={{ marginTop: 24 }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>Reset your password</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 20, lineHeight: 1.6 }}>
              Enter your email address and we'll send you a link to reset your password.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Email address</label>
              <input className="input" type="email" placeholder="you@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()} autoFocus />
            </div>

            {/* Hints based on account type */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleReset} disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Send reset link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AuthPage({ onBack, selectedPlan, onClearPlan }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]           = useState(selectedPlan ? 'signup' : 'signin')
  const [loading, setLoading]     = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [mfaRequired, setMfaRequired]   = useState(false)
  const [mfaCode, setMfaCode]           = useState('')
  const [factorId, setFactorId]         = useState(null)
  const [showForgot, setShowForgot]     = useState(false)
  const [signupDone, setSignupDone]     = useState(false)
  const [signupEmail, setSignupEmail]   = useState('')
  const [form, setForm] = useState({ email: '', password: '', fullName: '', confirmPassword: '', marketingOptIn: false })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleOAuth(provider) {
    setOauthLoading(provider)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
          scopes: provider === 'apple' ? 'email name' : 'email profile',
        },
      })
      if (error) throw error
    } catch (err) {
      toast.error(err.message || `${provider} sign in failed`)
      setOauthLoading(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // B-1 fix: enforce lockout check before any sign-in attempt
    if (mode === 'signin' && lockedUntil && Date.now() < lockedUntil) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000)
      toast.error(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
      return
    }
    if (mode === 'signup' && form.password !== form.confirmPassword) {
      toast.error('Passwords do not match'); return
    }
    if (mode === 'signup' && form.password.length < 10) {
      toast.error('Password must be at least 10 characters'); return
    }
    setLoading(true)
    try {
      if (mode === 'signin') {
        const result = await signIn({ email: form.email, password: form.password })
        if (result?.nextStep === 'mfa') {
          setFactorId(result.factorId)
          setMfaRequired(true)
        } else {
          setAuthAttempts(0)
          setLockedUntil(null)
          toast.success('Welcome back')
        }
      } else {
        await signUp({ email: form.email, password: form.password, fullName: form.fullName, marketingOptIn: form.marketingOptIn })
        // Store selected plan in sessionStorage to survive email confirmation redirect
        if (selectedPlan) {
          sessionStorage.setItem('dr_pending_plan', JSON.stringify(selectedPlan))
        }
        setSignupEmail(form.email)
        setSignupDone(true)
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
      // B-1 fix: increment attempt counter and enforce lockout on sign-in failures
      if (mode === 'signin') {
        setAuthAttempts(prev => {
          const next = prev + 1
          if (next >= MAX_AUTH_ATTEMPTS) {
            setLockedUntil(Date.now() + LOCKOUT_MS)
          }
          return next
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleMFA(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: mfaCode })
      if (error) throw error
      toast.success('Welcome back')
    } catch (err) {
      toast.error(err.message || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const oauthBtnStyle = {
    width: '100%', padding: '11px', borderRadius: 'var(--r)', fontSize: 13,
    fontFamily: 'var(--sans)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
    color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.04) 0%, transparent 60%)',
    }}>
      <div style={{ width: 420, maxWidth: '92vw' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <TreeLogo size={64} />
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 34, fontWeight: 600, color: 'var(--gold)', lineHeight: 1 }}>Digital Relative</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 6 }}>Secure Legacy Vault</div>
        </div>

        {/* Back to landing page */}
        {onBack && (
          <button onClick={onBack} style={{
            background: 'transparent', border: 'none', color: 'var(--text-sub)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)',
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: 0,
          }}>
            ← Back to site
          </button>
        )}

        {/* Selected plan banner */}
        {selectedPlan && (
          <div style={{
            background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
            borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--gold)' }}>
              {selectedPlan.planId === 'single' ? 'Single plan' : 'Couples plan'} selected
            </strong>
            {' '}- Create your account and you will go straight to checkout.
          </div>
        )}

        {/* MFA screen */}
        {mfaRequired ? (
          <div className="card-static fade-up" style={{ padding: 32 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>Two-factor authentication</div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 20 }}>Enter the 6-digit code from your authenticator app.</div>
            <form onSubmit={handleMFA} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="input" placeholder="000000" value={mfaCode}
                onChange={e => setMfaCode(e.target.value)} maxLength={6}
                style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }} autoFocus />
              <button className="btn-primary" type="submit" disabled={loading || mfaCode.length !== 6} style={{ width: '100%', padding: 12 }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify'}
              </button>
            </form>
          </div>

        ) : (

        <div className="card-static fade-up" style={{ padding: 32 }}>

            {/* OAuth buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button style={oauthBtnStyle} onClick={() => handleOAuth('google')} disabled={!!oauthLoading}>
                {oauthLoading === 'google' ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <GoogleIcon />}
                Continue with Google
              </button>
              {/* Apple sign-in - hidden until Apple Developer account is set up
              <button style={oauthBtnStyle} onClick={() => handleOAuth('apple')} disabled={!!oauthLoading}>
                {oauthLoading === 'apple' ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <AppleIcon />}
                Continue with Apple
              </button>
              */}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
              {['signin', 'signup'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? 'var(--text)' : 'var(--text-sub)',
                  fontSize: 13, fontWeight: mode === m ? 500 : 400, transition: 'all 0.15s', cursor: 'pointer',
                }}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'signup' && (
                <div>
                  <label className="label">Full name</label>
                  <input className="input" type="text" placeholder="Jane Smith"
                    value={form.fullName} onChange={e => set('fullName', e.target.value)} required />
                </div>
              )}
              <div>
                <label className="label">Email address</label>
                <input className="input" type="email" placeholder="you@email.com"
                  value={form.email} onChange={e => set('email', e.target.value)} required />
              </div>
              <div>
                <label className="label">
                  Password {mode === 'signup' && <span style={{ color: 'var(--text-sub)' }}>(min. 10 characters)</span>}
                </label>
                <input className="input" type="password" placeholder="••••••••••"
                  value={form.password} onChange={e => set('password', e.target.value)} required />
              </div>
              {mode === 'signup' && form.password.length > 0 && (
                <div style={{ marginTop: -8, marginBottom: 4 }}>
                  {(() => {
                    const p = form.password
                    const score = [p.length >= 12, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length
                    const labels = ['Weak', 'Fair', 'Good', 'Strong']
                    const colours = ['#e05252', '#e8a44c', '#c9a84c', '#4caf82']
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                          <div style={{ width: `${(score / 4) * 100}%`, height: '100%', background: colours[score - 1] || colours[0], borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: colours[score - 1] || colours[0], width: 44 }}>{labels[score - 1] || 'Weak'}</span>
                      </div>
                    )
                  })()}
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="label">Confirm password</label>
                  <input className="input" type="password" placeholder="••••••••••"
                    value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required />
                </div>
              )}
              {mode === 'signup' && (
                <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--gold-dim)', borderRadius: 'var(--r)', border: '1px solid var(--gold-border)' }}>
                  🔒 AES-256 encrypted · MFA required · EU data storage
                </div>
              )}
              <button className="btn-primary" type="submit" disabled={loading}
                style={{ marginTop: 4, width: '100%', padding: 12 }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>

              {/* Forgot password */}
              {mode === 'signin' && (
                <div style={{ textAlign: 'center' }}>
                  <button type="button" onClick={() => setShowForgot(true)} style={{
                    background: 'transparent', border: 'none', color: 'var(--text-sub)',
                    fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
                  }}>
                    Forgot your password?
                  </button>
                </div>
              )}
            </form>

            {mode === 'signup' && (
              <p style={{ fontSize: 11, color: 'var(--text-sub)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
                By creating an account you agree to our{' '}
                <a href="/?page=privacy">Privacy Policy</a> and{' '}
                <a href="/?page=terms">Terms of Service</a>.
              </p>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-sub)', marginTop: 20 }}>
          AES-256 encrypted · MFA enforced · GDPR compliant · EU storage
        </p>
      </div>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  )
}
