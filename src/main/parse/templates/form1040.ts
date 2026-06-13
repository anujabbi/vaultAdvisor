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
    const yearStr = firstMatch(lines, /\b(20\d{2})\b/)
    const year = yearStr ? Number(yearStr) : new Date().getFullYear() - 1
    const agi = num(firstMatch(lines, /adjusted gross income[^\d]*([\d,]+)/i))
    const taxableIncome = num(firstMatch(lines, /taxable income[^\d]*([\d,]+)/i))
    const totalTax = num(firstMatch(lines, /total tax[^\d]*([\d,]+)/i))
    const stdOrItemized = /itemized|schedule a/i.test(text) ? 'itemized' : 'standard'
    const lowConfidence: string[] = []
    if (!agi) lowConfidence.push('agi')
    if (!taxableIncome) lowConfidence.push('taxableIncome')
    if (!totalTax) lowConfidence.push('totalTax')
    return {
      data: {
        year,
        filingStatus: filingStatus(text),
        agi,
        taxableIncome,
        totalTax,
        stdOrItemized,
        deductions: {}
      },
      lowConfidence
    }
  }
}
