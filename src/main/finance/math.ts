// Deterministic finance math. Pure functions — no I/O, no LLM.
// The advice engine computes these and hands exact numbers to the LLM for explanation.
import type { CashAccount, FilingStatus, Holding } from '../../shared/types'
import { BRACKETS_2026, HYSA_BENCHMARK_APY, LIMITS_2026 } from './constants2026'

export const CONCENTRATION_THRESHOLD_PCT = 15

export interface AllocationResult {
  total: number
  byClass: Record<string, number> // class -> percent (0-100)
  bySymbol: { symbol: string; value: number; pct: number }[]
  concentrated: { symbol: string; pct: number }[]
}

export function allocation(holdings: Pick<Holding, 'symbol' | 'assetClass' | 'value'>[]): AllocationResult {
  const total = holdings.reduce((s, h) => s + h.value, 0)
  const byClassValue = new Map<string, number>()
  const bySymbolValue = new Map<string, number>()
  for (const h of holdings) {
    byClassValue.set(h.assetClass, (byClassValue.get(h.assetClass) ?? 0) + h.value)
    bySymbolValue.set(h.symbol, (bySymbolValue.get(h.symbol) ?? 0) + h.value)
  }
  const pct = (v: number): number => (total === 0 ? 0 : (v / total) * 100)
  const byClass: Record<string, number> = {}
  for (const [k, v] of byClassValue) byClass[k] = round2(pct(v))
  const bySymbol = [...bySymbolValue.entries()]
    .map(([symbol, value]) => ({ symbol, value: round2(value), pct: round2(pct(value)) }))
    .sort((a, b) => b.value - a.value)
  const concentrated = bySymbol
    .filter((s) => s.pct > CONCENTRATION_THRESHOLD_PCT)
    .map(({ symbol, pct }) => ({ symbol, pct }))
  return { total: round2(total), byClass, bySymbol, concentrated }
}

export interface RebalanceMove {
  assetClass: string
  currentPct: number
  targetPct: number
  driftPct: number
  dollars: number // positive = buy, negative = sell
}

export function rebalanceDrift(
  alloc: AllocationResult,
  targetPctByClass: Record<string, number>
): RebalanceMove[] {
  const classes = new Set([...Object.keys(alloc.byClass), ...Object.keys(targetPctByClass)])
  const moves: RebalanceMove[] = []
  for (const c of classes) {
    const current = alloc.byClass[c] ?? 0
    const target = targetPctByClass[c] ?? 0
    const drift = round2(current - target)
    if (Math.abs(drift) < 0.005) continue
    moves.push({
      assetClass: c,
      currentPct: current,
      targetPct: target,
      driftPct: drift,
      dollars: round2(((target - current) / 100) * alloc.total)
    })
  }
  return moves.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))
}

export interface FederalTaxResult {
  tax: number
  marginalRate: number
  /** dollars of taxable income remaining before the next bracket */
  bracketRoom: number
}

export function federalTax2026(taxableIncome: number, filingStatus: FilingStatus): FederalTaxResult {
  const brackets = BRACKETS_2026[filingStatus]
  let tax = 0
  let prev = 0
  let marginalRate = brackets[0].rate
  let bracketRoom = 0
  for (const b of brackets) {
    if (taxableIncome > prev) {
      const inBracket = Math.min(taxableIncome, b.upTo) - prev
      tax += inBracket * b.rate
      marginalRate = b.rate
      bracketRoom = b.upTo === Infinity ? Infinity : round2(b.upTo - taxableIncome)
    }
    prev = b.upTo
  }
  return { tax: round2(tax), marginalRate, bracketRoom }
}

export interface ContributionGapResult {
  limit: number
  gap: number
  perPeriodToMax: number
  onTrackAtCurrentRate: boolean
}

export function contributionGap(input: {
  k401Ytd: number
  age?: number
  payPeriodsLeft: number
  perPeriodContribution: number
}): ContributionGapResult {
  const limit =
    LIMITS_2026.k401Elective + ((input.age ?? 0) >= 50 ? LIMITS_2026.k401CatchUp50 : 0)
  const gap = Math.max(0, round2(limit - input.k401Ytd))
  const perPeriodToMax = input.payPeriodsLeft > 0 ? round2(gap / input.payPeriodsLeft) : gap
  const projected = input.k401Ytd + input.perPeriodContribution * input.payPeriodsLeft
  return { limit, gap, perPeriodToMax, onTrackAtCurrentRate: projected >= limit }
}

export interface HarvestCandidate {
  symbol: string
  lotId: number
  quantity: number
  costBasis: number
  marketValue: number
  unrealizedLoss: number // positive number = size of the loss
  term: 'short' | 'long'
}

export const HARVEST_MIN_LOSS = 200

export function harvestCandidates(
  lots: { id: number; symbol: string; quantity: number; costBasis: number; acquiredAt: string }[],
  priceBySymbol: Record<string, number>,
  asOf: Date
): HarvestCandidate[] {
  const out: HarvestCandidate[] = []
  for (const lot of lots) {
    const price = priceBySymbol[lot.symbol]
    if (price === undefined) continue
    const marketValue = price * lot.quantity
    const loss = lot.costBasis - marketValue
    if (loss <= HARVEST_MIN_LOSS) continue
    const acquired = new Date(lot.acquiredAt)
    const oneYearLater = new Date(acquired)
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
    out.push({
      symbol: lot.symbol,
      lotId: lot.id,
      quantity: lot.quantity,
      costBasis: round2(lot.costBasis),
      marketValue: round2(marketValue),
      unrealizedLoss: round2(loss),
      term: asOf > oneYearLater ? 'long' : 'short'
    })
  }
  return out.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss)
}

export interface IdleCashResult {
  idleTotal: number
  weightedApy: number
  annualDrag: number // dollars/year lost vs benchmark
  benchmarkApy: number
}

export function idleCashDrag(
  cash: Pick<CashAccount, 'balance' | 'apy'>[],
  benchmarkApy: number = HYSA_BENCHMARK_APY
): IdleCashResult {
  const idle = cash.filter((c) => c.apy < benchmarkApy - 0.5)
  const idleTotal = idle.reduce((s, c) => s + c.balance, 0)
  const weightedApy =
    idleTotal === 0 ? 0 : idle.reduce((s, c) => s + c.balance * c.apy, 0) / idleTotal
  const annualDrag = (idleTotal * (benchmarkApy - weightedApy)) / 100
  return {
    idleTotal: round2(idleTotal),
    weightedApy: round2(weightedApy),
    annualDrag: round2(annualDrag),
    benchmarkApy
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
