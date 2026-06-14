import React, { useEffect, useState } from 'react'
import type { AccountGroup, AssetItem } from '../../../shared/types'

const money = (n: number): string => `$${Math.round(n).toLocaleString()}`

function uploadedLabel(iso?: string): string {
  if (!iso) return 'never'
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

function dateLabel(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString()
}

function gainLabel(gain: number): string {
  const sign = gain >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(Math.round(gain)).toLocaleString()}`
}

export function AccountsPage({ onChanged }: { onChanged?: () => void }): React.JSX.Element {
  const [groups, setGroups] = useState<AccountGroup[]>([])

  useEffect(() => {
    window.vault.accounts.list().then(setGroups)
  }, [])

  function apply(next: AccountGroup[]): void {
    setGroups(next)
    onChanged?.()
  }

  async function rename(id: number, friendlyName: string): Promise<void> {
    apply(await window.vault.accounts.rename(id, friendlyName))
  }

  async function deleteAccount(g: AccountGroup): Promise<void> {
    const label = g.friendlyName || g.name
    if (!window.confirm(`Delete "${label}" and all ${g.items.length} of its items? This cannot be undone.`))
      return
    apply(await window.vault.accounts.delete(g.id))
  }

  async function deleteItem(item: AssetItem): Promise<void> {
    const label = item.itemType === 'cash' ? 'this cash balance' : item.symbol
    if (!window.confirm(`Delete ${label}?`)) return
    apply(await window.vault.accounts.deleteItem({ itemType: item.itemType, id: item.id }))
  }

  return (
    <div className="accounts-page">
      <h2 className="serif" style={{ fontSize: 30, marginBottom: 6 }}>
        Your accounts &amp; assets
      </h2>
      <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 26 }}>
        Everything you&apos;ve uploaded, grouped by account. Rename an account, or remove
        an account or a single holding. Account numbers are stored as the last four digits
        only and never leave this machine.
      </p>

      {groups.length === 0 && (
        <p style={{ color: 'var(--parchment-faint)', fontStyle: 'italic' }}>
          Nothing uploaded yet. Add a brokerage or bank statement to see it here.
        </p>
      )}

      {groups.map((g) => {
        const holdings = g.items.filter((i) => i.itemType === 'holding')
        const cashItems = g.items.filter((i) => i.itemType === 'cash')
        return (
        <div className="acct-group" key={g.id}>
          <div className="acct-header">
            <input
              className="acct-name"
              defaultValue={g.friendlyName || g.name}
              title="Friendly name — click to edit"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (g.friendlyName || g.name)) rename(g.id, v)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="acct-meta">
              {g.institution || 'Unknown'} · {g.accountMask || '—'} · uploaded{' '}
              {uploadedLabel(g.lastUploadedAt)}
            </span>
            <span className="spacer" />
            <b className="num acct-total">{money(g.totalValue)}</b>
            <button className="btn-danger" onClick={() => deleteAccount(g)}>
              Delete account
            </button>
          </div>

          {g.items.length === 0 && <div className="acct-empty">No items in this account.</div>}

          {holdings.length > 0 && (
            <table className="acct-items">
              <thead>
                <tr>
                  <th className="sym">Symbol</th>
                  <th className="desc">Description</th>
                  <th className="num qty">Qty</th>
                  <th className="num price">Price</th>
                  <th className="num val">Value</th>
                  <th className="acq">Acquired</th>
                  <th className="num gain">Unrealized</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((item) => {
                  const gain = item.costBasis != null ? item.value - item.costBasis : undefined
                  return (
                    <tr key={`holding-${item.id}`}>
                      <td className="sym">{item.symbol}</td>
                      <td className="desc">{item.name}</td>
                      <td className="num qty">
                        {item.quantity != null ? item.quantity.toLocaleString() : ''}
                      </td>
                      <td className="num price">{item.price != null ? money(item.price) : ''}</td>
                      <td className="num val">{money(item.value)}</td>
                      <td className="acq">{dateLabel(item.acquiredAt)}</td>
                      <td className="num gain">
                        {gain != null ? (
                          <span className={gain >= 0 ? 'gain' : 'loss'}>{gainLabel(gain)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="actions">
                        <button className="btn-quiet" onClick={() => deleteItem(item)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {cashItems.length > 0 && (
            <table className="acct-items">
              <thead>
                <tr>
                  <th className="sym">Account</th>
                  <th className="num rate">Interest rate</th>
                  <th className="num val">Balance</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {cashItems.map((item) => (
                  <tr key={`cash-${item.id}`}>
                    <td className="sym">Cash balance</td>
                    <td className="num rate">{item.apy != null ? `${item.apy}%` : '—'}</td>
                    <td className="num val">{money(item.value)}</td>
                    <td className="actions">
                      <button className="btn-quiet" onClick={() => deleteItem(item)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )
      })}
    </div>
  )
}
