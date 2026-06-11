import { mkdirSync } from 'fs'
import { join } from 'path'
import { openDb, type Db } from './store/db'
import { listDocuments } from './store/repos'
import { dbPathFor, readSettings, writeSettings, type VaultName } from './settings'
import { seedJohnDoe } from './sample/johnDoe'

/**
 * Mutable holder for the active vault. Services keep a reference to this
 * object and read `.db` per call, so switching vaults swaps the database
 * live — no app relaunch (which breaks under the dev server).
 */
export class VaultManager {
  db!: Db
  vault!: VaultName
  docsDir!: string

  constructor(private userData: string) {
    const env = process.env.VA_VAULT
    const initial: VaultName =
      env === 'demo' || env === 'personal' ? env : readSettings(userData).vault
    this.open(initial)
  }

  switch(name: VaultName): void {
    if (name === this.vault) return
    writeSettings(this.userData, { ...readSettings(this.userData), vault: name })
    const old = this.db
    this.open(name)
    old.close()
  }

  private open(name: VaultName): void {
    this.vault = name
    this.docsDir = join(this.userData, name === 'personal' ? 'vault' : `vault-${name}-docs`)
    mkdirSync(this.docsDir, { recursive: true })
    this.db = openDb(dbPathFor(this.userData, name))
    if (name === 'demo' && listDocuments(this.db).length === 0) {
      seedJohnDoe(this.db)
    }
  }
}
