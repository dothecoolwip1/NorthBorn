import React from 'react'
import {
  Archive,
  Beaker,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Download,
  FlaskConical,
  MapPin,
  Navigation,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  TestTube2,
  Trash2,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './mallard-sample-tracker-v2.css'

type SampleCategory = 'non_oilfield' | 'oilfield' | 'odd_weird'
type SampleStatus = 'collected' | 'with_driver' | 'received' | 'submitted' | 'testing' | 'results_received' | 'complete'
type ViewMode = 'dashboard' | 'samples' | 'new' | 'detail'

type MallardSample = {
  id: string
  sample_number: number
  category: SampleCategory
  status: SampleStatus
  collected_at: string
  location: string
  latitude: number | null
  longitude: number | null
  customer_site: string | null
  job_reference: string | null
  description_of_work: string
  suspected_contents: string
  sample_reason: string
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
  container_notes: string | null
  disposal_destination: string | null
  disposed_at: string | null
  disposal_reference: string | null
  disposal_notes: string | null
}

type TestResult = {
  id?: string
  sample_id?: string
  test_name: string
  result_value: string
  unit: string
  qualifier: string
  notes: string
  sort_order: number
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
  category: SampleCategory
  collected_at: string
  location: string
  latitude: string
  longitude: string
  customer_site: string
  job_reference: string
  description_of_work: string
  suspected_contents: string
  sample_reason: string
  collector_name: string
  field_notes: string
  sample_matrix: string
  priority: boolean
  container_notes: string
}

type SavedDraft = {
  id: string
  saved_at: string
  form: SampleForm
}

const db = supabase as any
const DRAFT_KEY = 'mallard_sample_drafts_v2'
const ACTOR_KEY = 'mallard_last_actor_v1'

const categoryInfo: Record<SampleCategory, { label: string; range: string; base: number; tone: string; description: string }> = {
  non_oilfield: {
    label: 'Non Oilfield',
    range: '1000 series',
    base: 1001,
    tone: 'blue',
    description: 'Commercial, municipal, residential and other non oilfield material.',
  },
  oilfield: {
    label: 'Oilfield',
    range: '2000 series',
    base: 2001,
    tone: 'amber',
    description: 'Lease, battery, facility, production and other oilfield material.',
  },
  odd_weird: {
    label: 'Odd / Weird',
    range: '3000 series',
    base: 3001,
    tone: 'violet',
    description: 'Unknown, unusual or hard to classify material.',
  },
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
  category_change: 'Category changed',
  archived: 'Sample archived',
  restored: 'Sample restored',
  field_update: 'Field information updated',
  lab_update: 'Mallard or lab information updated',
  disposal_update: 'Disposal information updated',
}

const matrixOptions = ['Unknown', 'Water', 'Soil', 'Sludge', 'Hydrocarbon / product', 'Mixed waste', 'Other']
const disposalSuggestions = ['MROR', 'Secure', 'One Environmental']

function nowForInput() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toInputDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function blankForm(category: SampleCategory = 'oilfield'): SampleForm {
  return {
    category,
    collected_at: nowForInput(),
    location: '',
    latitude: '',
    longitude: '',
    customer_site: '',
    job_reference: '',
    description_of_work: '',
    suspected_contents: '',
    sample_reason: '',
    collector_name: localStorage.getItem(ACTOR_KEY) || '',
    field_notes: '',
    sample_matrix: 'Unknown',
    priority: false,
    container_notes: '',
  }
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function MallardSampleTrackerV2() {
  const [view, setView] = React.useState<ViewMode>('dashboard')
  const [samples, setSamples] = React.useState<MallardSample[]>([])
  const [selected, setSelected] = React.useState<MallardSample | null>(null)
  const [testResults, setTestResults] = React.useState<TestResult[]>([])
  const [events, setEvents] = React.useState<SampleEvent[]>([])
  const [deletedResultIds, setDeletedResultIds] = React.useState<string[]>([])
  const [newForm, setNewForm] = React.useState<SampleForm>(() => blankForm())
  const [activeDraftId, setActiveDraftId] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<SavedDraft[]>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]') }
    catch { return [] }
  })
  const [nextNumbers, setNextNumbers] = React.useState<Record<SampleCategory, number>>({ non_oilfield: 1001, oilfield: 2001, odd_weird: 3001 })
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | SampleCategory>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | SampleStatus>('all')
  const [disposalFilter, setDisposalFilter] = React.useState<'all' | 'undumped' | string>('all')
  const [actorName, setActorName] = React.useState(() => localStorage.getItem(ACTOR_KEY) || '')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [online, setOnline] = React.useState(() => navigator.onLine)
  const [printSample, setPrintSample] = React.useState<MallardSample | null>(null)

  const loadSamples = React.useCallback(async () => {
    setLoading(true)
    const [sampleResponse, counterResponse] = await Promise.all([
      db.from('mallard_samples').select('*').eq('archived', false).order('collected_at', { ascending: false }),
      db.rpc('mallard_get_next_numbers'),
    ])

    if (sampleResponse.error) {
      setMessage({ type: 'error', text: `Could not load samples: ${sampleResponse.error.message}` })
    } else {
      setSamples(sampleResponse.data || [])
    }

    if (!counterResponse.error && counterResponse.data) {
      const next = { non_oilfield: 1001, oilfield: 2001, odd_weird: 3001 } as Record<SampleCategory, number>
      counterResponse.data.forEach((row: { category: SampleCategory; next_number: number }) => {
        if (row.category in next) next[row.category] = row.next_number
      })
      setNextNumbers(next)
    }
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
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [message])

  const persistDrafts = (next: SavedDraft[]) => {
    setDrafts(next)
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  }

  const beginNewSample = (category: SampleCategory) => {
    setNewForm(blankForm(category))
    setActiveDraftId(null)
    setView('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cloneSample = (sample: MallardSample) => {
    setNewForm({
      category: sample.category,
      collected_at: nowForInput(),
      location: sample.location,
      latitude: sample.latitude == null ? '' : String(sample.latitude),
      longitude: sample.longitude == null ? '' : String(sample.longitude),
      customer_site: sample.customer_site || '',
      job_reference: sample.job_reference || '',
      description_of_work: sample.description_of_work,
      suspected_contents: sample.suspected_contents,
      sample_reason: sample.sample_reason,
      collector_name: sample.collector_name || localStorage.getItem(ACTOR_KEY) || '',
      field_notes: '',
      sample_matrix: sample.sample_matrix || 'Unknown',
      priority: sample.priority,
      container_notes: sample.container_notes || '',
    })
    setActiveDraftId(null)
    setView('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveDraft = () => {
    const draftId = activeDraftId || crypto.randomUUID()
    const draft: SavedDraft = { id: draftId, saved_at: new Date().toISOString(), form: newForm }
    persistDrafts([draft, ...drafts.filter((item) => item.id !== draftId)].slice(0, 30))
    setActiveDraftId(draftId)
    setMessage({ type: 'success', text: 'Draft saved on this device.' })
  }

  const resumeDraft = (draft: SavedDraft) => {
    setNewForm(draft.form)
    setActiveDraftId(draft.id)
    setView('new')
  }

  const discardDraft = (id: string) => {
    persistDrafts(drafts.filter((item) => item.id !== id))
    if (activeDraftId === id) setActiveDraftId(null)
  }

  const createSample = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newForm.location.trim() || !newForm.description_of_work.trim() || !newForm.suspected_contents.trim() || !newForm.sample_reason.trim()) {
      setMessage({ type: 'error', text: 'Location, work description, suspected contents and reason are required.' })
      return
    }

    if (!navigator.onLine) {
      saveDraft()
      setMessage({ type: 'info', text: 'No connection. This sample is saved as a device draft until service returns.' })
      return
    }

    setSaving(true)
    if (newForm.collector_name.trim()) {
      localStorage.setItem(ACTOR_KEY, newForm.collector_name.trim())
      setActorName(newForm.collector_name.trim())
    }

    const payload = {
      category: newForm.category,
      collected_at: toIso(newForm.collected_at),
      location: newForm.location.trim(),
      latitude: newForm.latitude ? Number(newForm.latitude) : null,
      longitude: newForm.longitude ? Number(newForm.longitude) : null,
      customer_site: newForm.customer_site.trim() || null,
      job_reference: newForm.job_reference.trim() || null,
      description_of_work: newForm.description_of_work.trim(),
      suspected_contents: newForm.suspected_contents.trim(),
      sample_reason: newForm.sample_reason.trim(),
      collector_name: newForm.collector_name.trim() || null,
      field_notes: newForm.field_notes.trim() || null,
      sample_matrix: newForm.sample_matrix || null,
      priority: newForm.priority,
      container_notes: newForm.container_notes.trim() || null,
      last_updated_by: newForm.collector_name.trim() || null,
    }

    const { data, error } = await db.from('mallard_samples').insert(payload).select('*').single()
    setSaving(false)
    if (error) {
      saveDraft()
      setMessage({ type: 'error', text: `Could not create sample. A device draft was saved. ${error.message}` })
      return
    }

    if (activeDraftId) discardDraft(activeDraftId)
    setNewForm(blankForm(newForm.category))
    await loadSamples()
    await openSample(data.id)
    setMessage({ type: 'success', text: `Sample ${data.sample_number} created. Label the bottle with this number.` })
  }

  const openSample = async (id: string) => {
    setLoading(true)
    const [sampleResponse, resultResponse, eventResponse] = await Promise.all([
      db.from('mallard_samples').select('*').eq('id', id).single(),
      db.from('mallard_test_results').select('*').eq('sample_id', id).order('sort_order', { ascending: true }),
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
      notes: row.notes || '',
      sort_order: row.sort_order || 0,
    })))
    setDeletedResultIds([])
    setEvents(eventResponse.data || [])
    setView('detail')
    setLoading(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      setMessage({ type: 'error', text: 'This sample changed on another device. I refreshed the latest version so nothing gets overwritten.' })
      await openSample(selected.id)
      return false
    }

    setSelected(data)
    await loadSamples()
    await openSample(data.id)
    setMessage({ type: 'success', text: successText })
    return true
  }

  const saveFieldInfo = async () => {
    if (!selected) return
    await savePatch({
      collected_at: selected.collected_at,
      location: selected.location.trim(),
      latitude: selected.latitude,
      longitude: selected.longitude,
      customer_site: selected.customer_site?.trim() || null,
      job_reference: selected.job_reference?.trim() || null,
      description_of_work: selected.description_of_work.trim(),
      suspected_contents: selected.suspected_contents.trim(),
      sample_reason: selected.sample_reason.trim(),
      collector_name: selected.collector_name?.trim() || null,
      field_notes: selected.field_notes?.trim() || null,
      sample_matrix: selected.sample_matrix?.trim() || null,
      priority: selected.priority,
      container_notes: selected.container_notes?.trim() || null,
    }, 'Field information saved.')
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
      final_determination: selected.final_determination?.trim() || null,
      lab_notes: selected.lab_notes?.trim() || null,
    }, 'Mallard and lab information saved.')
  }

  const saveDisposalInfo = async () => {
    if (!selected) return
    await savePatch({
      disposal_destination: selected.disposal_destination?.trim() || null,
      disposed_at: selected.disposed_at,
      disposal_reference: selected.disposal_reference?.trim() || null,
      disposal_notes: selected.disposal_notes?.trim() || null,
    }, 'Disposal information saved.')
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
    await savePatch(patch, `Sample ${selected.sample_number} is now ${statusLabels[target]}.`)
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
          notes: row.notes.trim() || null,
          sort_order: index,
        }
        const response = row.id
          ? await db.from('mallard_test_results').update(payload).eq('id', row.id)
          : await db.from('mallard_test_results').insert(payload)
        if (response.error) throw response.error
      }
      setMessage({ type: 'success', text: 'Test results saved.' })
      await openSample(selected.id)
    } catch (error: any) {
      setMessage({ type: 'error', text: `Could not save test results: ${error.message || 'Unknown error'}` })
    } finally {
      setSaving(false)
    }
  }

  const archiveSample = async () => {
    if (!selected) return
    if (!window.confirm(`Archive sample ${selected.sample_number}? It will leave the active sample list.`)) return
    const { data, error } = await db.from('mallard_samples')
      .update({ archived: true, last_updated_by: actorName.trim() || selected.collector_name || 'Mallard' })
      .eq('id', selected.id)
      .eq('revision', selected.revision)
      .select('id')
      .maybeSingle()
    if (error || !data) {
      setMessage({ type: 'error', text: error?.message || 'This record changed before it could be archived. Refresh and try again.' })
      return
    }
    setSelected(null)
    setView('samples')
    await loadSamples()
    setMessage({ type: 'success', text: 'Sample archived.' })
  }

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: 'This device does not provide browser GPS.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }))
        setMessage({ type: 'success', text: 'GPS coordinates added.' })
      },
      () => setMessage({ type: 'error', text: 'Location permission was not available. You can still enter the site manually.' }),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  const exportCsv = () => {
    const headers = ['Sample Number', 'Category', 'Status', 'Priority', 'Collected At', 'Location', 'Customer / Site', 'Job Reference', 'Matrix', 'Description of Work', 'Suspected Contents', 'Reason', 'Collector', 'Dumped At', 'Disposed At', 'Disposal Reference', 'Lab', 'Lab Submission', 'Final Determination']
    const rows = samples.map((sample) => [
      sample.sample_number,
      categoryInfo[sample.category].label,
      statusLabels[sample.status],
      sample.priority ? 'Yes' : 'No',
      sample.collected_at,
      sample.location,
      sample.customer_site,
      sample.job_reference,
      sample.sample_matrix,
      sample.description_of_work,
      sample.suspected_contents,
      sample.sample_reason,
      sample.collector_name,
      sample.disposal_destination,
      sample.disposed_at,
      sample.disposal_reference,
      sample.lab_name,
      sample.lab_submission_number,
      sample.final_determination,
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mallard-samples-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const requestPrint = (sample: MallardSample) => {
    setPrintSample(sample)
    window.setTimeout(() => window.print(), 80)
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
        sample.sample_number,
        categoryInfo[sample.category].label,
        statusLabels[sample.status],
        sample.location,
        sample.customer_site,
        sample.job_reference,
        sample.sample_matrix,
        sample.description_of_work,
        sample.suspected_contents,
        sample.sample_reason,
        sample.collector_name,
        sample.disposal_destination,
        sample.disposal_reference,
        sample.lab_name,
        sample.lab_submission_number,
        sample.final_determination,
      ].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [samples, query, categoryFilter, statusFilter, disposalFilter])

  const stats = React.useMemo(() => ({
    total: samples.length,
    toDeliver: samples.filter((sample) => ['collected', 'with_driver'].includes(sample.status)).length,
    atLab: samples.filter((sample) => ['submitted', 'testing'].includes(sample.status)).length,
    awaitingDisposal: samples.filter((sample) => !sample.disposal_destination).length,
    complete: samples.filter((sample) => sample.status === 'complete').length,
  }), [samples])

  const addTestResult = () => setTestResults((rows) => [...rows, { test_name: '', result_value: '', unit: '', qualifier: '', notes: '', sort_order: rows.length }])

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
      <div className="mallard-v2-app">
        <header className="mallard-v2-header">
          <div className="mallard-v2-brand">
            <div className="mallard-v2-mark"><Beaker size={24} /></div>
            <div>
              <p>Mallard Environmental</p>
              <h1>Sample Tracker</h1>
            </div>
          </div>
          <div className={`mallard-v2-connection ${online ? 'online' : 'offline'}`}>
            {online ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
            {online ? 'Live' : 'Draft mode'}
          </div>
        </header>

        {message && (
          <div className={`mallard-v2-toast ${message.type}`}>
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss"><X size={18} /></button>
          </div>
        )}

        {view === 'dashboard' && (
          <main className="mallard-v2-main">
            <section className="mallard-v2-intro">
              <div>
                <span className="mallard-v2-eyebrow">Field ready sample control</span>
                <h2>Start a new bottle</h2>
                <p>Pick the sample type. The number shown is the actual next database number.</p>
              </div>
              <div className="mallard-v2-category-grid">
                {(Object.keys(categoryInfo) as SampleCategory[]).map((category) => {
                  const info = categoryInfo[category]
                  return (
                    <button type="button" key={category} className={`mallard-v2-category-card ${info.tone}`} onClick={() => beginNewSample(category)}>
                      <span className="mallard-v2-next-label">Next</span>
                      <strong>{nextNumbers[category]}</strong>
                      <b>{info.label}</b>
                      <small>{info.range}</small>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="mallard-v2-quick-search">
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') setView('samples') }}
                placeholder="Search sample number, site, contents, dump location..."
              />
              <button type="button" onClick={() => setView('samples')}>Search</button>
            </section>

            <section className="mallard-v2-stats-grid">
              <button type="button" onClick={() => { setStatusFilter('all'); setView('samples') }}><span>Active</span><strong>{stats.total}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('collected'); setView('samples') }}><span>To deliver</span><strong>{stats.toDeliver}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('submitted'); setView('samples') }}><span>At lab</span><strong>{stats.atLab}</strong></button>
              <button type="button" onClick={() => { setDisposalFilter('undumped'); setView('samples') }}><span>No dump location</span><strong>{stats.awaitingDisposal}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('complete'); setView('samples') }}><span>Complete</span><strong>{stats.complete}</strong></button>
            </section>

            {drafts.length > 0 && (
              <section className="mallard-v2-panel">
                <div className="mallard-v2-section-heading">
                  <div><span className="mallard-v2-eyebrow">This device</span><h2>Saved drafts</h2></div>
                  <span className="mallard-v2-count">{drafts.length}</span>
                </div>
                <div className="mallard-v2-draft-list">
                  {drafts.map((draft) => (
                    <div className="mallard-v2-draft-row" key={draft.id}>
                      <button type="button" onClick={() => resumeDraft(draft)}>
                        <strong>{categoryInfo[draft.form.category].label}</strong>
                        <span>{draft.form.location || 'Location not entered'} · {formatDate(draft.saved_at)}</span>
                      </button>
                      <button className="mallard-v2-icon danger" type="button" onClick={() => discardDraft(draft.id)} aria-label="Delete draft"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mallard-v2-panel">
              <div className="mallard-v2-section-heading">
                <div><span className="mallard-v2-eyebrow">Database</span><h2>Recent samples</h2></div>
                <button type="button" className="mallard-v2-link-button" onClick={() => setView('samples')}>View all</button>
              </div>
              {loading ? <div className="mallard-v2-empty">Loading samples...</div> : samples.length === 0 ? <div className="mallard-v2-empty">No samples yet.</div> : (
                <div className="mallard-v2-sample-list compact">
                  {samples.slice(0, 6).map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}
                </div>
              )}
            </section>
          </main>
        )}

        {view === 'samples' && (
          <main className="mallard-v2-main">
            <div className="mallard-v2-page-heading">
              <div><span className="mallard-v2-eyebrow">Sample database</span><h2>Find any bottle</h2></div>
              <div className="mallard-v2-heading-actions">
                <button className="secondary" type="button" onClick={exportCsv}><Download size={18} /> Export CSV</button>
                <button className="primary" type="button" onClick={() => beginNewSample('oilfield')}><Plus size={18} /> New sample</button>
              </div>
            </div>

            <section className="mallard-v2-search-panel">
              <label className="mallard-v2-search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Number, site, contents, lab, disposal..." /></label>
              <div className="mallard-v2-filter-row">
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as any)}>
                  <option value="all">All categories</option>
                  <option value="non_oilfield">Non Oilfield</option>
                  <option value="oilfield">Oilfield</option>
                  <option value="odd_weird">Odd / Weird</option>
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}>
                  <option value="all">All statuses</option>
                  {statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
                </select>
                <select value={disposalFilter} onChange={(event) => setDisposalFilter(event.target.value)}>
                  <option value="all">All dump locations</option>
                  <option value="undumped">Not entered</option>
                  {disposalSuggestions.map((facility) => <option key={facility} value={facility}>{facility}</option>)}
                </select>
                <button className="secondary square" type="button" onClick={() => void loadSamples()} aria-label="Refresh samples"><RefreshCw size={18} /></button>
              </div>
            </section>

            <p className="mallard-v2-results-count">Showing {filteredSamples.length} of {samples.length} active samples</p>
            {loading ? <div className="mallard-v2-empty">Loading samples...</div> : filteredSamples.length === 0 ? <div className="mallard-v2-empty">No samples match those filters.</div> : (
              <div className="mallard-v2-sample-list">
                {filteredSamples.map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}
              </div>
            )}
          </main>
        )}

        {view === 'new' && (
          <main className="mallard-v2-main narrow">
            <button className="mallard-v2-back" type="button" onClick={() => setView('dashboard')}><ChevronLeft size={18} /> Back</button>
            <div className="mallard-v2-page-heading new-heading">
              <div>
                <span className="mallard-v2-eyebrow">New bottle</span>
                <h2>{categoryInfo[newForm.category].label} sample</h2>
                <p>Expected number <strong>{nextNumbers[newForm.category]}</strong></p>
              </div>
            </div>

            <form className="mallard-v2-form" onSubmit={createSample}>
              <section className="mallard-v2-panel">
                <h3>1. Sample type</h3>
                <div className="mallard-v2-segmented">
                  {(Object.keys(categoryInfo) as SampleCategory[]).map((category) => (
                    <button key={category} type="button" className={newForm.category === category ? 'active' : ''} onClick={() => setNewForm({ ...newForm, category })}>
                      <strong>{categoryInfo[category].label}</strong>
                      <span>{categoryInfo[category].range}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="mallard-v2-panel">
                <h3>2. Collection details</h3>
                <div className="mallard-v2-form-grid two">
                  <label><span>Date and time *</span><input type="datetime-local" required value={newForm.collected_at} onChange={(event) => setNewForm({ ...newForm, collected_at: event.target.value })} /></label>
                  <label><span>Collected by</span><input value={newForm.collector_name} onChange={(event) => setNewForm({ ...newForm, collector_name: event.target.value })} placeholder="Your name" /></label>
                </div>
                <label><span>Location *</span><input required value={newForm.location} onChange={(event) => setNewForm({ ...newForm, location: event.target.value })} placeholder="Lease, facility, address, LSD or site name" /></label>
                <div className="mallard-v2-inline-action"><button className="secondary" type="button" onClick={captureLocation}><Navigation size={17} /> Add current GPS</button>{newForm.latitude && <span>{newForm.latitude}, {newForm.longitude}</span>}</div>
                <div className="mallard-v2-form-grid two">
                  <label><span>Customer / site</span><input value={newForm.customer_site} onChange={(event) => setNewForm({ ...newForm, customer_site: event.target.value })} placeholder="Optional" /></label>
                  <label><span>Job / PO / reference</span><input value={newForm.job_reference} onChange={(event) => setNewForm({ ...newForm, job_reference: event.target.value })} placeholder="Optional" /></label>
                </div>
              </section>

              <section className="mallard-v2-panel">
                <h3>3. Material</h3>
                <div className="mallard-v2-form-grid two">
                  <label><span>Sample matrix</span><select value={newForm.sample_matrix} onChange={(event) => setNewForm({ ...newForm, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                  <label className="mallard-v2-check"><input type="checkbox" checked={newForm.priority} onChange={(event) => setNewForm({ ...newForm, priority: event.target.checked })} /><span><strong>Priority sample</strong><small>Flag this bottle for attention.</small></span></label>
                </div>
                <label><span>Description of work *</span><textarea required rows={3} value={newForm.description_of_work} onChange={(event) => setNewForm({ ...newForm, description_of_work: event.target.value })} placeholder="What were you doing when the sample was taken?" /></label>
                <label><span>What do you think is in it? *</span><textarea required rows={3} value={newForm.suspected_contents} onChange={(event) => setNewForm({ ...newForm, suspected_contents: event.target.value })} placeholder="Example: oily water, produced water, glycol, unknown black liquid" /></label>
                <label><span>Why was the sample taken? *</span><textarea required rows={3} value={newForm.sample_reason} onChange={(event) => setNewForm({ ...newForm, sample_reason: event.target.value })} placeholder="Disposal request, unknown material, customer request, verification..." /></label>
              </section>

              <section className="mallard-v2-panel">
                <h3>4. Bottle notes</h3>
                <label><span>Container / bottle notes</span><textarea rows={2} value={newForm.container_notes} onChange={(event) => setNewForm({ ...newForm, container_notes: event.target.value })} placeholder="Bottle type, fill level, damaged lid, extra container..." /></label>
                <label><span>Field notes</span><textarea rows={3} value={newForm.field_notes} onChange={(event) => setNewForm({ ...newForm, field_notes: event.target.value })} placeholder="Colour, smell, layers, temperature, anything unusual" /></label>
              </section>

              <div className="mallard-v2-assignment-preview">
                <span>Expected bottle number</span>
                <strong>{nextNumbers[newForm.category]}</strong>
                <small>The database confirms the permanent number when you save.</small>
              </div>

              <div className="mallard-v2-form-actions sticky-actions">
                <button className="secondary" type="button" onClick={saveDraft}><Save size={18} /> Save draft</button>
                <button className="primary large" type="submit" disabled={saving}>{saving ? 'Creating...' : <><FlaskConical size={19} /> Create sample</>}</button>
              </div>
            </form>
          </main>
        )}

        {view === 'detail' && selected && (
          <main className="mallard-v2-main narrow detail-page">
            <button className="mallard-v2-back" type="button" onClick={() => setView('samples')}><ChevronLeft size={18} /> Sample database</button>

            <section className={`mallard-v2-sample-hero ${categoryInfo[selected.category].tone}`}>
              <div>
                <span className="mallard-v2-eyebrow">Permanent bottle ID</span>
                <div className="mallard-v2-big-number">{selected.sample_number}</div>
                <div className="mallard-v2-hero-meta">
                  <span>{categoryInfo[selected.category].label}</span>
                  <span>{selected.sample_matrix || 'Unknown matrix'}</span>
                  <span>Revision {selected.revision}</span>
                </div>
              </div>
              <div className="mallard-v2-hero-actions">
                {selected.priority && <span className="mallard-v2-priority">Priority</span>}
                <span className={`mallard-v2-status status-${selected.status}`}>{statusLabels[selected.status]}</span>
                <button className="secondary light" type="button" onClick={() => requestPrint(selected)}><Printer size={18} /> Label</button>
              </div>
            </section>

            <div className="mallard-v2-record-actions">
              <button type="button" className="secondary" onClick={() => cloneSample(selected)}><Plus size={18} /> Create another like this</button>
              {selected.disposal_destination && <span className="mallard-v2-disposal-chip"><MapPin size={15} /> {selected.disposal_destination}</span>}
            </div>

            <section className="mallard-v2-panel status-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Chain of custody</span><h2>Sample status</h2></div></div>
              <label><span>Name making this update</span><input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="Required for status changes" /></label>
              <div className="mallard-v2-status-track">
                {statusOrder.map((status, index) => {
                  const currentIndex = statusOrder.indexOf(selected.status)
                  return <div key={status} className={`mallard-v2-status-step ${index <= currentIndex ? 'done' : ''} ${status === selected.status ? 'current' : ''}`}><span>{index + 1}</span><small>{statusLabels[status]}</small></div>
                })}
              </div>
              <div className="mallard-v2-quick-actions">
                {quickTargets.map((target) => <button className="primary" type="button" key={target} disabled={saving} onClick={() => void updateStatus(target)}>{target === 'received' ? <PackageCheck size={18} /> : target === 'submitted' ? <Send size={18} /> : target === 'results_received' ? <TestTube2 size={18} /> : <CheckCircle2 size={18} />}{statusLabels[target]}</button>)}
                <select value={selected.status} onChange={(event) => void updateStatus(event.target.value as SampleStatus)} aria-label="Set exact status">{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select>
              </div>
            </section>

            <section className="mallard-v2-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Field collection</span><h2>Collection record</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveFieldInfo()}><Save size={17} /> Save</button></div>
              <div className="mallard-v2-form-grid two">
                <label><span>Collected at</span><input type="datetime-local" value={toInputDate(selected.collected_at)} onChange={(event) => setSelected({ ...selected, collected_at: new Date(event.target.value).toISOString() })} /></label>
                <label><span>Collected by</span><input value={selected.collector_name || ''} onChange={(event) => setSelected({ ...selected, collector_name: event.target.value })} /></label>
              </div>
              <label><span>Location</span><input value={selected.location} onChange={(event) => setSelected({ ...selected, location: event.target.value })} /></label>
              <div className="mallard-v2-form-grid two"><label><span>Latitude</span><input inputMode="decimal" value={selected.latitude ?? ''} onChange={(event) => setSelected({ ...selected, latitude: event.target.value ? Number(event.target.value) : null })} /></label><label><span>Longitude</span><input inputMode="decimal" value={selected.longitude ?? ''} onChange={(event) => setSelected({ ...selected, longitude: event.target.value ? Number(event.target.value) : null })} /></label></div>
              <div className="mallard-v2-form-grid two"><label><span>Customer / site</span><input value={selected.customer_site || ''} onChange={(event) => setSelected({ ...selected, customer_site: event.target.value })} /></label><label><span>Job / reference</span><input value={selected.job_reference || ''} onChange={(event) => setSelected({ ...selected, job_reference: event.target.value })} /></label></div>
              <div className="mallard-v2-form-grid two">
                <label><span>Sample matrix</span><select value={selected.sample_matrix || 'Unknown'} onChange={(event) => setSelected({ ...selected, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="mallard-v2-check"><input type="checkbox" checked={selected.priority} onChange={(event) => setSelected({ ...selected, priority: event.target.checked })} /><span><strong>Priority sample</strong><small>Highlight this record for attention.</small></span></label>
              </div>
              <label><span>Description of work</span><textarea rows={3} value={selected.description_of_work} onChange={(event) => setSelected({ ...selected, description_of_work: event.target.value })} /></label>
              <label><span>Suspected contents</span><textarea rows={3} value={selected.suspected_contents} onChange={(event) => setSelected({ ...selected, suspected_contents: event.target.value })} /></label>
              <label><span>Why sample was taken</span><textarea rows={3} value={selected.sample_reason} onChange={(event) => setSelected({ ...selected, sample_reason: event.target.value })} /></label>
              <label><span>Container / bottle notes</span><textarea rows={2} value={selected.container_notes || ''} onChange={(event) => setSelected({ ...selected, container_notes: event.target.value })} /></label>
              <label><span>Field notes</span><textarea rows={3} value={selected.field_notes || ''} onChange={(event) => setSelected({ ...selected, field_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-v2-panel disposal-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Disposal</span><h2>Where was it dumped?</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveDisposalInfo()}><Save size={17} /> Save</button></div>
              <div className="mallard-v2-facility-pills">
                {disposalSuggestions.map((facility) => <button type="button" className={selected.disposal_destination === facility ? 'active' : ''} key={facility} onClick={() => setSelected({ ...selected, disposal_destination: facility })}>{facility}</button>)}
                <button type="button" className={!selected.disposal_destination ? 'active muted' : 'muted'} onClick={() => setSelected({ ...selected, disposal_destination: null, disposed_at: null })}>Not dumped yet</button>
              </div>
              <label><span>Dump location</span><input list="mallard-disposal-facilities" value={selected.disposal_destination || ''} onChange={(event) => setSelected({ ...selected, disposal_destination: event.target.value || null })} placeholder="MROR, Secure, One Environmental or another facility" /></label>
              <datalist id="mallard-disposal-facilities">{disposalSuggestions.map((facility) => <option value={facility} key={facility} />)}</datalist>
              <div className="mallard-v2-form-grid two">
                <label><span>Dumped at</span><input type="datetime-local" value={toInputDate(selected.disposed_at)} onChange={(event) => setSelected({ ...selected, disposed_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
                <label><span>Disposal ticket / reference</span><input value={selected.disposal_reference || ''} onChange={(event) => setSelected({ ...selected, disposal_reference: event.target.value })} placeholder="Optional" /></label>
              </div>
              <label><span>Disposal notes</span><textarea rows={2} value={selected.disposal_notes || ''} onChange={(event) => setSelected({ ...selected, disposal_notes: event.target.value })} placeholder="Load details, restrictions, disposal notes..." /></label>
            </section>

            <section className="mallard-v2-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Mallard receiving</span><h2>Lab submission</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveLabInfo()}><Save size={17} /> Save</button></div>
              <div className="mallard-v2-form-grid two"><label><span>Received at</span><input type="datetime-local" value={toInputDate(selected.received_at)} onChange={(event) => setSelected({ ...selected, received_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label><span>Received by</span><input value={selected.received_by || ''} onChange={(event) => setSelected({ ...selected, received_by: event.target.value })} /></label></div>
              <div className="mallard-v2-form-grid two"><label><span>Laboratory</span><input value={selected.lab_name || ''} onChange={(event) => setSelected({ ...selected, lab_name: event.target.value })} placeholder="Lab name" /></label><label><span>Lab submission #</span><input value={selected.lab_submission_number || ''} onChange={(event) => setSelected({ ...selected, lab_submission_number: event.target.value })} /></label></div>
              <div className="mallard-v2-form-grid two"><label><span>Submitted at</span><input type="datetime-local" value={toInputDate(selected.submitted_at)} onChange={(event) => setSelected({ ...selected, submitted_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label><span>Results received</span><input type="datetime-local" value={toInputDate(selected.results_received_at)} onChange={(event) => setSelected({ ...selected, results_received_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label></div>
              <label><span>Final determination</span><textarea rows={3} value={selected.final_determination || ''} onChange={(event) => setSelected({ ...selected, final_determination: event.target.value })} placeholder="What the sample was ultimately identified as or how it was characterized" /></label>
              <label><span>Lab / receiving notes</span><textarea rows={3} value={selected.lab_notes || ''} onChange={(event) => setSelected({ ...selected, lab_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-v2-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Flexible results</span><h2>Test results</h2><p>Add exactly what the lab reports.</p></div><button className="secondary" type="button" onClick={addTestResult}><Plus size={17} /> Add test</button></div>
              {testResults.length === 0 ? <div className="mallard-v2-empty small">No test rows yet.</div> : (
                <div className="mallard-v2-test-list">
                  {testResults.map((row, index) => (
                    <div className="mallard-v2-test-card" key={row.id || `new-${index}`}>
                      <div className="mallard-v2-test-card-head"><strong>Test {index + 1}</strong><button className="mallard-v2-icon danger" type="button" onClick={() => removeTestResult(index)} aria-label="Remove test"><Trash2 size={17} /></button></div>
                      <label><span>Test name</span><input value={row.test_name} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, test_name: event.target.value } : item))} placeholder="pH, flash point, F1 hydrocarbons..." /></label>
                      <div className="mallard-v2-form-grid three"><label><span>Result</span><input value={row.result_value} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, result_value: event.target.value } : item))} /></label><label><span>Unit</span><input value={row.unit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unit: event.target.value } : item))} placeholder="mg/L, °C..." /></label><label><span>Qualifier</span><input value={row.qualifier} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, qualifier: event.target.value } : item))} placeholder="<, >, ND..." /></label></div>
                      <label><span>Notes</span><input value={row.notes} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, notes: event.target.value } : item))} /></label>
                    </div>
                  ))}
                </div>
              )}
              <div className="mallard-v2-panel-footer"><button className="primary" type="button" disabled={saving} onClick={() => void saveTestResults()}><Save size={18} /> Save test results</button></div>
            </section>

            <section className="mallard-v2-panel">
              <div className="mallard-v2-section-heading"><div><span className="mallard-v2-eyebrow">Audit trail</span><h2>History</h2></div></div>
              {events.length === 0 ? <div className="mallard-v2-empty small">No history yet.</div> : (
                <div className="mallard-v2-timeline">
                  {events.map((event) => (
                    <div className="mallard-v2-timeline-row" key={event.id}>
                      <span className="mallard-v2-timeline-dot" />
                      <div>
                        <strong>{event.event_type === 'status_change' && event.to_status ? `${event.from_status ? statusLabels[event.from_status as SampleStatus] : 'Status'} → ${statusLabels[event.to_status as SampleStatus]}` : eventLabels[event.event_type] || event.event_type.replaceAll('_', ' ')}</strong>
                        <span>{formatDate(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</span>
                        {event.note && <p>{event.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <button className="mallard-v2-archive-button" type="button" onClick={() => void archiveSample()}><Archive size={18} /> Archive this sample</button>
          </main>
        )}

        <nav className="mallard-v2-bottom-nav" aria-label="Mallard sample navigation">
          <button className={view === 'dashboard' ? 'active' : ''} type="button" onClick={() => setView('dashboard')}><Beaker size={21} /><span>Home</span></button>
          <button className={view === 'samples' || view === 'detail' ? 'active' : ''} type="button" onClick={() => setView('samples')}><ClipboardList size={21} /><span>Samples</span></button>
          <button className={view === 'new' ? 'active create' : 'create'} type="button" onClick={() => beginNewSample('oilfield')}><Plus size={24} /><span>New</span></button>
        </nav>
      </div>

      {printSample && (
        <div className="mallard-v2-print-label" aria-hidden="true">
          <div className="mallard-v2-print-brand">MALLARD ENVIRONMENTAL</div>
          <div className="mallard-v2-print-number">{printSample.sample_number}</div>
          <div className="mallard-v2-print-category">{categoryInfo[printSample.category].label.toUpperCase()}</div>
          <div>{formatDate(printSample.collected_at)}</div>
          <div>{printSample.location}</div>
          <div>Suspected: {printSample.suspected_contents}</div>
          {printSample.disposal_destination && <div>Dump: {printSample.disposal_destination}</div>}
        </div>
      )}
    </>
  )
}

function SampleRow({ sample, onOpen }: { sample: MallardSample; onOpen: () => void }) {
  return (
    <button className={`mallard-v2-sample-row ${sample.priority ? 'priority' : ''}`} type="button" onClick={onOpen}>
      <div className={`mallard-v2-sample-id ${categoryInfo[sample.category].tone}`}>{sample.sample_number}</div>
      <div className="mallard-v2-sample-row-main">
        <div className="mallard-v2-sample-row-top">
          <strong>{sample.customer_site || sample.location}</strong>
          <span className={`mallard-v2-status mini status-${sample.status}`}>{statusLabels[sample.status]}</span>
        </div>
        <p>{sample.customer_site ? sample.location : sample.suspected_contents}</p>
        <div className="mallard-v2-sample-row-meta">
          <span><CalendarDays size={14} /> {formatDate(sample.collected_at)}</span>
          {sample.collector_name && <span><UserRound size={14} /> {sample.collector_name}</span>}
          {sample.disposal_destination && <span><MapPin size={14} /> {sample.disposal_destination}</span>}
          {sample.final_determination && <span><Beaker size={14} /> {sample.final_determination}</span>}
        </div>
      </div>
    </button>
  )
}
