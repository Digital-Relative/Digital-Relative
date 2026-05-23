import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// Standalone page — accessed by executors via beneficiary portal
// URL: /emergency-access?vault=ownerUserId&ben=beneficiaryId

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

const CERT_TYPES = [
  { id: 'death_certificate',    label: 'Death certificate',     detail: 'Official death certificate from a register office' },
  { id: 'medical_certificate',  label: 'Medical certificate',   detail: 'Certificate from a doctor or hospital confirming death' },
  { id: 'court_order',          label: 'Court order',           detail: 'Probate or court order granting estate access' },
  { id: 'other',                label: 'Other document',        detail: 'Any other official document confirming the death' },
]

function TreeLogo({ size = 32 }) {
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

export default function EmergencyAccessPage() {
  const params      = new URLSearchParams(window.location.search)
  const vaultOwnerId  = params.get('vault')
  const beneficiaryId = params.get('ben')

  const [step, setStep]         = useState('intro') // intro | upload | submitting | done | error
  const [certType, setCertType] = useState('death_certificate')
  const [file, setFile]         = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const inputRef = useRef(null)

  if (!vaultOwnerId || !beneficiaryId) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 10 }}>Invalid link</h1>
          <p style={{ fontSize: 14, color: 'var(--text-sub)' }}>This link is not valid. Please use the link from your beneficiary portal.</p>
        </div>
      </div>
    )
  }

  function handleFileSelect(f) {
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) { toast.error('Please upload a PDF or image file'); return }
    if (f.size > MAX_FILE_SIZE) { toast.error('File too large - maximum 25MB'); return }
    if (f.size === 0) { toast.error('File appears to be empty'); return }
    setFile(f)
  }

  async function handleSubmit() {
    if (!file) { toast.error('Please upload a document first'); return }
    setLoading(true)
    setStep('submitting')
    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const { data, error } = await supabase.functions.invoke('emergency-access', {
        body: {
          action:           'submit',
          beneficiaryId,
          vaultOwnerId,
          certificateBase64: base64,
          fileType:         file.type,
          certificateType:  certType,
        },
      })

      if (error) throw error
      setResult(data)
      setStep('done')
    } catch (err) {
      toast.error(err.message || 'Submission failed - please try again')
      setStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const wrapStyle = { minHeight: '100vh', background: 'var(--navy)', fontFamily: 'var(--sans)' }

  return (
    <div style={wrapStyle}>
      {/* Header */}
      <div style={{ background: '#07111c', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TreeLogo />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--gold)' }}>Digital Relative</span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-sub)' }}>Emergency access request</div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>

        {step === 'intro' && (
          <div className="fade-up">
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
              <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, color: 'var(--cream)', marginBottom: 10 }}>
                Request emergency access
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
                We're sorry for your loss. As the designated executor, you can request immediate access to this vault by providing an official document confirming the death.
              </p>
            </div>

            {/* What happens */}
            <div className="card-static" style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginBottom: 16 }}>What happens next</h3>
              {[
                { n: '1', title: 'You upload a document', detail: 'A death certificate, medical certificate, or court order' },
                { n: '2', title: 'We verify it', detail: 'Automated verification within minutes. If we need to review it manually, we aim to respond within 24 hours.' },
                { n: '3', title: 'The vault owner is notified', detail: 'In case this is a mistake, the account holder receives an email. If they\'re alive, they can deny the request.' },
                { n: '4', title: 'Access is granted', detail: 'You and all nominated beneficiaries receive access. The guidance and information prepared for you becomes available.' },
              ].map(item => (
                <div key={item.n} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--gold)',
                  }}>{item.n}</div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.6 }}>{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-primary" onClick={() => setStep('upload')} style={{ width: '100%', padding: 14, fontSize: 14 }}>
              Continue to upload →
            </button>
          </div>
        )}

        {step === 'upload' && (
          <div className="fade-up">
            <button onClick={() => setStep('intro')} style={{ background: 'transparent', border: 'none', color: 'var(--text-sub)', cursor: 'pointer', fontSize: 20, marginBottom: 20 }}>←</button>
            <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>Upload document</h2>
            <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 24, lineHeight: 1.6 }}>
              Please upload a clear scan or photo. The document should clearly show the full name, date, and an official seal or signature. PDF, JPG, PNG or WebP - max 25MB.
            </p>

            {/* Document type selector */}
            <div style={{ marginBottom: 20 }}>
              <label className="label">Document type</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CERT_TYPES.map(ct => (
                  <label key={ct.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                    padding: '12px 14px', borderRadius: 'var(--r)',
                    border: `1px solid ${certType === ct.id ? 'var(--gold-border)' : 'var(--border)'}`,
                    background: certType === ct.id ? 'var(--gold-dim)' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    <input type="radio" name="certType" value={ct.id} checked={certType === ct.id}
                      onChange={() => setCertType(ct.id)} style={{ marginTop: 2, accentColor: 'var(--gold)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: certType === ct.id ? 'var(--gold)' : 'var(--text)' }}>{ct.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 2 }}>{ct.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]) }}
              onClick={() => !file && inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--gold)' : file ? 'var(--success)' : 'var(--border-md)'}`,
                borderRadius: 'var(--r)', padding: '32px 20px', textAlign: 'center',
                cursor: file ? 'default' : 'pointer', marginBottom: 20,
                background: dragOver ? 'var(--gold-dim)' : file ? 'var(--success-dim)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s',
              }}>
              <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files?.[0])} />
              {file ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 10 }}>
                    {(file.size / (1024 * 1024)).toFixed(1)}MB
                  </div>
                  <button onClick={e => { e.stopPropagation(); setFile(null) }}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>📄</div>
                  <div style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>Drop document here or click to browse</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>PDF, JPG, PNG, WebP · Max 25MB</div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 20 }}>
              🔐 Your document is encrypted during upload and stored securely. It is only accessed by our verification team and Onfido (our document verification partner). It is never shared with third parties and is deleted after verification is complete.
            </div>

            <button className="btn-primary" onClick={handleSubmit} disabled={!file || loading}
              style={{ width: '100%', padding: 14, fontSize: 14 }}>
              Submit request →
            </button>
          </div>
        )}

        {step === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="spinner" style={{ width: 40, height: 40, marginBottom: 20 }} />
            <div style={{ fontFamily: 'var(--serif)', fontSize: 20, color: 'var(--cream)', marginBottom: 8 }}>
              Uploading and verifying…
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
              Please don't close this window
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="fade-up" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--cream)', marginBottom: 10 }}>
              Request submitted
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-sub)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto 24px' }}>
              Your document is being verified. This usually takes a few minutes for automated checks, or up to 24 hours if manual review is needed. You'll receive an email when the decision is made.
            </p>
            <div className="card-static" style={{ textAlign: 'left', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text)' }}>What happens now:</strong><br /><br />
                1. We've notified the vault owner that a request was submitted - if they're alive, they can deny it.<br /><br />
                2. Our system is verifying your document automatically.<br /><br />
                3. You'll receive an email at the address you registered with when a decision is made.<br /><br />
                4. If approved, you and all beneficiaries will receive access immediately.
              </div>
            </div>
            <a href="/beneficiary" className="btn-ghost" style={{ fontSize: 13, textDecoration: 'none', display: 'inline-block', padding: '10px 24px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              Return to portal
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
