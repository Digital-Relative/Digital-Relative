import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Internal admin page for manual death certificate review
// Access: /admin/review?request={requestId}&token={per-request-review-token}
// The review token is generated per access request, stored in access_requests.review_token.
// It is single-use. The global ADMIN_SECRET_TOKEN env var is not used for access control.
// This page is not in the main nav — accessed only via email link

export default function AdminReviewPage() {
  const params    = new URLSearchParams(window.location.search)
  const requestId = params.get('request')
  const token     = params.get('token')

  const [request, setRequest]   = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [notes, setNotes]       = useState('')
  const [deciding, setDeciding] = useState(false)
  const [done, setDone]         = useState(null)

  useEffect(() => { if (requestId) loadRequest() }, [])

  async function loadRequest() {
    // Fetch request details via the edge function (token verified server-side)
    const { data, error } = await supabase.functions.invoke('emergency-access', {
      body: { action: 'admin_get', requestId },
      headers: { 'x-admin-token': token },
    })
    if (error || !data?.request) {
      setLoading(false)
      return
    }
    setRequest(data.request)

    // FIX MISC-1: Fetch document URL via edge function (service role), not anon client
    // The death-certificates bucket is private — signed URLs require service role
    if (data.certificateUrl) {
      // L-4 fix: signed URL returned directly from admin_get (5-minute expiry)
      setImageUrl(data.certificateUrl)
    }
    setLoading(false)
  }

  async function handleDecision(decision) {
    if (!notes && decision === 'reject') { toast.error('Please provide a reason for rejection'); return }
    setDeciding(true)
    try {
      const { error } = await supabase.functions.invoke('emergency-access', {
        body: { action: 'admin_review', requestId, decision, adminNotes: notes },
        headers: { 'x-admin-token': token },
      })
      if (error) throw error
      setDone(decision)
      toast.success(decision === 'approve' ? 'Access approved - beneficiaries notified' : 'Request rejected - submitter notified')
    } catch (err) {
      toast.error(err.message || 'Decision failed')
    } finally {
      setDeciding(false)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0d1b2a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spinner" /></div>
  }

  if (!request || !token) {
    return <div style={{ minHeight: '100vh', background: '#0d1b2a', color: '#dde5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>Invalid or expired review link</div>
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1b2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#dde5ee' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{done === 'approve' ? '✅' : '❌'}</div>
          <div style={{ fontSize: 20 }}>{done === 'approve' ? 'Access approved' : 'Request rejected'}</div>
          <div style={{ fontSize: 14, color: '#7a93aa', marginTop: 8 }}>Submitter has been notified by email</div>
        </div>
      </div>
    )
  }

  const isPDF = request.certificate_path?.endsWith('.pdf')

  return (
    <div style={{ minHeight: '100vh', background: '#0d1b2a', fontFamily: 'sans-serif', color: '#dde5ee', padding: '32px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: '#c9a84c', marginBottom: 4 }}>Digital Relative</div>
        <div style={{ fontSize: 12, color: '#7a93aa', marginBottom: 32 }}>Admin - Manual review</div>

        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Death certificate review</h1>
        <div style={{ fontSize: 13, color: '#7a93aa', marginBottom: 28 }}>Request ID: {requestId}</div>

        {/* Request details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            ['Status', request.status],
            ['Submitted', new Date(request.created_at).toLocaleString('en-GB')],
            ['Certificate type', request.certificate_type],
            ['Onfido confidence', request.onfido_confidence || 'Not checked'],
            ['Onfido extracted name', request.onfido_extracted_name || '-'],
            ['Onfido date extracted', request.onfido_extracted_date || '-'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#7a93aa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
              <div style={{ fontSize: 14 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Document viewer */}
        {imageUrl && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#7a93aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Uploaded document</div>
            {isPDF ? (
              <iframe src={imageUrl} style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }} title="Death certificate" />
            ) : (
              <img src={imageUrl} alt="Death certificate" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
            )}
            <a href={imageUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#c9a84c' }}>
              Open in new tab ↗
            </a>
          </div>
        )}

        {/* Admin notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#7a93aa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Notes (required for rejection, optional for approval)
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Document verified - name matches vault owner. OR: Document unclear - unable to read name."
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#dde5ee', padding: '12px 14px', fontSize: 13, fontFamily: 'sans-serif', resize: 'vertical', minHeight: 80, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Decision buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => handleDecision('approve')} disabled={deciding} style={{
            flex: 1, padding: '14px', background: '#4caf82', color: '#0d1b2a',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: deciding ? 'not-allowed' : 'pointer', fontFamily: 'sans-serif',
          }}>
            {deciding ? 'Processing…' : '✓ Approve - grant access'}
          </button>
          <button onClick={() => handleDecision('reject')} disabled={deciding} style={{
            flex: 1, padding: '14px', background: '#e05252', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: deciding ? 'not-allowed' : 'pointer', fontFamily: 'sans-serif',
          }}>
            {deciding ? 'Processing…' : '✗ Reject - request more info'}
          </button>
        </div>

        <div style={{ fontSize: 11, color: '#7a93aa', marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
          Approving will immediately grant vault access to all beneficiaries and send email notifications.<br />
          Rejecting will notify the submitter and ask them to provide better documentation.
        </div>
      </div>
    </div>
  )
}
