import type { Template } from '../types'

// Stub — implemented in Task 5.
export const vanguardBrokerage: Template = {
  id: 'vanguard-brokerage',
  docKind: 'brokerage',
  label: 'Vanguard',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
