import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const FREQUENCIES = [14, 30, 60, 90]

export default function CheckInPage() {
  const { user, profile, updateProfile } = useAuth()
  const [checking, setChecking] = useState(false)
  const [freq, setFreq]         = useState(profile?.checkin_frequency_days || 30)

  const lastCheckin = profile?.last_checkin ? new Date(profile.last_checkin) : null
  const nextDue     = lastCheckin ? new Date(lastCheckin.getTime() + freq * 86400000) : null
  const daysUntil   = nextDue ? Math.max(0, Math.ceil((nextDue - Date.now()) / 86400000)) : null
  const isOverdue   = daysUntil === 0

  async function handleCheckIn() {
    setChecking(true)
    try {
      await updateProfile({ last_checkin: new Date().toISOString(), checkin_frequency_days: freq })
      toast.success('Check-in recorded — vault remains locked for beneficiaries')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setChecking(false)
    }
  }

  async function handleFreqChange(days) {
    setFreq(days)
    try {
      await updateProfile({ checkin_frequency_days: days })
    } catch {}
  }

  const statusColor = isOverdue ? 'var(--danger)' : daysUntil <= 7 ? 'var(--warning)' : 'var(--success)'

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Check-in</h1>
        <p className="page-sub">Confirm you're well to keep your vault locked for beneficiaries.</p>
      </div>

      {/* Status card */}
      <div className="fade-up-2 card-static" style={{
        borderColor: isOverdue ? 'rgba(224,82,82,0.3)' : 'var(--gold-border)',
        background: isOverdue ? 'var(--danger-dim)' : 'var(--gold-dim)',
        textAlign: 'center', padding: '44px 32px', marginBottom: 22,
      }}>
        <div style={{ fontSize: 52, marginBottom: 14, lineHeight: 1 }}>
          {isOverdue ? '⚠️' : daysUntil <= 7 ? '⏰' : '✅'}
        </div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: statusColor, marginBottom: 10 }}>
          {isOverdue ? 'Check-in overdue'
            : daysUntil <= 7 ? `Check-in due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
            : lastCheckin ? `You're up to date`
            : 'No check-in recorded yet'}
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: 14, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
          {lastCheckin
            ? `Last check-in: ${lastCheckin.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. ${isOverdue ? 'Beneficiaries will receive unlock invites soon.' : `Next due: ${nextDue.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}`
            : 'Complete your first check-in to activate the dead man\'s switch.'}
        </p>
        <button className="btn-primary" onClick={handleCheckIn} disabled={checking}
          style={{ padding: '14px 44px', fontSize: 15 }}>
          {checking ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "I'm well — check in now"}
        </button>
      </div>

      {/* Frequency settings */}
      <div className="fade-up-3 card-static" style={{ marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 16 }}>Check-in frequency</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14 }}>How often do you want to check in?</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FREQUENCIES.map(d => (
            <button key={d} onClick={() => handleFreqChange(d)} style={{
              padding: '9px 20px', borderRadius: 'var(--r)', fontSize: 13,
              background: freq === d ? 'var(--gold)' : 'transparent',
              color: freq === d ? '#0d1b2a' : 'var(--text-sub)',
              border: freq === d ? 'none' : '1px solid var(--border-md)',
              cursor: 'pointer', fontFamily: 'var(--sans)', fontWeight: freq === d ? 500 : 400,
              transition: 'all 0.15s',
            }}>{d} days</button>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="fade-up-4 card-static">
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 14 }}>How the switch works</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['1', 'Regular check-ins', `You check in every ${freq} days to confirm you're well. This can be from any device.`],
            ['2', 'Missed check-in reminders', `If you miss a check-in, we'll email you reminders at 3, 7, and 14 days after the due date.`],
            ['3', 'Beneficiary notification', `After ${freq} days with no response, your beneficiaries receive an encrypted invite to access your vault.`],
            ['4', 'Identity verification', 'Beneficiaries must verify their identity before vault contents are revealed.'],
          ].map(([n, title, desc]) => (
            <div key={n} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--gold)',
              }}>{n}</div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
