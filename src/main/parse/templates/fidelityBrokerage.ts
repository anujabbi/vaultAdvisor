import type { Template } from '../types'
import { classifyAssetClass, headerIndex, num } from './shared'

const REQUIRED = ['Account Name', 'Symbol', 'Quantity', 'Current Value']

export const fidelityBrokerage: Template = {
  id: 'fidelity-brokerage',
  docKind: 'brokerage',
  label: 'Fidelity',
  detect(raw) {
    const header = raw.rows[0] ?? []
    return REQUIRED.every((c) => header.includes(c)) && header.includes('Cost Basis Total')
  },
  map(raw) {
    const header = raw.rows[0]
    const i = {
      account: headerIndex(header, 'Account Name'),
      symbol: headerIndex(header, 'Symbol'),
      desc: headerIndex(header, 'Description'),
      qty: headerIndex(header, 'Quantity'),
      price: headerIndex(header, 'Last Price'),
      value: headerIndex(header, 'Current Value'),
      basis: headerIndex(header, 'Cost Basis Total')
    }
    const accountName = raw.rows[1]?.[i.account] || 'Brokerage'
    const holdings = raw.rows
      .slice(1)
      .filter((r) => r[i.symbol])
      .map((r) => {
        const quantity = num(r[i.qty])
        const value = num(r[i.value])
        const basis = num(r[i.basis])
        return {
          symbol: r[i.symbol].trim().toUpperCase(),
          name: (r[i.desc] ?? '').trim(),
          assetClass: classifyAssetClass(r[i.symbol], r[i.desc] ?? ''),
          quantity,
          price: num(r[i.price]),
          value,
          lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
        }
      })
    return {
      data: {
        account: { name: accountName, kind: 'taxable', institution: 'Fidelity' },
        holdings
      },
      lowConfidence: holdings.some((h) => h.lots[0] && !h.lots[0].acquiredAt)
        ? ['holdings.*.lots.*.acquiredAt']
        : []
    }
  }
}
