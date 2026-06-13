# Offline Document Parsing & Consented Advice — Design Specification

**Date:** 2026-06-13
**Status:** Approved (brainstormed interactively 2026-06-13)
**Owner:** anujabbi
**Supersedes parsing approach in:** 2026-06-10-vaultadvisor-design.md §2.2, §3 (ingest)

## 1. Motivation

Today every uploaded document is sent in full to Anthropic (via the Claude
Agent SDK `Read` tool) for parsing — including account numbers and, on a 1040,
the SSN. Because the app authenticates with the user's **consumer** Claude
subscription, that data is governed by consumer terms (training opt-out
defaults to *on*; up to 5-year retention). The fix is to split the app into two
decoupled phases so the sensitive raw documents stay on the machine by default,
and the cloud is only ever touched on an explicit, per-purpose user choice.

## 2. Architecture — two decoupled phases

### Phase 1 — Read → local SQL (offline-first)

No sign-in, no network on the happy path. The ingest **ladder**:

1. **Local read** — pure-JS readers turn the file into a normalized
   `RawDocument`: CSV (papaparse), XLSX (SheetJS), text-layer PDF (pdfjs-dist).
2. **Template match** — detect institution + document kind, run that template →
   structured draft matching the existing `EXTRACTION_SCHEMAS[kind]`.
3. **Review screen** (existing) — user corrects → confirm → write to local
   SQLite. Nothing has left the machine.

If step 1 yields a scanned/image PDF (no text layer) **or** step 2 finds no
matching template, ingest returns a **needs-fallback** result and the renderer
offers the user a choice:

- **Enter manually** — review screen seeded with an empty/partial skeleton for
  that doc kind; fully offline.
- **Use my AI to read it** — explicit, **per-document** consent to send *this
  one document* to the user's Claude account for parsing (the legacy
  `provider.extract` path, reused). Consent copy is blunt about PII.

### Phase 2 — Advice (separate, later, permissioned)

A distinct "Get advice" action. First use shows an **advice consent** ("send
your de-identified summary — holdings, amounts, tax brackets; never account
numbers or SSN — to your Claude account"). **Sign-in is required here, not at
upload.** The existing advice engine, card generation, and profiling chat then
run on the SQL data (which already excludes account #/SSN).

The post-upload profiling chat **moves into Phase 2** (it is Claude-powered).

### Two distinct consent gates (by sensitivity)

| Gate | What is sent | When |
|---|---|---|
| Parse-fallback consent | The raw document (has PII) | Per-document, only when the user picks "Use my AI to read it" |
| Advice consent | De-identified numbers from SQL | Once, before first advice/profiling/chat |

These are stored/handled separately; the parse-fallback consent is per-action
(not remembered), the advice consent is a remembered setting.

## 3. Components

New module `src/main/parse/`:

- `types.ts` — `RawDocument`, `Template`, `ParseResult`.
- `readers.ts` — `readDocument(filePath): RawDocument`. Dispatch by extension:
  CSV→papaparse, XLSX→SheetJS, PDF→pdfjs-dist (legacy Node build) text
  extraction; classify a PDF with no extractable text as `pdf-scanned`.
- `registry.ts` — `parseDocument(filePath, kind): ParseResult`; reads the file,
  finds the first template with `docKind===kind && detect(raw)`, runs `map`.
- `templates/` — one focused, unit-tested file per template:
  - `fidelityBrokerage.ts`, `schwabBrokerage.ts`, `vanguardBrokerage.ts`
    (CSV/XLSX positions exports → accounts/holdings/lots)
  - `form1040.ts` (text-PDF 1040 → tax_facts, keyed to federal line numbers, not
    an institution)
  - `genericBrokerageCsv.ts` (best-effort header mapping; **lowest priority**,
    only matches when a header row with recognizable columns exists)
- `index.ts` — exports the ordered template list.

Key interfaces:

```ts
export type RawFormat = 'csv' | 'xlsx' | 'pdf-text' | 'pdf-scanned' | 'unknown'

export interface RawDocument {
  format: RawFormat
  rows: string[][]      // csv/xlsx; [] otherwise
  textLines: string[]   // pdf-text; [] otherwise
}

export interface Template {
  id: string            // 'fidelity-brokerage'
  docKind: DocKind
  label: string         // 'Fidelity'
  detect(raw: RawDocument): boolean
  map(raw: RawDocument): { data: unknown; lowConfidence: string[] }
}

export type ParseResult =
  | { status: 'parsed'; templateId: string; data: unknown; lowConfidence: string[] }
  | { status: 'needs_fallback'; reason: 'no_template' | 'scanned_pdf' | 'unreadable' }
```

`data` always conforms to `EXTRACTION_SCHEMAS[kind]` (validated by the registry
via the existing zod schema before returning `parsed`).

## 4. Changes to existing code

`IngestService` (`src/main/ingest/ingest.ts`):

- `upload(filePath, kind): Promise<UploadResult>` — copy to vault + insert
  document row, then `parseDocument`. Return
  `{ kind: 'draft', draft }` on `parsed`, or `{ kind: 'fallback', docId, reason }`
  on `needs_fallback` (document row status `needs_fallback`). **No provider
  dependency on the happy path.**
- `cloudParse(docId, kind): Promise<ExtractionDraft>` — the legacy
  `provider.extract` path, called **only** on explicit per-document consent.
- `manualDraft(kind): ExtractionDraft` — empty/partial skeleton for manual entry.
- `confirm(...)` — unchanged (writes to SQL). No longer triggers profiling.

IPC (`src/main/ipc.ts`) / preload:

- `docs:pick` / `docs:uploadPath` return `UploadResult` (draft or fallback).
- New `docs:cloudParse(docId, kind)` (consent-gated in the renderer).
- New `docs:manualDraft(kind)`.
- `docs:confirm` no longer returns profiling messages; returns void/summary.
- New `advice:consent` get/set (remembered) and the advice actions
  (`cards:generate`, `chat:*`, profiling) require it + auth.
- Move the auth check off upload entirely.

Settings (`src/main/settings.ts`): add `adviceConsent?: boolean` (per vault is
unnecessary — global is fine; document the choice).

Renderer:

- `UploadFlow` — handle the `fallback` result: present the two-choice screen
  (Manual entry / Use my AI to read it). "Use my AI" shows the PII-blunt consent,
  then calls `docs:cloudParse`. Both land in the existing review screen.
- Advice gating — the dashboard "Generate" / chat / profiling entry points check
  `adviceConsent` (and auth); first use shows the advice consent modal, then
  sign-in if needed. Profiling is triggered on entering advice (e.g. first card
  generation), not on upload.
- `AuthGate` / hero copy — uploading no longer requires sign-in; messaging
  updated to reflect "read offline, advice needs your AI."

## 5. Dependencies

All pure-JS (no native ABI — important given prior better-sqlite3 pain):
`papaparse`, `xlsx` (SheetJS), `pdfjs-dist` (use the legacy build for Node/main).

## 6. Error handling

- Unreadable/empty file → `needs_fallback: 'unreadable'` → same two-choice screen.
- Scanned PDF → `needs_fallback: 'scanned_pdf'` with a message naming the cause.
- Template `map` throws or zod validation fails → treat as `needs_fallback:
  'no_template'` (don't crash; let the user pick manual or AI).
- Advice action without consent/auth → renderer blocks with the consent/sign-in
  modal; never silently calls the cloud.

## 7. Testing (TDD)

- **Readers** — fixtures: a CSV, an XLSX, a text-PDF, an image-only PDF →
  correct `RawDocument.format` and content.
- **Templates** — one fixture test per template: sample export → expected
  `ExtractionDraft` (exact fields). This is where templates earn their keep —
  deterministic and unit-testable, matching the existing TDD style
  (finance.math.test, johnDoe.test).
- **Registry** — detection picks the right template; unknown input →
  `needs_fallback`; generic CSV only matches with a recognizable header row.
- **IngestService** — `upload` returns draft vs fallback correctly; `cloudParse`
  delegates to the provider; `manualDraft` shape; `confirm` writes to SQL and
  does not trigger profiling.
- Existing suites (finance, repos, johnDoe) stay green; demo vault unaffected
  (it seeds SQL directly, bypassing parsing).

## 8. Launch template coverage

- Brokerage: **Fidelity, Schwab, Vanguard** (the demo uses Fidelity + Vanguard;
  these are the three largest US brokers) + `genericBrokerageCsv` fallback.
- Tax: **Form 1040** (federal form template).
- Paystub & bank: **no templates at launch** — they route straight to the
  two-choice fallback (manual or AI). Bank/paystub fields are few, so manual
  entry is cheap; templates can be added later behind the same registry.

## 9. Out of scope (this spec)

- Local LLM / Ollama "fully offline advice" mode (possible future tier).
- OCR for scanned PDFs (would reduce reliance on the AI fallback later).
- Per-institution paystub/bank templates (added incrementally post-launch).
