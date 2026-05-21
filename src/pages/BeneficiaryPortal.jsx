import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AfterIAmGonePage from './AfterIAmGonePage'

// Standalone portal for beneficiary access
// Accessed via invite token link — no Digital Relative account needed
// URL format: /beneficiary?token=xxxxx

function TreeLogo({ size = 48 }) {
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

// Access tiers
// Tier 1: After I'm Gone guide + basic info (email confirmed only)
// Tier 2: Vault entries + documents (requires Onfido ID verification)
const STAGES = {
  loading:      'loading',
  invalid:      'invalid',        // token not found or expired
  confirm_email:'confirm_email',  // beneficiary needs to confirm their email
  verify_id:    'verify_id',      // ID verification needed for tier 2
  tier1:        'tier1',          // guide access granted
  tier2:        'tier2',          // full access granted
}

export default function BeneficiaryPortal() {
  const token = new URLSearchParams(window.location.search).get('token')
  const [stage, setStage]   = useState(STAGES.loading)
  const [beneficiary, setBeneficiary] = useState(null)
  const [ownerGuide, setOwnerGuide]   = useState(null)
  const [email, setEmail]   = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('guide')

  useEffect(() => { loadToken() }, [])

  async function loadToken() {
    if (!token) { setStage(STAGES.invalid); return }

    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*, profiles:user_id(id)')
      .eq('invite_token', token)
      .in('status', ['email_confirmed', 'id_verified', 'access_granted'])
      .single()

    if (error || !data) { setStage(STAGES.invalid); return }

    setBeneficiary(data)

    // Load the owner's guide
    const { data: guide } = await supabase
      .from('after_i_am_gone')
      .select('guide_data')
      .eq('user_id', data.user_id)
      .single()
    setOwnerGuide(guide?.guide_data?.sections)

    // Check if ID verified
    if (data.id_verified_at) {
      setStage(STAGES.tier2)
    } else {
      setStage(STAGES.tier1)
    }
  }

  const [verifyForm, setVerifyForm] = useState({ firstName: '', lastName: '' })
  const [verifyStep, setVerifyStep] = useState('form') // form | processing | complete | error

  async function startIdVerification() {
    if (!verifyForm.firstName || !verifyForm.lastName) return
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-identity', {
        body: {
          beneficiaryId: beneficiary.id,
          firstName:     verifyForm.firstName,
          lastName:      verifyForm.lastName,
          email:         beneficiary.email,
        },
      })
      if (error) throw error
      if (!data?.sdkToken) throw new Error('Verification service unavailable')

      // Load Onfido SDK dynamically
      setVerifyStep('processing')

      // Onfido Web SDK — load from CDN
      if (!document.querySelector('#onfido-sdk')) {
        const script = document.createElement('script')
        script.id  = 'onfido-sdk'
        script.src = 'https://assets.onfido.com/web-sdk-releases/latest/onfido.min.js'
        document.head.appendChild(script)
        const link = document.createElement('link')
        link.rel  = 'stylesheet'
        link.href = 'https://assets.onfido.com/web-sdk-releases/latest/style.css'
        document.head.appendChild(link)
        await new Promise(resolve => script.onload = resolve)
      }

      // Mount Onfido SDK
      const onfidoEl = document.createElement('div')
      onfidoEl.id = 'onfido-mount'
      document.body.appendChild(onfidoEl)

      window.Onfido.init({
        token:         data.sdkToken,
        containerId:   'onfido-mount',
        useModal:      true,
        isModalOpen:   true,
        onModalRequestClose: () => setVerifyStep('form'),
        steps: ['welcome', 'document', 'face', 'complete'],
        onComplete: async (completionData) => {
          // Trigger the check via edge function
          await supabase.functions.invoke('verify-identity', {
            body: {
              beneficiaryId: beneficiary.id,
              applicantId:   data.applicantId,
              action:        'complete_check',
            },
          })
          setVerifyStep('complete')
          // Reload to update tier
          setTimeout(() => loadToken(), 3000)
        },
        onError: (error) => {
          console.error('Onfido SDK error')
          setVerifyStep('error')
        },
      })
    } catch (err) {
      console.error('Verification error')
      setVerifyStep('error')
    } finally {
      setLoading(false)
    }
  }

  if (stage === STAGES.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (stage === STAGES.invalid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 10 }}>
            Invalid or expired link
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            This access link is not valid. It may have expired or already been used. Please contact the estate executor for a new link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      {/* Header */}
      <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <TreeLogo size={36} />
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--gold)' }}>Digital Relative</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>Beneficiary access portal</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-sub)' }}>
          Accessing: <strong style={{ color: 'var(--text)' }}>{beneficiary?.name}</strong>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>

        {/* Condolences message */}
        <div className="card-static fade-up" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 28, textAlign: 'center', padding: '28px 32px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>
            We're sorry for your loss
          </div>
          <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.8, maxWidth: 520, margin: '0 auto' }}>
            This portal gives you access to important information and documents to help you during this difficult time. Take everything at your own pace. You don't need to do everything at once.
          </p>
        </div>

        {/* Access tier indicator */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div className="card-static" style={{ flex: 1, textAlign: 'center', borderColor: 'var(--success)', background: 'var(--success-dim)' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--success)' }}>Guide access</div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>What to do now</div>
          </div>
          <div className="card-static" style={{ flex: 1, textAlign: 'center', borderColor: stage === STAGES.tier2 ? 'var(--success)' : 'var(--border)', background: stage === STAGES.tier2 ? 'var(--success-dim)' : 'transparent', cursor: stage !== STAGES.tier2 ? 'pointer' : 'default' }}
            onClick={() => stage !== STAGES.tier2 && setActiveTab('verify')}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{stage === STAGES.tier2 ? '✓' : '🔒'}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: stage === STAGES.tier2 ? 'var(--success)' : 'var(--text-sub)' }}>
              {stage === STAGES.tier2 ? 'Full access' : 'Verify identity'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>Accounts & documents</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
          {[
            { id: 'guide', label: '📋 What to do now', always: true },
            { id: 'verify', label: '🪪 Verify identity', always: stage !== STAGES.tier2 },
            { id: 'accounts', label: '🔑 Accounts', always: stage === STAGES.tier2 },
            { id: 'documents', label: '📁 Documents', always: stage === STAGES.tier2 },
          ].filter(t => t.always).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '9px 8px', borderRadius: 6, border: 'none',
              background: activeTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeTab === t.id ? 'var(--text)' : 'var(--text-sub)',
              fontSize: 12, fontWeight: activeTab === t.id ? 500 : 400,
              cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Guide tab */}
        {activeTab === 'guide' && (
          <AfterIAmGonePage isBeneficiaryView={true} overrideSections={ownerGuide} />
        )}

        {/* Verify identity tab */}
        {activeTab === 'verify' && stage !== STAGES.tier2 && (
          <div>
            <div className="card-static" style={{ textAlign: 'center', padding: '40px 32px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🪪</div>
              <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 12 }}>
                Verify your identity
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 24px' }}>
                To access stored passwords and documents, we need to verify your identity. You'll need a valid photo ID (passport or driving licence) and 2–3 minutes.
              </p>

              {verifyStep === 'complete' && (
                <div style={{ color: 'var(--success)', marginBottom: 20 }}>
                  ✓ Identity submitted — verification usually takes a few minutes. Refresh the page once complete.
                </div>
              )}

              {verifyStep === 'error' && (
                <div style={{ color: 'var(--danger)', marginBottom: 20 }}>
                  Verification failed. Please try again or contact support@digitalrelative.co.uk
                </div>
              )}

              {verifyStep !== 'complete' && (
                <div style={{ textAlign: 'left', maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>First name</label>
                    <input className="input" placeholder="As it appears on your ID"
                      value={verifyForm.firstName}
                      onChange={e => setVerifyForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last name</label>
                    <input className="input" placeholder="As it appears on your ID"
                      value={verifyForm.lastName}
                      onChange={e => setVerifyForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                  <button className="btn-primary" onClick={startIdVerification}
                    disabled={loading || !verifyForm.firstName || !verifyForm.lastName}
                    style={{ padding: '14px', fontSize: 14, marginTop: 8 }}>
                    {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Start verification →'}
                  </button>
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 20 }}>
                Powered by Onfido · Bank-grade identity verification · Your ID is not stored by us
              </p>
            </div>
          </div>
        )}

        {/* Accounts tab — tier 2 only */}
        {activeTab === 'accounts' && stage === STAGES.tier2 && (
          <div className="card-static" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔑</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Account access</div>
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              Account credentials are encrypted with the vault owner's personal PIN. To access individual passwords, each one requires re-entry of the vault PIN by an authorised executor.
            </p>
            <p style={{ fontSize: 13, marginTop: 12, color: 'var(--gold)' }}>
              Please work with the estate solicitor or executor to access individual accounts.
            </p>
          </div>
        )}

        {/* Documents tab — tier 2 only */}
        {activeTab === 'documents' && stage === STAGES.tier2 && (
          <div className="card-static" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>Documents</div>
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              Document access coming soon. Identity verification complete — documents will be accessible here once the executor has approved release.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
