import Markdown from '../lib/markdown'
import source from '../../docs/legal/privacy-policy.md?raw'

// In-app privacy view (rendered inside the sidebar layout via App.jsx
// renderPage). Standalone version at /privacy lives in LegalPage.jsx.
// Both pull from the same docs/legal/privacy-policy.md source.
export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 0' }}>
      <Markdown source={source} />
    </div>
  )
}
