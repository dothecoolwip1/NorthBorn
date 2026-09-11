import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ContactRound,
  Gauge,
  HardHat,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  ShieldCheck,
  Truck,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type Organization = { id: string; name: string }
type Customer = {
  id: string
  organization_id: string
  name: string
  billing_email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  status: string
}
type Employee = {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  position: string | null
  status: string
}
type Vehicle = {
  id: string
  organization_id: string
  unit_number: string
  name: string | null
  vehicle_type: string
  plate: string | null
  status: string
}
type Job = {
  id: string
  organization_id: string
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
  organization_id: string
  job_id: string
  employee_id: string | null
  vehicle_id: string | null
  role: string | null
}
type AppData = {
  customers: Customer[]
  employees: Employee[]
  vehicles: Vehicle[]
  jobs: Job[]
  assignments: Assignment[]
}

type Actions = {
  addCustomer: (input: Omit<Customer, 'id' | 'organization_id' | 'status'>) => Promise<void>
  addEmployee: (input: Omit<Employee, 'id' | 'organization_id' | 'status'>) => Promise<void>
  addVehicle: (input: Omit<Vehicle, 'id' | 'organization_id' | 'status'>) => Promise<void>
  addJob: (input: Omit<Job, 'id' | 'organization_id' | 'status'>) => Promise<void>
  assignJob: (jobId: string, employeeId: string, vehicleId: string) => Promise<void>
  updateJobStatus: (jobId: string, status: string) => Promise<void>
  resetTestData: () => void
}

const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v2'
const TEST_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'
const TEST_ORGANIZATION: Organization = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Northborn Test Company',
}
const EMPTY_DATA: AppData = { customers: [], employees: [], vehicles: [], jobs: [], assignments: [] }

const modules = [
  ['Dashboard', '/', Gauge],
  ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness],
  ['Customers', '/customers', ContactRound],
  ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck],
  ['Maintenance', '/maintenance', Wrench],
  ['Safety', '/safety', ShieldCheck],
  ['Tickets', '/tickets', ClipboardCheck],
  ['Timesheets', '/timesheets', HardHat],
  ['Invoices', '/invoices', ReceiptText],
  ['Reports', '/reports', Activity],
] as const

const makeId = () => crypto.randomUUID()

function createDemoData(): AppData {
  const now = new Date()
  const start = new Date(now.getTime() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000)
  const organization_id = TEST_ORGANIZATION.id
  const customerId = makeId()
  const employeeOne = makeId()
  const employeeTwo = makeId()
  const vehicleOne = makeId()
  const vehicleTwo = makeId()

  return {
    customers: [
      {
        id: customerId,
        organization_id,
        name: 'Demo Energy Services',
        billing_email: 'billing@example.com',
        phone: '403-555-0100',
        address: 'Red Deer, AB',
        notes: 'Starter customer for testing.',
        status: 'active',
      },
    ],
    employees: [
      {
        id: employeeOne,
        organization_id,
        first_name: 'Garrett',
        last_name: 'Robson',
        email: 'garrett@example.com',
        phone: null,
        position: 'Operator',
        status: 'active',
      },
      {
        id: employeeTwo,
        organization_id,
        first_name: 'Test',
        last_name: 'Swamper',
        email: null,
        phone: null,
        position: 'Swamper',
        status: 'active',
      },
    ],
    vehicles: [
      {
        id: vehicleOne,
        organization_id,
        unit_number: '101',
        name: 'Hydrovac 101',
        vehicle_type: 'Hydrovac',
        plate: null,
        status: 'available',
      },
      {
        id: vehicleTwo,
        organization_id,
        unit_number: '202',
        name: 'Combo Vac 202',
        vehicle_type: 'Combo Vac',
        plate: null,
        status: 'available',
      },
    ],
    jobs: [
      {
        id: makeId(),
        organization_id,
        customer_id: customerId,
        job_number: `JOB-${String(now.getFullYear()).slice(-2)}001`,
        title: 'Hydrovac daylighting demo job',
        site_name: 'North Site',
        site_address: 'Red Deer County, AB',
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        status: 'scheduled',
        notes: 'Use this job to test Dispatch.',
      },
    ],
    assignments: [],
  }
}

function readTestData(): AppData {
  try {
    const saved = localStorage.getItem(TEST_DATA_KEY)
    if (saved) return JSON.parse(saved) as AppData
  } catch {
    // Fall through to a clean demo workspace.
  }
  const demo = createDemoData()
  localStorage.setItem(TEST_DATA_KEY, JSON.stringify(demo))
  return demo
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [testMode, setTestMode] = useState(() => localStorage.getItem(TEST_MODE_KEY) === '1')
  const [organization, setOrganization] = useState<Organization | null>(testMode ? TEST_ORGANIZATION : null)
  const [data, setData] = useState<AppData>(() => (testMode ? readTestData() : EMPTY_DATA))
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      setSession(sessionData.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (testMode) {
      setOrganization(TEST_ORGANIZATION)
      setData(readTestData())
      return
    }
    if (!session) {
      setOrganization(null)
      setData(EMPTY_DATA)
      return
    }

    supabase
      .from('organization_members')
      .select('organization:organizations(id,name)')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
      .then(({ data: membership, error }) => {
        if (error) {
          console.error('Unable to load Northborn organization', error)
          return
        }
        const org = membership?.organization as unknown as Organization | null
        setOrganization(org ?? null)
      })
  }, [session, testMode])

  const refreshData = useCallback(async () => {
    if (testMode) {
      setData(readTestData())
      return
    }
    if (!session || !organization) return

    setDataLoading(true)
    const [customers, employees, vehicles, jobs, assignments] = await Promise.all([
      supabase.from('customers').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('employees').select('*').eq('organization_id', organization.id).order('last_name'),
      supabase.from('fleet_vehicles').select('*').eq('organization_id', organization.id).order('unit_number'),
      supabase.from('jobs').select('*').eq('organization_id', organization.id).order('scheduled_start', { ascending: true }),
      supabase.from('dispatch_assignments').select('*').eq('organization_id', organization.id),
    ])

    const error = customers.error || employees.error || vehicles.error || jobs.error || assignments.error
    if (error) console.error('Unable to load Northborn operations data', error)

    setData({
      customers: (customers.data ?? []) as Customer[],
      employees: (employees.data ?? []) as Employee[],
      vehicles: (vehicles.data ?? []) as Vehicle[],
      jobs: (jobs.data ?? []) as Job[],
      assignments: (assignments.data ?? []) as Assignment[],
    })
    setDataLoading(false)
  }, [testMode, session, organization])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const saveTest = (next: AppData) => {
    localStorage.setItem(TEST_DATA_KEY, JSON.stringify(next))
    setData(next)
  }

  const requireContext = () => {
    if (!organization) throw new Error('No organization is selected.')
    if (!session && !testMode) throw new Error('You must be signed in.')
    return { organizationId: organization.id, userId: session?.user.id ?? 'test-admin' }
  }

  const actions: Actions = {
    addCustomer: async (input) => {
      const { organizationId, userId } = requireContext()
      if (testMode) {
        saveTest({
          ...data,
          customers: [...data.customers, { ...input, id: makeId(), organization_id: organizationId, status: 'active' }],
        })
        return
      }
      const { error } = await supabase.from('customers').insert({ ...input, organization_id: organizationId, created_by: userId })
      if (error) throw error
      await refreshData()
    },
    addEmployee: async (input) => {
      const { organizationId, userId } = requireContext()
      if (testMode) {
        saveTest({
          ...data,
          employees: [...data.employees, { ...input, id: makeId(), organization_id: organizationId, status: 'active' }],
        })
        return
      }
      const { error } = await supabase.from('employees').insert({ ...input, organization_id: organizationId, created_by: userId })
      if (error) throw error
      await refreshData()
    },
    addVehicle: async (input) => {
      const { organizationId, userId } = requireContext()
      if (testMode) {
        saveTest({
          ...data,
          vehicles: [...data.vehicles, { ...input, id: makeId(), organization_id: organizationId, status: 'available' }],
        })
        return
      }
      const { error } = await supabase.from('fleet_vehicles').insert({ ...input, organization_id: organizationId, created_by: userId })
      if (error) throw error
      await refreshData()
    },
    addJob: async (input) => {
      const { organizationId, userId } = requireContext()
      if (testMode) {
        saveTest({
          ...data,
          jobs: [...data.jobs, { ...input, id: makeId(), organization_id: organizationId, status: 'scheduled' }],
        })
        return
      }
      const { error } = await supabase.from('jobs').insert({ ...input, organization_id: organizationId, created_by: userId, status: 'scheduled' })
      if (error) throw error
      await refreshData()
    },
    assignJob: async (jobId, employeeId, vehicleId) => {
      const { organizationId, userId } = requireContext()
      const rows = [
        employeeId ? { organization_id: organizationId, job_id: jobId, employee_id: employeeId, vehicle_id: null, role: 'crew', created_by: userId } : null,
        vehicleId ? { organization_id: organizationId, job_id: jobId, employee_id: null, vehicle_id: vehicleId, role: 'unit', created_by: userId } : null,
      ].filter(Boolean) as Array<{ organization_id: string; job_id: string; employee_id: string | null; vehicle_id: string | null; role: string; created_by: string }>

      if (!rows.length) throw new Error('Choose an employee or a vehicle to dispatch.')

      if (testMode) {
        const additions = rows
          .filter((row) => !data.assignments.some((existing) => existing.job_id === jobId && ((row.employee_id && existing.employee_id === row.employee_id) || (row.vehicle_id && existing.vehicle_id === row.vehicle_id))))
          .map((row) => ({ ...row, id: makeId() }))
        saveTest({
          ...data,
          assignments: [...data.assignments, ...additions],
          jobs: data.jobs.map((job) => (job.id === jobId ? { ...job, status: 'dispatched' } : job)),
          vehicles: data.vehicles.map((vehicle) => (vehicle.id === vehicleId ? { ...vehicle, status: 'assigned' } : vehicle)),
        })
        return
      }

      const { error } = await supabase.from('dispatch_assignments').upsert(rows, { onConflict: 'job_id,employee_id' })
      if (error && !String(error.message).includes('duplicate')) throw error
      await supabase.from('jobs').update({ status: 'dispatched' }).eq('id', jobId).eq('organization_id', organizationId)
      if (vehicleId) await supabase.from('fleet_vehicles').update({ status: 'assigned' }).eq('id', vehicleId).eq('organization_id', organizationId)
      await refreshData()
    },
    updateJobStatus: async (jobId, status) => {
      const { organizationId } = requireContext()
      const jobAssignments = data.assignments.filter((assignment) => assignment.job_id === jobId)
      const vehicleIds = jobAssignments.map((assignment) => assignment.vehicle_id).filter(Boolean) as string[]

      if (testMode) {
        saveTest({
          ...data,
          jobs: data.jobs.map((job) => (job.id === jobId ? { ...job, status } : job)),
          vehicles: status === 'completed'
            ? data.vehicles.map((vehicle) => (vehicleIds.includes(vehicle.id) ? { ...vehicle, status: 'available' } : vehicle))
            : data.vehicles,
        })
        return
      }

      const { error } = await supabase.from('jobs').update({ status }).eq('id', jobId).eq('organization_id', organizationId)
      if (error) throw error
      if (status === 'completed' && vehicleIds.length) {
        await supabase.from('fleet_vehicles').update({ status: 'available' }).in('id', vehicleIds).eq('organization_id', organizationId)
      }
      await refreshData()
    },
    resetTestData: () => {
      const fresh = createDemoData()
      localStorage.setItem(TEST_DATA_KEY, JSON.stringify(fresh))
      setData(fresh)
    },
  }

  const signOut = async () => {
    if (testMode) {
      localStorage.removeItem(TEST_MODE_KEY)
      setTestMode(false)
      setOrganization(null)
      setData(EMPTY_DATA)
      return
    }
    await supabase.auth.signOut()
  }

  if (loading) return <div className="center-screen">Loading Northborn…</div>

  if (!session && !testMode) {
    return (
      <AuthScreen
        onTestLogin={() => {
          localStorage.setItem(TEST_MODE_KEY, '1')
          setTestMode(true)
          setOrganization(TEST_ORGANIZATION)
          setData(readTestData())
        }}
      />
    )
  }

  if (!organization) return <OrganizationSetup userId={session!.user.id} onCreated={setOrganization} />

  return (
    <div className="app-shell">
      <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div><strong>NORTHBORN</strong><span>{organization.name}</span></div>
        </div>
        {testMode && <div className="test-badge">TEST WORKSPACE</div>}
        <nav>
          {modules.map(([label, path, Icon]) => (
            <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileOpen(false)}>
              <Icon size={19} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="signout" onClick={signOut}><LogOut size={18} />Sign out</button>
      </aside>

      <main className="content">
        <header>
          <button className="menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
          <div className="header-actions">
            {dataLoading && <span className="sync-text">Syncing…</span>}
            <div className={online ? 'connection online' : 'connection offline'}>
              {online ? <Wifi size={16} /> : <WifiOff size={16} />}{online ? 'Online' : 'Offline'}
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard organization={organization} data={data} testMode={testMode} actions={actions} />} />
          <Route path="/customers" element={<CustomersPage data={data} actions={actions} />} />
          <Route path="/employees" element={<EmployeesPage data={data} actions={actions} />} />
          <Route path="/fleet" element={<FleetPage data={data} actions={actions} />} />
          <Route path="/jobs" element={<JobsPage data={data} actions={actions} />} />
          <Route path="/dispatch" element={<DispatchPage data={data} actions={actions} />} />
          {modules.slice(6).map(([label, path]) => <Route key={path} path={path} element={<ModulePage name={label} />} />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AuthScreen({ onTestLogin }: { onTestLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)
    const normalizedEmail = email.trim().toLowerCase()

    if (mode === 'signin' && normalizedEmail === 'admin') {
      const passwordHash = await sha256(password)
      if (passwordHash === TEST_PASSWORD_HASH) {
        setSubmitting(false)
        onTestLogin()
        return
      }
      setSubmitting(false)
      setMessage('Invalid login credentials')
      return
    }

    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })

    setSubmitting(false)
    if (result.error) return setMessage(result.error.message)
    if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your Northborn account.')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">N</div>
        <h1>Northborn</h1>
        <p>Field operations, built for the work.</p>
        <form onSubmit={submit}>
          <label>Email or username<input type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'signin' ? 1 : 8} required /></label>
          {message && <div className="message">{message}</div>}
          <button className="primary" type="submit" disabled={submitting}>{submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        {mode === 'signin' && <div className="test-login-hint"><strong>Testing:</strong> admin / admin</div>}
        <button className="link-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
          {mode === 'signin' ? 'New to Northborn? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

function OrganizationSetup({ userId, onCreated }: { userId: string; onCreated: (organization: Organization) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true)
    const result = await supabase.from('organizations').insert({ name: name.trim(), created_by: userId }).select('id,name').single()
    setSubmitting(false)
    if (result.error) return setError(result.error.message)
    onCreated(result.data)
  }
  return <div className="auth-page"><div className="auth-card"><Building2 size={42} /><h1>Create your company</h1><p>This becomes your private Northborn workspace.</p><form onSubmit={submit}><label>Company name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>{error && <div className="message">{error}</div>}<button className="primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create company'}</button></form></div></div>
}

function Dashboard({ organization, data, testMode, actions }: { organization: Organization; data: AppData; testMode: boolean; actions: Actions }) {
  const activeJobs = data.jobs.filter((job) => !['completed', 'cancelled'].includes(job.status))
  const availableVehicles = data.vehicles.filter((vehicle) => vehicle.status === 'available')
  const activeEmployees = data.employees.filter((employee) => employee.status === 'active')
  const upcoming = [...activeJobs].sort((a, b) => String(a.scheduled_start).localeCompare(String(b.scheduled_start))).slice(0, 5)

  return <section className="page">
    <PageHeading eyebrow="OPERATIONS" title={organization.name} subtitle="Your Northborn command centre." />
    {testMode && <div className="notice"><div><strong>Test workspace is active.</strong><span>Changes here persist on this device so you can freely test workflows.</span></div><button className="secondary" onClick={actions.resetTestData}>Reset demo data</button></div>}
    <div className="metric-grid">
      <Metric title="Active jobs" value={String(activeJobs.length)} detail={`${data.jobs.filter((job) => job.status === 'dispatched').length} dispatched`} />
      <Metric title="Available trucks" value={String(availableVehicles.length)} detail={`${data.vehicles.length} fleet units`} />
      <Metric title="Field staff" value={String(activeEmployees.length)} detail={`${data.employees.length} employees`} />
      <Metric title="Customers" value={String(data.customers.length)} detail="Active company records" />
    </div>
    <div className="panel">
      <div className="section-title"><div><span className="eyebrow">NEXT UP</span><h2>Upcoming jobs</h2></div><NavLink className="text-link" to="/jobs">View all jobs</NavLink></div>
      {upcoming.length ? <div className="list-stack">{upcoming.map((job) => <JobRow key={job.id} job={job} data={data} />)}</div> : <EmptyState title="No jobs scheduled" copy="Create your first customer and job to start using Dispatch." />}
    </div>
  </section>
}

function CustomersPage({ data, actions }: { data: AppData; actions: Actions }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', billing_email: '', phone: '', address: '', notes: '' })
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    try {
      await actions.addCustomer({ ...form, billing_email: form.billing_email || null, phone: form.phone || null, address: form.address || null, notes: form.notes || null })
      setForm({ name: '', billing_email: '', phone: '', address: '', notes: '' }); setOpen(false)
    } catch (err) { setError(readError(err)) }
  }
  return <section className="page"><PageHeading eyebrow="CRM" title="Customers" subtitle="Companies you work for and bill." action={<button className="primary compact" onClick={() => setOpen(!open)}><Plus size={17} /> Add customer</button>} />
    {open && <InlineForm title="New customer" error={error} onSubmit={submit}><FormGrid><Field label="Company name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field><Field label="Billing email"><input type="email" value={form.billing_email} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} /></Field><Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field></FormGrid><Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field><FormActions onCancel={() => setOpen(false)} /></InlineForm>}
    <div className="card-grid">{data.customers.map((customer) => <div className="record-card" key={customer.id}><div className="record-icon"><Building2 size={20} /></div><div><h3>{customer.name}</h3><p>{customer.address || 'No address yet'}</p><div className="record-meta"><span>{customer.billing_email || 'No billing email'}</span><span>{customer.phone || 'No phone'}</span></div></div></div>)}</div>
    {!data.customers.length && <EmptyPanel title="No customers yet" copy="Add the first company you want to dispatch work for." />}
  </section>
}

function EmployeesPage({ data, actions }: { data: AppData; actions: Actions }) {
  const [open, setOpen] = useState(false); const [error, setError] = useState('')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', position: 'Operator' })
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); try { await actions.addEmployee({ ...form, email: form.email || null, phone: form.phone || null, position: form.position || null }); setForm({ first_name: '', last_name: '', email: '', phone: '', position: 'Operator' }); setOpen(false) } catch (err) { setError(readError(err)) } }
  return <section className="page"><PageHeading eyebrow="WORKFORCE" title="Employees" subtitle="Your field team and office staff." action={<button className="primary compact" onClick={() => setOpen(!open)}><Plus size={17} /> Add employee</button>} />
    {open && <InlineForm title="New employee" error={error} onSubmit={submit}><FormGrid><Field label="First name"><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></Field><Field label="Last name"><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></Field><Field label="Position"><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field><Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></FormGrid><FormActions onCancel={() => setOpen(false)} /></InlineForm>}
    <div className="card-grid">{data.employees.map((employee) => <div className="record-card" key={employee.id}><div className="record-icon"><HardHat size={20} /></div><div><h3>{employee.first_name} {employee.last_name}</h3><p>{employee.position || 'No position set'}</p><div className="record-meta"><span>{employee.email || 'No email'}</span><StatusPill status={employee.status} /></div></div></div>)}</div>
  </section>
}

function FleetPage({ data, actions }: { data: AppData; actions: Actions }) {
  const [open, setOpen] = useState(false); const [error, setError] = useState('')
  const [form, setForm] = useState({ unit_number: '', name: '', vehicle_type: 'Hydrovac', plate: '' })
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); try { await actions.addVehicle({ ...form, name: form.name || null, plate: form.plate || null }); setForm({ unit_number: '', name: '', vehicle_type: 'Hydrovac', plate: '' }); setOpen(false) } catch (err) { setError(readError(err)) } }
  return <section className="page"><PageHeading eyebrow="FLEET" title="Fleet" subtitle="Units available for dispatch." action={<button className="primary compact" onClick={() => setOpen(!open)}><Plus size={17} /> Add unit</button>} />
    {open && <InlineForm title="New fleet unit" error={error} onSubmit={submit}><FormGrid><Field label="Unit number"><input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} required /></Field><Field label="Unit name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hydrovac 101" /></Field><Field label="Type"><select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}><option>Hydrovac</option><option>Combo Vac</option><option>Straight Vac</option><option>Water Truck</option><option>Steamer</option><option>Pickup</option><option>Other</option></select></Field><Field label="Plate"><input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} /></Field></FormGrid><FormActions onCancel={() => setOpen(false)} /></InlineForm>}
    <div className="card-grid">{data.vehicles.map((vehicle) => <div className="record-card" key={vehicle.id}><div className="record-icon"><Truck size={20} /></div><div><h3>Unit {vehicle.unit_number}</h3><p>{vehicle.name || vehicle.vehicle_type}</p><div className="record-meta"><span>{vehicle.vehicle_type}</span><StatusPill status={vehicle.status} /></div></div></div>)}</div>
  </section>
}

function JobsPage({ data, actions }: { data: AppData; actions: Actions }) {
  const [open, setOpen] = useState(false); const [error, setError] = useState('')
  const defaultCustomer = data.customers[0]?.id ?? ''
  const [form, setForm] = useState({ customer_id: defaultCustomer, job_number: '', title: '', site_name: '', site_address: '', scheduled_start: '', scheduled_end: '', notes: '' })
  useEffect(() => { if (!form.customer_id && data.customers[0]) setForm((current) => ({ ...current, customer_id: data.customers[0].id })) }, [data.customers, form.customer_id])
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); try { const jobNumber = form.job_number || `JOB-${new Date().toISOString().replace(/\D/g, '').slice(2, 12)}`; await actions.addJob({ customer_id: form.customer_id, job_number: jobNumber, title: form.title, site_name: form.site_name || null, site_address: form.site_address || null, scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null, scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null, notes: form.notes || null }); setForm({ customer_id: data.customers[0]?.id ?? '', job_number: '', title: '', site_name: '', site_address: '', scheduled_start: '', scheduled_end: '', notes: '' }); setOpen(false) } catch (err) { setError(readError(err)) } }
  return <section className="page"><PageHeading eyebrow="OPERATIONS" title="Jobs" subtitle="Create work, schedule it, then send it to Dispatch." action={<button className="primary compact" disabled={!data.customers.length} onClick={() => setOpen(!open)}><Plus size={17} /> New job</button>} />
    {!data.customers.length && <div className="notice"><div><strong>A customer is required first.</strong><span>Add a customer before creating a job.</span></div><NavLink className="secondary" to="/customers">Go to Customers</NavLink></div>}
    {open && <InlineForm title="New job" error={error} onSubmit={submit}><FormGrid><Field label="Customer"><select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Job number"><input value={form.job_number} onChange={(e) => setForm({ ...form, job_number: e.target.value })} placeholder="Auto if blank" /></Field><Field label="Job title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field><Field label="Site name"><input value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} /></Field><Field label="Site address"><input value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })} /></Field><Field label="Start"><input type="datetime-local" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })} /></Field><Field label="End"><input type="datetime-local" value={form.scheduled_end} onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })} /></Field></FormGrid><Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field><FormActions onCancel={() => setOpen(false)} /></InlineForm>}
    <div className="list-stack">{data.jobs.map((job) => <JobRow key={job.id} job={job} data={data} />)}</div>
    {!data.jobs.length && <EmptyPanel title="No jobs yet" copy="Create a job and it will appear here and in Dispatch." />}
  </section>
}

function DispatchPage({ data, actions }: { data: AppData; actions: Actions }) {
  const jobs = data.jobs.filter((job) => !['completed', 'cancelled'].includes(job.status))
  return <section className="page"><PageHeading eyebrow="LIVE BOARD" title="Dispatch" subtitle="Assign your crew and units, then move work through the day." />
    <div className="dispatch-board">{jobs.map((job) => <DispatchCard key={job.id} job={job} data={data} actions={actions} />)}</div>
    {!jobs.length && <EmptyPanel title="Nothing on the board" copy="Create a scheduled job and it will appear here." />}
  </section>
}

function DispatchCard({ job, data, actions }: { job: Job; data: AppData; actions: Actions }) {
  const [employeeId, setEmployeeId] = useState(''); const [vehicleId, setVehicleId] = useState(''); const [error, setError] = useState('')
  const assignments = data.assignments.filter((assignment) => assignment.job_id === job.id)
  const customer = data.customers.find((item) => item.id === job.customer_id)
  const assignedEmployees = assignments.map((assignment) => data.employees.find((employee) => employee.id === assignment.employee_id)).filter(Boolean) as Employee[]
  const assignedVehicles = assignments.map((assignment) => data.vehicles.find((vehicle) => vehicle.id === assignment.vehicle_id)).filter(Boolean) as Vehicle[]
  const availableEmployees = data.employees.filter((employee) => employee.status === 'active')
  const availableVehicles = data.vehicles.filter((vehicle) => vehicle.status === 'available' || assignedVehicles.some((assigned) => assigned.id === vehicle.id))

  const assign = async () => { setError(''); try { await actions.assignJob(job.id, employeeId, vehicleId); setEmployeeId(''); setVehicleId('') } catch (err) { setError(readError(err)) } }
  return <article className="dispatch-card">
    <div className="dispatch-top"><div><span className="job-number">{job.job_number}</span><h2>{job.title}</h2><p>{customer?.name || 'Unknown customer'} · {job.site_name || job.site_address || 'Site not set'}</p></div><StatusPill status={job.status} /></div>
    <div className="dispatch-time"><CalendarDays size={16} />{formatDate(job.scheduled_start)}</div>
    <div className="assignment-summary"><div><span>Crew</span><strong>{assignedEmployees.length ? assignedEmployees.map((employee) => `${employee.first_name} ${employee.last_name}`).join(', ') : 'Unassigned'}</strong></div><div><span>Units</span><strong>{assignedVehicles.length ? assignedVehicles.map((vehicle) => `#${vehicle.unit_number} ${vehicle.name || vehicle.vehicle_type}`).join(', ') : 'Unassigned'}</strong></div></div>
    <div className="dispatch-controls"><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Add crew member</option>{availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select><select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">Add fleet unit</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>#{vehicle.unit_number} · {vehicle.name || vehicle.vehicle_type}</option>)}</select><button className="secondary" onClick={assign}>Assign</button></div>
    {error && <div className="message">{error}</div>}
    <div className="status-actions">{job.status !== 'in_progress' && <button onClick={() => actions.updateJobStatus(job.id, 'in_progress')}>Start job</button>}<button className="complete" onClick={() => actions.updateJobStatus(job.id, 'completed')}><CheckCircle2 size={16} /> Complete</button></div>
  </article>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>
}

function InlineForm({ title, error, onSubmit, children }: { title: string; error: string; onSubmit: (event: React.FormEvent) => void; children: React.ReactNode }) {
  return <form className="panel form-panel" onSubmit={onSubmit}><h2>{title}</h2>{children}{error && <div className="message">{error}</div>}</form>
}

function FormGrid({ children }: { children: React.ReactNode }) { return <div className="form-grid">{children}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function FormActions({ onCancel }: { onCancel: () => void }) { return <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" type="submit">Save</button></div> }
function Metric({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div> }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill status-${status}`}>{status.replaceAll('_', ' ')}</span> }

function JobRow({ job, data }: { job: Job; data: AppData }) {
  const customer = data.customers.find((item) => item.id === job.customer_id)
  return <div className="job-row"><div className="job-row-main"><span className="job-number">{job.job_number}</span><strong>{job.title}</strong><span>{customer?.name || 'Unknown customer'}</span></div><div className="job-row-meta"><span>{formatDate(job.scheduled_start)}</span><StatusPill status={job.status} /></div></div>
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) { return <div className="panel empty"><EmptyState title={title} copy={copy} /></div> }
function EmptyState({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><div className="empty-icon">N</div><h3>{title}</h3><p>{copy}</p></div> }
function ModulePage({ name }: { name: string }) { return <section className="page"><PageHeading eyebrow="NORTHBORN MODULE" title={name} subtitle="This module is next in the build queue." /><EmptyPanel title={`${name} foundation ready`} copy="The database and navigation foundation are in place. We are building operational workflows in priority order." /></section> }

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
function readError(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: string })?.message || error || 'Something went wrong.') }
