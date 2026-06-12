import React, { useState } from 'react'
import type { DocKind, HeroScenario } from '../../../shared/types'
import { Md } from '../md'

export function HeroScenarios(props: {
  scenarios: HeroScenario[]
  onStartUpload: (kind: DocKind) => void
}): React.JSX.Element {
  const [open, setOpen] = useState<HeroScenario | null>(null)

  return (
    <div className="hero">
      <div className="hero-kicker">Private · Local · Yours</div>
      <h1>
        Financial advice without <em>handing over</em> your logins.
      </h1>
      <p className="hero-sub">
        No account connections, no credentials, no aggregators. You download the statements; the
        app stores them right on your machine — then finds the money you're leaving on the table
        and hands you a checklist to go get it. Analysis runs on your own Claude subscription,
        never through us.
      </p>

      <div className="scenario-grid">
        {props.scenarios.map((s) => (
          <div key={s.id} className="scenario" onClick={() => setOpen(s)}>
            <span className="savings">{s.savings}</span>
            <h3>{s.headline}</h3>
            <p>{s.subline}</p>
            <span className="cta">See how</span>
          </div>
        ))}
      </div>

      <div className="hero-trust">
        <div>
          <b>Nothing to sign up for</b>
          <span>No VaultAdvisor servers exist. Your documents live in a local vault folder, your data in a local database.</span>
        </div>
        <div>
          <b>The AI is yours, not ours</b>
          <span>Analysis runs through your own Claude subscription. You already trust them with your conversations.</span>
        </div>
        <div>
          <b>You stay in control</b>
          <span>Every recommendation shows its math, cites its sources, and waits for you to execute it — manually, at your broker.</span>
        </div>
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <span className="savings">{open.savings} · sample data</span>
            <h2 className="serif" style={{ fontSize: 28, margin: '12px 0 4px' }}>
              {open.headline}
            </h2>
            <Md text={open.bodyMd} />
            <div style={{ marginTop: 26, display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                className="btn-brass"
                onClick={() => {
                  setOpen(null)
                  props.onStartUpload(open.unlockDocKind)
                }}
              >
                {open.unlockCta}
              </button>
              <button className="btn-quiet" onClick={() => setOpen(null)}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
