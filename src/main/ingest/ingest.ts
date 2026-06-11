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

export class IngestService {
  constructor(
    private vm: { db: Db; docsDir: string },
    private provider: LlmProvider
  ) {}

  /** Always read through the holder so vault switches take effect live. */
  private get db(): Db {
    return this.vm.db
  }

  private get vaultDir(): string {
    mkdirSync(this.vm.docsDir, { recursive: true })
    return this.vm.docsDir
  }

  /** Copy file into the local vault, parse it, return a draft for review. */
  async upload(filePath: string, kind: DocKind): Promise<ExtractionDraft> {
    const filename = basename(filePath)
    const vaultPath = join(this.vaultDir, `${Date.now()}-${filename}`)
    copyFileSync(filePath, vaultPath)
    const docId = insertDocument(this.db, { kind, filename, vaultPath })
    try {
      const raw = await this.provider.extract(vaultPath, EXTRACTION_INSTRUCTIONS[kind])
      const parsed = parseJsonLoose<Record<string, unknown>>(raw)
      const lowConfidence = Array.isArray(parsed.lowConfidence)
        ? (parsed.lowConfidence as string[])
        : []
      delete parsed.lowConfidence
      const data = EXTRACTION_SCHEMAS[kind].parse(parsed)
      setDocumentStatus(this.db, docId, 'review')
      return { docId, kind, data, lowConfidence }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDocumentStatus(this.db, docId, 'error', msg)
      throw new Error(`Could not read this document (${msg}). Try a CSV export from your institution.`)
    }
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
