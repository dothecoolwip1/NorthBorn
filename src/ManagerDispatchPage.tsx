import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, useSearchParams } from 'react-router-dom'
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ContactRound,
  Gauge,
  HardHat,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Truck,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './manager-dispatch.css'

const db = supabase as any

type Organization = { id: string; name: string }
type Customer = { id: string; name: string; address: string | null; phone: string | null }
type Employee = { id: string; first_name: string; last_name: string; position: string | null; status: string }
type Vehicle = { id: string; unit_number: string; name: string | null; vehicle_type: string; status: string }
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
type Contact = {
  id: string
  customer_id: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  contact_type: string
  status: string
}
type JobContact = { id: string; job_id: string; contact_id: string; is_primary: boolean }
type Workspace = {
  organization: Organization | null
  roleKey: string
  customers: Customer[]
  employees: Employee[]
  vehicles: Vehicle[]
  jobs: Job[]
  assignments: Assignment[]
  contacts: Contact[]
  jobContacts: JobContact[]
}

const EMPTY: Workspace = {
  organization: null,
  roleKey: '',
  customers: [],
  employees: [],
  vehicles: [],
  jobs: [],
  assignments: [],
  contacts: [],
  jobContacts: [],
}

const NAV = [
  ['Dashboard', '/', Gauge],
  ['Calendar', '/calendar', CalendarDays],
  ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness],
  ['Customers', '/customers', ContactRound],
  ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck],
  ['Maintenance', '/maintenance', Wrench],
  ['Safety', '/safety', ShieldCheck],
  ['Timesheets', '/timesheets', HardHat],
] as const

function readError(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: string })?.message || error || 'Something went wrong.')
}

function dateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

function formatDate(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function formatTime(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

export default function ManagerDispatchPage() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  const load = useCallback(async () => {
    setError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setWorkspace(EMPTY)
      setLoading(false)
      return
    }

    const membershipResult = await db
      .from('organization_members')
      .select('id,organization_id,organization:organizations(id,name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (membershipResult.error || !membershipResult.data?.id) {
      setError(membershipResult.error?.message || 'No active company membership found.')
      setLoading(false)
      return
    }

    const membership = membershipResult.data
    const org = membership.organization as Organization
    const roleResult = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.id)
    const roleKey = roleResult.data?.[0]?.role?.key || ''

    if (roleKey === 'operator') {
      setWorkspace({ ...EMPTY, organization: org, roleKey })
      setLoading(false)
      return
    }

    const [customers, employees, vehicles, jobs, assignments, contacts, jobContacts] = await Promise.all([
      db.from('customers').select('id,name,address,phone').eq('organization_id', org.id).order('name'),
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id', org.id).order('last_name'),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id', org.id).order('unit_number'),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status,notes').eq('organization_id', org.id).order('onsite_time', { ascending: true, nullsFirst: false }),
      db.from('dispatch_assignments').select('id,job_id,employee_id,vehicle_id,role').eq('organization_id', org.id),
      db.from('customer_contacts').select('id,customer_id,name,title,phone,email,contact_type,status').eq('organization_id', org.id).neq('status', 'archived').order('name'),
      db.from('job_contacts').select('id,job_id,contact_id,is_primary').eq('organization_id', org.id),
    ])

    const firstError = customers.error || employees.error || vehicles.error || jobs.error || assignments.error || contacts.error || jobContacts.error
    if (firstError) setError(firstError.message)

    setWorkspace({
      organization: org,
      roleKey,
      customers: customers.data ?? [],
      employees: employees.data ?? [],
      vehicles: vehicles.data ?? [],
      jobs: jobs.data ?? [],
      assignments: assignments.data ?? [],
      contacts: contacts.data ?? [],
      jobContacts: jobContacts.data ?? [],
    })
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const requestedJob = params.get('job')
    if (requestedJob && workspace.jobs.some(job => job.id === requestedJob)) setSelectedJobId(requestedJob)
  }, [params, workspace.jobs])

  const closeJob = () => {
    setSelectedJobId(null)
    if (params.has('job')) {
      const next = new URLSearchParams(params)
      next.delete('job')
      setParams(next, { replace: true })
    }
  }

  const jobs = useMemo(
    () => workspace.jobs.filter(job => !['completed', 'cancelled'].includes(job.status)),
    [workspace.jobs],
  )

  if (loading) return <div className="dispatch-v2-loading">Loading Dispatch…</div>
  if (!workspace.organization) return <Navigate to="/" replace />
  if (workspace.roleKey === 'operator') return <Navigate to="/" replace />

  const selectedJob = selectedJobId ? workspace.jobs.find(job => job.id === selectedJobId) ?? null : null

  return (
    <div className="dispatch-v2-shell">
      <aside className="dispatch-v2-sidebar">
        <div className="dispatch-v2-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{workspace.organization.name}</small></span></div>
        <nav>{NAV.map(([label,path,Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      </aside>

      <main className="dispatch-v2-main">
        <header className="dispatch-v2-header">
          <div><span className="eyebrow">LIVE OPERATIONS</span><strong>Dispatch</strong></div>
          <div className="dispatch-v2-header-actions"><NavLink className="secondary" to="/calendar"><CalendarDays size={17}/>Calendar</NavLink><NavLink className="primary compact" to="/jobs"><Plus size={17}/>New job</NavLink></div>
        </header>

        <section className="dispatch-v2-page">
          <div className="dispatch-v2-hero">
            <div><span className="eyebrow">DISPATCH BOARD</span><h1>Today and upcoming work</h1><p>Tap a job to edit details, contacts, crew and units.</p></div>
            <div className="dispatch-v2-summary"><span><strong>{jobs.length}</strong> active</span><span><strong>{jobs.filter(job => workspace.assignments.some(a => a.job_id === job.id && a.employee_id)).length}</strong> crewed</span></div>
          </div>
          {error && <div className="message">{error}</div>}

          <div className="dispatch-v2-board">
            {jobs.map(job => (
              <CompactJobCard key={job.id} job={job} workspace={workspace} onOpen={() => setSelectedJobId(job.id)}/>
            ))}
          </div>
          {!jobs.length && <div className="dispatch-v2-empty"><strong>No active jobs</strong><span>Create a job and it will appear here.</span></div>}
        </section>
      </main>

      {selectedJob && <JobManagementModal key={selectedJob.id} job={selectedJob} workspace={workspace} onClose={closeJob} onChanged={load}/>} 
    </div>
  )
}

function CompactJobCard({ job, workspace, onOpen }: { job: Job; workspace: Workspace; onOpen: () => void }) {
  const customer = workspace.customers.find(item => item.id === job.customer_id)
  const assignments = workspace.assignments.filter(item => item.job_id === job.id)
  const crew = assignments
    .map(item => workspace.employees.find(employee => employee.id === item.employee_id))
    .filter(Boolean) as Employee[]
  const units = assignments
    .map(item => workspace.vehicles.find(vehicle => vehicle.id === item.vehicle_id))
    .filter(Boolean) as Vehicle[]
  const contacts = workspace.jobContacts
    .filter(item => item.job_id === job.id)
    .map(item => workspace.contacts.find(contact => contact.id === item.contact_id))
    .filter(Boolean) as Contact[]

  return (
    <button type="button" className="dispatch-v2-card" onClick={onOpen}>
      <div className="dispatch-v2-card-top">
        <div><span className="job-number">{job.job_number}</span><h2>{job.title}</h2><p>{customer?.name || 'Unknown customer'} · {job.site_name || job.site_address || 'Site not set'}</p></div>
        <span className={`status-pill status-${job.status}`}>{statusLabel(job.status)}</span>
      </div>
      <div className="dispatch-v2-times">
        <span><Clock3 size={16}/><b>Shop</b>{formatTime(job.shop_time)}</span>
        <span><MapPin size={16}/><b>On site</b>{formatTime(job.onsite_time || job.scheduled_start)}</span>
      </div>
      <div className="dispatch-v2-card-meta">
        <span><UserRound size={15}/>{crew.length ? crew.map(item => item.first_name).join(', ') : 'No crew'}</span>
        <span><Truck size={15}/>{units.length ? units.map(item => `#${item.unit_number}`).join(', ') : 'No unit'}</span>
        <span><ContactRound size={15}/>{contacts.length ? contacts.map(item => item.name).join(', ') : 'No field contact'}</span>
      </div>
      <div className="dispatch-v2-open">Manage job <ChevronRight size={17}/></div>
    </button>
  )
}

function JobManagementModal({ job, workspace, onClose, onChanged }: { job: Job; workspace: Workspace; onClose: () => void; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({
    customer_id: job.customer_id,
    job_number: job.job_number,
    title: job.title,
    site_name: job.site_name || '',
    site_address: job.site_address || '',
    shop_time: dateTimeLocal(job.shop_time),
    onsite_time: dateTimeLocal(job.onsite_time || job.scheduled_start),
    scheduled_end: dateTimeLocal(job.scheduled_end),
    notes: job.notes || '',
  })
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([])
  const [contactFormOpen, setContactFormOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', title: '', phone: '', email: '', contact_type: 'field' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const assignments = workspace.assignments.filter(item => item.job_id === job.id)
  const crewAssignments = assignments.filter(item => item.employee_id)
  const unitAssignments = assignments.filter(item => item.vehicle_id)
  const currentCustomer = workspace.customers.find(customer => customer.id === form.customer_id)
  const customerContacts = workspace.contacts.filter(contact => contact.customer_id === form.customer_id && contact.status !== 'archived')
  const selectedContactRows = workspace.jobContacts.filter(item => item.job_id === job.id)
  const selectedContactIds = new Set(selectedContactRows.map(item => item.contact_id))

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const onsite = toIso(form.onsite_time)
      const result = await db.from('jobs').update({
        customer_id: form.customer_id,
        job_number: form.job_number.trim(),
        title: form.title.trim(),
        site_name: form.site_name.trim() || null,
        site_address: form.site_address.trim() || null,
        shop_time: toIso(form.shop_time),
        onsite_time: onsite,
        scheduled_start: onsite,
        scheduled_end: toIso(form.scheduled_end),
        notes: form.notes.trim() || null,
      }).eq('id', job.id).eq('organization_id', workspace.organization!.id)
      if (result.error) throw result.error
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const addAssignments = async () => {
    if (!selectedEmployees.length && !selectedVehicles.length) return
    setBusy(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id
      if (!userId) throw new Error('You must be signed in.')
      const rows = [
        ...selectedEmployees.filter(id => !crewAssignments.some(item => item.employee_id === id)).map(id => ({ organization_id: workspace.organization!.id, job_id: job.id, employee_id: id, vehicle_id: null, role: 'crew', created_by: userId })),
        ...selectedVehicles.filter(id => !unitAssignments.some(item => item.vehicle_id === id)).map(id => ({ organization_id: workspace.organization!.id, job_id: job.id, employee_id: null, vehicle_id: id, role: 'unit', created_by: userId })),
      ]
      if (rows.length) {
        const result = await db.from('dispatch_assignments').insert(rows)
        if (result.error) throw result.error
      }
      if (selectedVehicles.length) await db.from('fleet_vehicles').update({ status: 'assigned' }).in('id', selectedVehicles).eq('organization_id', workspace.organization!.id)
      await db.from('jobs').update({ status: 'dispatched' }).eq('id', job.id).eq('organization_id', workspace.organization!.id)
      setSelectedEmployees([])
      setSelectedVehicles([])
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const removeAssignment = async (assignment: Assignment) => {
    setBusy(true)
    setError('')
    try {
      const result = await db.from('dispatch_assignments').delete().eq('id', assignment.id).eq('organization_id', workspace.organization!.id)
      if (result.error) throw result.error
      if (assignment.vehicle_id) {
        const remaining = await db.from('dispatch_assignments').select('id').eq('organization_id', workspace.organization!.id).eq('vehicle_id', assignment.vehicle_id).limit(1)
        if (!remaining.error && !(remaining.data?.length)) await db.from('fleet_vehicles').update({ status: 'available' }).eq('id', assignment.vehicle_id).eq('organization_id', workspace.organization!.id)
      }
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleContact = async (contactId: string) => {
    setBusy(true)
    setError('')
    try {
      const existing = selectedContactRows.find(item => item.contact_id === contactId)
      if (existing) {
        const result = await db.from('job_contacts').delete().eq('id', existing.id).eq('organization_id', workspace.organization!.id)
        if (result.error) throw result.error
      } else {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) throw new Error('You must be signed in.')
        const result = await db.from('job_contacts').insert({ organization_id: workspace.organization!.id, job_id: job.id, contact_id: contactId, is_primary: selectedContactRows.length === 0, created_by: userId })
        if (result.error) throw result.error
      }
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const makePrimaryContact = async (contactId: string) => {
    setBusy(true)
    setError('')
    try {
      const clear = await db.from('job_contacts').update({ is_primary: false }).eq('organization_id', workspace.organization!.id).eq('job_id', job.id)
      if (clear.error) throw clear.error
      const result = await db.from('job_contacts').update({ is_primary: true }).eq('organization_id', workspace.organization!.id).eq('job_id', job.id).eq('contact_id', contactId)
      if (result.error) throw result.error
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const addContact = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id
      if (!userId) throw new Error('You must be signed in.')
      const result = await db.from('customer_contacts').insert({
        organization_id: workspace.organization!.id,
        customer_id: form.customer_id,
        name: contactForm.name.trim(),
        title: contactForm.title.trim() || null,
        phone: contactForm.phone.trim() || null,
        email: contactForm.email.trim() || null,
        contact_type: contactForm.contact_type,
        created_by: userId,
      }).select('id').single()
      if (result.error) throw result.error
      const link = await db.from('job_contacts').insert({ organization_id: workspace.organization!.id, job_id: job.id, contact_id: result.data.id, is_primary: selectedContactRows.length === 0, created_by: userId })
      if (link.error) throw link.error
      setContactForm({ name: '', title: '', phone: '', email: '', contact_type: 'field' })
      setContactFormOpen(false)
      await onChanged()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (status: string) => {
    setBusy(true)
    const result = await db.from('jobs').update({ status }).eq('id', job.id).eq('organization_id', workspace.organization!.id)
    if (result.error) setError(result.error.message)
    await onChanged()
    setBusy(false)
  }

  const toggle = (list: string[], setter: (next: string[]) => void, id: string) => setter(list.includes(id) ? list.filter(item => item !== id) : [...list, id])

  return (
    <div className="dispatch-v2-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="dispatch-v2-modal" role="dialog" aria-modal="true">
        <div className="dispatch-v2-modal-head">
          <div><span className="eyebrow">JOB MANAGEMENT</span><h2>{job.title}</h2><p>{job.job_number}</p></div>
          <button type="button" className="dispatch-v2-close" onClick={onClose}><X size={21}/></button>
        </div>

        {error && <div className="message">{error}</div>}

        <form className="dispatch-v2-edit-form" onSubmit={saveDetails}>
          <div className="dispatch-v2-section-title"><span>Job details</span><small>Edit anytime, even after dispatch.</small></div>
          <div className="dispatch-v2-form-grid">
            <label><span>Customer</span><select value={form.customer_id} onChange={event => setForm({ ...form, customer_id: event.target.value })}>{workspace.customers.map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
            <label><span>Job number</span><input value={form.job_number} onChange={event => setForm({ ...form, job_number: event.target.value })}/></label>
            <label className="wide"><span>Job title</span><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required/></label>
            <label><span>Site name</span><input value={form.site_name} onChange={event => setForm({ ...form, site_name: event.target.value })}/></label>
            <label><span>Site address</span><input value={form.site_address} onChange={event => setForm({ ...form, site_address: event.target.value })}/></label>
            <label><span>Be at shop</span><input type="datetime-local" value={form.shop_time} onChange={event => setForm({ ...form, shop_time: event.target.value })}/></label>
            <label><span>On site</span><input type="datetime-local" value={form.onsite_time} onChange={event => setForm({ ...form, onsite_time: event.target.value })}/></label>
            <label><span>Expected finish</span><input type="datetime-local" value={form.scheduled_end} onChange={event => setForm({ ...form, scheduled_end: event.target.value })}/></label>
            <label className="wide"><span>Notes</span><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label>
          </div>
          <div className="dispatch-v2-save-row"><button className="primary" disabled={busy}>Save job details</button></div>
        </form>

        <section className="dispatch-v2-section">
          <div className="dispatch-v2-section-title"><span>Client & field contacts</span><small>The company number stays first; selected field contacts appear directly beneath it for operators.</small></div>
          <div className="dispatch-v2-client-summary">
            <span><Building2 size={17}/><strong>{currentCustomer?.name || 'Unknown customer'}</strong></span>
            {currentCustomer?.phone ? <a href={`tel:${currentCustomer.phone}`}><Phone size={16}/>{currentCustomer.phone}</a> : <small>No main company number entered.</small>}
          </div>
          <div className="dispatch-v2-section-title dispatch-v2-contact-subtitle"><span>Field contacts</span><small>Select the people this crew should actually call.</small></div>
          <div className="dispatch-v2-contact-list">
            {customerContacts.map(contact => {
              const assigned = selectedContactIds.has(contact.id)
              const primary = selectedContactRows.find(item => item.contact_id === contact.id)?.is_primary
              return <div className={assigned ? 'dispatch-v2-contact active' : 'dispatch-v2-contact'} key={contact.id}>
                <button type="button" onClick={() => void toggleContact(contact.id)} disabled={busy}><span className="dispatch-v2-check">{assigned && <Check size={14}/>}</span><span><strong>{contact.name}</strong><small>{contact.title || statusLabel(contact.contact_type)}{contact.phone ? ` · ${contact.phone}` : ''}</small></span></button>
                {assigned && <button type="button" className={primary ? 'dispatch-v2-star active' : 'dispatch-v2-star'} onClick={() => void makePrimaryContact(contact.id)} title="Primary field contact"><Star size={16} fill={primary ? 'currentColor' : 'none'}/></button>}
              </div>
            })}
            {!customerContacts.length && <div className="dispatch-v2-inline-empty">No contacts for this customer yet.</div>}
          </div>
          <button type="button" className="secondary dispatch-v2-add-contact" onClick={() => setContactFormOpen(!contactFormOpen)}><Plus size={16}/>Add customer contact</button>
          {contactFormOpen && <form className="dispatch-v2-contact-form" onSubmit={addContact}>
            <input placeholder="Name" value={contactForm.name} onChange={event => setContactForm({ ...contactForm, name: event.target.value })} required/>
            <input placeholder="Role / title" value={contactForm.title} onChange={event => setContactForm({ ...contactForm, title: event.target.value })}/>
            <input placeholder="Phone" value={contactForm.phone} onChange={event => setContactForm({ ...contactForm, phone: event.target.value })}/>
            <input type="email" placeholder="Email" value={contactForm.email} onChange={event => setContactForm({ ...contactForm, email: event.target.value })}/>
            <select value={contactForm.contact_type} onChange={event => setContactForm({ ...contactForm, contact_type: event.target.value })}><option value="field">Field operator</option><option value="supervisor">Supervisor</option><option value="dispatch">Dispatch</option><option value="office">Office</option><option value="billing">Billing</option><option value="accounting">Accounting</option><option value="other">Other</option></select>
            <button className="primary" disabled={busy}>Save & use on job</button>
          </form>}
        </section>

        <section className="dispatch-v2-section">
          <div className="dispatch-v2-section-title"><span>Crew</span><small>Removing an operator immediately resyncs their Northborn screen.</small></div>
          <div className="dispatch-v2-assigned-list">
            {crewAssignments.map(assignment => {
              const employee = workspace.employees.find(item => item.id === assignment.employee_id)
              return employee ? <div className="dispatch-v2-assigned-row" key={assignment.id}><span><UserRound size={16}/><strong>{employee.first_name} {employee.last_name}</strong><small>{employee.position || 'Employee'}</small></span><button type="button" onClick={() => void removeAssignment(assignment)} disabled={busy}><X size={16}/>Unassign</button></div> : null
            })}
            {!crewAssignments.length && <div className="dispatch-v2-inline-empty">No crew assigned.</div>}
          </div>
          <div className="dispatch-v2-picker">{workspace.employees.filter(employee => employee.status === 'active' && !crewAssignments.some(item => item.employee_id === employee.id)).map(employee => <button type="button" className={selectedEmployees.includes(employee.id) ? 'active' : ''} key={employee.id} onClick={() => toggle(selectedEmployees, setSelectedEmployees, employee.id)}><UserRound size={15}/>{employee.first_name} {employee.last_name}</button>)}</div>
        </section>

        <section className="dispatch-v2-section">
          <div className="dispatch-v2-section-title"><span>Units</span><small>Assign or remove trucks and equipment.</small></div>
          <div className="dispatch-v2-assigned-list">
            {unitAssignments.map(assignment => {
              const vehicle = workspace.vehicles.find(item => item.id === assignment.vehicle_id)
              return vehicle ? <div className="dispatch-v2-assigned-row" key={assignment.id}><span><Truck size={16}/><strong>Unit {vehicle.unit_number}</strong><small>{vehicle.name || vehicle.vehicle_type}</small></span><button type="button" onClick={() => void removeAssignment(assignment)} disabled={busy}><X size={16}/>Unassign</button></div> : null
            })}
            {!unitAssignments.length && <div className="dispatch-v2-inline-empty">No units assigned.</div>}
          </div>
          <div className="dispatch-v2-picker">{workspace.vehicles.filter(vehicle => (vehicle.status === 'available' || unitAssignments.some(item => item.vehicle_id === vehicle.id)) && !unitAssignments.some(item => item.vehicle_id === vehicle.id)).map(vehicle => <button type="button" className={selectedVehicles.includes(vehicle.id) ? 'active' : ''} key={vehicle.id} onClick={() => toggle(selectedVehicles, setSelectedVehicles, vehicle.id)}><Truck size={15}/>#{vehicle.unit_number} {vehicle.name || vehicle.vehicle_type}</button>)}</div>
        </section>

        {(selectedEmployees.length > 0 || selectedVehicles.length > 0) && <div className="dispatch-v2-sticky-assign"><span>{selectedEmployees.length + selectedVehicles.length} selected</span><button className="primary" onClick={() => void addAssignments()} disabled={busy}>Assign selected</button></div>}

        <div className="dispatch-v2-status-actions">
          <button type="button" onClick={() => void updateStatus('scheduled')} disabled={busy}>Scheduled</button>
          <button type="button" onClick={() => void updateStatus('dispatched')} disabled={busy}>Dispatched</button>
          <button type="button" onClick={() => void updateStatus('in_progress')} disabled={busy}>Start job</button>
          <button type="button" className="complete" onClick={() => void updateStatus('completed')} disabled={busy}><CheckCircle2 size={16}/>Complete</button>
        </div>
      </section>
    </div>
  )
}
