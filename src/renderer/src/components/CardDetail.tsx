import React from 'react'
import type { AdviceCard } from '../../../shared/types'
import { Md } from '../md'

export function CardDetail(props: {
  card: AdviceCard
  onClose: () => void
  onToggle: (itemId: number, done: boolean) => void
  onChatAbout: (card: AdviceCard) => void
}): React.JSX.Element {
  const { card: c } = props
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="acard-domain">{c.domain.replace(/_/g, ' ')}</div>
        <h2 className="serif" style={{ fontSize: 30, marginBottom: 6 }}>{c.title}</h2>
        <p style={{ color: 'var(--parchment-dim)', fontSize: 15 }}>{c.summary}</p>

        <Md text={c.bodyMd} />

        {c.citations.length > 0 && (
          <div className="citations">
            <h4>Basis for this advice</h4>
            {c.citations.map((cit, i) => (
              <div className="citation" key={i}>
                <a href={cit.url} target="_blank" rel="noreferrer">
                  {cit.title}
                </a>
                {cit.quote && <p>“{cit.quote}”</p>}
              </div>
            ))}
          </div>
        )}

        {c.checklist.length > 0 && (
          <div className="checklist">
            <h4>Your execution checklist — check off as you go</h4>
            {c.checklist.map((item) => (
              <div
                key={item.id}
                className={`checkitem ${item.done ? 'done' : ''}`}
                onClick={() => props.onToggle(item.id, !item.done)}
              >
                <span className="checkbox">{item.done ? '✓' : ''}</span>
                <span className="ctext">{item.text}</span>
              </div>
            ))}
          </div>
        )}

        {c.profileRefs.length > 0 && (
          <p style={{ marginTop: 18, fontSize: 12, color: 'var(--parchment-faint)' }}>
            Personalized using your profile: {c.profileRefs.join(', ')}
          </p>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button className="btn-ghost" onClick={() => props.onChatAbout(c)}>
            Ask about this
          </button>
          <button className="btn-quiet" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
