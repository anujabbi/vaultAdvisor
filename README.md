# VaultAdvisor

**Real financial advice that never leaves your machine.**

VaultAdvisor is a privacy-first desktop financial advisor for US users. Upload your brokerage
statements, tax return, pay stubs, and bank statements — they're parsed and analyzed entirely
from your own computer. There is no VaultAdvisor server, no account, no cloud database. The
only party that ever sees your data is the AI provider you already trust, via **your own
"Sign in with Claude"** subscription.

🌐 **Marketing page / downloads:** https://anujabbi.github.io/vaultAdvisor/

## What it does

- **Hero scenarios** — see what the app finds (tax-loss harvesting, concentration risk,
  idle-cash drag) on sample data before uploading anything.
- **Document intake** — drag in PDFs/CSVs; the AI parses them and you review/correct every
  field before anything is saved to the local SQLite database.
- **Conversational profiling** — after each upload, the advisor asks a couple of smart,
  data-grounded questions to learn your goals, risk appetite, and beliefs.
- **Advice ledger** — recommendation cards that light up as your data unlocks them:
  rebalancing, tax-loss harvesting, 401(k) headroom, withholding checkup, idle cash,
  Roth vs traditional. Every card shows the exact math, **cites reputable sources**
  (IRS, FINRA, investor.gov, broker education pages), and gives you an
  **execution checklist** you complete manually at your broker and check off in-app.
- **Advisor chat** — ask anything with full local context.

## Privacy model

| What | Where it lives |
|---|---|
| Your documents | A local vault folder in your user profile |
| Parsed data, profile, advice | A local SQLite database |
| AI processing | Direct from your machine to Anthropic, on **your** Claude subscription (Agent SDK credits) |
| VaultAdvisor servers | None exist |

No API keys are handled by the app — sign-in only. OpenAI ("Sign in with ChatGPT") will be
added when it opens to third-party apps.

## Development

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests (finance math + store)
npm run typecheck
npm run dist:win   # package Windows installer
npm run dist:mac   # package macOS dmg
```

Stack: Electron + React + TypeScript (electron-vite), better-sqlite3,
[@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk-typescript).

## Disclaimer

VaultAdvisor provides **educational analysis, not professional financial, tax, or legal
advice**. Verify recommendations with a qualified professional before acting. Tax constants
are for tax year 2026 (US federal).
