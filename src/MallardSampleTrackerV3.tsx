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
import './mallard-sample-tracker-v3.css'

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
  customer_site: string | null
  description_of_work: string
  suspected_contents: string
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

const db = supabase as any
const DRAFT_KEY = 'mallard_sample_drafts_v3'
const ACTOR_KEY = 'mallard_last_actor_v1'

const categoryInfo: Record<SampleCategory, { label: string; range: string; tone: string }> = {
  non_oilfield: { label: 'Non Oilfield', range: '1000 series', tone: 'green' },
  oilfield: { label: 'Oilfield', range: '2000 series', tone: 'gold' },
  odd_weird: { label: 'Odd / Weird', range: '3000 series', tone: 'grey' },
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

function blankForm(category: SampleCategory = 'oilfield'): SampleForm {
  return {
    category,
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

export default function MallardSampleTrackerV3() {
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
    const timer = window.setTimeout(() => setMessage(null), 4500)
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
      category: newForm.category,
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
      setMessage({ type: 'error', text: 'This sample changed on another device. I refreshed the latest version.' })
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
      customer_site: selected.customer_site?.trim() || null,
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
      final_determination: selected.final_determination?.trim() || null,
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
      setMessage({ type: 'error', text: error?.message || 'This record changed before it could be archived.' })
      return
    }
    setSelected(null)
    setView('samples')
    await loadSamples()
    setMessage({ type: 'success', text: 'Sample archived.' })
  }

  const deleteSample = async () => {
    if (!selected) return
    const confirmed = window.confirm(
      `Permanently delete sample ${selected.sample_number}?\n\nThis deletes the sample, its lab results and its history. This cannot be undone.\n\nSample number ${selected.sample_number} will not be reused.`
    )
    if (!confirmed) return
    setSaving(true)
    const { data, error } = await db.from('mallard_samples').delete().eq('id', selected.id).select('id')
    setSaving(false)
    if (error || !data || data.length !== 1) {
      setMessage({ type: 'error', text: error?.message || 'The sample was not deleted. Refresh and try again.' })
      return
    }
    setSelected(null)
    setView('samples')
    await loadSamples()
    setMessage({ type: 'success', text: `Sample ${selected.sample_number} permanently deleted.` })
  }

  const exportCsv = () => {
    const headers = ['Sample Number', 'Category', 'Status', 'Priority', 'Collection Date', 'Location', 'Customer / Site', 'Matrix', 'Description of Work', 'Suspected Contents', 'Collector', 'Dump Location', 'Dump Date', 'Lab', 'Lab Submission', 'Final Determination']
    const rows = samples.map((sample) => [
      sample.sample_number,
      categoryInfo[sample.category].label,
      statusLabels[sample.status],
      sample.priority ? 'Yes' : 'No',
      toDateValue(sample.collected_at),
      sample.location,
      sample.customer_site,
      sample.sample_matrix,
      sample.description_of_work,
      sample.suspected_contents,
      sample.collector_name,
      sample.disposal_destination,
      sample.disposed_at ? toDateValue(sample.disposed_at) : '',
      sample.lab_name,
      sample.lab_submission_number,
      sample.final_determination,
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mallard-samples-${todayForInput()}.csv`
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
        sample.sample_matrix,
        sample.description_of_work,
        sample.suspected_contents,
        sample.collector_name,
        sample.disposal_destination,
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
      <div className="mallard-v3-app">
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
            <section className="mallard-v3-hero">
              <div><span className="eyebrow">Fast field entry</span><h2>Start a new sample</h2><p>Pick the sample type. The number shown is the next permanent database number.</p></div>
              <div className="mallard-v3-category-grid">
                {(Object.keys(categoryInfo) as SampleCategory[]).map((category) => (
                  <button type="button" key={category} className={`mallard-v3-category ${categoryInfo[category].tone}`} onClick={() => beginNewSample(category)}>
                    <span>Next</span><strong>{nextNumbers[category]}</strong><b>{categoryInfo[category].label}</b><small>{categoryInfo[category].range}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="mallard-v3-quick-search">
              <Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setView('samples') }} placeholder="Search number, site, contents or dump location" /><button type="button" onClick={() => setView('samples')}>Search</button>
            </section>

            <section className="mallard-v3-stats">
              <button type="button" onClick={() => { setStatusFilter('all'); setView('samples') }}><span>Active</span><strong>{stats.total}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('collected'); setView('samples') }}><span>To deliver</span><strong>{stats.toDeliver}</strong></button>
              <button type="button" onClick={() => { setDisposalFilter('undumped'); setView('samples') }}><span>No dump site</span><strong>{stats.awaitingDisposal}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('complete'); setView('samples') }}><span>Complete</span><strong>{stats.complete}</strong></button>
            </section>

            {drafts.length > 0 && (
              <section className="mallard-v3-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">This device</span><h2>Saved drafts</h2></div><span className="count">{drafts.length}</span></div>
                <div className="mallard-v3-drafts">
                  {drafts.map((draft) => <div key={draft.id}><button type="button" onClick={() => resumeDraft(draft)}><strong>{categoryInfo[draft.form.category].label}</strong><span>{draft.form.location || 'Location not entered'} · {formatDate(draft.saved_at)}</span></button><button className="icon-danger" type="button" onClick={() => discardDraft(draft.id)} aria-label="Delete draft"><Trash2 size={18} /></button></div>)}
                </div>
              </section>
            )}

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Database</span><h2>Recent samples</h2></div><button className="link" type="button" onClick={() => setView('samples')}>View all</button></div>
              {loading ? <div className="empty">Loading samples...</div> : samples.length === 0 ? <div className="empty">No samples yet.</div> : <div className="mallard-v3-sample-list">{samples.slice(0, 6).map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}</div>}
            </section>
          </main>
        )}

        {view === 'samples' && (
          <main className="mallard-v3-main">
            <div className="mallard-v3-page-heading"><div><span className="eyebrow">Sample database</span><h2>Samples</h2></div><div><button className="secondary" type="button" onClick={exportCsv}><Download size={18} /> Export</button><button className="primary" type="button" onClick={() => beginNewSample('oilfield')}><Plus size={18} /> New</button></div></div>
            <section className="mallard-v3-filters">
              <label className="search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search samples" /></label>
              <div>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as any)}><option value="all">All types</option><option value="non_oilfield">Non Oilfield</option><option value="oilfield">Oilfield</option><option value="odd_weird">Odd / Weird</option></select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}><option value="all">All statuses</option>{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select>
                <select value={disposalFilter} onChange={(event) => setDisposalFilter(event.target.value)}><option value="all">All dump sites</option><option value="undumped">Not entered</option>{disposalSuggestions.map((facility) => <option key={facility} value={facility}>{facility}</option>)}</select>
                <button className="secondary square" type="button" onClick={() => void loadSamples()} aria-label="Refresh"><RefreshCw size={18} /></button>
              </div>
            </section>
            <p className="results-count">Showing {filteredSamples.length} of {samples.length}</p>
            {loading ? <div className="empty">Loading...</div> : filteredSamples.length === 0 ? <div className="empty">No samples match.</div> : <div className="mallard-v3-sample-list">{filteredSamples.map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}</div>}
          </main>
        )}

        {view === 'new' && (
          <main className="mallard-v3-main narrow">
            <button className="back" type="button" onClick={() => setView('dashboard')}><ChevronLeft size={18} /> Back</button>
            <div className="mallard-v3-page-heading"><div><span className="eyebrow">New sample</span><h2>{categoryInfo[newForm.category].label}</h2><p>Expected bottle <strong>{nextNumbers[newForm.category]}</strong></p></div></div>
            <form className="mallard-v3-form" onSubmit={createSample}>
              <section className="mallard-v3-panel compact">
                <div className="mallard-v3-segmented">{(Object.keys(categoryInfo) as SampleCategory[]).map((category) => <button key={category} type="button" className={newForm.category === category ? 'active' : ''} onClick={() => setNewForm({ ...newForm, category })}><strong>{categoryInfo[category].label}</strong><span>{categoryInfo[category].range}</span></button>)}</div>
              </section>

              <section className="mallard-v3-panel">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Collection</span><h2>Sample details</h2></div></div>
                <div className="grid two"><label><span>Collection date *</span><input type="date" required value={newForm.collected_date} onChange={(event) => setNewForm({ ...newForm, collected_date: event.target.value })} /></label><label><span>Collected by</span><input value={newForm.collector_name} onChange={(event) => setNewForm({ ...newForm, collector_name: event.target.value })} placeholder="Your name" /></label></div>
                <label><span>Location *</span><input required value={newForm.location} onChange={(event) => setNewForm({ ...newForm, location: event.target.value })} placeholder="Lease, facility, address, LSD or site" /></label>
                <label><span>Customer / site</span><input value={newForm.customer_site} onChange={(event) => setNewForm({ ...newForm, customer_site: event.target.value })} placeholder="Optional" /></label>
                <div className="grid two"><label><span>Sample matrix</span><select value={newForm.sample_matrix} onChange={(event) => setNewForm({ ...newForm, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="check"><input type="checkbox" checked={newForm.priority} onChange={(event) => setNewForm({ ...newForm, priority: event.target.checked })} /><span><strong>Priority</strong><small>Flag for attention</small></span></label></div>
                <label><span>Description of work *</span><textarea required rows={2} value={newForm.description_of_work} onChange={(event) => setNewForm({ ...newForm, description_of_work: event.target.value })} placeholder="What work was being done?" /></label>
                <label><span>What do you think is in it? *</span><textarea required rows={2} value={newForm.suspected_contents} onChange={(event) => setNewForm({ ...newForm, suspected_contents: event.target.value })} placeholder="Oily water, produced water, glycol, unknown liquid..." /></label>
                <label><span>Field notes</span><textarea rows={2} value={newForm.field_notes} onChange={(event) => setNewForm({ ...newForm, field_notes: event.target.value })} placeholder="Colour, smell, layers or anything unusual" /></label>
              </section>

              <section className="mallard-v3-panel disposal">
                <div className="mallard-v3-heading"><div><span className="eyebrow">Disposal</span><h2>Where was it dumped?</h2></div></div>
                <div className="facility-pills">{disposalSuggestions.map((facility) => <button type="button" className={newForm.disposal_destination === facility ? 'active' : ''} key={facility} onClick={() => setNewForm({ ...newForm, disposal_destination: facility })}>{facility}</button>)}<button type="button" className={!newForm.disposal_destination ? 'active muted' : 'muted'} onClick={() => setNewForm({ ...newForm, disposal_destination: '', disposal_date: '' })}>Not dumped yet</button></div>
                <div className="grid two"><label><span>Dump location</span><input list="mallard-disposal-facilities-new" value={newForm.disposal_destination} onChange={(event) => setNewForm({ ...newForm, disposal_destination: event.target.value })} placeholder="Optional" /></label><label><span>Dump date</span><input type="date" disabled={!newForm.disposal_destination} value={newForm.disposal_date} onChange={(event) => setNewForm({ ...newForm, disposal_date: event.target.value })} /></label></div>
                <datalist id="mallard-disposal-facilities-new">{disposalSuggestions.map((facility) => <option value={facility} key={facility} />)}</datalist>
              </section>

              <div className="mallard-v3-assignment"><span>Expected bottle</span><strong>{nextNumbers[newForm.category]}</strong><small>Confirmed when saved</small></div>
              <div className="mallard-v3-sticky-actions"><button className="secondary" type="button" onClick={saveDraft}><Save size={18} /> Draft</button><button className="primary large" type="submit" disabled={saving}>{saving ? 'Creating...' : <><FlaskConical size={19} /> Create sample</>}</button></div>
            </form>
          </main>
        )}

        {view === 'detail' && selected && (
          <main className="mallard-v3-main narrow detail">
            <button className="back" type="button" onClick={() => setView('samples')}><ChevronLeft size={18} /> Samples</button>
            <section className={`mallard-v3-sample-hero ${categoryInfo[selected.category].tone}`}>
              <div><span className="eyebrow">Permanent bottle ID</span><div className="big-number">{selected.sample_number}</div><div className="meta"><span>{categoryInfo[selected.category].label}</span><span>{selected.sample_matrix || 'Unknown matrix'}</span></div></div>
              <div className="actions">{selected.priority && <span className="priority">Priority</span>}<span className={`status status-${selected.status}`}>{statusLabels[selected.status]}</span><button className="secondary light" type="button" onClick={() => requestPrint(selected)}><Printer size={18} /> Label</button></div>
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
              <label><span>Location</span><input value={selected.location} onChange={(event) => setSelected({ ...selected, location: event.target.value })} /></label>
              <label><span>Customer / site</span><input value={selected.customer_site || ''} onChange={(event) => setSelected({ ...selected, customer_site: event.target.value })} /></label>
              <div className="grid two"><label><span>Sample matrix</span><select value={selected.sample_matrix || 'Unknown'} onChange={(event) => setSelected({ ...selected, sample_matrix: event.target.value })}>{matrixOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="check"><input type="checkbox" checked={selected.priority} onChange={(event) => setSelected({ ...selected, priority: event.target.checked })} /><span><strong>Priority</strong><small>Highlight this sample</small></span></label></div>
              <label><span>Description of work</span><textarea rows={2} value={selected.description_of_work} onChange={(event) => setSelected({ ...selected, description_of_work: event.target.value })} /></label>
              <label><span>Suspected contents</span><textarea rows={2} value={selected.suspected_contents} onChange={(event) => setSelected({ ...selected, suspected_contents: event.target.value })} /></label>
              <label><span>Field notes</span><textarea rows={2} value={selected.field_notes || ''} onChange={(event) => setSelected({ ...selected, field_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Mallard receiving</span><h2>Lab submission</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveLabInfo()}><Save size={17} /> Save</button></div>
              <div className="grid two"><label><span>Received date</span><input type="date" value={toDateValue(selected.received_at)} onChange={(event) => setSelected({ ...selected, received_at: dateToIso(event.target.value) })} /></label><label><span>Received by</span><input value={selected.received_by || ''} onChange={(event) => setSelected({ ...selected, received_by: event.target.value })} /></label></div>
              <div className="grid two"><label><span>Laboratory</span><input value={selected.lab_name || ''} onChange={(event) => setSelected({ ...selected, lab_name: event.target.value })} placeholder="Lab name" /></label><label><span>Lab submission #</span><input value={selected.lab_submission_number || ''} onChange={(event) => setSelected({ ...selected, lab_submission_number: event.target.value })} /></label></div>
              <div className="grid two"><label><span>Submitted date</span><input type="date" value={toDateValue(selected.submitted_at)} onChange={(event) => setSelected({ ...selected, submitted_at: dateToIso(event.target.value) })} /></label><label><span>Results received date</span><input type="date" value={toDateValue(selected.results_received_at)} onChange={(event) => setSelected({ ...selected, results_received_at: dateToIso(event.target.value) })} /></label></div>
              <label><span>Final determination</span><textarea rows={2} value={selected.final_determination || ''} onChange={(event) => setSelected({ ...selected, final_determination: event.target.value })} /></label>
              <label><span>Lab / receiving notes</span><textarea rows={2} value={selected.lab_notes || ''} onChange={(event) => setSelected({ ...selected, lab_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Results</span><h2>Test results</h2></div><button className="secondary" type="button" onClick={addTestResult}><Plus size={17} /> Add test</button></div>
              {testResults.length === 0 ? <div className="empty small">No test rows yet.</div> : <div className="test-list">{testResults.map((row, index) => <div className="test-card" key={row.id || `new-${index}`}><div className="test-head"><strong>Test {index + 1}</strong><button className="icon-danger" type="button" onClick={() => removeTestResult(index)} aria-label="Remove test"><Trash2 size={17} /></button></div><label><span>Test name</span><input value={row.test_name} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, test_name: event.target.value } : item))} /></label><div className="grid three"><label><span>Result</span><input value={row.result_value} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, result_value: event.target.value } : item))} /></label><label><span>Unit</span><input value={row.unit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unit: event.target.value } : item))} /></label><label><span>Qualifier</span><input value={row.qualifier} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, qualifier: event.target.value } : item))} /></label></div><label><span>Notes</span><input value={row.notes} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, notes: event.target.value } : item))} /></label></div>)}</div>}
              <div className="panel-footer"><button className="primary" type="button" disabled={saving} onClick={() => void saveTestResults()}><Save size={18} /> Save results</button></div>
            </section>

            <section className="mallard-v3-panel">
              <div className="mallard-v3-heading"><div><span className="eyebrow">Audit trail</span><h2>History</h2></div></div>
              {events.length === 0 ? <div className="empty small">No history yet.</div> : <div className="timeline">{events.map((event) => <div className="timeline-row" key={event.id}><span className="dot" /><div><strong>{event.event_type === 'status_change' && event.to_status ? `${event.from_status ? statusLabels[event.from_status as SampleStatus] : 'Status'} → ${statusLabels[event.to_status as SampleStatus]}` : eventLabels[event.event_type] || event.event_type.replaceAll('_', ' ')}</strong><span>{formatDate(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</span>{event.note && <p>{event.note}</p>}</div></div>)}</div>}
            </section>

            <div className="danger-zone"><button className="archive" type="button" onClick={() => void archiveSample()}><Archive size={18} /> Archive sample</button><button className="delete" type="button" disabled={saving} onClick={() => void deleteSample()}><Trash2 size={18} /> Delete sample {selected.sample_number}</button></div>
          </main>
        )}

        <nav className="mallard-v3-bottom-nav" aria-label="Mallard navigation">
          <button className={view === 'dashboard' ? 'active' : ''} type="button" onClick={() => setView('dashboard')}><Beaker size={21} /><span>Home</span></button>
          <button className={view === 'samples' || view === 'detail' ? 'active' : ''} type="button" onClick={() => setView('samples')}><ClipboardList size={21} /><span>Samples</span></button>
          <button className={view === 'new' ? 'active create' : 'create'} type="button" onClick={() => beginNewSample('oilfield')}><Plus size={24} /><span>New</span></button>
        </nav>
      </div>

      {printSample && <div className="mallard-v3-print-label" aria-hidden="true"><div className="brand">MALLARD ENVIRONMENTAL</div><div className="number">{printSample.sample_number}</div><div className="category">{categoryInfo[printSample.category].label.toUpperCase()}</div><div>{formatDate(printSample.collected_at)}</div><div>{printSample.location}</div><div>Suspected: {printSample.suspected_contents}</div>{printSample.disposal_destination && <div>Dump: {printSample.disposal_destination}</div>}</div>}
    </>
  )
}

function SampleRow({ sample, onOpen }: { sample: MallardSample; onOpen: () => void }) {
  return <button className={`mallard-v3-sample-row ${sample.priority ? 'priority' : ''}`} type="button" onClick={onOpen}><div className={`sample-id ${categoryInfo[sample.category].tone}`}>{sample.sample_number}</div><div className="sample-main"><div className="sample-top"><strong>{sample.customer_site || sample.location}</strong><span className={`status mini status-${sample.status}`}>{statusLabels[sample.status]}</span></div><p>{sample.customer_site ? sample.location : sample.suspected_contents}</p><div className="sample-meta"><span><CalendarDays size={14} /> {formatDate(sample.collected_at)}</span>{sample.collector_name && <span><UserRound size={14} /> {sample.collector_name}</span>}{sample.disposal_destination && <span><MapPin size={14} /> {sample.disposal_destination}</span>}</div></div></button>
}
