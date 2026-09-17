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
import './mallard-sample-tracker.css'

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
}

type SavedDraft = {
  id: string
  saved_at: string
  form: SampleForm
}

const db = supabase as any
const DRAFT_KEY = 'mallard_sample_drafts_v1'
const ACTOR_KEY = 'mallard_last_actor_v1'

const categoryInfo: Record<SampleCategory, { label: string; range: string; tone: string; description: string }> = {
  non_oilfield: { label: 'Non Oilfield', range: '1001 series', tone: 'blue', description: 'Commercial, municipal, residential and other non oilfield samples.' },
  oilfield: { label: 'Oilfield', range: '2001 series', tone: 'amber', description: 'Oilfield, lease, battery, facility and production related samples.' },
  odd_weird: { label: 'Odd / Weird', range: '3001 series', tone: 'violet', description: 'Unknown, unusual or hard to classify material.' },
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
  }
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function MallardSampleTracker() {
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
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | SampleCategory>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | SampleStatus>('all')
  const [actorName, setActorName] = React.useState(() => localStorage.getItem(ACTOR_KEY) || '')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [online, setOnline] = React.useState(() => navigator.onLine)
  const [printSample, setPrintSample] = React.useState<MallardSample | null>(null)

  const loadSamples = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await db.from('mallard_samples')
      .select('*')
      .eq('archived', false)
      .order('collected_at', { ascending: false })
    if (error) setMessage({ type: 'error', text: `Could not load samples: ${error.message}` })
    else setSamples(data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { void loadSamples() }, [loadSamples])

  React.useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

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

  const saveDraft = () => {
    const draftId = activeDraftId || crypto.randomUUID()
    const draft: SavedDraft = { id: draftId, saved_at: new Date().toISOString(), form: newForm }
    persistDrafts([draft, ...drafts.filter((item) => item.id !== draftId)].slice(0, 20))
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
      setMessage({ type: 'info', text: 'No connection. The sample was saved as a device draft and can be submitted when service returns.' })
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

  const saveFieldInfo = async () => {
    if (!selected) return
    setSaving(true)
    const payload = {
      collected_at: selected.collected_at,
      location: selected.location.trim(),
      latitude: selected.latitude || null,
      longitude: selected.longitude || null,
      customer_site: selected.customer_site?.trim() || null,
      job_reference: selected.job_reference?.trim() || null,
      description_of_work: selected.description_of_work.trim(),
      suspected_contents: selected.suspected_contents.trim(),
      sample_reason: selected.sample_reason.trim(),
      collector_name: selected.collector_name?.trim() || null,
      field_notes: selected.field_notes?.trim() || null,
      last_updated_by: actorName.trim() || selected.collector_name || null,
    }
    const { error } = await db.from('mallard_samples').update(payload).eq('id', selected.id)
    setSaving(false)
    if (error) setMessage({ type: 'error', text: `Could not save field information: ${error.message}` })
    else {
      setMessage({ type: 'success', text: 'Field information saved.' })
      await loadSamples()
      await openSample(selected.id)
    }
  }

  const saveLabInfo = async () => {
    if (!selected) return
    setSaving(true)
    const payload = {
      received_at: selected.received_at,
      received_by: selected.received_by?.trim() || null,
      lab_name: selected.lab_name?.trim() || null,
      lab_submission_number: selected.lab_submission_number?.trim() || null,
      submitted_at: selected.submitted_at,
      results_received_at: selected.results_received_at,
      final_determination: selected.final_determination?.trim() || null,
      lab_notes: selected.lab_notes?.trim() || null,
      last_updated_by: actorName.trim() || null,
    }
    const { error } = await db.from('mallard_samples').update(payload).eq('id', selected.id)
    setSaving(false)
    if (error) setMessage({ type: 'error', text: `Could not save lab information: ${error.message}` })
    else {
      setMessage({ type: 'success', text: 'Mallard and lab information saved.' })
      await loadSamples()
      await openSample(selected.id)
    }
  }

  const updateStatus = async (target: SampleStatus) => {
    if (!selected) return
    const actor = actorName.trim()
    if (!actor) {
      setMessage({ type: 'error', text: 'Enter your name before changing sample status.' })
      return
    }
    localStorage.setItem(ACTOR_KEY, actor)
    setSaving(true)
    const payload: Record<string, unknown> = { status: target, last_updated_by: actor }
    const now = new Date().toISOString()
    if (target === 'received' && !selected.received_at) {
      payload.received_at = now
      payload.received_by = actor
    }
    if (target === 'submitted' && !selected.submitted_at) payload.submitted_at = now
    if (target === 'results_received' && !selected.results_received_at) payload.results_received_at = now

    const { error } = await db.from('mallard_samples').update(payload).eq('id', selected.id)
    setSaving(false)
    if (error) setMessage({ type: 'error', text: `Could not update status: ${error.message}` })
    else {
      setMessage({ type: 'success', text: `Sample ${selected.sample_number} is now ${statusLabels[target]}.` })
      await loadSamples()
      await openSample(selected.id)
    }
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
    if (!window.confirm(`Archive sample ${selected.sample_number}? It will disappear from the active sample database.`)) return
    const { error } = await db.from('mallard_samples').update({ archived: true, last_updated_by: actorName.trim() || null }).eq('id', selected.id)
    if (error) setMessage({ type: 'error', text: `Could not archive sample: ${error.message}` })
    else {
      setSelected(null)
      setView('samples')
      await loadSamples()
      setMessage({ type: 'success', text: 'Sample archived.' })
    }
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
    const headers = ['Sample Number', 'Category', 'Status', 'Collected At', 'Location', 'Customer / Site', 'Job Reference', 'Description of Work', 'Suspected Contents', 'Reason', 'Collector', 'Lab', 'Lab Submission', 'Final Determination']
    const rows = samples.map((sample) => [
      sample.sample_number,
      categoryInfo[sample.category].label,
      statusLabels[sample.status],
      sample.collected_at,
      sample.location,
      sample.customer_site,
      sample.job_reference,
      sample.description_of_work,
      sample.suspected_contents,
      sample.sample_reason,
      sample.collector_name,
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
      if (!normalized) return true
      const haystack = [
        sample.sample_number,
        sample.location,
        sample.customer_site,
        sample.job_reference,
        sample.description_of_work,
        sample.suspected_contents,
        sample.sample_reason,
        sample.collector_name,
        sample.lab_name,
        sample.lab_submission_number,
        sample.final_determination,
      ].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [samples, query, categoryFilter, statusFilter])

  const stats = React.useMemo(() => ({
    total: samples.length,
    waiting: samples.filter((sample) => !['complete'].includes(sample.status)).length,
    lab: samples.filter((sample) => ['submitted', 'testing'].includes(sample.status)).length,
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
      <div className="mallard-app">
        <header className="mallard-header">
          <div>
            <p className="mallard-kicker">Mallard Environmental</p>
            <h1>Sample Tracker</h1>
            <p className="mallard-subtitle">Fast bottle tracking from collection through final lab result.</p>
          </div>
          <div className={`mallard-connection ${online ? 'online' : 'offline'}`}>
            {online ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
            {online ? 'Online' : 'Offline draft mode'}
          </div>
        </header>

        {message && <div className={`mallard-toast ${message.type}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss"><X size={18} /></button></div>}

        {view === 'dashboard' && (
          <main className="mallard-main">
            <section className="mallard-hero-card">
              <div>
                <span className="mallard-eyebrow">Create a bottle</span>
                <h2>What kind of sample is it?</h2>
                <p>The database assigns the permanent bottle number automatically.</p>
              </div>
              <div className="mallard-category-grid">
                {(Object.keys(categoryInfo) as SampleCategory[]).map((category) => {
                  const info = categoryInfo[category]
                  const nextNumber = samples.filter((sample) => sample.category === category).reduce((max, sample) => Math.max(max, sample.sample_number), Number(info.range.split(' ')[0]) - 1) + 1
                  return (
                    <button type="button" key={category} className={`mallard-category-card ${info.tone}`} onClick={() => beginNewSample(category)}>
                      <span className="mallard-category-number">{nextNumber}</span>
                      <strong>{info.label}</strong>
                      <span>{info.range}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mallard-number-note">The displayed next number is a preview. The database makes the final collision safe assignment when you save.</p>
            </section>

            <section className="mallard-stats-grid">
              <button type="button" onClick={() => setView('samples')}><span>Active records</span><strong>{stats.total}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('all'); setView('samples') }}><span>In progress</span><strong>{stats.waiting}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('submitted'); setView('samples') }}><span>At lab</span><strong>{stats.lab}</strong></button>
              <button type="button" onClick={() => { setStatusFilter('complete'); setView('samples') }}><span>Complete</span><strong>{stats.complete}</strong></button>
            </section>

            {drafts.length > 0 && (
              <section className="mallard-panel">
                <div className="mallard-section-heading"><div><span className="mallard-eyebrow">This device</span><h2>Saved drafts</h2></div><span className="mallard-count">{drafts.length}</span></div>
                <div className="mallard-draft-list">
                  {drafts.map((draft) => (
                    <div className="mallard-draft-row" key={draft.id}>
                      <button type="button" onClick={() => resumeDraft(draft)}>
                        <strong>{categoryInfo[draft.form.category].label}</strong>
                        <span>{draft.form.location || 'Location not entered'} · saved {formatDate(draft.saved_at)}</span>
                      </button>
                      <button className="icon-button danger" type="button" onClick={() => discardDraft(draft.id)} aria-label="Delete draft"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mallard-panel mallard-recent-panel">
              <div className="mallard-section-heading">
                <div><span className="mallard-eyebrow">Database</span><h2>Recent samples</h2></div>
                <button type="button" className="mallard-text-button" onClick={() => setView('samples')}>View all</button>
              </div>
              {loading ? <div className="mallard-empty">Loading samples…</div> : samples.length === 0 ? <div className="mallard-empty">No samples yet. Create the first bottle above.</div> : (
                <div className="mallard-sample-list compact">
                  {samples.slice(0, 5).map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}
                </div>
              )}
            </section>
          </main>
        )}

        {view === 'samples' && (
          <main className="mallard-main">
            <div className="mallard-page-heading">
              <div><span className="mallard-eyebrow">Sample database</span><h2>Find any bottle</h2></div>
              <div className="mallard-heading-actions">
                <button className="secondary" type="button" onClick={exportCsv}><Download size={18} /> Export CSV</button>
                <button className="primary" type="button" onClick={() => beginNewSample('oilfield')}><Plus size={18} /> New sample</button>
              </div>
            </div>

            <section className="mallard-search-panel">
              <label className="mallard-search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search number, location, contents, customer, result…" /></label>
              <div className="mallard-filter-row">
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
                <button className="secondary square" type="button" onClick={() => void loadSamples()} aria-label="Refresh samples"><RefreshCw size={18} /></button>
              </div>
            </section>

            <p className="mallard-results-count">Showing {filteredSamples.length} of {samples.length} active samples</p>
            {loading ? <div className="mallard-empty">Loading samples…</div> : filteredSamples.length === 0 ? <div className="mallard-empty">No samples match those filters.</div> : (
              <div className="mallard-sample-list">
                {filteredSamples.map((sample) => <SampleRow key={sample.id} sample={sample} onOpen={() => void openSample(sample.id)} />)}
              </div>
            )}
          </main>
        )}

        {view === 'new' && (
          <main className="mallard-main narrow">
            <button className="mallard-back" type="button" onClick={() => setView('dashboard')}><ChevronLeft size={18} /> Back</button>
            <div className="mallard-page-heading"><div><span className="mallard-eyebrow">New bottle</span><h2>{categoryInfo[newForm.category].label} sample</h2><p>{categoryInfo[newForm.category].range}</p></div></div>

            <form className="mallard-form" onSubmit={createSample}>
              <section className="mallard-panel">
                <h3>Collection details</h3>
                <div className="mallard-form-grid two">
                  <label><span>Category</span><select value={newForm.category} onChange={(event) => setNewForm({ ...newForm, category: event.target.value as SampleCategory })}><option value="non_oilfield">Non Oilfield · 1000 series</option><option value="oilfield">Oilfield · 2000 series</option><option value="odd_weird">Odd / Weird · 3000 series</option></select></label>
                  <label><span>Date and time *</span><input type="datetime-local" required value={newForm.collected_at} onChange={(event) => setNewForm({ ...newForm, collected_at: event.target.value })} /></label>
                </div>
                <label><span>Location *</span><input required value={newForm.location} onChange={(event) => setNewForm({ ...newForm, location: event.target.value })} placeholder="Lease, facility, address, LSD or site name" /></label>
                <div className="mallard-inline-action"><button className="secondary" type="button" onClick={captureLocation}><Navigation size={17} /> Add current GPS</button>{newForm.latitude && <span>{newForm.latitude}, {newForm.longitude}</span>}</div>
                <div className="mallard-form-grid two">
                  <label><span>Customer / site</span><input value={newForm.customer_site} onChange={(event) => setNewForm({ ...newForm, customer_site: event.target.value })} placeholder="Optional" /></label>
                  <label><span>Job / PO / reference</span><input value={newForm.job_reference} onChange={(event) => setNewForm({ ...newForm, job_reference: event.target.value })} placeholder="Optional" /></label>
                </div>
              </section>

              <section className="mallard-panel">
                <h3>What did you collect?</h3>
                <label><span>Description of work *</span><textarea required rows={3} value={newForm.description_of_work} onChange={(event) => setNewForm({ ...newForm, description_of_work: event.target.value })} placeholder="What were you doing when the sample was taken?" /></label>
                <label><span>What do you think is in it? *</span><textarea required rows={3} value={newForm.suspected_contents} onChange={(event) => setNewForm({ ...newForm, suspected_contents: event.target.value })} placeholder="Example: oily water, produced water, glycol, unknown black liquid" /></label>
                <label><span>Why was the sample taken? *</span><textarea required rows={3} value={newForm.sample_reason} onChange={(event) => setNewForm({ ...newForm, sample_reason: event.target.value })} placeholder="Disposal request, unknown material, customer request, verification…" /></label>
              </section>

              <section className="mallard-panel">
                <h3>Collector notes</h3>
                <label><span>Collected by</span><input value={newForm.collector_name} onChange={(event) => setNewForm({ ...newForm, collector_name: event.target.value })} placeholder="Your name" /></label>
                <label><span>Field notes</span><textarea rows={3} value={newForm.field_notes} onChange={(event) => setNewForm({ ...newForm, field_notes: event.target.value })} placeholder="Colour, smell, layers, temperature, anything unusual" /></label>
              </section>

              <div className="mallard-form-actions sticky-actions">
                <button className="secondary" type="button" onClick={saveDraft}><Save size={18} /> Save draft</button>
                <button className="primary large" type="submit" disabled={saving}>{saving ? 'Creating…' : <><FlaskConical size={19} /> Create sample number</>}</button>
              </div>
            </form>
          </main>
        )}

        {view === 'detail' && selected && (
          <main className="mallard-main narrow detail-page">
            <button className="mallard-back" type="button" onClick={() => setView('samples')}><ChevronLeft size={18} /> Sample database</button>
            <section className={`mallard-sample-hero ${categoryInfo[selected.category].tone}`}>
              <div><span className="mallard-eyebrow">Permanent bottle ID</span><div className="mallard-big-number">{selected.sample_number}</div><div className="mallard-hero-meta"><span>{categoryInfo[selected.category].label}</span><span>{formatDate(selected.collected_at)}</span></div></div>
              <div className="mallard-hero-actions"><span className={`mallard-status status-${selected.status}`}>{statusLabels[selected.status]}</span><button className="secondary light" type="button" onClick={() => requestPrint(selected)}><Printer size={18} /> Print label</button></div>
            </section>

            <section className="mallard-panel status-panel">
              <div className="mallard-section-heading"><div><span className="mallard-eyebrow">Chain of custody</span><h2>Sample status</h2></div></div>
              <label><span>Name making this update</span><input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="Required for status changes" /></label>
              <div className="mallard-status-track">
                {statusOrder.map((status, index) => {
                  const currentIndex = statusOrder.indexOf(selected.status)
                  return <div key={status} className={`mallard-status-step ${index <= currentIndex ? 'done' : ''} ${status === selected.status ? 'current' : ''}`}><span>{index + 1}</span><small>{statusLabels[status]}</small></div>
                })}
              </div>
              <div className="mallard-quick-actions">
                {quickTargets.map((target) => <button className="primary" type="button" key={target} disabled={saving} onClick={() => void updateStatus(target)}>{target === 'received' ? <PackageCheck size={18} /> : target === 'submitted' ? <Send size={18} /> : target === 'results_received' ? <TestTube2 size={18} /> : <CheckCircle2 size={18} />}{statusLabels[target]}</button>)}
                <select value={selected.status} onChange={(event) => void updateStatus(event.target.value as SampleStatus)} aria-label="Set exact status">{statusOrder.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select>
              </div>
            </section>

            <section className="mallard-panel">
              <div className="mallard-section-heading"><div><span className="mallard-eyebrow">Collector record</span><h2>Field information</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveFieldInfo()}><Save size={17} /> Save</button></div>
              <div className="mallard-form-grid two">
                <label><span>Collected at</span><input type="datetime-local" value={toInputDate(selected.collected_at)} onChange={(event) => setSelected({ ...selected, collected_at: new Date(event.target.value).toISOString() })} /></label>
                <label><span>Collected by</span><input value={selected.collector_name || ''} onChange={(event) => setSelected({ ...selected, collector_name: event.target.value })} /></label>
              </div>
              <label><span>Location</span><input value={selected.location} onChange={(event) => setSelected({ ...selected, location: event.target.value })} /></label>
              <div className="mallard-form-grid two"><label><span>Latitude</span><input inputMode="decimal" value={selected.latitude ?? ''} onChange={(event) => setSelected({ ...selected, latitude: event.target.value ? Number(event.target.value) : null })} /></label><label><span>Longitude</span><input inputMode="decimal" value={selected.longitude ?? ''} onChange={(event) => setSelected({ ...selected, longitude: event.target.value ? Number(event.target.value) : null })} /></label></div>
              <div className="mallard-form-grid two"><label><span>Customer / site</span><input value={selected.customer_site || ''} onChange={(event) => setSelected({ ...selected, customer_site: event.target.value })} /></label><label><span>Job / reference</span><input value={selected.job_reference || ''} onChange={(event) => setSelected({ ...selected, job_reference: event.target.value })} /></label></div>
              <label><span>Description of work</span><textarea rows={3} value={selected.description_of_work} onChange={(event) => setSelected({ ...selected, description_of_work: event.target.value })} /></label>
              <label><span>Suspected contents</span><textarea rows={3} value={selected.suspected_contents} onChange={(event) => setSelected({ ...selected, suspected_contents: event.target.value })} /></label>
              <label><span>Why sample was taken</span><textarea rows={3} value={selected.sample_reason} onChange={(event) => setSelected({ ...selected, sample_reason: event.target.value })} /></label>
              <label><span>Field notes</span><textarea rows={3} value={selected.field_notes || ''} onChange={(event) => setSelected({ ...selected, field_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-panel">
              <div className="mallard-section-heading"><div><span className="mallard-eyebrow">Mallard receiving</span><h2>Lab submission</h2></div><button className="secondary" type="button" disabled={saving} onClick={() => void saveLabInfo()}><Save size={17} /> Save</button></div>
              <div className="mallard-form-grid two"><label><span>Received at</span><input type="datetime-local" value={toInputDate(selected.received_at)} onChange={(event) => setSelected({ ...selected, received_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label><span>Received by</span><input value={selected.received_by || ''} onChange={(event) => setSelected({ ...selected, received_by: event.target.value })} /></label></div>
              <div className="mallard-form-grid two"><label><span>Laboratory</span><input value={selected.lab_name || ''} onChange={(event) => setSelected({ ...selected, lab_name: event.target.value })} placeholder="Lab name" /></label><label><span>Lab submission #</span><input value={selected.lab_submission_number || ''} onChange={(event) => setSelected({ ...selected, lab_submission_number: event.target.value })} /></label></div>
              <div className="mallard-form-grid two"><label><span>Submitted at</span><input type="datetime-local" value={toInputDate(selected.submitted_at)} onChange={(event) => setSelected({ ...selected, submitted_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label><span>Results received</span><input type="datetime-local" value={toInputDate(selected.results_received_at)} onChange={(event) => setSelected({ ...selected, results_received_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label></div>
              <label><span>Final determination</span><textarea rows={3} value={selected.final_determination || ''} onChange={(event) => setSelected({ ...selected, final_determination: event.target.value })} placeholder="What the sample was ultimately identified as or how it was characterized" /></label>
              <label><span>Lab / receiving notes</span><textarea rows={3} value={selected.lab_notes || ''} onChange={(event) => setSelected({ ...selected, lab_notes: event.target.value })} /></label>
            </section>

            <section className="mallard-panel">
              <div className="mallard-section-heading"><div><span className="mallard-eyebrow">Flexible results</span><h2>Test results</h2><p>Add whatever tests the lab actually reports.</p></div><button className="secondary" type="button" onClick={addTestResult}><Plus size={17} /> Add test</button></div>
              {testResults.length === 0 ? <div className="mallard-empty small">No test rows yet.</div> : (
                <div className="mallard-test-list">
                  {testResults.map((row, index) => (
                    <div className="mallard-test-card" key={row.id || `new-${index}`}>
                      <div className="mallard-test-card-head"><strong>Test {index + 1}</strong><button className="icon-button danger" type="button" onClick={() => removeTestResult(index)} aria-label="Remove test"><Trash2 size={17} /></button></div>
                      <label><span>Test name</span><input value={row.test_name} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, test_name: event.target.value } : item))} placeholder="pH, flash point, F1 hydrocarbons…" /></label>
                      <div className="mallard-form-grid three"><label><span>Result</span><input value={row.result_value} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, result_value: event.target.value } : item))} /></label><label><span>Unit</span><input value={row.unit} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, unit: event.target.value } : item))} placeholder="mg/L, °C…" /></label><label><span>Qualifier</span><input value={row.qualifier} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, qualifier: event.target.value } : item))} placeholder="<, >, ND…" /></label></div>
                      <label><span>Notes</span><input value={row.notes} onChange={(event) => setTestResults((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, notes: event.target.value } : item))} /></label>
                    </div>
                  ))}
                </div>
              )}
              <div className="mallard-panel-footer"><button className="primary" type="button" disabled={saving} onClick={() => void saveTestResults()}><Save size={18} /> Save test results</button></div>
            </section>

            <section className="mallard-panel">
              <div className="mallard-section-heading"><div><span className="mallard-eyebrow">Audit trail</span><h2>History</h2></div></div>
              {events.length === 0 ? <div className="mallard-empty small">No history yet.</div> : <div className="mallard-timeline">{events.map((event) => <div className="mallard-timeline-row" key={event.id}><span className="mallard-timeline-dot" /><div><strong>{event.event_type === 'created' ? 'Sample created' : `${event.from_status ? statusLabels[event.from_status as SampleStatus] : 'Status'} → ${event.to_status ? statusLabels[event.to_status as SampleStatus] : 'Updated'}`}</strong><span>{formatDate(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</span>{event.note && <p>{event.note}</p>}</div></div>)}</div>}
            </section>

            <button className="mallard-archive-button" type="button" onClick={() => void archiveSample()}><Archive size={18} /> Archive this sample</button>
          </main>
        )}

        <nav className="mallard-bottom-nav" aria-label="Mallard sample navigation">
          <button className={view === 'dashboard' ? 'active' : ''} type="button" onClick={() => setView('dashboard')}><Beaker size={21} /><span>Home</span></button>
          <button className={view === 'samples' || view === 'detail' ? 'active' : ''} type="button" onClick={() => setView('samples')}><ClipboardList size={21} /><span>Samples</span></button>
          <button className={view === 'new' ? 'active create' : 'create'} type="button" onClick={() => beginNewSample('oilfield')}><Plus size={24} /><span>New</span></button>
        </nav>
      </div>

      {printSample && (
        <div className="mallard-print-label" aria-hidden="true">
          <div className="mallard-print-brand">MALLARD ENVIRONMENTAL</div>
          <div className="mallard-print-number">{printSample.sample_number}</div>
          <div className="mallard-print-category">{categoryInfo[printSample.category].label.toUpperCase()}</div>
          <div className="mallard-print-date">{formatDate(printSample.collected_at)}</div>
          <div className="mallard-print-location">{printSample.location}</div>
          <div className="mallard-print-contents">Suspected: {printSample.suspected_contents}</div>
        </div>
      )}
    </>
  )
}

function SampleRow({ sample, onOpen }: { sample: MallardSample; onOpen: () => void }) {
  return (
    <button className="mallard-sample-row" type="button" onClick={onOpen}>
      <div className={`mallard-sample-id ${categoryInfo[sample.category].tone}`}>{sample.sample_number}</div>
      <div className="mallard-sample-row-main">
        <div className="mallard-sample-row-top"><strong>{sample.customer_site || sample.location}</strong><span className={`mallard-status mini status-${sample.status}`}>{statusLabels[sample.status]}</span></div>
        <p>{sample.customer_site ? sample.location : sample.suspected_contents}</p>
        <div className="mallard-sample-row-meta"><span><CalendarDays size={14} /> {formatDate(sample.collected_at)}</span>{sample.collector_name && <span><UserRound size={14} /> {sample.collector_name}</span>}{sample.final_determination && <span><Beaker size={14} /> {sample.final_determination}</span>}</div>
      </div>
    </button>
  )
}
