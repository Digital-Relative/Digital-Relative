import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AfterIAmGonePage from './AfterIAmGonePage'


// Pre-filled letter templates for notifying institutions
function LetterTemplates({ entries, beneficiary }) {
  const [copied, setCopied] = useState(null)
  const [selected, setSelected] = useState(null)

  const ownerName = beneficiary?.name || '[Deceased name]'
  const myName = 'Your name'

  // Generate letter for a specific vault entry
  function entryLetter(entry) {
    // Note: entry.username is encrypted ciphertext - never render it as an account number.
    // The beneficiary must locate the account number from statements or documentation.
    const account = 'Account reference: [please insert account number from enclosed documentation]'
    return `Dear Sir or Madam,

I am writing to notify you of the death of ${ownerName}, who passed away recently.

${account}

I am acting as [executor / next of kin] and am writing to request that you:
- Freeze the account immediately to prevent any further transactions
- Provide details of the account balance and any amounts owed
- Advise on your process for closing the account and releasing any funds

I am enclosing a certified copy of the death certificate. Please advise if you require any additional documentation such as a Grant of Probate or Letters of Administration.

Please correspond with me at the address below.

Yours faithfully,

${myName}
[Your address]
[Your phone number]
[Your email address]

Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }

  // Generic bereavement notification letter
  const genericLetter = `Dear Sir or Madam,

I am writing to notify you of the death of ${ownerName}, who passed away recently.

I am the [executor / next of kin] dealing with the estate. Please could you:

1. Note the death on your records
2. Freeze any accounts or direct debits
3. Advise what documentation you require to close accounts and release any funds

I will provide a certified copy of the death certificate. Please let me know if you require a Grant of Probate or Letters of Administration.

Yours faithfully,

${myName}
[Your address]
[Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}]`

  const templates = [
    { id: 'generic', label: 'Generic notification', icon: '✉️', text: genericLetter, detail: 'Use for any institution not listed below' },
    ...entries.slice(0, 8).map(e => ({
      id: e.id,
      label: e.title,
      icon: '🏦',
      text: entryLetter(e),
      detail: e.username ? `Includes account: ${e.username}` : 'Generic version - add account details',
    })),
  ]

  function copyLetter(id, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 6 }}>Letter templates</h2>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
          Pre-written letters for notifying banks, insurers, and other institutions. Click to preview, then copy and send on headed paper or email.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {templates.map(t => (
          <div key={t.id} className="card-static" style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => setSelected(selected === t.id ? null : t.id)}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{t.detail}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={ev => { ev.stopPropagation(); copyLetter(t.id, t.text) }} style={{
                  background: copied === t.id ? 'var(--success)' : 'var(--gold)',
                  border: 'none', borderRadius: 6, padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  color: '#0d1b2a', fontFamily: 'var(--sans)',
                }}>
                  {copied === t.id ? 'Copied!' : 'Copy'}
                </button>
                <span style={{ color: 'var(--text-sub)', fontSize: 12, alignSelf: 'center' }}>{selected === t.id ? '▴' : '▾'}</span>
              </div>
            </div>
            {selected === t.id && (
              <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <pre style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)', margin: 0 }}>
                  {t.text}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
        💡 Replace [Your name], [Your address] and other placeholders before sending. Send on headed paper where possible, or via recorded post. Keep copies of everything you send.
      </div>
    </div>
  )
}

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

const STAGES = {
  loading:      'loading',
  invalid:      'invalid',
  tier1:        'tier1',
  tier2:        'tier2',
}

// Which vault categories belong in which stage
const CATEGORY_STAGE = {
  banking:     'week',
  investments: 'month',
  insurance:   'month',
  utilities:   'month',
  digital:     'month',
  government:  'immediate',
  property:    'month',
  medical:     'immediate',
  legal:       'week',
  other:       'week',
}

// Fixed tasks every family should do, regardless of vault entries
const FIXED_TASKS = {
  immediate: [
    { id: 'fixed_death_cert',   title: 'Register the death', detail: 'A doctor issues the medical certificate. You must register the death at the local registry office within 5 days in England and Wales. You will receive the death certificate - you will need several copies.' },
    { id: 'fixed_tell_me_once', title: 'Use Tell Me Once', detail: 'Tell Me Once lets you notify multiple government organisations in a single step - HMRC, DWP, DVLA, passport office, council, and more. Available at gov.uk/tell-us-once after registering the death.', url: 'https://www.gov.uk/tell-us-once' },
    { id: 'fixed_funeral',      title: 'Arrange the funeral', detail: 'Contact a funeral director. Check the After I\'m Gone guide for any funeral wishes. The funeral can usually be held 1-2 weeks after the death certificate is issued.' },
  ],
  week: [
    { id: 'fixed_solicitor',    title: 'Contact a solicitor about probate', detail: 'If the estate is over roughly £5,000, you will likely need a grant of probate before you can access and distribute assets. A solicitor can advise whether this applies.', url: 'https://www.gov.uk/wills-probate-inheritance' },
    { id: 'fixed_dns',          title: 'Use the Death Notification Service', detail: 'Notify multiple banks and financial institutions in one go. Free service at deathnotificationservice.co.uk.', url: 'https://www.deathnotificationservice.co.uk' },
    { id: 'fixed_employer',     title: 'Notify their employer or workplace pension', detail: 'If they were still working, contact their employer. There may be a death in service benefit, final salary payment, or workplace pension to claim.' },
  ],
  month: [
    { id: 'fixed_hmrc',         title: 'Notify HMRC', detail: 'HMRC must be told about the death. Use Tell Me Once or call HMRC directly. A final tax return may be needed for the tax year in which they died.', url: 'https://www.gov.uk/tell-us-once' },
    { id: 'fixed_bereavement',  title: 'Check bereavement support entitlements', detail: 'You may be entitled to a Bereavement Support Payment if your partner died. Check eligibility at gov.uk.', url: 'https://www.gov.uk/bereavement-support-payment' },
    { id: 'fixed_mail',         title: 'Redirect their mail', detail: 'Set up a mail redirection via Royal Mail to catch any correspondence you might miss - bills, legal letters, insurance renewals.', url: 'https://www.royalmail.com/receiving-mail/redirection' },
    { id: 'fixed_register',     title: 'Register with the Bereavement Register', detail: 'Stop unwanted marketing mail being sent to them. Free at thebereavementregister.org.uk.', url: 'https://www.thebereavementregister.org.uk' },
  ],
}

export default function BeneficiaryPortal() {
  const token = new URLSearchParams(window.location.search).get('token')
  const [stage, setStage]             = useState(STAGES.loading)
  const [beneficiary, setBeneficiary] = useState(null)
  const [ownerGuide, setOwnerGuide]     = useState(null)
  const [personalMessage, setPersonalMessage] = useState('')
  const [funeralWishes, setFuneralWishes]     = useState(null)
  const [entries, setEntries]         = useState([])
  const [checkedOff, setCheckedOff]   = useState({})
  const [loading, setLoading]         = useState(false)
  const [activeTab, setActiveTab]     = useState('checklist')
  const [verifyForm, setVerifyForm]   = useState({ firstName: '', lastName: '' })
  const [verifyStep, setVerifyStep]   = useState('form')

  useEffect(() => { loadToken() }, [])

  async function loadToken() {
    if (!token) { setStage(STAGES.invalid); return }

    // C-1 fix: use edge function with service role key instead of direct anon queries
    const { data, error } = await supabase.functions.invoke('beneficiary-access', {
      body: { token },
    })

    if (error || !data || data.error) { setStage(STAGES.invalid); return }

    const { beneficiary, guide, vaultEntries, isTier2 } = data

    setBeneficiary(beneficiary)
    if (guide && typeof guide === 'object' && 'sections' in guide) {
      setOwnerGuide(guide.sections)
      setPersonalMessage(guide.personalMessage || '')
      setFuneralWishes(guide.funeralWishes || null)
    } else {
      setOwnerGuide(guide)
    }
    setEntries(vaultEntries || [])

    try {
      const saved = JSON.parse(sessionStorage.getItem('dr_checklist_' + beneficiary.id) || '{}')
      setCheckedOff(saved)
    } catch {}

    setStage(isTier2 ? STAGES.tier2 : STAGES.tier1)
  }

  function toggleCheck(id) {
    const next = { ...checkedOff, [id]: !checkedOff[id] }
    if (!next[id]) delete next[id]
    setCheckedOff(next)
    try { sessionStorage.setItem('dr_checklist_' + beneficiary?.id, JSON.stringify(next)) } catch {}
  }

  function parseBereaveFromNotes(notes) {
    if (!notes) return null
    const lines = notes.split('\n')
    const bereaveIdx = lines.findIndex(l => l.includes('Bereavement contact'))
    if (bereaveIdx === -1) return null
    const phone = lines.find(l => l.startsWith('Phone:'))?.replace('Phone:', '').trim()
    const url   = lines.find(l => l.startsWith('More info:'))?.replace('More info:', '').trim()
    const note  = lines[bereaveIdx + 1] && !lines[bereaveIdx + 1].startsWith('Phone:') && !lines[bereaveIdx + 1].startsWith('More info:')
      ? lines[bereaveIdx + 1].trim() : null
    return { phone, url, note }
  }

  async function startIdVerification() {
    if (!verifyForm.firstName || !verifyForm.lastName) return
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-identity', {
        body: { beneficiaryId: beneficiary.id, firstName: verifyForm.firstName, lastName: verifyForm.lastName, email: beneficiary.email },
      })
      if (error || !data?.sdkToken) throw new Error('Verification service unavailable')
      setVerifyStep('processing')
      if (!document.querySelector('#onfido-sdk')) {
        const script = document.createElement('script')
        script.id = 'onfido-sdk'
        script.src = 'https://assets.onfido.com/web-sdk-releases/14.15.0/onfido.min.js'
        script.crossOrigin = 'anonymous'
        document.head.appendChild(script)
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = 'https://assets.onfido.com/web-sdk-releases/14.15.0/style.css'
        document.head.appendChild(link)
        await new Promise(resolve => script.onload = resolve)
      }
      const onfidoEl = document.createElement('div')
      onfidoEl.id = 'onfido-mount'
      document.body.appendChild(onfidoEl)
      window.Onfido.init({
        token: data.sdkToken, containerId: 'onfido-mount', useModal: true, isModalOpen: true,
        onModalRequestClose: () => setVerifyStep('form'),
        steps: ['welcome', 'document', 'face', 'complete'],
        onComplete: async () => {
          await supabase.functions.invoke('verify-identity', {
            body: { beneficiaryId: beneficiary.id, applicantId: data.applicantId, action: 'complete_check' },
          })
          setVerifyStep('complete')
          setTimeout(() => loadToken(), 3000)
        },
        onError: () => setVerifyStep('error'),
      })
    } catch {
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
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 10 }}>Invalid or expired link</h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>
            This access link is not valid. It may have expired or already been used. Please contact the estate executor for a new link.
          </p>
        </div>
      </div>
    )
  }

  // Slot vault entries into stages
  const entriesByStage = { immediate: [], week: [], month: [] }
  for (const entry of entries) {
    const s = CATEGORY_STAGE[entry.category] || 'week'
    entriesByStage[s].push(entry)
  }

  const totalItems = Object.values(FIXED_TASKS).flat().length + entries.length
  const totalDone  = Object.keys(checkedOff).filter(k => checkedOff[k]).length
  const pct        = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      {/* Header */}
      <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <TreeLogo size={32} />
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)' }}>Digital Relative</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>Beneficiary access portal</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-sub)', textAlign: 'right' }}>
          <div>Accessing vault for</div>
          <strong style={{ color: 'var(--text)' }}>{beneficiary?.name}</strong>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>

        {/* Condolences */}
        <div className="card-static fade-up" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 20, textAlign: 'center', padding: '24px 28px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>We're sorry for your loss</div>
          <p style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.8, maxWidth: 500, margin: '0 auto' }}>
            This portal is here to help. Take everything at your own pace. You do not need to do everything at once.
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-sub)', marginBottom: 6 }}>
            <span>Estate administration progress</span>
            <span>{totalDone} of {totalItems} tasks done</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--success)', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
          {[
            { id: 'checklist', label: '☑ What to do' },
            { id: 'guide',     label: '💛 Their guide' },
            { id: 'verify',    label: stage === STAGES.tier2 ? '✓ Verified' : '🪪 Verify identity' },
            { id: 'letters',   label: '✉️ Letter templates' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '9px 8px', borderRadius: 6, border: 'none',
              background: activeTab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeTab === t.id ? 'var(--text)' : 'var(--text-sub)',
              fontSize: 12, fontWeight: activeTab === t.id ? 500 : 400,
              cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── CHECKLIST TAB ── */}
        {activeTab === 'checklist' && (
          <div>
            {/* Tier 1 notice */}
            {stage === STAGES.tier1 && (
              <div style={{
                background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 20,
                fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.6,
              }}>
                Bereavement contact numbers are shown below. <button onClick={() => setActiveTab('verify')} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 13, padding: 0 }}>Verify your identity</button> to also see account usernames and notes.
              </div>
            )}

            {/* Immediate stage */}
            <StageSection
              label="Immediate" icon="⚡" color="#e05252"
              description="Do these within the first 48 hours"
              fixedTasks={FIXED_TASKS.immediate}
              vaultEntries={entriesByStage.immediate}
              stage={stage} checkedOff={checkedOff} toggleCheck={toggleCheck}
              parseBereaveFromNotes={parseBereaveFromNotes}
            />

            {/* First week stage */}
            <StageSection
              label="First week" icon="📅" color="var(--gold)"
              description="Work through these in the first week"
              fixedTasks={FIXED_TASKS.week}
              vaultEntries={entriesByStage.week}
              stage={stage} checkedOff={checkedOff} toggleCheck={toggleCheck}
              parseBereaveFromNotes={parseBereaveFromNotes}
            />

            {/* First month stage */}
            <StageSection
              label="First month" icon="🗓️" color="var(--text-sub)"
              description="These can wait until you are ready"
              fixedTasks={FIXED_TASKS.month}
              vaultEntries={entriesByStage.month}
              stage={stage} checkedOff={checkedOff} toggleCheck={toggleCheck}
              parseBereaveFromNotes={parseBereaveFromNotes}
            />

            {/* Helpful links */}
            <div style={{ marginTop: 28, padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sub)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Helpful services</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  ['Tell Me Once', 'https://www.gov.uk/tell-us-once'],
                  ['Death Notification Service', 'https://www.deathnotificationservice.co.uk'],
                  ['Bereavement Register', 'https://www.thebereavementregister.org.uk'],
                  ['Cruse Bereavement Support', 'https://www.cruse.org.uk'],
                  ['Citizens Advice', 'https://www.citizensadvice.org.uk/family/death-and-wills/'],
                  ['GOV.UK Probate', 'https://www.gov.uk/wills-probate-inheritance'],
                ].map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 12, color: 'var(--gold)', textDecoration: 'none',
                    background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
                    borderRadius: 6, padding: '5px 10px',
                  }}>{label} →</a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── GUIDE TAB ── */}
        {activeTab === 'guide' && (
          <div>
            {personalMessage && (
              <div className="card-static" style={{ marginBottom: 18, borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)', marginBottom: 10 }}>A message for you</div>
                <p style={{ fontSize: 14, color: 'var(--cream-dim)', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{personalMessage}</p>
              </div>
            )}
            {funeralWishes && (funeralWishes.type || funeralWishes.music || funeralWishes.readings || funeralWishes.otherWishes) && (
              <div className="card-static" style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--cream)', marginBottom: 12 }}>🌿 Funeral wishes</div>
                {funeralWishes.type && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Burial/cremation: </span><strong>{funeralWishes.type}</strong></div>}
                {funeralWishes.music && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Music: </span>{funeralWishes.music}</div>}
                {funeralWishes.readings && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Readings: </span>{funeralWishes.readings}</div>}
                {funeralWishes.funeralHome && <div style={{ marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Funeral home: </span>{funeralWishes.funeralHome}</div>}
                {funeralWishes.otherWishes && <div><span style={{ fontSize: 12, color: 'var(--text-sub)' }}>Other wishes: </span>{funeralWishes.otherWishes}</div>}
              </div>
            )}
            <AfterIAmGonePage isBeneficiaryView={true} overrideSections={ownerGuide} overridePersonalMessage={personalMessage} overrideFuneralWishes={funeralWishes} />
          </div>
        )}

        {/* ── LETTERS TAB ── */}
        {activeTab === 'letters' && (
          <LetterTemplates entries={entries} beneficiary={beneficiary} />
        )}

        {/* ── VERIFY TAB ── */}
        {activeTab === 'verify' && (
          <div>
            {stage === STAGES.tier2 ? (
              <div className="card-static" style={{ textAlign: 'center', padding: '40px 32px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--success)', marginBottom: 8 }}>Identity verified</h2>
                <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  You have full access to account details and notes in the checklist.
                </p>
              </div>
            ) : (
              <div className="card-static" style={{ textAlign: 'center', padding: '40px 32px' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🪪</div>
                <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 10 }}>Verify your identity</h2>
                <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto 24px' }}>
                  To see account usernames and full notes, verify your identity. You will need a valid photo ID and 2-3 minutes.
                </p>
                {verifyStep === 'complete' && <div style={{ color: 'var(--success)', marginBottom: 16 }}>Submitted. Verification usually takes a few minutes.</div>}
                {verifyStep === 'error'    && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>Verification failed. Try again or contact support@digitalrelative.co.uk</div>}
                {verifyStep !== 'complete' && (
                  <div style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)', marginBottom: 5 }}>First name</label>
                      <input className="input" placeholder="As on your ID" value={verifyForm.firstName} onChange={e => setVerifyForm(f => ({ ...f, firstName: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sub)', marginBottom: 5 }}>Last name</label>
                      <input className="input" placeholder="As on your ID" value={verifyForm.lastName} onChange={e => setVerifyForm(f => ({ ...f, lastName: e.target.value }))} />
                    </div>
                    <button className="btn-primary" onClick={startIdVerification} disabled={loading || !verifyForm.firstName || !verifyForm.lastName} style={{ padding: 14 }}>
                      {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Start verification →'}
                    </button>
                  </div>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 20 }}>Powered by Onfido. Your ID is not stored by us.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stage section component ───────────────────────────────────────────────────
function StageSection({ label, icon, color, description, fixedTasks, vaultEntries, stage, checkedOff, toggleCheck, parseBereaveFromNotes }) {
  const [collapsed, setCollapsed] = useState(false)
  const allItems = [...fixedTasks, ...vaultEntries]
  const doneCount = allItems.filter(t => checkedOff[t.id]).length

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Stage header */}
      <button onClick={() => setCollapsed(!collapsed)} style={{
        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
        cursor: 'pointer', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{doneCount}/{allItems.length} done</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>{description}</div>
        </div>
        <span style={{ color: 'var(--text-sub)', fontSize: 14, transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'none' }}>▾</span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Fixed tasks */}
          {fixedTasks.map(task => (
            <TaskRow key={task.id} id={task.id} title={task.title} detail={task.detail}
              url={task.url} done={!!checkedOff[task.id]} onToggle={toggleCheck}
              isFixed={true} />
          ))}

          {/* Vault entries for this stage */}
          {vaultEntries.map(entry => {
            const bereave   = parseBereaveFromNotes(entry.notes)
            const notesText = stage === 'tier2' && entry.notes
              ? entry.notes.split('\nBereavement contact')[0].trim() : null

            return (
              <VaultEntryRow key={entry.id} entry={entry} done={!!checkedOff[entry.id]}
                onToggle={toggleCheck} bereave={bereave} notesText={notesText}
                showDetails={stage === STAGES.tier2} />
            )
          })}

          {allItems.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-sub)', padding: '10px 0', fontStyle: 'italic' }}>
              No items in this stage.
            </div>
          )}
        </div>
      )}
      <div style={{ height: 1, background: 'var(--border)', marginTop: 16 }} />
    </div>
  )
}

// ── Fixed task row ────────────────────────────────────────────────────────────
function TaskRow({ id, title, detail, url, done, onToggle, isFixed }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: done ? 'rgba(76,175,130,0.04)' : 'var(--navy-lt)',
      border: `1px solid ${done ? 'rgba(76,175,130,0.2)' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px', opacity: done ? 0.7 : 1, transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <button onClick={() => onToggle(id)} style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
          border: done ? 'none' : '2px solid var(--border-md)',
          background: done ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'white',
        }}>{done ? '✓' : ''}</button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: done ? 'var(--text-sub)' : 'var(--cream)',
              textDecoration: done ? 'line-through' : 'none',
              cursor: 'pointer', flex: 1,
            }} onClick={() => setExpanded(!expanded)}>
              {title}
            </span>
            <button onClick={() => setExpanded(!expanded)} style={{
              background: 'transparent', border: 'none', color: 'var(--text-sub)',
              cursor: 'pointer', fontSize: 12, padding: '0 4px', flexShrink: 0,
            }}>{expanded ? '▴' : '▾'}</button>
          </div>

          {expanded && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, margin: '0 0 8px' }}>{detail}</p>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12, color: 'var(--gold)', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>🔗 Go to service →</a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Vault entry row ───────────────────────────────────────────────────────────
function VaultEntryRow({ entry, done, onToggle, bereave, notesText, showDetails }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: done ? 'rgba(76,175,130,0.04)' : 'var(--navy-lt)',
      border: `1px solid ${done ? 'rgba(76,175,130,0.2)' : 'var(--border)'}`,
      borderLeft: bereave?.phone ? '3px solid var(--gold)' : undefined,
      borderRadius: 10, padding: '14px 16px', opacity: done ? 0.7 : 1, transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <button onClick={() => onToggle(entry.id)} style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
          border: done ? 'none' : '2px solid var(--border-md)',
          background: done ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'white',
        }}>{done ? '✓' : ''}</button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13, fontWeight: 600, flex: 1,
              color: done ? 'var(--text-sub)' : 'var(--cream)',
              textDecoration: done ? 'line-through' : 'none',
              cursor: 'pointer',
            }} onClick={() => setExpanded(!expanded)}>
              {entry.title}
            </span>
            <span className="badge badge-muted" style={{ fontSize: 10 }}>{entry.category}</span>
            <button onClick={() => setExpanded(!expanded)} style={{
              background: 'transparent', border: 'none', color: 'var(--text-sub)',
              cursor: 'pointer', fontSize: 12, padding: '0 4px',
            }}>{expanded ? '▴' : '▾'}</button>
          </div>

          {/* Always show bereavement contact if available */}
          {bereave && (bereave.phone || bereave.url) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {bereave.phone && (
                <a href={`tel:${bereave.phone.replace(/\s/g, '')}`} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  color: 'var(--gold)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
                }}>
                  📞 {bereave.phone}
                </a>
              )}
              {bereave.url && (
                <a href={bereave.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--text-sub)', textDecoration: 'none', fontSize: 12,
                }}>
                  🔗 Bereavement page
                </a>
              )}
            </div>
          )}

          {/* Expanded details - tier 2 only */}
          {expanded && (
            <div style={{ marginTop: 10 }}>
              {showDetails && entry.username && (
                <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 6 }}>
                  Account:{' '}
                  {entry.username.includes('@') ? (
                    <a href={`mailto:${entry.username}`} style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                      ✉️ {entry.username}
                    </a>
                  ) : (
                    <strong style={{ color: 'var(--text)' }}>{entry.username}</strong>
                  )}
                </div>
              )}
              {bereave?.note && (
                <p style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.7, margin: '0 0 6px' }}>{bereave.note}</p>
              )}
              {showDetails && notesText && (
                <p style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, margin: 0 }}>{notesText}</p>
              )}
              {!showDetails && !bereave && (
                <p style={{ fontSize: 12, color: 'var(--text-sub)', fontStyle: 'italic' }}>Verify identity to see account details.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
