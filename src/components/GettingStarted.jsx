import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Getting started checklist — shown after login until dismissed permanently
// Tracks real completion state from the DB where possible
// Dismissed state stored in profiles.getting_started_dismissed and getting_started_done_items

const CHECKLIST = [
  {
    id: 'vault_entry',
    icon: '🔐',
    title: 'Add your first vault entry',
    detail: 'Store a bank account, pension, or important login so your family can find it.',
    action: 'vault',
    actionLabel: 'Go to My Vault',
    critical: true,
  },
  {
    id: 'beneficiary',
    icon: '👤',
    title: 'Add a beneficiary',
    detail: 'Nominate who should have access to your vault. At least one person needs to be able to act on your behalf.',
    action: 'beneficiaries',
    actionLabel: 'Add beneficiary',
    critical: true,
  },
  {
    id: 'executor',
    icon: '⭐',
    title: 'Designate an executor',
    detail: 'Your executor is the trusted person who can submit a death certificate and trigger access for your beneficiaries.',
    action: 'beneficiaries',
    actionLabel: 'Designate executor',
    critical: true,
  },
  {
    id: 'will',
    icon: '📜',
    title: 'Record where your will is stored',
    detail: 'Add a vault entry with the location of your will and your solicitor\'s details. Without a will, inheritance rules may not match your wishes.',
    action: 'vault',
    actionLabel: 'Add vault entry',
    critical: true,
  },
  {
    id: 'after_i_am_gone',
    icon: '💛',
    title: 'Complete your After I\'m Gone guide',
    detail: 'Leave personal instructions for your family - funeral wishes, messages, what to do first. This is often the most important thing you can leave behind.',
    action: 'afteriamgone',
    actionLabel: 'Start the guide',
    critical: true,
  },
  {
    id: 'personal_message',
    icon: '✉️',
    title: 'Write a personal message to your family',
    detail: 'A letter or message in your own words. Often more meaningful than any list of instructions. Takes 5 minutes and means everything.',
    action: 'afteriamgone',
    actionLabel: 'Write message',
    critical: false,
  },
  {
    id: 'funeral_wishes',
    icon: '🌿',
    title: 'Record your funeral wishes',
    detail: 'Even brief notes - burial or cremation, a song you\'d like - relieve an enormous burden from your family at the hardest time.',
    action: 'afteriamgone',
    actionLabel: 'Record wishes',
    critical: false,
  },
  {
    id: 'checkin',
    icon: '◎',
    title: 'Set up your check-in',
    detail: 'The check-in protection ensures your beneficiaries are notified if you become incapacitated. Set your check-in frequency and start checking in regularly.',
    action: 'checkin',
    actionLabel: 'Set up check-in',
    critical: false,
  },
  {
    id: 'pension',
    icon: '💰',
    title: 'Add pension and investment details',
    detail: 'Pensions, ISAs, and investments are often the hardest assets for families to locate. Add a vault entry with your pension provider and policy number.',
    action: 'vault',
    actionLabel: 'Add vault entry',
    critical: false,
  },
  {
    id: 'insurance',
    icon: '🛡️',
    title: 'Record your life insurance',
    detail: 'Add your life insurance policy details and the insurer\'s claims contact. Many policies go unclaimed because families don\'t know they exist.',
    action: 'vault',
    actionLabel: 'Add vault entry',
    critical: false,
  },
  {
    id: 'property',
    icon: '🏠',
    title: 'Add property and mortgage details',
    detail: 'If you own property, add your mortgage provider, account number, and Land Registry title number. Include any tenancy agreements if renting.',
    action: 'vault',
    actionLabel: 'Add vault entry',
    critical: false,
  },
  {
    id: 'documents',
    icon: '📁',
    title: 'Upload key documents',
    detail: 'Upload your passport, birth certificate, marriage certificate, or other documents your family may need to prove identity and settle your estate.',
    action: 'documents',
    actionLabel: 'Upload documents',
    critical: false,
  },
  {
    id: 'family_info',
    icon: '👨‍👩‍👧‍👦',
    title: 'Add family and emergency contact details',
    detail: 'Record your GP, dentist, children\'s schools, and emergency contacts. Your family will need these immediately.',
    action: 'family',
    actionLabel: 'Add family details',
    critical: false,
  },
  {
    id: 'digital',
    icon: '📱',
    title: 'Add social media and digital accounts',
    detail: 'Facebook, Instagram, and email accounts need to be memorialised or closed. Add login details or nominated legacy contacts.',
    action: 'vault',
    actionLabel: 'Add vault entry',
    critical: false,
  },
]

export default function GettingStarted({ onNav, vaultEntryCount = 0, beneficiaryCount = 0, hasExecutor = false, hasCheckin = false, hasAfterIAmGone = false }) {
  const { user, profile } = useAuth()
  const [dismissed, setDismissed]       = useState(false)
  const [permanent, setPermanent]       = useState(false)
  const [minimised, setMinimised]       = useState(false)
  const [manualDone, setManualDone]     = useState({}) // items manually marked done
  const [saving, setSaving]             = useState(false)
  const [loaded, setLoaded]             = useState(false)

  // Load dismissed/manual state from profile
  useEffect(() => {
    if (!profile) return
    if (profile.getting_started_dismissed === true) {
      setPermanent(true)
      setDismissed(true)
    }
    // Convert array of done item IDs to object
    const doneObj = {}
    for (const id of (Array.isArray(profile.getting_started_done_items) ? profile.getting_started_done_items : [])) {
      doneObj[id] = true
    }
    setManualDone(doneObj)
    setLoaded(true)
  }, [profile])

  function dismissOnce() {
    setDismissed(true)
    setMinimised(false)
  }

  function dismissPermanently() {
    setDismissed(true)
    setPermanent(true)
    if (user?.id) supabase.from('profiles')
      .update({ getting_started_dismissed: true })
      .eq('id', user.id)
      .then(() => {}).catch(() => {})
  }

  function markDone(id) {
    const updated = { ...manualDone, [id]: true }
    setManualDone(updated)
    const doneIds = Object.keys(updated).filter(k => updated[k])
    supabase.from('profiles')
      .update({ getting_started_done_items: doneIds })
      .eq('id', user.id)
      .then(() => {})
  }

  function unmarkDone(id) {
    const updated = { ...manualDone }
    delete updated[id]
    setManualDone(updated)
    const doneIds = Object.keys(updated).filter(k => updated[k])
    supabase.from('profiles')
      .update({ getting_started_done_items: doneIds })
      .eq('id', user.id)
      .then(() => {})
  }

  // Derive automatic completion from props
  function isAutoComplete(id) {
    switch (id) {
      case 'vault_entry':    return vaultEntryCount > 0
      case 'beneficiary':    return beneficiaryCount > 0
      case 'executor':       return hasExecutor
      case 'checkin':        return hasCheckin
      case 'after_i_am_gone': return hasAfterIAmGone
      default: return false
    }
  }

  function isDone(id) {
    return isAutoComplete(id) || manualDone[id] === true
  }

  if (!loaded || dismissed || permanent) {
    // Show a tiny re-open badge if dismissed but not permanent
    if (dismissed && !permanent) {
      const remaining = CHECKLIST.filter(c => !isDone(c.id)).length
      if (remaining === 0) return null
      return (
        <button onClick={() => setDismissed(false)} style={{
          position: 'fixed', bottom: 90, right: 16, zIndex: 500,
          background: 'var(--gold)', color: '#0d1b2a',
          border: 'none', borderRadius: 99, padding: '8px 14px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'var(--sans)', boxShadow: '0 4px 16px rgba(201,168,76,0.3)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ☑ {remaining} setup task{remaining !== 1 ? 's' : ''} remaining
        </button>
      )
    }
    return null
  }

  const criticalItems = CHECKLIST.filter(c => c.critical)
  const otherItems    = CHECKLIST.filter(c => !c.critical)
  const totalDone     = CHECKLIST.filter(c => isDone(c.id)).length
  const totalItems    = CHECKLIST.length
  const pct           = Math.round((totalDone / totalItems) * 100)
  const allCriticalDone = criticalItems.every(c => isDone(c.id))

  return (
    <div style={{
      background: 'var(--navy-lt)', border: '1px solid var(--gold-border)',
      borderRadius: 14, marginBottom: 28, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16,
        borderBottom: minimised ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }} onClick={() => setMinimised(!minimised)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', margin: 0 }}>
              Getting started
            </h2>
            <span style={{
              fontSize: 11, background: allCriticalDone ? 'var(--success)' : 'var(--gold)',
              color: allCriticalDone ? 'white' : '#0d1b2a',
              padding: '2px 8px', borderRadius: 99, fontWeight: 600,
            }}>
              {totalDone}/{totalItems} complete
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
              width: `${pct}%`,
              background: allCriticalDone ? 'var(--success)' : 'var(--gold)',
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 18, color: 'var(--text-sub)', userSelect: 'none' }}>
            {minimised ? '▾' : '▴'}
          </span>
        </div>
      </div>

      {/* Content */}
      {!minimised && (
        <div style={{ padding: '0 24px 20px' }}>

          {/* Critical items */}
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
              Essential - do these first
            </div>
            {criticalItems.map(item => (
              <ChecklistRow key={item.id} item={item} done={isDone(item.id)}
                autoComplete={isAutoComplete(item.id)}
                onNav={onNav} onMarkDone={markDone} onUnmark={unmarkDone} />
            ))}
          </div>

          {/* Other items */}
          <div style={{ marginTop: 20, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
              Also recommended
            </div>
            {otherItems.map(item => (
              <ChecklistRow key={item.id} item={item} done={isDone(item.id)}
                autoComplete={isAutoComplete(item.id)}
                onNav={onNav} onMarkDone={markDone} onUnmark={unmarkDone} />
            ))}
          </div>

          {/* Footer actions */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={dismissOnce} style={{
              background: 'transparent', border: '1px solid var(--border-md)',
              borderRadius: 8, color: 'var(--text-sub)', padding: '8px 14px',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>
              Hide for now
            </button>
            <button onClick={dismissPermanently} style={{
              background: 'transparent', border: '1px solid var(--border-md)',
              borderRadius: 8, color: 'var(--text-sub)', padding: '8px 14px',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)',
            }}>
              Don't show again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChecklistRow({ item, done, autoComplete, onNav, onMarkDone, onUnmark }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      opacity: done ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Tick */}
      <button onClick={() => done && !autoComplete ? onUnmark(item.id) : !done ? onMarkDone(item.id) : null}
        title={done ? (autoComplete ? 'Completed automatically' : 'Click to unmark') : 'Mark as done'}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
          border: done ? 'none' : '2px solid var(--border-md)',
          background: done ? (autoComplete ? 'var(--success)' : 'var(--gold)') : 'transparent',
          cursor: autoComplete ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: 'white',
        }}>
        {done ? '✓' : ''}
      </button>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <div style={{
            fontSize: 13, fontWeight: 500,
            color: done ? 'var(--text-sub)' : 'var(--cream)',
            textDecoration: done ? 'line-through' : 'none',
            cursor: 'pointer', flex: 1,
          }} onClick={() => setExpanded(!expanded)}>
            {item.title}
          </div>
          <button onClick={() => setExpanded(!expanded)} style={{
            background: 'transparent', border: 'none', color: 'var(--text-sub)',
            fontSize: 12, cursor: 'pointer', padding: '0 4px',
          }}>{expanded ? '▴' : '▾'}</button>
        </div>

        {expanded && (
          <div style={{ marginTop: 8, paddingLeft: 24 }}>
            <p style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, margin: '0 0 10px' }}>
              {item.detail}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!done && (
                <button onClick={() => onNav(item.action)} style={{
                  background: 'var(--gold)', color: '#0d1b2a',
                  border: 'none', borderRadius: 7, padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                }}>
                  {item.actionLabel} →
                </button>
              )}
              {!done && (
                <button onClick={() => onMarkDone(item.id)} style={{
                  background: 'transparent', border: '1px solid var(--border-md)',
                  borderRadius: 7, padding: '7px 14px',
                  fontSize: 12, color: 'var(--text-sub)', cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                }}>
                  Mark as done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
