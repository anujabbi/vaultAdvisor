import type { Db } from './db'
import type {
  Account,
  AdviceCard,
  AdviceDomain,
  CardStatus,
  CashAccount,
  ChatMessage,
  ChecklistItem,
  Citation,
  DocKind,
  DocStatus,
  DocumentMeta,
  Holding,
  IncomeFact,
  Lot,
  ProfileFact,
  TaxFacts
} from '../../shared/types'

// ---------- documents ----------

export function insertDocument(
  db: Db,
  doc: { kind: DocKind; filename: string; vaultPath: string }
): number {
  const r = db
    .prepare('INSERT INTO documents (kind, filename, vault_path) VALUES (?, ?, ?)')
    .run(doc.kind, doc.filename, doc.vaultPath)
  return Number(r.lastInsertRowid)
}

export function setDocumentStatus(db: Db, id: number, status: DocStatus, error?: string): void {
  db.prepare('UPDATE documents SET status = ?, error = ? WHERE id = ?').run(status, error ?? null, id)
}

export function listDocuments(db: Db): DocumentMeta[] {
  return db
    .prepare('SELECT id, kind, filename, uploaded_at, status, error FROM documents ORDER BY id DESC')
    .all()
    .map((r: any) => ({
      id: r.id,
      kind: r.kind,
      filename: r.filename,
      uploadedAt: r.uploaded_at,
      status: r.status,
      error: r.error ?? undefined
    }))
}

// ---------- accounts / holdings / lots ----------

export function upsertAccount(db: Db, a: Omit<Account, 'id'>): number {
  const existing = db
    .prepare('SELECT id FROM accounts WHERE name = ? AND institution = ?')
    .get(a.name, a.institution) as { id: number } | undefined
  if (existing) return existing.id
  const r = db
    .prepare('INSERT INTO accounts (name, kind, institution) VALUES (?, ?, ?)')
    .run(a.name, a.kind, a.institution)
  return Number(r.lastInsertRowid)
}

export function insertHolding(db: Db, h: Omit<Holding, 'id'>): number {
  const r = db
    .prepare(
      'INSERT INTO holdings (account_id, symbol, name, asset_class, quantity, price, value) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(h.accountId, h.symbol, h.name, h.assetClass, h.quantity, h.price, h.value)
  return Number(r.lastInsertRowid)
}

export function insertLot(db: Db, l: Omit<Lot, 'id'>): number {
  const r = db
    .prepare('INSERT INTO lots (holding_id, quantity, cost_basis, acquired_at) VALUES (?, ?, ?, ?)')
    .run(l.holdingId, l.quantity, l.costBasis, l.acquiredAt)
  return Number(r.lastInsertRowid)
}

export function listHoldings(db: Db): Holding[] {
  return db
    .prepare('SELECT * FROM holdings')
    .all()
    .map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      name: r.name,
      assetClass: r.asset_class,
      quantity: r.quantity,
      price: r.price,
      value: r.value
    }))
}

export function listLots(db: Db): (Lot & { symbol: string })[] {
  return db
    .prepare(
      'SELECT l.*, h.symbol FROM lots l JOIN holdings h ON h.id = l.holding_id'
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      holdingId: r.holding_id,
      quantity: r.quantity,
      costBasis: r.cost_basis,
      acquiredAt: r.acquired_at,
      symbol: r.symbol
    }))
}

export function clearPortfolio(db: Db): void {
  db.exec('DELETE FROM lots; DELETE FROM holdings;')
}

// ---------- income / tax / cash ----------

export function insertIncome(db: Db, i: Omit<IncomeFact, 'id'>): number {
  const r = db
    .prepare(
      'INSERT INTO income (source, annual_gross, withholding_fed, k401_contrib_ytd, k401_rate, pay_period) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(i.source, i.annualGross, i.withholdingFed, i.k401ContribYtd, i.k401Rate, i.payPeriod)
  return Number(r.lastInsertRowid)
}

export function listIncome(db: Db): IncomeFact[] {
  return db
    .prepare('SELECT * FROM income')
    .all()
    .map((r: any) => ({
      id: r.id,
      source: r.source,
      annualGross: r.annual_gross,
      withholdingFed: r.withholding_fed,
      k401ContribYtd: r.k401_contrib_ytd,
      k401Rate: r.k401_rate,
      payPeriod: r.pay_period
    }))
}

export function insertTaxFacts(db: Db, t: Omit<TaxFacts, 'id'>): number {
  const r = db
    .prepare(
      'INSERT INTO tax_facts (year, filing_status, agi, taxable_income, total_tax, effective_rate, std_or_itemized, deductions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      t.year,
      t.filingStatus,
      t.agi,
      t.taxableIncome,
      t.totalTax,
      t.effectiveRate,
      t.stdOrItemized,
      JSON.stringify(t.deductions)
    )
  return Number(r.lastInsertRowid)
}

export function latestTaxFacts(db: Db): TaxFacts | undefined {
  const r = db.prepare('SELECT * FROM tax_facts ORDER BY year DESC LIMIT 1').get() as any
  if (!r) return undefined
  return {
    id: r.id,
    year: r.year,
    filingStatus: r.filing_status,
    agi: r.agi,
    taxableIncome: r.taxable_income,
    totalTax: r.total_tax,
    effectiveRate: r.effective_rate,
    stdOrItemized: r.std_or_itemized,
    deductions: JSON.parse(r.deductions_json)
  }
}

export function insertCash(db: Db, c: Omit<CashAccount, 'id'>): number {
  const r = db
    .prepare('INSERT INTO cash (account_id, balance, apy) VALUES (?, ?, ?)')
    .run(c.accountId, c.balance, c.apy)
  return Number(r.lastInsertRowid)
}

export function listCash(db: Db): CashAccount[] {
  return db
    .prepare('SELECT * FROM cash')
    .all()
    .map((r: any) => ({ id: r.id, accountId: r.account_id, balance: r.balance, apy: r.apy }))
}

// ---------- profile ----------

export function setProfileFact(db: Db, f: Omit<ProfileFact, 'updatedAt'>): void {
  db.prepare(
    `INSERT INTO profile_facts (key, value, source, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at`
  ).run(f.key, f.value, f.source)
}

export function listProfileFacts(db: Db): ProfileFact[] {
  return db
    .prepare('SELECT * FROM profile_facts ORDER BY key')
    .all()
    .map((r: any) => ({ key: r.key, value: r.value, source: r.source, updatedAt: r.updated_at }))
}

// ---------- advice cards / checklists ----------

export function upsertCardShell(db: Db, domain: AdviceDomain, status: CardStatus, unlockHint?: string): number {
  db.prepare(
    `INSERT INTO advice_cards (domain, status, unlock_hint) VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET
       status = CASE WHEN advice_cards.status IN ('generated','dismissed') THEN advice_cards.status ELSE excluded.status END,
       unlock_hint = excluded.unlock_hint`
  ).run(domain, status, unlockHint ?? null)
  const r = db.prepare('SELECT id FROM advice_cards WHERE domain = ?').get(domain) as { id: number }
  return r.id
}

export function saveGeneratedCard(
  db: Db,
  domain: AdviceDomain,
  content: {
    title: string
    summary: string
    bodyMd: string
    citations: Citation[]
    math: Record<string, unknown>
    profileRefs: string[]
    checklist: string[]
  }
): number {
  const id = upsertCardShell(db, domain, 'available')
  db.prepare(
    `UPDATE advice_cards SET status='generated', title=?, summary=?, body_md=?, citations_json=?, math_json=?, profile_refs_json=?, generated_at=datetime('now') WHERE id=?`
  ).run(
    content.title,
    content.summary,
    content.bodyMd,
    JSON.stringify(content.citations),
    JSON.stringify(content.math),
    JSON.stringify(content.profileRefs),
    id
  )
  db.prepare('DELETE FROM checklist_items WHERE card_id = ?').run(id)
  const ins = db.prepare('INSERT INTO checklist_items (card_id, ord, text) VALUES (?, ?, ?)')
  content.checklist.forEach((text, i) => ins.run(id, i, text))
  return id
}

export function setCardStatus(db: Db, domain: AdviceDomain, status: CardStatus): void {
  db.prepare('UPDATE advice_cards SET status = ? WHERE domain = ?').run(status, domain)
}

export function listCards(db: Db): AdviceCard[] {
  const cards = db.prepare('SELECT * FROM advice_cards ORDER BY id').all() as any[]
  const items = db.prepare('SELECT * FROM checklist_items ORDER BY card_id, ord').all() as any[]
  return cards.map((r) => ({
    id: r.id,
    domain: r.domain,
    status: r.status,
    title: r.title,
    summary: r.summary,
    bodyMd: r.body_md,
    citations: JSON.parse(r.citations_json),
    math: JSON.parse(r.math_json),
    profileRefs: JSON.parse(r.profile_refs_json),
    generatedAt: r.generated_at ?? undefined,
    unlockHint: r.unlock_hint ?? undefined,
    checklist: items
      .filter((i) => i.card_id === r.id)
      .map(
        (i): ChecklistItem => ({
          id: i.id,
          cardId: i.card_id,
          ord: i.ord,
          text: i.text,
          done: !!i.done,
          doneAt: i.done_at ?? undefined
        })
      )
  }))
}

export function toggleChecklistItem(db: Db, itemId: number, done: boolean): void {
  db.prepare(
    `UPDATE checklist_items SET done = ?, done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?`
  ).run(done ? 1 : 0, done ? 1 : 0, itemId)
}

// ---------- chat ----------

export function appendChatMessage(db: Db, thread: string, role: 'user' | 'assistant', content: string): number {
  const r = db
    .prepare('INSERT INTO chat_messages (thread, role, content) VALUES (?, ?, ?)')
    .run(thread, role, content)
  return Number(r.lastInsertRowid)
}

export function listChatMessages(db: Db, thread: string): ChatMessage[] {
  return db
    .prepare('SELECT * FROM chat_messages WHERE thread = ? ORDER BY id')
    .all(thread)
    .map((r: any) => ({
      id: r.id,
      thread: r.thread,
      role: r.role,
      content: r.content,
      createdAt: r.created_at
    }))
}
