import type { Template } from '../types'
import { classifyAssetClass, headerIndex, num } from './shared'

export const schwabBrokerage: Template = {
  id: 'schwab-brokerage',
  docKind: 'brokerage',
  label: 'Schwab',
  detect(raw) {
    const h = raw.rows[0] ?? []
    return h.includes('Symbol') && h.includes('Market Value') && h.includes('Qty')
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      symbol: headerIndex(h, 'Symbol'),
      desc: headerIndex(h, 'Description'),
      qty: headerIndex(h, 'Qty'),
      price: headerIndex(h, 'Price'),
      value: headerIndex(h, 'Market Value'),
      basis: headerIndex(h, 'Cost Basis')
    }
    const holdings = raw.rows
      .slice(1)
      .filter((r) => r[i.symbol])
      .map((r) => {
        const quantity = num(r[i.qty])
        const basis = i.basis >= 0 ? num(r[i.basis]) : 0
        return {
          symbol: r[i.symbol].trim().toUpperCase(),
          name: (r[i.desc] ?? '').trim(),
          assetClass: classifyAssetClass(r[i.symbol], r[i.desc] ?? ''),
          quantity,
          price: num(r[i.price]),
          value: num(r[i.value]),
          lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
        }
      })
    return {
      data: {
        account: { name: 'Schwab Brokerage', kind: 'taxable', institution: 'Schwab' },
        holdings
      },
      lowConfidence: []
    }
  }
}
