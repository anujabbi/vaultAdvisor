import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, type Db } from '../src/main/store/db'
import {
  appendChatMessage,
  insertHolding,
  insertLot,
  listCards,
  listChatMessages,
  listHoldings,
  listLots,
  listProfileFacts,
  saveGeneratedCard,
  setProfileFact,
  toggleChecklistItem,
  upsertAccount,
  upsertCardShell
} from '../src/main/store/repos'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
})

describe('portfolio repos', () => {
  it('round-trips accounts, holdings and lots', () => {
    const accountId = upsertAccount(db, { name: 'Brokerage', kind: 'taxable', institution: 'Fidelity' })
    // upsert is idempotent on (name, institution)
    expect(upsertAccount(db, { name: 'Brokerage', kind: 'taxable', institution: 'Fidelity' })).toBe(accountId)

    const holdingId = insertHolding(db, {
      accountId,
      symbol: 'VTI',
      name: 'Vanguard Total Stock',
      assetClass: 'us_stock',
      quantity: 100,
      price: 280,
      value: 28000
    })
    insertLot(db, { holdingId, quantity: 60, costBasis: 12000, acquiredAt: '2023-05-01' })
    insertLot(db, { holdingId, quantity: 40, costBasis: 11000, acquiredAt: '2025-11-01' })

    expect(listHoldings(db)).toHaveLength(1)
    const lots = listLots(db)
    expect(lots).toHaveLength(2)
    expect(lots[0].symbol).toBe('VTI')
  })
})

describe('profile facts', () => {
  it('upserts by key', () => {
    setProfileFact(db, { key: 'risk_appetite', value: 'moderate', source: 'conversation' })
    setProfileFact(db, { key: 'risk_appetite', value: 'aggressive', source: 'manual' })
    const facts = listProfileFacts(db)
    expect(facts).toHaveLength(1)
    expect(facts[0].value).toBe('aggressive')
    expect(facts[0].source).toBe('manual')
  })
})

describe('advice cards and checklists', () => {
  it('saves a generated card with checklist and toggles items', () => {
    saveGeneratedCard(db, 'idle_cash', {
      title: 'Move idle cash',
      summary: '$40k earning 0.01%',
      bodyMd: '## Why\n...',
      citations: [{ title: 'FDIC rates', url: 'https://www.fdic.gov', quote: '...' }],
      math: { idleTotal: 40000 },
      profileRefs: ['emergency_fund_months'],
      checklist: ['Open HYSA', 'Transfer $40k', 'Confirm APY']
    })
    const [card] = listCards(db)
    expect(card.status).toBe('generated')
    expect(card.checklist).toHaveLength(3)
    expect(card.citations[0].url).toContain('fdic.gov')

    toggleChecklistItem(db, card.checklist[0].id, true)
    const [after] = listCards(db)
    expect(after.checklist[0].done).toBe(true)
    expect(after.checklist[0].doneAt).toBeTruthy()

    toggleChecklistItem(db, card.checklist[0].id, false)
    const [reverted] = listCards(db)
    expect(reverted.checklist[0].done).toBe(false)
    expect(reverted.checklist[0].doneAt).toBeUndefined()
  })

  it('upsertCardShell does not downgrade a generated card to available', () => {
    saveGeneratedCard(db, 'idle_cash', {
      title: 't',
      summary: 's',
      bodyMd: 'b',
      citations: [],
      math: {},
      profileRefs: [],
      checklist: []
    })
    upsertCardShell(db, 'idle_cash', 'available')
    const [card] = listCards(db)
    expect(card.status).toBe('generated')
  })
})

describe('chat', () => {
  it('appends and lists by thread', () => {
    appendChatMessage(db, 'advisor', 'user', 'hello')
    appendChatMessage(db, 'advisor', 'assistant', 'hi')
    appendChatMessage(db, 'profiling:1', 'assistant', 'I noticed...')
    expect(listChatMessages(db, 'advisor')).toHaveLength(2)
    expect(listChatMessages(db, 'profiling:1')).toHaveLength(1)
  })
})
