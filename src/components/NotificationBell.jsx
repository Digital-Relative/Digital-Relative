import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../hooks/useNotifications'

export default function NotificationBell({ onNav }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleAction(n) {
    markRead(n.id)
    if (n.action_url) {
      // Navigate to relevant section
      const map = {
        '/beneficiaries': 'beneficiaries',
        '/couples':       'couples',
        '/vault':         'vault',
        '/checkin':       'checkin',
      }
      const page = Object.entries(map).find(([k]) => n.action_url.includes(k))?.[1]
      if (page && onNav) onNav(page)
    }
    setOpen(false)
  }

  function typeIcon(type) {
    const icons = {
      checkin_due_soon:       '⏰',
      checkin_overdue:        '⚠️',
      entry_expiring:         '📅',
      new_device:             '💻',
      shared_link_accessed:   '🔗',
      beneficiary_confirmed:  '✅',
      couples_invite:         '💑',
    }
    return icons[type] || '🔔'
  }

  function typeBg(type) {
    if (type === 'checkin_overdue')      return 'rgba(224,82,82,0.08)'
    if (type === 'new_device')           return 'rgba(224,160,82,0.08)'
    if (type === 'checkin_due_soon')     return 'rgba(201,168,76,0.08)'
    return 'transparent'
  }

  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hrs  = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24)  return `${hrs}h ago`
    return `${days}d ago`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        position: 'relative', background: 'transparent', border: 'none',
        color: 'var(--text-sub)', fontSize: 18, cursor: 'pointer', padding: '4px',
        lineHeight: 1,
      }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: 'var(--danger)', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, width: 320, maxHeight: 400, overflowY: 'auto',
          background: '#0d1e30', border: '1px solid var(--border-md)',
          borderRadius: 'var(--rl)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 200,
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Notifications</div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--gold)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-sub)', fontSize: 13, fontFamily: 'var(--sans)' }}>
              No notifications
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id}
                style={{ background: typeBg(n.type) }} onClick={() => handleAction(n)} style={{
                padding: '12px 16px', cursor: 'pointer', transition: 'background 0.1s',
                background: n.read ? 'transparent' : 'rgba(201,168,76,0.05)',
                borderBottom: '1px solid var(--border)',
                borderLeft: n.read ? 'none' : '3px solid var(--gold)',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(201,168,76,0.05)'}>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 500, marginBottom: 3 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, marginBottom: 4 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-sub)', opacity: 0.7 }}>{timeAgo(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
