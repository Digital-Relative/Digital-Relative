import { useState, useEffect } from 'react'
import { stripePromise, PLANS } from '../lib/stripe'
import { useAuth } from '../context/AuthContext'
import { usePartner } from '../hooks/usePartner'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Plan ordering for "is this an upgrade or a downgrade?" decisions.
const PLAN_RANK = { free: 0, single: 1, couples: 2 }

const PLAN_FEATURES = {
  free: [
    { text: '5 vault entries', ok: true },
    { text: '1 beneficiary', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Check-in protection', ok: false },
    { text: 'File uploads', ok: false },
    { text: 'Email support', ok: false },
  ],
  single: [
    { text: 'Unlimited entries', ok: true },
    { text: 'Up to 3 beneficiaries', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Check-in protection', ok: true },
    { text: 'File uploads (1 GB)', ok: true },
    { text: 'Email support', ok: true },
  ],
  couples: [
    { text: '2 vaults included', ok: true },
    { text: 'Up to 5 beneficiaries', ok: true },
    { text: 'All categories', ok: true },
    { text: 'Check-in protection × 2', ok: true },
    { text: 'File uploads (5 GB)', ok: true },
    { text: 'Priority support', ok: true },
  ],
}

export default function PlanPage() {
  const { user, profile } = useAuth()

  // Listen for checkout trigger from landing page plan selection
  useEffect(() => {
    function handleTrigger(e) {
      const { priceId, planId } = e.detail || {}
      if (priceId && planId) checkout(priceId, planId)
    }
    window.addEventListener('dr_trigger_checkout', handleTrigger)
    return () => window.removeEventListener('dr_trigger_checkout', handleTrigger)
  }, [])
  const [loading, setLoading]           = useState('') // plan key being loaded
  // null when no downgrade in flight; otherwise the target plan key.
  const [downgradeTarget, setDowngradeTarget] = useState(null)
  const [couplesAnnual, setCouplesAnnual] = useState(false)

  const currentPlan = profile?.plan || 'free'
  const { link: partnerLink } = usePartner()
  const hasActivePartner = partnerLink?.status === 'accepted'

  async function checkout(priceId, planId) {
    if (!priceId) {
      // Demo mode — no real Stripe key
      toast('Connect your Stripe keys in .env to enable payments', { icon: 'ℹ️' })
      return
    }
    setLoading(planId)
    try {
      // Create checkout session via Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId, userId: user.id, successUrl: window.location.origin + '/?success=true', cancelUrl: window.location.origin + '/?cancelled=true' },
      })
      if (error) throw error
      // redirect directly using session URL
      // Validate URL before redirect — prevent open redirect
      const redirectUrl = data.url
      if (!redirectUrl || !redirectUrl.startsWith('https://checkout.stripe.com/')) {
        throw new Error('Invalid checkout URL received')
      }
      window.location.href = redirectUrl
    } catch (e) {
      toast.error(e.message || 'Checkout failed')
    } finally {
      setLoading('')
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
      note: couplesAnnual ? 'Best value' : '£45/year - save 25%',
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

              {(() => {
                const targetRank  = PLAN_RANK[p.key]      ?? 0
                const currentRank = PLAN_RANK[currentPlan] ?? 0
                const isDowngrade = !isCurrent && targetRank < currentRank
                return (
                  <button
                    className={isCurrent ? 'btn-ghost' : 'btn-primary'}
                    disabled={isCurrent || loading === p.key}
                    onClick={() => {
                      if (isCurrent) return
                      // Any downgrade — to free or to a paid lower tier — goes
                      // through the modal, which opens the Stripe billing portal.
                      // The portal handles plan changes with proration; starting
                      // a fresh checkout for a downgrade would double-charge.
                      if (isDowngrade) setDowngradeTarget(p.key)
                      else if (p.priceId) checkout(p.priceId, p.key)
                    }}
                    style={{ width: '100%', textAlign: 'center', opacity: isCurrent ? 0.6 : 1 }}>
                    {loading === p.key
                      ? <span className="spinner" style={{ width: 14, height: 14 }} />
                      : isCurrent  ? 'Current plan'
                      : isDowngrade ? `Downgrade to ${p.name}`
                      : `Upgrade to ${p.name}`}
                  </button>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Downgrade confirmation modal */}
      {downgradeTarget && (() => {
        const targetName    = downgradeTarget === 'free' ? 'Free' : downgradeTarget === 'single' ? 'Single' : 'Couples'
        const currentName   = currentPlan === 'free' ? 'Free' : currentPlan === 'single' ? 'Single' : 'Couples'
        const isFromCouples = currentPlan === 'couples'
        const renewalDate   = profile?.plan_renewal
          ? new Date(profile.plan_renewal).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
          : null
        const losses = downgradeTarget === 'free' ? [
          'Vault entries above 5 will become inaccessible (not deleted)',
          'All uploaded documents will become inaccessible',
          'Beneficiaries above 1 will lose access invitations',
          'Check-in protection will be disabled',
          'Email reminders for check-ins will stop',
          'Expiry reminders will stop',
        ] : downgradeTarget === 'single' ? [
          'The shared Couples vault will be detached — joint entries return to whoever created them',
          'Beneficiaries above 3 will lose access invitations',
          'Your file upload allowance drops from 5 GB to 1 GB',
          'Support tier drops from Priority to Email',
        ] : []
        return (
        <div className="modal-overlay" onClick={() => setDowngradeTarget(null)}>
          <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 8 }}>
                {downgradeTarget === 'free' ? 'Cancel your subscription?' : `Switch to ${targetName}?`}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                {downgradeTarget === 'free'
                  ? `You'll lose ${currentName} features below at the end of your current billing period.`
                  : `You'll keep ${currentName} features below until you confirm in Stripe, then lose them on the new ${targetName} plan.`}
              </p>
            </div>

            {/* What changes */}
            <div style={{ background: 'rgba(224,82,82,0.08)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 'var(--r)', padding: '16px 18px', marginBottom: 16 }}>
              {losses.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--danger)', flexShrink: 0 }}>✗</span>
                  {item}
                </div>
              ))}
            </div>

            {/* What happens with your money — honest copy, no surprises */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500, marginBottom: 8 }}>What happens with your billing</div>
              {downgradeTarget === 'free' ? (
                <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
                  {renewalDate ? <>You've paid for {currentName} until <strong style={{ color: 'var(--text)' }}>{renewalDate}</strong>. </> : ''}
                  When you click <em>Cancel subscription</em> on the next screen, Stripe stops auto-renewing your plan but you keep {currentName} access for the time you've already paid for. {renewalDate ? <>On <strong style={{ color: 'var(--text)' }}>{renewalDate}</strong> your account automatically becomes Free.</> : 'When that period ends, your account automatically becomes Free.'} We don't issue cash refunds for unused time, but you can resubscribe any time.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
                  You'll keep {currentName} until <strong style={{ color: 'var(--text)' }}>{renewalDate || 'your renewal date'}</strong> — you've already paid for that time. On that date, your plan switches to {targetName} and Stripe charges you the {targetName} rate from then onwards. No immediate change, no double-charge, no cash refund for the {currentName} time you've used.
                </div>
              )}
            </div>

            {isFromCouples && hasActivePartner && (
              <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid var(--gold-border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 500, marginBottom: 6 }}>Your partner is affected</div>
                <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
                  You're the payer on the Couples plan. Changing plan here in Stripe doesn't automatically end your Couples link — to do that, return to the <strong style={{ color: 'var(--text)' }}>Couples vault</strong> page and click <strong style={{ color: 'var(--text)' }}>Unlink</strong>. That starts a 14-day window for both of you to choose which shared entries to keep.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" onClick={() => setDowngradeTarget(null)} style={{ flex: 1 }}>
                Keep my current plan
              </button>
              <button className="btn-danger" style={{ flex: 1 }}
                disabled={loading === 'downgrade'}
                onClick={async () => {
                  setLoading('downgrade')
                  try {
                    const { data, error } = await supabase.functions.invoke('create-portal', {
                      body: { userId: user.id, returnUrl: window.location.origin + '/?page=plan' }
                    })
                    if (error || !data?.url) throw new Error('Could not open billing portal')
                    if (!data.url.startsWith('https://billing.stripe.com/')) throw new Error('Invalid portal URL')
                    setDowngradeTarget(null)
                    toast(downgradeTarget === 'free'
                      ? 'Redirecting to cancel your subscription. Your plan reverts to Free at the end of your billing period.'
                      : `Redirecting to change your subscription to ${targetName}.`,
                      { duration: 4000 })
                    window.location.href = data.url
                  } catch {
                    toast.error('Could not open billing portal — try the Manage subscription button below')
                    setDowngradeTarget(null)
                  } finally {
                    setLoading('')
                  }
                }}>
                {loading === 'downgrade'
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : downgradeTarget === 'free' ? 'Cancel subscription →' : `Switch to ${targetName} →`}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

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
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke('create-portal', { body: { userId: user.id } })
                if (error || !data?.url) { toast.error('Could not open billing portal'); return }
                if (!data.url.startsWith('https://billing.stripe.com/')) { toast.error('Invalid portal URL'); return }
                window.location.href = data.url
              } catch { toast.error('Could not open billing portal') }
            }}>
            Manage or cancel subscription →
          </button>
        </div>
      )}
    </div>
  )
}
