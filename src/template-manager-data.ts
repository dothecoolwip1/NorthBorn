export type TemplateDocumentType = 'invoice' | 'flha' | 'pre_trip' | 'field_ticket' | 'incident_report' | 'near_miss' | 'hazard_observation' | 'toolbox_talk' | 'timesheet' | 'work_order' | 'custom'
export type TemplateSourceKind = 'northborn_builder' | 'fillable_pdf'
export type TemplateStatus = 'draft' | 'active' | 'archived'
export type TemplateFieldType = 'text' | 'textarea' | 'date' | 'datetime' | 'number' | 'currency' | 'checkbox' | 'signature' | 'table' | 'select'

export type TemplateField = {
  id: string
  key: string
  label: string
  type: TemplateFieldType
  required: boolean
  binding: string
  pdf_field_name?: string
  source?: 'preset' | 'pdf' | 'custom'
  options?: string[]
}

export type TemplateRow = {
  id: string
  organization_id: string
  name: string
  document_type: TemplateDocumentType
  source_kind: TemplateSourceKind
  description: string | null
  status: TemplateStatus
  is_default: boolean
  version: number
  file_path: string | null
  original_file_name: string | null
  page_count: number | null
  fields: TemplateField[]
  settings: Record<string, unknown>
  created_by: string
  updated_by: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export type PdfFieldAnalysis = {
  fieldName: string
  fieldType: string
  binding: string
}

export type PdfAnalysis = {
  pageCount: number | null
  hasAcroForm: boolean
  detected: PdfFieldAnalysis[]
  compressedStreamsRead: number
  note: string
}

export const DOCUMENT_TYPE_OPTIONS: Array<{ value: TemplateDocumentType; label: string; description: string }> = [
  { value: 'invoice', label: 'Invoice', description: 'Customer billing, totals, terms and remittance details.' },
  { value: 'flha', label: 'FLHA', description: 'Field Level Hazard Assessment and crew sign on.' },
  { value: 'pre_trip', label: 'Pre Trip', description: 'Vehicle inspection, defects and operator sign off.' },
  { value: 'field_ticket', label: 'Field Ticket', description: 'Job services, units, hours, approvals and signatures.' },
  { value: 'incident_report', label: 'Incident Report', description: 'Incident facts, people, immediate action and review.' },
  { value: 'near_miss', label: 'Near Miss', description: 'Near miss details, potential outcome and corrective action.' },
  { value: 'hazard_observation', label: 'Hazard Observation', description: 'Observed hazards, urgency and follow up.' },
  { value: 'toolbox_talk', label: 'Toolbox Talk', description: 'Topic, discussion, crew and follow up actions.' },
  { value: 'timesheet', label: 'Timesheet', description: 'Employee hours, jobs, overtime and approvals.' },
  { value: 'work_order', label: 'Work Order', description: 'Maintenance work, parts, labour and completion details.' },
  { value: 'custom', label: 'Custom', description: 'Build a reusable company document from scratch.' },
]

export const FIELD_TYPE_OPTIONS: Array<{ value: TemplateFieldType; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date and time' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'signature', label: 'Signature' },
  { value: 'table', label: 'Repeating table' },
  { value: 'select', label: 'Select list' },
]

export const NORTHBORN_BINDINGS = [
  { value: '', label: 'Manual entry / not bound', group: 'Manual' },
  { value: 'organization.name', label: 'Company name', group: 'Company' },
  { value: 'organization.legal_name', label: 'Company legal name', group: 'Company' },
  { value: 'organization.phone', label: 'Company phone', group: 'Company' },
  { value: 'organization.email', label: 'Company email', group: 'Company' },
  { value: 'organization.address', label: 'Company address', group: 'Company' },
  { value: 'organization.logo', label: 'Company logo', group: 'Company' },
  { value: 'customer.name', label: 'Customer name', group: 'Customer' },
  { value: 'customer.legal_name', label: 'Customer legal name', group: 'Customer' },
  { value: 'customer.contact_name', label: 'Customer contact', group: 'Customer' },
  { value: 'customer.phone', label: 'Customer phone', group: 'Customer' },
  { value: 'customer.email', label: 'Customer email', group: 'Customer' },
  { value: 'customer.billing_address', label: 'Customer billing address', group: 'Customer' },
  { value: 'job.job_number', label: 'Job number', group: 'Job' },
  { value: 'job.title', label: 'Job title', group: 'Job' },
  { value: 'job.site_name', label: 'Site name', group: 'Job' },
  { value: 'job.address', label: 'Job address', group: 'Job' },
  { value: 'job.purchase_order', label: 'Purchase order', group: 'Job' },
  { value: 'job.start_at', label: 'Job start date and time', group: 'Job' },
  { value: 'job.completed_at', label: 'Job completion date and time', group: 'Job' },
  { value: 'job.customer_notes', label: 'Customer notes', group: 'Job' },
  { value: 'employee.full_name', label: 'Employee full name', group: 'Employee' },
  { value: 'employee.first_name', label: 'Employee first name', group: 'Employee' },
  { value: 'employee.last_name', label: 'Employee last name', group: 'Employee' },
  { value: 'employee.position', label: 'Employee position', group: 'Employee' },
  { value: 'employee.signature', label: 'Employee signature', group: 'Employee' },
  { value: 'vehicle.unit_number', label: 'Unit number', group: 'Fleet' },
  { value: 'vehicle.make_model', label: 'Vehicle make and model', group: 'Fleet' },
  { value: 'vehicle.plate', label: 'Licence plate', group: 'Fleet' },
  { value: 'vehicle.odometer', label: 'Odometer', group: 'Fleet' },
  { value: 'vehicle.engine_hours', label: 'Engine hours', group: 'Fleet' },
  { value: 'invoice.invoice_number', label: 'Invoice number', group: 'Invoice' },
  { value: 'invoice.issue_date', label: 'Invoice date', group: 'Invoice' },
  { value: 'invoice.due_date', label: 'Invoice due date', group: 'Invoice' },
  { value: 'invoice.line_items', label: 'Invoice line items', group: 'Invoice' },
  { value: 'invoice.subtotal', label: 'Invoice subtotal', group: 'Invoice' },
  { value: 'invoice.tax', label: 'Invoice tax', group: 'Invoice' },
  { value: 'invoice.total', label: 'Invoice total', group: 'Invoice' },
  { value: 'invoice.terms', label: 'Payment terms', group: 'Invoice' },
  { value: 'ticket.ticket_number', label: 'Field ticket number', group: 'Ticket' },
  { value: 'ticket.service_date', label: 'Service date', group: 'Ticket' },
  { value: 'ticket.service_rows', label: 'Service rows', group: 'Ticket' },
  { value: 'ticket.operator_notes', label: 'Operator notes', group: 'Ticket' },
  { value: 'ticket.customer_name', label: 'Customer approver name', group: 'Ticket' },
  { value: 'ticket.customer_signature', label: 'Customer signature', group: 'Ticket' },
  { value: 'flha.work_area', label: 'FLHA work area', group: 'Safety' },
  { value: 'flha.task', label: 'FLHA task', group: 'Safety' },
  { value: 'flha.hazards', label: 'FLHA hazards', group: 'Safety' },
  { value: 'flha.controls', label: 'FLHA controls', group: 'Safety' },
  { value: 'flha.ppe', label: 'FLHA PPE', group: 'Safety' },
  { value: 'flha.emergency_plan', label: 'FLHA emergency plan', group: 'Safety' },
  { value: 'flha.crew_signatures', label: 'FLHA crew signatures', group: 'Safety' },
  { value: 'inspection.inspection_date', label: 'Inspection date', group: 'Inspection' },
  { value: 'inspection.checklist', label: 'Inspection checklist', group: 'Inspection' },
  { value: 'inspection.defects', label: 'Inspection defects', group: 'Inspection' },
  { value: 'inspection.safe_to_operate', label: 'Safe to operate', group: 'Inspection' },
  { value: 'inspection.signature', label: 'Inspector signature', group: 'Inspection' },
  { value: 'timesheet.work_date', label: 'Timesheet date', group: 'Timesheet' },
  { value: 'timesheet.regular_hours', label: 'Regular hours', group: 'Timesheet' },
  { value: 'timesheet.overtime_hours', label: 'Overtime hours', group: 'Timesheet' },
  { value: 'timesheet.entries', label: 'Timesheet entries', group: 'Timesheet' },
  { value: 'work_order.work_order_number', label: 'Work order number', group: 'Maintenance' },
  { value: 'work_order.description', label: 'Work description', group: 'Maintenance' },
  { value: 'work_order.parts', label: 'Parts used', group: 'Maintenance' },
  { value: 'work_order.labour', label: 'Labour', group: 'Maintenance' },
] as const

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `field-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function makeTemplateField(label: string, binding = '', type: TemplateFieldType = 'text', required = false, source: TemplateField['source'] = 'preset', pdfFieldName?: string): TemplateField {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${Math.random().toString(36).slice(2, 8)}`
  return { id: makeId(), key, label, type, required, binding, source, pdf_field_name: pdfFieldName }
}

const PRESETS: Record<TemplateDocumentType, Array<[string, string, TemplateFieldType, boolean]>> = {
  invoice: [
    ['Invoice number', 'invoice.invoice_number', 'text', true],
    ['Invoice date', 'invoice.issue_date', 'date', true],
    ['Due date', 'invoice.due_date', 'date', false],
    ['Customer', 'customer.name', 'text', true],
    ['Billing address', 'customer.billing_address', 'textarea', false],
    ['Job number', 'job.job_number', 'text', false],
    ['Purchase order', 'job.purchase_order', 'text', false],
    ['Line items', 'invoice.line_items', 'table', true],
    ['Subtotal', 'invoice.subtotal', 'currency', true],
    ['Tax', 'invoice.tax', 'currency', false],
    ['Total', 'invoice.total', 'currency', true],
    ['Payment terms', 'invoice.terms', 'textarea', false],
  ],
  flha: [
    ['Job number', 'job.job_number', 'text', false],
    ['Site', 'job.site_name', 'text', true],
    ['Work area', 'flha.work_area', 'text', true],
    ['Task', 'flha.task', 'textarea', true],
    ['Hazards', 'flha.hazards', 'table', true],
    ['Controls', 'flha.controls', 'table', true],
    ['PPE', 'flha.ppe', 'textarea', true],
    ['Emergency plan', 'flha.emergency_plan', 'textarea', true],
    ['Crew signatures', 'flha.crew_signatures', 'signature', true],
  ],
  pre_trip: [
    ['Inspection date', 'inspection.inspection_date', 'date', true],
    ['Inspector', 'employee.full_name', 'text', true],
    ['Unit number', 'vehicle.unit_number', 'text', true],
    ['Odometer', 'vehicle.odometer', 'number', false],
    ['Engine hours', 'vehicle.engine_hours', 'number', false],
    ['Inspection checklist', 'inspection.checklist', 'table', true],
    ['Defects', 'inspection.defects', 'table', false],
    ['Safe to operate', 'inspection.safe_to_operate', 'checkbox', true],
    ['Inspector signature', 'inspection.signature', 'signature', true],
  ],
  field_ticket: [
    ['Ticket number', 'ticket.ticket_number', 'text', true],
    ['Service date', 'ticket.service_date', 'date', true],
    ['Customer', 'customer.name', 'text', true],
    ['Job number', 'job.job_number', 'text', false],
    ['Site', 'job.site_name', 'text', false],
    ['Operator', 'employee.full_name', 'text', true],
    ['Unit', 'vehicle.unit_number', 'text', false],
    ['Service rows', 'ticket.service_rows', 'table', true],
    ['Operator notes', 'ticket.operator_notes', 'textarea', false],
    ['Customer approver', 'ticket.customer_name', 'text', false],
    ['Customer signature', 'ticket.customer_signature', 'signature', true],
  ],
  incident_report: [
    ['Date and time', '', 'datetime', true],
    ['Location', 'job.site_name', 'text', true],
    ['People involved', '', 'textarea', true],
    ['What happened', '', 'textarea', true],
    ['Injury, damage or spill', '', 'textarea', true],
    ['Immediate actions', '', 'textarea', true],
    ['Reported to', '', 'text', true],
    ['Submitted by', 'employee.full_name', 'text', true],
    ['Signature', 'employee.signature', 'signature', true],
  ],
  near_miss: [
    ['Date and time', '', 'datetime', true],
    ['Location', 'job.site_name', 'text', true],
    ['What almost happened', '', 'textarea', true],
    ['Potential consequence', '', 'textarea', true],
    ['Corrective action', '', 'textarea', true],
    ['Submitted by', 'employee.full_name', 'text', true],
  ],
  hazard_observation: [
    ['Location', 'job.site_name', 'text', true],
    ['Hazard observed', '', 'textarea', true],
    ['Risk level', '', 'select', true],
    ['Action taken', '', 'textarea', true],
    ['Follow up', '', 'textarea', false],
    ['Submitted by', 'employee.full_name', 'text', true],
  ],
  toolbox_talk: [
    ['Topic', '', 'text', true],
    ['Discussion', '', 'textarea', true],
    ['Crew', '', 'table', true],
    ['Questions or concerns', '', 'textarea', false],
    ['Actions', '', 'textarea', false],
    ['Facilitator', 'employee.full_name', 'text', true],
  ],
  timesheet: [
    ['Employee', 'employee.full_name', 'text', true],
    ['Work date', 'timesheet.work_date', 'date', true],
    ['Entries', 'timesheet.entries', 'table', true],
    ['Regular hours', 'timesheet.regular_hours', 'number', true],
    ['Overtime hours', 'timesheet.overtime_hours', 'number', false],
    ['Employee signature', 'employee.signature', 'signature', true],
  ],
  work_order: [
    ['Work order number', 'work_order.work_order_number', 'text', true],
    ['Unit number', 'vehicle.unit_number', 'text', true],
    ['Work description', 'work_order.description', 'textarea', true],
    ['Parts', 'work_order.parts', 'table', false],
    ['Labour', 'work_order.labour', 'table', false],
    ['Technician', 'employee.full_name', 'text', true],
    ['Technician signature', 'employee.signature', 'signature', false],
  ],
  custom: [],
}

export function presetFields(documentType: TemplateDocumentType) {
  return PRESETS[documentType].map(([label, binding, type, required]) => makeTemplateField(label, binding, type, required, 'preset'))
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function inferBinding(fieldName: string, documentType: TemplateDocumentType) {
  const value = normalize(fieldName)
  const checks: Array<[RegExp, string]> = [
    [/(invoice|inv) (number|no)|invoice$/, 'invoice.invoice_number'],
    [/(invoice|issue) date/, 'invoice.issue_date'],
    [/due date/, 'invoice.due_date'],
    [/(subtotal|sub total)/, 'invoice.subtotal'],
    [/(gst|tax)/, 'invoice.tax'],
    [/(grand total|invoice total|amount due|total amount)/, 'invoice.total'],
    [/(terms|payment terms)/, 'invoice.terms'],
    [/(customer|client|bill to|company name)/, 'customer.name'],
    [/(billing address|bill address)/, 'customer.billing_address'],
    [/(customer contact|client contact|contact name)/, 'customer.contact_name'],
    [/(customer phone|client phone)/, 'customer.phone'],
    [/(customer email|client email)/, 'customer.email'],
    [/(job|work order) (number|no)|job number|job no/, 'job.job_number'],
    [/(purchase order|po number|po no|p o number)/, 'job.purchase_order'],
    [/(site name|job site|location)/, 'job.site_name'],
    [/(operator|driver|employee|worker|inspector|technician) name|operator$/, 'employee.full_name'],
    [/(employee|operator|inspector|technician) signature|signature employee/, 'employee.signature'],
    [/(unit number|unit no|truck number|truck no)/, 'vehicle.unit_number'],
    [/(licen[cs]e plate|plate number|plate no)/, 'vehicle.plate'],
    [/(odometer|mileage|kilometres|kilometers|kms)/, 'vehicle.odometer'],
    [/(engine hours|hour meter)/, 'vehicle.engine_hours'],
    [/(ticket number|ticket no)/, 'ticket.ticket_number'],
    [/(service date|ticket date)/, 'ticket.service_date'],
    [/(customer signature|client signature|approved by signature)/, 'ticket.customer_signature'],
    [/(approved by|customer approver)/, 'ticket.customer_name'],
    [/(work area|area of work)/, 'flha.work_area'],
    [/(task|scope of work|work task)/, 'flha.task'],
    [/(hazard|hazards)/, 'flha.hazards'],
    [/(control|controls|mitigation)/, 'flha.controls'],
    [/(ppe|required ppe)/, 'flha.ppe'],
    [/(emergency plan|muster point)/, 'flha.emergency_plan'],
    [/(inspection date|pre trip date)/, 'inspection.inspection_date'],
    [/(defect|defects)/, 'inspection.defects'],
    [/(safe to operate|roadworthy)/, 'inspection.safe_to_operate'],
  ]

  for (const [pattern, binding] of checks) if (pattern.test(value)) return binding
  if (documentType === 'invoice' && /date/.test(value)) return 'invoice.issue_date'
  if (documentType === 'pre_trip' && /signature/.test(value)) return 'inspection.signature'
  if (documentType === 'flha' && /signature/.test(value)) return 'flha.crew_signatures'
  if (documentType === 'field_ticket' && /signature/.test(value)) return 'ticket.customer_signature'
  return ''
}

function fieldTypeFromPdf(pdfType: string): TemplateFieldType {
  if (pdfType === 'Btn') return 'checkbox'
  if (pdfType === 'Sig') return 'signature'
  if (pdfType === 'Ch') return 'select'
  return 'text'
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, character: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[character] || character))
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

function decodePdfHex(value: string) {
  const clean = value.replace(/\s+/g, '')
  let output = ''
  for (let index = 0; index + 1 < clean.length; index += 2) output += String.fromCharCode(parseInt(clean.slice(index, index + 2), 16))
  return output.replace(/^\u0000+/, '').replace(/\u0000/g, '')
}

async function decompressedPdfText(bytes: Uint8Array, raw: string) {
  if (typeof DecompressionStream === 'undefined') return { text: '', count: 0 }
  const decoder = new TextDecoder('latin1')
  const texts: string[] = []
  let cursor = 0
  let count = 0
  while (cursor < raw.length && count < 120) {
    const streamAt = raw.indexOf('stream', cursor)
    if (streamAt < 0) break
    const objectAt = Math.max(raw.lastIndexOf('obj', streamAt), streamAt - 1800)
    const header = raw.slice(Math.max(0, objectAt), streamAt)
    let dataStart = streamAt + 6
    if (raw.slice(dataStart, dataStart + 2) === '\r\n') dataStart += 2
    else if (raw[dataStart] === '\n' || raw[dataStart] === '\r') dataStart += 1
    const endAt = raw.indexOf('endstream', dataStart)
    if (endAt < 0) break
    cursor = endAt + 9
    if (!/\/FlateDecode/.test(header)) continue
    try {
      let dataEnd = endAt
      while (dataEnd > dataStart && (bytes[dataEnd - 1] === 10 || bytes[dataEnd - 1] === 13)) dataEnd -= 1
      const compressed = bytes.slice(dataStart, dataEnd)
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))
      const inflated = new Uint8Array(await new Response(stream).arrayBuffer())
      texts.push(decoder.decode(inflated))
      count += 1
    } catch {
      continue
    }
  }
  return { text: texts.join('\n'), count }
}

export async function analyzePdfFile(file: File, documentType: TemplateDocumentType): Promise<PdfAnalysis> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder('latin1')
  const raw = decoder.decode(bytes)
  const inflated = await decompressedPdfText(bytes, raw)
  const searchable = `${raw}\n${inflated.text}`
  const pageMatches = searchable.match(/\/Type\s*\/Page(?!s)\b/g)
  const pageCount = pageMatches?.length ? pageMatches.length : null
  const hasAcroForm = /\/AcroForm\b/.test(searchable) || /\/FT\s*\/(Tx|Btn|Ch|Sig)\b/.test(searchable)
  const fieldRegex = /\/T\s*(?:\(([^)]{1,220})\)|<([0-9a-fA-F\s]{2,440})>)/g
  const byName = new Map<string, PdfFieldAnalysis>()
  let match: RegExpExecArray | null
  while ((match = fieldRegex.exec(searchable)) !== null) {
    const fieldName = (match[1] ? decodePdfLiteral(match[1]) : decodePdfHex(match[2] || '')).trim()
    if (!fieldName || fieldName.length > 180) continue
    const contextStart = Math.max(0, match.index - 500)
    const contextEnd = Math.min(searchable.length, match.index + match[0].length + 500)
    const context = searchable.slice(contextStart, contextEnd)
    const typeMatch = context.match(/\/FT\s*\/(Tx|Btn|Ch|Sig)\b/)
    const fieldType = typeMatch?.[1] || 'Tx'
    if (!byName.has(fieldName)) byName.set(fieldName, { fieldName, fieldType, binding: inferBinding(fieldName, documentType) })
  }
  const detected = [...byName.values()].sort((a, b) => a.fieldName.localeCompare(b.fieldName))
  const note = detected.length
    ? `Detected ${detected.length} fillable PDF field${detected.length === 1 ? '' : 's'} and suggested Northborn data bindings where names matched.`
    : hasAcroForm
      ? 'The PDF advertises form data, but no named fields could be read automatically. You can still define the fields manually.'
      : 'This appears to be a flat PDF. Northborn can keep it as the visual template, but field placement will need to be configured manually before automatic filling is enabled.'
  return { pageCount, hasAcroForm, detected, compressedStreamsRead: inflated.count, note }
}

export function fieldsFromPdfAnalysis(analysis: PdfAnalysis, documentType: TemplateDocumentType) {
  if (!analysis.detected.length) return presetFields(documentType).map(field => ({ ...field, source: 'custom' as const, pdf_field_name: '' }))
  return analysis.detected.map(item => {
    const label = item.fieldName.replace(/[_\.]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
    return makeTemplateField(label, item.binding, fieldTypeFromPdf(item.fieldType), false, 'pdf', item.fieldName)
  })
}

export function documentTypeLabel(value: TemplateDocumentType) {
  return DOCUMENT_TYPE_OPTIONS.find(option => option.value === value)?.label || value
}
