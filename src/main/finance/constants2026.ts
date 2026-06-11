// US federal tax constants for tax year 2026.
// Sources: IRS Rev. Proc. 2025-32 (2026 inflation adjustments),
// IRS Notice 2025-67 (2026 retirement plan limits) — https://www.irs.gov/newsroom
import type { FilingStatus } from '../../shared/types'

export interface Bracket {
  rate: number
  upTo: number // upper bound of taxable income for this bracket; Infinity for top
}

export const BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  single: [
    { rate: 0.1, upTo: 12400 },
    { rate: 0.12, upTo: 50400 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256225 },
    { rate: 0.35, upTo: 640600 },
    { rate: 0.37, upTo: Infinity }
  ],
  mfj: [
    { rate: 0.1, upTo: 24800 },
    { rate: 0.12, upTo: 100800 },
    { rate: 0.22, upTo: 211400 },
    { rate: 0.24, upTo: 403550 },
    { rate: 0.32, upTo: 512450 },
    { rate: 0.35, upTo: 768700 },
    { rate: 0.37, upTo: Infinity }
  ],
  mfs: [
    { rate: 0.1, upTo: 12400 },
    { rate: 0.12, upTo: 50400 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201775 },
    { rate: 0.32, upTo: 256225 },
    { rate: 0.35, upTo: 384350 },
    { rate: 0.37, upTo: Infinity }
  ],
  hoh: [
    { rate: 0.1, upTo: 17700 },
    { rate: 0.12, upTo: 67450 },
    { rate: 0.22, upTo: 105700 },
    { rate: 0.24, upTo: 201750 },
    { rate: 0.32, upTo: 256200 },
    { rate: 0.35, upTo: 640600 },
    { rate: 0.37, upTo: Infinity }
  ]
}

export const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  single: 16100,
  mfj: 32200,
  mfs: 16100,
  hoh: 24150
}

export const LIMITS_2026 = {
  k401Elective: 24500,
  k401CatchUp50: 8000,
  iraContribution: 7500,
  iraCatchUp50: 1100,
  hsaSelf: 4400,
  hsaFamily: 8750
}

/** Benchmark high-yield savings APY used for idle-cash drag comparisons. */
export const HYSA_BENCHMARK_APY = 4.0
