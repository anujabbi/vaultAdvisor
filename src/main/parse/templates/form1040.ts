import type { Template } from '../types'

// Stub — implemented in Task 7.
export const form1040: Template = {
  id: 'form-1040',
  docKind: 'tax_return',
  label: 'IRS Form 1040',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
