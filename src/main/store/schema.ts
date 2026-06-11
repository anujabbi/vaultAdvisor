// Single source of truth for the SQLite schema. Idempotent (IF NOT EXISTS).
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  vault_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'parsing',
  error TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  asset_class TEXT NOT NULL DEFAULT 'other',
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  holding_id INTEGER NOT NULL REFERENCES holdings(id),
  quantity REAL NOT NULL,
  cost_basis REAL NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  annual_gross REAL NOT NULL,
  withholding_fed REAL NOT NULL DEFAULT 0,
  k401_contrib_ytd REAL NOT NULL DEFAULT 0,
  k401_rate REAL NOT NULL DEFAULT 0,
  pay_period TEXT NOT NULL DEFAULT 'biweekly'
);

CREATE TABLE IF NOT EXISTS tax_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  filing_status TEXT NOT NULL,
  agi REAL NOT NULL,
  taxable_income REAL NOT NULL,
  total_tax REAL NOT NULL,
  effective_rate REAL NOT NULL,
  std_or_itemized TEXT NOT NULL DEFAULT 'standard',
  deductions_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  balance REAL NOT NULL,
  apy REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile_facts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'conversation',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS advice_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'locked',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  citations_json TEXT NOT NULL DEFAULT '[]',
  math_json TEXT NOT NULL DEFAULT '{}',
  profile_refs_json TEXT NOT NULL DEFAULT '[]',
  unlock_hint TEXT,
  generated_at TEXT
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES advice_cards(id),
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_lots_holding ON lots(holding_id);
CREATE INDEX IF NOT EXISTS idx_checklist_card ON checklist_items(card_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(thread);
`
