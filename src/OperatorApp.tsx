import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HardHat,
  Home,
  LogOut,
  MapPin,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-app.css'

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
  job_number: string
  title: string
  site_name: string | null
  site_address: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  status: string
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

type FieldData = {
  employee: Employee | null
  jobs: Job[]
  assignments: Assignment[]
  vehicles: Vehicle[]
}

const EMPTY_DATA: FieldData = { employee: null, jobs: [], assignments: [], vehicles: [] }
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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [employeeResult, jobsResult, assignmentsResult, vehiclesResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id,first_name,last_name,position,status')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('id,job_number,title,site_name,site_address,scheduled_start,scheduled_end,status')
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
    ])

    const firstError = employeeResult.error || jobsResult.error || assignmentsResult.error || vehiclesResult.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const employee = (employeeResult.data ?? null) as Employee | null
    const assignments = (assignmentsResult.data ?? []) as Assignment[]
    const ownJobIds = new Set(
      assignments
        .filter(assignment => assignment.employee_id === employee?.id)
        .map(assignment => assignment.job_id),
    )

    // RLS is the primary security boundary. This second filter ensures the UI also
    // refuses to render a job unless the signed-in employee has their own assignment row.
    const jobs = ((jobsResult.data ?? []) as Job[]).filter(job => ownJobIds.has(job.id))

    setData({
      employee,
      jobs,
      assignments: assignments.filter(assignment => ownJobIds.has(assignment.job_id)),
      vehicles: (vehiclesResult.data ?? []) as Vehicle[],
    })
    setLoading(false)
  }, [organizationId, userId])

  useEffect(() => {
    void load()
  }, [load])

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
          <Route path="/" element={<FieldDashboard data={data} onRefresh={load}/>} />
          <Route path="/jobs" element={<MyJobsPage data={data}/>} />
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
    </div>
  )
}

function FieldDashboard({ data, onRefresh }: { data: FieldData; onRefresh: () => Promise<void> }) {
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
        {next ? <FieldJobCard job={next} data={data}/> : <div className="field-empty"><strong>No assigned work</strong><span>When dispatch assigns you to a job, it will appear here automatically.</span></div>}
      </section>

      <div className="field-tool-grid">
        <NavLink to="/safety"><ShieldCheck/><div><strong>Safety</strong><span>Your forms and acknowledgements</span></div></NavLink>
        <NavLink to="/tickets"><ClipboardCheck/><div><strong>Tickets</strong><span>Paperwork for your assigned work</span></div></NavLink>
        <NavLink to="/timesheets"><HardHat/><div><strong>Timesheets</strong><span>Your hours and shift entries</span></div></NavLink>
      </div>
    </section>
  )
}

function MyJobsPage({ data }: { data: FieldData }) {
  const now = Date.now()
  const current = data.jobs.filter(job => jobBucket(job, now) === 'current')
  const upcoming = data.jobs.filter(job => jobBucket(job, now) === 'upcoming')
  const past = data.jobs
    .filter(job => jobBucket(job, now) === 'past')
    .sort((a, b) => String(b.scheduled_start).localeCompare(String(a.scheduled_start)))

  return (
    <section className="field-page">
      <div className="field-hero compact"><div><span className="field-eyebrow">ASSIGNED TO ME</span><h1>My jobs</h1><p>Past, current, and future work assigned directly to you.</p></div></div>
      <JobGroup title="Current" eyebrow="NOW" jobs={current} data={data}/>
      <JobGroup title="Upcoming" eyebrow="NEXT" jobs={upcoming} data={data}/>
      <JobGroup title="Past" eyebrow="HISTORY" jobs={past} data={data}/>
    </section>
  )
}

function JobGroup({ title, eyebrow, jobs, data }: { title: string; eyebrow: string; jobs: Job[]; data: FieldData }) {
  return (
    <section className="field-panel field-job-group">
      <div className="field-panel-heading"><div><span className="field-eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="field-count">{jobs.length}</span></div>
      <div className="field-job-list">
        {jobs.length ? jobs.map(job => <FieldJobCard key={job.id} job={job} data={data}/>) : <div className="field-empty"><span>No {title.toLowerCase()} assigned jobs.</span></div>}
      </div>
    </section>
  )
}

function FieldJobCard({ job, data }: { job: Job; data: FieldData }) {
  const jobAssignments = data.assignments.filter(assignment => assignment.job_id === job.id)
  const unitIds = new Set(jobAssignments.map(assignment => assignment.vehicle_id).filter(Boolean) as string[])
  const units = data.vehicles.filter(vehicle => unitIds.has(vehicle.id))

  return (
    <article className="field-job-card">
      <div className="field-job-top">
        <div><span className="field-job-number">{job.job_number}</span><h3>{job.title}</h3></div>
        <span className={`field-status status-${job.status}`}>{statusLabel(job.status)}</span>
      </div>
      <div className="field-job-details">
        <span><CalendarDays size={17}/>{formatDate(job.scheduled_start)}</span>
        {(job.site_name || job.site_address) && <span><MapPin size={17}/>{job.site_name || job.site_address}</span>}
        {units.length > 0 && <span><Truck size={17}/>{units.map(unit => `Unit ${unit.unit_number}${unit.name ? ` · ${unit.name}` : ''}`).join(', ')}</span>}
      </div>
      {job.site_name && job.site_address && <div className="field-address">{job.site_address}</div>}
    </article>
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
