import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { validateFile, sanitiseFilename, verifyFileMagic } from '../lib/fileUpload'
import toast from 'react-hot-toast'
import ShareModal from '../components/ShareModal'

const DOC_CATEGORIES = [
  { id: 'identity',     label: 'Identity',          icon: '🪪', examples: 'Passport, birth certificate, driving licence, national insurance card' },
  { id: 'property',     label: 'Property & Home',   icon: '🏠', examples: 'Deeds, mortgage documents, lease agreements, land registry' },
  { id: 'legal',        label: 'Legal',             icon: '⚖️', examples: 'Will, power of attorney, court orders, contracts' },
  { id: 'financial',    label: 'Financial',         icon: '💰', examples: 'Bank statements, investment accounts, pension documents, tax returns' },
  { id: 'insurance',    label: 'Insurance',         icon: '🛡️', examples: 'Life insurance, home insurance, health insurance policies' },
  { id: 'medical',      label: 'Medical',           icon: '🏥', examples: 'Medical records, prescriptions, test results, advance directives' },
  { id: 'employment',   label: 'Employment',        icon: '💼', examples: 'Contracts, payslips, P60, references' },
  { id: 'vehicle',      label: 'Vehicle',           icon: '🚗', examples: 'V5C logbook, MOT certificates, service history' },
  { id: 'other',        label: 'Other',             icon: '📄', examples: 'Any other important document' },
]

const MAX_FILE_SIZE_MB = 25
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadModal({ onClose, onUploaded }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [file, setFile]         = useState(null)
  const [form, setForm]         = useState({ category: 'legal', name: '', notes: '' })
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleFile(f) {
    if (!f) return
    // Validate
    const errors = validateFile(f)
    if (errors.length) { toast.error(errors[0]); return }
    if (f.size > MAX_FILE_SIZE_BYTES) { toast.error(`File too large. Max ${MAX_FILE_SIZE_MB}MB`); return }

    // Verify magic bytes
    const magicOk = await verifyFileMagic(f)
    if (!magicOk) { toast.error('File type does not match its extension'); return }

    setFile(f)
    if (!form.name) set('name', f.name.replace(/\.[^.]+$/, ''))
  }

  async function handleUpload() {
    if (!file) { toast.error('Select a file first'); return }
    if (!form.name.trim()) { toast.error('Give this document a name'); return }

    setUploading(true)
    setProgress(10)

    try {
      const safeName = sanitiseFilename(file.name)
      const path = `${user.id}/documents/${Date.now()}-${safeName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('vault-files')
        .upload(path, file, { upsert: false, cacheControl: '3600' })

      if (uploadError) throw uploadError
      setProgress(70)

      // Save metadata to DB
      const { data, error: dbError } = await supabase
        .from('vault_documents')
        .insert([{
          user_id: user.id,
          name: form.name.trim(),
          category: form.category,
          notes: form.notes.trim() || null,
          storage_path: path,
          file_name: safeName,
          file_size: file.size,
          file_type: file.type,
        }])
        .select()
        .single()

      if (dbError) throw dbError
      setProgress(100)

      toast.success('Document uploaded securely')
      onUploaded(data)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginBottom: 20 }}>
          Upload document
        </h2>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => !file && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--gold)' : file ? 'var(--success)' : 'var(--border-md)'}`,
            borderRadius: 'var(--r)', padding: '28px 20px', textAlign: 'center',
            cursor: file ? 'default' : 'pointer', marginBottom: 18,
            background: dragOver ? 'var(--gold-dim)' : file ? 'var(--success-dim)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
          }}>
          <input ref={inputRef} type="file" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])} />
          {file ? (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)', marginBottom: 10 }}>{formatBytes(file.size)}</div>
              <button onClick={e => { e.stopPropagation(); setFile(null) }}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sub)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                Remove
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>📁</div>
              <div style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>Drop your file here</div>
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>or click to browse · Max {MAX_FILE_SIZE_MB}MB</div>
              <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 6 }}>
                PDF, images, Word, Excel, and most document formats
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label">Document name *</label>
            <input className="input" placeholder="e.g. Last Will and Testament 2024"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {DOC_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes for family (optional)</label>
            <textarea className="input" placeholder="e.g. Original held at Johnson & Co Solicitors. This is a certified copy."
              value={form.notes} onChange={e => set('notes', e.target.value)} style={{ height: 70 }} />
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-sub)', textAlign: 'center', marginTop: 6 }}>
              Encrypting and uploading…
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn-primary" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Upload securely'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ doc, onDelete, onShare }) {
  const { user } = useAuth()
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing]   = useState(false)
  const [previewUrl, setPreviewUrl]   = useState(null)
  const cat = DOC_CATEGORIES.find(c => c.id === doc.category)

  const isPreviewable = doc.file_name && (
    /\.(pdf)$/i.test(doc.file_name) ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.file_name)
  )
  const isImage = doc.file_name && /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.file_name)

  async function handleDownload() {
    setDownloading(true)
    try {
      const { data, error } = await supabase.storage
        .from('vault-files')
        .download(doc.storage_path)
      if (error) throw error

      const url = URL.createObjectURL(data)
      const a   = Object.assign(document.createElement('a'), { href: url, download: doc.file_name })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloading(false)
    }
  }

  async function handlePreview() {
    if (previewUrl) { setPreviewing(true); return }
    setDownloading(true)
    try {
      const { data, error } = await supabase.storage
        .from('vault-files')
        .download(doc.storage_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      setPreviewUrl(url)
      setPreviewing(true)
    } catch {
      toast.error('Preview failed - try downloading instead')
    } finally {
      setDownloading(false)
    }
  }

  function closePreview() {
    setPreviewing(false)
    // Don't revoke URL - keep cached for next preview
  }

  async function handleDelete() {
    if (!confirm(`Permanently delete "${doc.name}"? This cannot be undone.`)) return
    try {
      await supabase.storage.from('vault-files').remove([doc.storage_path])
      await supabase.from('vault_documents').delete().eq('id', doc.id).eq('user_id', user.id)
      onDelete(doc.id)
      toast.success('Document deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  return (
    <>
    <div className="card-static" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
        background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>{cat?.icon || '📄'}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{doc.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
          {cat?.label} · {formatBytes(doc.file_size)} ·{' '}
          {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        {doc.notes && (
          <div style={{ fontSize: 12, color: 'var(--cream-dim)', marginTop: 3, fontStyle: 'italic' }}>{doc.notes}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {isPreviewable && (
          <button className="btn-ghost" onClick={handlePreview} disabled={downloading}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            {downloading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '👁 Preview'}
          </button>
        )}
        <button className="btn-ghost" onClick={handleDownload} disabled={downloading}
          style={{ fontSize: 12, padding: '6px 14px' }}>
          {downloading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↓ Download'}
        </button>
        <button className="btn-ghost" onClick={onShare}
          style={{ fontSize: 12, padding: '6px 14px' }}>🔗 Share</button>
        <button className="btn-danger" onClick={handleDelete} style={{ fontSize: 12, padding: '6px 14px' }}>
          Delete
        </button>
      </div>
    </div>

    {/* Preview overlay */}
    {previewing && previewUrl && (
      <div className="modal-overlay" onClick={closePreview} style={{ zIndex: 10000 }}>
        <div style={{
          position: 'relative', maxWidth: '92vw', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10, gap: 12 }}>
            <span style={{ color: 'var(--cream)', fontSize: 14, fontWeight: 500 }}>{doc.name}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDownload} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--sans)' }}>
                Download
              </button>
              <button onClick={closePreview} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--sans)' }}>
                Close
              </button>
            </div>
          </div>
          {isImage ? (
            <img src={previewUrl} alt={doc.name}
              style={{ maxWidth: '88vw', maxHeight: '80vh', borderRadius: 8, objectFit: 'contain' }} />
          ) : (
            <iframe src={previewUrl} title={doc.name}
              sandbox="allow-same-origin"
              style={{ width: '88vw', height: '80vh', border: 'none', borderRadius: 8, background: '#fff' }} />
          )}
        </div>
      </div>
    )}
    </>
  )
}

export default function DocumentsPage({ onNav }) {
  const { user, profile } = useAuth()
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [shareDoc, setShareDoc]     = useState(null)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    if (!user) return
    supabase.from('vault_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocs(data || []); setLoading(false) })
  }, [user])

  const isPaid = profile?.plan && profile.plan !== 'free'
  const filtered = filter === 'all' ? docs : docs.filter(d => d.category === filter)

  // Storage used
  const totalBytes = docs.reduce((sum, d) => sum + (d.file_size || 0), 0)
  const maxBytes   = (profile?.plan === 'couples' ? 5 : 1) * 1024 * 1024 * 1024
  const usedPct    = Math.min(100, (totalBytes / maxBytes) * 100)

  if (!isPaid) {
    return (
      <div>
        <div className="fade-up page-header">
          <h1 className="page-title">Secure Documents</h1>
          <p className="page-sub">Store your most important documents</p>
        </div>
        <div className="fade-up-2 card-static" style={{ textAlign: 'center', padding: '48px 32px', borderColor: 'var(--gold-border)', background: 'var(--gold-dim)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--cream)', marginBottom: 10 }}>
            Document storage is a paid feature
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-sub)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.7 }}>
            Store your will, birth certificate, property deeds, and other vital documents encrypted and safely. Available on Single (1GB) and Couples (5GB) plans.
          </p>
          <button className="btn-primary" onClick={() => onNav('plan')} style={{ padding: '12px 32px' }}>
            Upgrade to unlock →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Secure Documents</h1>
          <p className="page-sub">{docs.length} documents · {formatBytes(totalBytes)} used</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>+ Upload document</button>
      </div>

      {/* Storage bar */}
      <div className="fade-up-2 card-static" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-sub)', marginBottom: 8 }}>
          <span>Storage used</span>
          <span>{formatBytes(totalBytes)} of {profile?.plan === 'couples' ? '5GB' : '1GB'}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${usedPct}%`, borderRadius: 3, transition: 'width 0.4s',
            background: usedPct > 90 ? 'var(--danger)' : usedPct > 70 ? '#e8a44c' : 'var(--gold)',
          }} />
        </div>
      </div>

      {/* Security note */}
      <div className="fade-up-2 card-static" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-dim)', marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20 }}>🔐</span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--gold)', marginBottom: 3 }}>End-to-end encrypted</div>
            <div style={{ fontSize: 12, color: 'var(--cream-dim)', lineHeight: 1.6 }}>
              All documents are encrypted before upload. Even Digital Relative cannot read your files. Beneficiaries must pass identity verification before downloading any documents.
            </div>
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="fade-up-3" style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer',
          background: filter === 'all' ? 'var(--gold)' : 'transparent',
          color: filter === 'all' ? '#0d1b2a' : 'var(--text-sub)',
          border: filter === 'all' ? 'none' : '1px solid var(--border-md)',
          fontFamily: 'var(--sans)', transition: 'all 0.15s',
        }}>All</button>
        {DOC_CATEGORIES.filter(c => docs.some(d => d.category === c.id)).map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '6px 14px', borderRadius: 'var(--r)', fontSize: 12, cursor: 'pointer',
            background: filter === c.id ? 'var(--gold)' : 'transparent',
            color: filter === c.id ? '#0d1b2a' : 'var(--text-sub)',
            border: filter === c.id ? 'none' : '1px solid var(--border-md)',
            fontFamily: 'var(--sans)', transition: 'all 0.15s',
          }}>{c.icon} {c.label}</button>
        ))}
      </div>

      {/* Documents list */}
      <div className="fade-up-4">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📁</div>
            <div className="empty-text">{filter !== 'all' ? 'No documents in this category' : 'No documents yet'}</div>
            <div>Upload your first document above</div>
            {filter === 'all' && (
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-sub)', maxWidth: 360, lineHeight: 1.7 }}>
                Consider uploading: your will, birth certificate, property deeds, passport copy, insurance policies, and any other documents your family would need.
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DOC_CATEGORIES.filter(c => filter === 'all' || c.id === filter).map(cat => {
              const catDocs = filtered.filter(d => d.category === cat.id)
              if (!catDocs.length) return null
              return (
                <div key={cat.id}>
                  <div style={{ fontSize: 12, color: 'var(--text-sub)', fontWeight: 500, marginBottom: 8, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {cat.icon} {cat.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catDocs.map(doc => (
                      <DocumentCard key={doc.id} doc={doc}
                        onDelete={id => setDocs(prev => prev.filter(d => d.id !== id))}
                        onShare={() => setShareDoc(doc)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {shareDoc && (
        <ShareModal
          item={{ ...shareDoc, title: shareDoc.name }}
          itemType="document"
          onClose={() => setShareDoc(null)}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={doc => setDocs(prev => [doc, ...prev])}
        />
      )}
    </div>
  )
}
