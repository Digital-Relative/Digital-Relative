import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Status options for each task
const STATUS = {
  pending:     { label: 'To do',      color: 'var(--text-sub)',  bg: 'rgba(255,255,255,0.04)' },
  inProgress:  { label: 'In progress', color: 'var(--gold)',      bg: 'var(--gold-dim)' },
  done:        { label: 'Done',        color: 'var(--success)',   bg: 'rgba(76,175,130,0.12)' },
  notRequired: { label: 'N/A',         color: 'var(--text-sub)',  bg: 'rgba(255,255,255,0.03)' },
}

// Executor-specific fixed tasks grouped by category
const EXECUTOR_TASKS = [
  {
    group: 'Legal and probate',
    icon: '⚖️',
    tasks: [
      { id: 'locate_will',       label: 'Locate original will and codicils' },
      { id: 'probate_required',  label: 'Determine if probate is required' },
      { id: 'apply_probate',     label: 'Apply for Grant of Probate / Letters of Administration' },
      { id: 'death_cert_copies', label: 'Obtain at least 10 certified death certificate copies' },
      { id: 'legal_advice',      label: 'Consider appointing a solicitor' },
    ],
  },
  {
    group: 'Financial accounts',
    icon: '🏦',
    tasks: [
      { id: 'bank_freeze',        label: 'Notify banks and freeze/close accounts' },
      { id: 'collect_assets',     label: 'Collect and value all assets' },
      { id: 'estate_account',     label: 'Open an executor bank account for the estate' },
      { id: 'pension_claims',     label: 'Claim any pension death benefits' },
      { id: 'life_insurance',     label: 'Claim life insurance policies' },
      { id: 'investments',        label: 'Transfer or liquidate investments' },
    ],
  },
  {
    group: 'Tax and HMRC',
    icon: '📊',
    tasks: [
      { id: 'hmrc_notify',       label: 'Notify HMRC and submit final tax return' },
      { id: 'iht_assess',        label: 'Assess inheritance tax liability' },
      { id: 'iht_pay',           label: 'Pay any inheritance tax (due before probate)' },
      { id: 'capital_gains',     label: 'Consider capital gains on estate sales' },
    ],
  },
  {
    group: 'Property',
    icon: '🏠',
    tasks: [
      { id: 'property_value',    label: 'Value all property' },
      { id: 'property_insure',   label: 'Ensure property remains insured' },
      { id: 'property_transfer', label: 'Transfer or sell property' },
      { id: 'tenancy_end',       label: 'End any tenancy agreements' },
    ],
  },
  {
    group: 'Distribution',
    icon: '📋',
    tasks: [
      { id: 'identify_bens',     label: 'Identify all beneficiaries and their entitlements' },
      { id: 'notify_bens',       label: 'Notify all beneficiaries of their inheritance' },
      { id: 'settle_debts',      label: 'Pay all outstanding debts and liabilities' },
      { id: 'distribute',        label: 'Distribute the estate to beneficiaries' },
      { id: 'final_accounts',    label: 'Prepare and distribute final estate accounts' },
      { id: 'record_keep',       label: 'Keep records of all executor decisions and transactions' },
      { id: 'claim_expenses',    label: 'Claim any reasonable executor expenses from the estate' },
    ],
  },
]

function StatusPill({ status, onChange }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={status}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', background: s.bg, border: `1px solid ${s.color}33`,
          borderRadius: 99, color: s.color, fontSize: 11, fontWeight: 500,
          padding: '3px 24px 3px 10px', cursor: 'pointer', fontFamily: 'var(--sans)',
        }}
      >
        {Object.entries(STATUS).map(([key, val]) => (
          <option key={key} value={key}>{val.label}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 9, color: s.color }}>▼</span>
    </div>
  )
}

export default function ExecutorDashboard({ entries, beneficiaryId }) {
  const [statuses, setStatuses]     = useState({})
  const [notes, setNotes]           = useState({})
  const [serverLoaded, setServerLoaded] = useState(false)
  const saveTimer = useRef(null)

  // LOW-3 fix: clear debounce timer on unmount to prevent state update after unmount
  useEffect(() => { return () => clearTimeout(saveTimer.current) }, [])

  // Load from server on mount
  useEffect(() => {
    if (!beneficiaryId) return
    supabase.from('executor_progress')
      .select('task_statuses, task_notes')
      .eq('beneficiary_id', beneficiaryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setStatuses(data.task_statuses || {})
          setNotes(data.task_notes || {})
        }
        setServerLoaded(true)
      })
  }, [beneficiaryId])
  const [editingNote, setEditingNote] = useState(null)
  const [noteText, setNoteText]       = useState('')
  const [filter, setFilter]           = useState('all')

  function saveToServer(newStatuses, newNotes) {
    if (!beneficiaryId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from('executor_progress').upsert({
        beneficiary_id: beneficiaryId,
        task_statuses:  newStatuses,
        task_notes:     newNotes,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'beneficiary_id' }).catch(() => {})
    }, 800)
  }

  function setStatus(id, status) {
    const next = { ...statuses, [id]: status }
    setStatuses(next)
    saveToServer(next, notes)
  }

  function saveNote(id) {
    const next = { ...notes, [id]: noteText }
    setNotes(next)
    setEditingNote(null)
    saveToServer(statuses, next)
  }

  const allTasks  = EXECUTOR_TASKS.flatMap(g => g.tasks)
  const doneTasks = allTasks.filter(t => statuses[t.id] === 'done').length
  const pct       = Math.round((doneTasks / allTasks.length) * 100)

  // Vault entries that are relevant to executor (financial, property, legal, investments)
  const relevantEntries = (entries || []).filter(e =>
    ['banking', 'investments', 'property', 'legal', 'insurance'].includes(e.category)
  )

  return (
    <div>
      {/* Progress overview */}
      <div className="card-static" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)' }}>
            Executor progress
            {!serverLoaded && <span style={{ fontSize: 11, color: 'var(--text-sub)', marginLeft: 8, fontFamily: 'var(--sans)' }}>Loading...</span>}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{pct}%</div>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 8 }}>
          {doneTasks} of {allTasks.length} tasks complete
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['all', 'pending', 'inProgress', 'done'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
            fontFamily: 'var(--sans)', border: '1px solid',
            borderColor: filter === f ? 'var(--gold-border)' : 'var(--border)',
            background:  filter === f ? 'var(--gold-dim)' : 'transparent',
            color:       filter === f ? 'var(--gold)' : 'var(--text-sub)',
          }}>
            {f === 'all' ? 'All' : STATUS[f]?.label}
          </button>
        ))}
      </div>

      {/* Task groups */}
      {EXECUTOR_TASKS.map(group => {
        const filtered = group.tasks.filter(t =>
          filter === 'all' || (statuses[t.id] || 'pending') === filter
        )
        if (!filtered.length) return null
        return (
          <div key={group.group} className="card-static" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>{group.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--cream)' }}>{group.group}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(task => {
                const s = statuses[task.id] || 'pending'
                const n = notes[task.id]
                return (
                  <div key={task.id} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: s === 'done' ? 'rgba(76,175,130,0.06)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 13, color: s === 'done' ? 'var(--text-sub)' : 'var(--cream-dim)',
                          textDecoration: s === 'done' ? 'line-through' : 'none', lineHeight: 1.5,
                        }}>{task.label}</div>
                        {n && (
                          <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 4, fontStyle: 'italic' }}>{n}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => { setEditingNote(task.id); setNoteText(n || '') }}
                          title="Add note"
                          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-sub)', fontSize: 11, padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                          {n ? '📝' : '+ Note'}
                        </button>
                        <StatusPill status={s} onChange={v => setStatus(task.id, v)} />
                      </div>
                    </div>
                    {editingNote === task.id && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                        <input className="input" style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                          placeholder="Add a note..." value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveNote(task.id)}
                          autoFocus />
                        <button onClick={() => saveNote(task.id)} className="btn-primary"
                          style={{ fontSize: 11, padding: '6px 12px' }}>Save</button>
                        <button onClick={() => setEditingNote(null)} className="btn-ghost"
                          style={{ fontSize: 11, padding: '6px 10px' }}>Cancel</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Relevant vault entries */}
      {relevantEntries.length > 0 && (
        <div className="card-static" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cream)', marginBottom: 12 }}>
            Relevant accounts from vault
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 10, lineHeight: 1.5 }}>
            These accounts may need to be notified or closed as part of estate administration.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {relevantEntries.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--cream-dim)' }}>{e.title}</div>
                  {e.username && <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{e.username}</div>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-sub)', textTransform: 'capitalize' }}>{e.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--cream)' }}>Important:</strong> This checklist is a guide only. Consider appointing a solicitor for complex estates. Seek professional advice for tax matters. Progress is saved to the server and will persist across sessions and devices.
      </div>
    </div>
  )
}
