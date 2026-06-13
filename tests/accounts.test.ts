import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb, type Db } from '../src/main/store/db'
import {
  clearAccountCash,
  clearAccountHoldings,
  deleteAccount,
  deleteCash,
  deleteHolding,
  insertCash,
  insertDocument,
  insertHolding,
  insertLot,
  listAccountsWithItems,
  listCash,
  listDocuments,
  listHoldings,
  listLots,
  renameAccount,
  upsertAccount
} from '../src/main/store/repos'
import { maskAccountNumber } from '../src/main/ingest/mask'
import { IngestService } from '../src/main/ingest/ingest'
import type { LlmProvider } from '../src/main/llm/provider'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
})

describe('maskAccountNumber', () => {
  it('keeps only the last 4 digits behind bullets', () => {
    expect(maskAccountNumber('1234567890')).toBe('••••7890')
  })
  it('ignores non-digit separators', () => {
    expect(maskAccountNumber('XXXX-XX-6789')).toBe('••••6789')
  })
  it('returns empty when fewer than 4 digits', () => {
    expect(maskAccountNumber('12')).toBe('')
    expect(maskAccountNumber('')).toBe('')
    expect(maskAccountNumber(undefined)).toBe('')
  })
})

describe('upsertAccount identity & stamping', () => {
  it('dedupes by (institution, mask) when a mask is present, ignoring name drift', () => {
    const a = upsertAccount(db, { name: 'Individual TOD', kind: 'taxable', institution: 'Fidelity' }, '••••1234')
    const b = upsertAccount(db, { name: 'Brokerage *1234', kind: 'taxable', institution: 'Fidelity' }, '••••1234')
    expect(b).toBe(a)
  })

  it('falls back to (name, institution) when no mask', () => {
    const a = upsertAccount(db, { name: 'Roth', kind: 'roth_ira', institution: 'Vanguard' })
    const b = upsertAccount(db, { name: 'Roth', kind: 'roth_ira', institution: 'Vanguard' })
    expect(b).toBe(a)
  })

  it('never overwrites a user-set friendly name and refreshes last_uploaded_at', () => {
    const id = upsertAccount(db, { name: 'Acct', kind: 'taxable', institution: 'Fidelity' }, '••••1234')
    renameAccount(db, id, 'My fun money')
    const before = listAccountsWithItems(db)[0]

    upsertAccount(db, { name: 'Acct', kind: 'taxable', institution: 'Fidelity' }, '••••1234')
    const after = listAccountsWithItems(db)[0]

    expect(after.friendlyName).toBe('My fun money')
    expect(after.lastUploadedAt).toBeTruthy()
    // upsert always stamps an upload time
    expect(before.lastUploadedAt).toBeTruthy()
  })
})

describe('renameAccount', () => {
  it('updates only the friendly name', () => {
    const id = upsertAccount(db, { name: 'Acct', kind: 'taxable', institution: 'Fidelity' })
    renameAccount(db, id, 'Nest egg')
    const g = listAccountsWithItems(db)[0]
    expect(g.name).toBe('Acct')
    expect(g.friendlyName).toBe('Nest egg')
  })
})

describe('deleteAccount', () => {
  it('removes the account with its holdings, lots and cash but keeps documents', () => {
    insertDocument(db, { kind: 'brokerage', filename: 'f.csv', vaultPath: '/v/f.csv' })
    const id = upsertAccount(db, { name: 'Acct', kind: 'taxable', institution: 'Fidelity' })
    const hId = insertHolding(db, { accountId: id, symbol: 'VTI', name: 'VTI', assetClass: 'us_stock', quantity: 1, price: 1, value: 1 })
    insertLot(db, { holdingId: hId, quantity: 1, costBasis: 1, acquiredAt: '2024-01-01' })
    insertCash(db, { accountId: id, balance: 100, apy: 0 })

    deleteAccount(db, id)

    expect(listAccountsWithItems(db)).toHaveLength(0)
    expect(listHoldings(db)).toHaveLength(0)
    expect(listLots(db)).toHaveLength(0)
    expect(listCash(db)).toHaveLength(0)
    expect(listDocuments(db)).toHaveLength(1)
  })
})

describe('deleteHolding / deleteCash', () => {
  it('deleteHolding removes one holding and its lots', () => {
    const id = upsertAccount(db, { name: 'Acct', kind: 'taxable', institution: 'Fidelity' })
    const keep = insertHolding(db, { accountId: id, symbol: 'VTI', name: 'VTI', assetClass: 'us_stock', quantity: 1, price: 1, value: 1 })
    const drop = insertHolding(db, { accountId: id, symbol: 'NVDA', name: 'NVDA', assetClass: 'us_stock', quantity: 1, price: 1, value: 1 })
    insertLot(db, { holdingId: drop, quantity: 1, costBasis: 1, acquiredAt: '2024-01-01' })

    deleteHolding(db, drop)

    const holdings = listHoldings(db)
    expect(holdings.map((h) => h.id)).toEqual([keep])
    expect(listLots(db)).toHaveLength(0)
  })

  it('deleteCash removes one cash row', () => {
    const id = upsertAccount(db, { name: 'Acct', kind: 'savings', institution: 'Ally' })
    const cashId = insertCash(db, { accountId: id, balance: 100, apy: 4 })
    deleteCash(db, cashId)
    expect(listCash(db)).toHaveLength(0)
  })
})

describe('clearAccountHoldings / clearAccountCash', () => {
  it('clears only the target account', () => {
    const a = upsertAccount(db, { name: 'A', kind: 'taxable', institution: 'Fidelity' })
    const b = upsertAccount(db, { name: 'B', kind: 'taxable', institution: 'Schwab' })
    const ah = insertHolding(db, { accountId: a, symbol: 'VTI', name: 'VTI', assetClass: 'us_stock', quantity: 1, price: 1, value: 1 })
    insertLot(db, { holdingId: ah, quantity: 1, costBasis: 1, acquiredAt: '2024-01-01' })
    insertHolding(db, { accountId: b, symbol: 'NVDA', name: 'NVDA', assetClass: 'us_stock', quantity: 1, price: 1, value: 1 })

    clearAccountHoldings(db, a)

    const holdings = listHoldings(db)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].accountId).toBe(b)
    expect(listLots(db)).toHaveLength(0)
  })
})

describe('listAccountsWithItems', () => {
  it('groups holdings and cash under each account with a total value', () => {
    const a = upsertAccount(db, { name: 'Brokerage', kind: 'taxable', institution: 'Fidelity' }, '••••1234')
    insertHolding(db, { accountId: a, symbol: 'VTI', name: 'VTI', assetClass: 'us_stock', quantity: 10, price: 200, value: 2000 })
    insertHolding(db, { accountId: a, symbol: 'BND', name: 'BND', assetClass: 'bond', quantity: 10, price: 70, value: 700 })
    const b = upsertAccount(db, { name: 'Savings', kind: 'savings', institution: 'Ally' })
    insertCash(db, { accountId: b, balance: 5000, apy: 4.2 })

    const groups = listAccountsWithItems(db)
    expect(groups).toHaveLength(2)

    const brokerage = groups.find((g) => g.id === a)!
    expect(brokerage.accountMask).toBe('••••1234')
    expect(brokerage.items).toHaveLength(2)
    expect(brokerage.totalValue).toBe(2700)
    expect(brokerage.items.every((i) => i.itemType === 'holding')).toBe(true)

    const savings = groups.find((g) => g.id === b)!
    expect(savings.items).toHaveLength(1)
    expect(savings.items[0].itemType).toBe('cash')
    expect(savings.items[0].value).toBe(5000)
    expect(savings.items[0].apy).toBe(4.2)
    expect(savings.totalValue).toBe(5000)
  })
})

// ---- replace-on-reupload through the ingest service ----

function svc(): { ingest: IngestService; db: Db } {
  const docsDir = mkdtempSync(join(tmpdir(), 'va-acct-'))
  const provider = { extract: vi.fn() } as unknown as LlmProvider
  return { ingest: new IngestService({ db, docsDir }, provider), db }
}

const brokerageDoc = (holdings: { symbol: string; value: number }[], accountNumber?: string) => ({
  account: { name: 'Individual', kind: 'taxable' as const, institution: 'Fidelity', accountNumber },
  holdings: holdings.map((h) => ({
    symbol: h.symbol,
    name: h.symbol,
    assetClass: 'us_stock' as const,
    quantity: 1,
    price: h.value,
    value: h.value,
    lots: []
  }))
})

describe('IngestService.confirm replaces an account snapshot', () => {
  it('replaces holdings on re-upload instead of appending, and stores a masked number', () => {
    const { ingest, db } = svc()
    ingest.confirm(0, 'brokerage', brokerageDoc([{ symbol: 'VTI', value: 100 }], '12345678'))
    let groups = listAccountsWithItems(db)
    expect(groups).toHaveLength(1)
    expect(groups[0].accountMask).toBe('••••5678')
    expect(groups[0].items).toHaveLength(1)

    // Re-upload the same account with a different holding set
    ingest.confirm(0, 'brokerage', brokerageDoc([{ symbol: 'NVDA', value: 200 }, { symbol: 'BND', value: 50 }], '12345678'))
    groups = listAccountsWithItems(db)
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.symbol).sort()).toEqual(['BND', 'NVDA'])
  })
})
