import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type VaultName = 'personal' | 'demo'

interface Settings {
  vault: VaultName
  /** Whether the user has consented to send de-identified data to the cloud for advice. */
  adviceConsent: boolean
}

const DEFAULTS: Settings = { vault: 'personal', adviceConsent: false }

export function settingsPath(userData: string): string {
  return join(userData, 'settings.json')
}

export function readSettings(userData: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userData), 'utf8'))
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(userData: string, s: Settings): void {
  writeFileSync(settingsPath(userData), JSON.stringify(s, null, 2))
}

/** personal keeps the original db filename for backward compatibility. */
export function dbPathFor(userData: string, vault: VaultName): string {
  return vault === 'personal'
    ? join(userData, 'vaultadvisor.db')
    : join(userData, `vault-${vault}.db`)
}
