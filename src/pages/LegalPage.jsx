import Markdown from '../lib/markdown'
import privacySource from '../../docs/legal/privacy-policy.md?raw'
import termsSource   from '../../docs/legal/terms-of-service.md?raw'

// Single component renders either policy. URL routing in App.jsx decides
// which `kind` to pass. Content stays in sync with docs/legal/*.md.
export default function LegalPage({ kind, onBack }) {
  const source = kind === 'terms' ? termsSource : privacySource

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <a href="/" style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--gold)', textDecoration: 'none' }}>Digital Relative</a>
          {onBack && (
            <button className="btn-ghost" onClick={onBack} style={{ fontSize: 12 }}>
              ← Back
            </button>
          )}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '36px 40px' }}>
          <Markdown source={source} />
        </div>
        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-sub)' }}>
          <a href="/privacy" style={{ color: 'var(--text-sub)', marginRight: 14, textDecoration: 'underline' }}>Privacy</a>
          <a href="/terms"   style={{ color: 'var(--text-sub)', marginRight: 14, textDecoration: 'underline' }}>Terms</a>
          <a href="mailto:hello@digitalrelative.co.uk" style={{ color: 'var(--text-sub)', textDecoration: 'underline' }}>Contact</a>
        </div>
      </div>
    </div>
  )
}
