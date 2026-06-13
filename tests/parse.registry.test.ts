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
    const r = validateOrFallback(
      'brokerage',
      { account: { name: 'A', kind: 'taxable', institution: 'F' }, holdings: [] },
      []
    )
    expect(r.status).toBe('parsed')
  })
  it('falls back when data fails the zod schema', () => {
    const r = validateOrFallback('brokerage', { nope: true }, [])
    expect(r).toEqual({ status: 'needs_fallback', reason: 'no_template' })
  })
})
