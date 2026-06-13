import type { Template } from '../types'

// Stub — implemented in Task 5.
export const schwabBrokerage: Template = {
  id: 'schwab-brokerage',
  docKind: 'brokerage',
  label: 'Schwab',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
