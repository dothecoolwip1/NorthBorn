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

type PositionedWord = {
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

type PositionedLine = {
  page: number
  y: number
  words: PositionedWord[]
}

type ExtractedDocument = {
  text: string
  lines: PositionedLine[]
  method: 'pdf_text' | 'ocr'
}

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js'
const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js'
const importRemote = (url: string): Promise<any> => (new Function('u', 'return import(u)') as any)(url)

let tesseractScriptPromise: Promise<any> | null = null

const unitRegex = /(mg\/?l|mg\/?kg|µg\/?l|ug\/?l|μg\/?l|µg\/?kg|ug\/?kg|μg\/?kg|g\/?l|g\/?kg|ng\/?l|ng\/?kg|ppm|ppb|ppt|%|percent|ntu|cfu\/?(?:ml|100ml)|mpn\/?100ml|meq\/?l|mmol\/?l|mol\/?l|µs\/?cm|us\/?cm|ms\/?cm|s\/?m|°c|deg\s*c|ph\s*units?)/i
const numericResultRegex = /(?:<=|>=|<|>|≤|≥)?\s*-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?/
const textResultRegex = /\b(?:ND|N\/D|NOT\s+DETECTED|DETECTED|PASS|FAIL|PRESENT|ABSENT)\b/i
const ignoredLineRegex = /\b(?:certificate\s+of\s+analysis|laboratory|analytical\s+request|method|detection\s+limit|reporting\s+limit|rl\b|mdl\b|lod\b|loq\b|sample\s+(?:id|number|date|name|type|identification)|client|project|page\s+\d|date\s+(?:received|reported|collected)|signature|quality\s+control|surrogate|batch\s+id|collected\s+by|received\s+by|released\s+by|field\s+label|work\s+description|field\s+observations|reason\s+taken|storage|preservation|quantity|status|location|chain\s+of\s+custody|lab\s+(?:name|no\.?|receipt)|example\s+only)\b/i
const unitlessAnalyteRegex = /^(?:pH|SAR|sodium\s+adsorption\s+ratio|flash\s+point)$/i
const analyteHeaderRegex = /^(?:parameter|analyte|test|compound|constituent|analysis)$/i
const resultHeaderRegex = /^(?:result|results|value|concentration)$/i
const unitHeaderRegex = /^(?:unit|units)$/i

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

function normalizeResult(rawResult: string) {
  let qualifier = ''
  let resultValue = rawResult.replace(/\s+/g, ' ').trim()
  const qualifierMatch = resultValue.match(/^(<=|>=|<|>|≤|≥)/)
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].replace('≤', '<=').replace('≥', '>=')
    resultValue = resultValue.slice(qualifierMatch[0].length).trim()
  }
  return { resultValue, qualifier }
}

function makeParsedRow(
  analyteInput: string,
  resultInput: string,
  unitInput: string,
  sourceName: string,
  sourcePage: number | null,
  confidence: number,
): ParsedLabLine | null {
  const analyte = cleanAnalyte(analyteInput)
  if (analyte.length < 2 || analyte.length > 90 || !/[A-Za-z]/.test(analyte) || ignoredLineRegex.test(analyte)) return null

  const { resultValue, qualifier } = normalizeResult(resultInput)
  if (!resultValue) return null

  const unit = unitInput ? normalizeUnit(unitInput) : (/^pH$/i.test(analyte) ? 'pH' : '')
  return {
    test_name: analyte,
    result_value: resultValue,
    unit,
    qualifier,
    notes: \`Imported from \${sourceName}\`,
    confidence: Math.max(0.45, Math.min(0.99, confidence)),
    source_page: sourcePage,
  }
}

function parseOneLine(line: string, sourceName: string, sourcePage: number | null): ParsedLabLine | null {
  const compact = line.replace(/[\t|]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (compact.length < 4 || compact.length > 220 || ignoredLineRegex.test(compact)) return null

  const unitMatch = compact.match(unitRegex)
  const textMatch = compact.match(textResultRegex)
  const searchArea = unitMatch ? compact.slice(0, unitMatch.index ?? compact.length) : compact
  const numericMatches = standaloneNumericMatches(searchArea)

  let rawResult = ''
  let resultIndex = -1
  if (textMatch) {
    rawResult = textMatch[0]
    resultIndex = textMatch.index ?? -1
  } else if (numericMatches.length) {
    const strong = numericMatches.find((item) => /^(?:<=|>=|<|>|≤|≥)/.test(item.raw))
    const chosen = strong || numericMatches[0]
    rawResult = chosen.raw
    resultIndex = chosen.index
  }

  const phMatch = compact.match(/^\s*(pH)\s+((?:<=|>=|<|>|≤|≥)?\s*\d+(?:\.\d+)?)/i)
  if ((!rawResult || resultIndex < 1) && phMatch) {
    rawResult = phMatch[2]
    resultIndex = compact.toLowerCase().indexOf(phMatch[2].trim().toLowerCase())
  }

  if (!rawResult || resultIndex < 1) return null

  const analyte = cleanAnalyte(compact.slice(0, resultIndex))
  const hasRecognizedUnit = Boolean(unitMatch)
  const hasTextResult = Boolean(textMatch)
  const isUnitlessAnalyte = unitlessAnalyteRegex.test(analyte)

  if (!hasRecognizedUnit && !hasTextResult && !isUnitlessAnalyte) return null

  let confidence = hasRecognizedUnit ? 0.91 : hasTextResult ? 0.82 : 0.86
  if (numericMatches.length > 2) confidence -= 0.08

  return makeParsedRow(
    analyte,
    rawResult,
    unitMatch ? unitMatch[0] : '',
    sourceName,
    sourcePage,
    confidence,
  )
}

function lineText(line: PositionedLine) {
  const words = [...line.words].sort((a, b) => a.x - b.x)
  if (!words.length) return ''
  let text = words[0].text
  let previousRight = words[0].x + words[0].width
  const medianHeight = [...words].map((word) => word.height).sort((a, b) => a - b)[Math.floor(words.length / 2)] || 10

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    const gap = word.x - previousRight
    text += gap > Math.max(18, medianHeight * 2.1) ? \`\t\${word.text}\` : \` \${word.text}\`
    previousRight = Math.max(previousRight, word.x + word.width)
  }
  return text.replace(/\s+$/g, '')
}

function headerPositions(line: PositionedLine) {
  const words = [...line.words].sort((a, b) => a.x - b.x)
  const analyte = words.find((word) => analyteHeaderRegex.test(word.text.replace(/[^A-Za-z]/g, '')))
  const result = words.find((word) => resultHeaderRegex.test(word.text.replace(/[^A-Za-z]/g, '')))
  const unit = words.find((word) => unitHeaderRegex.test(word.text.replace(/[^A-Za-z]/g, '')))
  if (!analyte || !result || !unit || !(analyte.x < result.x && result.x < unit.x)) return null
  return { analyteX: analyte.x, resultX: result.x, unitX: unit.x }
}

function parseSpatialTable(lines: PositionedLine[], sourceName: string) {
  const rows: ParsedLabLine[] = []

  for (let headerIndex = 0; headerIndex < lines.length; headerIndex += 1) {
    const header = lines[headerIndex]
    const positions = headerPositions(header)
    if (!positions) continue

    const firstBoundary = (positions.analyteX + positions.resultX) / 2
    const secondBoundary = (positions.resultX + positions.unitX) / 2

    for (let index = headerIndex + 1; index < Math.min(lines.length, headerIndex + 90); index += 1) {
      const line = lines[index]
      if (line.page !== header.page) break
      const text = lineText(line).trim()
      if (!text) continue
      if (headerPositions(line)) break
      if (/^\d+\.\s+[A-Z]/.test(text) || /^(?:notes?|comments?|quality\s+control|chain\s+of\s+custody)\b/i.test(text)) break

      const analyteText = line.words.filter((word) => word.x < firstBoundary).sort((a, b) => a.x - b.x).map((word) => word.text).join(' ')
      const resultText = line.words.filter((word) => word.x >= firstBoundary && word.x < secondBoundary).sort((a, b) => a.x - b.x).map((word) => word.text).join(' ')
      const unitText = line.words.filter((word) => word.x >= secondBoundary).sort((a, b) => a.x - b.x).map((word) => word.text).join(' ')

      const resultMatch = resultText.match(textResultRegex) || resultText.match(numericResultRegex)
      const unitMatch = unitText.match(unitRegex)
      if (!resultMatch || !unitMatch) continue

      const averageOcrConfidence = line.words.length
        ? line.words.reduce((sum, word) => sum + word.confidence, 0) / line.words.length
        : 100
      const confidence = 0.9 + Math.max(0, Math.min(0.07, averageOcrConfidence / 1000))
      const parsed = makeParsedRow(analyteText, resultMatch[0], unitMatch[0], sourceName, line.page, confidence)
      if (parsed) rows.push(parsed)
    }
  }

  return rows
}

function dedupeRows(rows: ParsedLabLine[]) {
  const seen = new Set<string>()
  const deduped: ParsedLabLine[] = []
  for (const row of rows) {
    const key = \`\${row.test_name.toLowerCase()}|\${row.result_value.toLowerCase()}|\${row.unit.toLowerCase()}\`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }
  return deduped.slice(0, 250)
}

export function parseLabText(text: string, sourceName: string): ParsedLabLine[] {
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
    if (parsed) rows.push(parsed)
  }
  return dedupeRows(rows)
}

function parseExtractedDocument(document: ExtractedDocument, sourceName: string) {
  const spatialRows = parseSpatialTable(document.lines, sourceName)
  const textRows = parseLabText(document.text, sourceName)
  return dedupeRows([...spatialRows, ...textRows])
}

async function loadTesseractApi() {
  const existing = (window as any).Tesseract
  if (typeof existing?.createWorker === 'function') return existing

  if (!tesseractScriptPromise) {
    tesseractScriptPromise = new Promise((resolve, reject) => {
      const prior = document.querySelector<HTMLScriptElement>('script[data-mallard-tesseract]')
      if (prior) {
        prior.addEventListener('load', () => resolve((window as any).Tesseract), { once: true })
        prior.addEventListener('error', () => reject(new Error('OCR engine failed to load. Check your connection and try again.')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = TESSERACT_SCRIPT_URL
      script.async = true
      script.crossOrigin = 'anonymous'
      script.dataset.mallardTesseract = 'true'
      script.onload = () => resolve((window as any).Tesseract)
      script.onerror = () => reject(new Error('OCR engine failed to load. Check your connection and try again.'))
      document.head.appendChild(script)
    }).then((api) => {
      if (typeof api?.createWorker !== 'function') throw new Error('OCR engine loaded without the expected browser API.')
      return api
    }).catch((error) => {
      tesseractScriptPromise = null
      throw error
    })
  }

  return tesseractScriptPromise
}

async function getOcrWorker(progress?: ProgressFn) {
  progress?.('Loading photo reader…', 0.08)
  const tesseract = await loadTesseractApi()
  return tesseract.createWorker('eng', 1, {
    workerPath: TESSERACT_WORKER_URL,
    logger: (entry: any) => {
      if (entry?.status === 'recognizing text') progress?.('Reading document…', 0.15 + Number(entry.progress || 0) * 0.75)
    },
  })
}

function linesFromTsv(tsv: string, pageNumber: number): PositionedLine[] {
  if (!tsv) return []
  const grouped = new Map<string, PositionedWord[]>()
  const rows = tsv.split(/\r?\n/)
  for (let index = 1; index < rows.length; index += 1) {
    const columns = rows[index].split('\t')
    if (columns.length < 12 || columns[0] !== '5') continue
    const text = columns.slice(11).join('\t').trim()
    if (!text) continue
    const key = \`\${columns[2]}:\${columns[3]}:\${columns[4]}\`
    const list = grouped.get(key) || []
    list.push({
      text,
      x: Number(columns[6] || 0),
      y: Number(columns[7] || 0),
      width: Number(columns[8] || 0),
      height: Number(columns[9] || 0),
      confidence: Math.max(0, Number(columns[10] || 0)),
    })
    grouped.set(key, list)
  }

  return [...grouped.values()]
    .filter((words) => words.length)
    .map((words) => ({
      page: pageNumber,
      y: Math.min(...words.map((word) => word.y)),
      words: words.sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => a.y - b.y)
}

async function recognizeWithLayout(worker: any, source: Blob | File | HTMLCanvasElement) {
  const result = await worker.recognize(source, { rotateAuto: true }, { text: true, tsv: true })
  return {
    text: String(result?.data?.text || ''),
    tsv: String(result?.data?.tsv || ''),
  }
}

async function ocrImage(source: Blob | File | HTMLCanvasElement, progress?: ProgressFn): Promise<ExtractedDocument> {
  const worker = await getOcrWorker(progress)
  try {
    const result = await recognizeWithLayout(worker, source)
    return {
      text: result.text.split(/\r?\n/).filter(Boolean).map((line) => \`[PAGE 1] \${line}\`).join('\n'),
      lines: linesFromTsv(result.tsv, 1),
      method: 'ocr',
    }
  } finally {
    await worker.terminate()
  }
}

async function extractPdf(file: File, progress?: ProgressFn): Promise<ExtractedDocument> {
  progress?.('Opening PDF…', 0.05)
  const pdfjs = await importRemote(PDFJS_URL)
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  const positionedLines: PositionedLine[] = []
  let textChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress?.(\`Reading PDF page \${pageNumber} of \${pdf.numPages}…\`, 0.08 + (pageNumber / pdf.numPages) * 0.42)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const words: PositionedWord[] = []

    for (const item of content.items || []) {
      if (!('str' in item)) continue
      const text = String((item as any).str || '').trim()
      if (!text) continue
      const transform = (item as any).transform || [1, 0, 0, 1, 0, 0]
      words.push({
        text,
        x: Number(transform[4] || 0),
        y: Number(transform[5] || 0),
        width: Math.max(1, Number((item as any).width || 1)),
        height: Math.max(1, Number((item as any).height || Math.abs(transform[3]) || 10)),
        confidence: 100,
      })
    }

    const sorted = words.sort((a, b) => b.y - a.y || a.x - b.x)
    const pageLines: PositionedLine[] = []
    for (const word of sorted) {
      const tolerance = Math.max(2.5, Math.min(6, word.height * 0.42))
      let line = pageLines.find((candidate) => Math.abs(candidate.y - word.y) <= tolerance)
      if (!line) {
        line = { page: pageNumber, y: word.y, words: [] }
        pageLines.push(line)
      }
      line.words.push(word)
    }

    pageLines.sort((a, b) => b.y - a.y)
    for (const line of pageLines) line.words.sort((a, b) => a.x - b.x)
    positionedLines.push(...pageLines)

    const pageText = pageLines
      .map((line) => \`[PAGE \${pageNumber}] \${lineText(line)}\`)
      .filter((line) => line.trim())
      .join('\n')
    textChars += pageText.length
    pages.push(pageText)
  }

  if (textChars >= 120) {
    return { text: pages.join('\n'), lines: positionedLines, method: 'pdf_text' }
  }

  progress?.('PDF is scanned. Switching to OCR…', 0.52)
  const worker = await getOcrWorker(progress)
  const ocrPages: string[] = []
  const ocrLines: PositionedLine[] = []
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      progress?.(\`OCR page \${pageNumber} of \${pdf.numPages}…\`, 0.55 + ((pageNumber - 1) / pdf.numPages) * 0.4)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2.25 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) continue
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise

      const result = await recognizeWithLayout(worker, canvas)
      const pageLines = linesFromTsv(result.tsv, pageNumber)
      ocrLines.push(...pageLines)
      const pageText = pageLines.length
        ? pageLines.map((line) => \`[PAGE \${pageNumber}] \${lineText(line)}\`).join('\n')
        : result.text.split(/\r?\n/).filter(Boolean).map((line: string) => \`[PAGE \${pageNumber}] \${line}\`).join('\n')
      ocrPages.push(pageText)
    }
  } finally {
    await worker.terminate()
  }

  return { text: ocrPages.join('\n'), lines: ocrLines, method: 'ocr' }
}

export async function parseLabDocument(file: File, progress?: ProgressFn): Promise<ParsedLabDocument> {
  const lower = file.name.toLowerCase()
  let extracted: ExtractedDocument

  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    extracted = await extractPdf(file, progress)
  } else {
    progress?.('Reading photo…', 0.08)
    extracted = await ocrImage(file, progress)
  }

  progress?.('Finding test result lines…', 0.96)
  const rows = parseExtractedDocument(extracted, file.name)
  progress?.(\`Found \${rows.length} confident test line\${rows.length === 1 ? '' : 's'}.\`, 1)
  return { text: extracted.text, rows, method: extracted.method }
}
