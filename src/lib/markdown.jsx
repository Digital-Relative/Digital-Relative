import { Fragment } from 'react'

// Tiny markdown renderer for static legal pages. Handles the subset of
// markdown used in docs/legal/*.md: # ## ### headings, paragraphs, bullet
// lists, horizontal rules, inline **bold**, [text](url) links, and basic
// pipe-style tables. NOT intended for user-provided content — it does no
// HTML escaping because the inputs are trusted Markdown files in the repo.

function renderInline(text, keyBase) {
  // Pattern: **bold** or [text](url)
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  const out = []
  let cursor = 0
  let i = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(<Fragment key={`${keyBase}-t-${i++}`}>{text.slice(cursor, m.index)}</Fragment>)
    if (m[1]) {
      out.push(<strong key={`${keyBase}-b-${i++}`}>{m[1]}</strong>)
    } else if (m[2] && m[3]) {
      out.push(<a key={`${keyBase}-l-${i++}`} href={m[3]} target={m[3].startsWith('http') ? '_blank' : undefined} rel={m[3].startsWith('http') ? 'noopener noreferrer' : undefined} style={{ color: 'var(--gold)', textDecoration: 'underline' }}>{m[2]}</a>)
    }
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) out.push(<Fragment key={`${keyBase}-t-${i++}`}>{text.slice(cursor)}</Fragment>)
  return out
}

function isTableSeparator(line) {
  // e.g. |---|---|---|
  return /^\|[\s|:-]+\|$/.test(line.trim())
}

export default function Markdown({ source }) {
  const lines = source.split('\n')
  const blocks = []
  let key = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Horizontal rule
    if (line.trim() === '---') {
      blocks.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />)
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push(<h1 key={key++} style={{ fontFamily: 'var(--serif)', fontSize: 32, color: 'var(--cream)', marginTop: 28, marginBottom: 16 }}>{renderInline(line.slice(2), key)}</h1>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++} style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--cream)', marginTop: 28, marginBottom: 12 }}>{renderInline(line.slice(3), key)}</h2>)
      i++; continue
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--cream)', marginTop: 20, marginBottom: 10 }}>{renderInline(line.slice(4), key)}</h3>)
      i++; continue
    }

    // Table — header line starts with |, next line is separator
    if (line.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = line.split('|').slice(1, -1).map(s => s.trim())
      i += 2
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()))
        i++
      }
      blocks.push(
        <table key={key++} style={{ width: '100%', borderCollapse: 'collapse', margin: '14px 0', fontSize: 13 }}>
          <thead>
            <tr>
              {headerCells.map((h, idx) => (
                <th key={idx} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-md)', color: 'var(--cream)', fontWeight: 500 }}>{renderInline(h, `${key}-h${idx}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--cream-dim)', verticalAlign: 'top' }}>{renderInline(c, `${key}-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        const content = lines[i].replace(/^[-*] /, '')
        items.push(<li key={items.length} style={{ marginBottom: 6 }}>{renderInline(content, `${key}-${items.length}`)}</li>)
        i++
      }
      blocks.push(<ul key={key++} style={{ paddingLeft: 22, margin: '10px 0', color: 'var(--cream-dim)', lineHeight: 1.7 }}>{items}</ul>)
      continue
    }

    // Blank line → block break
    if (line.trim() === '') { i++; continue }

    // Paragraph — accumulate consecutive non-special lines
    const para = [line]
    i++
    while (i < lines.length) {
      const l = lines[i]
      if (l.trim() === '' || l.startsWith('#') || l.startsWith('- ') || l.startsWith('* ') || l.startsWith('|') || l.trim() === '---') break
      para.push(l)
      i++
    }
    blocks.push(<p key={key++} style={{ color: 'var(--cream-dim)', lineHeight: 1.75, margin: '10px 0', fontSize: 14 }}>{renderInline(para.join(' '), key)}</p>)
  }

  return blocks
}
