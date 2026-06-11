import React, { useState } from 'react'
import type { ChatMessage, DocKind, ExtractionDraft } from '../../../shared/types'

const KIND_LABELS: Record<DocKind, string> = {
  brokerage: 'Brokerage / 401(k) statement',
  tax_return: 'Tax return (Form 1040)',
  paystub: 'Pay stub / W-2',
  bank: 'Bank statement'
}

/**
 * Modal flow: pick file -> parsing -> review extraction -> confirm.
 * On confirm, the advisor opens a profiling conversation (returned messages).
 */
export function UploadFlow(props: {
  kind: DocKind
  onClose: () => void
  onConfirmed: (profilingThread: string, messages: ChatMessage[]) => void
  onError: (msg: string) => void
}): React.JSX.Element {
  const [phase, setPhase] = useState<'pick' | 'parsing' | 'review' | 'saving'>('pick')
  const [draft, setDraft] = useState<ExtractionDraft | null>(null)
  const [edited, setEdited] = useState<any>(null)

  async function pick(): Promise<void> {
    setPhase('parsing')
    try {
      const d = await window.vault.docs.pick(props.kind)
      if (!d) {
        setPhase('pick')
        return
      }
      setDraft(d)
      setEdited(d.data)
      setPhase('review')
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e))
      props.onClose()
    }
  }

  async function confirm(): Promise<void> {
    if (!draft) return
    setPhase('saving')
    try {
      const messages = await window.vault.docs.confirm(draft.docId, props.kind, edited)
      props.onConfirmed(`profiling:${draft.docId}`, messages)
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e))
      setPhase('review')
    }
  }

  const low = new Set(draft?.lowConfidence ?? [])

  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="acard-domain">{KIND_LABELS[props.kind]}</div>

        {phase === 'pick' && (
          <>
            <h2 className="serif" style={{ fontSize: 26, marginBottom: 10 }}>
              Add it to the vault
            </h2>
            <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 20 }}>
              Choose a PDF or CSV export. The file is copied into a local vault folder on this
              machine and parsed by your signed-in AI — you'll review everything it reads before
              anything is saved.
            </p>
            <button className="btn-brass" onClick={pick}>
              Choose file…
            </button>
          </>
        )}

        {(phase === 'parsing' || phase === 'saving') && (
          <>
            <h2 className="serif" style={{ fontSize: 26, marginBottom: 16 }}>
              {phase === 'parsing' ? 'Reading your document…' : 'Locking it in…'}
            </h2>
            <div className="shimmer" style={{ width: '70%', marginBottom: 10 }} />
            <div className="shimmer" style={{ width: '55%', marginBottom: 10 }} />
            <div className="shimmer" style={{ width: '63%' }} />
            <p style={{ color: 'var(--parchment-faint)', fontSize: 12.5, marginTop: 16 }}>
              This can take up to a minute for dense statements.
            </p>
          </>
        )}

        {phase === 'review' && draft && (
          <>
            <h2 className="serif" style={{ fontSize: 26, marginBottom: 6 }}>
              Check what I read
            </h2>
            <p style={{ color: 'var(--parchment-dim)', fontSize: 13.5 }}>
              Fix anything that's off — nothing is saved until you confirm.
            </p>
            <ReviewEditor kind={props.kind} value={edited} onChange={setEdited} low={low} />
            {low.size > 0 && (
              <p className="lowconf-note">
                Fields outlined in red were hard to read — please double-check them.
              </p>
            )}
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button className="btn-brass" onClick={confirm}>
                Looks right — save to my vault
              </button>
              <button className="btn-quiet" onClick={props.onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- per-kind editable review forms ----------

function ReviewEditor(props: {
  kind: DocKind
  value: any
  onChange: (v: any) => void
  low: Set<string>
}): React.JSX.Element {
  const { kind, value, onChange, low } = props
  if (!value) return <></>

  const cls = (path: string): string => (low.has(path) ? 'lowconf' : '')
  const set = (path: string, v: unknown): void => {
    const next = structuredClone(value)
    const parts = path.split('.')
    let cur: any = next
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]
    cur[parts[parts.length - 1]] = v
    onChange(next)
  }

  if (kind === 'brokerage') {
    return (
      <>
        <div className="review-section">
          <h4>Account</h4>
          <div className="review-grid">
            <label>Name</label>
            <input className={cls('account.name')} value={value.account.name} onChange={(e) => set('account.name', e.target.value)} />
            <label>Type</label>
            <select value={value.account.kind} onChange={(e) => set('account.kind', e.target.value)}>
              {['taxable', 'k401', 'ira', 'roth_ira', 'hsa'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <label>Institution</label>
            <input value={value.account.institution} onChange={(e) => set('account.institution', e.target.value)} />
          </div>
        </div>
        <div className="review-section">
          <h4>Holdings ({value.holdings.length})</h4>
          <table className="htable">
            <thead>
              <tr><th>Symbol</th><th>Class</th><th>Qty</th><th>Price</th><th>Value</th><th>Lots</th></tr>
            </thead>
            <tbody>
              {value.holdings.map((h: any, i: number) => (
                <tr key={i}>
                  <td><input className={cls(`holdings.${i}.symbol`)} value={h.symbol} onChange={(e) => set(`holdings.${i}.symbol`, e.target.value)} /></td>
                  <td>
                    <select value={h.assetClass} onChange={(e) => set(`holdings.${i}.assetClass`, e.target.value)}>
                      {['us_stock', 'intl_stock', 'bond', 'cash', 'real_estate', 'crypto', 'other'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td><input className={cls(`holdings.${i}.quantity`)} type="number" value={h.quantity} onChange={(e) => set(`holdings.${i}.quantity`, Number(e.target.value))} /></td>
                  <td><input type="number" value={h.price} onChange={(e) => set(`holdings.${i}.price`, Number(e.target.value))} /></td>
                  <td><input type="number" value={h.value} onChange={(e) => set(`holdings.${i}.value`, Number(e.target.value))} /></td>
                  <td className="num">{h.lots?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  if (kind === 'tax_return') {
    return (
      <div className="review-section">
        <h4>Form 1040</h4>
        <div className="review-grid">
          <label>Tax year</label>
          <input className={cls('year')} type="number" value={value.year} onChange={(e) => set('year', Number(e.target.value))} />
          <label>Filing status</label>
          <select value={value.filingStatus} onChange={(e) => set('filingStatus', e.target.value)}>
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
            <option value="mfs">Married filing separately</option>
            <option value="hoh">Head of household</option>
          </select>
          <label>AGI</label>
          <input className={cls('agi')} type="number" value={value.agi} onChange={(e) => set('agi', Number(e.target.value))} />
          <label>Taxable income</label>
          <input className={cls('taxableIncome')} type="number" value={value.taxableIncome} onChange={(e) => set('taxableIncome', Number(e.target.value))} />
          <label>Total tax</label>
          <input className={cls('totalTax')} type="number" value={value.totalTax} onChange={(e) => set('totalTax', Number(e.target.value))} />
          <label>Deduction</label>
          <select value={value.stdOrItemized} onChange={(e) => set('stdOrItemized', e.target.value)}>
            <option value="standard">Standard</option>
            <option value="itemized">Itemized</option>
          </select>
        </div>
      </div>
    )
  }

  if (kind === 'paystub') {
    return (
      <div className="review-section">
        <h4>Income</h4>
        <div className="review-grid">
          <label>Employer</label>
          <input value={value.source} onChange={(e) => set('source', e.target.value)} />
          <label>Annual gross</label>
          <input className={cls('annualGross')} type="number" value={value.annualGross} onChange={(e) => set('annualGross', Number(e.target.value))} />
          <label>Fed withholding YTD</label>
          <input className={cls('withholdingFedYtd')} type="number" value={value.withholdingFedYtd} onChange={(e) => set('withholdingFedYtd', Number(e.target.value))} />
          <label>401(k) YTD</label>
          <input className={cls('k401ContribYtd')} type="number" value={value.k401ContribYtd} onChange={(e) => set('k401ContribYtd', Number(e.target.value))} />
          <label>401(k) rate %</label>
          <input type="number" value={value.k401Rate} onChange={(e) => set('k401Rate', Number(e.target.value))} />
          <label>Pay period</label>
          <select value={value.payPeriod} onChange={(e) => set('payPeriod', e.target.value)}>
            {['weekly', 'biweekly', 'semimonthly', 'monthly'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  // bank
  return (
    <div className="review-section">
      <h4>Bank account</h4>
      <div className="review-grid">
        <label>Account name</label>
        <input value={value.account.name} onChange={(e) => set('account.name', e.target.value)} />
        <label>Type</label>
        <select value={value.account.kind} onChange={(e) => set('account.kind', e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
        <label>Institution</label>
        <input value={value.account.institution} onChange={(e) => set('account.institution', e.target.value)} />
        <label>Balance</label>
        <input className={cls('balance')} type="number" value={value.balance} onChange={(e) => set('balance', Number(e.target.value))} />
        <label>APY %</label>
        <input className={cls('apy')} type="number" value={value.apy} onChange={(e) => set('apy', Number(e.target.value))} />
      </div>
    </div>
  )
}
