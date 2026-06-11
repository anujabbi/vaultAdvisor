import type { HeroScenario } from '../../shared/types'

/**
 * Fictional persona "Sam" powering the first-launch hero scenarios.
 * All numbers were produced by running the real finance math over this
 * sample data, so the lure is an honest preview of what the app does.
 */
export const HERO_SCENARIOS: HeroScenario[] = [
  {
    id: 'sample-harvest',
    domain: 'tax_loss_harvest',
    headline: 'Sam harvested $11,700 in paper losses',
    subline: 'and cut this year’s tax bill by $4,100 — without changing his market exposure.',
    savings: '$4,100 saved',
    bodyMd: `Sam's brokerage statement showed two lots of a thematic ETF sitting **$11,700 underwater** while the rest of his portfolio was up.

**What VaultAdvisor found:** selling those specific lots realizes the loss for taxes. At his **35% marginal rate**, harvesting offsets gains and up to $3,000 of ordinary income — about **$4,100 of tax saved** this year.

**The catch it warned him about:** the wash-sale rule. Sam waited 31 days before rebuying anything substantially identical, and parked the proceeds in a broad-market fund meanwhile.

Your statement has lots like this too — most portfolios do after any volatile year.`,
    unlockDocKind: 'brokerage',
    unlockCta: 'Upload a brokerage statement and see your harvestable losses'
  },
  {
    id: 'sample-concentration',
    domain: 'concentration',
    headline: 'Sam was 38% in one stock and didn’t know it',
    subline: 'Three accounts, one employer stock plan — nobody had ever added it up.',
    savings: '38% → 15% plan',
    bodyMd: `Across his 401(k), an old IRA, and an employer stock plan, Sam held the **same company in all three** — 38% of his net worth in one ticker.

**What VaultAdvisor found:** any single position above ~15% is concentration risk: one earnings miss moves your whole retirement. It built a staged exit — sell inside the tax-advantaged accounts first (no tax cost), redirect new contributions, and trim the taxable lot across two tax years.

**Result:** a plan to get to 15% in 14 months with a fraction of the tax bill of selling all at once.`,
    unlockDocKind: 'brokerage',
    unlockCta: 'Upload your statements and see your true concentration'
  },
  {
    id: 'sample-idle-cash',
    domain: 'idle_cash',
    headline: 'Sam’s checking account was costing him $2,300 a year',
    subline: '$58,000 sitting at 0.01% APY while money markets paid 4%.',
    savings: '$2,300/yr recovered',
    bodyMd: `Sam kept **$58,000 in checking** "to be safe." At 0.01% APY that safety earned him $6 a year.

**What VaultAdvisor found:** he needed about $18,000 for a real emergency fund (4 months of expenses — from his own pay stub data). The rest was pure drag: **$2,300/year** lost versus a 4% high-yield account.

**The checklist it gave him:** open an HYSA (15 minutes), keep one month of expenses in checking, move the rest, set a monthly sweep. Done in an afternoon, FDIC-insured the whole way.`,
    unlockDocKind: 'bank',
    unlockCta: 'Upload a bank statement and see your idle-cash drag'
  }
]
