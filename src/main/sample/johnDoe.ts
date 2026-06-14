// John Doe — the demo vault. A complete, internally-consistent dataset so
// demos show every section instantly without LLM calls or real documents.
import type { Db } from '../store/db'
import {
  appendChatMessage,
  insertCash,
  insertDocument,
  insertHolding,
  insertIncome,
  insertLot,
  insertTaxFacts,
  listCards,
  saveGeneratedCard,
  setDocumentStatus,
  setProfileFact,
  toggleChecklistItem,
  upsertAccount
} from '../store/repos'

export function seedJohnDoe(db: Db): void {
  // ---- documents (so the Documents history looks real) ----
  for (const [kind, filename] of [
    ['brokerage', 'Fidelity_Statement_May2026.pdf'],
    ['brokerage', 'Vanguard_401k_Q1_2026.pdf'],
    ['tax_return', 'JohnDoe_1040_2025.pdf'],
    ['paystub', 'TechCorp_Paystub_2026-05-29.pdf'],
    ['bank', 'Chase_Statement_May2026.pdf']
  ] as const) {
    const id = insertDocument(db, { kind, filename, vaultPath: `demo://${filename}` })
    setDocumentStatus(db, id, 'confirmed')
  }

  // ---- accounts / holdings / lots ----
  const fidelity = upsertAccount(db, { name: 'Individual Brokerage', kind: 'taxable', institution: 'Fidelity' })
  const vanguard = upsertAccount(db, { name: '401(k)', kind: 'k401', institution: 'Vanguard' })
  const chase = upsertAccount(db, { name: 'Total Checking', kind: 'checking', institution: 'Chase' })
  const marcus = upsertAccount(db, { name: 'Online Savings', kind: 'savings', institution: 'Marcus' })

  const nvda = insertHolding(db, { accountId: fidelity, symbol: 'NVDA', name: 'NVIDIA Corp', assetClass: 'us_stock', quantity: 250, price: 172, value: 43000 })
  insertLot(db, { holdingId: nvda, quantity: 100, costBasis: 4000, acquiredAt: '2021-03-10' })
  insertLot(db, { holdingId: nvda, quantity: 150, costBasis: 21500, acquiredAt: '2024-08-15' })

  const arkk = insertHolding(db, { accountId: fidelity, symbol: 'ARKK', name: 'ARK Innovation ETF', assetClass: 'us_stock', quantity: 400, price: 49, value: 19600 })
  insertLot(db, { holdingId: arkk, quantity: 250, costBasis: 18750, acquiredAt: '2024-02-20' })
  insertLot(db, { holdingId: arkk, quantity: 150, costBasis: 9600, acquiredAt: '2025-12-05' })

  const vti = insertHolding(db, { accountId: fidelity, symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetClass: 'us_stock', quantity: 120, price: 285, value: 34200 })
  insertLot(db, { holdingId: vti, quantity: 120, costBasis: 26400, acquiredAt: '2023-06-01' })

  const vxus = insertHolding(db, { accountId: fidelity, symbol: 'VXUS', name: 'Vanguard Total Intl Stock ETF', assetClass: 'intl_stock', quantity: 200, price: 62, value: 12400 })
  insertLot(db, { holdingId: vxus, quantity: 200, costBasis: 11000, acquiredAt: '2023-06-01' })

  const vinix = insertHolding(db, { accountId: vanguard, symbol: 'VINIX', name: 'Vanguard Institutional Index', assetClass: 'us_stock', quantity: 500, price: 90, value: 45000 })
  insertLot(db, { holdingId: vinix, quantity: 300, costBasis: 19500, acquiredAt: '2020-01-15' })
  insertLot(db, { holdingId: vinix, quantity: 200, costBasis: 15000, acquiredAt: '2023-04-10' })

  const bnd = insertHolding(db, { accountId: vanguard, symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetClass: 'bond', quantity: 150, price: 73, value: 10950 })
  insertLot(db, { holdingId: bnd, quantity: 150, costBasis: 11700, acquiredAt: '2022-09-01' })

  // ---- cash / income / tax ----
  insertCash(db, { accountId: chase, balance: 42000, apy: 0.01 })
  insertCash(db, { accountId: marcus, balance: 15000, apy: 4.15 })

  insertIncome(db, {
    source: 'TechCorp Inc',
    annualGross: 165000,
    withholdingFed: 14200,
    k401ContribYtd: 9800,
    k401Rate: 6,
    payPeriod: 'biweekly'
  })

  insertTaxFacts(db, {
    year: 2025,
    filingStatus: 'single',
    agi: 158400,
    taxableIncome: 142300,
    totalTax: 27800,
    effectiveRate: 17.55,
    stdOrItemized: 'standard',
    deductions: { standard_deduction: 15000 }
  })

  // ---- profile ----
  const facts: [string, string][] = [
    ['risk_appetite', 'moderately aggressive — fine with volatility, hates permanent loss'],
    ['time_horizon_years', '25'],
    ['goal_retirement_age', '58'],
    ['goal_house', 'down payment ~$120k in 3–4 years'],
    ['themes_believed', 'AI and semiconductors — conviction position, but wants it capped near 25%'],
    ['themes_avoided', 'crypto'],
    ['emergency_fund_months_target', '4']
  ]
  for (const [key, value] of facts) setProfileFact(db, { key, value, source: 'conversation' })

  // ---- advice cards (pre-generated; content hand-checked against the data) ----
  seedCards(db)

  // mark a couple of checklist steps done so progress tracking shows
  const cards = listCards(db)
  const idle = cards.find((c) => c.domain === 'idle_cash')
  if (idle) {
    toggleChecklistItem(db, idle.checklist[0].id, true)
    toggleChecklistItem(db, idle.checklist[1].id, true)
  }

  // ---- advisor chat history ----
  appendChatMessage(db, 'advisor', 'user', 'Should I sell some NVDA before year end?')
  appendChatMessage(
    db,
    'advisor',
    'assistant',
    'Your NVDA position is $43,000 — about 26% of your invested portfolio, well above the 15% concentration threshold and just over your own 25% cap on the AI theme. Two of your goals pull in opposite directions here: the house down payment in 3–4 years argues for trimming into strength, while your 25-year horizon argues for patience.\n\nA middle path: sell the newer lot (150 shares, $21,500 basis from Aug 2024) which has the smaller gain, and leave the 2021 lot growing. That cuts concentration to roughly 19% and raises about $25,800 toward the down payment. Want me to walk through the tax math on that specific lot?'
  )
  appendChatMessage(db, 'advisor', 'user', 'Yes, and what would the tax bill be?')
  appendChatMessage(
    db,
    'advisor',
    'assistant',
    'Selling the Aug 2024 lot: proceeds ≈ $25,800, basis $21,500 → long-term gain ≈ $4,300 (held >1 year). At your income, long-term gains are taxed at 15%, so roughly **$645 of federal tax** — and you could offset it entirely by harvesting part of your $9,000+ ARKK losses in the same tax year (see your Tax-loss harvesting card). Net effect: ~$25,800 toward the house, concentration down to ~19%, and potentially $0 added tax.'
  )
}

function seedCards(db: Db): void {
  saveGeneratedCard(db, 'concentration', {
    title: 'Trim NVIDIA below your own 25% cap',
    summary: 'NVDA is 26% of your invested portfolio — above the 15% risk threshold and your stated 25% AI cap.',
    bodyMd: `## Why\nAcross Fidelity and your 401(k), **NVDA is $43,000 of $165,150 invested — 26%**. One earnings miss moves a quarter of your portfolio. You told me AI is a conviction theme you want capped near 25%, so this isn't about abandoning the thesis — it's about enforcing your own rule.\n\nYour 2021 lot has a ~$39,000 unrealized gain (taxable), while the Aug 2024 lot's gain is ~$4,300. Trimming the newer lot first costs far less in tax per dollar of risk reduction.\n\n## The math\n- NVDA: $43,000 / $165,150 invested = **26.0%**\n- Concentration threshold: 15% · your stated cap: 25%\n- Selling the 150-share Aug 2024 lot (≈$25,800) → NVDA falls to ≈ **19%**\n- Long-term gain on that lot ≈ $4,300 → ≈ $645 federal tax at 15% LTCG`,
    citations: [
      { title: 'FINRA — Concentrate on Concentration Risk', url: 'https://www.finra.org/investors/insights/concentrate-concentration-risk', quote: 'Holding too much of any one investment can expose you to greater risk than you may realize.' },
      { title: 'Investor.gov — Diversification', url: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation', quote: 'By picking the right group of investments, you may be able to limit your losses and reduce the fluctuations of investment returns.' }
    ],
    math: { nvdaValue: 43000, totalInvested: 165150, pct: 26.0, capPct: 25, thresholdPct: 15 },
    profileRefs: ['themes_believed', 'goal_house', 'time_horizon_years'],
    checklist: [
      'Log in to Fidelity and open Positions → NVDA → select the lot acquired 2024-08-15 (150 shares)',
      'Place a limit sell for the full lot near the current price',
      'Confirm the trade settles (T+1) and proceeds land in your core position',
      'Redirect proceeds toward the house down payment fund (see Idle cash card for where)',
      'Mark done here — I will recompute your concentration'
    ]
  })

  saveGeneratedCard(db, 'tax_loss_harvest', {
    title: 'Harvest $9,150 of ARKK losses',
    summary: 'Both ARKK lots are underwater by a combined $9,150 — worth roughly $2,000+ against your taxes.',
    bodyMd: `## Why\nYour ARKK position is worth $19,600 against $28,350 of cost basis. Selling realizes a **$9,150 capital loss** without changing your market exposure for more than 30 days — losses first offset any capital gains (like an NVDA trim), then up to **$3,000/year of ordinary income**, with the rest carrying forward.\n\n**The wash-sale rule is the one trap**: don't rebuy ARKK or a substantially identical fund within 30 days before or after the sale. Parking proceeds in a broad-market ETF you don't already trade (e.g. SCHB) keeps you invested meanwhile.\n\n## The math\n- Lot 1: 250 sh, basis $18,750, value $12,250 → **−$6,500** (long-term)\n- Lot 2: 150 sh, basis $9,600, value $7,350 → **−$2,250** (short-term)\n- Total harvestable: **$9,150**\n- Pairs with an NVDA trim: $4,300 gain fully offset, $3,000 against income, ~$1,850 carries forward`,
    citations: [
      { title: 'IRS Topic 409 — Capital Gains and Losses', url: 'https://www.irs.gov/taxtopics/tc409', quote: 'If your capital losses exceed your capital gains, the amount of the excess loss that you can claim to lower your income is the lesser of $3,000 ($1,500 if married filing separately) or your total net loss.' },
      { title: 'IRS Publication 550 — Wash Sales', url: 'https://www.irs.gov/publications/p550', quote: 'You cannot deduct losses from sales or trades of stock or securities in a wash sale... within 30 days before or after the sale.' },
      { title: 'Fidelity — Tax-loss harvesting', url: 'https://www.fidelity.com/viewpoints/personal-finance/tax-loss-harvesting', quote: 'Tax-loss harvesting allows you to sell investments that are down, replace them with reasonably similar investments, and then offset realized investment gains with those losses.' }
    ],
    math: { totalHarvestable: 9150, lots: [{ symbol: 'ARKK', loss: 6500, term: 'long' }, { symbol: 'ARKK', loss: 2250, term: 'short' }], ordinaryIncomeOffset: 3000 },
    profileRefs: ['risk_appetite'],
    checklist: [
      'Check you haven’t bought ARKK in the last 30 days (wash-sale lookback)',
      'Sell both ARKK lots at Fidelity (419 shares total)',
      'Immediately buy a non-identical broad fund (e.g. SCHB) with the proceeds to stay invested',
      'Set a calendar reminder for 31 days before re-entering ARKK, if you still want it',
      'Save the trade confirmations for tax filing'
    ]
  })

  saveGeneratedCard(db, 'rebalancing', {
    title: 'Shift new contributions toward international and bonds',
    summary: 'You are 87% US stock vs a 55/20/20/5 target — fix it with contributions, not taxable sales.',
    bodyMd: `## Why\nYour portfolio is **87% US stock, 7.5% international, 6.6% bonds** against a sensible 55/20/20/5 target for your horizon. But selling in the taxable account costs capital-gains tax — so rebalance where it's free: inside the 401(k), and with new money.\n\n## The math\n- US stock: 87.0% → target 55% (**−32 pts**)\n- International: 7.5% → target 20% (**+12.5 pts ≈ +$20,600**)\n- Bonds: 6.6% → target 20% (**+13.4 pts ≈ +$22,100**)\n- 401(k) exchange VINIX→bond/intl funds: $0 tax cost\n- The NVDA trim and ARKK harvest (other cards) also reduce US-stock weight`,
    citations: [
      { title: 'Vanguard — Principles for Investing Success', url: 'https://investor.vanguard.com/investor-resources-education/article/principles-for-investing-success', quote: 'Create clear, appropriate investment goals... Develop a suitable asset allocation using broadly diversified funds.' },
      { title: 'Bogleheads — Rebalancing', url: 'https://www.bogleheads.org/wiki/Rebalancing', quote: 'Rebalancing in tax-advantaged accounts avoids the tax consequences of selling in taxable accounts.' }
    ],
    math: { current: { us_stock: 87.0, intl_stock: 7.5, bond: 6.6 }, target: { us_stock: 55, intl_stock: 20, bond: 20, cash: 5 } },
    profileRefs: ['time_horizon_years', 'risk_appetite'],
    checklist: [
      'In Vanguard 401(k), exchange ~$11,000 of VINIX into the international index fund',
      'Exchange ~$11,000 of VINIX into the total bond fund',
      'Change future 401(k) contribution mix to 40% US / 30% intl / 30% bond',
      'Revisit allocation here after the NVDA and ARKK moves settle'
    ]
  })

  saveGeneratedCard(db, 'contribution_gap', {
    title: 'You are on pace to leave $4,900 of 401(k) room unused',
    summary: 'At 6% you’ll contribute ~$19,600 of the $24,500 limit — raising to ~8% closes the gap.',
    bodyMd: `## Why\nYou've contributed $9,800 by late May; at 6% of $165,000 you'll finish near **$19,600 — about $4,900 under the 2026 limit** of $24,500. Every dollar in is a dollar off your 24%-bracket income: maxing saves roughly **$1,175 in federal tax** this year alone.\n\n## The math\n- 2026 elective deferral limit: **$24,500**\n- YTD: $9,800 · remaining pay periods: ≈15\n- Needed per period to max: ($24,500 − $9,800) / 15 ≈ **$980** (≈ 15.5% of gross)\n- Minimum fix: raise 6% → **8%** now, then sweep the rest in December\n- Tax saved at 24% marginal: ≈ $1,175`,
    citations: [
      { title: 'IRS — 401(k) contribution limits', url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits', quote: 'The limit on employee elective deferrals is adjusted annually for inflation.' },
      { title: 'Investor.gov — Employer-sponsored plans', url: 'https://www.investor.gov/additional-resources/retirement-toolkit', quote: 'Contributions to a traditional 401(k) reduce your taxable income in the year you make them.' }
    ],
    math: { limit: 24500, ytd: 9800, projected: 19600, gap: 4900, marginalRate: 0.24 },
    profileRefs: ['goal_retirement_age'],
    checklist: [
      'Log in to your TechCorp benefits portal',
      'Raise 401(k) contribution from 6% to 8%',
      'Verify the change on your next pay stub',
      'In early December, calculate the remaining gap and do a one-time top-up election'
    ]
  })

  saveGeneratedCard(db, 'idle_cash', {
    title: 'Move $28,000 of idle checking — it’s costing you $1,160/yr',
    summary: '$42,000 sits at 0.01% APY; you only need ~$14,000 in checking for your 4-month buffer plan.',
    bodyMd: `## Why\nChase checking holds **$42,000 at 0.01% APY** — effectively zero. Your stated target is a 4-month emergency fund (~$14,000 of monthly essentials assumed at $3,500). You already keep $15,000 at Marcus earning 4.15%, so the extra **$28,000 in checking earns nothing for no reason**.\n\nThis money is also your house-down-payment staging area — a high-yield account or a Treasury ladder keeps it safe *and* paid.\n\n## The math\n- Idle: $42,000 − $14,000 buffer = **$28,000**\n- Drag vs 4.15%: $28,000 × (4.15% − 0.01%) ≈ **$1,160/year**\n- Marcus balance after move: $43,000 — all FDIC-insured (under the $250k limit)`,
    citations: [
      { title: 'FDIC — Deposit Insurance FAQ', url: 'https://www.fdic.gov/resources/deposit-insurance/faq/', quote: 'The standard insurance amount is $250,000 per depositor, per insured bank, for each account ownership category.' },
      { title: 'Consumer Financial Protection Bureau — Savings', url: 'https://www.consumerfinance.gov/consumer-tools/bank-accounts/answers/', quote: 'Comparing rates can help you make sure your money is working for you.' }
    ],
    math: { idleTotal: 28000, weightedApy: 0.01, benchmarkApy: 4.15, annualDrag: 1160 },
    profileRefs: ['emergency_fund_months_target', 'goal_house'],
    checklist: [
      'Decide your checking floor (one month of expenses + upcoming bills ≈ $14,000)',
      'Set up a transfer of $28,000 from Chase to Marcus',
      'Turn on a monthly auto-sweep of anything above the floor',
      'Label the Marcus balance: $15k emergency / $28k house fund',
      'Mark done — I’ll recompute your cash drag'
    ]
  })

  saveGeneratedCard(db, 'withholding_checkup', {
    title: 'Withholding is on track — verify after your 401(k) change',
    summary: 'Projected withholding ≈ $34,100 vs safe harbor $30,580. You’re covered, with margin.',
    bodyMd: `## Why\nYou've withheld **$14,200 through late May**; annualized that's ≈ $34,100. Your 2025 total tax was $27,800, and because your AGI exceeds $150k, your safe harbor is **110% of last year = $30,580**. You clear it — no underpayment penalty risk — and raising your 401(k) contribution will *lower* this year's liability further.\n\nOne caution: if you harvest losses and trim NVDA, your liability drops again. You could mildly **over**-withhold; that's an interest-free loan to the IRS, not a penalty, so no action needed unless you want the cash flow.\n\n## The math\n- Withheld YTD: $14,200 · projected full year ≈ **$34,100**\n- Safe harbor (110% × $27,800): **$30,580** ✓ covered\n- Margin: ≈ $3,520`,
    citations: [
      { title: 'IRS — Tax Withholding Estimator', url: 'https://www.irs.gov/individuals/tax-withholding-estimator', quote: 'Use this tool to estimate the federal income tax you want your employer to withhold from your paycheck.' },
      { title: 'IRS Publication 505 — Withholding and Estimated Tax', url: 'https://www.irs.gov/publications/p505', quote: 'In general, you may owe a penalty for 2026 if the total of your withholding and timely estimated tax payments did not equal at least the smaller of 90% of your 2026 tax or 110% of your 2025 tax (AGI over $150,000).' }
    ],
    math: { withheldYtd: 14200, projectedWithholding: 34100, safeHarbor: 30580, priorYearTax: 27800 },
    profileRefs: [],
    checklist: [
      'Run the IRS Withholding Estimator after your 401(k) change takes effect',
      'Re-check here in October once harvesting/trim trades are done'
    ]
  })

  saveGeneratedCard(db, 'roth_vs_traditional', {
    title: 'Stay traditional in the 401(k), add a Roth IRA on the side',
    summary: 'At a 24% marginal rate with a goal of retiring at 58, pre-tax dollars win — but Roth space is still worth filling.',
    bodyMd: `## Why\nYour marginal rate is **24%** and you plan to retire at **58** — years before Social Security and RMDs, which is exactly when low-income years let you convert or withdraw traditional dollars cheaply. Deferring 24% tax now and realizing it later at likely 10–12% effective is the better trade, so keep the 401(k) traditional.\n\nThat said, **tax diversification matters**: a Roth IRA ($7,500 limit for 2026) gives you a tax-free bucket and flexible early-retirement withdrawals. Your income is near the Roth phase-out — check eligibility; the backdoor route exists if you're over it.\n\n## The math\n- Marginal rate now: **24%** (single, $142,300 taxable; room to the 32% bracket ≈ $59,475)\n- Traditional 401(k) max saves ≈ $5,880 federal tax/yr at 24%\n- Roth IRA 2026 limit: **$7,500**`,
    citations: [
      { title: 'IRS — Roth Comparison Chart', url: 'https://www.irs.gov/retirement-plans/roth-comparison-chart', quote: 'With a Roth account you pay taxes now; with a traditional account you pay taxes later.' },
      { title: 'Bogleheads — Traditional versus Roth', url: 'https://www.bogleheads.org/wiki/Traditional_versus_Roth', quote: 'If your current marginal tax rate is higher than your expected marginal tax rate in retirement, traditional contributions are favored.' }
    ],
    math: { marginalRate: 0.24, taxableIncome: 142300, bracketRoom: 59475, rothIraLimit: 7500 },
    profileRefs: ['goal_retirement_age', 'time_horizon_years'],
    checklist: [
      'Keep 401(k) contributions traditional (no change needed)',
      'Check 2026 Roth IRA income phase-out against your MAGI',
      'Open a Roth IRA at Fidelity and set up monthly contributions toward the $7,500 limit',
      'Revisit in any low-income year — that’s your Roth conversion window'
    ]
  })
}
