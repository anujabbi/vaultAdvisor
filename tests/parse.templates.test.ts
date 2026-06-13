import { describe, expect, it } from 'vitest'
import { fidelityBrokerage } from '../src/main/parse/templates/fidelityBrokerage'
import { schwabBrokerage } from '../src/main/parse/templates/schwabBrokerage'
import { vanguardBrokerage } from '../src/main/parse/templates/vanguardBrokerage'
import { genericBrokerageCsv } from '../src/main/parse/templates/genericBrokerageCsv'
import { form1040 } from '../src/main/parse/templates/form1040'
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
    expect(
      fidelityBrokerage.detect({ format: 'csv', textLines: [], rows: [['Ticker', 'Shares']] })
    ).toBe(false)
  })
})

describe('schwabBrokerage template', () => {
  const raw: RawDocument = {
    format: 'csv',
    textLines: [],
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
    format: 'csv',
    textLines: [],
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

describe('genericBrokerageCsv template', () => {
  it('maps a generic ticker/shares/value CSV', () => {
    const raw: RawDocument = {
      format: 'csv',
      textLines: [],
      rows: [['Ticker', 'Shares', 'Value'], ['AAPL', '10', '2000']]
    }
    expect(genericBrokerageCsv.detect(raw)).toBe(true)
    const { data } = genericBrokerageCsv.map(raw) as any
    expect(data.holdings[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, value: 2000 })
  })
  it('does not detect when there is no symbol-like and value-like column', () => {
    expect(
      genericBrokerageCsv.detect({ format: 'csv', textLines: [], rows: [['foo', 'bar'], ['1', '2']] })
    ).toBe(false)
  })
})

describe('form1040 template', () => {
  const raw: RawDocument = {
    format: 'pdf-text',
    rows: [],
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
      year: 2025,
      filingStatus: 'single',
      agi: 158400,
      taxableIncome: 142300,
      totalTax: 27800,
      stdOrItemized: 'standard'
    })
  })
})
