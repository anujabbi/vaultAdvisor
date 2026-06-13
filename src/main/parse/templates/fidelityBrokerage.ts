import type { Template } from '../types'

// Stub — implemented in Task 4.
export const fidelityBrokerage: Template = {
  id: 'fidelity-brokerage',
  docKind: 'brokerage',
  label: 'Fidelity',
  detect: () => false,
  map: () => ({ data: {}, lowConfidence: [] })
}
