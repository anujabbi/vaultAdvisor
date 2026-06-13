import { z } from 'zod'
import type { DocKind } from '../../shared/types'

const assetClass = z.enum([
  'us_stock',
  'intl_stock',
  'bond',
  'cash',
  'real_estate',
  'crypto',
  'other'
])

export const brokerageExtraction = z.object({
  account: z.object({
    name: z.string(),
    kind: z.enum(['taxable', 'k401', 'ira', 'roth_ira', 'hsa']),
    institution: z.string(),
    accountNumber: z.string().optional()
  }),
  holdings: z.array(
    z.object({
      symbol: z.string(),
      name: z.string().default(''),
      assetClass,
      quantity: z.number(),
      price: z.number(),
      value: z.number(),
      lots: z
        .array(
          z.object({
            quantity: z.number(),
            costBasis: z.number(),
            acquiredAt: z.string()
          })
        )
        .default([])
    })
  )
})

export const taxReturnExtraction = z.object({
  year: z.number(),
  filingStatus: z.enum(['single', 'mfj', 'mfs', 'hoh']),
  agi: z.number(),
  taxableIncome: z.number(),
  totalTax: z.number(),
  stdOrItemized: z.enum(['standard', 'itemized']),
  deductions: z.record(z.string(), z.number()).default({})
})

export const paystubExtraction = z.object({
  source: z.string(),
  annualGross: z.number(),
  withholdingFedYtd: z.number(),
  k401ContribYtd: z.number(),
  k401Rate: z.number().default(0),
  payPeriod: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly'])
})

export const bankExtraction = z.object({
  account: z.object({
    name: z.string(),
    kind: z.enum(['checking', 'savings']),
    institution: z.string(),
    accountNumber: z.string().optional()
  }),
  balance: z.number(),
  apy: z.number().default(0)
})

export const EXTRACTION_SCHEMAS: Record<DocKind, z.ZodTypeAny> = {
  brokerage: brokerageExtraction,
  tax_return: taxReturnExtraction,
  paystub: paystubExtraction,
  bank: bankExtraction
}

/** Human/LLM-facing instructions per document kind. */
export const EXTRACTION_INSTRUCTIONS: Record<DocKind, string> = {
  brokerage: `Extract the brokerage or 401(k) statement into JSON:
{"account":{"name":string,"kind":"taxable"|"k401"|"ira"|"roth_ira"|"hsa","institution":string,"accountNumber":string},
 "holdings":[{"symbol":string,"name":string,
   "assetClass":"us_stock"|"intl_stock"|"bond"|"cash"|"real_estate"|"crypto"|"other",
   "quantity":number,"price":number,"value":number,
   "lots":[{"quantity":number,"costBasis":number,"acquiredAt":"YYYY-MM-DD"}]}]}
Classify each holding's assetClass from its name/ticker. Include cost-basis lots when the
statement shows them; otherwise use an empty array. Also include a top-level
"lowConfidence":[paths] array listing dotted paths of fields you are unsure about.`,
  tax_return: `Extract the Form 1040 into JSON:
{"year":number,"filingStatus":"single"|"mfj"|"mfs"|"hoh","agi":number,"taxableIncome":number,
 "totalTax":number,"stdOrItemized":"standard"|"itemized","deductions":{name:number}}
Include "lowConfidence":[paths] for uncertain fields.`,
  paystub: `Extract the pay stub or W-2 into JSON:
{"source":string,"annualGross":number,"withholdingFedYtd":number,"k401ContribYtd":number,
 "k401Rate":number,"payPeriod":"weekly"|"biweekly"|"semimonthly"|"monthly"}
annualGross: annualize from period gross if needed. Include "lowConfidence":[paths].`,
  bank: `Extract the bank statement into JSON:
{"account":{"name":string,"kind":"checking"|"savings","institution":string,"accountNumber":string},
 "balance":number,"apy":number}
apy: the interest rate if shown, else 0. Include "lowConfidence":[paths].`
}
