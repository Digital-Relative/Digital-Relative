import { useState } from 'react'

// Guided questions that map to pre-filled vault entry templates
const QUESTIONS = [
  {
    id: 'bank_account',
    icon: '🏦',
    question: 'Do you have a bank account or current account?',
    templates: [{ title: 'Bank account', category: 'banking', placeholder: 'e.g. Lloyds, Barclays, NatWest' }],
  },
  {
    id: 'savings',
    icon: '💰',
    question: 'Do you have a savings account or ISA?',
    templates: [{ title: 'Savings / ISA', category: 'banking', placeholder: 'e.g. Marcus, Nationwide Flex ISA' }],
  },
  {
    id: 'pension',
    icon: '📈',
    question: 'Do you have a workplace or personal pension?',
    templates: [
      { title: 'Workplace pension', category: 'investments', placeholder: 'e.g. Nest, Aviva, Legal & General' },
    ],
  },
  {
    id: 'life_insurance',
    icon: '🛡️',
    question: 'Do you have a life insurance or critical illness policy?',
    templates: [{ title: 'Life insurance', category: 'insurance', placeholder: 'e.g. Legal & General, Vitality' }],
  },
  {
    id: 'property',
    icon: '🏠',
    question: 'Do you own or rent a property?',
    templates: [{ title: 'Property', category: 'property', placeholder: 'Home address and mortgage provider' }],
  },
  {
    id: 'investments',
    icon: '📊',
    question: 'Do you have any investment accounts, stocks, or shares ISAs?',
    templates: [{ title: 'Investment account', category: 'investments', placeholder: 'e.g. Hargreaves Lansdown, Vanguard' }],
  },
  {
    id: 'will',
    icon: '📜',
    question: 'Have you made a will?',
    templates: [{ title: 'Will location', category: 'legal', placeholder: 'Where is the original will stored?' }],
  },
  {
    id: 'email',
    icon: '✉️',
    question: 'Do you have a primary email account your family should know about?',
    templates: [{ title: 'Primary email', category: 'email', placeholder: 'e.g. Gmail, Outlook' }],
  },
  {
    id: 'home_insurance',
    icon: '🏡',
    question: 'Do you have home insurance or contents insurance?',
    templates: [{ title: 'Home insurance', category: 'insurance', placeholder: 'e.g. Admiral, Direct Line' }],
  },
  {
    id: 'utilities',
    icon: '⚡',
    question: 'Do you manage any household utilities in your name?',
    templates: [
      { title: 'Gas & electricity', category: 'utilities', placeholder: 'e.g. Octopus, British Gas' },
      { title: 'Broadband', category: 'utilities', placeholder: 'e.g. BT, Sky, Virgin Media' },
    ],
  },
  {
    id: 'state_pension',
    icon: '🏛️',
    question: 'Are you receiving or entitled to a State Pension or other government benefit?',
    templates: [{ title: 'State Pension / NI record', category: 'government', placeholder: 'National Insurance number and DWP reference' }],
  },
  {
    id: 'medical',
    icon: '🏥',
    question: 'Are there any medical details your family would need to know?',
    templates: [{ title: 'GP / medical details', category: 'medical', placeholder: 'GP surgery, NHS number, medications' }],
  },
]

export default function VaultWizard({ onAddEntry, onClose }) {
  const [step, setStep]       = useState(0)  // question index
  const [answers, setAnswers] = useState({}) // { [questionId]: true | false }
  const [done, setDone]       = useState(false)

  const current = QUESTIONS[step]
  const isLast  = step === QUESTIONS.length - 1

  function answer(yes) {
    const next = { ...answers, [current.id]: yes }
    setAnswers(next)
    if (isLast) {
      setDone(true)
    } else {
      setStep(s => s + 1)
    }
  }

  function skip() {
    setDone(true)
  }

  // Build list of templates to add from yes answers
  const toAdd = QUESTIONS
    .filter(q => answers[q.id] === true)
    .flatMap(q => q.templates)

  if (done) return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 6 }}>
          {toAdd.length > 0 ? `${toAdd.length} entries to add` : 'Nothing to add'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
          {toAdd.length > 0
            ? 'Click each entry to open the vault form pre-filled with the title and category. Add the details from there.'
            : 'You answered no to everything - you can add entries manually from the vault any time.'}
        </p>
      </div>

      {toAdd.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {toAdd.map((t, i) => (
            <button key={i} onClick={() => { onAddEntry(t); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'rgba(201,168,76,0.06)', border: '1px solid var(--gold-border)',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--sans)',
                width: '100%',
              }}>
              <span style={{ fontSize: 18 }}>
                {QUESTIONS.find(q => q.templates.includes(t))?.icon || '🔑'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 2 }}>{t.placeholder}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--gold)' }}>Add</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn-ghost" onClick={onClose} style={{ width: '100%', fontSize: 13 }}>
        {toAdd.length > 0 ? 'Done for now' : 'Close'}
      </button>
    </div>
  )

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: 'var(--gold)',
            width: `${Math.round((step / QUESTIONS.length) * 100)}%`,
            transition: 'width 0.3s',
          }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-sub)', fontFamily: 'var(--sans)', flexShrink: 0 }}>
          {step + 1} / {QUESTIONS.length}
        </span>
      </div>

      {/* Question */}
      <div style={{ textAlign: 'center', padding: '8px 0 28px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>{current.icon}</div>
        <div style={{ fontSize: 16, color: 'var(--cream)', lineHeight: 1.6, fontFamily: 'var(--sans)' }}>
          {current.question}
        </div>
      </div>

      {/* Yes / No */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={() => answer(false)} className="btn-ghost" style={{ flex: 1, fontSize: 15, padding: 14 }}>
          No
        </button>
        <button onClick={() => answer(true)} className="btn-primary" style={{ flex: 1, fontSize: 15, padding: 14 }}>
          Yes
        </button>
      </div>

      <button onClick={skip} style={{
        width: '100%', background: 'transparent', border: 'none', color: 'var(--text-sub)',
        fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)', padding: '6px 0',
      }}>
        Skip remaining questions
      </button>
    </div>
  )
}
