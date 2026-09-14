import { useCallback, useEffect, useMemo, useState } from 'react'
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
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-app.css'

const db = supabase as any

type Props = { userId: string; organizationId: string; organizationName: string }
type Employee = { id: string; first_name: string; last_name: string; position: string | null; status: string }
type Job = {
  id: string
  customer_id: string
  job_number: string
  title: string
  site_name: string | null
  site_address: string | null
  shop_time: string | null
  onsite_time: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  status: string
  notes: string | null
}
type Assignment = { id: string; job_id: string; employee_id: string | null; vehicle_id: string | null; role: string | null }
type Vehicle = { id: string; unit_number: string; name: string | null; vehicle_type: string; status: string }
type Contact = {
  job_id: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  contact_id: string | null
  contact_name: string | null
  contact_title: string | null
  contact_phone: string | null
  contact_email: string | null
  contact_type: string | null
  is_primary: boolean
}
type NotificationPayload = {
  job_title?: string
  onsite_time?: string
  shop_time?: string
  site_name?: string
  site_address?: string
  unit_number?: string
  unit_name?: string
  [key: string]: unknown
}
type Notification = {
  id: string
  notification_type: string
  title: string
  message: string | null
  entity_id: string | null
  payload: NotificationPayload
  read_at: string | null
  created_at: string
}
type Data = { employee: Employee | null; jobs: Job[]; assignments: Assignment[]; vehicles: Vehicle[]; contacts: Contact[] }

const EMPTY: Data = { employee: null, jobs: [], assignments: [], vehicles: [], contacts: [] }
const NAV = [
  ['Home', '/', Home],
  ['My Jobs', '/jobs', BriefcaseBusiness],
  ['Safety', '/safety', ShieldCheck],
  ['Tickets', '/tickets', ClipboardCheck],
  ['Timesheets', '/timesheets', HardHat],
] as const

function formatDate(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function formatTime(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function label(value: string) { return value.replaceAll('_',' ').replace(/\b\w/g, char => char.toUpperCase()) }
function bucket(job: Job, now: number): 'current'|'upcoming'|'past' {
  if (['completed','cancelled'].includes(job.status)) return 'past'
  const startValue = job.onsite_time || job.scheduled_start || job.shop_time
  const start = startValue ? new Date(startValue).getTime() : null
  const end = job.scheduled_end ? new Date(job.scheduled_end).getTime() : null
  if (end !== null && end < now) return 'past'
  if (start !== null && start > now) return 'upcoming'
  return 'current'
}

export default function OperatorAppV2({ userId, organizationId, organizationName }: Props) {
  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notification | null>(null)

  const load = useCallback(async (silent = false): Promise<Data | null> => {
    if (!silent) setLoading(true)
    setError('')
    const [employeeResult, jobsResult, assignmentsResult, vehiclesResult, contactsResult] = await Promise.all([
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id', organizationId).eq('user_id', userId).maybeSingle(),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status,notes').eq('organization_id', organizationId).order('onsite_time', { ascending: true, nullsFirst: false }),
      db.from('dispatch_assignments').select('id,job_id,employee_id,vehicle_id,role').eq('organization_id', organizationId),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id', organizationId).order('unit_number'),
      db.rpc('get_my_assigned_job_contacts', { _organization_id: organizationId }),
    ])
    const firstError = employeeResult.error || jobsResult.error || assignmentsResult.error || vehiclesResult.error || contactsResult.error
    if (firstError) {
      setError(firstError.message)
      if (!silent) setLoading(false)
      return null
    }
    const employee = employeeResult.data as Employee | null
    const assignments = (assignmentsResult.data ?? []) as Assignment[]
    const ownJobIds = new Set(assignments.filter((item: Assignment) => item.employee_id === employee?.id).map((item: Assignment) => item.job_id))
    const jobs = ((jobsResult.data ?? []) as Job[]).filter(job => ownJobIds.has(job.id))
    const next: Data = {
      employee,
      jobs,
      assignments: assignments.filter(item => ownJobIds.has(item.job_id)),
      vehicles: (vehiclesResult.data ?? []) as Vehicle[],
      contacts: ((contactsResult.data ?? []) as Contact[]).filter(contact => ownJobIds.has(contact.job_id)),
    }
    setData(next)
    setSelectedJobId(current => current && !next.jobs.some(job => job.id === current) ? null : current)
    if (!silent) setLoading(false)
    return next
  }, [organizationId, userId])

  const loadLatestNotice = useCallback(async () => {
    const result = await db.from('user_notifications')
      .select('id,notification_type,title,message,entity_id,payload,read_at,created_at')
      .eq('recipient_user_id', userId)
      .eq('organization_id', organizationId)
      .is('read_at', null)
      .in('notification_type', ['job_assigned','job_unassigned','job_equipment_updated'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!result.error && result.data) setNotice(result.data as Notification)
  }, [organizationId, userId])

  useEffect(() => { void load(); void loadLatestNotice() }, [load, loadLatestNotice])

  useEffect(() => {
    const channel = supabase.channel(`operator-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `recipient_user_id=eq.${userId}` }, async payload => {
        const row = payload.new as Notification
        if (!['job_assigned','job_unassigned','job_equipment_updated'].includes(row.notification_type)) return
        await load(true)
        setNotice(row)
      })
      .subscribe()
    const jobsChannel = supabase.channel(`operator-job-changes-v2-${organizationId}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `organization_id=eq.${organizationId}` }, () => { void load(true) })
      .subscribe()
    return () => { void supabase.removeChannel(channel); void supabase.removeChannel(jobsChannel) }
  }, [load, organizationId, userId])

  useEffect(() => {
    const resync = () => { setOnline(navigator.onLine); if (navigator.onLine) { void load(true); void loadLatestNotice() } }
    const offline = () => setOnline(false)
    const visibility = () => { if (document.visibilityState === 'visible') resync() }
    window.addEventListener('online', resync)
    window.addEventListener('focus', resync)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('online', resync)
      window.removeEventListener('focus', resync)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [load, loadLatestNotice])

  const dismissNotice = async () => {
    const current = notice
    setNotice(null)
    if (current) await db.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', current.id).eq('recipient_user_id', userId)
  }

  const signOut = async () => { await supabase.auth.signOut(); window.location.href='/' }
  const selectedJob = selectedJobId ? data.jobs.find(job => job.id === selectedJobId) ?? null : null

  if (loading) return <div className="field-loading">Loading your assigned work…</div>

  return (
    <div className="field-shell">
      <aside className="field-sidebar">
        <div className="field-brand"><div className="field-brand-mark">N</div><div><strong>NORTHBORN</strong><span>{organizationName}</span></div></div>
        <div className="field-role-chip">Operator</div>
        <nav className="field-nav">{NAV.map(([name,path,Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={19}/><span>{name}</span></NavLink>)}</nav>
        <button className="field-signout" onClick={() => void signOut()}><LogOut size={18}/>Sign out</button>
      </aside>

      <main className="field-main">
        <header className="field-topbar"><div><span className="field-top-label">FIELD WORKSPACE</span><strong>{organizationName}</strong></div><div className={online ? 'field-connection online':'field-connection offline'}>{online ? <Wifi size={15}/>:<WifiOff size={15}/>} {online?'Online':'Offline'}</div></header>
        {error && <div className="field-error">Unable to load your assigned work: {error}</div>}
        <Routes>
          <Route path="/" element={<HomePage data={data} onOpen={setSelectedJobId} onRefresh={() => load()}/>} />
          <Route path="/jobs" element={<JobsPage data={data} onOpen={setSelectedJobId}/>} />
          <Route path="/safety" element={<Placeholder icon={<ShieldCheck/>} eyebrow="SAFETY" title="My safety" text="Your own safety forms, acknowledgements and required compliance items will live here."/>}/>
          <Route path="/tickets" element={<Placeholder icon={<ClipboardCheck/>} eyebrow="TICKETS" title="My tickets" text="Field tickets connected to your assigned jobs will live here."/>}/>
          <Route path="/timesheets" element={<Placeholder icon={<HardHat/>} eyebrow="TIME" title="My timesheets" text="Your own hours and shift entries will live here."/>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </main>

      <nav className="field-mobile-nav">{NAV.map(([name,path,Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={20}/><span>{name}</span></NavLink>)}</nav>

      {notice && <NoticeCard notice={notice} data={data} onDismiss={() => void dismissNotice()} onOpenJob={jobId => { if (data.jobs.some(job => job.id === jobId)) setSelectedJobId(jobId); void dismissNotice() }}/>} 
      {selectedJob && <JobModal job={selectedJob} data={data} onClose={() => setSelectedJobId(null)}/>} 
    </div>
  )
}

function HomePage({ data, onOpen, onRefresh }: { data: Data; onOpen: (id:string)=>void; onRefresh: ()=>Promise<Data|null> }) {
  const now = Date.now()
  const current = data.jobs.filter(job => bucket(job,now)==='current')
  const upcoming = data.jobs.filter(job => bucket(job,now)==='upcoming')
  const past = data.jobs.filter(job => bucket(job,now)==='past')
  const next = [...current,...upcoming].sort((a,b)=>String(a.shop_time||a.onsite_time||a.scheduled_start).localeCompare(String(b.shop_time||b.onsite_time||b.scheduled_start)))[0]
  return <section className="field-page"><div className="field-hero"><div><span className="field-eyebrow">MY WORK</span><h1>{data.employee?`Hi, ${data.employee.first_name}`:'Operator workspace'}</h1><p>Your assigned work updates automatically when Dispatch changes it.</p></div><button className="field-refresh" onClick={()=>void onRefresh()}>Refresh</button></div>
    <div className="field-stat-grid"><NavLink to="/jobs" className="field-stat"><CalendarDays/><strong>{current.length}</strong><span>Current</span></NavLink><NavLink to="/jobs" className="field-stat"><Clock3/><strong>{upcoming.length}</strong><span>Upcoming</span></NavLink><NavLink to="/jobs" className="field-stat"><CheckCircle2/><strong>{past.length}</strong><span>Past</span></NavLink></div>
    <section className="field-panel"><div className="field-panel-heading"><div><span className="field-eyebrow">NEXT ASSIGNMENT</span><h2>What’s next</h2></div><NavLink to="/jobs">All my jobs</NavLink></div>{next?<JobCard job={next} data={data} onOpen={()=>onOpen(next.id)}/>:<div className="field-empty"><strong>No assigned work</strong><span>When Dispatch assigns you, it will appear here automatically.</span></div>}</section>
  </section>
}

function JobsPage({ data, onOpen }: { data: Data; onOpen:(id:string)=>void }) {
  const now=Date.now(); const groups:[string,Job[]][]=[['Current',data.jobs.filter(job=>bucket(job,now)==='current')],['Upcoming',data.jobs.filter(job=>bucket(job,now)==='upcoming')],['Past',data.jobs.filter(job=>bucket(job,now)==='past').sort((a,b)=>String(b.onsite_time||b.scheduled_start).localeCompare(String(a.onsite_time||a.scheduled_start)))]]
  return <section className="field-page"><div className="field-hero compact"><div><span className="field-eyebrow">ASSIGNED TO ME</span><h1>My jobs</h1><p>Tap any job for full site, contact, equipment and note details.</p></div></div>{groups.map(([name,jobs])=><section className="field-panel field-job-group" key={name}><div className="field-panel-heading"><h2>{name}</h2><span className="field-count">{jobs.length}</span></div><div className="field-job-list">{jobs.length?jobs.map(job=><JobCard key={job.id} job={job} data={data} onOpen={()=>onOpen(job.id)}/>):<div className="field-empty"><span>No {name.toLowerCase()} assigned jobs.</span></div>}</div></section>)}</section>
}

function JobCard({ job, data, onOpen }: { job:Job; data:Data; onOpen:()=>void }) {
  const contacts=data.contacts.filter(item=>item.job_id===job.id); const primary=contacts.find(item=>item.is_primary)||contacts[0]
  const unitIds=new Set(data.assignments.filter(item=>item.job_id===job.id).map(item=>item.vehicle_id).filter(Boolean) as string[]); const units=data.vehicles.filter(unit=>unitIds.has(unit.id))
  return <button type="button" className="field-job-card field-job-button" onClick={onOpen}><div className="field-job-top"><div><span className="field-job-number">{job.job_number}</span><h3>{job.title}</h3></div><span className={`field-status status-${job.status}`}>{label(job.status)}</span></div><div className="field-job-details"><span><Clock3 size={17}/>Shop {formatTime(job.shop_time)}</span><span><MapPin size={17}/>On site {formatTime(job.onsite_time||job.scheduled_start)}</span>{primary?.customer_name&&<span><Building2 size={17}/>{primary.customer_name}</span>}{primary?.contact_name&&<span><UserRound size={17}/>{primary.contact_name}</span>}{units.length>0&&<span><Truck size={17}/>{units.map(unit=>`Unit ${unit.unit_number}`).join(', ')}</span>}</div><div className="field-job-open">View job details <ChevronRight size={17}/></div></button>
}

function NoticeCard({ notice, data, onDismiss, onOpenJob }: { notice:Notification; data:Data; onDismiss:()=>void; onOpenJob:(id:string)=>void }) {
  const removed=notice.notification_type==='job_unassigned'; const equipment=notice.notification_type==='job_equipment_updated'; const canOpen=Boolean(notice.entity_id&&data.jobs.some(job=>job.id===notice.entity_id))
  const payload=notice.payload||{}; const jobTitle=String(payload.job_title||notice.message||'Job'); const onsite=typeof payload.onsite_time==='string'?payload.onsite_time:null
  return <div className={removed?'field-assignment-alert field-removal-alert':'field-assignment-alert'} role="alert" aria-live="assertive"><button className="field-alert-close" onClick={onDismiss}><X size={18}/></button><div className="field-alert-icon">{removed?<X size={24}/>:equipment?<Truck size={24}/>:<BellRing size={24}/>}</div><div className="field-alert-copy"><span className="field-eyebrow">{removed?'REMOVED FROM JOB':equipment?'JOB EQUIPMENT UPDATED':'NEW JOB ASSIGNED'}</span><strong>{jobTitle}</strong>{notice.message&&notice.message!==jobTitle&&<span>{notice.message}</span>}{onsite&&<span>On site {formatDate(onsite)}</span>}</div>{canOpen&&notice.entity_id&&<button className="field-alert-action" onClick={()=>onOpenJob(notice.entity_id!)}>View job</button>}</div>
}

function JobModal({ job, data, onClose }: { job:Job; data:Data; onClose:()=>void }) {
  const [copied,setCopied]=useState(false)
  const contacts=useMemo(()=>data.contacts.filter(item=>item.job_id===job.id).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)),[data.contacts,job.id])
  const client=contacts[0]
  const fieldContacts=contacts.filter(contact=>contact.contact_id)
  const unitIds=new Set(data.assignments.filter(item=>item.job_id===job.id).map(item=>item.vehicle_id).filter(Boolean) as string[]); const units=data.vehicles.filter(unit=>unitIds.has(unit.id))
  const copyAddress=async()=>{if(!job.site_address)return;await navigator.clipboard.writeText(job.site_address);setCopied(true);setTimeout(()=>setCopied(false),1600)}
  return <div className="field-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section className="field-job-modal" role="dialog" aria-modal="true"><div className="field-modal-header"><div><span className="field-job-number">{job.job_number}</span><h2>{job.title}</h2></div><button className="field-modal-close" onClick={onClose}><X size={20}/></button></div>
    <div className="field-modal-status-row"><span className={`field-status status-${job.status}`}>{label(job.status)}</span></div>
    <div className="field-detail-grid">
      <section className="field-detail-section"><div className="field-detail-heading"><Clock3 size={19}/><span>Timing</span></div><strong>Be at shop: {formatDate(job.shop_time)}</strong><strong>On site: {formatDate(job.onsite_time||job.scheduled_start)}</strong>{job.scheduled_end&&<span>Expected finish: {formatDate(job.scheduled_end)}</span>}</section>
      <section className="field-detail-section"><div className="field-detail-heading"><MapPin size={19}/><span>Job site</span></div><strong>{job.site_name||'Job site'}</strong>{job.site_address?<><span>{job.site_address}</span><button className="field-copy-button" onClick={()=>void copyAddress()}><Copy size={16}/>{copied?'Copied':'Copy address'}</button></>:<span className="field-detail-muted">No site address entered.</span>}</section>
      <section className="field-detail-section field-contacts-section"><div className="field-detail-heading"><Building2 size={19}/><span>Client</span></div>{client?<><strong>{client.customer_name}</strong>{client.customer_phone?<a href={`tel:${client.customer_phone}`}><Phone size={15}/><span>Main/company: {client.customer_phone}</span></a>:<span className="field-detail-muted">No main company number entered.</span>}<div className="field-contact-subheading">Field contacts</div>{fieldContacts.length?fieldContacts.map(contact=><div className="field-contact-card" key={contact.contact_id||`${job.id}-${contact.contact_name}`}><div><strong>{contact.contact_name||'Contact'}</strong>{contact.contact_title&&<span>{contact.contact_title}</span>}{contact.is_primary&&<small>Primary field contact</small>}</div>{contact.contact_phone&&<a href={`tel:${contact.contact_phone}`}><Phone size={15}/>{contact.contact_phone}</a>}{contact.contact_email&&<a href={`mailto:${contact.contact_email}`}><Mail size={15}/>{contact.contact_email}</a>}</div>):<span className="field-detail-muted">No field contact selected for this job.</span>}</>:<span className="field-detail-muted">Client contact information is unavailable.</span>}</section>
      <section className="field-detail-section"><div className="field-detail-heading"><Truck size={19}/><span>Assigned equipment</span></div>{units.length?units.map(unit=><span key={unit.id}>Unit {unit.unit_number} · {unit.name||unit.vehicle_type}</span>):<span className="field-detail-muted">No unit assigned.</span>}</section>
      <section className="field-detail-section field-notes-section"><div className="field-detail-heading"><FileText size={19}/><span>Job notes</span></div><p>{job.notes?.trim()||'No job notes have been added.'}</p></section>
    </div><button className="field-modal-done" onClick={onClose}>Done</button>
  </section></div>
}

function Placeholder({icon,eyebrow,title,text}:{icon:React.ReactNode;eyebrow:string;title:string;text:string}){return <section className="field-page"><div className="field-hero compact"><div><span className="field-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div></div><div className="field-module-placeholder"><div className="field-module-icon">{icon}</div><h2>Operator workspace</h2><p>This module is reserved for your own or assigned records.</p></div></section>}
