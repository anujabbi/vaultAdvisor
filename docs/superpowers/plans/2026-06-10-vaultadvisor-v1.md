# VaultAdvisor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 VaultAdvisor desktop app (Electron, Windows+Mac) per the approved spec: hero scenarios → document intake → conversational profiling → advice dashboard with citations + execution checklists → advisor chat, with Sign in with Claude as the LLM provider, plus a marketing page on GitHub Pages.

**Architecture:** Electron main process owns SQLite (better-sqlite3), document vault, auth, and an advice engine wrapping the Claude Agent SDK; the React renderer is pure UI talking over a typed contextBridge IPC API. Deterministic finance math is computed in TypeScript and handed to the LLM, which explains, personalizes, and cites.

**Tech Stack:** electron-vite (Electron 33 + React 18 + TypeScript + Vite), better-sqlite3, @anthropic-ai/claude-agent-sdk, Vitest, electron-builder, GitHub Pages (static `site/`).

---

## File structure

```
vaultAdvisor/
  package.json  electron.vite.config.ts  electron-builder.yml  tsconfig*.json
  src/
    main/
      index.ts                # app lifecycle, window, IPC registration
      ipc.ts                  # ipcMain handlers — single registry
      auth/claudeAuth.ts      # Sign in with Claude (Agent SDK login state)
      store/db.ts             # SQLite open/migrate
      store/schema.sql        # schema (single source of truth)
      store/repos.ts          # typed repositories
      finance/math.ts         # deterministic finance math (pure)
      finance/constants2026.ts# US tax brackets, contribution limits (2026)
      ingest/ingest.ts        # vault copy + LLM extraction + confirm
      ingest/schemas.ts       # JSON schemas for extraction output
      advisor/engine.ts       # card availability + generation
      advisor/prompts.ts      # prompt builders per advice domain
      chat/chat.ts            # advisor + profiling chat sessions
      llm/provider.ts         # LlmProvider interface
      llm/claudeProvider.ts   # Agent SDK implementation
      sample/persona.ts       # hero-scenario sample data
    preload/index.ts          # contextBridge typed API (window.vault)
    shared/types.ts           # DTOs shared main<->renderer
    renderer/                 # React app (see Task 8)
  tests/finance.math.test.ts  tests/repos.test.ts
  site/index.html  site/style.css   # marketing page
  .github/workflows/pages.yml
```

---

### Task 1: Scaffold project

**Files:** Create the electron-vite scaffold at repo root.

- [ ] `npm create @quick-start/electron@latest . -- --template react-ts --skip` (or manual scaffold if the generator fights the non-empty dir: copy template files from a temp scaffold).
- [ ] `npm i better-sqlite3 @anthropic-ai/claude-agent-sdk zod && npm i -D vitest @types/better-sqlite3 electron-builder`
- [ ] Add `"test": "vitest run"` to package.json scripts.
- [ ] Verify: `npm run build` succeeds (typecheck + bundles main/preload/renderer).
- [ ] Commit: `chore: scaffold electron-vite app with deps`

### Task 2: Shared types + DB schema + repos (TDD)

**Files:** Create `src/shared/types.ts`, `src/main/store/schema.sql`, `src/main/store/db.ts`, `src/main/store/repos.ts`, `tests/repos.test.ts`.

Schema tables: `documents(id, kind, filename, vault_path, uploaded_at, status)`,
`accounts(id, name, kind, institution)`, `holdings(id, account_id, symbol, name, asset_class, quantity, price, value)`, `lots(id, holding_id, quantity, cost_basis, acquired_at)`,
`income(id, source, annual_gross, withholding_fed, k401_contrib_ytd, k401_rate, pay_period)`,
`tax_facts(id, year, filing_status, agi, taxable_income, total_tax, effective_rate, std_or_itemized, deductions_json)`,
`cash(id, account_id, balance, apy)`,
`profile_facts(id, key, value, source, updated_at)`,
`advice_cards(id, domain, status, title, summary, body_md, citations_json, math_json, profile_refs_json, generated_at)`,
`checklist_items(id, card_id, ord, text, done, done_at)`,
`chat_messages(id, thread, role, content, created_at)`.

- [ ] Write failing tests in `tests/repos.test.ts`: insert holding + lots → query portfolio; upsert profile_fact by key; card+checklist round-trip; toggling checklist item sets done_at.
- [ ] Run `npx vitest run tests/repos.test.ts` → FAIL (modules missing).
- [ ] Implement schema.sql, db.ts (`openDb(path)` runs schema idempotently via `CREATE TABLE IF NOT EXISTS`), repos.ts (plain functions taking `Database`).
- [ ] Run tests → PASS.
- [ ] Commit: `feat: sqlite schema and repositories`

### Task 3: Finance math (TDD)

**Files:** Create `src/main/finance/constants2026.ts`, `src/main/finance/math.ts`, `tests/finance.math.test.ts`.

Functions (all pure):
- `allocation(holdings) -> {byClass, bySymbol, concentration}` (% by asset class/symbol, flags positions >15%)
- `rebalanceDrift(allocation, target) -> moves[]`
- `federalTax2026(taxableIncome, filingStatus) -> {tax, marginalRate, bracketRoom}`
- `contributionGap({k401Ytd, k401Limit, payPeriodsLeft}) -> {gap, perPeriodToMax}`
- `harvestCandidates(lots, prices) -> {symbol, lotId, unrealizedLoss}[]` (loss > $200 threshold, long/short term split)
- `idleCashDrag(cash[], benchmarkApy=4.0) -> {idleTotal, annualDrag}`

2026 constants: 401(k) elective deferral $24,500 (+$8,000 catch-up 50+), IRA $7,500, single/MFJ brackets — encode from IRS Rev. Proc. values; cite source URL in a comment.

- [ ] Write failing tests with hand-computed expectations for each function (e.g., MFJ $200k taxable → expected tax from bracket math written out in the test).
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] Commit: `feat: deterministic finance math with 2026 US constants`

### Task 4: LLM provider + Claude auth

**Files:** Create `src/main/llm/provider.ts`, `src/main/llm/claudeProvider.ts`, `src/main/auth/claudeAuth.ts`.

`LlmProvider` interface: `id`, `isAuthenticated()`, `signIn()` (interactive), `signOut()`, `extract(doc, schema)`, `generate(prompt, opts)` (streamed), `chat(messages, opts)` (streamed, with optional webSearch).

Claude implementation wraps `@anthropic-ai/claude-agent-sdk` `query()` with the user's Claude subscription login; sign-in launches the SDK's OAuth flow (browser) and persists session per SDK defaults; `isAuthenticated` probes a no-op query/auth state. Web search enabled for citation-bearing generations. **No API-key path.**

- [ ] Implement interface + provider; wire a `vault:auth:*` IPC surface.
- [ ] Verify with `npm run build` (no runtime test without credentials; auth is smoke-tested in Task 10).
- [ ] Commit: `feat: LlmProvider seam and Sign in with Claude provider`

### Task 5: IPC bridge + preload

**Files:** Create `src/preload/index.ts`, `src/main/ipc.ts`; modify `src/main/index.ts`.

`window.vault` API (all promise-based; streams via `onStream(channel, cb)` events):
`auth.{status,signIn,signOut}`, `docs.{upload,confirmExtraction,list}`, `portfolio.summary`, `profile.{list,set}`, `cards.{list,generate,dismiss}`, `checklist.{toggle}`, `chat.{send,history}`, `sample.scenarios`.

- [ ] Implement preload contextBridge with shared DTO types; ipcMain registry delegating to modules.
- [ ] `npm run build` passes; commit: `feat: typed IPC bridge`

### Task 6: Ingest pipeline

**Files:** Create `src/main/ingest/schemas.ts`, `src/main/ingest/ingest.ts`.

- [ ] Extraction zod/JSON schemas per doc kind (brokerage→accounts/holdings/lots, 1040→tax_facts, paystub/W-2→income, bank→cash).
- [ ] `uploadDocument(path, kind)`: copy file to `userData/vault/`, insert documents row (status `parsing`), call `provider.extract` with the file + schema, return draft extraction to renderer (status `review`), with per-field confidence.
- [ ] `confirmExtraction(docId, edited)`: validate against schema, write rows to store, status `confirmed`, trigger `advisor.refreshAvailability()` and return the profiling-conversation opener.
- [ ] Commit: `feat: document ingest with review-before-save`

### Task 7: Advisor engine + chats

**Files:** Create `src/main/advisor/engine.ts`, `src/main/advisor/prompts.ts`, `src/main/chat/chat.ts`, `src/main/sample/persona.ts`.

- [ ] Card domains + availability predicates: `rebalancing`+`concentration` (needs holdings), `tax_loss_harvest` (lots), `contribution_gap` (income), `withholding_checkup` (income+tax_facts), `idle_cash` (cash), `roth_vs_traditional` (tax_facts+income). Locked cards expose `unlockHint`.
- [ ] `generateCard(domain)`: compute math in TS (Task 3), assemble prompt with math + profile facts + instruction to web-search 2-4 reputable citations (irs.gov, finra.org, investor.gov, bogleheads.org, major-broker education pages) and emit JSON: `{title, summary, body_md, citations[{title,url,quote}], checklist[steps], profile_refs}` → store as advice_card + checklist_items. Disclaimer appended at render, not generated.
- [ ] Profiling chat: post-confirm opener prompt grounded in just-ingested data; extracts profile_facts via tool/JSON side-channel as conversation proceeds.
- [ ] Advisor chat: context assembly (portfolio summary + profile + relevant cards) with streaming responses; optional card-scoped mode.
- [ ] Sample persona module: fictional data powering hero scenarios via the same math/render path.
- [ ] Commit: `feat: advice engine, profiling and advisor chat`

### Task 8: Renderer UI (use frontend-design skill)

**Files:** Create under `src/renderer/src/`: `App.tsx`, `theme.css`, `components/` (HeroScenarios, UploadDropzone, ExtractionReview, Dashboard, NetWorthHeader, AllocationDonut, AdviceCard, CardDetail (why/math/citations/checklist), ChecklistItem, ProfilePage, ChatPanel, AuthGate, Disclaimer).

Direction: distinctive, warm-but-precise "private vault" aesthetic — NOT generic AI gradients. Invoke superpowers/frontend-design guidance: unique typeface pairing, deliberate palette, micro-interactions on card unlock ("lighting up" animation), skeleton shimmer while advice streams.

- [ ] App shell + routing (pre-auth → hero scenarios; post-data → dashboard), AuthGate with Sign in with Claude button + OpenAI "coming soon" disabled chip.
- [ ] Hero scenarios from `sample.scenarios` IPC; each card expands; CTA → upload flow scoped to its doc kind.
- [ ] Upload dropzone + ExtractionReview (editable table, low-confidence highlights, Confirm).
- [ ] Dashboard: header stats, donut (pure SVG), card feed with locked/available/generated states; CardDetail drawer with checklist check-off; ProfilePage editable facts; ChatPanel slide-over with streaming.
- [ ] Persistent educational disclaimer footer.
- [ ] `npm run build` clean; commit per component group.

### Task 9: Packaging + README

- [ ] `electron-builder.yml`: appId `com.anujabbi.vaultadvisor`, win nsis + mac dmg targets, productName VaultAdvisor.
- [ ] README: pitch, privacy model, screenshots placeholder, dev setup, build commands, disclaimer.
- [ ] `.gitignore` (node_modules, dist, out).
- [ ] Commit: `chore: packaging config and README`

### Task 10: Verify

- [ ] `npm run test` → all pass. `npm run build` → clean.
- [ ] `npm run dev` smoke: window opens, hero scenarios render, upload dialog opens, auth button launches sign-in flow (cannot complete fully without owner's account — verify flow starts and errors are graceful).
- [ ] Commit fixes; push.

### Task 11: Marketing site + Pages

**Files:** Create `site/index.html`, `site/style.css` (self-contained, no build step), `.github/workflows/pages.yml`.

- [ ] Landing page: hero ("Your money. Your machine. Real advice."), privacy trust section (local data diagram), three hero-scenario teasers, download buttons linking `https://github.com/anujabbi/vaultAdvisor/releases/latest`, GitHub link, disclaimer. Same distinctive design language as the app.
- [ ] Workflow: on push to main, upload `site/` artifact → deploy-pages. Enable Pages via `gh api`.
- [ ] Push; verify deploy job green and page serves.
- [ ] Commit: `feat: marketing site on GitHub Pages`

---

## Self-review notes

- Spec coverage: §2.1→T7/T8 (persona+hero UI); §2.2→T6/T8; §2.3→T7/T8; §2.4→T3/T7/T8; §2.5→T7/T8; §3→T1/T2/T4/T5; §4→T4 (+OpenAI chip T8); §5→woven into T6/T7/T8 error states; §6→T2/T3 tests + T10 smoke; §7→T9/T11. No gaps.
- Sign-in full round-trip needs the owner's Claude account — explicitly deferred to owner review (graceful-failure verified instead).
