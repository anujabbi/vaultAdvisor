import type { AssetClass } from '../../../shared/types'

export function num(s: string | undefined): number {
  if (!s) return 0
  const n = Number(String(s).replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function headerIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
}

const BOND_HINT = /\b(bond|treasury|bnd|agg|govt|tips|muni)\b/i
const INTL_HINT = /\b(international|intl|emerging|ex-us|vxus|vea|vwo|ixus)\b/i
const CASH_HINT = /\b(money market|cash|sweep|spaxx|fdrxx)\b/i

export function classifyAssetClass(symbol: string, name: string): AssetClass {
  const s = `${symbol} ${name}`
  if (CASH_HINT.test(s)) return 'cash'
  if (BOND_HINT.test(s)) return 'bond'
  if (INTL_HINT.test(s)) return 'intl_stock'
  return 'us_stock'
}
