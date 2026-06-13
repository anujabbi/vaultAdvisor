// DTOs shared between main and renderer. Plain JSON-serializable shapes only.

export type DocKind = 'brokerage' | 'tax_return' | 'paystub' | 'bank'

export type DocStatus = 'parsing' | 'review' | 'confirmed' | 'error' | 'needs_fallback'

export interface DocumentMeta {
  id: number
  kind: DocKind
  filename: string
  uploadedAt: string
  status: DocStatus
  error?: string
}

export interface Holding {
  id: number
  accountId: number
  symbol: string
  name: string
  assetClass: AssetClass
  quantity: number
  price: number
  value: number
}

export type AssetClass =
  | 'us_stock'
  | 'intl_stock'
  | 'bond'
  | 'cash'
  | 'real_estate'
  | 'crypto'
  | 'other'

export interface Lot {
  id: number
  holdingId: number
  quantity: number
  costBasis: number
  acquiredAt: string
}

export interface Account {
  id: number
  name: string
  kind: 'taxable' | 'k401' | 'ira' | 'roth_ira' | 'hsa' | 'checking' | 'savings'
  institution: string
}

/** One row in the Accounts view: a holding or a cash balance. */
export interface AssetItem {
  itemType: 'holding' | 'cash'
  id: number
  symbol?: string
  name?: string
  assetClass?: AssetClass
  quantity?: number
  price?: number
  apy?: number
  /** holding value, or cash balance */
  value: number
}

/** An account with its assets, for the grouped Accounts view. */
export interface AccountGroup {
  id: number
  name: string
  friendlyName: string
  institution: string
  kind: Account['kind']
  accountMask: string
  lastUploadedAt?: string
  totalValue: number
  items: AssetItem[]
}

export interface IncomeFact {
  id: number
  source: string
  annualGross: number
  withholdingFed: number
  k401ContribYtd: number
  k401Rate: number
  payPeriod: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
}

export interface TaxFacts {
  id: number
  year: number
  filingStatus: FilingStatus
  agi: number
  taxableIncome: number
  totalTax: number
  effectiveRate: number
  stdOrItemized: 'standard' | 'itemized'
  deductions: Record<string, number>
}

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh'

export interface CashAccount {
  id: number
  accountId: number
  balance: number
  apy: number
}

export interface ProfileFact {
  key: string
  value: string
  source: 'conversation' | 'manual' | 'inferred'
  updatedAt: string
}

export type AdviceDomain =
  | 'rebalancing'
  | 'concentration'
  | 'tax_loss_harvest'
  | 'contribution_gap'
  | 'withholding_checkup'
  | 'idle_cash'
  | 'roth_vs_traditional'

export type CardStatus = 'locked' | 'available' | 'generating' | 'generated' | 'dismissed' | 'stale'

export interface Citation {
  title: string
  url: string
  quote: string
}

export interface ChecklistItem {
  id: number
  cardId: number
  ord: number
  text: string
  done: boolean
  doneAt?: string
}

export interface AdviceCard {
  id: number
  domain: AdviceDomain
  status: CardStatus
  title: string
  summary: string
  bodyMd: string
  citations: Citation[]
  math: Record<string, unknown>
  profileRefs: string[]
  generatedAt?: string
  unlockHint?: string
  checklist: ChecklistItem[]
}

export interface ChatMessage {
  id: number
  thread: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface PortfolioSummary {
  netWorth: number
  totalInvested: number
  totalCash: number
  byClass: Record<string, number>
  bySymbol: { symbol: string; value: number; pct: number }[]
  concentrated: { symbol: string; pct: number }[]
  hasHoldings: boolean
  hasLots: boolean
  hasIncome: boolean
  hasTaxFacts: boolean
  hasCash: boolean
}

export interface AuthStatus {
  provider: 'claude'
  authenticated: boolean
  detail?: string
}

export interface HeroScenario {
  id: string
  domain: AdviceDomain
  headline: string
  subline: string
  savings: string
  bodyMd: string
  unlockDocKind: DocKind
  unlockCta: string
}

export interface ExtractionDraft {
  docId: number
  kind: DocKind
  /** Parsed payload matching the kind's schema; renderer renders an editable view. */
  data: unknown
  /** dotted paths of low-confidence fields to highlight */
  lowConfidence: string[]
}

export interface StreamChunk {
  requestId: string
  delta?: string
  done?: boolean
  error?: string
}

/** Result of a Phase-1 (offline) document upload: a parsed draft or a fallback. */
export type UploadResult =
  | { kind: 'draft'; draft: ExtractionDraft }
  | { kind: 'fallback'; docId: number; docKind: DocKind; reason: string }
