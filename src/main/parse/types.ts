import type { DocKind, ExtractionDraft } from '../../shared/types'

export type RawFormat = 'csv' | 'xlsx' | 'pdf-text' | 'pdf-scanned' | 'unknown'

export interface RawDocument {
  format: RawFormat
  /** csv/xlsx rows; [] for pdf */
  rows: string[][]
  /** pdf text lines; [] for csv/xlsx */
  textLines: string[]
}

export interface TemplateOutput {
  /** conforms to EXTRACTION_SCHEMAS[docKind] */
  data: unknown
  lowConfidence: string[]
}

export interface Template {
  id: string
  docKind: DocKind
  label: string
  detect(raw: RawDocument): boolean
  map(raw: RawDocument): TemplateOutput
}

export type ParseResult =
  | { status: 'parsed'; templateId: string; data: unknown; lowConfidence: string[] }
  | { status: 'needs_fallback'; reason: 'no_template' | 'scanned_pdf' | 'unreadable' }

export type UploadResult =
  | { kind: 'draft'; draft: ExtractionDraft }
  | { kind: 'fallback'; docId: number; docKind: DocKind; reason: string }
