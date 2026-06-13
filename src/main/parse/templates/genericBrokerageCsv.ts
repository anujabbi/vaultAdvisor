import type { Template } from '../types'

// Stub — implemented in Task 6.
export const genericBrokerageCsv: Template = {
  id: 'generic-brokerage-csv',
  docKind: 'brokerage',
  label: 'Generic CSV',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
