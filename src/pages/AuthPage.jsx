import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]       = useState('signin') // 'signin' | 'signup'
  const [loading, setLoading] = useState(false)
  const [form, setForm]       = useState({ email: '', password: '', fullName: '', confirmPassword: '' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'signup' && form.password !== form.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn({ email: form.email, password: form.password })
        toast.success('Welcome back')
      } else {
        await signUp({ email: form.email, password: form.password, fullName: form.fullName })
        toast.success('Account created — please check your email to confirm')
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(26,51,80,0.6) 0%, transparent 60%)',
    }}>
      <div style={{ width: 420, maxWidth: '92vw' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 36, fontWeight: 600, color: 'var(--gold)' }}>Legatum</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4 }}>
            Digital Legacy Vault
          </div>
        </div>

        <div className="card-static fade-up" style={{ padding: '32px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-sub)',
                fontSize: 13, fontWeight: mode === m ? 500 : 400, transition: 'all 0.15s',
              }}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div>
                <label className="label">Full name</label>
                <input className="input" type="text" placeholder="Jane Smith" value={form.fullName}
                  onChange={e => set('fullName', e.target.value)} required />
              </div>
            )}
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" placeholder="you@email.com" value={form.email}
                onChange={e => set('email', e.target.value)} required />
            </div>
            <div>
              <label className="label">Password {mode === 'signup' && '(min. 8 characters)'}</label>
              <input className="input" type="password" placeholder="••••••••" value={form.password}
                onChange={e => set('password', e.target.value)} required />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="label">Confirm password</label>
                <input className="input" type="password" placeholder="••••••••" value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)} required />
              </div>
            )}

            {mode === 'signup' && (
              <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--gold-dim)', borderRadius: 'var(--r)', border: '1px solid var(--gold-border)' }}>
                🔒 Your vault is encrypted with your password before leaving your device. We never have access to your data.
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, width: '100%', padding: '12px' }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'signup' && (
            <p style={{ fontSize: 11, color: 'var(--text-sub)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              By creating an account you agree to our{' '}
              <a href="/terms" target="_blank">Terms of Service</a> and{' '}
              <a href="/privacy" target="_blank">Privacy Policy</a>.
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-sub)', marginTop: 20 }}>
          Secured with AES-256 encryption · GDPR compliant · EU data storage
        </p>
      </div>
    </div>
  )
}
