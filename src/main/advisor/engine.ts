import type { Db } from '../store/db'
import {
  latestTaxFacts,
  listCards,
  listCash,
  listHoldings,
  listIncome,
  listLots,
  listProfileFacts,
  saveGeneratedCard,
  setCardStatus,
  upsertCardShell
} from '../store/repos'
import {
  allocation,
  contributionGap,
  federalTax2026,
  harvestCandidates,
  idleCashDrag,
  rebalanceDrift
} from '../finance/math'
import type { AdviceCard, AdviceDomain, Citation, PortfolioSummary } from '../../shared/types'
import type { LlmProvider } from '../llm/provider'
import { parseJsonLoose } from '../llm/claudeProvider'
import { ADVISOR_SYSTEM, cardPrompt } from './prompts'

const ALL_DOMAINS: AdviceDomain[] = [
  'rebalancing',
  'concentration',
  'tax_loss_harvest',
  'contribution_gap',
  'withholding_checkup',
  'idle_cash',
  'roth_vs_traditional'
]

const UNLOCK_HINTS: Record<AdviceDomain, string> = {
  rebalancing: 'Upload a brokerage or 401(k) statement to unlock',
  concentration: 'Upload a brokerage or 401(k) statement to unlock',
  tax_loss_harvest: 'Upload a brokerage statement with cost-basis lots to unlock',
  contribution_gap: 'Upload a pay stub or W-2 to unlock',
  withholding_checkup: 'Upload a pay stub and last year’s tax return to unlock',
  idle_cash: 'Upload a bank statement to unlock',
  roth_vs_traditional: 'Upload a tax return and a pay stub to unlock'
}

/** Default target allocation used when the profile doesn't specify one. */
const DEFAULT_TARGET = { us_stock: 55, intl_stock: 20, bond: 20, cash: 5 }

export class AdvisorEngine {
  constructor(
    private db: Db,
    private provider: LlmProvider
  ) {}

  summary(): PortfolioSummary {
    const holdings = listHoldings(this.db)
    const cash = listCash(this.db)
    const alloc = allocation(holdings)
    const totalCash = cash.reduce((s, c) => s + c.balance, 0)
    return {
      netWorth: Math.round((alloc.total + totalCash) * 100) / 100,
      totalInvested: alloc.total,
      totalCash: Math.round(totalCash * 100) / 100,
      byClass: alloc.byClass,
      bySymbol: alloc.bySymbol.slice(0, 12),
      concentrated: alloc.concentrated,
      hasHoldings: holdings.length > 0,
      hasLots: listLots(this.db).length > 0,
      hasIncome: listIncome(this.db).length > 0,
      hasTaxFacts: !!latestTaxFacts(this.db),
      hasCash: cash.length > 0
    }
  }

  /** Recompute which cards are locked vs available based on present data. */
  refreshAvailability(): AdviceCard[] {
    const s = this.summary()
    const available: Record<AdviceDomain, boolean> = {
      rebalancing: s.hasHoldings,
      concentration: s.hasHoldings && s.concentrated.length > 0,
      tax_loss_harvest: s.hasLots,
      contribution_gap: s.hasIncome,
      withholding_checkup: s.hasIncome && s.hasTaxFacts,
      idle_cash: s.hasCash,
      roth_vs_traditional: s.hasIncome && s.hasTaxFacts
    }
    for (const d of ALL_DOMAINS) {
      upsertCardShell(this.db, d, available[d] ? 'available' : 'locked', UNLOCK_HINTS[d])
    }
    return listCards(this.db)
  }

  /** Deterministic math payload per domain — exact numbers the LLM must use. */
  computeMath(domain: AdviceDomain): Record<string, unknown> {
    const db = this.db
    switch (domain) {
      case 'rebalancing': {
        const alloc = allocation(listHoldings(db))
        return { allocation: alloc, target: DEFAULT_TARGET, moves: rebalanceDrift(alloc, DEFAULT_TARGET) }
      }
      case 'concentration': {
        const alloc = allocation(listHoldings(db))
        return { total: alloc.total, concentrated: alloc.concentrated, thresholdPct: 15 }
      }
      case 'tax_loss_harvest': {
        const holdings = listHoldings(db)
        const prices: Record<string, number> = {}
        for (const h of holdings) prices[h.symbol] = h.price
        const candidates = harvestCandidates(listLots(db), prices, new Date())
        const tax = latestTaxFacts(db)
        return {
          candidates,
          totalHarvestable: candidates.reduce((s, c) => s + c.unrealizedLoss, 0),
          marginalRate: tax ? federalTax2026(tax.taxableIncome, tax.filingStatus).marginalRate : null
        }
      }
      case 'contribution_gap': {
        const inc = listIncome(db)[0]
        const monthsLeft = 12 - new Date().getMonth()
        const periodsPerMonth = { weekly: 4.33, biweekly: 2.17, semimonthly: 2, monthly: 1 }[
          inc.payPeriod
        ]
        const payPeriodsLeft = Math.round(monthsLeft * periodsPerMonth)
        const perPeriod = (inc.annualGross * (inc.k401Rate / 100)) / (52 / (payPeriodsLeft / monthsLeft)) || 0
        return {
          income: inc,
          gap: contributionGap({
            k401Ytd: inc.k401ContribYtd,
            payPeriodsLeft,
            perPeriodContribution: perPeriod
          }),
          payPeriodsLeft
        }
      }
      case 'withholding_checkup': {
        const inc = listIncome(db)[0]
        const tax = latestTaxFacts(db)!
        const est = federalTax2026(Math.max(0, tax.taxableIncome), tax.filingStatus)
        return {
          priorYear: tax,
          estimatedCurrentYearTax: est.tax,
          withheldYtd: inc.withholdingFed,
          safeHarborPriorYear: Math.round(tax.totalTax * (tax.agi > 150000 ? 1.1 : 1.0))
        }
      }
      case 'idle_cash':
        return { ...idleCashDrag(listCash(this.db)) }
      case 'roth_vs_traditional': {
        const tax = latestTaxFacts(db)!
        const cur = federalTax2026(tax.taxableIncome, tax.filingStatus)
        return {
          marginalRate: cur.marginalRate,
          bracketRoom: cur.bracketRoom,
          filingStatus: tax.filingStatus,
          taxableIncome: tax.taxableIncome
        }
      }
    }
  }

  async generateCard(domain: AdviceDomain): Promise<AdviceCard> {
    setCardStatus(this.db, domain, 'generating')
    try {
      const math = this.computeMath(domain)
      const profile = listProfileFacts(this.db)
      const raw = await this.provider.generate(cardPrompt(domain, math, profile), {
        webSearch: true,
        system: ADVISOR_SYSTEM
      })
      const parsed = parseJsonLoose<{
        title: string
        summary: string
        bodyMd: string
        citations: Citation[]
        checklist: string[]
        profileRefs: string[]
      }>(raw)
      saveGeneratedCard(this.db, domain, {
        title: parsed.title,
        summary: parsed.summary,
        bodyMd: parsed.bodyMd,
        citations: parsed.citations ?? [],
        math,
        profileRefs: parsed.profileRefs ?? [],
        checklist: parsed.checklist ?? []
      })
    } catch (e) {
      setCardStatus(this.db, domain, 'available')
      throw e
    }
    return listCards(this.db).find((c) => c.domain === domain)!
  }
}
