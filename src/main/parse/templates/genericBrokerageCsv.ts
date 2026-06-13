import type { Template } from '../types'
import { classifyAssetClass, num } from './shared'

const SYMBOL_COLS = ['symbol', 'ticker', 'security']
const QTY_COLS = ['quantity', 'shares', 'qty', 'units']
const VALUE_COLS = ['value', 'market value', 'current value', 'total value']
const PRICE_COLS = ['price', 'last price', 'share price']
const NAME_COLS = ['description', 'name', 'investment name', 'security name']
const BASIS_COLS = ['cost basis', 'cost basis total', 'cost']

function find(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h.trim().toLowerCase()))
}

export const genericBrokerageCsv: Template = {
  id: 'generic-brokerage-csv',
  docKind: 'brokerage',
  label: 'Generic CSV',
  detect(raw) {
    if (raw.format !== 'csv' && raw.format !== 'xlsx') return false
    const h = raw.rows[0] ?? []
    return find(h, SYMBOL_COLS) >= 0 && find(h, VALUE_COLS) >= 0
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      symbol: find(h, SYMBOL_COLS),
      qty: find(h, QTY_COLS),
      value: find(h, VALUE_COLS),
      price: find(h, PRICE_COLS),
      name: find(h, NAME_COLS),
      basis: find(h, BASIS_COLS)
    }
    const holdings = raw.rows
      .slice(1)
      .filter((r) => r[i.symbol])
      .map((r) => {
        const quantity = i.qty >= 0 ? num(r[i.qty]) : 0
        const basis = i.basis >= 0 ? num(r[i.basis]) : 0
        return {
          symbol: r[i.symbol].trim().toUpperCase(),
          name: i.name >= 0 ? (r[i.name] ?? '').trim() : '',
          assetClass: classifyAssetClass(r[i.symbol], i.name >= 0 ? r[i.name] ?? '' : ''),
          quantity,
          price: i.price >= 0 ? num(r[i.price]) : 0,
          value: num(r[i.value]),
          lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
        }
      })
    return {
      data: { account: { name: 'Brokerage', kind: 'taxable', institution: '' }, holdings },
      lowConfidence: ['account.institution']
    }
  }
}
