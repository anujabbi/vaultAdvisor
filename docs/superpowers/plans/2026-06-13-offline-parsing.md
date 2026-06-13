# Offline Document Parsing & Consented Advice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document reading fully offline (pure-JS readers + per-institution templates → local SQLite), with a two-choice fallback (manual entry / explicit per-document AI parse), and move advice into a separate, permissioned phase on de-identified data.

**Architecture:** A new `src/main/parse/` module reads files locally (papaparse/SheetJS/pdfjs-dist) into a normalized `RawDocument`, then a template registry maps it to the existing zod extraction schemas. `IngestService` calls the local parser on the happy path and only invokes the legacy Claude `provider.extract` path when the user explicitly consents per-document. Advice/profiling/chat are gated behind a separate, remembered advice-consent + sign-in.

**Tech Stack:** Electron + TypeScript, Vitest (run under Electron-as-Node), papaparse, xlsx (SheetJS), pdfjs-dist (legacy Node build), zod.

---

## File structure

```
src/main/parse/
  types.ts          # RawDocument, Template, ParseResult, UploadResult
  readers.ts        # readDocument(filePath) -> RawDocument (csv/xlsx/pdf)
  registry.ts       # parseDocument(filePath, kind) -> ParseResult; ordered TEMPLATES
  templates/
    fidelityBrokerage.ts
    schwabBrokerage.ts
    vanguardBrokerage.ts
    genericBrokerageCsv.ts
    form1040.ts
src/main/ingest/ingest.ts   # MODIFY: local parse + cloudParse + manualDraft
src/main/settings.ts        # MODIFY: adviceConsent
src/main/ipc.ts             # MODIFY: fallback flow, advice gating
src/preload/index.ts        # MODIFY: new docs.* + advice.* api
src/renderer/src/components/UploadFlow.tsx  # MODIFY: fallback choice + parse consent
src/renderer/src/App.tsx                    # MODIFY: advice gating, profiling move, auth off upload
tests/parse.readers.test.ts
tests/parse.templates.test.ts
tests/parse.registry.test.ts
tests/ingest.test.ts
tests/fixtures/                              # sample csv/xlsx/pdf
```

---

### Task 1: Dependencies and parse types

**Files:**
- Modify: `package.json`
- Create: `src/main/parse/types.ts`

- [ ] **Step 1: Install pure-JS parser deps**

Run: `npm install papaparse xlsx pdfjs-dist && npm install -D @types/papaparse`
Expected: added to dependencies; no native build steps (all pure JS).

- [ ] **Step 2: Create the parse types**

```ts
// src/main/parse/types.ts
import type { DocKind, ExtractionDraft } from '../../shared/types'

export type RawFormat = 'csv' | 'xlsx' | 'pdf-text' | 'pdf-scanned' | 'unknown'

export interface RawDocument {
  format: RawFormat
  /** csv/xlsx rows; [] for pdf */
  rows: string[][]
  /** pdf text lines; [] for csv/xlsx */
  textLines: string[]
}

export interface TemplateOutput {
  data: unknown // conforms to EXTRACTION_SCHEMAS[docKind]
  lowConfidence: string[]
}

export interface Template {
  id: string
  docKind: DocKind
  label: string
  detect(raw: RawDocument): boolean
  map(raw: RawDocument): TemplateOutput
}

export type ParseResult =
  | { status: 'parsed'; templateId: string; data: unknown; lowConfidence: string[] }
  | { status: 'needs_fallback'; reason: 'no_template' | 'scanned_pdf' | 'unreadable' }

export type UploadResult =
  | { kind: 'draft'; draft: ExtractionDraft }
  | { kind: 'fallback'; docId: number; docKind: DocKind; reason: string }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes (types only; `ExtractionDraft` already exists in shared/types.ts).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main/parse/types.ts
git commit -m "feat(parse): add pure-JS parser deps and parse types"
```

---

### Task 2: Local readers (CSV / XLSX / PDF)

**Files:**
- Create: `src/main/parse/readers.ts`
- Create: `tests/parse.readers.test.ts`
- Create fixtures: `tests/fixtures/fidelity.csv`, `tests/fixtures/positions.xlsx` (generated in Step 1)

- [ ] **Step 1: Create text fixtures and an XLSX fixture generator**

Create `tests/fixtures/fidelity.csv`:

```
Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total
Individual TOD,NVDA,NVIDIA CORP,250,172.00,43000.00,25500.00
Individual TOD,VTI,VANGUARD TOTAL STOCK MKT ETF,120,285.00,34200.00,26400.00
```

Create `tests/fixtures/make-xlsx.cjs` and run it once to emit `positions.xlsx`:

```js
// tests/fixtures/make-xlsx.cjs
const XLSX = require('xlsx')
const rows = [
  ['Symbol', 'Shares', 'Price', 'Value'],
  ['VOO', '50', '500', '25000'],
  ['BND', '100', '73', '7300']
]
const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Positions')
XLSX.writeFile(wb, require('path').join(__dirname, 'positions.xlsx'))
console.log('wrote positions.xlsx')
```

Run: `node tests/fixtures/make-xlsx.cjs`
Expected: `wrote positions.xlsx`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/parse.readers.test.ts
import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { readDocument } from '../src/main/parse/readers'

const fx = (f: string): string => join(__dirname, 'fixtures', f)

describe('readDocument', () => {
  it('reads a CSV into rows', async () => {
    const raw = await readDocument(fx('fidelity.csv'))
    expect(raw.format).toBe('csv')
    expect(raw.rows[0]).toContain('Symbol')
    expect(raw.rows[1]).toContain('NVDA')
    expect(raw.rows).toHaveLength(3) // header + 2 holdings
  })

  it('reads an XLSX into rows', async () => {
    const raw = await readDocument(fx('positions.xlsx'))
    expect(raw.format).toBe('xlsx')
    expect(raw.rows[0]).toContain('Symbol')
    expect(raw.rows[1][0]).toBe('VOO')
  })

  it('flags a non-existent / unreadable file as unknown', async () => {
    const raw = await readDocument(fx('does-not-exist.csv'))
    expect(raw.format).toBe('unknown')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- parse.readers`
Expected: FAIL ("readDocument is not a function" / module not found).

- [ ] **Step 4: Implement readers**

```ts
// src/main/parse/readers.ts
import { readFileSync } from 'fs'
import { extname } from 'path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { RawDocument } from './types'

export async function readDocument(filePath: string): Promise<RawDocument> {
  const ext = extname(filePath).toLowerCase()
  try {
    if (ext === '.csv') return readCsv(filePath)
    if (ext === '.xlsx' || ext === '.xls') return readXlsx(filePath)
    if (ext === '.pdf') return await readPdf(filePath)
    return empty('unknown')
  } catch {
    return empty('unknown')
  }
}

function empty(format: RawDocument['format']): RawDocument {
  return { format, rows: [], textLines: [] }
}

function readCsv(filePath: string): RawDocument {
  const text = readFileSync(filePath, 'utf8')
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  return { format: 'csv', rows: parsed.data as string[][], textLines: [] }
}

function readXlsx(filePath: string): RawDocument {
  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
  return { format: 'xlsx', rows: rows as string[][], textLines: [] }
}

async function readPdf(filePath: string): Promise<RawDocument> {
  // Legacy build runs under Node (no DOM). Dynamic import keeps it out of the
  // CJS require graph (pdfjs is ESM).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(filePath))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pageText = content.items.map((i: { str?: string }) => i.str ?? '').join(' ')
    if (pageText.trim()) lines.push(...pageText.split('\n'))
  }
  if (lines.join('').trim().length === 0) return empty('pdf-scanned')
  return { format: 'pdf-text', rows: [], textLines: lines }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- parse.readers`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/parse/readers.ts tests/parse.readers.test.ts tests/fixtures/
git commit -m "feat(parse): local CSV/XLSX/PDF readers"
```

---

### Task 3: Template registry and detection

**Files:**
- Create: `src/main/parse/registry.ts`
- Create: `tests/parse.registry.test.ts`

Depends on the templates from Tasks 4-7, but the registry is written first against a stub template list and verified end-to-end after templates exist. To keep TDD honest, this task tests registry behavior with an inline fake template.

- [ ] **Step 1: Write the failing test (with inline fake templates)**

```ts
// tests/parse.registry.test.ts
import { describe, expect, it } from 'vitest'
import { selectTemplate, validateOrFallback } from '../src/main/parse/registry'
import type { RawDocument, Template } from '../src/main/parse/types'

const fakeBrokerage: Template = {
  id: 'fake-brokerage',
  docKind: 'brokerage',
  label: 'Fake',
  detect: (raw) => raw.rows[0]?.includes('FAKEMARK') ?? false,
  map: () => ({
    data: { account: { name: 'A', kind: 'taxable', institution: 'Fake' }, holdings: [] },
    lowConfidence: []
  })
}

const raw = (rows: string[][]): RawDocument => ({ format: 'csv', rows, textLines: [] })

describe('selectTemplate', () => {
  it('returns the first template whose detect matches the kind', () => {
    const t = selectTemplate(raw([['FAKEMARK', 'Symbol']]), 'brokerage', [fakeBrokerage])
    expect(t?.id).toBe('fake-brokerage')
  })
  it('returns undefined when nothing matches', () => {
    expect(selectTemplate(raw([['x']]), 'brokerage', [fakeBrokerage])).toBeUndefined()
  })
  it('ignores templates for a different docKind', () => {
    expect(selectTemplate(raw([['FAKEMARK']]), 'bank', [fakeBrokerage])).toBeUndefined()
  })
})

describe('validateOrFallback', () => {
  it('passes valid data through', () => {
    const r = validateOrFallback('brokerage', { account: { name: 'A', kind: 'taxable', institution: 'F' }, holdings: [] }, [])
    expect(r.status).toBe('parsed')
  })
  it('falls back when data fails the zod schema', () => {
    const r = validateOrFallback('brokerage', { nope: true }, [])
    expect(r).toEqual({ status: 'needs_fallback', reason: 'no_template' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parse.registry`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry**

```ts
// src/main/parse/registry.ts
import type { DocKind } from '../../shared/types'
import { EXTRACTION_SCHEMAS } from '../ingest/schemas'
import { readDocument } from './readers'
import type { ParseResult, RawDocument, Template } from './types'
import { fidelityBrokerage } from './templates/fidelityBrokerage'
import { schwabBrokerage } from './templates/schwabBrokerage'
import { vanguardBrokerage } from './templates/vanguardBrokerage'
import { form1040 } from './templates/form1040'
import { genericBrokerageCsv } from './templates/genericBrokerageCsv'

// Order matters: specific institution templates first, generic fallback last.
export const TEMPLATES: Template[] = [
  fidelityBrokerage,
  schwabBrokerage,
  vanguardBrokerage,
  form1040,
  genericBrokerageCsv
]

export function selectTemplate(
  raw: RawDocument,
  kind: DocKind,
  templates: Template[] = TEMPLATES
): Template | undefined {
  return templates.find((t) => t.docKind === kind && safeDetect(t, raw))
}

function safeDetect(t: Template, raw: RawDocument): boolean {
  try {
    return t.detect(raw)
  } catch {
    return false
  }
}

export function validateOrFallback(
  kind: DocKind,
  data: unknown,
  lowConfidence: string[]
): ParseResult {
  const parsed = EXTRACTION_SCHEMAS[kind].safeParse(data)
  if (!parsed.success) return { status: 'needs_fallback', reason: 'no_template' }
  return { status: 'parsed', templateId: 'validated', data: parsed.data, lowConfidence }
}

export async function parseDocument(filePath: string, kind: DocKind): Promise<ParseResult> {
  const raw = await readDocument(filePath)
  if (raw.format === 'pdf-scanned') return { status: 'needs_fallback', reason: 'scanned_pdf' }
  if (raw.format === 'unknown') return { status: 'needs_fallback', reason: 'unreadable' }
  const template = selectTemplate(raw, kind)
  if (!template) return { status: 'needs_fallback', reason: 'no_template' }
  let out
  try {
    out = template.map(raw)
  } catch {
    return { status: 'needs_fallback', reason: 'no_template' }
  }
  const result = validateOrFallback(kind, out.data, out.lowConfidence)
  if (result.status === 'parsed') return { ...result, templateId: template.id }
  return result
}
```

Note: this task imports templates created in Tasks 4-7. Implement Task 3's `selectTemplate`/`validateOrFallback` first (the test only needs those), then create stub template files so the module imports resolve:

```ts
// temporary stubs — replaced in Tasks 4-7. Create each file with:
// export const fidelityBrokerage = { id:'fidelity-brokerage', docKind:'brokerage', label:'Fidelity', detect:()=>false, map:()=>({data:{},lowConfidence:[]}) } as import('../types').Template
```

- [ ] **Step 4: Create the five stub template files** so `registry.ts` compiles (each replaced in later tasks):

For each of `fidelityBrokerage.ts`, `schwabBrokerage.ts`, `vanguardBrokerage.ts`, `genericBrokerageCsv.ts` (docKind `'brokerage'`) and `form1040.ts` (docKind `'tax_return'`), create:

```ts
// src/main/parse/templates/fidelityBrokerage.ts  (repeat per file with matching id/label/docKind)
import type { Template } from '../types'
export const fidelityBrokerage: Template = {
  id: 'fidelity-brokerage',
  docKind: 'brokerage',
  label: 'Fidelity',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- parse.registry`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/parse/registry.ts src/main/parse/templates/ tests/parse.registry.test.ts
git commit -m "feat(parse): template registry, detection, and zod-validated fallback"
```

---

### Task 4: Fidelity brokerage template

**Files:**
- Modify: `src/main/parse/templates/fidelityBrokerage.ts`
- Create: `tests/parse.templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/parse.templates.test.ts
import { describe, expect, it } from 'vitest'
import { fidelityBrokerage } from '../src/main/parse/templates/fidelityBrokerage'
import type { RawDocument } from '../src/main/parse/types'

const fidelityRaw: RawDocument = {
  format: 'csv',
  textLines: [],
  rows: [
    ['Account Name', 'Symbol', 'Description', 'Quantity', 'Last Price', 'Current Value', 'Cost Basis Total'],
    ['Individual TOD', 'NVDA', 'NVIDIA CORP', '250', '172.00', '43000.00', '25500.00'],
    ['Individual TOD', 'VTI', 'VANGUARD TOTAL STOCK MKT ETF', '120', '285.00', '34200.00', '26400.00']
  ]
}

describe('fidelityBrokerage template', () => {
  it('detects a Fidelity positions CSV', () => {
    expect(fidelityBrokerage.detect(fidelityRaw)).toBe(true)
  })
  it('maps rows to holdings with lots from cost basis', () => {
    const { data } = fidelityBrokerage.map(fidelityRaw) as any
    expect(data.account.institution).toBe('Fidelity')
    expect(data.holdings).toHaveLength(2)
    const nvda = data.holdings[0]
    expect(nvda).toMatchObject({ symbol: 'NVDA', quantity: 250, price: 172, value: 43000 })
    expect(nvda.lots[0]).toMatchObject({ quantity: 250, costBasis: 25500 })
  })
  it('does not detect a non-Fidelity CSV', () => {
    expect(fidelityBrokerage.detect({ format: 'csv', textLines: [], rows: [['Ticker', 'Shares']] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parse.templates`
Expected: FAIL (stub returns detect=false, map={}).

- [ ] **Step 3: Implement the Fidelity template**

```ts
// src/main/parse/templates/fidelityBrokerage.ts
import type { Template } from '../types'
import { classifyAssetClass, num, headerIndex } from './shared'

const REQUIRED = ['Account Name', 'Symbol', 'Quantity', 'Current Value']

export const fidelityBrokerage: Template = {
  id: 'fidelity-brokerage',
  docKind: 'brokerage',
  label: 'Fidelity',
  detect(raw) {
    const header = raw.rows[0] ?? []
    return REQUIRED.every((c) => header.includes(c)) && header.includes('Cost Basis Total')
  },
  map(raw) {
    const header = raw.rows[0]
    const i = {
      account: headerIndex(header, 'Account Name'),
      symbol: headerIndex(header, 'Symbol'),
      desc: headerIndex(header, 'Description'),
      qty: headerIndex(header, 'Quantity'),
      price: headerIndex(header, 'Last Price'),
      value: headerIndex(header, 'Current Value'),
      basis: headerIndex(header, 'Cost Basis Total')
    }
    const accountName = raw.rows[1]?.[i.account] || 'Brokerage'
    const holdings = raw.rows.slice(1).filter((r) => r[i.symbol]).map((r) => {
      const quantity = num(r[i.qty])
      const value = num(r[i.value])
      const basis = num(r[i.basis])
      return {
        symbol: r[i.symbol].trim().toUpperCase(),
        name: (r[i.desc] ?? '').trim(),
        assetClass: classifyAssetClass(r[i.symbol], r[i.desc] ?? ''),
        quantity,
        price: num(r[i.price]),
        value,
        lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
      }
    })
    return {
      data: { account: { name: accountName, kind: 'taxable', institution: 'Fidelity' }, holdings },
      lowConfidence: holdings.some((h) => h.lots[0] && !h.lots[0].acquiredAt) ? ['holdings.*.lots.*.acquiredAt'] : []
    }
  }
}
```

- [ ] **Step 4: Create the shared template helpers**

```ts
// src/main/parse/templates/shared.ts
import type { AssetClass } from '../../../shared/types'

export function num(s: string | undefined): number {
  if (!s) return 0
  const n = Number(String(s).replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function headerIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
}

const BOND_HINT = /\b(bond|treasury|bnd|agg|govt|tips|muni)\b/i
const INTL_HINT = /\b(international|intl|emerging|ex-us|vxus|vea|vwo|ixus)\b/i
const CASH_HINT = /\b(money market|cash|sweep|spaxx|fdrxx)\b/i

export function classifyAssetClass(symbol: string, name: string): AssetClass {
  const s = `${symbol} ${name}`
  if (CASH_HINT.test(s)) return 'cash'
  if (BOND_HINT.test(s)) return 'bond'
  if (INTL_HINT.test(s)) return 'intl_stock'
  return 'us_stock'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- parse.templates`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/parse/templates/fidelityBrokerage.ts src/main/parse/templates/shared.ts tests/parse.templates.test.ts
git commit -m "feat(parse): Fidelity brokerage template + shared helpers"
```

---

### Task 5: Schwab and Vanguard brokerage templates

**Files:**
- Modify: `src/main/parse/templates/schwabBrokerage.ts`, `src/main/parse/templates/vanguardBrokerage.ts`
- Modify: `tests/parse.templates.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/parse.templates.test.ts`:

```ts
import { schwabBrokerage } from '../src/main/parse/templates/schwabBrokerage'
import { vanguardBrokerage } from '../src/main/parse/templates/vanguardBrokerage'

describe('schwabBrokerage template', () => {
  const raw: RawDocument = {
    format: 'csv', textLines: [],
    rows: [
      ['Symbol', 'Description', 'Qty', 'Price', 'Market Value', 'Cost Basis'],
      ['SCHB', 'SCHWAB US BROAD MARKET ETF', '300', '22.00', '6600.00', '5000.00']
    ]
  }
  it('detects and maps Schwab', () => {
    expect(schwabBrokerage.detect(raw)).toBe(true)
    const { data } = schwabBrokerage.map(raw) as any
    expect(data.account.institution).toBe('Schwab')
    expect(data.holdings[0]).toMatchObject({ symbol: 'SCHB', quantity: 300, value: 6600 })
    expect(data.holdings[0].lots[0]).toMatchObject({ costBasis: 5000 })
  })
})

describe('vanguardBrokerage template', () => {
  const raw: RawDocument = {
    format: 'csv', textLines: [],
    rows: [
      ['Fund Account Number', 'Investment Name', 'Symbol', 'Shares', 'Share Price', 'Total Value'],
      ['12345', 'Vanguard Total Stock Market Index', 'VTSAX', '100', '120.00', '12000.00']
    ]
  }
  it('detects and maps Vanguard (no cost basis column → no lots)', () => {
    expect(vanguardBrokerage.detect(raw)).toBe(true)
    const { data } = vanguardBrokerage.map(raw) as any
    expect(data.account.institution).toBe('Vanguard')
    expect(data.holdings[0]).toMatchObject({ symbol: 'VTSAX', quantity: 100, value: 12000 })
    expect(data.holdings[0].lots).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- parse.templates`
Expected: FAIL (stubs).

- [ ] **Step 3: Implement Schwab**

```ts
// src/main/parse/templates/schwabBrokerage.ts
import type { Template } from '../types'
import { classifyAssetClass, headerIndex, num } from './shared'

export const schwabBrokerage: Template = {
  id: 'schwab-brokerage',
  docKind: 'brokerage',
  label: 'Schwab',
  detect(raw) {
    const h = raw.rows[0] ?? []
    return h.includes('Symbol') && h.includes('Market Value') && h.includes('Qty')
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      symbol: headerIndex(h, 'Symbol'), desc: headerIndex(h, 'Description'),
      qty: headerIndex(h, 'Qty'), price: headerIndex(h, 'Price'),
      value: headerIndex(h, 'Market Value'), basis: headerIndex(h, 'Cost Basis')
    }
    const holdings = raw.rows.slice(1).filter((r) => r[i.symbol]).map((r) => {
      const quantity = num(r[i.qty]); const basis = i.basis >= 0 ? num(r[i.basis]) : 0
      return {
        symbol: r[i.symbol].trim().toUpperCase(), name: (r[i.desc] ?? '').trim(),
        assetClass: classifyAssetClass(r[i.symbol], r[i.desc] ?? ''),
        quantity, price: num(r[i.price]), value: num(r[i.value]),
        lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
      }
    })
    return { data: { account: { name: 'Schwab Brokerage', kind: 'taxable', institution: 'Schwab' }, holdings }, lowConfidence: [] }
  }
}
```

- [ ] **Step 4: Implement Vanguard**

```ts
// src/main/parse/templates/vanguardBrokerage.ts
import type { Template } from '../types'
import { classifyAssetClass, headerIndex, num } from './shared'

export const vanguardBrokerage: Template = {
  id: 'vanguard-brokerage',
  docKind: 'brokerage',
  label: 'Vanguard',
  detect(raw) {
    const h = raw.rows[0] ?? []
    return h.includes('Investment Name') && h.includes('Shares') && h.includes('Total Value')
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      name: headerIndex(h, 'Investment Name'), symbol: headerIndex(h, 'Symbol'),
      shares: headerIndex(h, 'Shares'), price: headerIndex(h, 'Share Price'),
      value: headerIndex(h, 'Total Value')
    }
    const holdings = raw.rows.slice(1).filter((r) => r[i.symbol] || r[i.name]).map((r) => ({
      symbol: (r[i.symbol] || r[i.name]).trim().toUpperCase(),
      name: (r[i.name] ?? '').trim(),
      assetClass: classifyAssetClass(r[i.symbol] ?? '', r[i.name] ?? ''),
      quantity: num(r[i.shares]), price: num(r[i.price]), value: num(r[i.value]), lots: []
    }))
    return { data: { account: { name: 'Vanguard', kind: 'taxable', institution: 'Vanguard' }, holdings }, lowConfidence: [] }
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- parse.templates`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/parse/templates/schwabBrokerage.ts src/main/parse/templates/vanguardBrokerage.ts tests/parse.templates.test.ts
git commit -m "feat(parse): Schwab and Vanguard brokerage templates"
```

---

### Task 6: Generic brokerage CSV fallback template

**Files:**
- Modify: `src/main/parse/templates/genericBrokerageCsv.ts`
- Modify: `tests/parse.templates.test.ts`

- [ ] **Step 1: Add failing test**

```ts
import { genericBrokerageCsv } from '../src/main/parse/templates/genericBrokerageCsv'

describe('genericBrokerageCsv template', () => {
  it('maps a generic ticker/shares/value CSV', () => {
    const raw: RawDocument = {
      format: 'csv', textLines: [],
      rows: [['Ticker', 'Shares', 'Value'], ['AAPL', '10', '2000']]
    }
    expect(genericBrokerageCsv.detect(raw)).toBe(true)
    const { data } = genericBrokerageCsv.map(raw) as any
    expect(data.holdings[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, value: 2000 })
  })
  it('does not detect when there is no symbol-like and value-like column', () => {
    expect(genericBrokerageCsv.detect({ format: 'csv', textLines: [], rows: [['foo', 'bar'], ['1', '2']] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- parse.templates`
Expected: FAIL.

- [ ] **Step 3: Implement generic fallback**

```ts
// src/main/parse/templates/genericBrokerageCsv.ts
import type { Template } from '../types'
import { classifyAssetClass, num } from './shared'

const SYMBOL_COLS = ['symbol', 'ticker', 'security']
const QTY_COLS = ['quantity', 'shares', 'qty', 'units']
const VALUE_COLS = ['value', 'market value', 'current value', 'total value']
const PRICE_COLS = ['price', 'last price', 'share price']
const NAME_COLS = ['description', 'name', 'investment name', 'security name']
const BASIS_COLS = ['cost basis', 'cost basis total', 'cost']

function find(header: string[], names: string[]): number {
  return header.findIndex((h) => names.includes(h.trim().toLowerCase()))
}

export const genericBrokerageCsv: Template = {
  id: 'generic-brokerage-csv',
  docKind: 'brokerage',
  label: 'Generic CSV',
  detect(raw) {
    if (raw.format !== 'csv' && raw.format !== 'xlsx') return false
    const h = raw.rows[0] ?? []
    return find(h, SYMBOL_COLS) >= 0 && find(h, VALUE_COLS) >= 0
  },
  map(raw) {
    const h = raw.rows[0]
    const i = {
      symbol: find(h, SYMBOL_COLS), qty: find(h, QTY_COLS), value: find(h, VALUE_COLS),
      price: find(h, PRICE_COLS), name: find(h, NAME_COLS), basis: find(h, BASIS_COLS)
    }
    const holdings = raw.rows.slice(1).filter((r) => r[i.symbol]).map((r) => {
      const quantity = i.qty >= 0 ? num(r[i.qty]) : 0
      const basis = i.basis >= 0 ? num(r[i.basis]) : 0
      return {
        symbol: r[i.symbol].trim().toUpperCase(),
        name: i.name >= 0 ? (r[i.name] ?? '').trim() : '',
        assetClass: classifyAssetClass(r[i.symbol], i.name >= 0 ? r[i.name] ?? '' : ''),
        quantity, price: i.price >= 0 ? num(r[i.price]) : 0, value: num(r[i.value]),
        lots: basis > 0 ? [{ quantity, costBasis: basis, acquiredAt: '' }] : []
      }
    })
    return {
      data: { account: { name: 'Brokerage', kind: 'taxable', institution: '' }, holdings },
      lowConfidence: ['account.institution']
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- parse.templates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/parse/templates/genericBrokerageCsv.ts tests/parse.templates.test.ts
git commit -m "feat(parse): generic brokerage CSV fallback template"
```

---

### Task 7: Form 1040 template (text PDF)

**Files:**
- Modify: `src/main/parse/templates/form1040.ts`
- Modify: `tests/parse.templates.test.ts`

- [ ] **Step 1: Add failing test**

```ts
import { form1040 } from '../src/main/parse/templates/form1040'

describe('form1040 template', () => {
  const raw: RawDocument = {
    format: 'pdf-text', rows: [],
    textLines: [
      'Form 1040 U.S. Individual Income Tax Return 2025',
      'Filing Status: Single',
      '11 Adjusted gross income 158,400',
      '15 Taxable income 142,300',
      '22 Total tax 27,800',
      'Standard Deduction 15,000'
    ]
  }
  it('detects a 1040 by its form markers', () => {
    expect(form1040.detect(raw)).toBe(true)
  })
  it('maps the standard 1040 line items', () => {
    const { data } = form1040.map(raw) as any
    expect(data).toMatchObject({
      year: 2025, filingStatus: 'single', agi: 158400, taxableIncome: 142300, totalTax: 27800, stdOrItemized: 'standard'
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- parse.templates`
Expected: FAIL.

- [ ] **Step 3: Implement form1040**

```ts
// src/main/parse/templates/form1040.ts
import type { FilingStatus } from '../../../shared/types'
import type { Template } from '../types'
import { num } from './shared'

function firstMatch(lines: string[], re: RegExp): string | undefined {
  for (const l of lines) {
    const m = l.match(re)
    if (m) return m[1]
  }
  return undefined
}

function filingStatus(text: string): FilingStatus {
  if (/married filing jointly|filing status:\s*mfj|qualifying/i.test(text)) return 'mfj'
  if (/married filing separately|filing status:\s*mfs/i.test(text)) return 'mfs'
  if (/head of household|filing status:\s*hoh/i.test(text)) return 'hoh'
  return 'single'
}

export const form1040: Template = {
  id: 'form-1040',
  docKind: 'tax_return',
  label: 'IRS Form 1040',
  detect(raw) {
    const text = raw.textLines.join(' ')
    return /form\s*1040/i.test(text) && /adjusted gross income|taxable income/i.test(text)
  },
  map(raw) {
    const lines = raw.textLines
    const text = lines.join(' ')
    const year = num(firstMatch(lines, /20(\d{2})/)?.replace(/^/, '20')) || new Date().getFullYear() - 1
    const agi = num(firstMatch(lines, /adjusted gross income[^\d]*([\d,]+)/i))
    const taxableIncome = num(firstMatch(lines, /taxable income[^\d]*([\d,]+)/i))
    const totalTax = num(firstMatch(lines, /total tax[^\d]*([\d,]+)/i))
    const stdOrItemized = /itemized|schedule a/i.test(text) ? 'itemized' : 'standard'
    const lowConfidence: string[] = []
    if (!agi) lowConfidence.push('agi')
    if (!taxableIncome) lowConfidence.push('taxableIncome')
    if (!totalTax) lowConfidence.push('totalTax')
    return {
      data: { year: Number(firstMatch(lines, /\b(20\d{2})\b/)) || year, filingStatus: filingStatus(text), agi, taxableIncome, totalTax, stdOrItemized, deductions: {} },
      lowConfidence
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- parse.templates`
Expected: PASS.

- [ ] **Step 5: Run the full registry + readers + templates suite**

Run: `npm test -- parse`
Expected: all parse tests PASS (registry now wired to real templates).

- [ ] **Step 6: Commit**

```bash
git add src/main/parse/templates/form1040.ts tests/parse.templates.test.ts
git commit -m "feat(parse): IRS Form 1040 text-PDF template"
```

---

### Task 8: IngestService — local parse, cloudParse, manualDraft

**Files:**
- Modify: `src/main/ingest/ingest.ts`
- Create: `tests/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb } from '../src/main/store/db'
import { listHoldings } from '../src/main/store/repos'
import { IngestService } from '../src/main/ingest/ingest'
import type { LlmProvider } from '../src/main/llm/provider'

function svc() {
  const db = openDb(':memory:')
  const docsDir = mkdtempSync(join(tmpdir(), 'va-ingest-'))
  const provider = { extract: vi.fn() } as unknown as LlmProvider
  return { db, ingest: new IngestService({ db, docsDir }, provider), provider }
}

const fidelityCsv = [
  'Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total',
  'Individual TOD,NVDA,NVIDIA CORP,250,172.00,43000.00,25500.00'
].join('\n')

describe('IngestService.upload', () => {
  it('parses a known brokerage CSV locally without calling the provider', async () => {
    const { ingest, provider, docsDir } = { ...svc(), docsDir: mkdtempSync(join(tmpdir(), 'va-src-')) }
    const file = join(docsDir, 'fidelity.csv')
    writeFileSync(file, fidelityCsv)
    const res = await ingest.upload(file, 'brokerage')
    expect(res.kind).toBe('draft')
    expect(provider.extract).not.toHaveBeenCalled()
    if (res.kind === 'draft') expect((res.draft.data as any).holdings[0].symbol).toBe('NVDA')
  })

  it('returns a fallback for an unrecognized document', async () => {
    const { ingest } = svc()
    const src = mkdtempSync(join(tmpdir(), 'va-src-'))
    const file = join(src, 'mystery.csv')
    writeFileSync(file, 'foo,bar\n1,2')
    const res = await ingest.upload(file, 'brokerage')
    expect(res.kind).toBe('fallback')
    if (res.kind === 'fallback') expect(res.reason).toBe('no_template')
  })
})

describe('IngestService.cloudParse', () => {
  it('delegates to the provider and validates', async () => {
    const { ingest, provider, db } = svc()
    ;(provider.extract as any).mockResolvedValue(
      JSON.stringify({ account: { name: 'X', kind: 'taxable', institution: 'Y' }, holdings: [] })
    )
    const src = mkdtempSync(join(tmpdir(), 'va-src-'))
    const file = join(src, 'scan.pdf')
    writeFileSync(file, '%PDF-1.4 fake')
    const up = await ingest.upload(file, 'brokerage') // pdf with no text -> fallback
    expect(up.kind).toBe('fallback')
    if (up.kind === 'fallback') {
      const draft = await ingest.cloudParse(up.docId, 'brokerage')
      expect(provider.extract).toHaveBeenCalled()
      expect((draft.data as any).account.institution).toBe('Y')
    }
  })
})

describe('IngestService.manualDraft', () => {
  it('returns an empty skeleton for the kind', () => {
    const { ingest } = svc()
    const d = ingest.manualDraft('bank')
    expect(d.kind).toBe('bank')
    expect((d.data as any).account).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- ingest`
Expected: FAIL (upload returns old shape; cloudParse/manualDraft missing).

- [ ] **Step 3: Rewrite IngestService**

```ts
// src/main/ingest/ingest.ts
import { copyFileSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
import type { Db } from '../store/db'
import {
  insertCash, insertDocument, insertHolding, insertIncome, insertLot,
  insertTaxFacts, setDocumentStatus, upsertAccount
} from '../store/repos'
import type { DocKind, ExtractionDraft } from '../../shared/types'
import type { LlmProvider } from '../llm/provider'
import { parseJsonLoose } from '../llm/claudeProvider'
import { EXTRACTION_INSTRUCTIONS, EXTRACTION_SCHEMAS } from './schemas'
import { parseDocument } from '../parse/registry'
import type { UploadResult } from '../parse/types'

const EMPTY_DRAFT: Record<DocKind, unknown> = {
  brokerage: { account: { name: '', kind: 'taxable', institution: '' }, holdings: [] },
  tax_return: { year: new Date().getFullYear() - 1, filingStatus: 'single', agi: 0, taxableIncome: 0, totalTax: 0, stdOrItemized: 'standard', deductions: {} },
  paystub: { source: '', annualGross: 0, withholdingFedYtd: 0, k401ContribYtd: 0, k401Rate: 0, payPeriod: 'biweekly' },
  bank: { account: { name: '', kind: 'checking', institution: '' }, balance: 0, apy: 0 }
}

export class IngestService {
  constructor(private vm: { db: Db; docsDir: string }, private provider: LlmProvider) {}
  private get db(): Db { return this.vm.db }
  private get vaultDir(): string { mkdirSync(this.vm.docsDir, { recursive: true }); return this.vm.docsDir }

  private vaultPaths = new Map<number, string>()

  async upload(filePath: string, kind: DocKind): Promise<UploadResult> {
    const filename = basename(filePath)
    const vaultPath = join(this.vaultDir, `${Date.now()}-${filename}`)
    copyFileSync(filePath, vaultPath)
    const docId = insertDocument(this.db, { kind, filename, vaultPath })
    this.vaultPaths.set(docId, vaultPath)
    const result = await parseDocument(vaultPath, kind)
    if (result.status === 'parsed') {
      setDocumentStatus(this.db, docId, 'review')
      return { kind: 'draft', draft: { docId, kind, data: result.data, lowConfidence: result.lowConfidence } }
    }
    setDocumentStatus(this.db, docId, 'error', result.reason)
    return { kind: 'fallback', docId, docKind: kind, reason: result.reason }
  }

  /** Explicit per-document opt-in: send the raw doc to the user's AI to read. */
  async cloudParse(docId: number, kind: DocKind): Promise<ExtractionDraft> {
    const vaultPath = this.vaultPaths.get(docId) ?? this.lookupVaultPath(docId)
    const raw = await this.provider.extract(vaultPath, EXTRACTION_INSTRUCTIONS[kind])
    const parsed = parseJsonLoose<Record<string, unknown>>(raw)
    const lowConfidence = Array.isArray(parsed.lowConfidence) ? (parsed.lowConfidence as string[]) : []
    delete parsed.lowConfidence
    const data = EXTRACTION_SCHEMAS[kind].parse(parsed)
    setDocumentStatus(this.db, docId, 'review')
    return { docId, kind, data, lowConfidence }
  }

  manualDraft(kind: DocKind): ExtractionDraft {
    return { docId: 0, kind, data: structuredClone(EMPTY_DRAFT[kind]), lowConfidence: [] }
  }

  private lookupVaultPath(docId: number): string {
    const row = this.db.prepare('SELECT vault_path FROM documents WHERE id = ?').get(docId) as { vault_path: string } | undefined
    if (!row) throw new Error('Document not found')
    return row.vault_path
  }

  confirm(docId: number, kind: DocKind, edited: unknown): void {
    const data = EXTRACTION_SCHEMAS[kind].parse(edited) as any
    const db = this.db
    if (kind === 'brokerage') {
      const accountId = upsertAccount(db, { name: data.account.name, kind: data.account.kind, institution: data.account.institution })
      for (const h of data.holdings) {
        const holdingId = insertHolding(db, { accountId, symbol: h.symbol, name: h.name, assetClass: h.assetClass, quantity: h.quantity, price: h.price, value: h.value })
        for (const lot of h.lots ?? []) insertLot(db, { holdingId, quantity: lot.quantity, costBasis: lot.costBasis, acquiredAt: lot.acquiredAt })
      }
    } else if (kind === 'tax_return') {
      insertTaxFacts(db, { year: data.year, filingStatus: data.filingStatus, agi: data.agi, taxableIncome: data.taxableIncome, totalTax: data.totalTax, effectiveRate: data.agi > 0 ? Math.round((data.totalTax / data.agi) * 10000) / 100 : 0, stdOrItemized: data.stdOrItemized, deductions: data.deductions ?? {} })
    } else if (kind === 'paystub') {
      insertIncome(db, { source: data.source, annualGross: data.annualGross, withholdingFed: data.withholdingFedYtd, k401ContribYtd: data.k401ContribYtd, k401Rate: data.k401Rate ?? 0, payPeriod: data.payPeriod })
    } else if (kind === 'bank') {
      const accountId = upsertAccount(db, { name: data.account.name, kind: data.account.kind, institution: data.account.institution })
      insertCash(db, { accountId, balance: data.balance, apy: data.apy ?? 0 })
    }
    setDocumentStatus(db, docId, 'confirmed')
  }
}
```

- [ ] **Step 4: Add the `needs_fallback` status to the DocStatus type**

In `src/shared/types.ts`, change `DocStatus`:

```ts
export type DocStatus = 'parsing' | 'review' | 'confirmed' | 'error' | 'needs_fallback'
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- ingest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/ingest/ingest.ts src/shared/types.ts tests/ingest.test.ts
git commit -m "feat(ingest): local-first parse with manual + per-doc AI fallback"
```

---

### Task 9: Settings — advice consent

**Files:**
- Modify: `src/main/settings.ts`

- [ ] **Step 1: Extend the settings shape**

In `src/main/settings.ts`, update the `Settings` interface and defaults:

```ts
interface Settings {
  vault: VaultName
  adviceConsent: boolean
}

const DEFAULTS: Settings = { vault: 'personal', adviceConsent: false }
```

(`readSettings` already spreads `{ ...DEFAULTS, ...raw }`, so older files without the key default to `false`.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/main/settings.ts
git commit -m "feat(settings): remembered advice-consent flag"
```

---

### Task 10: IPC + preload — fallback flow and advice gating

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update IPC handlers**

In `src/main/ipc.ts`: replace the `docs:*` and add advice-consent handlers. Key changes:

```ts
// docs:pick / docs:uploadPath now return UploadResult (draft | fallback)
ipcMain.handle('docs:pick', async (e, kind: DocKind) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a document',
    filters: [{ name: 'Statements', extensions: ['pdf', 'csv', 'xlsx', 'xls'] }],
    properties: ['openFile']
  })
  if (r.canceled || r.filePaths.length === 0) return null
  return ingest.upload(r.filePaths[0], kind)
})
ipcMain.handle('docs:cloudParse', (_e, docId: number, kind: DocKind) => ingest.cloudParse(docId, kind))
ipcMain.handle('docs:manualDraft', (_e, kind: DocKind) => ingest.manualDraft(kind))

// docs:confirm no longer opens profiling; just saves + refreshes availability
ipcMain.handle('docs:confirm', (_e, docId: number, kind: DocKind, edited: unknown) => {
  ingest.confirm(docId, kind, edited)
  engine.refreshAvailability()
})

// advice consent (remembered)
ipcMain.handle('advice:consent:get', () => readSettings(app.getPath('userData')).adviceConsent)
ipcMain.handle('advice:consent:set', (_e, v: boolean) => {
  const userData = app.getPath('userData')
  writeSettings(userData, { ...readSettings(userData), adviceConsent: v })
  return v
})
// profiling now starts on demand in phase 2
ipcMain.handle('advice:startProfiling', () => chat.openProfilingFromData())
```

Remove the old `docs:confirm`→`chat.openProfiling` wiring. Add `ChatService.openProfilingFromData()` that builds the opener from the current SQL summary (see Task 11 note). Import `readSettings, writeSettings` and `app` are already imported (app added in Task earlier; ensure import present).

- [ ] **Step 2: Add `openProfilingFromData` to ChatService**

In `src/main/chat/chat.ts`, add:

```ts
async openProfilingFromData(): Promise<ChatMessage[]> {
  const thread = 'profiling:main'
  if (this.history(thread).length > 0) return this.history(thread)
  const s = this.engine.summary()
  const opener = await this.provider.generate(
    profilingOpener('your portfolio', JSON.stringify(s).slice(0, 1500)),
    { system: ADVISOR_SYSTEM }
  )
  appendChatMessage(this.db, thread, 'assistant', opener)
  return this.history(thread)
}
```

- [ ] **Step 3: Update preload API**

In `src/preload/index.ts`, update `docs` and add `advice`:

```ts
docs: {
  pick: (kind: DocKind): Promise<UploadResult | null> => ipcRenderer.invoke('docs:pick', kind),
  cloudParse: (docId: number, kind: DocKind): Promise<ExtractionDraft> => ipcRenderer.invoke('docs:cloudParse', docId, kind),
  manualDraft: (kind: DocKind): Promise<ExtractionDraft> => ipcRenderer.invoke('docs:manualDraft', kind),
  confirm: (docId: number, kind: DocKind, edited: unknown): Promise<void> => ipcRenderer.invoke('docs:confirm', docId, kind, edited),
  list: (): Promise<DocumentMeta[]> => ipcRenderer.invoke('docs:list')
},
advice: {
  consentGet: (): Promise<boolean> => ipcRenderer.invoke('advice:consent:get'),
  consentSet: (v: boolean): Promise<boolean> => ipcRenderer.invoke('advice:consent:set', v),
  startProfiling: (): Promise<ChatMessage[]> => ipcRenderer.invoke('advice:startProfiling')
},
```

Import `UploadResult` from `../main/parse/types` and `ExtractionDraft` from `../shared/types` at the top of preload.

- [ ] **Step 4: Build to verify wiring compiles**

Run: `npm run build`
Expected: main + preload + renderer bundle without type errors. (Renderer references updated in Tasks 11-12; if the build flags renderer calls, proceed — they are fixed there. Run `npm run typecheck` after Task 12.)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/chat/chat.ts src/preload/index.ts
git commit -m "feat(ipc): upload fallback, per-doc cloud parse, advice consent"
```

---

### Task 11: Renderer — UploadFlow fallback choice + parse consent

**Files:**
- Modify: `src/renderer/src/components/UploadFlow.tsx`

- [ ] **Step 1: Add fallback + consent phases to UploadFlow**

Replace the `pick()` handler and add phases `'fallback'` and `'consent'`. After `window.vault.docs.pick(kind)` returns:

```ts
async function pick(): Promise<void> {
  setPhase('parsing')
  try {
    const res = await window.vault.docs.pick(props.kind)
    if (!res) { setPhase('pick'); return }
    if (res.kind === 'draft') { setDraft(res.draft); setEdited(res.draft.data); setPhase('review'); return }
    // fallback
    setFallback(res) // { docId, reason }
    setPhase('fallback')
  } catch (e) {
    props.onError(e instanceof Error ? e.message : String(e)); props.onClose()
  }
}

async function chooseManual(): Promise<void> {
  const d = await window.vault.docs.manualDraft(props.kind)
  setDraft(d); setEdited(d.data); setPhase('review')
}

async function chooseCloud(): Promise<void> {
  if (!fallback) return
  setPhase('parsing')
  try {
    const d = await window.vault.docs.cloudParse(fallback.docId, props.kind)
    setDraft(d); setEdited(d.data); setPhase('review')
  } catch (e) {
    props.onError(e instanceof Error ? e.message : String(e)); setPhase('fallback')
  }
}
```

Render for `phase === 'fallback'`:

```tsx
{phase === 'fallback' && (
  <>
    <h2 className="serif" style={{ fontSize: 26, marginBottom: 8 }}>I couldn’t read this one offline</h2>
    <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 20 }}>
      {fallback?.reason === 'scanned_pdf'
        ? 'This looks like a scanned image with no text to read. '
        : 'This institution or layout isn’t recognized yet. '}
      Choose how to proceed:
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="btn-brass" onClick={chooseManual}>Enter it manually — stays on this machine</button>
      <button className="btn-ghost" onClick={() => setPhase('consent')}>Use my AI to read it…</button>
      <button className="btn-quiet" onClick={props.onClose}>Cancel</button>
    </div>
  </>
)}

{phase === 'consent' && (
  <>
    <h2 className="serif" style={{ fontSize: 26, marginBottom: 8 }}>Send this document to your AI?</h2>
    <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 8 }}>
      To read it, this <strong>one document</strong> — including any account numbers it contains — will be
      sent to your own Claude account. Nothing is stored by VaultAdvisor, and only this document is sent.
    </p>
    <p style={{ color: 'var(--parchment-faint)', fontSize: 12.5, marginBottom: 20 }}>
      Tip: a CSV export from your institution can usually be read fully offline.
    </p>
    <div style={{ display: 'flex', gap: 12 }}>
      <button className="btn-brass" onClick={chooseCloud}>Send & read</button>
      <button className="btn-quiet" onClick={() => setPhase('fallback')}>Back</button>
    </div>
  </>
)}
```

Add state: `const [fallback, setFallback] = useState<{ docId: number; reason: string } | null>(null)` and extend the `phase` union to include `'fallback' | 'consent'`. The `'review'` branch and `confirm()` are unchanged except `confirm()` now calls `window.vault.docs.confirm(...)` (returns void) and then `props.onConfirmed()` with no args (signature change in Task 12).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes once Task 12's `onConfirmed` signature is updated. If run standalone, expect the `onConfirmed` mismatch — fixed in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/UploadFlow.tsx
git commit -m "feat(ui): offline-fail fallback with manual / per-doc AI consent"
```

---

### Task 12: Renderer — advice gating, profiling move, auth off upload

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Remove auth gate from upload; gate advice instead**

In `App.tsx`:

- `startUpload(kind)` no longer checks auth — upload is offline. Simplify to `setUploadKind(kind)`.
- `onConfirmed` no longer receives profiling messages: change `UploadFlow`'s `onConfirmed` to `() => { setUploadKind(null); refresh(); showToast('Saved to your vault.') }`.
- Add advice-consent state: `const [adviceConsent, setAdviceConsent] = useState(false)`, load via `window.vault.advice.consentGet().then(setAdviceConsent)` in the initial `useEffect`.
- Add a gate function used by "Generate", chat, and profiling entry points:

```ts
async function ensureAdvice(): Promise<boolean> {
  if (!adviceConsent) {
    setShowConsent(true) // a modal; on accept: await window.vault.advice.consentSet(true); setAdviceConsent(true)
    return false
  }
  const a = auth ?? (await window.vault.auth.status())
  setAuth(a)
  if (!a.authenticated) { showToast('Sign in with Claude to get advice.', true); return false }
  return true
}
```

- `generate(domain)` becomes: `if (!(await ensureAdvice())) return;` then the existing generate logic.
- Opening the advisor chat and profiling go through `ensureAdvice()` too.

- [ ] **Step 2: Add the advice-consent modal**

```tsx
{showConsent && (
  <div className="overlay" onClick={() => setShowConsent(false)}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2 className="serif" style={{ fontSize: 26, marginBottom: 10 }}>Turn on advice?</h2>
      <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 8 }}>
        To analyze your finances, VaultAdvisor sends your <strong>de-identified summary</strong> —
        holdings, amounts, and tax brackets — to your own Claude account. It never sends account
        numbers or your SSN (those were never stored).
      </p>
      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button className="btn-brass" onClick={async () => {
          await window.vault.advice.consentSet(true); setAdviceConsent(true); setShowConsent(false)
        }}>Enable advice</button>
        <button className="btn-quiet" onClick={() => setShowConsent(false)}>Not now</button>
      </div>
    </div>
  </div>
)}
```

Add `const [showConsent, setShowConsent] = useState(false)`.

- [ ] **Step 3: Trigger profiling in phase 2**

When advice is first enabled (after `ensureAdvice` passes and there are no profiling messages), open the profiling chat:

```ts
const msgs = await window.vault.advice.startProfiling()
setChat({ thread: 'profiling:main', title: 'A few quick questions', initial: msgs })
```

Call this once after the first successful `ensureAdvice()` (guard with a `profilingStarted` ref).

- [ ] **Step 4: Update hero/footer copy and auth chip placement**

Hero subline and the upload section already say documents are read offline (from the prior messaging change). Update the upload CTA area so it does not imply sign-in is needed. The AuthChip stays in the top bar but is no longer a precondition for upload.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(ui): advice consent + sign-in gate phase 2; upload is offline"
```

---

### Task 13: Verify end-to-end

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites green (finance, repos, johnDoe, parse.readers, parse.registry, parse.templates, ingest).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Smoke — offline ingest with no sign-in**

Run with a real Fidelity-style CSV: `npm run dev`, drag the CSV into the brokerage upload. Confirm the review screen appears with parsed holdings **without** any sign-in, save, and see the dashboard populate. Verify (DevTools Network or absence of Claude calls) that no network request occurred during parsing.

- [ ] **Step 4: Smoke — fallback path**

Upload an unrecognized CSV → confirm the two-choice screen appears; "Enter manually" opens an empty review; "Use my AI to read it" shows the consent then (if signed in) parses.

- [ ] **Step 5: Smoke — advice gate**

With data present, click Generate on a card → advice consent modal → enable → (sign in if needed) → card generates; profiling chat opens once.

- [ ] **Step 6: Demo vault unaffected**

Switch to the demo vault (top-bar chip) → John Doe dashboard still renders (seed bypasses parsing).

- [ ] **Step 7: Commit any fixes and update README**

Update README parsing section to describe offline-first reading + consented advice. Commit:

```bash
git add -A
git commit -m "docs: offline-first parsing in README; verify pass"
```

---

## Self-review notes

- **Spec coverage:** §2 phases → Tasks 8/10/12; §3 components (readers/registry/templates) → Tasks 2-7; §4 ingest/IPC/settings/renderer → Tasks 8-12; §5 deps → Task 1; §6 error handling → registry fallbacks (Task 3) + ingest (Task 8) + UI (Task 11); §7 testing → every task is TDD; §8 launch coverage (Fidelity/Schwab/Vanguard/1040/generic) → Tasks 4-7. No gaps.
- **PII guarantee:** account #/SSN are never in any schema, so `confirm()` never writes them and advice (Task 12) only sees SQL data. The only raw-doc egress is `cloudParse`, reached solely via the explicit consent screen (Task 11).
- **ABI note:** all new deps are pure-JS; tests run under Electron-as-Node (existing `scripts/run-tests.cjs`), so `npm test -- <name>` filters by file and keeps one ABI.
- **Type consistency:** `UploadResult` (draft|fallback), `ParseResult` (parsed|needs_fallback), `Template`, `ExtractionDraft` are used identically across registry, ingest, IPC, preload, and UI.
