import {
  interpretDocumentLayout,
  type LayoutPage,
  type LayoutToken,
  type MallardDocumentProfile,
  type ParsedLabDocument,
} from './mallardDocumentEngine'

type ProgressFn = (message: string, progress?: number) => void

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js'
const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js'
const importRemote = (url: string): Promise<any> => (new Function('u', 'return import(u)') as any)(url)

let tesseractScriptPromise: Promise<any> | null = null

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
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
    })
      .then((api) => {
        if (typeof api?.createWorker !== 'function') {
          throw new Error('OCR engine loaded without the expected browser API.')
        }
        return api
      })
      .catch((error) => {
        tesseractScriptPromise = null
        throw error
      })
  }

  return tesseractScriptPromise
}

async function getOcrWorker(progress?: ProgressFn) {
  progress?.('Loading OCR engine…', 0.08)
  const tesseract = await loadTesseractApi()
  return tesseract.createWorker('eng', 1, {
    workerPath: TESSERACT_WORKER_URL,
    logger: (entry: any) => {
      if (entry?.status === 'recognizing text') {
        progress?.('Reading document image…', 0.15 + Number(entry.progress || 0) * 0.72)
      }
    },
  })
}

function tokenFromPdfItem(item: any, pageNumber: number, pageHeight: number): LayoutToken | null {
  const text = normalizeText(item?.str)
  if (!text) return null

  const transform = Array.isArray(item?.transform) ? item.transform : [1, 0, 0, 1, 0, 0]
  const x = Number(transform[4] || 0)
  const baselineFromBottom = Number(transform[5] || 0)
  const fontHeight = Math.max(
    4,
    Math.abs(Number(item?.height || 0)),
    Math.abs(Number(transform[3] || 0)),
  )
  const width = Math.max(
    2,
    Math.abs(Number(item?.width || 0)),
    text.length * Math.max(2.5, fontHeight * 0.38),
  )

  const baselineFromTop = pageHeight - baselineFromBottom
  const y0 = Math.max(0, baselineFromTop - fontHeight)
  const y1 = Math.max(y0 + 1, baselineFromTop + Math.max(1, fontHeight * 0.12))

  return {
    page: pageNumber,
    text,
    x0: x,
    y0,
    x1: x + width,
    y1,
    confidence: null,
  }
}

async function extractNativePdfLayout(file: File, progress?: ProgressFn) {
  progress?.('Opening PDF…', 0.04)
  const pdfjs = await importRemote(PDFJS_URL)
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: LayoutPage[] = []
  let textChars = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress?.(
      `Reading PDF layout page ${pageNumber} of ${pdf.numPages}…`,
      0.06 + (pageNumber / pdf.numPages) * 0.42,
    )
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const tokens: LayoutToken[] = []

    for (const item of content.items || []) {
      if (!('str' in item)) continue
      const token = tokenFromPdfItem(item, pageNumber, viewport.height)
      if (!token) continue
      textChars += token.text.length
      tokens.push(token)
    }

    pages.push({
      page: pageNumber,
      width: viewport.width,
      height: viewport.height,
      tokens,
    })
  }

  return { pdf, pages, textChars }
}

function collectTesseractWords(data: any, pageNumber: number, scale = 1): LayoutToken[] {
  const tokens: LayoutToken[] = []
  const seen = new Set<string>()

  const addWord = (word: any) => {
    const text = normalizeText(word?.text)
    const bbox = word?.bbox
    if (!text || !bbox) return

    const x0 = Number(bbox.x0)
    const y0 = Number(bbox.y0)
    const x1 = Number(bbox.x1)
    const y1 = Number(bbox.y1)
    if (![x0, y0, x1, y1].every(Number.isFinite)) return

    const key = `${text}|${Math.round(x0)}|${Math.round(y0)}|${Math.round(x1)}|${Math.round(y1)}`
    if (seen.has(key)) return
    seen.add(key)

    tokens.push({
      page: pageNumber,
      text,
      x0: x0 / scale,
      y0: y0 / scale,
      x1: x1 / scale,
      y1: y1 / scale,
      confidence: Number.isFinite(Number(word?.confidence)) ? Number(word.confidence) : null,
    })
  }

  const blocks = Array.isArray(data?.blocks) ? data.blocks : []
  for (const block of blocks) {
    for (const paragraph of block?.paragraphs || []) {
      for (const line of paragraph?.lines || []) {
        for (const word of line?.words || []) addWord(word)
      }
    }
  }

  if (!tokens.length && Array.isArray(data?.words)) {
    for (const word of data.words) addWord(word)
  }

  return tokens.sort((a, b) => {
    const ay = (a.y0 + a.y1) / 2
    const by = (b.y0 + b.y1) / 2
    return Math.abs(ay - by) < 3 ? a.x0 - b.x0 : ay - by
  })
}

async function recognizeCanvas(
  worker: any,
  canvas: HTMLCanvasElement,
  pageNumber: number,
  coordinateScale: number,
) {
  const result = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true, text: true })
  const tokens = collectTesseractWords(result?.data, pageNumber, coordinateScale)
  return {
    tokens,
    rawText: normalizeText(result?.data?.text),
  }
}

async function ocrPdfPages(
  pdf: any,
  progress?: ProgressFn,
): Promise<LayoutPage[]> {
  const worker = await getOcrWorker(progress)
  const pages: LayoutPage[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      progress?.(
        `OCR page ${pageNumber} of ${pdf.numPages}…`,
        0.49 + ((pageNumber - 1) / Math.max(1, pdf.numPages)) * 0.46,
      )
      const page = await pdf.getPage(pageNumber)
      const logicalViewport = page.getViewport({ scale: 1 })
      const renderScale = 2.15
      const viewport = page.getViewport({ scale: renderScale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Could not prepare a canvas for OCR.')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise
      const recognized = await recognizeCanvas(worker, canvas, pageNumber, renderScale)

      pages.push({
        page: pageNumber,
        width: logicalViewport.width,
        height: logicalViewport.height,
        tokens: recognized.tokens,
      })
    }
  } finally {
    await worker.terminate()
  }

  return pages
}

async function fileToCanvas(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Could not open the image for OCR.'))
      element.src = objectUrl
    })

    const naturalWidth = Math.max(1, image.naturalWidth || image.width)
    const naturalHeight = Math.max(1, image.naturalHeight || image.height)
    const minimumWidthScale = naturalWidth < 1700 ? 1700 / naturalWidth : 1
    const maximumDimensionScale = 3200 / Math.max(naturalWidth, naturalHeight)
    const scale = Math.max(0.4, Math.min(2.5, minimumWidthScale, maximumDimensionScale))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not prepare the image for OCR.')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return { canvas, naturalWidth, naturalHeight, scale }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function extractImageLayout(file: File, progress?: ProgressFn) {
  progress?.('Preparing image…', 0.04)
  const { canvas, naturalWidth, naturalHeight, scale } = await fileToCanvas(file)
  const worker = await getOcrWorker(progress)

  try {
    progress?.('Reading image layout…', 0.12)
    const result = await recognizeCanvas(worker, canvas, 1, scale)
    return [{
      page: 1,
      width: naturalWidth,
      height: naturalHeight,
      tokens: result.tokens,
    }] satisfies LayoutPage[]
  } finally {
    await worker.terminate()
  }
}

function hasUsefulNativeText(pages: LayoutPage[], textChars: number) {
  if (textChars < 100) return false
  const tokenCount = pages.reduce((sum, page) => sum + page.tokens.length, 0)
  const wordLikeCount = pages.reduce(
    (sum, page) => sum + page.tokens.filter((token) => /[A-Za-z0-9]{2}/.test(token.text)).length,
    0,
  )
  return tokenCount >= 10 && wordLikeCount >= 8
}

export async function parseLabDocument(
  file: File,
  progress?: ProgressFn,
  profiles: MallardDocumentProfile[] = [],
): Promise<ParsedLabDocument> {
  const lower = file.name.toLowerCase()
  const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf')

  let pages: LayoutPage[]
  let method: ParsedLabDocument['method']

  if (isPdf) {
    const native = await extractNativePdfLayout(file, progress)
    if (hasUsefulNativeText(native.pages, native.textChars)) {
      pages = native.pages
      method = 'pdf_layout'
      progress?.('Understanding PDF fields and tables…', 0.90)
    } else {
      progress?.('This PDF is image-based. Switching to OCR…', 0.48)
      pages = await ocrPdfPages(native.pdf, progress)
      method = 'ocr_layout'
      progress?.('Understanding scanned fields and tables…', 0.94)
    }
  } else {
    pages = await extractImageLayout(file, progress)
    method = 'ocr_layout'
    progress?.('Understanding image fields and tables…', 0.94)
  }

  const result = interpretDocumentLayout(pages, file.name, method, profiles)
  progress?.(
    `Found ${result.fields.length} field${result.fields.length === 1 ? '' : 's'} and ${result.rows.length} result row${result.rows.length === 1 ? '' : 's'}. Review before applying.`,
    1,
  )
  return result
}
