import Markdown from '../lib/markdown'
import source from '../../docs/legal/terms-of-service.md?raw'

// In-app terms view (rendered inside the sidebar layout via App.jsx
// renderPage). Standalone version at /terms lives in LegalPage.jsx.
// Both pull from the same docs/legal/terms-of-service.md source.
export default function TermsPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 0' }}>
      <Markdown source={source} />
    </div>
  )
}
