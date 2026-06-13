import type { DocKind } from '../../shared/types'
import { EXTRACTION_SCHEMAS } from '../ingest/schemas'
import { readDocument } from './readers'
import type { ParseResult, RawDocument, Template } from './types'
import { fidelityBrokerage } from './templates/fidelityBrokerage'
import { schwabBrokerage } from './templates/schwabBrokerage'
import { vanguardBrokerage } from './templates/vanguardBrokerage'
import { form1040 } from './templates/form1040'
import { genericBrokerageCsv } from './templates/genericBrokerageCsv'

// Order matters: specific institution templates first, generic fallback last.
export const TEMPLATES: Template[] = [
  fidelityBrokerage,
  schwabBrokerage,
  vanguardBrokerage,
  form1040,
  genericBrokerageCsv
]

export function selectTemplate(
  raw: RawDocument,
  kind: DocKind,
  templates: Template[] = TEMPLATES
): Template | undefined {
  return templates.find((t) => t.docKind === kind && safeDetect(t, raw))
}

function safeDetect(t: Template, raw: RawDocument): boolean {
  try {
    return t.detect(raw)
  } catch {
    return false
  }
}

export function validateOrFallback(
  kind: DocKind,
  data: unknown,
  lowConfidence: string[]
): ParseResult {
  const parsed = EXTRACTION_SCHEMAS[kind].safeParse(data)
  if (!parsed.success) return { status: 'needs_fallback', reason: 'no_template' }
  return { status: 'parsed', templateId: 'validated', data: parsed.data, lowConfidence }
}

export async function parseDocument(filePath: string, kind: DocKind): Promise<ParseResult> {
  const raw = await readDocument(filePath)
  if (raw.format === 'pdf-scanned') return { status: 'needs_fallback', reason: 'scanned_pdf' }
  if (raw.format === 'unknown') return { status: 'needs_fallback', reason: 'unreadable' }
  const template = selectTemplate(raw, kind)
  if (!template) return { status: 'needs_fallback', reason: 'no_template' }
  let out
  try {
    out = template.map(raw)
  } catch {
    return { status: 'needs_fallback', reason: 'no_template' }
  }
  const result = validateOrFallback(kind, out.data, out.lowConfidence)
  if (result.status === 'parsed') return { ...result, templateId: template.id }
  return result
}
