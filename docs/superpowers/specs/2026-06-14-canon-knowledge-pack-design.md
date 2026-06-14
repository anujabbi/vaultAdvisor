# Canon knowledge pack — PARKED design note

**Status:** PARKED 2026-06-14. Sub-project A (below) was designed and then deliberately
shelved after a pressure-test surfaced foundational concerns (see "Pressure test").
Keep for follow-up. No code was written.

**Context branch:** `feat/canon-knowledge-pack` (abandoned). This note lives on `main`.

---

## Why this exists — how advice is sourced today

Two layers, very different in dependability:

1. **The numbers — deterministic, grounded, no AI.** `src/main/finance/constants2026.ts`
   (IRS 2026 brackets, standard deductions, contribution limits — sourced in a comment to
   Rev. Proc. 2025-32 / Notice 2025-67) and `math.ts` (allocation, rebalance drift, harvest
   candidates, contribution gap, federal tax, idle-cash drag). `AdvisorEngine.computeMath()`
   produces exact figures; the system prompt orders Claude to use them verbatim and never
   recompute.

2. **The prose, rules, and citations — Claude, ungrounded.** `AdvisorEngine.generateCard()`
   sends the precomputed numbers + profile to Claude (the user's own subscription, Agent SDK)
   with **web search on**. Claude writes title/summary/body/checklist and is *asked* to cite
   reputable sources and quote them. Nothing verifies the URL resolves, the quote is real, or
   that it supports the claim.

We are **not** using a Claude finance Agent Skill. Finance logic is hand-written TS; Claude is
a narrative + citation engine. Demo cards in `johnDoe.ts` are hand-seeded, not AI-generated at
request time.

**Dependable today:** the math. **AI-dependent with no enforcement:** the rules of thumb
(wash-sale 30d, safe-harbor 110%, $3k offset, FDIC $250k) stated as prompt prose; the
citations; and constant freshness.

## The original goal & decomposition

User goal: *"depend on the advice rather than just depending on AI — is there a canonical
source of truth?"* Selected concerns: verify citations are real, ground rules in a vetted
corpus, make constants authoritative (constants later dropped from scope).

Agreed grounding model (user's words): build an **offline knowledge base with citations**,
**show the user that knowledge + citations**, then **go to the web for "more"** (LLM web
search is fine for now; to be hardened/monetized behind a payment gateway later — which
touches the no-servers trust model and is an explicit future decision).

Decomposed into three sub-projects, build A first:

- **A — The Canon** (foundation): bundled, versioned knowledge pack of canonical rules +
  citations. *No behavior change.*
- **B — Grounded generation**: `generateCard` injects relevant Canon entries; system prompt
  grounds Claude to them; web becomes the explicit "for more" supplement; cards record which
  rules they used.
- **C — Show knowledge & citations**: a browsable Canon/"Sources" view + per-card
  "based on these canonical rules" with click-through citations.

B and C depend on A.

## Sub-project A as designed (before parking)

Decisions captured from the brainstorm:
- **Format:** Markdown + YAML frontmatter, one rule per file in `src/main/canon/rules/<id>.md`.
- **Constants:** left as-is in `constants2026.ts` (freshness machinery dropped from scope).
- **Verification:** a network-gated build/dev script that fetches each citation URL and asserts
  the verbatim quote appears; auto-skips offline; not part of `npm test`.
- **Content:** bootstrap one+ rule per domain for all 7 domains, reusing the real citations in
  the seed cards / prompt briefs, each flagged `status: needs_review` with a `retrievedAt`.

### Rule file format
```markdown
---
id: wash-sale
title: Wash-sale rule
domains: [tax_loss_harvest]
status: needs_review          # needs_review | verified
citations:
  - source: irs.gov
    title: "IRS Publication 550 — Wash Sales"
    url: https://www.irs.gov/publications/p550
    quote: "You cannot deduct losses from sales or trades of stock or securities in a wash sale..."
    retrievedAt: 2026-06-14
---
Markdown body: the canonical rule in plain language (shown to the user; fed to the LLM).
```

### Schema / loader / bundling
- Zod schema validates frontmatter: unique `id`, ≥1 `domain` from the 7 `AdviceDomain`s,
  `status`, ≥1 citation; each citation needs a non-empty `quote`, a valid `url` whose host is on
  the reputable-source allowlist (irs.gov, investor.gov, finra.org, consumerfinance.gov,
  fdic.gov, bogleheads.org, fidelity/schwab/vanguard.com), and a `retrievedAt`.
- Loader `src/main/canon/canon.ts`: resolve canon dir (packaged `resources/canon/` vs dev
  `src/main/canon/rules/`, mirroring `cliPath.ts`), parse frontmatter via `js-yaml` (promote
  to a direct dependency), validate, expose `loadCanon()` and `rulesForDomain(domain)`.
- Bundling: add `build.extraResources` copying the rules dir to `resources/canon/`, with a
  packaged-path assertion (extraResources silently drops files — see verify-shipped-artifacts).

### Tests (offline)
Schema accept/reject fixtures; loader returns all entries; every rule has unique id, non-empty
body, ≥1 allowlisted citation with a non-empty quote; every one of the 7 domains has ≥1 rule.

### Out of scope for A
No `generateCard`/prompt changes (B); no UI (C); `constants2026.ts` untouched.

---

## Pressure test — why A was parked (follow-up required)

Ranked by potential harm:

1. **Manufacturing false authority (biggest).** Content is bootstrapped from the `johnDoe.ts`
   seed cards, which were likely AI-generated. The verify script only checks that the quote
   *string exists* on the page — not that it is relevant, current, or that the paraphrased rule
   is correct or applies to the user. We'd be stamping AI content as "canonical" — arguably
   worse than today, where nothing claims canon status.

2. **Conflating law with opinion.** Genuinely canonical: statutory limits, IRS rules
   (wash-sale, safe-harbor, $3k offset), FDIC $250k. NOT canonical: 55/20/20/5 target
   allocation, 15% concentration threshold, 4-month emergency fund, Bogleheads-wiki citations.
   The design treats authoritative law and house heuristics identically. The allowlist mixes
   IRS (authority) with a forum wiki (reputable opinion).

3. **Over-engineering storage.** The whole corpus is a few KB. Markdown + YAML parser + loader
   + path resolution + `extraResources` bundling (a known packaging failure mode) buys little
   over a typed TS constant that is type-safe, needs no bundling, and is equally curatable and
   verifiable. (User chose Markdown; revisit given payload size.)

4. **Freezing the data layer before its consumer is known.** B (grounded generation) holds the
   real requirements: token budget per card, how the LLM references a rule (by id?), whether the
   body needs chunking, whether cards store rule ids used. Designing A in isolation risks
   re-cutting the schema in B. Sketch B's grounding interface before finalizing A.

5. **Verification script vs reality.** Many IRS publications are **PDFs** (Pub 550, Pub 505),
   gov sites often **block non-browser agents (403)** or serve **JS-rendered** content, and URLs
   get reorganized yearly → chronic false negatives. Must be advisory (never gate CI) and
   PDF-aware.

6. **Re-introduced staleness.** We dropped constants freshness, but the Canon adds
   year-sensitive content (rules referencing 2026 limits/brackets) with no `asOf`/expiry — it
   silently goes stale.

7. **Liability.** Branding content "canonical/authoritative" invites reliance and cuts against
   the current "educational only, verify with a professional" posture.

## Recommended de-risking changes (for the follow-up)

- **Split tiers:** an *Authority* set (statute/regulation only — verifiable, citable) vs a
  *Heuristics* set (explicitly "VaultAdvisor's view," never dressed as canon).
- **Sketch B's grounding interface first**, then finalize A's schema to fit it.
- **Verification advisory + PDF-aware**, never blocking; add `asOf`/expiry so staleness shows.
- **Reconsider Markdown-on-disk vs a typed constant** given the tiny payload; C can render the
  body from either.
- Reconsider whether a citation library is even the highest-leverage dependability fix vs.
  advice *suitability* (is the recommendation right for THIS user) — the harder, untouched
  problem (streetlight-effect risk).

## Open questions to resume on

- Is "canonical knowledge pack" the right framing, or should it be "Authority vs House view"?
- What does B actually need from the Canon (interface sketch)?
- Typed constant vs Markdown files — does the markdown body display in C justify the apparatus?
- Where does suitability/appropriateness of advice get addressed, if anywhere?
