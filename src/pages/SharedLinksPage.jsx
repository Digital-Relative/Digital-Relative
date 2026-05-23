import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

function timeLeft(expiresAt) {
  const diff = new Date(expiresAt) - Date.now()
  if (diff <= 0) return 'Expired'
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `${days}d remaining`
  if (hrs >= 1)  return `${hrs}h remaining`
  return 'Less than 1h'
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date)
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  return `${days}d ago`
}

const TYPE_ICON = {
  entry:          '🔑',
  document:       '📄',
  family_profile: '👨‍👩‍👧‍👦',
}

export default function SharedLinksPage() {
  const { user } = useAuth()
  const [links, setLinks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('active') // active | expired | all

  useEffect(() => {
    if (!user) return
    supabase
      .from('shared_links')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLinks(data || []); setLoading(false) })
  }, [user])

  async function revoke(id) {
    if (!confirm('Revoke this link? Anyone who has it will no longer be able to access the content.')) return
    const { error } = await supabase
      .from('shared_links')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) { toast.error('Failed to revoke'); return }
    setLinks(prev => prev.map(l => l.id === id ? { ...l, revoked: true } : l))
    toast.success('Link revoked - it can no longer be accessed')
  }

  const isExpiredOrRevoked = (l) => l.revoked || new Date(l.expires_at) < new Date() || (l.one_time && l.view_count >= 1)

  const filtered = links.filter(l => {
    if (filter === 'active')  return !isExpiredOrRevoked(l)
    if (filter === 'expired') return isExpiredOrRevoked(l)
    return true
  })

  const activeCount = links.filter(l => !isExpiredOrRevoked(l)).length

  return (
    <div>
      <div className="fade-up page-header">
        <h1 className="page-title">Share links</h1>
        <p className="page-sub">{activeCount} active {activeCount === 1 ? 'link' : 'links'} · manage and revoke access</p>
      </div>

      {activeCount > 0 && (
        <div className="fade-up-2 card-static" style={{ borderColor: 'rgba(224,82,82,0.25)', background: 'rgba(224,82,82,0.05)', marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ fontSize: 13, color: 'var(--cream-dim)', lineHeight: 1.7 }}>
              Anyone with an active link can access that content. Revoke links you no longer need. Links expire automatically at their set time.
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="fade-up-2" style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--r)', padding: 4 }}>
        {[
          { id: 'active',  label: `Active (${links.filter(l => !isExpiredOrRevoked(l)).length})` },
          { id: 'expired', label: `Expired / revoked (${links.filter(l => isExpiredOrRevoked(l)).length})` },
          { id: 'all',     label: `All (${links.length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            flex: 1, padding: '8px', borderRadius: 6, border: 'none',
            background: filter === f.id ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: filter === f.id ? 'var(--text)' : 'var(--text-sub)',
            fontSize: 12, fontWeight: filter === f.id ? 500 : 400,
            cursor: 'pointer', fontFamily: 'var(--sans)', transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      <div className="fade-up-3">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🔗</div>
            <div className="empty-text">No {filter === 'active' ? 'active ' : ''}share links</div>
            <div>
              {filter === 'active'
                ? 'Click "Share" on any vault entry, document, or family profile to create a secure link'
                : 'Share links you create will appear here'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(link => {
              const expired  = isExpiredOrRevoked(link)
              const wasViewed = link.view_count > 0
              return (
                <div key={link.id} className="card-static" style={{
                  opacity: expired ? 0.6 : 1,
                  borderColor: expired ? 'var(--border)' : link.includes_password ? 'rgba(224,82,82,0.2)' : 'var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                      background: 'var(--navy-lt)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>{TYPE_ICON[link.content_type] || '🔗'}</div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>
                        {link.content_label}
                        {link.includes_password && <span style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 8 }}>· includes password</span>}
                        {link.pin_hash && <span style={{ fontSize: 11, color: 'var(--gold)', marginLeft: 8 }}>· PIN protected</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 6 }}>
                        Created {timeAgo(link.created_at)}
                        {link.one_time ? ' · One-time view' : ` · ${timeLeft(link.expires_at)}`}
                        {' · '}
                        {link.view_count === 0 ? 'Not yet viewed' : `Viewed ${link.view_count} time${link.view_count !== 1 ? 's' : ''}`}
                        {link.last_accessed_at ? ` · Last accessed ${timeAgo(link.last_accessed_at)}` : ''}
                      </div>

                      {/* Status badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {link.revoked && <span className="badge badge-danger">Revoked</span>}
                        {!link.revoked && new Date(link.expires_at) < new Date() && <span className="badge badge-muted">Expired</span>}
                        {!link.revoked && link.one_time && link.view_count >= 1 && <span className="badge badge-muted">Viewed</span>}
                        {!expired && <span className="badge badge-green">Active</span>}
                        {!expired && wasViewed && <span className="badge badge-muted">Accessed</span>}
                        {!expired && !wasViewed && <span className="badge badge-muted">Not yet opened</span>}
                      </div>
                    </div>

                    {!expired && (
                      <button className="btn-danger" style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}
                        onClick={() => revoke(link.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
