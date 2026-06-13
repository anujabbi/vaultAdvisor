# Accounts — grouped asset view with editing & deletion

**Date:** 2026-06-13
**Branch:** `feat/accounts-asset-view`

## Goal

Let users see the assets they've uploaded, grouped by account. Each account group
shows a masked account number, an editable friendly name, and a "last uploaded"
date, followed by one row per asset item (holding or cash balance). Users can delete
at both the account level and the individual-item level.

## Decisions (from brainstorm)

1. **Account number** — extracted from documents, but only the **masked last 4 digits**
   are persisted (`••••1234`). The full number is never stored and never sent to AI.
   This preserves the trust-model promise; the consent-modal copy is updated to say we
   store only the last 4 digits locally.
2. **Re-upload = replace (snapshot).** Uploading a newer statement for an existing
   account replaces that account's holdings/cash and refreshes "last uploaded." Fixes
   the pre-existing duplicate-append bug.
3. **Delete account** removes the account + its holdings, lots, and cash rows. The
   original document rows and vault files are **kept**. No advice-card refresh.
4. **Delete item** removes a single holding (+ its lots) or a single cash row.
5. **Placement** — a new top-level `Accounts` nav view.

## Data model

`accounts` gains three columns (added via guarded `ALTER TABLE ADD COLUMN`, since
`CREATE TABLE IF NOT EXISTS` does not migrate existing DBs):

- `friendly_name TEXT NOT NULL DEFAULT ''` — user label; UI falls back to `name` when empty.
- `account_mask TEXT NOT NULL DEFAULT ''` — masked last-4 (e.g. `••••1234`); empty when unknown.
- `last_uploaded_at TEXT` — stamped on every confirm/upsert.

**Identity / dedup** (`upsertAccount`): dedupe by `(institution, account_mask)` when a
mask is present, else fall back to `(name, institution)`. `friendly_name` is never
overwritten by a re-upload; `last_uploaded_at` is always refreshed.

**Masking** (`maskAccountNumber`): strip non-digits; if ≥4 digits remain, return
`'••••' + last4`, else `''`.

## Backend

### `store/schema.ts` + `store/db.ts`
- Keep base `CREATE TABLE` definitions; add the three columns to the `accounts` DDL
  for fresh DBs.
- Add an idempotent migration in `db.ts` (`ensureColumns`) that reads
  `PRAGMA table_info(accounts)` and runs `ALTER TABLE` for any missing column.

### `store/repos.ts`
- `upsertAccount(db, a, accountMask?)` — new identity/stamping behavior above.
- `clearAccountHoldings(db, accountId)` — delete lots then holdings for the account.
- `clearAccountCash(db, accountId)` — delete cash rows for the account.
- `listAccountsWithItems(db): AccountGroup[]` — accounts joined with their holdings and
  cash, each group carrying `totalValue` and an `items: AssetItem[]` array.
- `renameAccount(db, id, friendlyName)`.
- `deleteAccount(db, id)` — clear holdings/lots/cash, then delete the account row.
- `deleteHolding(db, id)` — delete the holding + its lots.
- `deleteCash(db, id)`.

### `ingest/ingest.ts` (`confirm`)
- Brokerage: after `upsertAccount`, call `clearAccountHoldings(accountId)` before
  inserting the new holdings (replace snapshot). Pass the masked number to `upsertAccount`.
- Bank: `clearAccountCash(accountId)` before inserting the new cash row; pass mask.

### `ingest/schemas.ts`
- Add optional `accountNumber: z.string().optional()` to the `account` object in
  `brokerageExtraction` and `bankExtraction`. Update the extraction instructions to
  request it. Templates that don't surface it simply omit it (mask stays empty).

### `ipc.ts` + `preload/index.ts`
- New `accounts` namespace: `list()`, `rename(id, friendlyName)`,
  `deleteAccount(id)`, `deleteItem({ itemType, id })`. Mutations return the refreshed
  `AccountGroup[]`. Deletions also call `engine.refreshAvailability()` since the
  portfolio changed.

### `shared/types.ts`
```ts
export interface AssetItem {
  itemType: 'holding' | 'cash'
  id: number
  symbol?: string
  name?: string
  assetClass?: AssetClass
  quantity?: number
  price?: number
  apy?: number
  value: number // holding value, or cash balance
}
export interface AccountGroup {
  id: number
  name: string
  friendlyName: string
  institution: string
  kind: Account['kind']
  accountMask: string
  lastUploadedAt?: string
  totalValue: number
  items: AssetItem[]
}
```

## UI

`renderer/src/components/AccountsPage.tsx` + a third nav button in `App.tsx`
(`View = 'home' | 'profile' | 'accounts'`), styled in the "private ledger" theme.

- **Account group header:** inline-editable friendly name (persists on blur/Enter),
  `institution · ••••1234` (or `—` when mask empty), `Last uploaded <date>`, account
  total, and a **Delete account** button.
- **Item rows:** holdings show symbol + name, quantity, price, value; cash shows
  balance + APY. Each row has a **Delete** button.
- **Confirmation** before any delete (account-level warns it removes all items).
- **Empty state** when there are no accounts, pointing to upload.

## Error handling / edge cases

- Delete/rename failures surface via the existing `showToast`; UI refreshes from the
  returned data.
- Empty friendly name → display falls back to parsed `name`.
- Deleting the last account returns the user toward the empty/upload state.
- Pre-existing accounts (blank mask) render the masked field as `—`.

## Testing (TDD)

Repo tests (`tests/repos.test.ts`, Vitest under `ELECTRON_RUN_AS_NODE`):
- `renameAccount` updates `friendly_name` only.
- `deleteAccount` cascades to holdings/lots/cash; documents untouched.
- `deleteHolding` / `deleteCash` remove a single item (and lots for a holding).
- Replace-on-reupload: re-confirming an account yields no duplicate holdings,
  preserves `friendly_name`, and refreshes `last_uploaded_at`.
- `maskAccountNumber` masks to last-4 and yields `''` for <4 digits.
- `listAccountsWithItems` groups holdings + cash with correct `totalValue`.

Per the "verify shipped artifacts" rule: before claiming done, exercise the real flow
end-to-end — upload → Accounts view → rename → delete item → delete account.
