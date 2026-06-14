import { describe, expect, it } from 'vitest'
import { openDb } from '../src/main/store/db'
import { seedJohnDoe } from '../src/main/sample/johnDoe'
import {
  latestTaxFacts,
  listCards,
  listCash,
  listChatMessages,
  listDocuments,
  listHoldings,
  listIncome,
  listLots,
  listProfileFacts
} from '../src/main/store/repos'
import { AdvisorEngine } from '../src/main/advisor/engine'

describe('John Doe demo seed', () => {
  const db = openDb(':memory:')
  seedJohnDoe(db)

  it('populates every section', () => {
    expect(listDocuments(db).length).toBe(5)
    expect(listHoldings(db).length).toBe(6)
    expect(listLots(db).length).toBe(9)
    expect(listIncome(db).length).toBe(1)
    expect(latestTaxFacts(db)?.year).toBe(2025)
    expect(listCash(db).length).toBe(2)
    expect(listProfileFacts(db).length).toBe(7)
    expect(listChatMessages(db, 'advisor').length).toBe(4)
  })

  it('pre-generates all seven advice cards with citations and checklists', () => {
    const cards = listCards(db)
    expect(cards).toHaveLength(7)
    for (const c of cards) {
      expect(c.status).toBe('generated')
      expect(c.citations.length).toBeGreaterThanOrEqual(2)
      expect(c.checklist.length).toBeGreaterThanOrEqual(2)
      expect(c.bodyMd).toContain('## The math')
    }
    const idle = cards.find((c) => c.domain === 'idle_cash')!
    expect(idle.checklist.filter((i) => i.done)).toHaveLength(2)
  })

  it('produces a summary the dashboard math agrees with', () => {
    // engine only reads; provider is never called for the summary
    const engine = new AdvisorEngine({ db }, null as never)
    const s = engine.summary()
    expect(s.totalInvested).toBe(165150)
    expect(s.totalCash).toBe(57000)
    expect(s.netWorth).toBe(222150)
    expect(s.concentrated.map((c) => c.symbol)).toContain('NVDA')
    expect(s.hasHoldings && s.hasLots && s.hasIncome && s.hasTaxFacts && s.hasCash).toBe(true)
  })
})
