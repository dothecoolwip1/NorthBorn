import { useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import {
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  FileText,
  HardHat,
  Home,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-app.css'

const db = supabase as any

type OperatorAppProps = {
  userId: string
  organizationId: string
  organizationName: string
}

type Employee = {
  id: string
  first_name: string
  last_name: string
  position: string | null
  status: string
}

type Job = {
  id: string
  customer_id: string
  job_number: string
  title: string
  site_name: string | null
  site_address: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  status: string
  notes: string | null
}

type Assignment = {
  id: string
  job_id: string
  employee_id: string | null
  vehicle_id: string | null
  role: string | null
}

type Vehicle = {
  id: string
  unit_number: string
  name: string | null
  vehicle_type: string
  status: string
}

type CustomerContact = {
  job_id: string
  customer_id: string
  customer_name: string
  contact_phone: string | null
  contact_email: string | null
  customer_address: string | null
}

type FieldData = {
  employee: Employee | null
  jobs: Job[]
  assignments: Assignment[]
  vehicles: Vehicle[]
  contacts: CustomerContact[]
}

const EMPTY_DATA: FieldData = { employee: null, jobs: [], assignments: [], vehicles: [], contacts: [] }
const NAV_ITEMS = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'My Jobs', path: '/jobs', icon: BriefcaseBusiness },
  { label: 'Safety', path: '/safety', icon: ShieldCheck },
  { label: 'Tickets', path: '/tickets', icon: ClipboardCheck },
  { label: 'Timesheets', path: '/timesheets', icon: HardHat },
] as const

function formatDate(value: string | null) {
  if (!value) return 'Time not set'
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function jobBucket(job: Job, now: number): 'current' | 'upcoming' | 'past' {
  if (['completed', 'cancelled'].includes(job.status)) return 'past'
  const start = job.scheduled_start ? new Date(job.scheduled_start).getTime() : null
  const end = job.scheduled_end ? new Date(job.scheduled_end).getTime() : null
  if (end !== null && end < now) return 'past'
  if (start !== null && start > now) return 'upcoming'
  return 'current'
}

export default function OperatorApp({ userId, organizationId, organizationName }: OperatorAppProps) {
  const [data, setData] = useState<FieldData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [assignmentAlertJobId, setAssignmentAlertJobId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const load = useCallback(async (silent = false): Promise<FieldData | null> => {
    if (!silent) setLoading(true)
    setError('')

    const [employeeResult, jobsResult, assignmentsResult, vehiclesResult, contactsResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id,first_name,last_name,position,status')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('id,customer_id,job_number,title,site_name,site_address,scheduled_start,scheduled_end,status,notes')
        .eq('organization_id', organizationId)
        .order('scheduled_start', { ascending: true }),
      supabase
        .from('dispatch_assignments')
        .select('id,job_id,employee_id,vehicle_id,role')
        .eq('organization_id', organizationId),
      supabase
        .from('fleet_vehicles')
        .select('id,unit_number,name,vehicle_type,status')
        .eq('organization_id', organizationId)
        .order('unit_number'),
      db.rpc('get_my_assigned_job_contacts', { _organization_id: organizationId }),
    ])

    const firstError = employeeResult.error || jobsResult.error || assignmentsResult.error || vehiclesResult.error || contactsResult.error
    if (firstError) {
      setError(firstError.message)
      if (!silent) setLoading(false)
      return null
    }

    const employee = (employeeResult.data ?? null) as Employee | null
    const assignments = (assignmentsResult.data ?? []) as Assignment[]
    const ownJobIds = new Set(
      assignments
        .filter(assignment => assignment.employee_id === employee?.id)
        .map(assignment => assignment.job_id),
    )

    // RLS is the primary security boundary. This second filter makes the UI refuse
    // to render anything unless this employee has an assignment for that job.
    const jobs = ((jobsResult.data ?? []) as Job[]).filter(job => ownJobIds.has(job.id))
    const nextData: FieldData = {
      employee,
      jobs,
      assignments: assignments.filter(assignment => ownJobIds.has(assignment.job_id)),
      vehicles: (vehiclesResult.data ?? []) as Vehicle[],
      contacts: ((contactsResult.data ?? []) as CustomerContact[]).filter(contact => ownJobIds.has(contact.job_id)),
    }

    setData(nextData)
    if (!silent) setLoading(false)
    return nextData
  }, [organizationId, userId])

  useEffect(() => {
    void load()
  }, [load])

  const employeeId = data.employee?.id

  useEffect(() => {
    if (!employeeId) return

    const assignmentChannel = supabase
      .channel(`operator-assignments-${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispatch_assignments',
          filter: `employee_id=eq.${employeeId}`,
        },
        async payload => {
          const refreshed = await load(true)
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as { job_id?: string }
            if (inserted.job_id && refreshed?.jobs.some(job => job.id === inserted.job_id)) {
              setAssignmentAlertJobId(inserted.job_id)
            }
          }
        },
      )
      .subscribe()

    const jobsChannel = supabase
      .channel(`operator-jobs-${organizationId}-${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => { void load(true) },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(assignmentChannel)
      void supabase.removeChannel(jobsChannel)
    }
  }, [employeeId, organizationId, load])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const assignmentAlertJob = assignmentAlertJobId ? data.jobs.find(job => job.id === assignmentAlertJobId) ?? null : null
  const selectedJob = selectedJobId ? data.jobs.find(job => job.id === selectedJobId) ?? null : null

  if (loading) return <div className="field-loading">Loading your assigned work…</div>

  return (
    <div className="field-shell">
      <aside className="field-sidebar">
        <div className="field-brand">
          <div className="field-brand-mark">N</div>
          <div><strong>NORTHBORN</strong><span>{organizationName}</span></div>
        </div>
        <div className="field-role-chip">Operator</div>
        <nav className="field-nav">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/'}>
              <Icon size={19}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="field-signout" onClick={() => void signOut()}><LogOut size={18}/>Sign out</button>
      </aside>

      <main className="field-main">
        <header className="field-topbar">
          <div>
            <span className="field-top-label">FIELD WORKSPACE</span>
            <strong>{organizationName}</strong>
          </div>
          <div className={online ? 'field-connection online' : 'field-connection offline'}>
            {online ? <Wifi size={15}/> : <WifiOff size={15}/>} {online ? 'Online' : 'Offline'}
          </div>
        </header>

        {error && <div className="field-error">Unable to load your assigned work: {error}</div>}

        <Routes>
          <Route path="/" element={<FieldDashboard data={data} onRefresh={load} onOpenJob={setSelectedJobId}/>} />
          <Route path="/jobs" element={<MyJobsPage data={data} onOpenJob={setSelectedJobId}/>} />
          <Route path="/safety" element={<FieldModulePage icon={<ShieldCheck/>} eyebrow="SAFETY" title="My safety" copy="Your safety forms, required acknowledgements, and compliance items will live here. Company-wide safety administration stays hidden from operators."/>} />
          <Route path="/tickets" element={<FieldModulePage icon={<ClipboardCheck/>} eyebrow="FIELD TICKETS" title="My tickets" copy="Tickets connected to your assigned jobs will live here. You will not see tickets for other crews or jobs."/>} />
          <Route path="/timesheets" element={<FieldModulePage icon={<HardHat/>} eyebrow="TIME" title="My timesheets" copy="Your own shift and hour entries will live here. Other employees’ time records stay private."/>} />
          <Route path="*" element={<Navigate to="/" replace/>} />
        </Routes>
      </main>

      <nav className="field-mobile-nav" aria-label="Operator navigation">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'}>
            <Icon size={20}/><span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {assignmentAlertJob && (
        <div className="field-assignment-alert" role="alert" aria-live="assertive">
          <button className="field-alert-close" aria-label="Dismiss new job alert" onClick={() => setAssignmentAlertJobId(null)}><X size={18}/></button>
          <div className="field-alert-icon"><BellRing size={24}/></div>
          <div className="field-alert-copy">
            <span className="field-eyebrow">NEW JOB ASSIGNED</span>
            <strong>{assignmentAlertJob.title}</strong>
            <span>{formatDate(assignmentAlertJob.scheduled_start)}</span>
            {(assignmentAlertJob.site_name || assignmentAlertJob.site_address) && <span>{assignmentAlertJob.site_name || assignmentAlertJob.site_address}</span>}
          </div>
          <button className="field-alert-action" onClick={() => { setSelectedJobId(assignmentAlertJob.id); setAssignmentAlertJobId(null) }}>View job</button>
        </div>
      )}

      {selectedJob && <JobDetailsModal job={selectedJob} data={data} onClose={() => setSelectedJobId(null)}/>} 
    </div>
  )
}

function FieldDashboard({ data, onRefresh, onOpenJob }: { data: FieldData; onRefresh: (silent?: boolean) => Promise<FieldData | null>; onOpenJob: (jobId: string) => void }) {
  const now = Date.now()
  const current = data.jobs.filter(job => jobBucket(job, now) === 'current')
  const upcoming = data.jobs.filter(job => jobBucket(job, now) === 'upcoming')
  const past = data.jobs.filter(job => jobBucket(job, now) === 'past')
  const next = [...current, ...upcoming].sort((a, b) => String(a.scheduled_start).localeCompare(String(b.scheduled_start)))[0]

  return (
    <section className="field-page">
      <div className="field-hero">
        <div>
          <span className="field-eyebrow">MY WORK</span>
          <h1>{data.employee ? `Hi, ${data.employee.first_name}` : 'Operator workspace'}</h1>
          <p>Only your assigned work and field tools are shown here.</p>
        </div>
        <button className="field-refresh" onClick={() => void onRefresh()}>Refresh</button>
      </div>

      {!data.employee && (
        <div className="field-warning">
          <strong>No employee profile linked</strong>
          <span>An administrator needs to link this login to an employee record before assigned jobs can appear.</span>
        </div>
      )}

      <div className="field-stat-grid">
        <NavLink to="/jobs" className="field-stat"><CalendarDays/><strong>{current.length}</strong><span>Current</span></NavLink>
        <NavLink to="/jobs" className="field-stat"><Clock3/><strong>{upcoming.length}</strong><span>Upcoming</span></NavLink>
        <NavLink to="/jobs" className="field-stat"><CheckCircle2/><strong>{past.length}</strong><span>Past</span></NavLink>
      </div>

      <section className="field-panel">
        <div className="field-panel-heading"><div><span className="field-eyebrow">NEXT ASSIGNMENT</span><h2>What’s next</h2></div><NavLink to="/jobs">All my jobs</NavLink></div>
        {next ? <FieldJobCard job={next} data={data} onOpen={() => onOpenJob(next.id)}/> : <div className="field-empty"><strong>No assigned work</strong><span>When dispatch assigns you to a job, it will appear here automatically.</span></div>}
      </section>

      <div className="field-tool-grid">
        <NavLink to="/safety"><ShieldCheck/><div><strong>Safety</strong><span>Your forms and acknowledgements</span></div></NavLink>
        <NavLink to="/tickets"><ClipboardCheck/><div><strong>Tickets</strong><span>Paperwork for your assigned work</span></div></NavLink>
        <NavLink to="/timesheets"><HardHat/><div><strong>Timesheets</strong><span>Your hours and shift entries</span></div></NavLink>
      </div>
    </section>
  )
}

function MyJobsPage({ data, onOpenJob }: { data: FieldData; onOpenJob: (jobId: string) => void }) {
  const now = Date.now()
  const current = data.jobs.filter(job => jobBucket(job, now) === 'current')
  const upcoming = data.jobs.filter(job => jobBucket(job, now) === 'upcoming')
  const past = data.jobs
    .filter(job => jobBucket(job, now) === 'past')
    .sort((a, b) => String(b.scheduled_start).localeCompare(String(a.scheduled_start)))

  return (
    <section className="field-page">
      <div className="field-hero compact"><div><span className="field-eyebrow">ASSIGNED TO ME</span><h1>My jobs</h1><p>Past, current, and future work assigned directly to you. Tap a job to open its full details.</p></div></div>
      <JobGroup title="Current" eyebrow="NOW" jobs={current} data={data} onOpenJob={onOpenJob}/>
      <JobGroup title="Upcoming" eyebrow="NEXT" jobs={upcoming} data={data} onOpenJob={onOpenJob}/>
      <JobGroup title="Past" eyebrow="HISTORY" jobs={past} data={data} onOpenJob={onOpenJob}/>
    </section>
  )
}

function JobGroup({ title, eyebrow, jobs, data, onOpenJob }: { title: string; eyebrow: string; jobs: Job[]; data: FieldData; onOpenJob: (jobId: string) => void }) {
  return (
    <section className="field-panel field-job-group">
      <div className="field-panel-heading"><div><span className="field-eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="field-count">{jobs.length}</span></div>
      <div className="field-job-list">
        {jobs.length ? jobs.map(job => <FieldJobCard key={job.id} job={job} data={data} onOpen={() => onOpenJob(job.id)}/>) : <div className="field-empty"><span>No {title.toLowerCase()} assigned jobs.</span></div>}
      </div>
    </section>
  )
}

function FieldJobCard({ job, data, onOpen }: { job: Job; data: FieldData; onOpen: () => void }) {
  const jobAssignments = data.assignments.filter(assignment => assignment.job_id === job.id)
  const unitIds = new Set(jobAssignments.map(assignment => assignment.vehicle_id).filter(Boolean) as string[])
  const units = data.vehicles.filter(vehicle => unitIds.has(vehicle.id))
  const contact = data.contacts.find(item => item.job_id === job.id)

  return (
    <button type="button" className="field-job-card field-job-button" onClick={onOpen}>
      <div className="field-job-top">
        <div><span className="field-job-number">{job.job_number}</span><h3>{job.title}</h3></div>
        <span className={`field-status status-${job.status}`}>{statusLabel(job.status)}</span>
      </div>
      <div className="field-job-details">
        <span><CalendarDays size={17}/>{formatDate(job.scheduled_start)}</span>
        {contact?.customer_name && <span><Building2 size={17}/>{contact.customer_name}</span>}
        {(job.site_name || job.site_address) && <span><MapPin size={17}/>{job.site_name || job.site_address}</span>}
        {units.length > 0 && <span><Truck size={17}/>{units.map(unit => `Unit ${unit.unit_number}${unit.name ? ` · ${unit.name}` : ''}`).join(', ')}</span>}
      </div>
      <div className="field-job-open">View job details <ChevronRight size={17}/></div>
    </button>
  )
}

function JobDetailsModal({ job, data, onClose }: { job: Job; data: FieldData; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const contact = data.contacts.find(item => item.job_id === job.id)
  const jobAssignments = data.assignments.filter(assignment => assignment.job_id === job.id)
  const unitIds = new Set(jobAssignments.map(assignment => assignment.vehicle_id).filter(Boolean) as string[])
  const units = data.vehicles.filter(vehicle => unitIds.has(vehicle.id))
  const addressToCopy = job.site_address || ''

  const copyAddress = async () => {
    if (!addressToCopy) return
    try {
      await navigator.clipboard.writeText(addressToCopy)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="field-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="field-job-modal" role="dialog" aria-modal="true" aria-labelledby="operator-job-title">
        <div className="field-modal-header">
          <div><span className="field-job-number">{job.job_number}</span><h2 id="operator-job-title">{job.title}</h2></div>
          <button className="field-modal-close" aria-label="Close job details" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="field-modal-status-row">
          <span className={`field-status status-${job.status}`}>{statusLabel(job.status)}</span>
          <span><CalendarDays size={16}/>{formatDate(job.scheduled_start)}</span>
          {job.scheduled_end && <span><Clock3 size={16}/>Ends {formatDate(job.scheduled_end)}</span>}
        </div>

        <div className="field-detail-grid">
          <section className="field-detail-section">
            <div className="field-detail-heading"><Building2 size={19}/><span>Client</span></div>
            <strong>{contact?.customer_name || 'Client not available'}</strong>
            {contact?.contact_phone && <a href={`tel:${contact.contact_phone}`}><Phone size={16}/>{contact.contact_phone}</a>}
            {contact?.contact_email && <a href={`mailto:${contact.contact_email}`}><Mail size={16}/>{contact.contact_email}</a>}
            {contact?.customer_address && <span className="field-detail-muted">{contact.customer_address}</span>}
            {!contact?.contact_phone && !contact?.contact_email && <span className="field-detail-muted">No client contact information entered.</span>}
          </section>

          <section className="field-detail-section">
            <div className="field-detail-heading"><MapPin size={19}/><span>Job site</span></div>
            <strong>{job.site_name || 'Job site'}</strong>
            {job.site_address ? <><span>{job.site_address}</span><button className="field-copy-button" onClick={() => void copyAddress()}><Copy size={16}/>{copied ? 'Copied' : 'Copy address'}</button></> : <span className="field-detail-muted">No site address entered.</span>}
          </section>

          <section className="field-detail-section">
            <div className="field-detail-heading"><Truck size={19}/><span>Assigned equipment</span></div>
            {units.length ? units.map(unit => <span key={unit.id}>Unit {unit.unit_number} · {unit.name || unit.vehicle_type}</span>) : <span className="field-detail-muted">No unit assigned.</span>}
          </section>

          <section className="field-detail-section field-notes-section">
            <div className="field-detail-heading"><FileText size={19}/><span>Job notes</span></div>
            <p>{job.notes?.trim() || 'No job notes have been added.'}</p>
          </section>
        </div>

        <button className="field-modal-done" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}

function FieldModulePage({ icon, eyebrow, title, copy }: { icon: React.ReactNode; eyebrow: string; title: string; copy: string }) {
  return (
    <section className="field-page">
      <div className="field-hero compact"><div><span className="field-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div></div>
      <div className="field-module-placeholder">
        <div className="field-module-icon">{icon}</div>
        <h2>Operator-only workspace</h2>
        <p>This module is being connected next. Its data access is reserved for your own or assigned records rather than company-wide records.</p>
      </div>
    </section>
  )
}
