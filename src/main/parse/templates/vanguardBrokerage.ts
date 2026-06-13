import type { Template } from '../types'
import { classifyAssetClass, headerIndex, num } from './shared'

export const vanguardBrokerage: Template = {
  id: 'vanguard-brokerage',
  docKind: 'brokerage',
  label: 'Vanguard',
  detect(raw) {
    const h = raw.rows[0] ?? []
    return h.includes('Investment Name') && h.includes('Shares') && h.includes('Total Value')
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      name: headerIndex(h, 'Investment Name'),
      symbol: headerIndex(h, 'Symbol'),
      shares: headerIndex(h, 'Shares'),
      price: headerIndex(h, 'Share Price'),
      value: headerIndex(h, 'Total Value')
    }
    const holdings = raw.rows
      .slice(1)
      .filter((r) => r[i.symbol] || r[i.name])
      .map((r) => ({
        symbol: (r[i.symbol] || r[i.name]).trim().toUpperCase(),
        name: (r[i.name] ?? '').trim(),
        assetClass: classifyAssetClass(r[i.symbol] ?? '', r[i.name] ?? ''),
        quantity: num(r[i.shares]),
        price: num(r[i.price]),
        value: num(r[i.value]),
        lots: []
      }))
    return {
      data: {
        account: { name: 'Vanguard', kind: 'taxable', institution: 'Vanguard' },
        holdings
      },
      lowConfidence: []
    }
  }
}
