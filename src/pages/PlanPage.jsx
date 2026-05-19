import { useState } from 'react'
import { stripePromise, PLANS } from '../lib/stripe'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const PLAN_FEATURES = {
  free: [
    { text: '5 vault entries', ok: true },
    { text: '1 beneficiary', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Dead man\'s switch', ok: false },
    { text: 'File uploads', ok: false },
    { text: 'Email support', ok: false },
  ],
  single: [
    { text: 'Unlimited entries', ok: true },
    { text: 'Up to 3 beneficiaries', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Dead man\'s switch', ok: true },
    { text: 'File uploads (1 GB)', ok: true },
    { text: 'Email support', ok: true },
  ],
  couples: [
    { text: '2 vaults included', ok: true },
    { text: 'Up to 5 beneficiaries', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Dead man\'s switch × 2', ok: true },
    { text: 'File uploads (5 GB)', ok: true },
    { text: 'Priority support', ok: true },
  ],
}

export default function PlanPage() {
  const { user, profile } = useAuth()
  const [loading, setLoading]           = useState(null)
  const [couplesAnnual, setCouplesAnnual] = useState(false)

  const currentPlan = profile?.plan || 'free'

  async function checkout(priceId, planId) {
    if (!priceId) {
      // Demo mode — no real Stripe key
      toast('Connect your Stripe keys in .env to enable payments', { icon: 'ℹ️' })
      return
    }
    setLoading(priceId)
    try {
      // Create checkout session via Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, userId: user.id, successUrl: window.location.origin + '/app?success=true', cancelUrl: window.location.origin + '/app?cancelled=true' },
      })
      if (error) throw error
      const stripe = await stripePromise
      await stripe.redirectToCheckout({ sessionId: data.sessionId })
    } catch (e) {
      toast.error(e.message || 'Checkout failed')
    } finally {
      setLoading(null)
    }
  }

  const plans = [
    {
      key: 'free',
      name: 'Free',
      price: '£0',
      period: '',
      note: 'Forever free',
      priceId: null,
      badge: null,
    },
    {
      key: 'single',
      name: 'Single',
      price: '£18',
      period: '/year',
      note: 'Save 25% vs monthly',
      priceId: PLANS.single.priceId,
      badge: 'Most popular',
    },
    {
      key: 'couples',
      name: 'Couples',
      price: couplesAnnual ? '£45' : '£5',
      period: couplesAnnual ? '/year' : '/month',
      note: couplesAnnual ? 'Best value' : '£45/year — save 25%',
      priceId: couplesAnnual ? PLANS.couples.annualPriceId : PLANS.couples.priceId,
      badge: null,
    },
  ]

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">My Plan</h1>
        <p className="page-sub">Simple pricing. Cancel any time. All vaults are encrypted.</p>
      </div>

      {/* Couples billing toggle */}
      <div className="fade-up-2" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-sub)' }}>Couples billing:</span>
        {['Monthly', 'Annual (save 25%)'].map((l, i) => (
          <button key={l} onClick={() => setCouplesAnnual(i === 1)} style={{
            padding: '6px 14px', borderRadius: 'var(--r)', fontSize: 12,
            background: couplesAnnual === (i === 1) ? 'var(--gold)' : 'transparent',
            color: couplesAnnual === (i === 1) ? '#0d1b2a' : 'var(--text-sub)',
            border: couplesAnnual === (i === 1) ? 'none' : '1px solid var(--border-md)',
            cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {/* Pricing cards */}
      <div className="fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        {plans.map(p => {
          const isCurrent = currentPlan === p.key
          const features  = PLAN_FEATURES[p.key]
          return (
            <div key={p.key} className="card-static" style={{
              borderColor: isCurrent ? 'var(--gold-border)' : p.badge ? 'rgba(255,255,255,0.12)' : 'var(--border)',
              background: isCurrent ? 'var(--gold-dim)' : 'var(--card)',
              position: 'relative', display: 'flex', flexDirection: 'column',
            }}>
              {p.badge && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)' }}>
                  <span className="badge badge-gold">{p.badge}</span>
                </div>
              )}
              {isCurrent && (
                <div style={{ position: 'absolute', top: -12, right: 14 }}>
                  <span className="badge badge-green">Current plan</span>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 38, fontWeight: 600, color: 'var(--cream)', lineHeight: 1 }}>{p.price}</span>
                <span style={{ color: 'var(--text-sub)', fontSize: 13 }}>{p.period}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 16 }}>{p.note}</div>

              <hr className="divider" />

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
                {features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: f.ok ? 'var(--text)' : 'var(--text-sub)' }}>
                    <span style={{ color: f.ok ? 'var(--success)' : 'var(--border-md)', fontSize: 14, flexShrink: 0 }}>{f.ok ? '✓' : '○'}</span>
                    {f.text}
                  </div>
                ))}
              </div>

              <button
                className={isCurrent ? 'btn-ghost' : 'btn-primary'}
                disabled={isCurrent || loading === p.priceId}
                onClick={() => !isCurrent && p.priceId && checkout(p.priceId, p.key)}
                style={{ width: '100%', textAlign: 'center', opacity: isCurrent ? 0.6 : 1 }}>
                {loading === p.priceId
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : isCurrent ? 'Current plan'
                  : p.key === 'free' ? 'Downgrade to free'
                  : `Upgrade to ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>

      {/* Current billing info */}
      {currentPlan !== 'free' && profile?.plan_renewal && (
        <div className="fade-up-4 card-static">
          <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 14 }}>Billing details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
            {[
              ['Plan', PLANS[currentPlan]?.name || currentPlan],
              ['Next renewal', new Date(profile.plan_renewal).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
              ['Payment', 'Managed via Stripe'],
              ['Data region', 'EU (Ireland)'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ color: 'var(--text-sub)', marginBottom: 3 }}>{k}</div>
                <div style={{ fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          <button className="btn-ghost" style={{ marginTop: 16, fontSize: 12 }}
            onClick={() => toast('Manage billing in Stripe Customer Portal')}>
            Manage billing →
          </button>
        </div>
      )}
    </div>
  )
}
