import Database from 'better-sqlite3'
import { SCHEMA } from './schema'

export type Db = Database.Database

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

// Idempotent column additions for DBs created before a column existed.
// CREATE TABLE IF NOT EXISTS never alters an existing table, so add here.
function migrate(db: Db): void {
  ensureColumn(db, 'accounts', 'friendly_name', `TEXT NOT NULL DEFAULT ''`)
  ensureColumn(db, 'accounts', 'account_mask', `TEXT NOT NULL DEFAULT ''`)
  ensureColumn(db, 'accounts', 'last_uploaded_at', 'TEXT')
}

function ensureColumn(db: Db, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`)
  }
}
