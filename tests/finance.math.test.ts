import { describe, expect, it } from 'vitest'
import {
  allocation,
  contributionGap,
  federalTax2026,
  harvestCandidates,
  idleCashDrag,
  rebalanceDrift
} from '../src/main/finance/math'

describe('allocation', () => {
  const holdings = [
    { symbol: 'NVDA', assetClass: 'us_stock' as const, value: 40000 },
    { symbol: 'VTI', assetClass: 'us_stock' as const, value: 30000 },
    { symbol: 'VXUS', assetClass: 'intl_stock' as const, value: 20000 },
    { symbol: 'BND', assetClass: 'bond' as const, value: 10000 }
  ]

  it('computes percentages by class and symbol', () => {
    const a = allocation(holdings)
    expect(a.total).toBe(100000)
    expect(a.byClass.us_stock).toBe(70)
    expect(a.byClass.intl_stock).toBe(20)
    expect(a.byClass.bond).toBe(10)
    expect(a.bySymbol[0]).toEqual({ symbol: 'NVDA', value: 40000, pct: 40 })
  })

  it('flags positions above the 15% concentration threshold', () => {
    const a = allocation(holdings)
    expect(a.concentrated).toEqual([
      { symbol: 'NVDA', pct: 40 },
      { symbol: 'VTI', pct: 30 },
      { symbol: 'VXUS', pct: 20 }
    ])
  })

  it('handles empty portfolio', () => {
    const a = allocation([])
    expect(a.total).toBe(0)
    expect(a.concentrated).toEqual([])
  })
})

describe('rebalanceDrift', () => {
  it('produces buy/sell moves toward target', () => {
    const a = allocation([
      { symbol: 'VTI', assetClass: 'us_stock', value: 70000 },
      { symbol: 'BND', assetClass: 'bond', value: 30000 }
    ])
    const moves = rebalanceDrift(a, { us_stock: 60, bond: 40 })
    const stock = moves.find((m) => m.assetClass === 'us_stock')!
    const bond = moves.find((m) => m.assetClass === 'bond')!
    expect(stock.driftPct).toBe(10)
    expect(stock.dollars).toBe(-10000) // sell 10k of stock
    expect(bond.dollars).toBe(10000) // buy 10k of bonds
  })
})

describe('federalTax2026', () => {
  it('computes single filer tax at 100k taxable (hand-computed from 2026 brackets)', () => {
    // 12400*0.10 + (50400-12400)*0.12 + (100000-50400)*0.22
    // = 1240 + 4560 + 10912 = 16712
    const r = federalTax2026(100000, 'single')
    expect(r.tax).toBe(16712)
    expect(r.marginalRate).toBe(0.22)
    expect(r.bracketRoom).toBe(5700) // 105700 - 100000
  })

  it('computes MFJ tax at 200k taxable', () => {
    // 24800*0.10 + (100800-24800)*0.12 + (200000-100800)*0.22
    // = 2480 + 9120 + 21824 = 33424
    const r = federalTax2026(200000, 'mfj')
    expect(r.tax).toBe(33424)
    expect(r.marginalRate).toBe(0.22)
    expect(r.bracketRoom).toBe(11400) // 211400 - 200000
  })

  it('handles top bracket with infinite room', () => {
    const r = federalTax2026(900000, 'single')
    expect(r.marginalRate).toBe(0.37)
    expect(r.bracketRoom).toBe(Infinity)
  })
})

describe('contributionGap', () => {
  it('computes gap and per-period amount to max', () => {
    const r = contributionGap({
      k401Ytd: 10000,
      age: 35,
      payPeriodsLeft: 10,
      perPeriodContribution: 800
    })
    expect(r.limit).toBe(24500)
    expect(r.gap).toBe(14500)
    expect(r.perPeriodToMax).toBe(1450)
    expect(r.onTrackAtCurrentRate).toBe(false) // 10000 + 8000 < 24500
  })

  it('adds catch-up for age 50+', () => {
    const r = contributionGap({ k401Ytd: 0, age: 52, payPeriodsLeft: 24, perPeriodContribution: 0 })
    expect(r.limit).toBe(32500) // 24500 + 8000
  })
})

describe('harvestCandidates', () => {
  const asOf = new Date('2026-06-10')
  it('finds lots with losses above threshold and classifies term', () => {
    const lots = [
      { id: 1, symbol: 'ARKK', quantity: 100, costBasis: 8000, acquiredAt: '2024-01-15' },
      { id: 2, symbol: 'ARKK', quantity: 50, costBasis: 3000, acquiredAt: '2026-03-01' },
      { id: 3, symbol: 'VTI', quantity: 10, costBasis: 2000, acquiredAt: '2023-01-01' }
    ]
    const prices = { ARKK: 50, VTI: 280 } // ARKK lots underwater; VTI has a gain
    const out = harvestCandidates(lots, prices, asOf)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ lotId: 1, unrealizedLoss: 3000, term: 'long' })
    expect(out[1]).toMatchObject({ lotId: 2, unrealizedLoss: 500, term: 'short' })
  })

  it('ignores losses under $200', () => {
    const out = harvestCandidates(
      [{ id: 1, symbol: 'X', quantity: 1, costBasis: 150, acquiredAt: '2026-01-01' }],
      { X: 10 },
      asOf
    )
    expect(out).toHaveLength(0) // loss of 140 < 200
  })
})

describe('idleCashDrag', () => {
  it('computes drag vs 4% benchmark', () => {
    const r = idleCashDrag([
      { balance: 40000, apy: 0.01 }, // idle checking
      { balance: 10000, apy: 4.2 } // already in HYSA — not idle
    ])
    expect(r.idleTotal).toBe(40000)
    expect(r.annualDrag).toBe(1596) // 40000 * (4.0 - 0.01)/100
  })

  it('returns zero drag when all cash earns near benchmark', () => {
    const r = idleCashDrag([{ balance: 5000, apy: 3.8 }])
    expect(r.idleTotal).toBe(0)
    expect(r.annualDrag).toBe(0)
  })
})
