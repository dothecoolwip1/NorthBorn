import React from 'react'
import {
  Archive,
  Beaker,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  Factory,
  FlaskConical,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  TestTube2,
  Trash2,
  Upload,
  UserRound,
  WifiOff,
  X,
  Boxes,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { parseLabDocument } from './mallardDocumentParser'
import {
  buildProfileLearningPayload,
  type DocumentFieldKey,
  type MallardDocumentProfile,
  type ParsedLabDocument,
} from './mallardDocumentEngine'
import MallardDocumentReview, { type MallardDocumentReviewResult } from './MallardDocumentReview'
import './mallard-sample-tracker-v3.css'

type SampleCategory = 'non_oilfield' | 'oilfield' | 'odd_weird'
type SampleStatus = 'collected' | 'with_driver' | 'received' | 'submitted' | 'testing' | 'results_received' | 'complete'
type ViewMode = 'dashboard' | 'samples' | 'picker' | 'new' | 'detail' | 'classifications' | 'sites'

type Classification = {
  code: number
  name: string
  group_name: string
  section_name: string
  description: string | null
  active: boolean
  sort_order: number
}

type Site = {
  id: string
  customer: string | null
  site_name: string
  lsd: string | null
  uwi: string | null
  latitude: number | null
  longitude: number | null
  access_directions: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  active: boolean
}

type NextClassificationNumber = {
  classification_code: number
  classification_name: string
  group_name: string
  next_sequence: number | null
  next_sample_code: string | null
}

type MallardSample = {
  id: string
  sample_number: number
  sample_code: string
  classification_code: number
  sequence_number: number
  site_id: string | null
  category: SampleCategory
  status: SampleStatus
  collected_at: string
  location: string
  customer_site: string | null
  description_of_work: string
  suspected_contents: string
  confirmed_material: string | null
  collector_name: string | null
  field_notes: string | null
  received_at: string | null
  received_by: string | null
  lab_name: string | null
  lab_submission_number: string | null
  submitted_at: string | null
  results_received_at: string | null
  final_determination: string | null
  lab_notes: string | null
  last_updated_by: string | null
  archived: boolean
  created_at: string
  updated_at: string
  revision: number
  sample_matrix: string | null
  priority: boolean
  disposal_destination: string | null
  disposed_at: string | null
}

type TestResult = {
  id?: string
  sample_id?: string
  test_name: string
  result_value: string
  unit: string
  qualifier: string
  method: string
  reporting_limit: string
  detection_limit: string
  flag: string
  notes: string
  sort_order: number
  source_attachment_id?: string | null
  parse_confidence?: number | null
  source_page?: number | null
  source_bbox?: Record<string, number> | null
}

type TestAttachment = {
  id: string
  sample_id: string
  storage_path: string
  original_name: string
  mime_type: string
  size_bytes: number
  parse_status: 'uploaded' | 'processing' | 'parsed' | 'needs_review' | 'failed'
  parse_method: string | null
  parsed_line_count: number
  parse_error: string | null
  parsed_at: string | null
  document_type: string | null
  document_confidence: number | null
  parser_version: string | null
  layout_fingerprint: string | null
  extraction_json: ParsedLabDocument | null
  review_status: 'unreviewed' | 'reviewed' | 'corrected'
  review_json: Record<string, unknown> | null
  reviewed_at: string | null
  created_at: string
}

type SampleEvent = {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_name: string | null
  note: string | null
  created_at: string
}

type SampleForm = {
  classification_code: number
  site_id: string
  collected_date: string
  location: string
  customer_site: string
  description_of_work: string
  suspected_contents: string
  collector_name: string
  field_notes: string
  sample_matrix: string
  priority: boolean
  disposal_destination: string
  disposal_date: string
}

type SavedDraft = {
  id: string
  saved_at: string
  form: SampleForm
}

type MallardNavState = {
  mallardTracker: true
  view: ViewMode
  pickerGroup: string | null
  pickerSection: string | null
  pickerMode: 'new' | 'change'
  sampleId: string | null
}

const db = supabase as any
const DRAFT_KEY = 'mallard_sample_drafts_v3'
const ACTOR_KEY = 'mallard_last_actor_v1'

const categoryInfo: Record<SampleCategory, { label: string; range: string; tone: string }> = {
  non_oilfield: { label: 'Non Oilfield', range: '100–199', tone: 'green' },
  oilfield: { label: 'Oilfield', range: '200–299', tone: 'gold' },
  odd_weird: { label: 'Other / Specialty', range: '300–399', tone: 'grey' },
}

function categoryFromCode(code: number): SampleCategory {
  if (code >= 100 && code <= 199) return 'non_oilfield'
  if (code >= 200 && code <= 299) return 'oilfield'
  return 'odd_weird'
}

function toneForCode(code: number) {
  return categoryInfo[categoryFromCode(code)].tone
}

function toneForGroup(group: string) {
  if (group === 'Oilfield') return 'gold'
  if (group === 'Non Oilfield') return 'green'
  return 'grey'
}

function rangeForGroup(group: string) {
  if (group === 'Oilfield') return '200–299'
  if (group === 'Non Oilfield') return '100–199'
  if (group === 'Other / Specialty') return '300–399'
  if (group === 'Future / Custom') return '400–899'
  if (group === 'System / Legacy') return '900–999'
  return 'Custom'
}

function classificationCodeRange(group: string): [number, number] | null {
  if (group === 'Non Oilfield') return [101, 198]
  if (group === 'Oilfield') return [201, 298]
  if (group === 'Other / Specialty') return [301, 398]
  if (group === 'Future / Custom') return [400, 899]
  if (group === 'System / Legacy') return [900, 999]
  return null
}

function nextClassificationCodePreview(group: string, classifications: Classification[]) {
  const range = classificationCodeRange(group)
  if (!range) return null
  const used = new Set(classifications.map((item) => item.code))
  for (let code = range[0]; code <= range[1]; code += 1) {
    if (!used.has(code)) return code
  }
  return null
}

function descriptionForGroup(group: string) {
  if (group === 'Oilfield') return 'Wells, tanks, completions and production fluids'
  if (group === 'Non Oilfield') return 'Sumps, septic, commercial waste and hydrovac material'
  if (group === 'Other / Specialty') return 'Fuels, refined oils and specialty materials'
  return 'Custom sample classifications'
}

const statusOrder: SampleStatus[] = ['collected', 'with_driver', 'received', 'submitted', 'testing', 'results_received', 'complete']
const statusLabels: Record<SampleStatus, string> = {
  collected: 'Collected',
  with_driver: 'With driver',
  received: 'Received by Mallard',
  submitted: 'Submitted to lab',
  testing: 'Testing',
  results_received: 'Results received',
  complete: 'Complete',
}

const eventLabels: Record<string, string> = {
  created: 'Sample created',
  status_change: 'Status changed',
  archived: 'Sample archived',
  restored: 'Sample restored',
  field_update: 'Field information updated',
  lab_update: 'Mallard or lab information updated',
  disposal_update: 'Disposal information updated',
  test_added: 'Test result added',
  test_updated: 'Test result updated',
  test_removed: 'Test result removed',
  attachment_uploaded: 'Test paperwork uploaded',
  attachment_parsed: 'Test paperwork read',
  attachment_parse_review: 'Test paperwork needs review',
  attachment_reviewed: 'Test paperwork reviewed',
}

const matrixOptions = ['Unknown', 'Water', 'Soil', 'Sludge', 'Hydrocarbon / product', 'Mixed waste', 'Other']
const disposalSuggestions = ['MROR', 'Secure', 'One Environmental']

function todayForInput() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function toDateValue(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function dateToIso(value: string) {
  return value ? `${value}T12:00:00.000Z` : null
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' }).format(new Date(value))
}

function formatBottleDate(value: string | null | undefined) {
  if (!value) return 'DATE'
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)).toUpperCase()
}

function blankForm(classificationCode = 201): SampleForm {
  return {
    classification_code: classificationCode,
    site_id: '',
    collected_date: todayForInput(),
    location: '',
    customer_site: '',
    description_of_work: '',
    suspected_contents: '',
    collector_name: localStorage.getItem(ACTOR_KEY) || '',
    field_notes: '',
    sample_matrix: 'Unknown',
    priority: false,
    disposal_destination: '',
    disposal_date: '',
  }
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function parseDocumentDate(value: string, timeValue?: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  const month = parsed.getMonth()
  const day = parsed.getDate()
  let hours = 12
  let minutes = 0
  const timeMatch = timeValue?.match(/\b(\d{1,2}):(\d{2})(?:\s*([ap]m))?\b/i)
  if (timeMatch) {
    hours = Number(timeMatch[1])
    minutes = Number(timeMatch[2])
    const meridiem = timeMatch[3]?.toLowerCase()
    if (meridiem === 'pm' && hours < 12) hours += 12
    if (meridiem === 'am' && hours === 12) hours = 0
  }
  return new Date(year, month, day, hours, minutes, 0, 0).toISOString()
}

function normalizeImportedMatrix(value: string) {
  const normalized = value.trim().toLowerCase()
  if (/soil|sediment|earth|dirt/.test(normalized)) return 'Soil'
  if (/water|aqueous|groundwater|surface water/.test(normalized)) return 'Water'
  if (/sludge|slurry|mud/.test(normalized)) return 'Sludge'
  if (/oil|fuel|diesel|gasoline|hydrocarbon|product/.test(normalized)) return 'Hydrocarbon / product'
  if (/mixed|waste/.test(normalized)) return 'Mixed waste'
  return normalized ? 'Other' : 'Unknown'
}

function isParsedDocument(value: unknown): value is ParsedLabDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ParsedLabDocument>
  return typeof candidate.fingerprint === 'string'
    && Array.isArray(candidate.fields)
    && Array.isArray(candidate.rows)
    && typeof candidate.parser_version === 'string'
}

function mergeAliasMaps(
  current: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]> | null | undefined,
) {
  const merged: Record<string, string[]> = {}
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(incoming || {})])
  for (const key of keys) {
    const values = [...(current?.[key] || []), ...(incoming?.[key] || [])]
    merged[key] = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
  }
  return merged
}

export default function MallardSampleTrackerV3() {
  const [view, setView] = React.useState<ViewMode>('dashboard')
  const [samples, setSamples] = React.useState<MallardSample[]>([])
  const [allSamples, setAllSamples] = React.useState<MallardSample[]>([])
  const [selected, setSelected] = React.useState<MallardSample | null>(null)
  const [testResults, setTestResults] = React.useState<TestResult[]>([])
  const [attachments, setAttachments] = React.useState<TestAttachment[]>([])
  const [events, setEvents] = React.useState<SampleEvent[]>([])
  const [deletedResultIds, setDeletedResultIds] = React.useState<string[]>([])
  const [newForm, setNewForm] = React.useState<SampleForm>(() => blankForm())
  const [activeDraftId, setActiveDraftId] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<SavedDraft[]>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]') }
    catch { return [] }
  })
  const [classifications, setClassifications] = React.useState<Classification[]>([])
  const [nextClassificationNumbers, setNextClassificationNumbers] = React.useState<NextClassificationNumber[]>([])
  const [sites, setSites] = React.useState<Site[]>([])
  const [classificationEditor, setClassificationEditor] = React.useState({ code: '', name: '', group_name: 'Oilfield', section_name: 'General', description: '' })
  const [pickerGroup, setPickerGroup] = React.useState<string | null>(null)
  const [pickerSection, setPickerSection] = React.useState<string | null>(null)
  const [pickerMode, setPickerMode] = React.useState<'new' | 'change'>('new')
  const [editingClassificationCode, setEditingClassificationCode] = React.useState<number | null>(null)
  const [quickClassificationOpen, setQuickClassificationOpen] = React.useState(false)
  const [quickClassificationEditor, setQuickClassificationEditor] = React.useState({ name: '', section_name: 'General', description: '' })
  const [siteEditor, setSiteEditor] = React.useState({ id: '', customer: '', site_name: '', lsd: '', uwi: '', latitude: '', longitude: '', access_directions: '', contact_name: '', contact_phone: '', contact_email: '', notes: '' })
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | SampleCategory>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | SampleStatus>('all')
  const [disposalFilter, setDisposalFilter] = React.useState<'all' | 'undumped' | string>('all')
  const [actorName, setActorName] = React.useState(() => localStorage.getItem(ACTOR_KEY) || '')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [online, setOnline] = React.useState(() => navigator.onLine)
  const [attachmentBusy, setAttachmentBusy] = React.useState(false)
  const [attachmentProgress, setAttachmentProgress] = React.useState('')
  const [attachmentProgressValue, setAttachmentProgressValue] = React.useState(0)
  const [reviewAttachment, setReviewAttachment] = React.useState<TestAttachment | null>(null)
  const [reviewDocument, setReviewDocument] = React.useState<ParsedLabDocument | null>(null)
  const attachmentInputRef = React.useRef<HTMLInputElement>(null)
  const deepLinkOpenedRef = React.useRef(false)
  const historyReadyRef = React.useRef(false)

  const classificationByCode = React.useMemo(() => new Map(classifications.map((item) => [item.code, item])), [classifications])
  const nextCodeByClassification = React.useMemo(() => new Map(nextClassificationNumbers.map((item) => [item.classification_code, item.next_sample_code])), [nextClassificationNumbers])
  const activeClassifications = React.useMemo(() => classifications.filter((item) => item.active && !item.name.startsWith('Legacy /')), [classifications])
  const pickerGroups = React.useMemo(() => {
    const preferred = ['Oilfield', 'Non Oilfield', 'Other / Specialty']
    const present = new Set(activeClassifications.map((item) => item.group_name))
    return [...preferred.filter((group) => present.has(group)), ...Array.from(present).filter((group) => !preferred.includes(group)).sort()]
  }, [activeClassifications])
  const pickerSections = React.useMemo(() => {
    if (!pickerGroup) return []
    return Array.from(new Set(activeClassifications.filter((item) => item.group_name === pickerGroup).map((item) => item.section_name))).sort()
  }, [activeClassifications, pickerGroup])
  const pickerTypes = React.useMemo(() => {
    if (!pickerGroup || !pickerSection) return []
    return activeClassifications.filter((item) => item.group_name === pickerGroup && item.section_name === pickerSection)
  }, [activeClassifications, pickerGroup, pickerSection])
  const managerClassificationCodePreview = React.useMemo(
    () => nextClassificationCodePreview(classificationEditor.group_name, classifications),
    [classificationEditor.group_name, classifications],
  )
  const quickClassificationCodePreview = React.useMemo(
    () => pickerGroup ? nextClassificationCodePreview(pickerGroup, classifications) : null,
    [pickerGroup, classifications],
  )
  const selectedSite = selected?.site_id ? sites.find((site) => site.id === selected.site_id) || null : null
  const selectedSiteHistory = selected?.site_id ? allSamples.filter((sample) => sample.site_id === selected.site_id && sample.id !== selected.id) : []

  const loadSamples = React.useCallback(async () => {
    setLoading(true)
    const [sampleResponse, classificationResponse, counterResponse, siteResponse] = await Promise.all([
      db.from('mallard_samples').select('*').order('collected_at', { ascending: false }),
      db.from('mallard_classifications').select('*').order('sort_order', { ascending: true }).order('code', { ascending: true }),
      db.rpc('mallard_get_classification_numbers'),
      db.from('mallard_sites').select('*').order('customer', { ascending: true, nullsFirst: false }).order('site_name', { ascending: true }),
    ])

    if (sampleResponse.error) {
      setMessage({ type: 'error', text: `Could not load samples: ${sampleResponse.error.message}` })
    } else {
      const loadedSamples = (sampleResponse.data || []) as MallardSample[]
      setAllSamples(loadedSamples)
      setSamples(loadedSamples.filter((sample) => !sample.archived))
    }

    if (classificationResponse.error) {
      setMessage({ type: 'error', text: `Could not load classifications: ${classificationResponse.error.message}` })
    } else {
      setClassifications(classificationResponse.data || [])
    }

    if (!counterResponse.error) setNextClassificationNumbers(counterResponse.data || [])
    if (!siteResponse.error) setSites(siteResponse.data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { void loadSamples() }, [loadSamples])
  React.useEffect(() => {
    const onOnline = () => { setOnline(true); void loadSamples() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [loadSamples])
  React.useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 4500)
    return () => window.clearTimeout(timer)
  }, [message])

  const persistDrafts = (next: SavedDraft[]) => {
    setDrafts(next)
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  }

  const makeNavState = (
    nextView: ViewMode,
    options: {
      group?: string | null
      section?: string | null
      mode?: 'new' | 'change'
      sampleId?: string | null
    } = {},
  ): MallardNavState => ({
    mallardTracker: true,
    view: nextView,
    pickerGroup: options.group ?? null,
    pickerSection: options.section ?? null,
    pickerMode: options.mode ?? 'new',
    sampleId: options.sampleId ?? null,
  })

  const pushNavState = (state: MallardNavState) => {
    if (!historyReadyRef.current) return
    const current = window.history.state as MallardNavState | null
    if (
      current?.mallardTracker &&
      current.view === state.view &&
      current.pickerGroup === state.pickerGroup &&
      current.pickerSection === state.pickerSection &&
      current.pickerMode === state.pickerMode &&
      current.sampleId === state.sampleId
    ) return
    window.history.pushState(state, '', window.location.href)
  }

  const replaceNavState = (state: MallardNavState) => {
    window.history.replaceState(state, '', window.location.href)
  }

  const navigateView = (
    nextView: ViewMode,
    options: {
      group?: string | null
      section?: string | null
      mode?: 'new' | 'change'
      sampleId?: string | null
      replace?: boolean
    } = {},
  ) => {
    setView(nextView)
    if (nextView === 'picker') {
      setPickerMode(options.mode ?? 'new')
      setPickerGroup(options.group ?? null)
      setPickerSection(options.section ?? null)
      setQuickClassificationOpen(false)
    }
    const state = makeNavState(nextView, options)
    if (options.replace) replaceNavState(state)
    else pushNavState(state)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else navigateView('dashboard', { replace: true })
  }

  const openSamplePicker = (group: string | null = null, mode: 'new' | 'change' = 'new') => {
    navigateView('picker', { group, section: null, mode })
  }

  const choosePickerClassification = (classification: Classification) => {
    if (pickerMode === 'change') {
      setNewForm({ ...newForm, classification_code: classification.code })
    } else {
      setNewForm(blankForm(classification.code))
      setActiveDraftId(null)
    }
    setPickerGroup(null)
    setPickerSection(null)
    navigateView('new')
  }

  const changeCurrentClassification = () => {
    const classification = classificationByCode.get(newForm.classification_code)
    navigateView('picker', {
      group: classification?.group_name || null,
      section: classification?.section_name || null,
      mode: 'change',
    })
  }

  const cloneSample = (sample: MallardSample) => {
    setNewForm({
      classification_code: sample.classification_code,
      site_id: sample.site_id || '',
      collected_date: todayForInput(),
      location: sample.location,
      customer_site: sample.customer_site || '',
      description_of_work: sample.description_of_work,
      suspected_contents: sample.suspected_contents,
      collector_name: sample.collector_name || localStorage.getItem(ACTOR_KEY) || '',
      field_notes: '',
      sample_matrix: sample.sample_matrix || 'Unknown',
      priority: sample.priority,
      disposal_destination: sample.disposal_destination || '',
      disposal_date: sample.disposed_at ? toDateValue(sample.disposed_at) : '',
    })
    setActiveDraftId(null)
    navigateView('new')
  }

  const saveDraft = () => {
    const draftId = activeDraftId || crypto.randomUUID()
    const draft: SavedDraft = { id: draftId, saved_at: new Date().toISOString(), form: newForm }
    persistDrafts([draft, ...drafts.filter((item) => item.id !== draftId)].slice(0, 30))
    setActiveDraftId(draftId)
    setMessage({ type: 'success', text: 'Draft saved on this device.' })
  }

  const resumeDraft = (draft: SavedDraft) => {
    setNewForm({ ...blankForm(), ...draft.form, classification_code: draft.form.classification_code || 201, site_id: draft.form.site_id || '' })
    setActiveDraftId(draft.id)
    navigateView('new')
  }

  const discardDraft = (id: string) => {
    persistDrafts(drafts.filter((item) => item.id !== id))
    if (activeDraftId === id) setActiveDraftId(null)
  }

  const createSample = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newForm.location.trim() || !newForm.description_of_work.trim() || !newForm.suspected_contents.trim()) {
      setMessage({ type: 'error', text: 'Location, work description and suspected contents are required.' })
      return
    }

    if (!navigator.onLine) {
      saveDraft()
      setMessage({ type: 'info', text: 'No connection. Saved as a device draft until service returns.' })
      return
    }

    setSaving(true)
    const collector = newForm.collector_name.trim()
    if (collector) {
      localStorage.setItem(ACTOR_KEY, collector)
      setActorName(collector)
    }

    const payload = {
      classification_code: newForm.classification_code,
      site_id: newForm.site_id || null,
      collected_at: dateToIso(newForm.collected_date),
      location: newForm.location.trim(),
      customer_site: newForm.customer_site.trim() || null,
      description_of_work: newForm.description_of_work.trim(),
      suspected_contents: newForm.suspected_contents.trim(),
      collector_name: collector || null,
      field_notes: newForm.field_notes.trim() || null,
      sample_matrix: newForm.sample_matrix || null,
      priority: newForm.priority,
      disposal_destination: newForm.disposal_destination.trim() || null,
      disposed_at: newForm.disposal_destination.trim() && newForm.disposal_date ? dateToIso(newForm.disposal_date) : null,
      last_updated_by: collector || null,
    }

    const { data, error } = await db.from('mallard_samples').insert(payload).select('*').single()
    setSaving(false)
    if (error) {
      saveDraft()
      setMessage({ type: 'error', text: `Could not create sample. A device draft was saved. ${error.message}` })
      return
    }

    if (activeDraftId) discardDraft(activeDraftId)
    setNewForm(blankForm(newForm.classification_code))
    await loadSamples()
    await openSample(data.id)
    setMessage({ type: 'success', text: `Sample ${data.sample_code} created. Write this sample ID on the bottle now.` })
  }

  const openSample = async (id: string, historyMode: 'push' | 'replace' | 'none' = 'push') => {
    setLoading(true)
    const [sampleResponse, resultResponse, attachmentResponse, eventResponse] = await Promise.all([
      db.from('mallard_samples').select('*').eq('id', id).single(),
      db.from('mallard_test_results').select('*').eq('sample_id', id).order('sort_order', { ascending: true }),
      db.from('mallard_sample_attachments').select('*').eq('sample_id', id).order('created_at', { ascending: false }),
      db.from('mallard_sample_events').select('*').eq('sample_id', id).order('created_at', { ascending: false }),
    ])
    if (sampleResponse.error) {
      setMessage({ type: 'error', text: `Could not open sample: ${sampleResponse.error.message}` })
      setLoading(false)
      return
    }
    setSelected(sampleResponse.data)
    setTestResults((resultResponse.data || []).map((row: any) => ({
      id: row.id,
      sample_id: row.sample_id,
      test_name: row.test_name || '',
      result_value: row.result_value || '',
      unit: row.unit || '',
      qualifier: row.qualifier || '',
      method: row.method || '',
      reporting_limit: row.reporting_limit || '',
      detection_limit: row.detection_limit || '',
      flag: row.flag || '',
      notes: row.notes || '',
      sort_order: row.sort_order || 0,
      source_attachment_id: row.source_attachment_id || null,
      parse_confidence: row.parse_confidence == null ? null : Number(row.parse_confidence),
      source_page: row.source_page == null ? null : Number(row.source_page),
      source_bbox: row.source_bbox || null,
    })))
    setAttachments((attachmentResponse.data || []).map((row: any) => ({
      ...row,
      document_confidence: row.document_confidence == null ? null : Number(row.document_confidence),
      extraction_json: isParsedDocument(row.extraction_json) ? row.extraction_json : null,
    })))
    setDeletedResultIds([])
    setEvents(eventResponse.data || [])
    setView('detail')
    setLoading(false)
    if (historyMode === 'push') pushNavState(makeNavState('detail', { sampleId: id }))
    if (historyMode === 'replace') replaceNavState(makeNavState('detail', { sampleId: id }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  React.useEffect(() => {
    const existing = window.history.state as MallardNavState | null
    if (!existing?.mallardTracker) {
      replaceNavState(makeNavState('dashboard'))
    } else {
      setPickerGroup(existing.pickerGroup)
      setPickerSection(existing.pickerSection)
      setPickerMode(existing.pickerMode || 'new')
      if (existing.view === 'detail' && existing.sampleId) void openSample(existing.sampleId, 'none')
      else setView(existing.view)
    }
    historyReadyRef.current = true

    const onPopState = (event: PopStateEvent) => {
      const state = event.state as MallardNavState | null
      if (!state?.mallardTracker) return
      setPickerGroup(state.pickerGroup)
      setPickerSection(state.pickerSection)
      setPickerMode(state.pickerMode || 'new')
      if (state.view === 'detail' && state.sampleId) {
        void openSample(state.sampleId, 'none')
      } else {
        setView(state.view)
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  React.useEffect(() => {
    if (deepLinkOpenedRef.current) return
    const sampleId = new URLSearchParams(window.location.search).get('sample')
    if (!sampleId) return
    deepLinkOpenedRef.current = true
    void openSample(sampleId, 'replace')
  }, [])

  const chooseSiteForForm = (siteId: string) => {
    const site = sites.find((item) => item.id === siteId)
    if (!site) {
      setNewForm({ ...newForm, site_id: '' })
      return
    }
    setNewForm({
      ...newForm,
      site_id: site.id,
      location: site.lsd || site.uwi || site.site_name,
      customer_site: [site.customer, site.site_name].filter(Boolean).join(' / '),
    })
  }

  const saveClassification = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!classificationEditor.name.trim() || !classificationEditor.group_name.trim() || !classificationEditor.section_name.trim()) {
      setMessage({ type: 'error', text: 'Enter a name, category and section.' })
      return
    }

    setSaving(true)
    let response: any
    let createdCode: number | null = null

    if (editingClassificationCode) {
      response = await db.from('mallard_classifications').update({
        name: classificationEditor.name.trim(),
        group_name: classificationEditor.group_name.trim(),
        section_name: classificationEditor.section_name.trim(),
        description: classificationEditor.description.trim() || null,
      }).eq('code', editingClassificationCode)
    } else {
      response = await db.rpc('mallard_create_classification_auto', {
        p_name: classificationEditor.name.trim(),
        p_group_name: classificationEditor.group_name.trim(),
        p_section_name: classificationEditor.section_name.trim(),
        p_description: classificationEditor.description.trim() || null,
      })
      const created = Array.isArray(response.data) ? response.data[0] : response.data
      createdCode = created?.code ?? null
    }

    setSaving(false)
    if (response.error) {
      setMessage({ type: 'error', text: `Could not save classification: ${response.error.message}` })
      return
    }

    setClassificationEditor({ code: '', name: '', group_name: 'Oilfield', section_name: 'General', description: '' })
    setEditingClassificationCode(null)
    await loadSamples()
    setMessage({ type: 'success', text: editingClassificationCode ? 'Classification updated.' : `Classification ${createdCode ?? 'created'} added.` })
  }

  const saveQuickClassification = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pickerGroup || !quickClassificationEditor.name.trim() || !quickClassificationEditor.section_name.trim()) {
      setMessage({ type: 'error', text: 'Enter a sample type name and section.' })
      return
    }

    setSaving(true)
    const response = await db.rpc('mallard_create_classification_auto', {
      p_name: quickClassificationEditor.name.trim(),
      p_group_name: pickerGroup,
      p_section_name: quickClassificationEditor.section_name.trim(),
      p_description: quickClassificationEditor.description.trim() || null,
    })
    setSaving(false)

    if (response.error) {
      setMessage({ type: 'error', text: `Could not add classification: ${response.error.message}` })
      return
    }

    const created = (Array.isArray(response.data) ? response.data[0] : response.data) as Classification | null
    if (!created?.code) {
      setMessage({ type: 'error', text: 'Classification was created but Mallard could not read the assigned code.' })
      await loadSamples()
      return
    }

    setQuickClassificationOpen(false)
    setQuickClassificationEditor({ name: '', section_name: 'General', description: '' })
    await loadSamples()
    choosePickerClassification(created)
    setMessage({ type: 'success', text: `Added ${created.name} as classification ${created.code}.` })
  }

  const editClassification = (classification: Classification) => {
    setEditingClassificationCode(classification.code)
    setClassificationEditor({
      code: String(classification.code),
      name: classification.name,
      group_name: classification.group_name,
      section_name: classification.section_name,
      description: classification.description || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleClassification = async (classification: Classification) => {
    const { error } = await db.from('mallard_classifications').update({ active: !classification.active }).eq('code', classification.code)
    if (error) {
      setMessage({ type: 'error', text: `Could not update classification: ${error.message}` })
      return
    }
    await loadSamples()
    setMessage({ type: 'success', text: `${classification.code} ${classification.active ? 'disabled' : 'enabled'}.` })
  }

  const saveSite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!siteEditor.site_name.trim()) {
      setMessage({ type: 'error', text: 'Site name is required.' })
      return
    }
    const latitude = siteEditor.latitude.trim() ? Number(siteEditor.latitude) : null
    const longitude = siteEditor.longitude.trim() ? Number(siteEditor.longitude) : null
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      setMessage({ type: 'error', text: 'Check the GPS latitude and longitude.' })
      return
    }
    const payload = {
      customer: siteEditor.customer.trim() || null,
      site_name: siteEditor.site_name.trim(),
      lsd: siteEditor.lsd.trim() || null,
      uwi: siteEditor.uwi.trim() || null,
      latitude,
      longitude,
      access_directions: siteEditor.access_directions.trim() || null,
      contact_name: siteEditor.contact_name.trim() || null,
      contact_phone: siteEditor.contact_phone.trim() || null,
      contact_email: siteEditor.contact_email.trim() || null,
      notes: siteEditor.notes.trim() || null,
    }
    setSaving(true)
    const response = siteEditor.id
      ? await db.from('mallard_sites').update(payload).eq('id', siteEditor.id)
      : await db.from('mallard_sites').insert({ ...payload, active: true })
    setSaving(false)
    if (response.error) {
      setMessage({ type: 'error', text: `Could not save site: ${response.error.message}` })
      return
    }
    setSiteEditor({ id: '', customer: '', site_name: '', lsd: '', uwi: '', latitude: '', longitude: '', access_directions: '', contact_name: '', contact_phone: '', contact_email: '', notes: '' })
    await loadSamples()
    setMessage({ type: 'success', text: siteEditor.id ? 'Site updated.' : 'Reusable site added.' })
  }

  const editSite = (site: Site) => {
    setSiteEditor({
      id: site.id,
      customer: site.customer || '',
      site_name: site.site_name,
      lsd: site.lsd || '',
      uwi: site.uwi || '',
      latitude: site.latitude == null ? '' : String(site.latitude),
      longitude: site.longitude == null ? '' : String(site.longitude),
      access_directions: site.access_directions || '',
      contact_name: site.contact_name || '',
      contact_phone: site.contact_phone || '',
      contact_email: site.contact_email || '',
      notes: site.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleSite = async (site: Site) => {
    const { error } = await db.from('mallard_sites').update({ active: !site.active }).eq('id', site.id)
    if (error) {
      setMessage({ type: 'error', text: `Could not update site: ${error.message}` })
      return
    }
    await loadSamples()
    setMessage({ type: 'success', text: `${site.site_name} ${site.active ? 'disabled' : 'enabled'}.` })
  }

  const savePatch = async (patch: Record<string, unknown>, successText: string) => {
    if (!selected) return false
    setSaving(true)
    const actor = actorName.trim() || selected.collector_name?.trim() || 'Mallard'
    const { data, error } = await db.from('mallard_samples')
      .update({ ...patch, last_updated_by: actor })
      .eq('id', selected.id)
      .eq('revision', selected.revision)
      .select('*')
      .maybeSingle()
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: `Could not save: ${error.message}` })
      return false
    }
    if (!data) {
      setMessage({ type: 'error', text: 'This sample changed on another device. I refreshed the latest version.' })
      await openSample(selected.id, 'none')
      return false
    }
    setSelected(data)
    await loadSamples()
    await openSample(data.id, 'none')
    setMessage({ type: 'success', text: successText })
    return true
  }

  const saveFieldInfo = async () => {
    if (!selected) return
    await savePatch({
      collected_at: selected.collected_at,
      location: selected.location.trim(),
      customer_site: selected.customer_site?.trim() || null,
      site_id: selected.site_id || null,
      description_of_work: selected.description_of_work.trim(),
      suspected_contents: selected.suspected_contents.trim(),
      collector_name: selected.collector_name?.trim() || null,
      field_notes: selected.field_notes?.trim() || null,
      sample_matrix: selected.sample_matrix?.trim() || null,
      priority: selected.priority,
    }, 'Field information saved.')
  }

  const saveDisposalInfo = async () => {
    if (!selected) return
    await savePatch({
      disposal_destination: selected.disposal_destination?.trim() || null,
      disposed_at: selected.disposal_destination ? selected.disposed_at : null,
    }, 'Disposal information saved.')
  }

  const saveLabInfo = async () => {
    if (!selected) return
    await savePatch({
      received_at: selected.received_at,
      received_by: selected.received_by?.trim() || null,
      lab_name: selected.lab_name?.trim() || null,
      lab_submission_number: selected.lab_submission_number?.trim() || null,
      submitted_at: selected.submitted_at,
      results_received_at: selected.results_received_at,
      confirmed_material: selected.confirmed_material?.trim() || null,
      final_determination: selected.confirmed_material?.trim() || selected.final_determination?.trim() || null,
      lab_notes: selected.lab_notes?.trim() || null,
    }, 'Mallard and lab information saved.')
  }

  const updateStatus = async (target: SampleStatus) => {
    if (!selected) return
    const actor = actorName.trim()
    if (!actor) {
      setMessage({ type: 'error', text: 'Enter your name before changing sample status.' })
      return
    }
    localStorage.setItem(ACTOR_KEY, actor)
    const patch: Record<string, unknown> = { status: target }
    const now = new Date().toISOString()
    if (target === 'received' && !selected.received_at) {
      patch.received_at = now
      patch.received_by = actor
    }
    if (target === 'submitted' && !selected.submitted_at) patch.submitted_at = now
    if (target === 'results_received' && !selected.results_received_at) patch.results_received_at = now
    await savePatch(patch, `Sample ${selected.sample_code} is now ${statusLabels[target]}.`)
  }

  const saveTestResults = async () => {
    if (!selected) return
    setSaving(true)
    try {
      if (deletedResultIds.length) {
        const deletion = await db.from('mallard_test_results').delete().in('id', deletedResultIds)
        if (deletion.error) throw deletion.error
      }
      for (let index = 0; index < testResults.length; index += 1) {
        const row = testResults[index]
        if (!row.test_name.trim()) continue
        const payload = {
          sample_id: selected.id,
          test_name: row.test_name.trim(),
          result_value: row.result_value.trim() || null,
          unit: row.unit.trim() || null,
          qualifier: row.qualifier.trim() || null,
          method: row.method.trim() || null,
          reporting_limit: row.reporting_limit.trim() || null,
          detection_limit: row.detection_limit.trim() || null,
          flag: row.flag.trim() || null,
          notes: row.notes.trim() || null,
          sort_order: index,
          source_attachment_id: row.source_attachment_id || null,
          parse_confidence: row.parse_confidence ?? null,
          source_page: row.source_page ?? null,
          source_bbox: row.source_bbox || null,
        }
        const response = row.id
          ? await db.from('mallard_test_results').update(payload).eq('id', row.id)
          : await db.from('mallard_test_results').insert(payload)
        if (response.error) throw response.error
      }
      setMessage({ type: 'success', text: 'Test results saved.' })
      await openSample(selected.id, 'none')
    } catch (error: any) {
      setMessage({ type: 'error', text: `Could not save test results: ${error.message || 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  const uploadTestFiles = async (fileList: FileList | null) => {
    if (!selected || !fileList?.length) return
    if (!navigator.onLine) {
      setMessage({ type: 'error', text: 'A connection is required to upload test paperwork.' })
      return
    }

    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    const files = Array.from(fileList)
    const bad = files.find((file) => !allowed.has(file.type) || file.size > 15 * 1024 * 1024)
    if (bad) {
      setMessage({ type: 'error', text: 'Use PDF, JPG, PNG or WebP files up to 15 MB each.' })
      return
    }

    setAttachmentBusy(true)
    let candidateFields = 0
    let candidateRows = 0
    let firstReview: { attachment: TestAttachment; document: ParsedLabDocument } | null = null

    try {
      const profileResponse = await db.from('mallard_document_profiles').select(
        'fingerprint, document_type, lab_name, field_aliases, field_positions, column_aliases',
      )
      const profiles = profileResponse.error ? [] : (profileResponse.data || []) as MallardDocumentProfile[]

      for (const file of files) {
        setAttachmentProgress(`Uploading ${file.name}…`)
        setAttachmentProgressValue(0.03)
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'test-file'
        const storagePath = `${selected.id}/${crypto.randomUUID()}-${safeName}`
        const upload = await db.storage.from('mallard-test-files').upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        })
        if (upload.error) throw upload.error

        const attachmentInsert = await db.from('mallard_sample_attachments').insert({
          sample_id: selected.id,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          parse_status: 'processing',
          review_status: 'unreviewed',
        }).select('*').single()

        if (attachmentInsert.error) {
          await db.storage.from('mallard-test-files').remove([storagePath])
          throw attachmentInsert.error
        }

        const attachment = attachmentInsert.data as TestAttachment
        try {
          const parsed = await parseLabDocument(file, (label, progress) => {
            setAttachmentProgress(label)
            if (typeof progress === 'number') setAttachmentProgressValue(progress)
          }, profiles)

          candidateFields += parsed.fields.length
          candidateRows += parsed.rows.length
          const hasCandidates = parsed.fields.length > 0 || parsed.rows.length > 0 || parsed.requested_analyses.length > 0
          const attachmentPatch = {
            parse_status: hasCandidates ? 'needs_review' : 'needs_review',
            parse_method: parsed.method,
            parsed_line_count: parsed.rows.length,
            extracted_text: parsed.text.slice(0, 100000),
            document_type: parsed.document_type,
            document_confidence: parsed.document_confidence,
            parser_version: parsed.parser_version,
            layout_fingerprint: parsed.fingerprint,
            extraction_json: parsed,
            review_status: 'unreviewed',
            parse_error: hasCandidates ? null : 'No confident fields or result rows were identified. Review the source manually.',
            parsed_at: new Date().toISOString(),
          }
          const attachmentUpdate = await db.from('mallard_sample_attachments').update(attachmentPatch).eq('id', attachment.id)
          if (attachmentUpdate.error) throw attachmentUpdate.error

          if (!firstReview) {
            firstReview = {
              attachment: {
                ...attachment,
                ...attachmentPatch,
                document_confidence: parsed.document_confidence,
                extraction_json: parsed,
                review_json: null,
                reviewed_at: null,
              } as TestAttachment,
              document: parsed,
            }
          }
        } catch (parseError: any) {
          await db.from('mallard_sample_attachments').update({
            parse_status: 'failed',
            parse_error: String(parseError?.message || 'Could not read this document').slice(0, 1200),
            parsed_at: new Date().toISOString(),
          }).eq('id', attachment.id)
        }
      }

      await openSample(selected.id, 'none')
      if (firstReview) {
        setReviewAttachment(firstReview.attachment)
        setReviewDocument(firstReview.document)
      }
      setMessage({
        type: firstReview ? 'success' : 'info',
        text: firstReview
          ? `Document read. Mallard found ${candidateFields} field${candidateFields === 1 ? '' : 's'} and ${candidateRows} result row${candidateRows === 1 ? '' : 's'}. Review them before anything is applied.`
          : 'The file was saved, but automatic reading failed. You can still open it and enter information manually.',
      })
    } catch (error: any) {
      setMessage({ type: 'error', text: `Could not upload test paperwork: ${error?.message || 'Unknown error'}` })
    } finally {
      setAttachmentBusy(false)
      setAttachmentProgress('')
      setAttachmentProgressValue(0)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ''
    }
  }

  const openAttachmentReview = (attachment: TestAttachment) => {
    if (!attachment.extraction_json || !isParsedDocument(attachment.extraction_json)) {
      setMessage({ type: 'info', text: 'This older upload does not contain a structured extraction to review.' })
      return
    }
    setReviewAttachment(attachment)
    setReviewDocument(attachment.extraction_json)
  }

  const applyDocumentReview = async (review: MallardDocumentReviewResult) => {
    if (!selected || !reviewAttachment || !reviewDocument) return
    setAttachmentBusy(true)

    try {
      const selectedFields = review.fields.filter((field) => field.apply)
      const selectedRows = review.rows.filter((row) => row.apply && row.test_name.trim())
      const values = new Map<DocumentFieldKey, string>(
        selectedFields.map((field) => [field.key, field.value.trim()] as [DocumentFieldKey, string]),
      )
      const samplePatch: Record<string, unknown> = {}

      if (values.has('sample_type')) samplePatch.sample_matrix = normalizeImportedMatrix(values.get('sample_type') || '')
      if (values.has('collected_by')) samplePatch.collector_name = values.get('collected_by') || null
      if (values.has('location')) samplePatch.location = values.get('location') || selected.location
      if (values.has('work_description')) samplePatch.description_of_work = values.get('work_description') || selected.description_of_work
      if (values.has('suspected_contents')) samplePatch.suspected_contents = values.get('suspected_contents') || selected.suspected_contents
      if (values.has('field_observations')) {
        const imported = values.get('field_observations') || ''
        samplePatch.field_notes = selected.field_notes && selected.field_notes.trim() !== imported
          ? `${selected.field_notes.trim()}\n\nImported field observations: ${imported}`
          : imported || selected.field_notes
      }
      if (values.has('lab_name')) samplePatch.lab_name = values.get('lab_name') || null
      if (values.has('lab_number')) samplePatch.lab_submission_number = values.get('lab_number') || null
      if (values.has('received_by')) samplePatch.received_by = values.get('received_by') || null
      if (values.has('received_date')) {
        const received = parseDocumentDate(values.get('received_date') || '')
        if (received) samplePatch.received_at = received
      }
      if (values.has('collection_date')) {
        const collected = parseDocumentDate(
          values.get('collection_date') || '',
          values.get('collection_time') || undefined,
        )
        if (collected) samplePatch.collected_at = collected
      }
      samplePatch.last_updated_by = actorName.trim() || selected.collector_name || 'Mallard document review'

      if (Object.keys(samplePatch).length > 1) {
        const sampleUpdate = await db.from('mallard_samples').update(samplePatch).eq('id', selected.id)
        if (sampleUpdate.error) throw sampleUpdate.error
      }

      const existingKeys = new Set(
        testResults.map((row) => `${row.test_name.trim().toLowerCase()}|${row.result_value.trim().toLowerCase()}|${row.unit.trim().toLowerCase()}`),
      )
      const resultPayloads = selectedRows.flatMap((row, index) => {
        const key = `${row.test_name.trim().toLowerCase()}|${row.result_value.trim().toLowerCase()}|${row.unit.trim().toLowerCase()}`
        if (existingKeys.has(key)) return []
        existingKeys.add(key)
        return [{
          sample_id: selected.id,
          test_name: row.test_name.trim(),
          result_value: row.result_value.trim() || null,
          unit: row.unit.trim() || null,
          qualifier: row.qualifier.trim() || null,
          method: row.method.trim() || null,
          reporting_limit: row.reporting_limit.trim() || null,
          detection_limit: row.detection_limit.trim() || null,
          flag: row.flag.trim() || null,
          notes: row.notes.trim() || null,
          sort_order: testResults.length + index,
          source_attachment_id: reviewAttachment.id,
          parse_confidence: row.confidence,
          source_page: row.source_page,
          source_bbox: row.source_bbox,
        }]
      })

      if (resultPayloads.length) {
        const resultInsert = await db.from('mallard_test_results').insert(resultPayloads)
        if (resultInsert.error) throw resultInsert.error
      }

      const reviewJson = {
        corrected: review.corrected,
        applied_fields: selectedFields.map((field) => ({
          key: field.key,
          value: field.value,
          confidence: field.confidence,
          page: field.page,
        })),
        applied_results: resultPayloads.length,
        reviewed_at: new Date().toISOString(),
      }
      const reviewedAt = new Date().toISOString()
      const attachmentUpdate = await db.from('mallard_sample_attachments').update({
        parse_status: 'parsed',
        parsed_line_count: resultPayloads.length,
        review_status: review.corrected ? 'corrected' : 'reviewed',
        review_json: reviewJson,
        reviewed_at: reviewedAt,
        parse_error: null,
      }).eq('id', reviewAttachment.id)
      if (attachmentUpdate.error) throw attachmentUpdate.error

      const learning = buildProfileLearningPayload(reviewDocument)
      for (const field of review.fields) {
        if (field.value.trim() !== field.original_value.trim()) {
          delete learning.field_positions[field.key]
        }
      }
      const existingProfileResponse = await db.from('mallard_document_profiles')
        .select('*')
        .eq('fingerprint', learning.fingerprint)
        .maybeSingle()

      const existingProfile = existingProfileResponse.data
      const profilePayload = {
        ...learning,
        field_aliases: mergeAliasMaps(existingProfile?.field_aliases, learning.field_aliases),
        field_positions: { ...(existingProfile?.field_positions || {}), ...(learning.field_positions || {}) },
        column_aliases: mergeAliasMaps(existingProfile?.column_aliases, learning.column_aliases),
        times_seen: Number(existingProfile?.times_seen || 0) + 1,
        correction_count: Number(existingProfile?.correction_count || 0) + (review.corrected ? 1 : 0),
        last_seen_at: reviewedAt,
      }
      const profileWrite = await db.from('mallard_document_profiles').upsert(profilePayload, { onConflict: 'fingerprint' })
      if (profileWrite.error) throw profileWrite.error

      await db.from('mallard_sample_events').insert({
        sample_id: selected.id,
        event_type: 'attachment_reviewed',
        actor_name: actorName.trim() || selected.collector_name || 'Mallard',
        note: `Reviewed ${reviewAttachment.original_name}: applied ${selectedFields.length} field(s) and ${resultPayloads.length} result row(s).`,
      })

      const sampleId = selected.id
      setReviewAttachment(null)
      setReviewDocument(null)
      await openSample(sampleId, 'none')
      await loadSamples()
      setMessage({
        type: 'success',
        text: `Document approved. Applied ${selectedFields.length} field${selectedFields.length === 1 ? '' : 's'} and ${resultPayloads.length} new result row${resultPayloads.length === 1 ? '' : 's'}.`,
      })
    } catch (error: any) {
      setMessage({ type: 'error', text: `Could not apply document review: ${error?.message || 'Unknown error'}` })
    } finally {
      setAttachmentBusy(false)
    }
  }

  const openAttachment = async (attachment: TestAttachment) => {
    const popup = window.open('', '_blank')
    const { data, error } = await db.storage.from('mallard-test-files').createSignedUrl(attachment.storage_path, 900)
    if (error || !data?.signedUrl) {
      popup?.close()
      setMessage({ type: 'error', text: error?.message || 'Could not open that file.' })
      return
    }
    if (popup) {
      popup.opener = null
      popup.location.href = data.signedUrl
    } else {
      window.location.href = data.signedUrl
    }
  }

  const deleteAttachment = async (attachment: TestAttachment) => {
    if (!selected) return
    if (!window.confirm(`Delete ${attachment.original_name}?\n\nThe uploaded file will be permanently removed. Any test rows already imported from it will stay in the test table.`)) return
    setAttachmentBusy(true)
    const storageDelete = await db.storage.from('mallard-test-files').remove([attachment.storage_path])
    if (storageDelete.error) {
      setAttachmentBusy(false)
      setMessage({ type: 'error', text: `Could not delete file: ${storageDelete.error.message}` })
      return
    }
    const metadataDelete = await db.from('mallard_sample_attachments').delete().eq('id', attachment.id)
    setAttachmentBusy(false)
    if (metadataDelete.error) {
      setMessage({ type: 'error', text: `File was removed but its attachment record could not be cleared: ${metadataDelete.error.message}` })
      return
    }
    await openSample(selected.id, 'none')
    setMessage({ type: 'success', text: 'Test attachment deleted. Imported test rows were kept.' })
  }

  const archiveSample = async () => {
    if (!selected) return
    if (!window.confirm(`Archive sample ${selected.sample_code}? It will leave the active sample list, but its sample code will stay reserved.`)) return
    const { data, error } = await db.from('mallard_samples')
      .update({ archived: true, last_updated_by: actorName.trim() || selected.collector_name || 'Mallard' })
      .eq('id', selected.id)
      .eq('revision', selected.revision)
      .select('id')
      .maybeSingle()
    if (error || !data) {
      setMessage({ type: 'error', text: error?.message || 'This record changed before it could be archived.' })
      return
    }
    setSelected(null)
    navigateView('samples', { replace: true })
    await loadSamples()
    setMessage({ type: 'success', text: 'Sample archived.' })
  }

  const deleteSample = async () => {
    if (!selected) return
    const confirmed = window.confirm(
      `Permanently delete sample ${selected.sample_code}?\n\nThis deletes the sample, its uploaded test files, lab results and active history. A deletion audit snapshot is retained.\n\nSample code ${selected.sample_code} will become available for reuse. Archived samples keep their codes reserved.`
    )
    if (!confirmed) return
    setSaving(true)
    if (attachments.length) {
      const fileDelete = await db.storage.from('mallard-test-files').remove(attachments.map((item) => item.storage_path))
      if (fileDelete.error) {
        setSaving(false)
        setMessage({ type: 'error', text: `Could not delete the sample files: ${fileDelete.error.message}` })
        return
      }
    }
    const { data, error } = await db.from('mallard_samples').delete().eq('id', selected.id).select('id')
    setSaving(false)
    if (error || !data || data.length !== 1) {
      setMessage({ type: 'error', text: error?.message || 'The sample was not deleted. Refresh and try again.' })
      return
    }
    setSelected(null)
    navigateView('samples', { replace: true })
    await loadSamples()
    setMessage({ type: 'success', text: `Sample ${selected.sample_code} permanently deleted. Code ${selected.sample_code} is available for reuse, with deletion history retained.` })
  }

  const exportCsv = () => {
    const headers = ['Sample Code', 'Classification Code', 'Classification', 'Group', 'Section', 'Status', 'Priority', 'Collection Date', 'Location', 'Customer / Site', 'Matrix', 'Description of Work', 'Suspected Material', 'Confirmed Material', 'Collector', 'Dump Location', 'Dump Date', 'Lab', 'Lab Submission']
    const rows = samples.map((sample) => {
      const classification = classificationByCode.get(sample.classification_code)
      return [
        sample.sample_code,
        sample.classification_code,
        classification?.name || '',
        classification?.group_name || categoryInfo[sample.category].label,
        classification?.section_name || '',
        statusLabels[sample.status],
        sample.priority ? 'Yes' : 'No',
        toDateValue(sample.collected_at),
        sample.location,
        sample.customer_site,
        sample.sample_matrix,
        sample.description_of_work,
        sample.suspected_contents,
        sample.confirmed_material,
        sample.collector_name,
        sample.disposal_destination,
        sample.disposed_at ? toDateValue(sample.disposed_at) : '',
        sample.lab_name,
        sample.lab_submission_number,
      ]
    })
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mallard-samples-${todayForInput()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const filteredSamples = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return samples.filter((sample) => {
      if (categoryFilter !== 'all' && sample.category !== categoryFilter) return false
      if (statusFilter !== 'all' && sample.status !== statusFilter) return false
      if (disposalFilter === 'undumped' && sample.disposal_destination) return false
      if (disposalFilter !== 'all' && disposalFilter !== 'undumped' && sample.disposal_destination !== disposalFilter) return false
      if (!normalized) return true
      const haystack = [
        sample.sample_code,
        sample.sample_number,
        classificationByCode.get(sample.classification_code)?.name,
        classificationByCode.get(sample.classification_code)?.section_name,
        categoryInfo[sample.category].label,
        statusLabels[sample.status],
        sample.location,
        sample.customer_site,
        sample.sample_matrix,
        sample.description_of_work,
        sample.suspected_contents,
        sample.confirmed_material,
        sample.collector_name,
        sample.disposal_destination,
        sample.lab_name,
        sample.lab_submission_number,
        sample.confirmed_material,
        sample.final_determination,
      ].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [samples, query, categoryFilter, statusFilter, disposalFilter])

  const stats = React.useMemo(() => ({
    total: samples.length,
    toDeliver: samples.filter((sample) => ['collected', 'with_driver'].includes(sample.status)).length,
    awaitingDisposal: samples.filter((sample) => !sample.disposal_destination).length,
    complete: samples.filter((sample) => sample.status === 'complete').length,
  }), [samples])

  const addTestResult = () => setTestResults((rows) => [...rows, { test_name: '', result_value: '', unit: '', qualifier: '', method: '', reporting_limit: '', detection_limit: '', flag: '', notes: '', sort_order: rows.length }])
  const removeTestResult = (index: number) => {
    const row = testResults[index]
    if (row.id) setDeletedResultIds((ids) => [...ids, row.id!])
    setTestResults((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
  }
  const quickTargets: SampleStatus[] = selected
    ? statusOrder.slice(statusOrder.indexOf(selected.status) + 1, statusOrder.indexOf(selected.status) + 3)
    : []

  return (
    <>
      <div className={`mallard-v3-app ${view === 'picker' ? 'picker-active' : ''}`}>
        <header className="mallard-v3-header">
          <div className="mallard-v3-brand">
            <img src="/icons/mallard-icon.svg" alt="" />
            <div><p>Mallard Environmental</p><h1>Sample Tracker</h1></div>
          </div>
          <div className={`mallard-v3-connection ${online ? 'online' : 'offline'}`}>
            {online ? <CheckCircle2 size={15} /> : <WifiOff size={15} />}
            {online ? 'Live' : 'Draft mode'}
          </div>
        </header>

        {message && <div className={`mallard-v3-toast ${message.type}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss"><X size={18} /></button></div>}

        {view === 'dashboard' && (
          <main className="mallard-v3-main">
            <section className="mallard-v3-hero sample-start-hero">
              <div>
                <span className="eyebrow">Fast field entry</span>
                <h2>Start a new sample</h2>
                <p>Choose the main category first. Mallard will narrow it down to the section and exact sample type.</p>
                <div className="mallard-v3-admin-links">
                  <button className="secondary" type="button" onClick={() => navigateView('classifications')}>Classification Manager</button>
                  <button className="secondary" type="button" onClick={() => navigateView('sites')}>Site Manager</button>
                </div>
              </div>
              <div className="sample-picker-grid category-step">
                {pickerGroups.map((group) => {
                  const typeCount = activeClassifications.filter((item) => item.group_name === group).length
                  const sectionCount = new Set(activeClassifications.filter((item) => item.group_name === group).map((item) => item.section_name)).size
                  return (
                    <button type="button" key={group} className={`sample-picker-card category-card ${toneForGroup(group)}`} onClick={() => openSamplePicker(group, 'new')}>
                      <div><span className="picker-range">{rangeForGroup(group)}</span><strong>{group}</strong><small>{sectionCount} section{sectionCount === 1 ? '' : 's'} · {typeCount} sample type{typeCount === 1 ? '' : 's'}</small></div>
                      <ChevronRight size={24} />
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="mallard-v3-quick-search">
              <Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') navigateView('samples') }} placeholder="Search code, site, material or dump location" /><button type="button" onClick={() => navigateView('samples')}>Search</button>
            </section>

            <section className="mallard-v3-stats">
              <button type="button" onClick={() => { setStatusFilter('all'); navigateView('samples') }}><span>Active</span><strong>{stats.total}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('collected'); navigateView('samples') }}><span>To deliver</span><strong>{stats.toDeliver}</strong></button>
              <button type="button" onClick={() => { setDisposalFilter('undumped'); navigateView('samples') }}><span>No dump site</span><strong>{stats.awaitingDisposal}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('complete'); navigateView('samples') }}><span>Complete</span><strong>{stats.complete}</strong></button>
            </section>

            {drafts.length > 0 && (
              <section className="mallard-v3-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">This device</span><h2>Saved drafts</h2></div><span className="count">{drafts.length}</span></div>
                <div className="mallard-v3-drafts">
                  {drafts.map((draft) => <div key={draft.id}><button type="button" onClick={() => resumeDraft(draft)}><strong>{classificationByCode.get(draft.form.classification_code || 201)?.name || 'Sample'}</strong><span>{draft.form.location || 'Location not entered'} · {formatDate(draft.saved_at)}</span></button><button className="icon-danger" type="button" onClick={() => discardDraft(draft.id)} aria-label="Delete draft"><Trash2 size={18} /></button></div>)}
                </div>
              </section>
            )}

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Database</span><h2>Recent samples</h2></div><button className="link" type="button" onClick={() => navigateView('samples')}>View all</button></div>
              {loading ? <div className="empty">Loading samples...</div> : samples.length === 0 ? <div className="empty">No samples yet.</div> : <div className="mallard-v3-sample-list">{samples.slice(0, 6).map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}</div>}
            </section>
          </main>
        )}

        {view === 'samples' && (
          <main className="mallard-v3-main">
            <div className="mallard-v3-page-heading"><div><span className="eyebrow">Sample database</span><h2>Samples</h2></div><div><button className="secondary" type="button" onClick={exportCsv}><Download size={18} /> Export</button><button className="primary" type="button" onClick={() => openSamplePicker(null, 'new')}><Plus size={18} /> New</button></div></div>
            <section className="mallard-v3-filters">
              <label className="search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search samples" /></label>
              <div>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as any)}><option value="all">All groups</option><option value="non_oilfield">Non Oilfield</option><option value="oilfield">Oilfield</option><option value="odd_weird">Other / Specialty</option></select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}><option value="all">All statuses</option>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select>
                <select value={disposalFilter} onChange={(event) => setDisposalFilter(event.target.value)}><option value="all">All dump sites</option><option value="undumped">Not entered</option>{disposalSuggestions.map((facility) => <option key={facility} value={facility}>{facility}</option>)}</select>
                <button className="secondary square" type="button" onClick={() => void loadSamples()} aria-label="Refresh"><RefreshCw size={18} /></button>
              </div>
            </section>
            <p className="results-count">Showing {filteredSamples.length} of {samples.length}</p>
            {loading ? <div className="empty">Loading...</div> : filteredSamples.length === 0 ? <div className="empty">No samples match.</div> : <div className="mallard-v3-sample-list">{filteredSamples.map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}</div>}
          </main>
        )}

        {view === 'picker' && (
          <main className="mallard-v3-main narrow sample-flow-page">
            <div className="sample-flow-topbar">
              <button className="sample-flow-back" type="button" onClick={goBack} aria-label="Go back"><ChevronLeft size={22} /></button>
              <div className="sample-flow-progress" aria-label={`Step ${!pickerGroup ? 1 : !pickerSection ? 2 : 3} of 3`}>
                <span>Step {!pickerGroup ? 1 : !pickerSection ? 2 : 3} of 3</span>
                <div><i style={{ width: `${(!pickerGroup ? 1 : !pickerSection ? 2 : 3) * 33.333}%` }} /></div>
              </div>
              <div className="sample-flow-top-spacer" />
            </div>

            {!pickerGroup && (
              <>
                <section className="sample-flow-intro">
                  <span className="eyebrow">New sample</span>
                  <h2>Choose a category</h2>
                  <p>Start with where the material came from.</p>
                </section>
                <div className="sample-flow-options">
                  {pickerGroups.map((group) => {
                    const typeCount = activeClassifications.filter((item) => item.group_name === group).length
                    const sectionCount = new Set(activeClassifications.filter((item) => item.group_name === group).map((item) => item.section_name)).size
                    const Icon = group === 'Oilfield' ? Factory : group === 'Non Oilfield' ? Building2 : Boxes
                    return (
                      <button key={group} type="button" className={`sample-flow-option category ${toneForGroup(group)}`} onClick={() => navigateView('picker', { group, section: null, mode: pickerMode })}>
                        <span className="sample-flow-icon"><Icon size={25} /></span>
                        <span className="sample-flow-copy">
                          <span className="sample-flow-label"><strong>{group}</strong><em>{rangeForGroup(group)}</em></span>
                          <span className="sample-flow-description">{descriptionForGroup(group)}</span>
                          <small>{sectionCount} section{sectionCount === 1 ? '' : 's'} · {typeCount} sample type{typeCount === 1 ? '' : 's'}</small>
                        </span>
                        <ChevronRight className="sample-flow-chevron" size={22} />
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {pickerGroup && !pickerSection && (
              <>
                <section className="sample-flow-intro">
                  <span className="sample-flow-breadcrumb">{pickerGroup}</span>
                  <h2>Choose a section</h2>
                  <p>Pick the area that best matches the material you collected.</p>
                </section>
                <div className="sample-flow-options sections">
                  {pickerSections.map((section) => {
                    const types = activeClassifications.filter((item) => item.group_name === pickerGroup && item.section_name === section)
                    return (
                      <button key={section} type="button" className={`sample-flow-option section ${toneForGroup(pickerGroup)}`} onClick={() => navigateView('picker', { group: pickerGroup, section, mode: pickerMode })}>
                        <span className="sample-flow-copy">
                          <strong>{section}</strong>
                          <span className="sample-flow-description">{types.map((item) => item.name).slice(0, 3).join(' · ')}</span>
                          <small>{types.length} sample type{types.length === 1 ? '' : 's'}</small>
                        </span>
                        <ChevronRight className="sample-flow-chevron" size={22} />
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {pickerGroup && pickerSection && (
              <>
                <section className="sample-flow-intro">
                  <span className="sample-flow-breadcrumb">{pickerGroup} <ChevronRight size={13} /> {pickerSection}</span>
                  <h2>Select the sample type</h2>
                  <p>The next available bottle ID is shown below.</p>
                </section>
                <div className="sample-flow-options types">
                  {pickerTypes.map((classification) => (
                    <button key={classification.code} type="button" className={`sample-flow-option sample-type ${toneForCode(classification.code)}`} onClick={() => choosePickerClassification(classification)}>
                      <span className="sample-flow-code">{classification.code}</span>
                      <span className="sample-flow-copy">
                        <strong>{classification.name}</strong>
                        <small>Next bottle <b>{nextCodeByClassification.get(classification.code) || `${classification.code}-????`}</b></small>
                      </span>
                      <ChevronRight className="sample-flow-chevron" size={22} />
                    </button>
                  ))}
                </div>
                {pickerTypes.length === 0 && <div className="empty">No active sample types are assigned to this section.</div>}

                {!quickClassificationOpen ? (
                  <button
                    className="sample-flow-add-classification"
                    type="button"
                    onClick={() => {
                      setQuickClassificationEditor({ name: '', section_name: pickerSection || 'General', description: '' })
                      setQuickClassificationOpen(true)
                    }}
                  >
                    <Plus size={19} />
                    <span><strong>Sample type not listed?</strong><small>Add a new classification without leaving this sample.</small></span>
                  </button>
                ) : (
                  <form className="mallard-v3-panel quick-classification-form" onSubmit={saveQuickClassification}>
                    <div className="mallard-v3-heading">
                      <div><span className="eyebrow">New classification</span><h2>Add and use it now</h2></div>
                      <button className="link" type="button" onClick={() => setQuickClassificationOpen(false)}>Cancel</button>
                    </div>
                    <div className="quick-classification-meta">
                      <div><span>Category</span><strong>{pickerGroup}</strong></div>
                      <div><span>Code</span><strong>{quickClassificationCodePreview ?? 'Full'}</strong><small>Assigned automatically</small></div>
                    </div>
                    <label><span>Section *</span><input list="mallard-quick-classification-sections" value={quickClassificationEditor.section_name} onChange={(event) => setQuickClassificationEditor({ ...quickClassificationEditor, section_name: event.target.value })} placeholder="Production Fluids" /></label>
                    <datalist id="mallard-quick-classification-sections">{Array.from(new Set(classifications.filter((item) => item.group_name === pickerGroup).map((item) => item.section_name))).sort().map((section) => <option key={section} value={section} />)}</datalist>
                    <label><span>Sample type name *</span><input autoFocus value={quickClassificationEditor.name} onChange={(event) => setQuickClassificationEditor({ ...quickClassificationEditor, name: event.target.value })} placeholder="e.g. Drilling mud" /></label>
                    <label><span>Description</span><textarea rows={2} value={quickClassificationEditor.description} onChange={(event) => setQuickClassificationEditor({ ...quickClassificationEditor, description: event.target.value })} placeholder="Optional internal description" /></label>
                    <button className="primary" type="submit" disabled={saving || quickClassificationCodePreview == null}><Plus size={17} /> {saving ? 'Adding...' : 'Add classification and continue'}</button>
                  </form>
                )}
              </>
            )}
          </main>
        )}

        {view === 'new' && (
          <main className="mallard-v3-main narrow">
            <button className="back" type="button" onClick={goBack}><ChevronLeft size={18} /> Back</button>
            <div className="mallard-v3-page-heading">
              <div>
                <span className="eyebrow">New sample</span>
                <h2>{classificationByCode.get(newForm.classification_code)?.name || 'Select classification'}</h2>
                <p>Expected bottle <strong>{nextCodeByClassification.get(newForm.classification_code) || `${newForm.classification_code}-????`}</strong></p>
              </div>
            </div>
            <form className="mallard-v3-form" onSubmit={createSample}>
              <section className="mallard-v3-panel classification-selected-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Classification</span><h2>Selected sample type</h2></div><button className="secondary" type="button" onClick={changeCurrentClassification}>Change</button></div>
                {(() => {
                  const classification = classificationByCode.get(newForm.classification_code)
                  return <div className={`selected-classification ${toneForCode(newForm.classification_code)}`}><div className="selected-classification-code">{newForm.classification_code}</div><div><strong>{classification?.name || 'Sample'}</strong><span>{classification?.group_name || categoryInfo[categoryFromCode(newForm.classification_code)].label} · {classification?.section_name || 'General'}</span><small>Next bottle: {nextCodeByClassification.get(newForm.classification_code) || `${newForm.classification_code}-????`}</small></div></div>
                })()}
              </section>

              <section className="mallard-v3-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Site</span><h2>Where was it collected?</h2></div><button className="link" type="button" onClick={() => navigateView('sites')}>Manage sites</button></div>
                <label><span>Reusable site</span>
                  <select value={newForm.site_id} onChange={(event) => chooseSiteForForm(event.target.value)}>
                    <option value="">Enter location manually</option>
                    {sites.filter((site) => site.active).map((site) => <option key={site.id} value={site.id}>{[site.customer, site.site_name, site.lsd || site.uwi].filter(Boolean).join(' · ')}</option>)}
                  </select>
                </label>
                {newForm.site_id && (() => { const site = sites.find((item) => item.id === newForm.site_id); return site ? <div className="site-summary"><strong>{site.site_name}</strong><span>{[site.customer, site.lsd, site.uwi].filter(Boolean).join(' · ')}</span>{site.access_directions && <small>{site.access_directions}</small>}</div> : null })()}
              </section>

              <section className="mallard-v3-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Collection</span><h2>Sample details</h2></div></div>
                <div className="grid two"><label><span>Collection date *</span><input type="date" required value={newForm.collected_date} onChange={(event) => setNewForm({ ...newForm, collected_date: event.target.value })} /></label><label><span>Collected by</span><input value={newForm.collector_name} onChange={(event) => setNewForm({ ...newForm, collector_name: event.target.value })} placeholder="Your name" /></label></div>
                <label><span>Location *</span><input required value={newForm.location} onChange={(event) => setNewForm({ ...newForm, location: event.target.value, site_id: '' })} placeholder="Lease, facility, address, LSD or site" /></label>
                <label><span>Company / customer</span><input value={newForm.customer_site} onChange={(event) => setNewForm({ ...newForm, customer_site: event.target.value })} placeholder="Company responsible for the sample" /></label>
                <div className="grid two"><label><span>Sample matrix</span><select value={newForm.sample_matrix} onChange={(event) => setNewForm({ ...newForm, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="check"><input type="checkbox" checked={newForm.priority} onChange={(event) => setNewForm({ ...newForm, priority: event.target.checked })} /><span><strong>Priority</strong><small>Flag for attention</small></span></label></div>
                <label><span>Description of work *</span><textarea required rows={2} value={newForm.description_of_work} onChange={(event) => setNewForm({ ...newForm, description_of_work: event.target.value })} placeholder="What work was being done?" /></label>
                <label><span>Suspected material *</span><textarea required rows={2} value={newForm.suspected_contents} onChange={(event) => setNewForm({ ...newForm, suspected_contents: event.target.value })} placeholder="Oily water, produced water, glycol, unknown liquid..." /></label>
                <label><span>Field notes</span><textarea rows={2} value={newForm.field_notes} onChange={(event) => setNewForm({ ...newForm, field_notes: event.target.value })} placeholder="Colour, smell, layers or anything unusual" /></label>
              </section>

              <section className="mallard-v3-panel disposal">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Disposal</span><h2>Where was it dumped?</h2></div></div>
                <div className="facility-pills">{disposalSuggestions.map((facility) => <button type="button" className={newForm.disposal_destination === facility ? 'active' : ''} key={facility} onClick={() => setNewForm({ ...newForm, disposal_destination: facility })}>{facility}</button>)}<button type="button" className={!newForm.disposal_destination ? 'active muted' : 'muted'} onClick={() => setNewForm({ ...newForm, disposal_destination: '', disposal_date: '' })}>Not dumped yet</button></div>
                <div className="grid two"><label><span>Dump location</span><input list="mallard-disposal-facilities-new" value={newForm.disposal_destination} onChange={(event) => setNewForm({ ...newForm, disposal_destination: event.target.value })} placeholder="Optional" /></label><label><span>Dump date</span><input type="date" disabled={!newForm.disposal_destination} value={newForm.disposal_date} onChange={(event) => setNewForm({ ...newForm, disposal_date: event.target.value })} /></label></div>
                <datalist id="mallard-disposal-facilities-new">{disposalSuggestions.map((facility) => <option value={facility} key={facility} />)}</datalist>
              </section>

              <div className="mallard-v3-assignment"><span>Expected bottle</span><strong>{nextCodeByClassification.get(newForm.classification_code) || `${newForm.classification_code}-????`}</strong><small>Confirmed when saved</small></div>
              <div className="mallard-v3-sticky-actions"><button className="secondary" type="button" onClick={saveDraft}><Save size={18} /> Draft</button><button className="primary large" type="submit" disabled={saving}>{saving ? 'Creating...' : <><FlaskConical size={19} /> Create sample</>}</button></div>
            </form>
          </main>
        )}

        {view === 'classifications' && (
          <main className="mallard-v3-main narrow">
            <button className="back" type="button" onClick={goBack}><ChevronLeft size={18} /> Home</button>
            <div className="mallard-v3-page-heading"><div><span className="eyebrow">Admin</span><h2>Classification Manager</h2><p>Codes are permanent. Rename or disable them, but a code can never be reused for a different meaning.</p></div></div>
            <form className="mallard-v3-panel mallard-manager-form" onSubmit={saveClassification}>
              <div className="mallard-v3-heading"><div><span className="eyebrow">{editingClassificationCode ? 'Edit classification' : 'New classification'}</span><h2>{editingClassificationCode ? `Code ${editingClassificationCode}` : 'Add sample type'}</h2></div>{editingClassificationCode && <button className="link" type="button" onClick={() => { setEditingClassificationCode(null); setClassificationEditor({ code: '', name: '', group_name: 'Oilfield', section_name: 'General', description: '' }) }}>Cancel</button>}</div>
              <div className="grid two">
                <label><span>Three digit code</span><div className="auto-code-preview"><strong>{editingClassificationCode ?? managerClassificationCodePreview ?? 'Full'}</strong><small>{editingClassificationCode ? 'Permanent code' : 'Mallard assigns this automatically'}</small></div></label>
                <label><span>Category *</span><select disabled={editingClassificationCode !== null} value={classificationEditor.group_name} onChange={(event) => setClassificationEditor({ ...classificationEditor, group_name: event.target.value })}><option>Non Oilfield</option><option>Oilfield</option><option>Other / Specialty</option><option>Future / Custom</option><option>System / Legacy</option></select></label>
              </div>
              <label><span>Section *</span><input list="mallard-classification-sections" value={classificationEditor.section_name} onChange={(event) => setClassificationEditor({ ...classificationEditor, section_name: event.target.value })} placeholder="Production Fluids" /></label>
              <datalist id="mallard-classification-sections">{Array.from(new Set(classifications.filter((item) => item.group_name === classificationEditor.group_name).map((item) => item.section_name))).sort().map((section) => <option key={section} value={section} />)}</datalist>
              <label><span>Sample type name *</span><input value={classificationEditor.name} onChange={(event) => setClassificationEditor({ ...classificationEditor, name: event.target.value })} placeholder="Produced Water" /></label>
              <label><span>Description</span><textarea rows={2} value={classificationEditor.description} onChange={(event) => setClassificationEditor({ ...classificationEditor, description: event.target.value })} placeholder="Optional internal description" /></label>
              <button className="primary" type="submit" disabled={saving || (!editingClassificationCode && managerClassificationCodePreview == null)}><Save size={17} /> {editingClassificationCode ? 'Save changes' : 'Add classification'}</button>
            </form>
            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Codes</span><h2>All classifications</h2></div><span className="count">{classifications.length}</span></div>
              <div className="manager-list">{classifications.map((classification) => <div className={`manager-row ${classification.active ? '' : 'disabled'}`} key={classification.code}><div className={`manager-code ${toneForCode(classification.code)}`}>{classification.code}</div><div className="manager-main"><strong>{classification.name}</strong><span>{classification.group_name} › {classification.section_name}{classification.description ? ` · ${classification.description}` : ''}</span><small>Next: {nextCodeByClassification.get(classification.code) || 'Disabled / unavailable'}</small></div><div className="manager-actions"><button className="secondary" type="button" onClick={() => editClassification(classification)}>Edit</button><button className="secondary" type="button" onClick={() => void toggleClassification(classification)}>{classification.active ? 'Disable' : 'Enable'}</button></div></div>)}</div>
            </section>
          </main>
        )}

        {view === 'sites' && (
          <main className="mallard-v3-main narrow">
            <button className="back" type="button" onClick={goBack}><ChevronLeft size={18} /> Home</button>
            <div className="mallard-v3-page-heading"><div><span className="eyebrow">Reusable records</span><h2>Site Manager</h2><p>Save a site once, then reuse its customer, legal location, GPS, directions and contact details on future samples.</p></div></div>
            <form className="mallard-v3-panel mallard-manager-form" onSubmit={saveSite}>
              <div className="mallard-v3-heading"><div><span className="eyebrow">{siteEditor.id ? 'Edit site' : 'New site'}</span><h2>{siteEditor.id ? siteEditor.site_name : 'Add reusable site'}</h2></div>{siteEditor.id && <button className="link" type="button" onClick={() => setSiteEditor({ id: '', customer: '', site_name: '', lsd: '', uwi: '', latitude: '', longitude: '', access_directions: '', contact_name: '', contact_phone: '', contact_email: '', notes: '' })}>Cancel</button>}</div>
              <div className="grid two"><label><span>Customer</span><input value={siteEditor.customer} onChange={(event) => setSiteEditor({ ...siteEditor, customer: event.target.value })} /></label><label><span>Site name *</span><input required value={siteEditor.site_name} onChange={(event) => setSiteEditor({ ...siteEditor, site_name: event.target.value })} /></label></div>
              <div className="grid two"><label><span>LSD</span><input value={siteEditor.lsd} onChange={(event) => setSiteEditor({ ...siteEditor, lsd: event.target.value })} placeholder="14-15-31-26W4" /></label><label><span>UWI</span><input value={siteEditor.uwi} onChange={(event) => setSiteEditor({ ...siteEditor, uwi: event.target.value })} /></label></div>
              <div className="grid two"><label><span>Latitude</span><input inputMode="decimal" value={siteEditor.latitude} onChange={(event) => setSiteEditor({ ...siteEditor, latitude: event.target.value })} /></label><label><span>Longitude</span><input inputMode="decimal" value={siteEditor.longitude} onChange={(event) => setSiteEditor({ ...siteEditor, longitude: event.target.value })} /></label></div>
              <label><span>Access directions</span><textarea rows={2} value={siteEditor.access_directions} onChange={(event) => setSiteEditor({ ...siteEditor, access_directions: event.target.value })} /></label>
              <div className="grid two"><label><span>Contact name</span><input value={siteEditor.contact_name} onChange={(event) => setSiteEditor({ ...siteEditor, contact_name: event.target.value })} /></label><label><span>Contact phone</span><input value={siteEditor.contact_phone} onChange={(event) => setSiteEditor({ ...siteEditor, contact_phone: event.target.value })} /></label></div>
              <label><span>Contact email</span><input type="email" value={siteEditor.contact_email} onChange={(event) => setSiteEditor({ ...siteEditor, contact_email: event.target.value })} /></label>
              <label><span>Site notes</span><textarea rows={2} value={siteEditor.notes} onChange={(event) => setSiteEditor({ ...siteEditor, notes: event.target.value })} /></label>
              <button className="primary" type="submit" disabled={saving}><Save size={17} /> {siteEditor.id ? 'Save site' : 'Add site'}</button>
            </form>
            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Saved sites</span><h2>Site database</h2></div><span className="count">{sites.length}</span></div>
              <div className="manager-list">{sites.map((site) => <div className={`manager-row site-row ${site.active ? '' : 'disabled'}`} key={site.id}><div className="manager-main"><strong>{site.site_name}</strong><span>{[site.customer, site.lsd, site.uwi].filter(Boolean).join(' · ') || 'No legal location entered'}</span><small>{allSamples.filter((sample) => sample.site_id === site.id).length} historical sample(s){site.contact_name ? ` · ${site.contact_name}` : ''}</small></div><div className="manager-actions"><button className="secondary" type="button" onClick={() => editSite(site)}>Edit</button><button className="secondary" type="button" onClick={() => void toggleSite(site)}>{site.active ? 'Disable' : 'Enable'}</button></div></div>)}</div>
            </section>
          </main>
        )}

        {view === 'detail' && selected && (
          <main className="mallard-v3-main narrow detail">
            <button className="back" type="button" onClick={goBack}><ChevronLeft size={18} /> Samples</button>
            <section className={`mallard-v3-sample-hero ${toneForCode(selected.classification_code)}`}>
              <div><span className="eyebrow">Permanent bottle ID</span><div className="big-number">{selected.sample_code}</div><div className="meta"><span>{selected.classification_code} · {classificationByCode.get(selected.classification_code)?.name || categoryInfo[selected.category].label}</span><span>{classificationByCode.get(selected.classification_code)?.section_name || 'General'}</span><span>{selected.sample_matrix || 'Unknown matrix'}</span></div></div>
              <div className="actions">{selected.priority && <span className="priority">Priority</span>}<span className={`status status-${selected.status}`}>{statusLabels[selected.status]}</span></div>
            </section>

            <section className="mallard-v3-panel bottle-writing-card">
              <div className="mallard-v3-heading">
                <div><span className="eyebrow">Operator bottle marking</span><h2>Write this on the bottle</h2></div>
              </div>
              <p className="bottle-writing-guidance">Use permanent marker. Put the Mallard sample ID on first and copy the example below.</p>
              <div className="bottle-writing-example" aria-label="Example of what to handwrite on the sample bottle">
                <span className="bottle-writing-brand">MALLARD</span>
                <strong>{selected.sample_code}</strong>
                <span>{formatBottleDate(selected.collected_at)}</span>
                <span>Company: {selectedSite?.customer || selected.customer_site || 'Not entered'}</span>
                <span>{classificationByCode.get(selected.classification_code)?.name || categoryInfo[selected.category].label}</span>
                <span>{selected.location}</span>
                {selected.collector_name && <span>{selected.collector_name}</span>}
              </div>
              <div className="bottle-writing-minimum">
                <span>If space is tight, at minimum write:</span>
                <strong>{selected.sample_code} · {selectedSite?.customer || selected.customer_site || 'Company'} · {formatBottleDate(selected.collected_at)} · {classificationByCode.get(selected.classification_code)?.name || categoryInfo[selected.category].label}</strong>
              </div>
            </section>

            <div className="mallard-v3-record-actions"><button type="button" className="secondary" onClick={() => cloneSample(selected)}><Plus size={18} /> Create another like this</button>{selected.disposal_destination && <span className="dump-chip"><MapPin size={15} /> {selected.disposal_destination}</span>}</div>

            <section className="mallard-v3-panel disposal">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Disposal</span><h2>Where was it dumped?</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveDisposalInfo()}><Save size={17} /> Save</button></div>
              <div className="facility-pills">{disposalSuggestions.map((facility) => <button type="button" className={selected.disposal_destination === facility ? 'active' : ''} key={facility} onClick={() => setSelected({ ...selected, disposal_destination: facility })}>{facility}</button>)}<button type="button" className={!selected.disposal_destination ? 'active muted' : 'muted'} onClick={() => setSelected({ ...selected, disposal_destination: null, disposed_at: null })}>Not dumped yet</button></div>
              <div className="grid two"><label><span>Dump location</span><input list="mallard-disposal-facilities" value={selected.disposal_destination || ''} onChange={(event) => setSelected({ ...selected, disposal_destination: event.target.value || null })} placeholder="MROR, Secure, One Environmental or another facility" /></label><label><span>Dump date</span><input type="date" disabled={!selected.disposal_destination} value={toDateValue(selected.disposed_at)} onChange={(event) => setSelected({ ...selected, disposed_at: event.target.value ? dateToIso(event.target.value) : null })} /></label></div>
              <datalist id="mallard-disposal-facilities">{disposalSuggestions.map((facility) => <option value={facility} key={facility} />)}</datalist>
            </section>

            <section className="mallard-v3-panel status-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Chain of custody</span><h2>Status</h2></div></div>
              <label><span>Name making update</span><input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="Required for status changes" /></label>
              <div className="status-track">{statusOrder.map((status, index) => { const currentIndex = statusOrder.indexOf(selected.status); return <div key={status} className={`${index <= currentIndex ? 'done' : ''} ${status === selected.status ? 'current' : ''}`}><span>{index + 1}</span><small>{statusLabels[status]}</small></div> })}</div>
              <div className="quick-actions">{quickTargets.map((target) => <button className="primary" type="button" key={target} disabled={saving} onClick={() => void updateStatus(target)}>{target === 'received' ? <PackageCheck size={18} /> : target === 'submitted' ? <Send size={18} /> : target === 'results_received' ? <TestTube2 size={18} /> : <CheckCircle2 size={18} />}{statusLabels[target]}</button>)}<select value={selected.status} onChange={(event) => void updateStatus(event.target.value as SampleStatus)} aria-label="Set exact status">{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></div>
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Field collection</span><h2>Collection record</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveFieldInfo()}><Save size={17} /> Save</button></div>
              <div className="grid two"><label><span>Collection date</span><input type="date" value={toDateValue(selected.collected_at)} onChange={(event) => setSelected({ ...selected, collected_at: dateToIso(event.target.value) || selected.collected_at })} /></label><label><span>Collected by</span><input value={selected.collector_name || ''} onChange={(event) => setSelected({ ...selected, collector_name: event.target.value })} /></label></div>
              <label><span>Reusable site</span><select value={selected.site_id || ''} onChange={(event) => { const site = sites.find((item) => item.id === event.target.value); setSelected({ ...selected, site_id: event.target.value || null, location: site ? (site.lsd || site.uwi || site.site_name) : selected.location, customer_site: site ? [site.customer, site.site_name].filter(Boolean).join(' / ') : selected.customer_site }) }}><option value="">No linked site</option>{sites.filter((site) => site.active || site.id === selected.site_id).map((site) => <option value={site.id} key={site.id}>{[site.customer, site.site_name, site.lsd || site.uwi].filter(Boolean).join(' · ')}</option>)}</select></label>
              <label><span>Location</span><input value={selected.location} onChange={(event) => setSelected({ ...selected, location: event.target.value })} /></label>
              <label><span>Company / customer</span><input value={selected.customer_site || ''} onChange={(event) => setSelected({ ...selected, customer_site: event.target.value })} /></label>
              <div className="grid two"><label><span>Sample matrix</span><select value={selected.sample_matrix || 'Unknown'} onChange={(event) => setSelected({ ...selected, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="check"><input type="checkbox" checked={selected.priority} onChange={(event) => setSelected({ ...selected, priority: event.target.checked })} /><span><strong>Priority</strong><small>Highlight this sample</small></span></label></div>
              <label><span>Description of work</span><textarea rows={2} value={selected.description_of_work} onChange={(event) => setSelected({ ...selected, description_of_work: event.target.value })} /></label>
              <label><span>Suspected contents</span><textarea rows={2} value={selected.suspected_contents} onChange={(event) => setSelected({ ...selected, suspected_contents: event.target.value })} /></label>
              <label><span>Field notes</span><textarea rows={2} value={selected.field_notes || ''} onChange={(event) => setSelected({ ...selected, field_notes: event.target.value })} /></label>
            </section>

            {selectedSite && <section className="mallard-v3-panel site-record-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Reusable site</span><h2>{selectedSite.site_name}</h2></div><button className="link" type="button" onClick={() => { editSite(selectedSite); navigateView('sites') }}>Edit site</button></div>
              <div className="site-record-grid">
                <div><span>Customer</span><strong>{selectedSite.customer || 'Not entered'}</strong></div>
                <div><span>LSD</span><strong>{selectedSite.lsd || 'Not entered'}</strong></div>
                <div><span>UWI</span><strong>{selectedSite.uwi || 'Not entered'}</strong></div>
                <div><span>GPS</span><strong>{selectedSite.latitude != null && selectedSite.longitude != null ? `${selectedSite.latitude}, ${selectedSite.longitude}` : 'Not entered'}</strong></div>
              </div>
              {selectedSite.access_directions && <p className="site-note"><strong>Access:</strong> {selectedSite.access_directions}</p>}
              {(selectedSite.contact_name || selectedSite.contact_phone || selectedSite.contact_email) && <p className="site-note"><strong>Contact:</strong> {[selectedSite.contact_name, selectedSite.contact_phone, selectedSite.contact_email].filter(Boolean).join(' · ')}</p>}
              <div className="site-history"><strong>Other active samples at this site</strong>{selectedSiteHistory.length === 0 ? <span>None yet</span> : selectedSiteHistory.slice(0, 6).map((sample) => <button type="button" key={sample.id} onClick={() => void openSample(sample.id)}><b>{sample.sample_code}</b><span>{formatDate(sample.collected_at)} · {classificationByCode.get(sample.classification_code)?.name || 'Sample'}</span></button>)}</div>
            </section>}

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Mallard receiving</span><h2>Lab submission</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveLabInfo()}><Save size={17} /> Save</button></div>
              <div className="grid two"><label><span>Received date</span><input type="date" value={toDateValue(selected.received_at)} onChange={(event) => setSelected({ ...selected, received_at: dateToIso(event.target.value) })} /></label><label><span>Received by</span><input value={selected.received_by || ''} onChange={(event) => setSelected({ ...selected, received_by: event.target.value })} /></label></div>
              <div className="grid two"><label><span>Laboratory</span><input value={selected.lab_name || ''} onChange={(event) => setSelected({ ...selected, lab_name: event.target.value })} placeholder="Lab name" /></label><label><span>Lab submission #</span><input value={selected.lab_submission_number || ''} onChange={(event) => setSelected({ ...selected, lab_submission_number: event.target.value })} /></label></div>
              <div className="grid two"><label><span>Submitted date</span><input type="date" value={toDateValue(selected.submitted_at)} onChange={(event) => setSelected({ ...selected, submitted_at: dateToIso(event.target.value) })} /></label><label><span>Results received date</span><input type="date" value={toDateValue(selected.results_received_at)} onChange={(event) => setSelected({ ...selected, results_received_at: dateToIso(event.target.value) })} /></label></div>
              <label><span>Confirmed material</span><textarea rows={2} value={selected.confirmed_material || ''} onChange={(event) => setSelected({ ...selected, confirmed_material: event.target.value })} placeholder="What the lab or final review confirmed" /></label>
              <label><span>Lab / receiving notes</span><textarea rows={2} value={selected.lab_notes || ''} onChange={(event) => setSelected({ ...selected, lab_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-v3-panel test-paperwork-panel">
              <div className="mallard-v3-heading">
                <div><span className="eyebrow">Source document</span><h2>Test paperwork</h2></div>
                <button className="primary" type="button" disabled={attachmentBusy} onClick={() => attachmentInputRef.current?.click()}><Upload size={17} /> Upload</button>
              </div>
              <input ref={attachmentInputRef} className="visually-hidden-file" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void uploadTestFiles(event.target.files)} />
              <div className="attachment-explainer"><Sparkles size={18} /><div><strong>Free layout-aware document reader</strong><p>Upload a PDF or clear photo. Mallard identifies fields, tables and result rows, then asks you to review them before anything changes on the sample.</p></div></div>
              {attachmentBusy && <div className="attachment-progress"><div><span>{attachmentProgress || 'Working…'}</span><b>{Math.round(attachmentProgressValue * 100)}%</b></div><progress max={1} value={attachmentProgressValue || 0.02} /></div>}
              {attachments.length === 0 ? <div className="empty small">No test paperwork uploaded yet.</div> : <div className="attachment-list">{attachments.map((attachment) => (
                <div className="attachment-card" key={attachment.id}>
                  <div className="attachment-icon"><FileText size={22} /></div>
                  <div className="attachment-main">
                    <strong>{attachment.original_name}</strong>
                    <span>{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB · {formatDate(attachment.created_at)}</span>
                    {attachment.document_type && <span className="attachment-document-meta">{attachment.document_type.replaceAll('_', ' ')}{attachment.document_confidence != null ? ` · ${Math.round(attachment.document_confidence * 100)}%` : ''}{attachment.parse_method ? ` · ${attachment.parse_method === 'pdf_layout' ? 'PDF layout' : attachment.parse_method === 'ocr_layout' ? 'OCR layout' : attachment.parse_method}` : ''}</span>}
                    <div className={`parse-status ${attachment.parse_status}`}>
                      {attachment.parse_status === 'parsed'
                        ? `Reviewed · ${attachment.parsed_line_count} result${attachment.parsed_line_count === 1 ? '' : 's'} imported`
                        : attachment.parse_status === 'processing'
                          ? 'Reading document…'
                          : attachment.parse_status === 'needs_review'
                            ? `${attachment.extraction_json?.fields?.length || 0} fields · ${attachment.extraction_json?.rows?.length || 0} results ready to review`
                            : attachment.parse_status === 'failed'
                              ? 'Saved · automatic reading failed'
                              : 'Uploaded'}
                    </div>
                    {attachment.review_status === 'corrected' && <small>Corrections saved to improve this document layout next time.</small>}
                    {attachment.parse_error && <small>{attachment.parse_error}</small>}
                  </div>
                  <div className="attachment-actions">
                    {attachment.extraction_json && <button className="secondary review-button" type="button" disabled={attachmentBusy} onClick={() => openAttachmentReview(attachment)}><ClipboardCheck size={16} /> Review</button>}
                    <button className="secondary square" type="button" onClick={() => void openAttachment(attachment)} aria-label={`Open ${attachment.original_name}`}><ExternalLink size={17} /></button>
                    <button className="icon-danger" type="button" disabled={attachmentBusy} onClick={() => void deleteAttachment(attachment)} aria-label={`Delete ${attachment.original_name}`}><Trash2 size={17} /></button>
                  </div>
                </div>
              ))}</div>}
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Results</span><h2>Test results</h2></div><button className="secondary" type="button" onClick={addTestResult}><Plus size={17} /> Add test</button></div>
              {testResults.length === 0 ? <div className="empty small">No test rows yet.</div> : <div className="test-list">{testResults.map((row, index) => <div className="test-card" key={row.id || `new-${index}`}><div className="test-head"><strong>Test {index + 1}{row.source_attachment_id ? <span className="imported-badge"><Sparkles size={13} /> Imported{row.parse_confidence != null ? ` · ${Math.round(row.parse_confidence * 100)}%` : ''}</span> : null}</strong><button className="icon-danger" type="button" onClick={() => removeTestResult(index)} aria-label="Remove test"><Trash2 size={17} /></button></div><label><span>Test name</span><input value={row.test_name} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, test_name: event.target.value } : item))} /></label><div className="grid three"><label><span>Result</span><input value={row.result_value} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, result_value: event.target.value } : item))} /></label><label><span>Unit</span><input value={row.unit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unit: event.target.value } : item))} /></label><label><span>Qualifier</span><input value={row.qualifier} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, qualifier: event.target.value } : item))} /></label></div><div className="grid four test-result-details"><label><span>Method</span><input value={row.method} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, method: event.target.value } : item))} /></label><label><span>Reporting limit</span><input value={row.reporting_limit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, reporting_limit: event.target.value } : item))} /></label><label><span>Detection limit</span><input value={row.detection_limit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, detection_limit: event.target.value } : item))} /></label><label><span>Flag</span><input value={row.flag} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, flag: event.target.value } : item))} /></label></div><label><span>Notes</span><input value={row.notes} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, notes: event.target.value } : item))} /></label></div>)}</div>}
              <div className="panel-footer"><button className="primary" type="button" disabled={saving} onClick={() => void saveTestResults()}><Save size={18} /> Save results</button></div>
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Audit trail</span><h2>History</h2></div></div>
              {events.length === 0 ? <div className="empty small">No history yet.</div> : <div className="timeline">{events.map((event) => <div className="timeline-row" key={event.id}><span className="dot" /><div><strong>{event.event_type === 'status_change' && event.to_status ? `${event.from_status ? statusLabels[event.from_status as SampleStatus] : 'Status'} → ${statusLabels[event.to_status as SampleStatus]}` : eventLabels[event.event_type] || event.event_type.replaceAll('_', ' ')}</strong><span>{formatDate(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</span>{event.note && <p>{event.note}</p>}</div></div>)}</div>}
            </section>

            <div className="danger-zone"><button className="archive" type="button" onClick={() => void archiveSample()}><Archive size={18} /> Archive sample</button><button className="delete" type="button" disabled={saving} onClick={() => void deleteSample()}><Trash2 size={18} /> Delete sample {selected.sample_code}</button></div>
          </main>
        )}

        {view !== 'picker' && <nav className="mallard-v3-bottom-nav" aria-label="Mallard navigation">
          <button className={view === 'dashboard' ? 'active' : ''} type="button" onClick={() => navigateView('dashboard')}><Beaker size={21} /><span>Home</span></button>
          <button className={view === 'samples' || view === 'detail' ? 'active' : ''} type="button" onClick={() => navigateView('samples')}><ClipboardList size={21} /><span>Samples</span></button>
          <button className={view === 'new' ? 'active create' : 'create'} type="button" onClick={() => openSamplePicker(null, 'new')}><Plus size={24} /><span>New</span></button>
        </nav>}
      </div>

      {reviewAttachment && reviewDocument && <MallardDocumentReview
        attachmentName={reviewAttachment.original_name}
        document={reviewDocument}
        busy={attachmentBusy}
        onCancel={() => { if (!attachmentBusy) { setReviewAttachment(null); setReviewDocument(null) } }}
        onApply={applyDocumentReview}
      />}
    </>
  )
}

function SampleRow({ sample, onOpen }: { sample: MallardSample; onOpen: () => void }) {
  return <button className={`mallard-v3-sample-row ${sample.priority ? 'priority' : ''}`} type="button" onClick={onOpen}><div className={`sample-id ${toneForCode(sample.classification_code)}`}>{sample.sample_code}</div><div className="sample-main"><div className="sample-top"><strong>{sample.customer_site || sample.location}</strong><span className={`status mini status-${sample.status}`}>{statusLabels[sample.status]}</span></div><p>{sample.customer_site ? sample.location : sample.suspected_contents}</p><div className="sample-meta"><span><CalendarDays size={14} /> {formatDate(sample.collected_at)}</span>{sample.collector_name && <span><UserRound size={14} /> {sample.collector_name}</span>}{sample.disposal_destination && <span><MapPin size={14} /> {sample.disposal_destination}</span>}</div></div></button>
}
