import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Gauge, MapPin, Truck, UserRound } from 'lucide-react'
import { supabase } from './lib/supabase'
import './operations-calendar.css'

const db = supabase as any

type Organization = { id: string; name: string }
type Customer = { id: string; name: string }
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
}
type Assignment = { job_id: string; employee_id: string | null; vehicle_id: string | null }
type Employee = { id: string; first_name: string; last_name: string }
type Vehicle = { id: string; unit_number: string; name: string | null; vehicle_type: string }

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  next.setDate(next.getDate() - day)
  next.setHours(0,0,0,0)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dayKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function jobDay(job: Job) {
  const value = job.onsite_time || job.scheduled_start || job.shop_time
  if (!value) return null
  return dayKey(new Date(value))
}

function time(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function OperationsCalendarPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [roleKey, setRoleKey] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) { setLoading(false); return }

    const membershipResult = await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id', user.id).eq('status','active').limit(1).maybeSingle()
    if (membershipResult.error || !membershipResult.data?.id) { setError(membershipResult.error?.message || 'No active company membership found.'); setLoading(false); return }
    const org = membershipResult.data.organization as Organization
    const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membershipResult.data.id)
    const key = roles.data?.[0]?.role?.key || ''
    setOrganization(org)
    setRoleKey(key)
    if (key === 'operator') { setLoading(false); return }

    const [customerResult, jobResult, assignmentResult, employeeResult, vehicleResult] = await Promise.all([
      db.from('customers').select('id,name').eq('organization_id', org.id).order('name'),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status').eq('organization_id', org.id).neq('status','cancelled'),
      db.from('dispatch_assignments').select('job_id,employee_id,vehicle_id').eq('organization_id', org.id),
      db.from('employees').select('id,first_name,last_name').eq('organization_id', org.id),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type').eq('organization_id', org.id),
    ])
    const firstError = customerResult.error || jobResult.error || assignmentResult.error || employeeResult.error || vehicleResult.error
    if (firstError) setError(firstError.message)
    setCustomers(customerResult.data ?? [])
    setJobs(jobResult.data ?? [])
    setAssignments(assignmentResult.data ?? [])
    setEmployees(employeeResult.data ?? [])
    setVehicles(vehicleResult.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const today = dayKey(new Date())
  const rangeLabel = `${new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric'}).format(days[0])} – ${new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(days[6])}`

  if (loading) return <div className="calendar-loading">Loading calendar…</div>
  if (!organization) return <Navigate to="/" replace />
  if (roleKey === 'operator') return <Navigate to="/" replace />

  return (
    <div className="ops-calendar-shell">
      <aside className="ops-calendar-sidebar">
        <div className="ops-calendar-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{organization.name}</small></span></div>
        <nav>
          <NavLink to="/"><Gauge size={18}/>Dashboard</NavLink>
          <NavLink to="/calendar" className="active"><CalendarDays size={18}/>Calendar</NavLink>
          <NavLink to="/dispatch"><CalendarDays size={18}/>Dispatch</NavLink>
          <NavLink to="/jobs"><BriefcaseBusiness size={18}/>Jobs</NavLink>
        </nav>
      </aside>

      <main className="ops-calendar-main">
        <header className="ops-calendar-header">
          <div className="ops-calendar-title"><CalendarDays size={22}/><div><strong>Operations Calendar</strong><span>{organization.name}</span></div></div>
          <div className="ops-calendar-controls">
            <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <button aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart,-7))}><ChevronLeft size={18}/></button>
            <button aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart,7))}><ChevronRight size={18}/></button>
            <strong>{rangeLabel}</strong>
          </div>
        </header>

        {error && <div className="calendar-error">{error}</div>}

        <section className="ops-week-grid">
          {days.map(day => {
            const key = dayKey(day)
            const dayJobs = jobs
              .filter(job => jobDay(job) === key)
              .sort((a,b) => String(a.onsite_time || a.scheduled_start || a.shop_time).localeCompare(String(b.onsite_time || b.scheduled_start || b.shop_time)))
            return (
              <div className={key === today ? 'ops-day today' : 'ops-day'} key={key}>
                <div className="ops-day-head"><span>{new Intl.DateTimeFormat('en-CA',{weekday:'short'}).format(day)}</span><strong>{day.getDate()}</strong></div>
                <div className="ops-day-events">
                  {dayJobs.map(job => {
                    const customer = customers.find(item => item.id === job.customer_id)
                    const jobAssignments = assignments.filter(item => item.job_id === job.id)
                    const crew = jobAssignments.map(item => employees.find(employee => employee.id === item.employee_id)).filter(Boolean) as Employee[]
                    const units = jobAssignments.map(item => vehicles.find(vehicle => vehicle.id === item.vehicle_id)).filter(Boolean) as Vehicle[]
                    return (
                      <button className={`ops-event status-${job.status}`} key={job.id} onClick={() => navigate(`/dispatch?job=${job.id}`)}>
                        <div className="ops-event-time"><span><Clock3 size={13}/>Shop {time(job.shop_time)}</span><span><MapPin size={13}/>Site {time(job.onsite_time || job.scheduled_start)}</span></div>
                        <strong>{job.title}</strong>
                        <small>{customer?.name || 'Unknown customer'}</small>
                        <div className="ops-event-meta">
                          {crew.length > 0 && <span><UserRound size={12}/>{crew.map(item => item.first_name).join(', ')}</span>}
                          {units.length > 0 && <span><Truck size={12}/>{units.map(item => `#${item.unit_number}`).join(', ')}</span>}
                        </div>
                      </button>
                    )
                  })}
                  {!dayJobs.length && <div className="ops-no-events">No jobs</div>}
                </div>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}
