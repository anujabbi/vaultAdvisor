import { readFileSync } from 'fs'
import { extname } from 'path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { RawDocument } from './types'

export async function readDocument(filePath: string): Promise<RawDocument> {
  const ext = extname(filePath).toLowerCase()
  try {
    if (ext === '.csv') return readCsv(filePath)
    if (ext === '.xlsx' || ext === '.xls') return readXlsx(filePath)
    if (ext === '.pdf') return await readPdf(filePath)
    return empty('unknown')
  } catch {
    return empty('unknown')
  }
}

function empty(format: RawDocument['format']): RawDocument {
  return { format, rows: [], textLines: [] }
}

function readCsv(filePath: string): RawDocument {
  const text = readFileSync(filePath, 'utf8')
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  return { format: 'csv', rows: parsed.data as string[][], textLines: [] }
}

function readXlsx(filePath: string): RawDocument {
  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
  return { format: 'xlsx', rows: rows as string[][], textLines: [] }
}

async function readPdf(filePath: string): Promise<RawDocument> {
  // Legacy build runs under Node (no DOM). Dynamic import keeps the ESM module
  // out of the CJS require graph.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(readFileSync(filePath))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pageText = content.items.map((i: { str?: string }) => i.str ?? '').join(' ')
    if (pageText.trim()) lines.push(...pageText.split('\n'))
  }
  if (lines.join('').trim().length === 0) return empty('pdf-scanned')
  return { format: 'pdf-text', rows: [], textLines: lines }
}
