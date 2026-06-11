import type { VaultApi } from './index'

declare global {
  interface Window {
    vault: VaultApi
  }
}

export {}
