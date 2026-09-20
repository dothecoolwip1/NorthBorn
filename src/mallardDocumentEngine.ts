export const MALLARD_PARSER_VERSION = '2.0.0'

export type DocumentMethod = 'pdf_layout' | 'ocr_layout'
export type DocumentType =
  | 'sample_submission'
  | 'chain_of_custody'
  | 'lab_certificate'
  | 'lab_report'
  | 'disposal_document'
  | 'unknown'

export type DocumentFieldKey =
  | 'sample_id'
  | 'sample_type'
  | 'category'
  | 'collected_by'
  | 'collection_date'
  | 'collection_time'
  | 'job'
  | 'status'
  | 'location'
  | 'work_description'
  | 'field_observations'
  | 'suspected_contents'
  | 'reason_taken'
  | 'container'
  | 'quantity'
  | 'field_label'
  | 'seal'
  | 'storage'
  | 'preservation'
  | 'lab_name'
  | 'lab_number'
  | 'received_date'
  | 'accepted_date'
  | 'transfer_date_time'
  | 'released_by'
  | 'received_by'
  | 'condition'
  | 'temperature'
  | 'client'
  | 'project'

export type LayoutBox = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type LayoutToken = LayoutBox & {
  text: string
  page: number
  confidence?: number | null
}

export type LayoutPage = {
  page: number
  width: number
  height: number
  tokens: LayoutToken[]
}

export type FieldEvidence = {
  raw_label: string
  strategy: 'same_row' | 'wrapped_row' | 'profile_region'
  label_box: LayoutBox | null
  value_box: LayoutBox | null
  value_region: {
    page: number
    x0: number
    y0: number
    x1: number
    y1: number
  } | null
}

export type ExtractedDocumentField = {
  key: DocumentFieldKey
  label: string
  value: string
  confidence: number
  page: number
  evidence: FieldEvidence
}

export type ParsedLabLine = {
  test_name: string
  result_value: string
  unit: string
  qualifier: string
  method: string
  reporting_limit: string
  detection_limit: string
  flag: string
  notes: string
  confidence: number
  source_page: number | null
  source_bbox: LayoutBox | null
}

export type RequestedAnalysis = {
  name: string
  selected: boolean
  confidence: number
  source_page: number | null
}

export type MallardDocumentProfile = {
  fingerprint: string
  document_type?: string | null
  lab_name?: string | null
  field_aliases?: Record<string, string[]> | null
  field_positions?: Record<string, {
    page: number
    x0: number
    y0: number
    x1: number
    y1: number
  }> | null
  column_aliases?: Record<string, string[]> | null
}

export type ParsedLabDocument = {
  text: string
  rows: ParsedLabLine[]
  method: DocumentMethod
  document_type: DocumentType
  document_confidence: number
  fields: ExtractedDocumentField[]
  requested_analyses: RequestedAnalysis[]
  fingerprint: string
  page_count: number
  parser_version: string
  review_required: boolean
  diagnostics: string[]
}

type LayoutLine = LayoutBox & {
  page: number
  height: number
  tokens: LayoutToken[]
  text: string
}

type LabelHit = {
  key: DocumentFieldKey
  label: string
  weight: number
  start: number
  end: number
  box: LayoutBox
}

type FieldDefinition = {
  label: string
  aliases: string[]
  weakAliases?: string[]
}

type TableRole =
  | 'analyte'
  | 'result'
  | 'unit'
  | 'qualifier'
  | 'reporting_limit'
  | 'detection_limit'
  | 'method'
  | 'flag'

const FIELD_DEFINITIONS: Record<DocumentFieldKey, FieldDefinition> = {
  sample_id: {
    label: 'Sample ID',
    aliases: ['sample id', 'sample no', 'sample number', 'sample #', 'client sample id', 'field sample id', 'field id'],
  },
  sample_type: {
    label: 'Sample type',
    aliases: ['sample type', 'sample matrix', 'matrix', 'material type'],
  },
  category: {
    label: 'Category',
    aliases: ['category', 'sample category'],
  },
  collected_by: {
    label: 'Collected by',
    aliases: ['collected by', 'collector', 'sampled by', 'field technician', 'field tech'],
  },
  collection_date: {
    label: 'Collection date',
    aliases: ['collection date', 'collected date', 'date collected', 'sample date', 'date sampled', 'sampling date'],
    weakAliases: ['date'],
  },
  collection_time: {
    label: 'Collection time',
    aliases: ['collection time', 'collected time', 'time collected', 'sample time', 'time sampled', 'sampling time'],
    weakAliases: ['time'],
  },
  job: {
    label: 'Job',
    aliases: ['job', 'job description', 'job name', 'work order'],
  },
  status: {
    label: 'Status',
    aliases: ['status', 'sample status'],
  },
  location: {
    label: 'Location',
    aliases: ['location', 'sample location', 'sampling location', 'site location', 'location description'],
  },
  work_description: {
    label: 'Work description',
    aliases: ['work description', 'description of work', 'scope of work', 'work performed'],
  },
  field_observations: {
    label: 'Field observations',
    aliases: ['field observations', 'field observation', 'observations', 'field notes'],
  },
  suspected_contents: {
    label: 'Suspected contents',
    aliases: ['suspected contents', 'suspected material', 'suspected substance', 'suspected contaminants', 'suspected contamination'],
  },
  reason_taken: {
    label: 'Reason taken',
    aliases: ['reason taken', 'reason for sample', 'sample reason', 'reason sampled', 'purpose'],
  },
  container: {
    label: 'Container',
    aliases: ['container', 'container type', 'sample container'],
  },
  quantity: {
    label: 'Quantity',
    aliases: ['quantity', 'sample quantity', 'amount', 'volume'],
  },
  field_label: {
    label: 'Field label',
    aliases: ['field label', 'bottle label', 'sample label'],
  },
  seal: {
    label: 'Seal',
    aliases: ['seal', 'seal condition', 'tamper seal'],
  },
  storage: {
    label: 'Storage',
    aliases: ['storage', 'storage condition', 'stored'],
  },
  preservation: {
    label: 'Preservation',
    aliases: ['preservation', 'preservative', 'preserved'],
  },
  lab_name: {
    label: 'Laboratory',
    aliases: ['lab name', 'laboratory name', 'laboratory', 'lab'],
  },
  lab_number: {
    label: 'Lab number',
    aliases: ['lab no', 'lab number', 'lab #', 'laboratory number', 'certificate no', 'certificate number', 'report no', 'report number'],
  },
  received_date: {
    label: 'Received',
    aliases: ['date received', 'received date', 'lab received', 'received'],
  },
  accepted_date: {
    label: 'Accepted',
    aliases: ['date accepted', 'accepted date', 'accepted'],
  },
  transfer_date_time: {
    label: 'Transfer date / time',
    aliases: ['transfer date / time', 'transfer date/time', 'date / time', 'date/time'],
  },
  released_by: {
    label: 'Released by',
    aliases: ['released by', 'relinquished by'],
  },
  received_by: {
    label: 'Received by',
    aliases: ['received by', 'accepted by'],
  },
  condition: {
    label: 'Condition',
    aliases: ['condition', 'sample condition', 'condition on receipt'],
  },
  temperature: {
    label: 'Temperature',
    aliases: ['temperature', 'temp', 'cooler temp', 'receipt temperature'],
  },
  client: {
    label: 'Client',
    aliases: ['client', 'client name', 'customer'],
  },
  project: {
    label: 'Project',
    aliases: ['project', 'project name', 'project no', 'project number'],
  },
}

const TABLE_ALIASES: Record<TableRole, string[]> = {
  analyte: ['parameter', 'analyte', 'analysis', 'test', 'compound', 'constituent'],
  result: ['result', 'reported result', 'concentration', 'value'],
  unit: ['unit', 'units'],
  qualifier: ['qualifier', 'qual', 'q'],
  reporting_limit: ['rl', 'reporting limit', 'report limit', 'reporting limit rl'],
  detection_limit: ['mdl', 'lod', 'loq', 'detection limit', 'method detection limit'],
  method: ['method', 'test method', 'analytical method'],
  flag: ['flag', 'flags', 'remark'],
}

const unitRegex = /(mg\/?l|mg\/?kg|µg\/?l|ug\/?l|μg\/?l|µg\/?kg|ug\/?kg|μg\/?kg|g\/?l|g\/?kg|ng\/?l|ng\/?kg|ppm|ppb|ppt|%|percent|ntu|cfu\/?(?:ml|100ml)|mpn\/?100ml|meq\/?l|mmol\/?l|mol\/?l|µs\/?cm|us\/?cm|ms\/?cm|s\/?m|°c|deg\s*c|ph\s*units?)/i
const resultTokenRegex = /^(?:<=|>=|<|>|≤|≥)?\s*-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const textResultRegex = /^(?:ND|N\/D|NOT\s+DETECTED|DETECTED|PASS|FAIL|PRESENT|ABSENT|NA|N\/A)$/i
const placeholderRegex = /^[_\-–—.\s]+$/
const sectionRegex = /^\s*\d{1,2}\s*[.)]\s+|^[A-Z0-9][A-Z0-9 &/()\-]{5,}$/

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeMatch(value: string) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[#:;,.()[\]{}]/g, ' ')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanValue(value: string) {
  return normalizeSpace(value)
    .replace(/^[:;|\-–—]+\s*/, '')
    .replace(/\s*[:;|\-–—]+$/, '')
    .trim()
}

function cleanAnalyte(value: string) {
  return cleanValue(value)
    .replace(/^\(?\d+\)?\s+/, '')
    .trim()
}

function bboxUnion(items: Array<LayoutBox | null | undefined>): LayoutBox | null {
  const valid = items.filter(Boolean) as LayoutBox[]
  if (!valid.length) return null
  return {
    x0: Math.min(...valid.map((item) => item.x0)),
    y0: Math.min(...valid.map((item) => item.y0)),
    x1: Math.max(...valid.map((item) => item.x1)),
    y1: Math.max(...valid.map((item) => item.y1)),
  }
}

function median(values: number[]) {
  if (!values.length) return 8
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function buildLines(pages: LayoutPage[]) {
  const lines: LayoutLine[] = []

  for (const page of pages) {
    const tokens = page.tokens
      .filter((token) => normalizeSpace(token.text) && Number.isFinite(token.x0) && Number.isFinite(token.y0))
      .map((token) => ({ ...token, text: normalizeSpace(token.text) }))
      .sort((a, b) => {
        const ay = (a.y0 + a.y1) / 2
        const by = (b.y0 + b.y1) / 2
        return Math.abs(ay - by) < 2 ? a.x0 - b.x0 : ay - by
      })

    const typicalHeight = median(tokens.map((token) => Math.max(1, token.y1 - token.y0)))
    const tolerance = Math.max(2.5, Math.min(8, typicalHeight * 0.58))
    const pageLines: LayoutToken[][] = []

    for (const token of tokens) {
      const center = (token.y0 + token.y1) / 2
      let bestIndex = -1
      let bestDistance = Number.POSITIVE_INFINITY
      for (let index = Math.max(0, pageLines.length - 5); index < pageLines.length; index += 1) {
        const row = pageLines[index]
        const rowCenter = median(row.map((item) => (item.y0 + item.y1) / 2))
        const distance = Math.abs(center - rowCenter)
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }
      if (bestIndex >= 0) pageLines[bestIndex].push(token)
      else pageLines.push([token])
    }

    for (const row of pageLines) {
      row.sort((a, b) => a.x0 - b.x0)
      const box = bboxUnion(row)!
      lines.push({
        page: page.page,
        ...box,
        height: Math.max(1, box.y1 - box.y0),
        tokens: row,
        text: normalizeSpace(row.map((token) => token.text).join(' ')),
      })
    }
  }

  return lines.sort((a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0)
}

function aliasWeight(text: string, definition: FieldDefinition, profileAliases: string[] = []) {
  const normalized = normalizeMatch(text)
  const strong = [...profileAliases, ...definition.aliases]
  if (strong.some((alias) => normalizeMatch(alias) === normalized)) return profileAliases.some((alias) => normalizeMatch(alias) === normalized) ? 1 : 0.94
  if ((definition.weakAliases || []).some((alias) => normalizeMatch(alias) === normalized)) return 0.72
  return 0
}

function allLabelHits(line: LayoutLine, profile?: MallardDocumentProfile | null): LabelHit[] {
  const hits: LabelHit[] = []
  const maxSpan = Math.min(5, line.tokens.length)

  for (let start = 0; start < line.tokens.length; start += 1) {
    for (let length = 1; length <= maxSpan && start + length <= line.tokens.length; length += 1) {
      const end = start + length
      const tokens = line.tokens.slice(start, end)
      const text = normalizeSpace(tokens.map((token) => token.text).join(' '))
      if (!text || text.length > 48) break
      for (const [key, definition] of Object.entries(FIELD_DEFINITIONS) as Array<[DocumentFieldKey, FieldDefinition]>) {
        const profileAliases = profile?.field_aliases?.[key] || []
        const weight = aliasWeight(text, definition, profileAliases)
        if (!weight) continue
        const box = bboxUnion(tokens)!
        const overlapsExisting = hits.some((hit) => hit.start === start && hit.end >= end)
        if (!overlapsExisting) hits.push({ key, label: text, weight, start, end, box })
      }
    }
  }

  return hits
    .sort((a, b) => a.start - b.start || b.end - a.end || b.weight - a.weight)
    .filter((hit, index, arr) => !arr.some((other, otherIndex) => otherIndex < index && other.start <= hit.start && other.end >= hit.end && other.weight >= hit.weight))
}

function isSectionHeading(line: LayoutLine) {
  const text = line.text.trim()
  if (!text || text.length > 110) return false
  if (/^\s*\d{1,2}\s*[.)]\s+/.test(text)) return true
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length < 5) return false
  const uppers = text.replace(/[^A-Za-z]/g, '').replace(/[a-z]/g, '').length
  return uppers / letters.length > 0.88 && sectionRegex.test(text)
}

function pageFor(pages: LayoutPage[], pageNumber: number) {
  return pages.find((page) => page.page === pageNumber)
}

function toNormalizedRegion(box: LayoutBox | null, page: LayoutPage | undefined) {
  if (!box || !page?.width || !page.height) return null
  return {
    page: page.page,
    x0: clamp(box.x0 / page.width),
    y0: clamp(box.y0 / page.height),
    x1: clamp(box.x1 / page.width),
    y1: clamp(box.y1 / page.height),
  }
}

function textFromRegion(page: LayoutPage, region: { x0: number; y0: number; x1: number; y1: number }) {
  const selected = page.tokens
    .filter((token) => {
      const x = (token.x0 + token.x1) / 2 / page.width
      const y = (token.y0 + token.y1) / 2 / page.height
      return x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1
    })
    .sort((a, b) => Math.abs(((a.y0 + a.y1) - (b.y0 + b.y1)) / 2) < 3 ? a.x0 - b.x0 : a.y0 - b.y0)
  const text = cleanValue(selected.map((token) => token.text).join(' '))
  return placeholderRegex.test(text) ? '' : text
}

function extractProfileFields(
  pages: LayoutPage[],
  profile: MallardDocumentProfile | null | undefined,
): ExtractedDocumentField[] {
  if (!profile?.field_positions) return []
  const result: ExtractedDocumentField[] = []

  for (const [rawKey, position] of Object.entries(profile.field_positions)) {
    if (!(rawKey in FIELD_DEFINITIONS)) continue
    const key = rawKey as DocumentFieldKey
    const page = pageFor(pages, Number(position.page))
    if (!page) continue
    const expansionX = 0.012
    const expansionY = 0.008
    const region = {
      x0: clamp(Number(position.x0) - expansionX),
      y0: clamp(Number(position.y0) - expansionY),
      x1: clamp(Number(position.x1) + expansionX),
      y1: clamp(Number(position.y1) + expansionY),
    }
    const value = textFromRegion(page, region)
    if (!value) continue
    result.push({
      key,
      label: FIELD_DEFINITIONS[key].label,
      value,
      confidence: 0.97,
      page: page.page,
      evidence: {
        raw_label: FIELD_DEFINITIONS[key].label,
        strategy: 'profile_region',
        label_box: null,
        value_box: {
          x0: region.x0 * page.width,
          y0: region.y0 * page.height,
          x1: region.x1 * page.width,
          y1: region.y1 * page.height,
        },
        value_region: { page: page.page, ...region },
      },
    })
  }

  return result
}

function extractGenericFields(
  pages: LayoutPage[],
  lines: LayoutLine[],
  profile?: MallardDocumentProfile | null,
): ExtractedDocumentField[] {
  const candidates = new Map<DocumentFieldKey, ExtractedDocumentField[]>()

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const hits = allLabelHits(line, profile)
    if (!hits.length) continue

    for (const hit of hits) {
      const nextHit = hits.find((candidate) => candidate.start >= hit.end && candidate.box.x0 > hit.box.x1)
      const valueTokens = line.tokens.filter((token, tokenIndex) => {
        if (tokenIndex < hit.end) return false
        if (token.x0 < hit.box.x1 - 1) return false
        if (nextHit && token.x0 >= nextHit.box.x0 - 1) return false
        return true
      })

      const fragments = [...valueTokens]
      let strategy: FieldEvidence['strategy'] = 'same_row'
      const firstValueX = valueTokens.length ? Math.min(...valueTokens.map((token) => token.x0)) : hit.box.x1 + Math.max(8, line.height)

      for (let offset = 1; offset <= 3; offset += 1) {
        const continuation = lines[lineIndex + offset]
        if (!continuation || continuation.page !== line.page) break
        const previous = lines[lineIndex + offset - 1]
        const verticalGap = continuation.y0 - previous.y1
        if (verticalGap > Math.max(12, line.height * 1.9)) break
        if (isSectionHeading(continuation) || allLabelHits(continuation, profile).length) break
        const continuationTokens = continuation.tokens.filter((token) => {
          if (token.x0 < firstValueX - Math.max(12, line.height)) return false
          if (nextHit && token.x0 >= nextHit.box.x0 - Math.max(3, line.height * 0.25)) return false
          return true
        })
        if (!continuationTokens.length) break
        fragments.push(...continuationTokens)
        strategy = 'wrapped_row'
      }

      const value = cleanValue(fragments.map((token) => token.text).join(' '))
      if (!value || placeholderRegex.test(value) || normalizeMatch(value) === normalizeMatch(hit.label)) continue

      const valueBox = bboxUnion(fragments)
      const page = pageFor(pages, line.page)
      const averageTokenConfidence = fragments
        .map((token) => token.confidence)
        .filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence))
      const ocrFactor = averageTokenConfidence.length ? clamp(median(averageTokenConfidence) / 100, 0.65, 1) : 1
      const confidence = clamp(hit.weight * (strategy === 'same_row' ? 1 : 0.97) * ocrFactor, 0.45, 0.99)
      const field: ExtractedDocumentField = {
        key: hit.key,
        label: FIELD_DEFINITIONS[hit.key].label,
        value,
        confidence,
        page: line.page,
        evidence: {
          raw_label: hit.label,
          strategy,
          label_box: hit.box,
          value_box: valueBox,
          value_region: toNormalizedRegion(valueBox, page),
        },
      }

      const existing = candidates.get(hit.key) || []
      existing.push(field)
      candidates.set(hit.key, existing)
    }
  }

  const output: ExtractedDocumentField[] = []
  for (const [key, fields] of candidates.entries()) {
    const ranked = fields.sort((a, b) => b.confidence - a.confidence || a.page - b.page)
    const best = ranked[0]
    if (key === 'collection_date' && normalizeMatch(best.evidence.raw_label) === 'date') best.confidence = clamp(best.confidence - 0.08)
    if (key === 'collection_time' && normalizeMatch(best.evidence.raw_label) === 'time') best.confidence = clamp(best.confidence - 0.08)
    output.push(best)
  }
  return output
}

function fieldMap(fields: ExtractedDocumentField[]) {
  return new Map(fields.map((field) => [field.key, field]))
}

function detectRequestedAnalyses(lines: LayoutLine[]): RequestedAnalysis[] {
  const results: RequestedAnalysis[] = []
  const seen = new Set<string>()
  const checkboxRegex = /(?:\[\s*[xX✓]\s*\]|☒|☑|✓)\s*([^\[]+?)(?=(?:\[\s*[xX✓]\s*\]|☒|☑|✓)|$)/g

  for (const line of lines) {
    let match: RegExpExecArray | null
    while ((match = checkboxRegex.exec(line.text))) {
      const name = cleanValue(match[1]).replace(/\s{2,}/g, ' ')
      const key = normalizeMatch(name)
      if (!name || name.length > 100 || seen.has(key)) continue
      seen.add(key)
      results.push({ name, selected: true, confidence: 0.96, source_page: line.page })
    }
  }

  return results
}

function tableAliasRole(value: string, profile?: MallardDocumentProfile | null): TableRole | null {
  const normalized = normalizeMatch(value)
  for (const [role, aliases] of Object.entries(TABLE_ALIASES) as Array<[TableRole, string[]]>) {
    const profileAliases = profile?.column_aliases?.[role] || []
    if ([...profileAliases, ...aliases].some((alias) => normalizeMatch(alias) === normalized)) return role
  }
  return null
}

function findTableHeader(line: LayoutLine, profile?: MallardDocumentProfile | null) {
  const columns = new Map<TableRole, number>()
  const labels = new Map<TableRole, string>()
  for (let start = 0; start < line.tokens.length; start += 1) {
    for (let length = 1; length <= 3 && start + length <= line.tokens.length; length += 1) {
      const tokens = line.tokens.slice(start, start + length)
      const text = normalizeSpace(tokens.map((token) => token.text).join(' '))
      const role = tableAliasRole(text, profile)
      if (!role || columns.has(role)) continue
      const box = bboxUnion(tokens)!
      columns.set(role, (box.x0 + box.x1) / 2)
      labels.set(role, text)
    }
  }
  const roles = Array.from(columns.keys())
  const strong = roles.includes('analyte') && roles.includes('result')
  const plausible = strong || (roles.includes('result') && roles.includes('unit') && roles.length >= 3)
  return plausible && roles.length >= 2 ? { columns, labels } : null
}

function tableCellMap(line: LayoutLine, orderedColumns: Array<[TableRole, number]>) {
  const cells = new Map<TableRole, LayoutToken[]>()
  const boundaries = orderedColumns.slice(0, -1).map((entry, index) => (entry[1] + orderedColumns[index + 1][1]) / 2)

  for (const token of line.tokens) {
    const center = (token.x0 + token.x1) / 2
    let columnIndex = boundaries.findIndex((boundary) => center < boundary)
    if (columnIndex < 0) columnIndex = orderedColumns.length - 1
    const role = orderedColumns[columnIndex][0]
    const list = cells.get(role) || []
    list.push(token)
    cells.set(role, list)
  }

  const textFor = (role: TableRole) => cleanValue((cells.get(role) || []).map((token) => token.text).join(' '))
  return { cells, textFor }
}

function normalizeUnit(value: string) {
  const cleaned = value.replace(/\s+/g, '').replace(/μ/g, 'µ').toLowerCase()
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
  return map[cleaned] || value.trim()
}

function splitQualifier(value: string) {
  const normalized = normalizeSpace(value)
  const match = normalized.match(/^(<=|>=|<|>|≤|≥)\s*(.*)$/)
  if (!match) return { qualifier: '', value: normalized }
  return {
    qualifier: match[1].replace('≤', '<=').replace('≥', '>='),
    value: match[2].trim(),
  }
}

function isResultValue(value: string) {
  const cleaned = normalizeSpace(value)
  return resultTokenRegex.test(cleaned) || textResultRegex.test(cleaned) || /^(?:<|>|<=|>=)\s*\d/.test(cleaned)
}

function extractTableRows(lines: LayoutLine[], profile?: MallardDocumentProfile | null): ParsedLabLine[] {
  const rows: ParsedLabLine[] = []
  const seen = new Set<string>()

  for (let headerIndex = 0; headerIndex < lines.length; headerIndex += 1) {
    const headerLine = lines[headerIndex]
    const header = findTableHeader(headerLine, profile)
    if (!header) continue

    const orderedColumns = Array.from(header.columns.entries()).sort((a, b) => a[1] - b[1])
    let consecutiveNonRows = 0

    for (let index = headerIndex + 1; index < Math.min(lines.length, headerIndex + 55); index += 1) {
      const line = lines[index]
      if (line.page !== headerLine.page) break
      if (findTableHeader(line, profile)) break
      if (isSectionHeading(line) && line.text.length < 90) break
      if (/^notes?\b/i.test(line.text)) break

      const { cells, textFor } = tableCellMap(line, orderedColumns)
      const analyte = cleanAnalyte(textFor('analyte'))
      const rawResult = textFor('result')
      if (!analyte || !rawResult || placeholderRegex.test(analyte) || placeholderRegex.test(rawResult) || !isResultValue(rawResult)) {
        consecutiveNonRows += 1
        if (consecutiveNonRows >= 4) break
        continue
      }
      consecutiveNonRows = 0

      const split = splitQualifier(rawResult)
      const explicitQualifier = textFor('qualifier')
      const unit = normalizeUnit(textFor('unit'))
      const key = `${normalizeMatch(analyte)}|${normalizeMatch(split.value)}|${normalizeMatch(unit)}`
      if (seen.has(key)) continue
      seen.add(key)

      const rowTokens = Array.from(cells.values()).flat()
      const tokenConfidences = rowTokens
        .map((token) => token.confidence)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      const ocrFactor = tokenConfidences.length ? clamp(median(tokenConfidences) / 100, 0.65, 1) : 1

      rows.push({
        test_name: analyte,
        result_value: split.value,
        unit,
        qualifier: explicitQualifier || split.qualifier,
        method: textFor('method'),
        reporting_limit: textFor('reporting_limit'),
        detection_limit: textFor('detection_limit'),
        flag: textFor('flag'),
        notes: '',
        confidence: clamp(0.95 * ocrFactor, 0.55, 0.99),
        source_page: line.page,
        source_bbox: bboxUnion(rowTokens),
      })
    }
  }

  return rows
}

function parseFallbackLine(line: LayoutLine): ParsedLabLine | null {
  const compact = normalizeSpace(line.text.replace(/[\t|]+/g, ' '))
  if (compact.length < 4 || compact.length > 220) return null
  if (/\b(?:certificate of analysis|laboratory|sample (?:id|number|date|name)|client|project|page\s+\d|date received|date reported|signature|quality control|surrogate|batch id)\b/i.test(compact)) return null

  const unitMatch = compact.match(unitRegex)
  if (!unitMatch || unitMatch.index == null) return null

  const beforeUnit = compact.slice(0, unitMatch.index).trim()
  const parts = beforeUnit.split(/\s+/)
  let resultStart = -1
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const token = parts[index]
    if (isResultValue(token)) {
      resultStart = index
      break
    }
    if (index < parts.length - 3) break
  }
  if (resultStart < 1) return null

  const analyte = cleanAnalyte(parts.slice(0, resultStart).join(' '))
  const rawResult = parts[resultStart]
  if (!analyte || !/[A-Za-z]/.test(analyte)) return null
  const split = splitQualifier(rawResult)

  return {
    test_name: analyte,
    result_value: split.value,
    unit: normalizeUnit(unitMatch[0]),
    qualifier: split.qualifier,
    method: '',
    reporting_limit: '',
    detection_limit: '',
    flag: '',
    notes: '',
    confidence: 0.72,
    source_page: line.page,
    source_bbox: line,
  }
}

function extractFallbackRows(lines: LayoutLine[], existing: ParsedLabLine[]) {
  const rows = [...existing]
  const seen = new Set(rows.map((row) => `${normalizeMatch(row.test_name)}|${normalizeMatch(row.result_value)}|${normalizeMatch(row.unit)}`))
  for (const line of lines) {
    const parsed = parseFallbackLine(line)
    if (!parsed) continue
    const key = `${normalizeMatch(parsed.test_name)}|${normalizeMatch(parsed.result_value)}|${normalizeMatch(parsed.unit)}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(parsed)
  }
  return rows.slice(0, 500)
}

function classifyDocument(lines: LayoutLine[], rows: ParsedLabLine[]) {
  const text = normalizeMatch(lines.map((line) => line.text).join(' '))
  const scores: Record<DocumentType, number> = {
    sample_submission: 0,
    chain_of_custody: 0,
    lab_certificate: 0,
    lab_report: 0,
    disposal_document: 0,
    unknown: 0.4,
  }

  if (/sample submission|submission record/.test(text)) scores.sample_submission += 4
  if (/sample identification/.test(text)) scores.sample_submission += 2
  if (/analytical request/.test(text)) scores.sample_submission += 2
  if (/chain of custody/.test(text)) {
    scores.chain_of_custody += 3
    scores.sample_submission += 0.7
  }
  if (/certificate of analysis/.test(text) && !/not a laboratory certificate|not a lab certificate/.test(text)) scores.lab_certificate += 5
  if (/analytical results|laboratory results|test results/.test(text)) scores.lab_report += 3
  if (/quality control|reporting limit|method detection limit/.test(text)) scores.lab_report += 2
  if (rows.length >= 2) scores.lab_report += 3
  if (/waste manifest|disposal ticket|scale ticket|waste profile/.test(text)) scores.disposal_document += 5

  const ranked = (Object.entries(scores) as Array<[DocumentType, number]>).sort((a, b) => b[1] - a[1])
  const [documentType, topScore] = ranked[0]
  const secondScore = ranked[1]?.[1] || 0
  const confidence = documentType === 'unknown'
    ? 0.45
    : clamp(0.58 + Math.min(0.32, topScore * 0.055) + Math.min(0.08, Math.max(0, topScore - secondScore) * 0.02), 0.55, 0.98)

  return { documentType, confidence }
}

function fingerprintInput(pages: LayoutPage[], lines: LayoutLine[], profile?: MallardDocumentProfile | null) {
  const labels: string[] = []
  for (const line of lines) {
    const hits = allLabelHits(line, profile)
    const page = pageFor(pages, line.page)
    for (const hit of hits) {
      const xBucket = page ? Math.round((hit.box.x0 / page.width) * 20) : 0
      const yBucket = page ? Math.round((hit.box.y0 / page.height) * 30) : 0
      labels.push(`${hit.key}@${line.page}:${xBucket}:${yBucket}`)
    }
  }

  const headings = lines
    .filter(isSectionHeading)
    .slice(0, 24)
    .map((line) => normalizeMatch(line.text).replace(/\d+/g, '#').slice(0, 90))

  const tableHeaders = lines
    .map((line) => {
      const header = findTableHeader(line, profile)
      if (!header) return ''
      return Array.from(header.columns.keys()).sort().join(',')
    })
    .filter(Boolean)

  return [
    `pages:${pages.length}`,
    ...Array.from(new Set(headings)),
    ...Array.from(new Set(labels)).sort(),
    ...Array.from(new Set(tableHeaders)).map((header) => `table:${header}`),
  ].join('|')
}

function hashFingerprint(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `mallard-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function mergeFields(profileFields: ExtractedDocumentField[], genericFields: ExtractedDocumentField[]) {
  const merged = new Map<DocumentFieldKey, ExtractedDocumentField>()
  for (const field of genericFields) merged.set(field.key, field)
  for (const field of profileFields) {
    const existing = merged.get(field.key)
    if (!existing || field.confidence > existing.confidence) merged.set(field.key, field)
  }
  return Array.from(merged.values()).sort(
    (a, b) => a.page - b.page || (a.evidence.value_box?.y0 ?? 0) - (b.evidence.value_box?.y0 ?? 0),
  )
}

export function interpretDocumentLayout(
  pages: LayoutPage[],
  sourceName: string,
  method: DocumentMethod,
  profiles: MallardDocumentProfile[] = [],
): ParsedLabDocument {
  const lines = buildLines(pages)
  const preliminaryFingerprint = hashFingerprint(fingerprintInput(pages, lines))
  const profile = profiles.find((candidate) => candidate.fingerprint === preliminaryFingerprint) || null

  const genericFields = extractGenericFields(pages, lines, profile)
  const learnedFields = extractProfileFields(pages, profile)
  const fields = mergeFields(learnedFields, genericFields)
  let rows = extractTableRows(lines, profile)
  rows = extractFallbackRows(lines, rows)
  const requestedAnalyses = detectRequestedAnalyses(lines)
  const classification = classifyDocument(lines, rows)
  const fingerprint = preliminaryFingerprint
  const text = lines.map((line) => `[PAGE ${line.page}] ${line.text}`).join('\n')
  const diagnostics: string[] = []

  if (profile) diagnostics.push('Known document layout profile matched.')
  if (!fields.length) diagnostics.push('No labelled document fields were confidently extracted.')
  if (!rows.length && classification.documentType === 'lab_report') diagnostics.push('Lab-style document detected but no result rows were confidently extracted.')
  if (method === 'ocr_layout') diagnostics.push('OCR was required because reliable embedded PDF text was unavailable.')

  const fieldConfidence = fields.length ? fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length : 0
  const rowConfidence = rows.length ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length : 0
  const reviewRequired =
    method === 'ocr_layout' ||
    classification.confidence < 0.88 ||
    fields.some((field) => field.confidence < 0.86) ||
    rows.some((row) => row.confidence < 0.88) ||
    (rows.length === 0 && fields.length === 0)

  if (sourceName) {
    for (const row of rows) row.notes = `Imported from ${sourceName}`
  }

  if (fieldConfidence && fieldConfidence < 0.82) diagnostics.push('Some document fields have low confidence and should be reviewed.')
  if (rowConfidence && rowConfidence < 0.82) diagnostics.push('Some analytical rows have low confidence and should be reviewed.')

  return {
    text,
    rows,
    method,
    document_type: classification.documentType,
    document_confidence: classification.confidence,
    fields,
    requested_analyses: requestedAnalyses,
    fingerprint,
    page_count: pages.length,
    parser_version: MALLARD_PARSER_VERSION,
    review_required: reviewRequired,
    diagnostics,
  }
}

export function parseLabText(text: string, sourceName: string): ParsedLabLine[] {
  const lines: LayoutLine[] = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((raw, index) => {
      const pageMatch = raw.match(/^\[PAGE\s+(\d+)\]\s*(.*)$/i)
      const page = pageMatch ? Number(pageMatch[1]) : 1
      const body = pageMatch ? pageMatch[2] : raw
      return {
        page,
        x0: 0,
        y0: index * 12,
        x1: Math.max(1, body.length * 6),
        y1: index * 12 + 10,
        height: 10,
        text: body.trim(),
        tokens: [{ page, text: body.trim(), x0: 0, y0: index * 12, x1: Math.max(1, body.length * 6), y1: index * 12 + 10 }],
      }
    })
    .filter((line) => line.text)
  return extractFallbackRows(lines, [])
}

export function buildProfileLearningPayload(document: ParsedLabDocument) {
  const fieldAliases: Record<string, string[]> = {}
  const fieldPositions: Record<string, { page: number; x0: number; y0: number; x1: number; y1: number }> = {}

  for (const field of document.fields) {
    const rawLabel = cleanValue(field.evidence.raw_label)
    if (rawLabel) {
      const existing = fieldAliases[field.key] || []
      if (!existing.some((item) => normalizeMatch(item) === normalizeMatch(rawLabel))) existing.push(rawLabel)
      fieldAliases[field.key] = existing
    }
    if (field.evidence.value_region) fieldPositions[field.key] = field.evidence.value_region
  }

  return {
    fingerprint: document.fingerprint,
    document_type: document.document_type,
    lab_name: fieldMap(document.fields).get('lab_name')?.value || null,
    field_aliases: fieldAliases,
    field_positions: fieldPositions,
    column_aliases: {},
  }
}
