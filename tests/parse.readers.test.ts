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
