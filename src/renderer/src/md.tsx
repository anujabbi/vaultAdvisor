import React from 'react'

/** Tiny markdown renderer: ##/### headings, **bold**, *italic*, - lists, paragraphs. */
export function Md({ text }: { text: string }): React.JSX.Element {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="detail-md">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '')
        if (lines.length === 0) return null
        if (lines[0].startsWith('## ')) {
          return (
            <React.Fragment key={i}>
              <h2>{inline(lines[0].slice(3))}</h2>
              {lines.length > 1 && <p>{inline(lines.slice(1).join(' '))}</p>}
            </React.Fragment>
          )
        }
        if (lines.every((l) => /^[-*] /.test(l.trim()))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{inline(lines.join(' '))}</p>
      })}
    </div>
  )
}

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let rest = s
  let k = 0
  while (rest.length > 0) {
    const bold = rest.match(/\*\*(.+?)\*\*/)
    if (bold && bold.index !== undefined) {
      if (bold.index > 0) out.push(rest.slice(0, bold.index))
      out.push(<strong key={k++}>{bold[1]}</strong>)
      rest = rest.slice(bold.index + bold[0].length)
    } else {
      out.push(rest)
      break
    }
  }
  return out
}
