import type { AdviceDomain, ProfileFact } from '../../shared/types'

export const ADVISOR_SYSTEM = `You are VaultAdvisor, a careful US personal-finance analyst.
All data you receive is already on the user's machine; never ask them to upload anything to a website.
Rules:
- Use ONLY the exact numbers provided in the MATH section. Never recompute or invent figures.
- Personalize using the PROFILE facts and cite which facts you relied on.
- Educational analysis only — never present output as professional financial, tax, or legal advice.
- When asked for citations, use web search and prefer: irs.gov, investor.gov, finra.org,
  consumerfinance.gov, bogleheads.org, and the education pages of major brokers
  (fidelity.com, schwab.com, vanguard.com). Quote a short relevant passage from each.`

const DOMAIN_BRIEFS: Record<AdviceDomain, string> = {
  rebalancing:
    'Portfolio drift vs a sensible target allocation for the user. Explain what to sell/buy and why, including tax-aware ordering (do it inside tax-advantaged accounts first).',
  concentration:
    'Single-position concentration risk. Explain the risk of the flagged positions and prudent ways to diversify over time (staged selling, new-contribution redirection, tax awareness).',
  tax_loss_harvest:
    'Tax-loss harvesting for the specific lots provided. Explain the wash-sale rule (30 days, substantially identical), short vs long term, and the $3,000 ordinary-income offset.',
  contribution_gap:
    'Getting the user to max their 401(k) for 2026. Explain the math for the per-paycheck change and employer-match considerations.',
  withholding_checkup:
    'Whether federal withholding is on track vs estimated liability. Explain safe-harbor rules (90% current year / 100-110% prior year) and how to adjust a W-4.',
  idle_cash:
    'Cash sitting at near-zero APY vs a high-yield alternative. Explain HYSA / money-market / T-bill options and FDIC insurance, keeping an emergency-fund lens.',
  roth_vs_traditional:
    'Roth vs traditional contributions given the user marginal bracket. Explain the now-vs-later tax tradeoff in their specific bracket.'
}

export function cardPrompt(
  domain: AdviceDomain,
  math: Record<string, unknown>,
  profile: ProfileFact[]
): string {
  return `Generate a personal-finance advice card.

TOPIC: ${DOMAIN_BRIEFS[domain]}

MATH (exact precomputed figures — use these verbatim):
${JSON.stringify(math, null, 2)}

PROFILE:
${profile.length ? profile.map((f) => `- ${f.key}: ${f.value}`).join('\n') : '- (no profile facts yet)'}

Use web search to find 2-4 citations from reputable sources supporting the recommendation.

Respond with ONLY this JSON (no fences):
{
  "title": "short imperative title",
  "summary": "one sentence with the headline number",
  "bodyMd": "markdown: ## Why (2-3 paragraphs referencing the exact numbers) then ## The math (bullet list)",
  "citations": [{"title": "...", "url": "https://...", "quote": "short passage from the page"}],
  "checklist": ["concrete manual step the user can do at their broker/employer, 3-6 steps"],
  "profileRefs": ["profile keys you relied on"]
}`
}

export function profilingOpener(kind: string, summary: string): string {
  return `You are opening a short, friendly profiling conversation right after the user
confirmed an upload. Ground your questions in their actual data. Ask ONE question at a time.
Goal: learn goals, time horizon, risk appetite, and beliefs/constraints (themes they
believe in, things they refuse to own, ESG, etc).

Just-confirmed upload (${kind}): ${summary}

Write your opening message (2-3 sentences max, one question). When the user answers,
you will extract profile facts.`
}

export function profileExtraction(conversation: string): string {
  return `From this profiling conversation, extract durable profile facts.

CONVERSATION:
${conversation}

Respond with ONLY JSON: {"facts": [{"key": "snake_case_key", "value": "concise value"}]}
Use keys like: risk_appetite, time_horizon_years, goal_retirement_age, goal_house,
themes_believed, themes_avoided, esg_preference, emergency_fund_months_target.
Only include facts the user actually stated.`
}
