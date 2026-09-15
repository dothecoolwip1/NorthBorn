import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardPlus,
  Clock3,
  Eye,
  FileSearch,
  FileText,
  FileWarning,
  FolderSearch,
  GraduationCap,
  HardHat,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './safety.css'

const db = supabase as any

type Props = {
  organizationId: string
  userId: string
  roleKey: string
  organizationName: string
}

type Employee = {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  position: string | null
  status: string
}

type Job = {
  id: string
  job_number: string
  title: string
  site_name: string | null
  status: string
}

type Credential = {
  id: string
  organization_id: string
  employee_id: string
  credential_type: string
  title: string
  issuer: string | null
  credential_number: string | null
  issued_on: string | null
  expires_on: string | null
  status: string
  file_path: string
  notes: string | null
  uploaded_by: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

type SafetyDocument = {
  id: string
  organization_id: string
  category: string
  title: string
  description: string | null
  tags: string[]
  version: string | null
  effective_date: string | null
  review_date: string | null
  status: string
  file_path: string
  created_by: string
  created_at: string
  updated_at: string
}

type FormSubmission = {
  id: string
  organization_id: string
  employee_id: string | null
  job_id: string | null
  form_type: FormType
  title: string
  answers: Record<string, unknown>
  status: string
  submitted_by: string
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

type Tab = 'overview' | 'credentials' | 'library' | 'forms'
type FormType = 'flha' | 'incident_report' | 'near_miss' | 'hazard_observation' | 'toolbox_talk'
type FieldDefinition = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'datetime-local' | 'select'
  required?: boolean
  placeholder?: string
  options?: string[]
}
type FormDefinition = {
  key: FormType
  name: string
  shortName: string
  description: string
  fields: FieldDefinition[]
}

type SafetyData = {
  employees: Employee[]
  jobs: Job[]
  credentials: Credential[]
  documents: SafetyDocument[]
  submissions: FormSubmission[]
}

const EMPTY: SafetyData = { employees: [], jobs: [], credentials: [], documents: [], submissions: [] }
const TEST_SAFETY_KEY = 'northborn_safety_test_v1'
const TEST_DATA_KEY = 'northborn_test_data_v3'

const FORM_DEFINITIONS: FormDefinition[] = [
  {
    key: 'flha',
    name: 'Field Level Hazard Assessment',
    shortName: 'FLHA',
    description: 'Identify the work, hazards and controls before the job starts.',
    fields: [
      { key: 'work_area', label: 'Work area or location', type: 'text', required: true, placeholder: 'Tank farm, lease road, excavation area...' },
      { key: 'task', label: 'Task being completed', type: 'textarea', required: true, placeholder: 'Describe the work in plain language.' },
      { key: 'hazards', label: 'Hazards identified', type: 'textarea', required: true, placeholder: 'Traffic, pressure, overhead lines, slips, confined space...' },
      { key: 'controls', label: 'Controls in place', type: 'textarea', required: true, placeholder: 'Spotter, barricades, grounding, PPE, permits...' },
      { key: 'ppe', label: 'Required PPE', type: 'text', required: true, placeholder: 'FR coveralls, hard hat, glasses, gloves...' },
      { key: 'emergency_plan', label: 'Emergency plan and muster point', type: 'textarea', required: true },
      { key: 'conditions_changed', label: 'Have conditions changed since work began?', type: 'select', options: ['No', 'Yes, reassessed before continuing'], required: true },
    ],
  },
  {
    key: 'incident_report',
    name: 'Incident Report',
    shortName: 'Incident',
    description: 'Record an injury, spill, damage, vehicle event or other incident.',
    fields: [
      { key: 'incident_at', label: 'Date and time of incident', type: 'datetime-local', required: true },
      { key: 'location', label: 'Location', type: 'text', required: true },
      { key: 'people_involved', label: 'People involved or witnesses', type: 'textarea', required: true },
      { key: 'description', label: 'What happened?', type: 'textarea', required: true },
      { key: 'injury_damage', label: 'Injury, damage, spill or loss', type: 'textarea', required: true },
      { key: 'immediate_actions', label: 'Immediate actions taken', type: 'textarea', required: true },
      { key: 'reported_to', label: 'Who was notified?', type: 'text', required: true },
    ],
  },
  {
    key: 'near_miss',
    name: 'Near Miss Report',
    shortName: 'Near Miss',
    description: 'Capture something that could have caused injury or damage before it is forgotten.',
    fields: [
      { key: 'occurred_at', label: 'Date and time', type: 'datetime-local', required: true },
      { key: 'location', label: 'Location', type: 'text', required: true },
      { key: 'description', label: 'What almost happened?', type: 'textarea', required: true },
      { key: 'potential_consequence', label: 'What could the consequence have been?', type: 'textarea', required: true },
      { key: 'corrective_action', label: 'What was changed or corrected?', type: 'textarea', required: true },
    ],
  },
  {
    key: 'hazard_observation',
    name: 'Hazard Observation',
    shortName: 'Hazard',
    description: 'Report an unsafe condition, behaviour or equipment concern.',
    fields: [
      { key: 'location', label: 'Location', type: 'text', required: true },
      { key: 'hazard', label: 'Hazard observed', type: 'textarea', required: true },
      { key: 'risk_level', label: 'How urgent is it?', type: 'select', options: ['Low', 'Medium', 'High', 'Immediate danger'], required: true },
      { key: 'action_taken', label: 'Action taken now', type: 'textarea', required: true },
      { key: 'follow_up', label: 'Follow up needed', type: 'textarea' },
    ],
  },
  {
    key: 'toolbox_talk',
    name: 'Toolbox Talk',
    shortName: 'Toolbox Talk',
    description: 'Record a short safety discussion with the crew.',
    fields: [
      { key: 'topic', label: 'Topic', type: 'text', required: true },
      { key: 'discussion', label: 'What was discussed?', type: 'textarea', required: true },
      { key: 'crew', label: 'Crew attending', type: 'textarea', required: true },
      { key: 'questions_concerns', label: 'Questions or concerns raised', type: 'textarea' },
      { key: 'actions', label: 'Actions or follow up', type: 'textarea' },
    ],
  },
]

const DOCUMENT_CATEGORIES = [
  ['all', 'All'],
  ['sds', 'SDS'],
  ['sop', 'SOPs'],
  ['safe_work_practice', 'Safe Work Practices'],
  ['policy', 'Policies'],
  ['erp', 'Emergency Plans'],
  ['jsa_jha', 'JSA / JHA'],
  ['orientation', 'Orientations'],
  ['reference', 'Reference'],
  ['other', 'Other'],
] as const

const CREDENTIAL_TYPES = [
  ['ticket', 'Safety ticket'],
  ['orientation', 'Orientation'],
  ['training', 'Training'],
  ['certification', 'Certification'],
  ['fit_test', 'Fit test'],
  ['medical', 'Medical / clearance'],
  ['other', 'Other'],
] as const

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const parsed = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(parsed)
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
}

function daysUntil(value: string | null) {
  if (!value) return null
  const target = new Date(`${value}T12:00:00`).getTime()
  const today = new Date(); today.setHours(12, 0, 0, 0)
  return Math.ceil((target - today.getTime()) / 86400000)
}

function effectiveCredentialStatus(item: Credential) {
  const days = daysUntil(item.expires_on)
  if (days !== null && days < 0) return 'expired'
  if (item.status === 'verified' && days !== null && days <= 60) return 'expiring'
  return item.status
}

function readLegacyTestData(): SafetyData {
  try {
    const base = JSON.parse(localStorage.getItem(TEST_DATA_KEY) || '{}')
    const safety = JSON.parse(localStorage.getItem(TEST_SAFETY_KEY) || '{}')
    return {
      employees: Array.isArray(base.employees) ? base.employees : [],
      jobs: Array.isArray(base.jobs) ? base.jobs : [],
      credentials: Array.isArray(safety.credentials) ? safety.credentials : [],
      documents: Array.isArray(safety.documents) ? safety.documents : [],
      submissions: Array.isArray(safety.submissions) ? safety.submissions : [],
    }
  } catch {
    return EMPTY
  }
}

function writeLegacySafety(data: SafetyData) {
  localStorage.setItem(TEST_SAFETY_KEY, JSON.stringify({ credentials: data.credentials, documents: data.documents, submissions: data.submissions }))
}

export default function SafetyPage({ organizationId, userId, roleKey, organizationName }: Props) {
  const canManage = ['owner', 'admin', 'safety', 'supervisor'].includes(roleKey)
  const legacyTest = userId === 'test-admin'
  const [data, setData] = useState<SafetyData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [libraryCategory, setLibraryCategory] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [credentialModal, setCredentialModal] = useState(false)
  const [documentModal, setDocumentModal] = useState(false)
  const [activeForm, setActiveForm] = useState<FormDefinition | null>(null)
  const [viewSubmission, setViewSubmission] = useState<FormSubmission | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (legacyTest) {
      setData(readLegacyTestData())
      setLoading(false)
      return
    }
    const [employees, jobs, credentials, documents, submissions] = await Promise.all([
      db.from('employees').select('id,user_id,first_name,last_name,position,status').eq('organization_id', organizationId).order('last_name'),
      db.from('jobs').select('id,job_number,title,site_name,status').eq('organization_id', organizationId).order('job_number'),
      db.from('safety_credentials').select('*').eq('organization_id', organizationId).order('expires_on', { ascending: true }),
      db.from('safety_documents').select('*').eq('organization_id', organizationId).eq('status', 'active').order('updated_at', { ascending: false }),
      db.from('safety_form_submissions').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    ])
    const firstError = employees.error || jobs.error || credentials.error || documents.error || submissions.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setData({
      employees: (employees.data ?? []) as Employee[],
      jobs: (jobs.data ?? []) as Job[],
      credentials: (credentials.data ?? []) as Credential[],
      documents: (documents.data ?? []) as SafetyDocument[],
      submissions: (submissions.data ?? []) as FormSubmission[],
    })
    setLoading(false)
  }, [legacyTest, organizationId])

  useEffect(() => { void load() }, [load])

  const ownEmployee = useMemo(() => data.employees.find(employee => employee.user_id === userId) ?? null, [data.employees, userId])
  const employeeMap = useMemo(() => new Map(data.employees.map(employee => [employee.id, employee])), [data.employees])
  const jobMap = useMemo(() => new Map(data.jobs.map(job => [job.id, job])), [data.jobs])
  const searchValue = search.trim().toLowerCase()

  const credentials = useMemo(() => data.credentials.filter(item => {
    const employee = employeeMap.get(item.employee_id)
    const matchesEmployee = employeeFilter === 'all' || item.employee_id === employeeFilter
    const haystack = `${item.title} ${item.credential_type} ${item.issuer ?? ''} ${item.credential_number ?? ''} ${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.toLowerCase()
    return matchesEmployee && (!searchValue || haystack.includes(searchValue))
  }), [data.credentials, employeeFilter, employeeMap, searchValue])

  const documents = useMemo(() => data.documents.filter(item => {
    const matchesCategory = libraryCategory === 'all' || item.category === libraryCategory
    const haystack = `${item.title} ${item.category} ${item.description ?? ''} ${(item.tags ?? []).join(' ')} ${item.version ?? ''}`.toLowerCase()
    return matchesCategory && (!searchValue || haystack.includes(searchValue))
  }), [data.documents, libraryCategory, searchValue])

  const submissions = useMemo(() => data.submissions.filter(item => {
    const employee = item.employee_id ? employeeMap.get(item.employee_id) : null
    const job = item.job_id ? jobMap.get(item.job_id) : null
    const answerText = Object.values(item.answers ?? {}).join(' ')
    const haystack = `${item.title} ${item.form_type} ${item.status} ${employee?.first_name ?? ''} ${employee?.last_name ?? ''} ${job?.job_number ?? ''} ${job?.title ?? ''} ${answerText}`.toLowerCase()
    return !searchValue || haystack.includes(searchValue)
  }), [data.submissions, employeeMap, jobMap, searchValue])

  const expiring = data.credentials.filter(item => {
    const days = daysUntil(item.expires_on)
    return days !== null && days >= 0 && days <= 60
  })
  const expired = data.credentials.filter(item => {
    const days = daysUntil(item.expires_on)
    return days !== null && days < 0
  })
  const recentForms = data.submissions.filter(item => Date.now() - new Date(item.created_at).getTime() <= 30 * 86400000)
  const attention = [...expired, ...expiring].sort((a, b) => String(a.expires_on).localeCompare(String(b.expires_on)))

  const saveLegacy = (next: SafetyData) => {
    setData(next)
    writeLegacySafety(next)
  }

  const showSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 3500)
  }

  const openFile = async (path: string) => {
    if (path.startsWith('test/')) {
      showSuccess('Test mode keeps the record, but does not upload a real file.')
      return
    }
    const result = await supabase.storage.from('safety-files').createSignedUrl(path, 300)
    if (result.error) return setError(result.error.message)
    if (result.data?.signedUrl) window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const uploadFile = async (file: File, path: string) => {
    const session = await supabase.auth.getSession()
    if (session.data.session?.user.app_metadata?.northborn_test) return `test/${path}`
    const result = await supabase.storage.from('safety-files').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (result.error) throw result.error
    return result.data.path
  }

  const removeUploadedFile = async (path: string) => {
    if (!path || path.startsWith('test/')) return
    await supabase.storage.from('safety-files').remove([path])
  }

  const verifyCredential = async (credential: Credential) => {
    setBusy(true); setError('')
    if (legacyTest) {
      const next = { ...data, credentials: data.credentials.map(item => item.id === credential.id ? { ...item, status: 'verified', verified_by: userId, verified_at: new Date().toISOString() } : item) }
      saveLegacy(next); setBusy(false); showSuccess('Credential verified.'); return
    }
    const result = await db.from('safety_credentials').update({ status: 'verified', verified_by: userId, verified_at: new Date().toISOString() }).eq('id', credential.id).eq('organization_id', organizationId)
    setBusy(false)
    if (result.error) return setError(result.error.message)
    await load(); showSuccess('Credential verified.')
  }

  const reviewSubmission = async (submission: FormSubmission) => {
    setBusy(true); setError('')
    if (legacyTest) {
      const next = { ...data, submissions: data.submissions.map(item => item.id === submission.id ? { ...item, status: 'reviewed', reviewed_by: userId, reviewed_at: new Date().toISOString() } : item) }
      saveLegacy(next); setBusy(false); setViewSubmission(null); showSuccess('Submission marked reviewed.'); return
    }
    const result = await db.from('safety_form_submissions').update({ status: 'reviewed', reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', submission.id).eq('organization_id', organizationId)
    setBusy(false)
    if (result.error) return setError(result.error.message)
    setViewSubmission(null); await load(); showSuccess('Submission marked reviewed.')
  }

  if (loading) return <div className="safety-loading">Loading safety workspace…</div>

  return <section className="safety-page">
    <div className="safety-hero">
      <div>
        <span className="safety-eyebrow">SAFETY</span>
        <h1>Safety, without the digging.</h1>
        <p>Find tickets, orientations, SDSs, procedures and forms from one place that works in the field.</p>
      </div>
      <button className="safety-refresh" type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button>
    </div>

    <div className="safety-search-row">
      <label className="safety-search"><Search size={19}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tickets, SDS, SOPs, forms, people, jobs..."/><kbd>Search</kbd></label>
      <div className="safety-quick-actions">
        <button type="button" onClick={() => setCredentialModal(true)}><Upload size={17}/>{canManage ? 'Upload worker record' : 'Upload my ticket'}</button>
        {canManage && <button type="button" onClick={() => setDocumentModal(true)}><Plus size={17}/>Add safety document</button>}
      </div>
    </div>

    {error && <div className="safety-message error"><AlertTriangle size={18}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
    {success && <div className="safety-message success"><CheckCircle2 size={18}/><span>{success}</span></div>}

    <div className="safety-tabs" role="tablist">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><ShieldCheck size={17}/>Overview</button>
      <button className={tab === 'credentials' ? 'active' : ''} onClick={() => setTab('credentials')}><BadgeCheck size={17}/>{canManage ? 'Worker tickets' : 'My tickets'}</button>
      <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><FolderSearch size={17}/>Safety library</button>
      <button className={tab === 'forms' ? 'active' : ''} onClick={() => setTab('forms')}><ClipboardPlus size={17}/>Forms</button>
    </div>

    {tab === 'overview' && <>
      <div className="safety-stat-grid">
        <button onClick={() => setTab('credentials')} className="safety-stat"><BadgeCheck/><span>{canManage ? 'Worker records' : 'My records'}</span><strong>{data.credentials.length}</strong><small>tickets and orientations</small></button>
        <button onClick={() => setTab('credentials')} className={`safety-stat ${expired.length ? 'danger' : expiring.length ? 'warning' : ''}`}><CalendarClock/><span>Expiry attention</span><strong>{expired.length + expiring.length}</strong><small>{expired.length} expired · {expiring.length} due in 60 days</small></button>
        <button onClick={() => setTab('library')} className="safety-stat"><BookOpenCheck/><span>Safety library</span><strong>{data.documents.length}</strong><small>SDS, SOPs and references</small></button>
        <button onClick={() => setTab('forms')} className="safety-stat"><ClipboardPlus/><span>{canManage ? 'Recent forms' : 'My forms'}</span><strong>{canManage ? recentForms.length : data.submissions.length}</strong><small>{canManage ? 'submitted in last 30 days' : 'submitted by you'}</small></button>
      </div>

      <div className="safety-two-column">
        <section className="safety-panel">
          <div className="safety-section-heading"><div><span className="safety-eyebrow">START HERE</span><h2>Common safety tasks</h2></div></div>
          <div className="safety-action-list">
            <button onClick={() => setActiveForm(FORM_DEFINITIONS[0])}><div className="safety-action-icon"><HardHat/></div><div><strong>Complete an FLHA</strong><span>Hazards and controls before work starts</span></div><ChevronRight/></button>
            <button onClick={() => setActiveForm(FORM_DEFINITIONS[1])}><div className="safety-action-icon red"><FileWarning/></div><div><strong>Report an incident</strong><span>Record what happened while details are fresh</span></div><ChevronRight/></button>
            <button onClick={() => setTab('library')}><div className="safety-action-icon"><FileSearch/></div><div><strong>Find an SDS or procedure</strong><span>Search the company safety library</span></div><ChevronRight/></button>
            <button onClick={() => setCredentialModal(true)}><div className="safety-action-icon"><GraduationCap/></div><div><strong>{canManage ? 'Upload a worker ticket' : 'Upload my ticket or orientation'}</strong><span>Keep training records in one place</span></div><ChevronRight/></button>
          </div>
        </section>

        <section className="safety-panel">
          <div className="safety-section-heading"><div><span className="safety-eyebrow">ATTENTION</span><h2>{canManage ? 'Expiring worker records' : 'My upcoming expiries'}</h2></div><button className="safety-text-button" onClick={() => setTab('credentials')}>See all</button></div>
          {attention.length ? <div className="safety-attention-list">{attention.slice(0, 6).map(item => {
            const employee = employeeMap.get(item.employee_id)
            const days = daysUntil(item.expires_on)
            return <button key={item.id} onClick={() => setTab('credentials')}><div><strong>{item.title}</strong><span>{canManage && employee ? `${employee.first_name} ${employee.last_name} · ` : ''}{formatDate(item.expires_on)}</span></div><span className={`safety-expiry ${days !== null && days < 0 ? 'expired' : ''}`}>{days !== null && days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</span></button>
          })}</div> : <Empty icon={<CheckCircle2/>} title="Nothing expiring soon" text="Records with an expiry inside 60 days will show up here."/>}
        </section>
      </div>

      <section className="safety-panel">
        <div className="safety-section-heading"><div><span className="safety-eyebrow">RECENTLY ADDED</span><h2>Safety library</h2></div><button className="safety-text-button" onClick={() => setTab('library')}>Open library</button></div>
        {data.documents.length ? <div className="safety-document-grid">{data.documents.slice(0, 4).map(document => <DocumentCard key={document.id} document={document} onOpen={() => void openFile(document.file_path)}/>)}</div> : <Empty icon={<BookOpenCheck/>} title="The library is ready" text={canManage ? 'Add your first SDS, SOP, safe work practice or emergency plan.' : 'Your safety team has not added documents yet.'}/>} 
      </section>
    </>}

    {tab === 'credentials' && <section className="safety-panel safety-main-panel">
      <div className="safety-section-heading responsive"><div><span className="safety-eyebrow">TRAINING & ORIENTATIONS</span><h2>{canManage ? 'Worker safety records' : 'My safety records'}</h2><p>{canManage ? 'See what each worker has, what needs verification and what is about to expire.' : 'Upload your own tickets and orientations. Only you and authorized safety management can see them.'}</p></div><button className="safety-primary" onClick={() => setCredentialModal(true)}><Upload size={17}/>Upload</button></div>
      {canManage && <div className="safety-filter-row"><label>Worker<select value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)}><option value="all">All workers</option>{data.employees.filter(employee => employee.status === 'active').map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label></div>}
      {credentials.length ? <div className="safety-record-list">{credentials.map(item => {
        const employee = employeeMap.get(item.employee_id)
        const status = effectiveCredentialStatus(item)
        return <article className="safety-record" key={item.id}>
          <div className="safety-record-icon"><GraduationCap/></div>
          <div className="safety-record-copy"><div className="safety-record-title"><strong>{item.title}</strong><span className={`safety-pill ${status}`}>{humanize(status)}</span></div><span>{canManage && employee ? `${employee.first_name} ${employee.last_name} · ` : ''}{humanize(item.credential_type)}{item.issuer ? ` · ${item.issuer}` : ''}</span><div className="safety-record-meta"><span>Issued {formatDate(item.issued_on)}</span><span>Expires {formatDate(item.expires_on)}</span>{item.credential_number && <span>#{item.credential_number}</span>}</div></div>
          <div className="safety-record-actions"><button onClick={() => void openFile(item.file_path)}><Eye size={16}/>View</button>{canManage && item.status === 'pending' && <button className="verify" disabled={busy} onClick={() => void verifyCredential(item)}><CheckCircle2 size={16}/>Verify</button>}</div>
        </article>
      })}</div> : <Empty icon={<BadgeCheck/>} title={searchValue ? 'No matching records' : 'No safety records yet'} text={searchValue ? 'Try a different search term or worker.' : 'Upload a ticket, orientation or training record to get started.'}/>} 
    </section>}

    {tab === 'library' && <section className="safety-panel safety-main-panel">
      <div className="safety-section-heading responsive"><div><span className="safety-eyebrow">DOCUMENT LIBRARY</span><h2>Find the right document fast</h2><p>Search by name, topic or tag instead of digging through folders.</p></div>{canManage && <button className="safety-primary" onClick={() => setDocumentModal(true)}><Plus size={17}/>Add document</button>}</div>
      <div className="safety-category-row">{DOCUMENT_CATEGORIES.map(([value, name]) => <button key={value} className={libraryCategory === value ? 'active' : ''} onClick={() => setLibraryCategory(value)}>{name}</button>)}</div>
      {documents.length ? <div className="safety-document-grid">{documents.map(document => <DocumentCard key={document.id} document={document} onOpen={() => void openFile(document.file_path)}/>)}</div> : <Empty icon={<FolderSearch/>} title={searchValue ? 'Nothing matched your search' : 'No documents in this category'} text={canManage ? 'Add a PDF, image, Word or Excel document to the safety library.' : 'Try another category or ask your safety team to add what you need.'}/>} 
    </section>}

    {tab === 'forms' && <section className="safety-panel safety-main-panel">
      <div className="safety-section-heading"><div><span className="safety-eyebrow">DIGITAL FORMS</span><h2>Fill it out while it is happening</h2><p>{canManage ? 'Managers and safety can see every submitted form. Workers only see forms they submitted themselves.' : 'You can always come back and view the forms you submitted.'}</p></div></div>
      <div className="safety-form-grid">{FORM_DEFINITIONS.map(definition => <button key={definition.key} onClick={() => setActiveForm(definition)}><div className={`safety-form-icon ${definition.key === 'incident_report' ? 'red' : ''}`}>{definition.key === 'flha' ? <HardHat/> : definition.key === 'incident_report' ? <FileWarning/> : definition.key === 'near_miss' ? <AlertTriangle/> : definition.key === 'hazard_observation' ? <ShieldCheck/> : <Users/>}</div><strong>{definition.shortName}</strong><span>{definition.description}</span><small>Start form <ChevronRight size={14}/></small></button>)}</div>
      <div className="safety-submissions-heading"><div><h3>{canManage ? 'Submitted safety forms' : 'My submitted forms'}</h3><span>{submissions.length} shown</span></div></div>
      {submissions.length ? <div className="safety-submission-list">{submissions.map(item => {
        const employee = item.employee_id ? employeeMap.get(item.employee_id) : null
        const job = item.job_id ? jobMap.get(item.job_id) : null
        return <button key={item.id} onClick={() => setViewSubmission(item)}><div className="safety-submission-icon"><FileText/></div><div><strong>{item.title}</strong><span>{canManage && employee ? `${employee.first_name} ${employee.last_name} · ` : ''}{job ? `${job.job_number} · ` : ''}{formatDateTime(item.submitted_at || item.created_at)}</span></div><span className={`safety-pill ${item.status}`}>{humanize(item.status)}</span><ChevronRight/></button>
      })}</div> : <Empty icon={<ClipboardPlus/>} title={searchValue ? 'No forms matched your search' : 'No forms submitted yet'} text="Choose a form above to create the first submission."/>}
    </section>}

    {credentialModal && <CredentialModal canManage={canManage} employees={data.employees} ownEmployee={ownEmployee} organizationId={organizationId} userId={userId} legacyTest={legacyTest} busy={busy} setBusy={setBusy} onClose={() => setCredentialModal(false)} onError={setError} uploadFile={uploadFile} removeUploadedFile={removeUploadedFile} onLegacySave={credential => saveLegacy({ ...data, credentials: [credential, ...data.credentials] })} onSaved={async () => { setCredentialModal(false); await load(); showSuccess('Safety record uploaded.') }}/>} 
    {documentModal && canManage && <DocumentModal organizationId={organizationId} userId={userId} legacyTest={legacyTest} busy={busy} setBusy={setBusy} onClose={() => setDocumentModal(false)} onError={setError} uploadFile={uploadFile} removeUploadedFile={removeUploadedFile} onLegacySave={document => saveLegacy({ ...data, documents: [document, ...data.documents] })} onSaved={async () => { setDocumentModal(false); await load(); showSuccess('Safety document added.') }}/>} 
    {activeForm && <SafetyFormModal definition={activeForm} organizationId={organizationId} userId={userId} employee={ownEmployee} jobs={data.jobs} legacyTest={legacyTest} busy={busy} setBusy={setBusy} onClose={() => setActiveForm(null)} onError={setError} onLegacySave={submission => saveLegacy({ ...data, submissions: [submission, ...data.submissions] })} onSaved={async () => { setActiveForm(null); await load(); setTab('forms'); showSuccess('Safety form submitted.') }}/>} 
    {viewSubmission && <SubmissionModal submission={viewSubmission} employee={viewSubmission.employee_id ? employeeMap.get(viewSubmission.employee_id) ?? null : null} job={viewSubmission.job_id ? jobMap.get(viewSubmission.job_id) ?? null : null} definition={FORM_DEFINITIONS.find(item => item.key === viewSubmission.form_type) ?? null} canManage={canManage} busy={busy} onReview={() => void reviewSubmission(viewSubmission)} onClose={() => setViewSubmission(null)}/>} 
  </section>
}

function DocumentCard({ document, onOpen }: { document: SafetyDocument; onOpen: () => void }) {
  return <button className="safety-document-card" onClick={onOpen}><div className="safety-doc-top"><div className="safety-document-icon"><FileText/></div><span className="safety-category">{humanize(document.category)}</span></div><strong>{document.title}</strong><p>{document.description || 'Open this document to view the current company reference.'}</p><div className="safety-doc-meta">{document.version && <span>v{document.version}</span>}{document.review_date && <span>Review {formatDate(document.review_date)}</span>}{document.tags?.slice(0, 2).map(tag => <span key={tag}>#{tag}</span>)}</div><small>Open document <Eye size={14}/></small></button>
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="safety-empty"><div>{icon}</div><strong>{title}</strong><span>{text}</span></div>
}

function CredentialModal({ canManage, employees, ownEmployee, organizationId, userId, legacyTest, busy, setBusy, onClose, onError, uploadFile, removeUploadedFile, onLegacySave, onSaved }: {
  canManage: boolean
  employees: Employee[]
  ownEmployee: Employee | null
  organizationId: string
  userId: string
  legacyTest: boolean
  busy: boolean
  setBusy: (value: boolean) => void
  onClose: () => void
  onError: (value: string) => void
  uploadFile: (file: File, path: string) => Promise<string>
  removeUploadedFile: (path: string) => Promise<void>
  onLegacySave: (credential: Credential) => void
  onSaved: () => Promise<void>
}) {
  const [employeeId, setEmployeeId] = useState(canManage ? employees.find(employee => employee.status === 'active')?.id ?? '' : ownEmployee?.id ?? '')
  const [type, setType] = useState('ticket')
  const [title, setTitle] = useState('')
  const [issuer, setIssuer] = useState('')
  const [number, setNumber] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); onError('')
    if (!employeeId) return onError('Choose a worker before uploading the record.')
    if (!file && !legacyTest) return onError('Choose the ticket or orientation file to upload.')
    setBusy(true)
    let uploadedPath = ''
    try {
      const rawPath = `${organizationId}/credentials/${employeeId}/${crypto.randomUUID()}-${safeFileName(file?.name || `${title}.pdf`)}`
      uploadedPath = legacyTest ? `test/${rawPath}` : await uploadFile(file!, rawPath)
      const now = new Date().toISOString()
      const row = {
        organization_id: organizationId,
        employee_id: employeeId,
        credential_type: type,
        title: title.trim(),
        issuer: issuer.trim() || null,
        credential_number: number.trim() || null,
        issued_on: issuedOn || null,
        expires_on: expiresOn || null,
        status: 'pending',
        file_path: uploadedPath,
        notes: notes.trim() || null,
        uploaded_by: userId,
        verified_by: null,
        verified_at: null,
      }
      if (legacyTest) {
        onLegacySave({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...row } as Credential)
        setBusy(false); await onSaved(); return
      }
      const result = await db.from('safety_credentials').insert(row)
      if (result.error) throw result.error
      setBusy(false); await onSaved()
    } catch (caught: any) {
      await removeUploadedFile(uploadedPath)
      setBusy(false); onError(caught?.message || String(caught))
    }
  }

  return <Modal title={canManage ? 'Upload worker safety record' : 'Upload my safety record'} eyebrow="TICKETS & ORIENTATIONS" onClose={onClose}>
    <form className="safety-modal-form" onSubmit={event => void submit(event)}>
      {canManage && <label>Worker<select value={employeeId} onChange={event => setEmployeeId(event.target.value)} required><option value="">Choose worker</option>{employees.filter(employee => employee.status === 'active').map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}{employee.position ? ` · ${employee.position}` : ''}</option>)}</select></label>}
      {!canManage && ownEmployee && <div className="safety-modal-person"><Users size={18}/><span>Uploading for <strong>{ownEmployee.first_name} {ownEmployee.last_name}</strong></span></div>}
      <div className="safety-form-two"><label>Record type<select value={type} onChange={event => setType(event.target.value)}>{CREDENTIAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Ticket or orientation name<input value={title} onChange={event => setTitle(event.target.value)} required placeholder="H2S Alive, CSTS, site orientation..."/></label></div>
      <div className="safety-form-two"><label>Issuer / company<input value={issuer} onChange={event => setIssuer(event.target.value)} placeholder="Energy Safety Canada"/></label><label>Certificate number<input value={number} onChange={event => setNumber(event.target.value)} /></label></div>
      <div className="safety-form-two"><label>Issued date<input type="date" value={issuedOn} onChange={event => setIssuedOn(event.target.value)}/></label><label>Expiry date<input type="date" min={issuedOn || undefined} value={expiresOn} onChange={event => setExpiresOn(event.target.value)}/></label></div>
      <label>Notes<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes for the safety team"/></label>
      <label className="safety-file-picker"><Upload size={20}/><span><strong>{file ? file.name : 'Choose document or photo'}</strong><small>PDF, image, Word or Excel · up to 25 MB</small></span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)} required={!legacyTest}/></label>
      <div className="safety-modal-actions"><button type="button" className="safety-secondary" onClick={onClose}>Cancel</button><button type="submit" className="safety-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload record'}</button></div>
    </form>
  </Modal>
}

function DocumentModal({ organizationId, userId, legacyTest, busy, setBusy, onClose, onError, uploadFile, removeUploadedFile, onLegacySave, onSaved }: {
  organizationId: string
  userId: string
  legacyTest: boolean
  busy: boolean
  setBusy: (value: boolean) => void
  onClose: () => void
  onError: (value: string) => void
  uploadFile: (file: File, path: string) => Promise<string>
  removeUploadedFile: (path: string) => Promise<void>
  onLegacySave: (document: SafetyDocument) => void
  onSaved: () => Promise<void>
}) {
  const [category, setCategory] = useState('sds')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [version, setVersion] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); onError('')
    if (!file && !legacyTest) return onError('Choose the safety document to upload.')
    setBusy(true)
    let uploadedPath = ''
    try {
      const rawPath = `${organizationId}/library/${crypto.randomUUID()}-${safeFileName(file?.name || `${title}.pdf`)}`
      uploadedPath = legacyTest ? `test/${rawPath}` : await uploadFile(file!, rawPath)
      const now = new Date().toISOString()
      const row = {
        organization_id: organizationId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        tags: tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean),
        version: version.trim() || null,
        effective_date: effectiveDate || null,
        review_date: reviewDate || null,
        status: 'active',
        file_path: uploadedPath,
        created_by: userId,
      }
      if (legacyTest) {
        onLegacySave({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...row } as SafetyDocument)
        setBusy(false); await onSaved(); return
      }
      const result = await db.from('safety_documents').insert(row)
      if (result.error) throw result.error
      setBusy(false); await onSaved()
    } catch (caught: any) {
      await removeUploadedFile(uploadedPath)
      setBusy(false); onError(caught?.message || String(caught))
    }
  }

  return <Modal title="Add to the safety library" eyebrow="SDS · SOP · POLICY · REFERENCE" onClose={onClose}>
    <form className="safety-modal-form" onSubmit={event => void submit(event)}>
      <div className="safety-form-two"><label>Category<select value={category} onChange={event => setCategory(event.target.value)}>{DOCUMENT_CATEGORIES.filter(([value]) => value !== 'all').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Document title<input value={title} onChange={event => setTitle(event.target.value)} required placeholder="Hydrogen Sulfide SDS"/></label></div>
      <label>Plain language description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="What is this document for and when would someone need it?"/></label>
      <div className="safety-form-two"><label>Version<input value={version} onChange={event => setVersion(event.target.value)} placeholder="3.1"/></label><label>Search tags<input value={tags} onChange={event => setTags(event.target.value)} placeholder="h2s, sour gas, chemical"/></label></div>
      <div className="safety-form-two"><label>Effective date<input type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)}/></label><label>Review date<input type="date" min={effectiveDate || undefined} value={reviewDate} onChange={event => setReviewDate(event.target.value)}/></label></div>
      <label className="safety-file-picker"><Upload size={20}/><span><strong>{file ? file.name : 'Choose safety document'}</strong><small>PDF, image, Word or Excel · up to 25 MB</small></span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)} required={!legacyTest}/></label>
      <div className="safety-modal-actions"><button type="button" className="safety-secondary" onClick={onClose}>Cancel</button><button type="submit" className="safety-primary" disabled={busy}>{busy ? 'Uploading…' : 'Add document'}</button></div>
    </form>
  </Modal>
}

function SafetyFormModal({ definition, organizationId, userId, employee, jobs, legacyTest, busy, setBusy, onClose, onError, onLegacySave, onSaved }: {
  definition: FormDefinition
  organizationId: string
  userId: string
  employee: Employee | null
  jobs: Job[]
  legacyTest: boolean
  busy: boolean
  setBusy: (value: boolean) => void
  onClose: () => void
  onError: (value: string) => void
  onLegacySave: (submission: FormSubmission) => void
  onSaved: () => Promise<void>
}) {
  const [jobId, setJobId] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const update = (key: string, value: string) => setAnswers(current => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); onError(''); setBusy(true)
    const now = new Date().toISOString()
    const job = jobs.find(item => item.id === jobId)
    const title = `${definition.shortName}${job ? ` · ${job.job_number}` : ''}`
    const row = {
      organization_id: organizationId,
      employee_id: employee?.id ?? null,
      job_id: jobId || null,
      form_type: definition.key,
      title,
      answers,
      status: 'submitted',
      submitted_by: userId,
      submitted_at: now,
      reviewed_by: null,
      reviewed_at: null,
      review_notes: null,
    }
    if (legacyTest) {
      onLegacySave({ id: crypto.randomUUID(), created_at: now, updated_at: now, ...row } as FormSubmission)
      setBusy(false); await onSaved(); return
    }
    const result = await db.from('safety_form_submissions').insert(row)
    setBusy(false)
    if (result.error) return onError(result.error.message)
    await onSaved()
  }

  return <Modal title={definition.name} eyebrow="SAFETY FORM" onClose={onClose} wide>
    <form className="safety-modal-form" onSubmit={event => void submit(event)}>
      <div className="safety-form-intro"><ClipboardPlus/><div><strong>{definition.shortName}</strong><span>{definition.description}</span></div></div>
      <label>Related job <span className="optional">Optional</span><select value={jobId} onChange={event => setJobId(event.target.value)}><option value="">No job selected</option>{jobs.filter(job => !['cancelled'].includes(job.status)).map(job => <option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>)}</select></label>
      {definition.fields.map(field => <label key={field.key}>{field.label}{!field.required && <span className="optional">Optional</span>}{field.type === 'textarea' ? <textarea value={answers[field.key] ?? ''} onChange={event => update(field.key, event.target.value)} required={field.required} placeholder={field.placeholder}/> : field.type === 'select' ? <select value={answers[field.key] ?? ''} onChange={event => update(field.key, event.target.value)} required={field.required}><option value="">Choose one</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type} value={answers[field.key] ?? ''} onChange={event => update(field.key, event.target.value)} required={field.required} placeholder={field.placeholder}/>}</label>)}
      <div className="safety-form-certify"><CheckCircle2 size={18}/><span>Submitting records the date, time and signed in user with this form.</span></div>
      <div className="safety-modal-actions"><button type="button" className="safety-secondary" onClick={onClose}>Cancel</button><button type="submit" className="safety-primary" disabled={busy}>{busy ? 'Submitting…' : `Submit ${definition.shortName}`}</button></div>
    </form>
  </Modal>
}

function SubmissionModal({ submission, employee, job, definition, canManage, busy, onReview, onClose }: {
  submission: FormSubmission
  employee: Employee | null
  job: Job | null
  definition: FormDefinition | null
  canManage: boolean
  busy: boolean
  onReview: () => void
  onClose: () => void
}) {
  return <Modal title={submission.title} eyebrow={definition?.name ?? humanize(submission.form_type)} onClose={onClose} wide>
    <div className="safety-submission-detail-meta"><span><Users size={16}/>{employee ? `${employee.first_name} ${employee.last_name}` : 'Submitted user'}</span>{job && <span><HardHat size={16}/>{job.job_number} · {job.title}</span>}<span><Clock3 size={16}/>{formatDateTime(submission.submitted_at || submission.created_at)}</span><span className={`safety-pill ${submission.status}`}>{humanize(submission.status)}</span></div>
    <div className="safety-answer-list">{definition ? definition.fields.map(field => <div key={field.key}><span>{field.label}</span><strong>{String(submission.answers?.[field.key] || 'Not provided')}</strong></div>) : Object.entries(submission.answers ?? {}).map(([key, value]) => <div key={key}><span>{humanize(key)}</span><strong>{String(value || 'Not provided')}</strong></div>)}</div>
    <div className="safety-modal-actions"><button className="safety-secondary" onClick={onClose}>Close</button>{canManage && submission.status === 'submitted' && <button className="safety-primary" disabled={busy} onClick={onReview}><CheckCircle2 size={17}/>{busy ? 'Saving…' : 'Mark reviewed'}</button>}</div>
  </Modal>
}

function Modal({ title, eyebrow, onClose, wide = false, children }: { title: string; eyebrow: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="safety-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className={`safety-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true"><div className="safety-modal-header"><div><span className="safety-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X/></button></div>{children}</div></div>
}
