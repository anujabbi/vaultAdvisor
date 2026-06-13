import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDb } from '../src/main/store/db'
import { IngestService } from '../src/main/ingest/ingest'
import type { LlmProvider } from '../src/main/llm/provider'

function svc() {
  const db = openDb(':memory:')
  const docsDir = mkdtempSync(join(tmpdir(), 'va-ingest-'))
  const provider = { extract: vi.fn() } as unknown as LlmProvider
  return { db, docsDir, ingest: new IngestService({ db, docsDir }, provider), provider }
}

const srcDir = (): string => mkdtempSync(join(tmpdir(), 'va-src-'))

const fidelityCsv = [
  'Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total',
  'Individual TOD,NVDA,NVIDIA CORP,250,172.00,43000.00,25500.00'
].join('\n')

describe('IngestService.upload', () => {
  it('parses a known brokerage CSV locally without calling the provider', async () => {
    const { ingest, provider } = svc()
    const file = join(srcDir(), 'fidelity.csv')
    writeFileSync(file, fidelityCsv)
    const res = await ingest.upload(file, 'brokerage')
    expect(res.kind).toBe('draft')
    expect(provider.extract).not.toHaveBeenCalled()
    if (res.kind === 'draft') expect((res.draft.data as any).holdings[0].symbol).toBe('NVDA')
  })

  it('returns a fallback for an unrecognized document', async () => {
    const { ingest } = svc()
    const file = join(srcDir(), 'mystery.csv')
    writeFileSync(file, 'foo,bar\n1,2')
    const res = await ingest.upload(file, 'brokerage')
    expect(res.kind).toBe('fallback')
    if (res.kind === 'fallback') expect(res.reason).toBe('no_template')
  })
})

describe('IngestService.cloudParse', () => {
  it('delegates to the provider and validates', async () => {
    const { ingest, provider } = svc()
    ;(provider.extract as any).mockResolvedValue(
      JSON.stringify({ account: { name: 'X', kind: 'taxable', institution: 'Y' }, holdings: [] })
    )
    const file = join(srcDir(), 'scan.pdf')
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
