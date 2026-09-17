export type ParsedLabLine = {
  test_name: string
  result_value: string
  unit: string
  qualifier: string
  notes: string
  confidence: number
  source_page: number | null
}

export type ParsedLabDocument = {
  text: string
  rows: ParsedLabLine[]
  method: 'pdf_text' | 'ocr'
}

type ProgressFn = (message: string, progress?: number) => void

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js'
const importRemote = (url: string): Promise<any> => (new Function('u', 'return import(u)') as any)(url)

const unitRegex = /(mg\/?l|mg\/?kg|µg\/?l|ug\/?l|μg\/?l|µg\/?kg|ug\/?kg|μg\/?kg|g\/?l|g\/?kg|ng\/?l|ng\/?kg|ppm|ppb|ppt|%|percent|ntu|cfu\/?(?:ml|100ml)|mpn\/?100ml|meq\/?l|mmol\/?l|mol\/?l|µs\/?cm|us\/?cm|ms\/?cm|s\/?m|°c|deg\s*c|ph\s*units?)/i
const numericResultRegex = /(?:<=|>=|<|>|≤|≥)?\s*-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?/
const textResultRegex = /\b(?:ND|N\/D|NOT\s+DETECTED|DETECTED|PASS|FAIL|PRESENT|ABSENT)\b/i
const ignoredLineRegex = /\b(?:certificate\s+of\s+analysis|laboratory|analysis|analytical|method|detection\s+limit|reporting\s+limit|rl\b|mdl\b|lod\b|loq\b|sample\s+(?:id|number|date|name)|client|project|page\s+\d|date\s+received|date\s+reported|signature|quality\s+control|surrogate|batch\s+id)\b/i

function normalizeUnit(value: string) {
  const cleaned = value.replace(/\s+/g, '').replace(/μ/g, 'µ')
  const map: Record<string, string> = {
    'mg/l': 'mg/L',
    'mg/kg': 'mg/kg',
    'ug/l': 'µg/L',
    'µg/l': 'µg/L',
    'ug/kg': 'µg/kg',
    'µg/kg': 'µg/kg',
    'g/l': 'g/L',
    'g/kg': 'g/kg',
    'ng/l': 'ng/L',
    'ng/kg': 'ng/kg',
    ppm: 'ppm',
    ppb: 'ppb',
    ppt: 'ppt',
  }
  return map[cleaned.toLowerCase()] || value.trim()
}

function cleanAnalyte(value: string) {
  return value
    .replace(/^[\s|:;,.\-–—]+|[\s|:;,.\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function standaloneNumericMatches(text: string) {
  const regex = new RegExp(numericResultRegex.source, 'g')
  const matches: Array<{ raw: string; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    const start = match.index
    const end = start + match[0].length
    const before = text[start - 1] || ''
    const after = text[end] || ''
    if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) continue
    if (before === '-' && /[A-Za-z0-9]/.test(text[start - 2] || '')) continue
    if (after === '-' && /[A-Za-z0-9]/.test(text[end + 1] || '')) continue
    matches.push({ raw: match[0].trim(), index: start })
  }
  return matches
}

function parseOneLine(line: string, sourceName: string, sourcePage: number | null): ParsedLabLine | null {
  const compact = line.replace(/[\t|]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (compact.length < 4 || compact.length > 220 || ignoredLineRegex.test(compact)) return null

  const unitMatch = compact.match(unitRegex)
  const textMatch = compact.match(textResultRegex)
  const numericMatches = standaloneNumericMatches(unitMatch ? compact.slice(0, unitMatch.index ?? compact.length) : compact)

  let rawResult = ''
  let resultIndex = -1
  if (textMatch) {
    rawResult = textMatch[0]
    resultIndex = textMatch.index ?? -1
  } else if (numericMatches.length) {
    // Lab rows normally place the reported result before RL/MDL columns.
    const strong = numericMatches.find((item) => /^(?:<=|>=|<|>|≤|≥)/.test(item.raw))
    const chosen = strong || numericMatches[0]
    rawResult = chosen.raw
    resultIndex = chosen.index
  }

  if (!rawResult || resultIndex < 1) {
    const phMatch = compact.match(/^\s*(pH)\s+((?:<=|>=|<|>|≤|≥)?\s*\d+(?:\.\d+)?)/i)
    if (!phMatch) return null
    rawResult = phMatch[2]
    resultIndex = compact.toLowerCase().indexOf(phMatch[2].trim().toLowerCase())
  }

  const analyte = cleanAnalyte(compact.slice(0, resultIndex))
  if (analyte.length < 2 || analyte.length > 90 || !/[A-Za-z]/.test(analyte)) return null

  let qualifier = ''
  let resultValue = rawResult.replace(/\s+/g, ' ').trim()
  const qualifierMatch = resultValue.match(/^(<=|>=|<|>|≤|≥)/)
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].replace('≤', '<=').replace('≥', '>=')
    resultValue = resultValue.slice(qualifierMatch[0].length).trim()
  }

  const unit = unitMatch ? normalizeUnit(unitMatch[0]) : (/^pH$/i.test(analyte) ? 'pH' : '')
  let confidence = unit ? 0.92 : 0.76
  if (/^(ND|N\/D|NOT DETECTED)$/i.test(resultValue)) confidence = Math.max(confidence, 0.84)
  if (numericMatches.length > 2) confidence -= 0.12

  return {
    test_name: analyte,
    result_value: resultValue,
    unit,
    qualifier,
    notes: `Imported from ${sourceName}`,
    confidence: Math.max(0.45, Math.min(0.98, confidence)),
    source_page: sourcePage,
  }
}

export function parseLabText(text: string, sourceName: string): ParsedLabLine[] {
  const seen = new Set<string>()
  const rows: ParsedLabLine[] = []
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const pageMatch = line.match(/^\[PAGE\s+(\d+)\]\s*(.*)$/i)
    const sourcePage = pageMatch ? Number(pageMatch[1]) : null
    const body = pageMatch ? pageMatch[2] : line
    const parsed = parseOneLine(body, sourceName, sourcePage)
    if (!parsed) continue
    const key = `${parsed.test_name.toLowerCase()}|${parsed.result_value.toLowerCase()}|${parsed.unit.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(parsed)
  }
  return rows.slice(0, 250)
}

async function getOcrWorker(progress?: ProgressFn) {
  progress?.('Loading photo reader…', 0.08)
  const tesseract = await importRemote(TESSERACT_URL)
  return tesseract.createWorker('eng', undefined, {
    logger: (entry: any) => {
      if (entry?.status === 'recognizing text') progress?.('Reading document…', 0.15 + Number(entry.progress || 0) * 0.75)
    },
  })
}

async function ocrImage(source: Blob | File | HTMLCanvasElement, progress?: ProgressFn) {
  const worker = await getOcrWorker(progress)
  try {
    const result = await worker.recognize(source)
    return result?.data?.text || ''
  } finally {
    await worker.terminate()
  }
}

async function extractPdf(file: File, progress?: ProgressFn) {
  progress?.('Opening PDF…', 0.05)
  const pdfjs = await importRemote(PDFJS_URL)
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  let textChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress?.(`Reading PDF page ${pageNumber} of ${pdf.numPages}…`, 0.08 + (pageNumber / pdf.numPages) * 0.42)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const grouped = new Map<number, Array<{ x: number; text: string }>>()
    for (const item of content.items || []) {
      if (!('str' in item)) continue
      const transform = (item as any).transform || [1, 0, 0, 1, 0, 0]
      const y = Math.round(Number(transform[5] || 0) / 3) * 3
      const row = grouped.get(y) || []
      row.push({ x: Number(transform[4] || 0), text: String((item as any).str || '') })
      grouped.set(y, row)
    }
    const pageLines = [...grouped.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((part) => part.text).join(' ').replace(/\s{2,}/g, ' ').trim())
      .filter(Boolean)
    const pageText = pageLines.map((line) => `[PAGE ${pageNumber}] ${line}`).join('\n')
    textChars += pageText.length
    pages.push(pageText)
  }

  // If a PDF has almost no embedded text, it is probably a scanned report.
  if (textChars >= 120) return { text: pages.join('\n'), method: 'pdf_text' as const }

  progress?.('PDF is scanned. Switching to OCR…', 0.52)
  const worker = await getOcrWorker(progress)
  const ocrPages: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      progress?.(`OCR page ${pageNumber} of ${pdf.numPages}…`, 0.55 + ((pageNumber - 1) / pdf.numPages) * 0.4)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.75 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) continue
      await page.render({ canvasContext: context, viewport }).promise
      const result = await worker.recognize(canvas)
      const pageText = String(result?.data?.text || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line: string) => `[PAGE ${pageNumber}] ${line}`)
        .join('\n')
      ocrPages.push(pageText)
    }
  } finally {
    await worker.terminate()
  }
  return { text: ocrPages.join('\n'), method: 'ocr' as const }
}

export async function parseLabDocument(file: File, progress?: ProgressFn): Promise<ParsedLabDocument> {
  const lower = file.name.toLowerCase()
  let text = ''
  let method: 'pdf_text' | 'ocr' = 'ocr'

  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdf = await extractPdf(file, progress)
    text = pdf.text
    method = pdf.method
  } else {
    progress?.('Reading photo…', 0.08)
    text = await ocrImage(file, progress)
    method = 'ocr'
  }

  progress?.('Finding test result lines…', 0.96)
  const rows = parseLabText(text, file.name)
  progress?.(`Found ${rows.length} test line${rows.length === 1 ? '' : 's'}.`, 1)
  return { text, rows, method }
}
