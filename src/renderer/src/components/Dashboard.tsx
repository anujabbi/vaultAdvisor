import React from 'react'
import type { AdviceCard, AdviceDomain, DocKind, PortfolioSummary } from '../../../shared/types'

const CLASS_COLORS: Record<string, string> = {
  us_stock: '#c8a24b',
  intl_stock: '#8fae9b',
  bond: '#7d96b5',
  cash: '#b5ad9b',
  real_estate: '#b58a7d',
  crypto: '#a98fb5',
  other: '#6d7a73'
}

const DOMAIN_LABELS: Record<AdviceDomain, string> = {
  rebalancing: 'Rebalancing',
  concentration: 'Concentration risk',
  tax_loss_harvest: 'Tax-loss harvesting',
  contribution_gap: '401(k) headroom',
  withholding_checkup: 'Withholding checkup',
  idle_cash: 'Idle cash',
  roth_vs_traditional: 'Roth vs traditional'
}

const DOMAIN_TO_DOC: Record<AdviceDomain, DocKind> = {
  rebalancing: 'brokerage',
  concentration: 'brokerage',
  tax_loss_harvest: 'brokerage',
  contribution_gap: 'paystub',
  withholding_checkup: 'paystub',
  idle_cash: 'bank',
  roth_vs_traditional: 'tax_return'
}

export function Dashboard(props: {
  summary: PortfolioSummary
  cards: AdviceCard[]
  generating: Set<AdviceDomain>
  onOpenCard: (card: AdviceCard) => void
  onGenerate: (domain: AdviceDomain) => void
  onUnlockUpload: (kind: DocKind) => void
}): React.JSX.Element {
  const { summary: s, cards } = props
  const dollars = Math.floor(s.netWorth)
  const cents = Math.round((s.netWorth - dollars) * 100)

  const visible = cards.filter((c) => c.status !== 'dismissed')
  const lit = visible.filter((c) => c.status !== 'locked')
  const locked = visible.filter((c) => c.status === 'locked')

  return (
    <div className="dash">
      <div className="dash-header">
        <div>
          <div className="networth-label">Net worth · on this machine only</div>
          <div className="networth">
            ${dollars.toLocaleString()}
            <span className="cents">.{String(cents).padStart(2, '0')}</span>
          </div>
          <div className="stat-row">
            <div className="stat">
              <b className="num">${s.totalInvested.toLocaleString()}</b>
              <span>INVESTED</span>
            </div>
            <div className="stat">
              <b className="num">${s.totalCash.toLocaleString()}</b>
              <span>CASH</span>
            </div>
            <div className="stat">
              <b className="num">{s.concentrated.length}</b>
              <span>CONCENTRATED POSITIONS</span>
            </div>
          </div>
        </div>
        {s.hasHoldings && <Donut byClass={s.byClass} />}
      </div>

      <h2 className="cards-title">
        Your <em>advice ledger</em>
      </h2>
      <div className="card-grid">
        {[...lit, ...locked].map((c) => (
          <AdviceCardView
            key={c.domain}
            card={c}
            generating={props.generating.has(c.domain)}
            onClick={() => {
              if (c.status === 'generated') props.onOpenCard(c)
              else if (c.status === 'available' && !props.generating.has(c.domain))
                props.onGenerate(c.domain)
              else if (c.status === 'locked') props.onUnlockUpload(DOMAIN_TO_DOC[c.domain])
            }}
          />
        ))}
      </div>
    </div>
  )
}

function AdviceCardView(props: {
  card: AdviceCard
  generating: boolean
  onClick: () => void
}): React.JSX.Element {
  const { card: c, generating } = props
  const doneCount = c.checklist.filter((i) => i.done).length

  return (
    <div className={`acard ${c.status}`} onClick={props.onClick}>
      <div className="acard-domain">{DOMAIN_LABELS[c.domain]}</div>
      {generating ? (
        <>
          <div className="shimmer" style={{ width: '75%', height: 18, marginBottom: 12 }} />
          <div className="shimmer" style={{ width: '90%', marginBottom: 8 }} />
          <div className="shimmer" style={{ width: '60%' }} />
          <div className="acard-foot">Consulting your advisor + gathering citations…</div>
        </>
      ) : c.status === 'generated' ? (
        <>
          <div className="acard-title">{c.title}</div>
          <div className="acard-summary">{c.summary}</div>
          <div className="acard-foot">
            <span>{c.citations.length} sources</span>
            {c.checklist.length > 0 && (
              <span className="progress-ring">
                ✓ {doneCount}/{c.checklist.length} steps done
              </span>
            )}
          </div>
        </>
      ) : c.status === 'available' ? (
        <>
          <div className="acard-title">Ready to analyze</div>
          <div className="acard-summary">
            Your data unlocked this. Click to run the analysis — exact math, cited sources, and a
            do-it-yourself checklist.
          </div>
          <div className="acard-foot" style={{ color: 'var(--brass-bright)' }}>
            ✦ Generate advice
          </div>
        </>
      ) : (
        <>
          <div className="acard-title">Sealed</div>
          <div className="acard-hint">
            <span className="keyhole">🗝</span>
            {c.unlockHint}
          </div>
        </>
      )}
    </div>
  )
}

function Donut({ byClass }: { byClass: Record<string, number> }): React.JSX.Element {
  const entries = Object.entries(byClass).filter(([, pct]) => pct > 0)
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1d2622" strokeWidth="16" />
        {entries.map(([cls, pct]) => {
          const len = (pct / 100) * C
          const el = (
            <circle
              key={cls}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={CLASS_COLORS[cls] ?? '#6d7a73'}
              strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="legend">
        {entries.map(([cls, pct]) => (
          <div key={cls}>
            <i style={{ background: CLASS_COLORS[cls] ?? '#6d7a73' }} />
            {cls.replace('_', ' ')}
            <span className="num">{pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
