import { copyFileSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
import type { Db } from '../store/db'
import {
  insertCash,
  insertDocument,
  insertHolding,
  insertIncome,
  insertLot,
  insertTaxFacts,
  setDocumentStatus,
  upsertAccount
} from '../store/repos'
import type { DocKind, ExtractionDraft } from '../../shared/types'
import type { LlmProvider } from '../llm/provider'
import { parseJsonLoose } from '../llm/claudeProvider'
import { EXTRACTION_INSTRUCTIONS, EXTRACTION_SCHEMAS } from './schemas'
import { parseDocument } from '../parse/registry'
import type { UploadResult } from '../parse/types'

const EMPTY_DRAFT: Record<DocKind, unknown> = {
  brokerage: { account: { name: '', kind: 'taxable', institution: '' }, holdings: [] },
  tax_return: {
    year: new Date().getFullYear() - 1,
    filingStatus: 'single',
    agi: 0,
    taxableIncome: 0,
    totalTax: 0,
    stdOrItemized: 'standard',
    deductions: {}
  },
  paystub: {
    source: '',
    annualGross: 0,
    withholdingFedYtd: 0,
    k401ContribYtd: 0,
    k401Rate: 0,
    payPeriod: 'biweekly'
  },
  bank: { account: { name: '', kind: 'checking', institution: '' }, balance: 0, apy: 0 }
}

export class IngestService {
  constructor(
    private vm: { db: Db; docsDir: string },
    private provider: LlmProvider
  ) {}

  private get db(): Db {
    return this.vm.db
  }

  private get vaultDir(): string {
    mkdirSync(this.vm.docsDir, { recursive: true })
    return this.vm.docsDir
  }

  private vaultPaths = new Map<number, string>()

  /** Phase 1: read the document fully offline and write nothing to the network. */
  async upload(filePath: string, kind: DocKind): Promise<UploadResult> {
    const filename = basename(filePath)
    const vaultPath = join(this.vaultDir, `${Date.now()}-${filename}`)
    copyFileSync(filePath, vaultPath)
    const docId = insertDocument(this.db, { kind, filename, vaultPath })
    this.vaultPaths.set(docId, vaultPath)
    const result = await parseDocument(vaultPath, kind)
    if (result.status === 'parsed') {
      setDocumentStatus(this.db, docId, 'review')
      return {
        kind: 'draft',
        draft: { docId, kind, data: result.data, lowConfidence: result.lowConfidence }
      }
    }
    setDocumentStatus(this.db, docId, 'needs_fallback', result.reason)
    return { kind: 'fallback', docId, docKind: kind, reason: result.reason }
  }

  /** Explicit per-document opt-in: send the raw doc to the user's AI to read. */
  async cloudParse(docId: number, kind: DocKind): Promise<ExtractionDraft> {
    const vaultPath = this.vaultPaths.get(docId) ?? this.lookupVaultPath(docId)
    const raw = await this.provider.extract(vaultPath, EXTRACTION_INSTRUCTIONS[kind])
    const parsed = parseJsonLoose<Record<string, unknown>>(raw)
    const lowConfidence = Array.isArray(parsed.lowConfidence)
      ? (parsed.lowConfidence as string[])
      : []
    delete parsed.lowConfidence
    const data = EXTRACTION_SCHEMAS[kind].parse(parsed)
    setDocumentStatus(this.db, docId, 'review')
    return { docId, kind, data, lowConfidence }
  }

  /** Empty skeleton for fully-offline manual entry. */
  manualDraft(kind: DocKind): ExtractionDraft {
    return { docId: 0, kind, data: structuredClone(EMPTY_DRAFT[kind]), lowConfidence: [] }
  }

  private lookupVaultPath(docId: number): string {
    const row = this.db.prepare('SELECT vault_path FROM documents WHERE id = ?').get(docId) as
      | { vault_path: string }
      | undefined
    if (!row) throw new Error('Document not found')
    return row.vault_path
  }

  /** User confirmed (possibly edited) extraction — persist to the store. */
  confirm(docId: number, kind: DocKind, edited: unknown): void {
    const data = EXTRACTION_SCHEMAS[kind].parse(edited) as any
    const db = this.db
    if (kind === 'brokerage') {
      const accountId = upsertAccount(db, {
        name: data.account.name,
        kind: data.account.kind,
        institution: data.account.institution
      })
      for (const h of data.holdings) {
        const holdingId = insertHolding(db, {
          accountId,
          symbol: h.symbol,
          name: h.name,
          assetClass: h.assetClass,
          quantity: h.quantity,
          price: h.price,
          value: h.value
        })
        for (const lot of h.lots ?? []) {
          insertLot(db, {
            holdingId,
            quantity: lot.quantity,
            costBasis: lot.costBasis,
            acquiredAt: lot.acquiredAt
          })
        }
      }
    } else if (kind === 'tax_return') {
      insertTaxFacts(db, {
        year: data.year,
        filingStatus: data.filingStatus,
        agi: data.agi,
        taxableIncome: data.taxableIncome,
        totalTax: data.totalTax,
        effectiveRate: data.agi > 0 ? Math.round((data.totalTax / data.agi) * 10000) / 100 : 0,
        stdOrItemized: data.stdOrItemized,
        deductions: data.deductions ?? {}
      })
    } else if (kind === 'paystub') {
      insertIncome(db, {
        source: data.source,
        annualGross: data.annualGross,
        withholdingFed: data.withholdingFedYtd,
        k401ContribYtd: data.k401ContribYtd,
        k401Rate: data.k401Rate ?? 0,
        payPeriod: data.payPeriod
      })
    } else if (kind === 'bank') {
      const accountId = upsertAccount(db, {
        name: data.account.name,
        kind: data.account.kind,
        institution: data.account.institution
      })
      insertCash(db, { accountId, balance: data.balance, apy: data.apy ?? 0 })
    }
    setDocumentStatus(db, docId, 'confirmed')
  }
}
