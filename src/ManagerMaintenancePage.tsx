import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  ContactRound,
  FileText,
  Gauge,
  HardHat,
  History,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
  CircleDollarSign,
  ExternalLink,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './manager-maintenance.css'

const db = supabase as any
const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_V2_KEY = 'northborn_test_fleet_v2'
const TEST_ORG = { id: '00000000-0000-0000-0000-000000000001', name: 'Northborn Test Company' }

const EDIT_ROLES = new Set(['owner', 'admin', 'supervisor', 'mechanic'])
const VIEW_ROLES = new Set(['owner', 'admin', 'supervisor', 'mechanic', 'dispatcher', 'safety'])
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

const SERVICE_TYPES = [
  'Preventive Service', 'Oil & Filters', 'Repair', 'Inspection', 'Tires', 'Brakes',
  'Hydraulics', 'Vacuum System', 'Boiler / Steamer', 'Pump', 'Electrical', 'Other',
]
const INSPECTION_TYPES = [
  ['pre_trip', 'Pre-trip'],
  ['post_trip', 'Post-trip'],
  ['annual', 'Annual'],
  ['cvip', 'CVIP'],
  ['shop', 'Shop inspection'],
  ['custom', 'Custom'],
] as const
const WORK_STATUSES = ['open', 'scheduled', 'in_progress', 'waiting_parts', 'completed', 'cancelled']

type Organization = { id: string; name: string }
type Vehicle = {
  id: string
  organization_id: string
  unit_number: string
  name: string | null
  vehicle_type: string
  plate: string | null
  status: string
  odometer_km: number | null
  engine_hours: number | null
}
type Employee = { id: string; first_name: string; last_name: string; position: string | null; status: string }
type Program = {
  id: string
  organization_id: string
  name: string
  description: string | null
  service_type: string
  interval_km: number | null
  interval_engine_hours: number | null
  interval_days: number | null
  warning_km: number
  warning_engine_hours: number
  warning_days: number
  active: boolean
}
type Assignment = {
  id: string
  organization_id: string
  program_id: string
  vehicle_id: string
  active: boolean
  last_completed_date: string | null
  last_completed_odometer_km: number | null
  last_completed_engine_hours: number | null
  next_due_date: string | null
  next_due_odometer_km: number | null
  next_due_engine_hours: number | null
}
type Defect = {
  id: string
  organization_id: string
  vehicle_id: string
  title: string
  description: string | null
  severity: string
  status: string
  out_of_service: boolean
  reported_at: string
  resolved_at: string | null
  resolution_notes: string | null
  odometer_km: number | null
  engine_hours: number | null
}
type Inspection = {
  id: string
  organization_id: string
  vehicle_id: string
  inspection_type: string
  inspection_name: string | null
  inspected_at: string
  odometer_km: number | null
  engine_hours: number | null
  result: string
  notes: string | null
}
type WorkOrder = {
  id: string
  organization_id: string
  vehicle_id: string
  maintenance_assignment_id: string | null
  source_defect_id: string | null
  work_order_number: string
  title: string
  description: string | null
  priority: string
  status: string
  assigned_employee_id: string | null
  vendor: string | null
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  completed_odometer_km: number | null
  completed_engine_hours: number | null
  labour_cost_cents: number
  parts_cost_cents: number
  external_cost_cents: number
  downtime_minutes: number
  completion_notes: string | null
  created_at: string
}
type DocumentRow = {
  id: string
  organization_id: string
  vehicle_id: string
  document_type: string
  name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  expiry_date: string | null
  notes: string | null
  created_at: string
}
type Workspace = {
  organization: Organization | null
  roleKey: string
  vehicles: Vehicle[]
  employees: Employee[]
  programs: Program[]
  assignments: Assignment[]
  defects: Defect[]
  inspections: Inspection[]
  workOrders: WorkOrder[]
  documents: DocumentRow[]
  testMode: boolean
}
type Tab = 'schedule' | 'work_orders' | 'defects' | 'inspections' | 'documents'

type DueRow = {
  assignment: Assignment
  program: Program
  vehicle: Vehicle
  state: { level: 'danger' | 'warn' | 'ok'; text: string; score: number }
}

const EMPTY: Workspace = {
  organization: null,
  roleKey: '',
  vehicles: [],
  employees: [],
  programs: [],
  assignments: [],
  defects: [],
  inspections: [],
  workOrders: [],
  documents: [],
  testMode: false,
}

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
const readError = (error: unknown) => error instanceof Error ? error.message : String((error as { message?: string })?.message || error || 'Something went wrong.')
const money = (centsValue: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format((centsValue || 0) / 100)
const dateOnly = (value: string | null | undefined) => value ? value.slice(0, 10) : ''
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'Not set'
const today = () => new Date().toISOString().slice(0, 10)
const makeId = () => crypto.randomUUID()
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)
const dollarsToCents = (value: string) => Math.round((Number(value) || 0) * 100)
const workOrderNumber = () => `WO-${new Date().toISOString().replace(/\D/g, '').slice(2, 14)}`

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function intervalText(program: Program) {
  const parts: string[] = []
  if (program.interval_engine_hours) parts.push(`${program.interval_engine_hours.toLocaleString()} h`)
  if (program.interval_km) parts.push(`${program.interval_km.toLocaleString()} km`)
  if (program.interval_days) parts.push(`${program.interval_days} days`)
  return parts.join(' or ') || 'No interval'
}

function dueState(assignment: Assignment, program: Program, vehicle: Vehicle) {
  if (!assignment.active || !program.active) return { level: 'ok' as const, text: 'Inactive', score: 99 }
  const overdue: string[] = []
  const soon: string[] = []

  if (assignment.next_due_date) {
    const delta = Math.ceil((new Date(`${assignment.next_due_date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000)
    if (delta <= 0) overdue.push(delta === 0 ? 'due today' : `${Math.abs(delta)}d overdue`)
    else if (delta <= program.warning_days) soon.push(`${delta}d`)
  }

  if (assignment.next_due_odometer_km !== null && vehicle.odometer_km !== null) {
    const left = assignment.next_due_odometer_km - vehicle.odometer_km
    if (left <= 0) overdue.push(`${Math.abs(left).toLocaleString()} km overdue`)
    else if (left <= program.warning_km) soon.push(`${left.toLocaleString()} km`)
  }

  if (assignment.next_due_engine_hours !== null && vehicle.engine_hours !== null) {
    const left = assignment.next_due_engine_hours - vehicle.engine_hours
    if (left <= 0) overdue.push(`${Math.abs(left).toLocaleString()} h overdue`)
    else if (left <= program.warning_engine_hours) soon.push(`${left.toLocaleString()} h`)
  }

  if (overdue.length) return { level: 'danger' as const, text: overdue.join(' · '), score: 0 }
  if (soon.length) return { level: 'warn' as const, text: `Due in ${soon.join(' / ')}`, score: 1 }

  const next = [
    assignment.next_due_date ? formatDate(assignment.next_due_date) : '',
    assignment.next_due_odometer_km !== null ? `${assignment.next_due_odometer_km.toLocaleString()} km` : '',
    assignment.next_due_engine_hours !== null ? `${assignment.next_due_engine_hours.toLocaleString()} h` : '',
  ].filter(Boolean)
  return { level: 'ok' as const, text: next.join(' / ') || 'Waiting for baseline', score: 2 }
}

function readTestBase() {
  try {
    const raw = JSON.parse(localStorage.getItem(TEST_DATA_KEY) || '{}')
    return { vehicles: (raw.vehicles || []) as Vehicle[], employees: (raw.employees || []) as Employee[] }
  } catch {
    return { vehicles: [], employees: [] }
  }
}

function readTestV2() {
  try {
    const saved = localStorage.getItem(TEST_V2_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  const fresh = { programs: [], assignments: [], defects: [], inspections: [], workOrders: [], documents: [] }
  localStorage.setItem(TEST_V2_KEY, JSON.stringify(fresh))
  return fresh
}

function writeTestV2(ws: Workspace, overrides: Partial<Workspace>) {
  const next = { ...ws, ...overrides }
  localStorage.setItem(TEST_V2_KEY, JSON.stringify({
    programs: next.programs,
    assignments: next.assignments,
    defects: next.defects,
    inspections: next.inspections,
    workOrders: next.workOrders,
    documents: next.documents,
  }))
}

export default function ManagerMaintenancePage() {
  const [ws, setWs] = useState<Workspace>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('schedule')
  const [search, setSearch] = useState('')
  const [programEditor, setProgramEditor] = useState<Program | null | undefined>(undefined)
  const [workEditor, setWorkEditor] = useState<WorkOrder | null | undefined>(undefined)
  const [defectEditor, setDefectEditor] = useState<Defect | null | undefined>(undefined)
  const [inspectionOpen, setInspectionOpen] = useState(false)
  const [documentOpen, setDocumentOpen] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const testMode = localStorage.getItem(TEST_MODE_KEY) === '1'
    if (testMode) {
      const base = readTestBase()
      const v2 = readTestV2()
      setWs({ organization: TEST_ORG, roleKey: 'owner', vehicles: base.vehicles, employees: base.employees, ...v2, testMode: true })
      setLoading(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setWs(EMPTY)
      setLoading(false)
      return
    }

    const membership = await db.from('organization_members')
      .select('id,organization_id,organization:organizations(id,name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (membership.error || !membership.data?.id) {
      setLoading(false)
      return
    }

    const organization = membership.data.organization as Organization
    const roleRows = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id)
    const roleKey = roleRows.data?.[0]?.role?.key || ''
    if (roleKey === 'operator') {
      setWs({ ...EMPTY, organization, roleKey })
      setLoading(false)
      return
    }

    const [vehicles, employees, programs, assignments, defects, inspections, workOrders, documents] = await Promise.all([
      db.from('fleet_vehicles').select('id,organization_id,unit_number,name,vehicle_type,plate,status,odometer_km,engine_hours').eq('organization_id', organization.id).neq('status', 'archived').order('unit_number'),
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id', organization.id).neq('status', 'archived').order('last_name'),
      db.from('fleet_maintenance_programs').select('*').eq('organization_id', organization.id).order('name'),
      db.from('fleet_maintenance_assignments').select('*').eq('organization_id', organization.id),
      db.from('fleet_defects').select('*').eq('organization_id', organization.id).order('reported_at', { ascending: false }),
      db.from('fleet_inspections').select('*').eq('organization_id', organization.id).order('inspected_at', { ascending: false }),
      db.from('fleet_work_orders').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
      db.from('fleet_documents').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
    ])

    const firstError = vehicles.error || employees.error || programs.error || assignments.error || defects.error || inspections.error || workOrders.error || documents.error
    if (firstError) setError(firstError.message)

    setWs({
      organization,
      roleKey,
      vehicles: vehicles.data ?? [],
      employees: employees.data ?? [],
      programs: programs.data ?? [],
      assignments: assignments.data ?? [],
      defects: defects.data ?? [],
      inspections: inspections.data ?? [],
      workOrders: workOrders.data ?? [],
      documents: documents.data ?? [],
      testMode: false,
    })
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const dueRows = useMemo<DueRow[]>(() => {
    return ws.assignments.flatMap(assignment => {
      const program = ws.programs.find(p => p.id === assignment.program_id)
      const vehicle = ws.vehicles.find(v => v.id === assignment.vehicle_id)
      if (!program || !vehicle) return []
      return [{ assignment, program, vehicle, state: dueState(assignment, program, vehicle) }]
    }).sort((a, b) => a.state.score - b.state.score || a.vehicle.unit_number.localeCompare(b.vehicle.unit_number))
  }, [ws.assignments, ws.programs, ws.vehicles])

  if (loading) return <div className="maint-loading">Loading maintenance…</div>
  if (!ws.organization) return <Navigate to="/" replace />
  if (!ws.testMode && !VIEW_ROLES.has(ws.roleKey)) return <Navigate to="/" replace />

  const canEdit = ws.testMode || EDIT_ROLES.has(ws.roleKey)
  const query = search.trim().toLowerCase()
  const openDefects = ws.defects.filter(d => !['resolved', 'dismissed'].includes(d.status))
  const openWorkOrders = ws.workOrders.filter(w => !['completed', 'cancelled'].includes(w.status))
  const overdue = dueRows.filter(row => row.state.level === 'danger')
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const monthCost = ws.workOrders
    .filter(w => w.status === 'completed' && w.completed_at?.startsWith(monthPrefix))
    .reduce((sum, w) => sum + w.labour_cost_cents + w.parts_cost_cents + w.external_cost_cents, 0)

  const createScheduledWorkOrder = (row: DueRow) => {
    setWorkEditor({
      id: '',
      organization_id: ws.organization!.id,
      vehicle_id: row.vehicle.id,
      maintenance_assignment_id: row.assignment.id,
      source_defect_id: null,
      work_order_number: workOrderNumber(),
      title: row.program.name,
      description: row.program.description,
      priority: row.state.level === 'danger' ? 'high' : 'normal',
      status: 'open',
      assigned_employee_id: null,
      vendor: null,
      scheduled_date: null,
      started_at: null,
      completed_at: null,
      completed_odometer_km: row.vehicle.odometer_km,
      completed_engine_hours: row.vehicle.engine_hours,
      labour_cost_cents: 0,
      parts_cost_cents: 0,
      external_cost_cents: 0,
      downtime_minutes: 0,
      completion_notes: null,
      created_at: new Date().toISOString(),
    })
  }

  const createDefectWorkOrder = (defect: Defect) => {
    const vehicle = ws.vehicles.find(v => v.id === defect.vehicle_id)
    setWorkEditor({
      id: '',
      organization_id: ws.organization!.id,
      vehicle_id: defect.vehicle_id,
      maintenance_assignment_id: null,
      source_defect_id: defect.id,
      work_order_number: workOrderNumber(),
      title: defect.title,
      description: defect.description,
      priority: defect.severity === 'critical' ? 'urgent' : defect.severity === 'high' ? 'high' : 'normal',
      status: 'open',
      assigned_employee_id: null,
      vendor: null,
      scheduled_date: null,
      started_at: null,
      completed_at: null,
      completed_odometer_km: vehicle?.odometer_km ?? null,
      completed_engine_hours: vehicle?.engine_hours ?? null,
      labour_cost_cents: 0,
      parts_cost_cents: 0,
      external_cost_cents: 0,
      downtime_minutes: 0,
      completion_notes: null,
      created_at: new Date().toISOString(),
    })
  }

  return (
    <div className="maint-shell">
      <aside className="maint-sidebar">
        <div className="maint-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{ws.organization.name}</small></span></div>
        <nav>{NAV.map(([name, path, Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={18}/><span>{name}</span></NavLink>)}</nav>
      </aside>

      <main className="maint-main">
        <header className="maint-header">
          <div><span className="maint-eyebrow">FLEET</span><strong>Maintenance control</strong></div>
          <NavLink className="maint-secondary" to="/fleet"><Truck size={15}/>Fleet</NavLink>
        </header>

        <section className="maint-page">
          <div className="maint-hero">
            <div>
              <span className="maint-eyebrow">COMPANY MAINTENANCE</span>
              <h1>Recurring maintenance that advances itself.</h1>
              <p>Set the company interval once. Northborn tracks every assigned unit and recalculates the next service from the actual completed date, kilometres and engine hours.</p>
            </div>
            {canEdit && <button className="maint-primary" onClick={() => setProgramEditor(null)}><Plus size={16}/>New schedule</button>}
          </div>

          {error && <div className="maint-message">{error}</div>}

          <div className="maint-metrics">
            <Metric icon={<TriangleAlert/>} value={overdue.length} label="Overdue services" danger={overdue.length > 0}/>
            <Metric icon={<Wrench/>} value={openWorkOrders.length} label="Open work orders"/>
            <Metric icon={<AlertTriangle/>} value={openDefects.length} label="Open defects" danger={openDefects.some(d => d.severity === 'critical')}/>
            <Metric icon={<CircleDollarSign/>} value={money(monthCost)} label="Maintenance this month" text/>
          </div>

          <div className="maint-tabs">
            <TabButton active={tab === 'schedule'} onClick={() => setTab('schedule')} icon={<CalendarDays size={16}/>} label="Schedule"/>
            <TabButton active={tab === 'work_orders'} onClick={() => setTab('work_orders')} icon={<Wrench size={16}/>} label="Work orders"/>
            <TabButton active={tab === 'defects'} onClick={() => setTab('defects')} icon={<AlertTriangle size={16}/>} label="Defects"/>
            <TabButton active={tab === 'inspections'} onClick={() => setTab('inspections')} icon={<ClipboardCheck size={16}/>} label="Inspections"/>
            <TabButton active={tab === 'documents'} onClick={() => setTab('documents')} icon={<FileText size={16}/>} label="Documents"/>
          </div>

          <div className="maint-toolbar">
            <div className="maint-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search maintenance records…"/></div>
            {tab === 'work_orders' && canEdit && <button className="maint-primary" onClick={() => setWorkEditor(null)}><Plus size={15}/>Work order</button>}
            {tab === 'defects' && canEdit && <button className="maint-primary" onClick={() => setDefectEditor(null)}><Plus size={15}/>Report defect</button>}
            {tab === 'inspections' && canEdit && <button className="maint-primary" onClick={() => setInspectionOpen(true)}><Plus size={15}/>Inspection</button>}
            {tab === 'documents' && canEdit && <button className="maint-primary" onClick={() => setDocumentOpen(true)}><Upload size={15}/>Upload</button>}
          </div>

          {tab === 'schedule' && <ScheduleView ws={ws} rows={dueRows} query={query} canEdit={canEdit} onEditProgram={setProgramEditor} onCreateWorkOrder={createScheduledWorkOrder}/>} 
          {tab === 'work_orders' && <WorkOrdersView ws={ws} query={query} onOpen={setWorkEditor}/>} 
          {tab === 'defects' && <DefectsView ws={ws} query={query} onOpen={setDefectEditor} onCreateWorkOrder={createDefectWorkOrder}/>} 
          {tab === 'inspections' && <InspectionsView ws={ws} query={query}/>} 
          {tab === 'documents' && <DocumentsView ws={ws} query={query} onChanged={load}/>} 
        </section>
      </main>

      {programEditor !== undefined && <ProgramEditor program={programEditor} ws={ws} onClose={() => setProgramEditor(undefined)} onSaved={load}/>} 
      {workEditor !== undefined && <WorkOrderEditor work={workEditor} ws={ws} onClose={() => setWorkEditor(undefined)} onSaved={load}/>} 
      {defectEditor !== undefined && <DefectEditor defect={defectEditor} ws={ws} onClose={() => setDefectEditor(undefined)} onSaved={load}/>} 
      {inspectionOpen && <InspectionEditor ws={ws} onClose={() => setInspectionOpen(false)} onSaved={load}/>} 
      {documentOpen && <DocumentEditor ws={ws} onClose={() => setDocumentOpen(false)} onSaved={load}/>} 
    </div>
  )
}

function TabButton({ active, onClick, icon, label: text }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}{text}</button>
}

function Metric({ icon, value, label: text, danger = false, text: isText = false }: { icon: ReactNode; value: number | string; label: string; danger?: boolean; text?: boolean }) {
  return <div className={danger ? 'maint-metric danger' : 'maint-metric'}><span>{icon}</span><strong className={isText ? 'money' : ''}>{value}</strong><small>{text}</small></div>
}

function ScheduleView({ ws, rows, query, canEdit, onEditProgram, onCreateWorkOrder }: { ws: Workspace; rows: DueRow[]; query: string; canEdit: boolean; onEditProgram: (p: Program) => void; onCreateWorkOrder: (row: DueRow) => void }) {
  const filteredRows = rows.filter(row => !query || `${row.program.name} ${row.vehicle.unit_number} ${row.vehicle.name || ''} ${row.vehicle.vehicle_type}`.toLowerCase().includes(query))
  const filteredPrograms = ws.programs.filter(program => !query || `${program.name} ${program.service_type}`.toLowerCase().includes(query))
  return <div className="schedule-layout">
    <section className="maint-panel">
      <div className="maint-section-head"><div><span className="maint-eyebrow">DUE QUEUE</span><h2>What needs service</h2></div></div>
      <div className="due-list">
        {filteredRows.map(row => <div className={`due-row ${row.state.level}`} key={row.assignment.id}>
          <div className="due-unit"><strong>#{row.vehicle.unit_number}</strong><span>{row.vehicle.name || row.vehicle.vehicle_type}</span></div>
          <div className="due-service"><strong>{row.program.name}</strong><span>{intervalText(row.program)}</span></div>
          <div className="due-state"><span>{row.state.text}</span><small>{row.vehicle.odometer_km !== null ? `${row.vehicle.odometer_km.toLocaleString()} km` : ''}{row.vehicle.engine_hours !== null ? ` · ${row.vehicle.engine_hours.toLocaleString()} h` : ''}</small></div>
          {canEdit && <button className="maint-secondary" onClick={() => onCreateWorkOrder(row)}><Wrench size={14}/>Work order</button>}
        </div>)}
        {!filteredRows.length && <Empty text="No maintenance schedules match this view."/>}
      </div>
    </section>

    <section className="maint-panel">
      <div className="maint-section-head"><div><span className="maint-eyebrow">PROGRAMS</span><h2>Company schedules</h2></div></div>
      <div className="program-list">
        {filteredPrograms.map(program => {
          const assigned = ws.assignments.filter(a => a.program_id === program.id && a.active).length
          return <button key={program.id} className="program-card" onClick={() => onEditProgram(program)}>
            <div><strong>{program.name}</strong><span>{program.service_type}</span></div>
            <small>{intervalText(program)}</small><em>{assigned} unit{assigned === 1 ? '' : 's'}</em>
          </button>
        })}
        {!filteredPrograms.length && <Empty text="Create the first company maintenance schedule."/>}
      </div>
    </section>
  </div>
}

function WorkOrdersView({ ws, query, onOpen }: { ws: Workspace; query: string; onOpen: (w: WorkOrder) => void }) {
  const rows = ws.workOrders.filter(work => {
    const vehicle = ws.vehicles.find(v => v.id === work.vehicle_id)
    return !query || `${work.work_order_number} ${work.title} ${vehicle?.unit_number || ''} ${work.vendor || ''} ${work.status}`.toLowerCase().includes(query)
  })
  return <div className="maint-panel"><div className="record-table">
    {rows.map(work => {
      const vehicle = ws.vehicles.find(v => v.id === work.vehicle_id)
      const total = work.labour_cost_cents + work.parts_cost_cents + work.external_cost_cents
      return <button className="record-row" key={work.id || work.work_order_number} onClick={() => onOpen(work)}>
        <div><span className="record-number">{work.work_order_number}</span><strong>{work.title}</strong><small>Unit #{vehicle?.unit_number || '?'} · {work.vendor || 'Internal / not set'}</small></div>
        <div><Status value={work.status}/><strong>{money(total)}</strong><small>{work.completed_at ? formatDate(work.completed_at) : work.scheduled_date ? formatDate(work.scheduled_date) : 'Not scheduled'}</small></div>
      </button>
    })}
    {!rows.length && <Empty text="No work orders yet."/>}
  </div></div>
}

function DefectsView({ ws, query, onOpen, onCreateWorkOrder }: { ws: Workspace; query: string; onOpen: (d: Defect) => void; onCreateWorkOrder: (d: Defect) => void }) {
  const rows = ws.defects.filter(defect => {
    const vehicle = ws.vehicles.find(v => v.id === defect.vehicle_id)
    return !query || `${defect.title} ${defect.description || ''} ${vehicle?.unit_number || ''} ${defect.severity} ${defect.status}`.toLowerCase().includes(query)
  })
  return <div className="maint-panel"><div className="record-table">
    {rows.map(defect => {
      const vehicle = ws.vehicles.find(v => v.id === defect.vehicle_id)
      return <div className="record-row static" key={defect.id}>
        <button className="record-click" onClick={() => onOpen(defect)}>
          <div><span className="record-number">UNIT #{vehicle?.unit_number || '?'}</span><strong>{defect.title}</strong><small>{formatDate(defect.reported_at)}{defect.out_of_service ? ' · Unit flagged out of service' : ''}</small></div>
          <div><Status value={defect.severity}/><Status value={defect.status}/></div>
        </button>
        {!['resolved', 'dismissed'].includes(defect.status) && <button className="maint-secondary" onClick={() => onCreateWorkOrder(defect)}><Wrench size={14}/>Create work order</button>}
      </div>
    })}
    {!rows.length && <Empty text="No defect reports yet."/>}
  </div></div>
}

function InspectionsView({ ws, query }: { ws: Workspace; query: string }) {
  const rows = ws.inspections.filter(inspection => {
    const vehicle = ws.vehicles.find(v => v.id === inspection.vehicle_id)
    return !query || `${label(inspection.inspection_type)} ${inspection.inspection_name || ''} ${vehicle?.unit_number || ''} ${inspection.result}`.toLowerCase().includes(query)
  })
  return <div className="maint-panel"><div className="record-table">
    {rows.map(inspection => {
      const vehicle = ws.vehicles.find(v => v.id === inspection.vehicle_id)
      return <div className="record-row static" key={inspection.id}>
        <div><span className="record-number">UNIT #{vehicle?.unit_number || '?'}</span><strong>{inspection.inspection_name || label(inspection.inspection_type)}</strong><small>{formatDate(inspection.inspected_at)}{inspection.odometer_km !== null ? ` · ${inspection.odometer_km.toLocaleString()} km` : ''}{inspection.engine_hours !== null ? ` · ${inspection.engine_hours.toLocaleString()} h` : ''}</small></div>
        <Status value={inspection.result}/>
      </div>
    })}
    {!rows.length && <Empty text="No inspections recorded yet."/>}
  </div></div>
}

function DocumentsView({ ws, query, onChanged }: { ws: Workspace; query: string; onChanged: () => Promise<void> }) {
  const rows = ws.documents.filter(document => {
    const vehicle = ws.vehicles.find(v => v.id === document.vehicle_id)
    return !query || `${document.name} ${document.document_type} ${vehicle?.unit_number || ''}`.toLowerCase().includes(query)
  })

  const openDocument = async (document: DocumentRow) => {
    if (ws.testMode) return alert('File uploads are disabled in the local test workspace.')
    const result = await supabase.storage.from('fleet-documents').createSignedUrl(document.storage_path, 300)
    if (result.error) return alert(result.error.message)
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const deleteDocument = async (document: DocumentRow) => {
    if (!confirm(`Delete ${document.name}?`)) return
    if (ws.testMode) {
      writeTestV2(ws, { documents: ws.documents.filter(d => d.id !== document.id) })
      await onChanged()
      return
    }
    await supabase.storage.from('fleet-documents').remove([document.storage_path])
    const result = await db.from('fleet_documents').delete().eq('id', document.id).eq('organization_id', ws.organization!.id)
    if (result.error) alert(result.error.message)
    await onChanged()
  }

  return <div className="maint-panel"><div className="document-grid">
    {rows.map(document => {
      const vehicle = ws.vehicles.find(v => v.id === document.vehicle_id)
      return <article className="document-card" key={document.id}>
        <FileText size={22}/>
        <div><strong>{document.name}</strong><span>Unit #{vehicle?.unit_number || '?'} · {label(document.document_type)}</span><small>{document.expiry_date ? `Expires ${formatDate(document.expiry_date)}` : 'No expiry'}</small></div>
        <div><button onClick={() => void openDocument(document)}><ExternalLink size={14}/></button><button onClick={() => void deleteDocument(document)}><X size={14}/></button></div>
      </article>
    })}
    {!rows.length && <Empty text="No fleet documents uploaded yet."/>}
  </div></div>
}

function ProgramEditor({ program, ws, onClose, onSaved }: { program: Program | null; ws: Workspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const currentVehicleIds = program ? ws.assignments.filter(a => a.program_id === program.id && a.active).map(a => a.vehicle_id) : []
  const [form, setForm] = useState({
    name: program?.name || '',
    description: program?.description || '',
    service_type: program?.service_type || 'Preventive Service',
    interval_km: program?.interval_km?.toString() || '',
    interval_engine_hours: program?.interval_engine_hours?.toString() || '',
    interval_days: program?.interval_days?.toString() || '',
    warning_km: program?.warning_km?.toString() || '1000',
    warning_engine_hours: program?.warning_engine_hours?.toString() || '25',
    warning_days: program?.warning_days?.toString() || '30',
    active: program?.active ?? true,
    vehicleIds: currentVehicleIds,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleVehicle = (id: string) => setForm(current => ({ ...current, vehicleIds: current.vehicleIds.includes(id) ? current.vehicleIds.filter(x => x !== id) : [...current.vehicleIds, id] }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (!form.interval_km && !form.interval_engine_hours && !form.interval_days) throw new Error('Set at least one recurring interval.')
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        service_type: form.service_type,
        interval_km: numberOrNull(form.interval_km),
        interval_engine_hours: numberOrNull(form.interval_engine_hours),
        interval_days: numberOrNull(form.interval_days),
        warning_km: Number(form.warning_km) || 0,
        warning_engine_hours: Number(form.warning_engine_hours) || 0,
        warning_days: Number(form.warning_days) || 0,
        active: form.active,
      }

      if (ws.testMode) {
        const programId = program?.id || makeId()
        const nextProgram: Program = { id: programId, organization_id: ws.organization!.id, ...payload }
        const programs = program ? ws.programs.map(p => p.id === programId ? nextProgram : p) : [...ws.programs, nextProgram]
        let assignments = ws.assignments.filter(a => a.program_id !== programId || form.vehicleIds.includes(a.vehicle_id))
        for (const vehicleId of form.vehicleIds) {
          if (assignments.some(a => a.program_id === programId && a.vehicle_id === vehicleId)) continue
          const vehicle = ws.vehicles.find(v => v.id === vehicleId)
          assignments.push({
            id: makeId(),
            organization_id: ws.organization!.id,
            program_id: programId,
            vehicle_id: vehicleId,
            active: true,
            last_completed_date: today(),
            last_completed_odometer_km: vehicle?.odometer_km ?? null,
            last_completed_engine_hours: vehicle?.engine_hours ?? null,
            next_due_date: payload.interval_days ? addDays(today(), payload.interval_days) : null,
            next_due_odometer_km: payload.interval_km && vehicle?.odometer_km !== null && vehicle?.odometer_km !== undefined ? vehicle.odometer_km + payload.interval_km : null,
            next_due_engine_hours: payload.interval_engine_hours && vehicle?.engine_hours !== null && vehicle?.engine_hours !== undefined ? vehicle.engine_hours + payload.interval_engine_hours : null,
          })
        }
        writeTestV2(ws, { programs, assignments })
        await onSaved()
        onClose()
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')

      let programId = program?.id
      if (program) {
        const result = await db.from('fleet_maintenance_programs').update(payload).eq('id', program.id).eq('organization_id', ws.organization!.id)
        if (result.error) throw result.error
      } else {
        const result = await db.from('fleet_maintenance_programs').insert({ ...payload, organization_id: ws.organization!.id, created_by: userData.user.id }).select('id').single()
        if (result.error) throw result.error
        programId = result.data.id
      }

      const existing = ws.assignments.filter(a => a.program_id === programId)
      const toAdd = form.vehicleIds.filter(vehicleId => !existing.some(a => a.vehicle_id === vehicleId))
      const toRemove = existing.filter(a => !form.vehicleIds.includes(a.vehicle_id))

      if (toAdd.length) {
        const result = await db.from('fleet_maintenance_assignments').insert(toAdd.map(vehicle_id => ({ organization_id: ws.organization!.id, program_id: programId, vehicle_id, created_by: userData.user.id })))
        if (result.error) throw result.error
      }
      if (toRemove.length) {
        const result = await db.from('fleet_maintenance_assignments').delete().in('id', toRemove.map(a => a.id)).eq('organization_id', ws.organization!.id)
        if (result.error) throw result.error
      }

      await onSaved()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={program ? 'Edit maintenance schedule' : 'New maintenance schedule'} subtitle="The next due point is calculated automatically from the completed service." onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      {error && <div className="maint-message">{error}</div>}
      <label>Schedule name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Engine service" required/></label>
      <div className="two">
        <label>Service type<select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>{SERVICE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Status<select value={form.active ? 'active' : 'inactive'} onChange={e => setForm({ ...form, active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      <label>Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What should be completed during this service?"/></label>
      <div className="editor-section">
        <strong>Recurring interval</strong><span>Set kilometres, engine hours, calendar days, or a combination. The first limit reached becomes due.</span>
        <div className="three">
          <label>Kilometres<input type="number" min="1" value={form.interval_km} onChange={e => setForm({ ...form, interval_km: e.target.value })} placeholder="10000"/></label>
          <label>Engine hours<input type="number" min="0.1" step="0.1" value={form.interval_engine_hours} onChange={e => setForm({ ...form, interval_engine_hours: e.target.value })} placeholder="250"/></label>
          <label>Calendar days<input type="number" min="1" value={form.interval_days} onChange={e => setForm({ ...form, interval_days: e.target.value })} placeholder="180"/></label>
        </div>
      </div>
      <div className="editor-section">
        <strong>Warning window</strong>
        <div className="three">
          <label>Warn before km<input type="number" min="0" value={form.warning_km} onChange={e => setForm({ ...form, warning_km: e.target.value })}/></label>
          <label>Warn before hours<input type="number" min="0" step="0.1" value={form.warning_engine_hours} onChange={e => setForm({ ...form, warning_engine_hours: e.target.value })}/></label>
          <label>Warn before days<input type="number" min="0" value={form.warning_days} onChange={e => setForm({ ...form, warning_days: e.target.value })}/></label>
        </div>
      </div>
      <div className="editor-section">
        <strong>Assigned units</strong><span>Select every unit that follows this company schedule.</span>
        <div className="unit-picker">{ws.vehicles.map(vehicle => <button type="button" key={vehicle.id} className={form.vehicleIds.includes(vehicle.id) ? 'selected' : ''} onClick={() => toggleVehicle(vehicle.id)}><Truck size={14}/><span>#{vehicle.unit_number}</span><small>{vehicle.name || vehicle.vehicle_type}</small></button>)}</div>
      </div>
      <Actions busy={busy} onCancel={onClose}/>
    </form>
  </Modal>
}

function WorkOrderEditor({ work, ws, onClose, onSaved }: { work: WorkOrder | null; ws: Workspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    vehicle_id: work?.vehicle_id || ws.vehicles[0]?.id || '',
    maintenance_assignment_id: work?.maintenance_assignment_id || '',
    source_defect_id: work?.source_defect_id || '',
    work_order_number: work?.work_order_number || workOrderNumber(),
    title: work?.title || '',
    description: work?.description || '',
    priority: work?.priority || 'normal',
    status: work?.status || 'open',
    assigned_employee_id: work?.assigned_employee_id || '',
    vendor: work?.vendor || '',
    scheduled_date: dateOnly(work?.scheduled_date),
    completed_odometer_km: work?.completed_odometer_km?.toString() || '',
    completed_engine_hours: work?.completed_engine_hours?.toString() || '',
    labour: ((work?.labour_cost_cents || 0) / 100).toString(),
    parts: ((work?.parts_cost_cents || 0) / 100).toString(),
    external: ((work?.external_cost_cents || 0) / 100).toString(),
    downtime_minutes: (work?.downtime_minutes || 0).toString(),
    completion_notes: work?.completion_notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        maintenance_assignment_id: form.maintenance_assignment_id || null,
        source_defect_id: form.source_defect_id || null,
        work_order_number: form.work_order_number.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        status: form.status,
        assigned_employee_id: form.assigned_employee_id || null,
        vendor: form.vendor.trim() || null,
        scheduled_date: form.scheduled_date || null,
        completed_at: form.status === 'completed' ? (work?.completed_at || new Date().toISOString()) : null,
        completed_odometer_km: numberOrNull(form.completed_odometer_km),
        completed_engine_hours: numberOrNull(form.completed_engine_hours),
        labour_cost_cents: dollarsToCents(form.labour),
        parts_cost_cents: dollarsToCents(form.parts),
        external_cost_cents: dollarsToCents(form.external),
        downtime_minutes: Number(form.downtime_minutes) || 0,
        completion_notes: form.completion_notes.trim() || null,
      }

      if (ws.testMode) {
        const id = work?.id || makeId()
        const row: WorkOrder = { id, organization_id: ws.organization!.id, created_at: work?.created_at || new Date().toISOString(), started_at: work?.started_at || null, ...payload }
        const workOrders = work?.id ? ws.workOrders.map(item => item.id === id ? row : item) : [row, ...ws.workOrders]
        let assignments = ws.assignments
        let defects = ws.defects

        if (payload.status === 'completed' && payload.maintenance_assignment_id) {
          const assignment = ws.assignments.find(a => a.id === payload.maintenance_assignment_id)
          const program = assignment ? ws.programs.find(p => p.id === assignment.program_id) : undefined
          if (assignment && program) {
            const baseKm = payload.completed_odometer_km ?? assignment.last_completed_odometer_km
            const baseHours = payload.completed_engine_hours ?? assignment.last_completed_engine_hours
            assignments = ws.assignments.map(item => item.id === assignment.id ? {
              ...item,
              last_completed_date: today(),
              last_completed_odometer_km: baseKm,
              last_completed_engine_hours: baseHours,
              next_due_date: program.interval_days ? addDays(today(), program.interval_days) : null,
              next_due_odometer_km: program.interval_km && baseKm !== null ? baseKm + program.interval_km : null,
              next_due_engine_hours: program.interval_engine_hours && baseHours !== null ? baseHours + program.interval_engine_hours : null,
            } : item)
          }
        }

        if (payload.status === 'completed' && payload.source_defect_id) {
          defects = ws.defects.map(defect => defect.id === payload.source_defect_id ? { ...defect, status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: payload.completion_notes } : defect)
        }

        writeTestV2(ws, { workOrders, assignments, defects })
        await onSaved()
        onClose()
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')
      const result = work?.id
        ? await db.from('fleet_work_orders').update(payload).eq('id', work.id).eq('organization_id', ws.organization!.id)
        : await db.from('fleet_work_orders').insert({ ...payload, organization_id: ws.organization!.id, created_by: userData.user.id })
      if (result.error) throw result.error
      await onSaved()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const selectedAssignment = form.maintenance_assignment_id ? ws.assignments.find(a => a.id === form.maintenance_assignment_id) : undefined
  const selectedProgram = selectedAssignment ? ws.programs.find(p => p.id === selectedAssignment.program_id) : undefined

  return <Modal title={work?.id ? `Work order ${work.work_order_number}` : 'New work order'} subtitle={selectedProgram ? `${selectedProgram.name} · Completing this advances the recurring schedule.` : 'Repair, service or shop work.'} onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      {error && <div className="maint-message">{error}</div>}
      <div className="two">
        <label>Unit<select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>{ws.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>#{vehicle.unit_number} {vehicle.name || vehicle.vehicle_type}</option>)}</select></label>
        <label>Work order<input value={form.work_order_number} onChange={e => setForm({ ...form, work_order_number: e.target.value })} required/></label>
      </div>
      <label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required/></label>
      <label>Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      <div className="three">
        <label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{['low', 'normal', 'high', 'urgent'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{WORK_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Scheduled<input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })}/></label>
      </div>
      <div className="two">
        <label>Assigned mechanic<select value={form.assigned_employee_id} onChange={e => setForm({ ...form, assigned_employee_id: e.target.value })}><option value="">Unassigned</option>{ws.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label>
        <label>Vendor / shop<input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}/></label>
      </div>
      <div className="editor-section">
        <strong>Completion readings</strong><span>When this order is completed, these readings become the baseline for the next recurring service.</span>
        <div className="two">
          <label>Odometer km<input type="number" min="0" value={form.completed_odometer_km} onChange={e => setForm({ ...form, completed_odometer_km: e.target.value })}/></label>
          <label>Engine hours<input type="number" min="0" step="0.1" value={form.completed_engine_hours} onChange={e => setForm({ ...form, completed_engine_hours: e.target.value })}/></label>
        </div>
      </div>
      <div className="editor-section">
        <strong>Cost and downtime</strong>
        <div className="four">
          <label>Labour $<input type="number" min="0" step="0.01" value={form.labour} onChange={e => setForm({ ...form, labour: e.target.value })}/></label>
          <label>Parts $<input type="number" min="0" step="0.01" value={form.parts} onChange={e => setForm({ ...form, parts: e.target.value })}/></label>
          <label>External $<input type="number" min="0" step="0.01" value={form.external} onChange={e => setForm({ ...form, external: e.target.value })}/></label>
          <label>Downtime min<input type="number" min="0" value={form.downtime_minutes} onChange={e => setForm({ ...form, downtime_minutes: e.target.value })}/></label>
        </div>
      </div>
      <label>Completion notes<textarea value={form.completion_notes} onChange={e => setForm({ ...form, completion_notes: e.target.value })} placeholder="Work completed, parts changed, follow-up notes…"/></label>
      <Actions busy={busy} onCancel={onClose}/>
    </form>
  </Modal>
}

function DefectEditor({ defect, ws, onClose, onSaved }: { defect: Defect | null; ws: Workspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    vehicle_id: defect?.vehicle_id || ws.vehicles[0]?.id || '',
    title: defect?.title || '',
    description: defect?.description || '',
    severity: defect?.severity || 'medium',
    status: defect?.status || 'open',
    out_of_service: defect?.out_of_service ?? false,
    resolution_notes: defect?.resolution_notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const vehicle = ws.vehicles.find(v => v.id === form.vehicle_id)
      const payload = {
        vehicle_id: form.vehicle_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        severity: form.severity,
        status: form.status,
        out_of_service: form.out_of_service,
        resolution_notes: form.resolution_notes.trim() || null,
        resolved_at: ['resolved', 'dismissed'].includes(form.status) ? new Date().toISOString() : null,
        odometer_km: defect?.odometer_km ?? vehicle?.odometer_km ?? null,
        engine_hours: defect?.engine_hours ?? vehicle?.engine_hours ?? null,
      }

      if (ws.testMode) {
        const id = defect?.id || makeId()
        const row: Defect = { id, organization_id: ws.organization!.id, reported_at: defect?.reported_at || new Date().toISOString(), ...payload }
        const defects = defect ? ws.defects.map(item => item.id === id ? row : item) : [row, ...ws.defects]
        writeTestV2(ws, { defects })
        await onSaved()
        onClose()
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')
      const result = defect
        ? await db.from('fleet_defects').update(payload).eq('id', defect.id).eq('organization_id', ws.organization!.id)
        : await db.from('fleet_defects').insert({ ...payload, organization_id: ws.organization!.id, reported_by: userData.user.id })
      if (result.error) throw result.error
      await onSaved()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={defect ? 'Edit defect' : 'Report defect'} subtitle="Critical defects can immediately place the unit out of service." onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      {error && <div className="maint-message">{error}</div>}
      <label>Unit<select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>{ws.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>#{vehicle.unit_number} {vehicle.name || vehicle.vehicle_type}</option>)}</select></label>
      <label>Problem<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required/></label>
      <label>Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      <div className="two">
        <label>Severity<select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>{['low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['open', 'acknowledged', 'scheduled', 'in_repair', 'resolved', 'dismissed'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      </div>
      <label className="check"><input type="checkbox" checked={form.out_of_service} onChange={e => setForm({ ...form, out_of_service: e.target.checked })}/><span>Take this unit out of service</span></label>
      {['resolved', 'dismissed'].includes(form.status) && <label>Resolution notes<textarea value={form.resolution_notes} onChange={e => setForm({ ...form, resolution_notes: e.target.value })}/></label>}
      <Actions busy={busy} onCancel={onClose}/>
    </form>
  </Modal>
}

function InspectionEditor({ ws, onClose, onSaved }: { ws: Workspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const firstVehicle = ws.vehicles[0]
  const [form, setForm] = useState({
    vehicle_id: firstVehicle?.id || '',
    inspection_type: 'shop',
    inspection_name: '',
    result: 'pass',
    odometer_km: firstVehicle?.odometer_km?.toString() || '',
    engine_hours: firstVehicle?.engine_hours?.toString() || '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const changeVehicle = (vehicleId: string) => {
    const vehicle = ws.vehicles.find(v => v.id === vehicleId)
    setForm(current => ({ ...current, vehicle_id: vehicleId, odometer_km: vehicle?.odometer_km?.toString() || '', engine_hours: vehicle?.engine_hours?.toString() || '' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        inspection_type: form.inspection_type,
        inspection_name: form.inspection_name.trim() || null,
        result: form.result,
        odometer_km: numberOrNull(form.odometer_km),
        engine_hours: numberOrNull(form.engine_hours),
        notes: form.notes.trim() || null,
        inspected_at: new Date().toISOString(),
      }

      if (ws.testMode) {
        const row: Inspection = { id: makeId(), organization_id: ws.organization!.id, ...payload }
        writeTestV2(ws, { inspections: [row, ...ws.inspections] })
        await onSaved()
        onClose()
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')
      const result = await db.from('fleet_inspections').insert({ ...payload, organization_id: ws.organization!.id, inspector_user_id: userData.user.id })
      if (result.error) throw result.error
      await onSaved()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Record inspection" subtitle="Pre-trip, post-trip, CVIP and shop inspections all stay with the unit." onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      {error && <div className="maint-message">{error}</div>}
      <label>Unit<select value={form.vehicle_id} onChange={e => changeVehicle(e.target.value)}>{ws.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>#{vehicle.unit_number} {vehicle.name || vehicle.vehicle_type}</option>)}</select></label>
      <div className="two">
        <label>Inspection type<select value={form.inspection_type} onChange={e => setForm({ ...form, inspection_type: e.target.value })}>{INSPECTION_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>Result<select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option value="pass">Pass</option><option value="pass_with_defects">Pass with defects</option><option value="fail">Fail</option></select></label>
      </div>
      {form.inspection_type === 'custom' && <label>Inspection name<input value={form.inspection_name} onChange={e => setForm({ ...form, inspection_name: e.target.value })}/></label>}
      <div className="two"><label>Odometer km<input type="number" value={form.odometer_km} onChange={e => setForm({ ...form, odometer_km: e.target.value })}/></label><label>Engine hours<input type="number" step="0.1" value={form.engine_hours} onChange={e => setForm({ ...form, engine_hours: e.target.value })}/></label></div>
      <label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
      <Actions busy={busy} onCancel={onClose}/>
    </form>
  </Modal>
}

function DocumentEditor({ ws, onClose, onSaved }: { ws: Workspace; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ vehicle_id: ws.vehicles[0]?.id || '', document_type: 'registration', expiry_date: '', notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) return setError('Choose a file.')
    setBusy(true)
    setError('')
    try {
      if (ws.testMode) throw new Error('Real file uploads are disabled in the local test workspace. Sign in to a company workspace to test storage.')
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${ws.organization!.id}/${form.vehicle_id}/${crypto.randomUUID()}-${safeName}`
      const upload = await supabase.storage.from('fleet-documents').upload(storagePath, file, { contentType: file.type || undefined })
      if (upload.error) throw upload.error
      const result = await db.from('fleet_documents').insert({
        organization_id: ws.organization!.id,
        vehicle_id: form.vehicle_id,
        document_type: form.document_type,
        name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        file_size: file.size,
        expiry_date: form.expiry_date || null,
        notes: form.notes.trim() || null,
        created_by: userData.user.id,
      })
      if (result.error) {
        await supabase.storage.from('fleet-documents').remove([storagePath])
        throw result.error
      }
      await onSaved()
      onClose()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Upload fleet document" subtitle="Registration, insurance, CVIP, permits, manuals and service documents." onClose={onClose}>
    <form onSubmit={submit} className="editor-form">
      {error && <div className="maint-message">{error}</div>}
      <label>Unit<select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })}>{ws.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>#{vehicle.unit_number} {vehicle.name || vehicle.vehicle_type}</option>)}</select></label>
      <div className="two">
        <label>Document type<select value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })}>{['registration', 'insurance', 'cvip', 'annual_inspection', 'permit', 'manual', 'service_document', 'photo', 'other'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label>Expiry date<input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })}/></label>
      </div>
      <label>File<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={e => setFile(e.target.files?.[0] || null)} required/></label>
      <label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
      <Actions busy={busy} onCancel={onClose}/>
    </form>
  </Modal>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div className="maint-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="maint-modal"><div className="maint-modal-head"><div><span className="maint-eyebrow">MAINTENANCE</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button onClick={onClose}><X size={20}/></button></div>{children}</div></div>
}

function Actions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return <div className="editor-actions"><button type="button" className="maint-secondary" onClick={onCancel}>Cancel</button><button className="maint-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
}

function Status({ value }: { value: string }) {
  return <span className={`maint-status status-${value}`}>{label(value)}</span>
}

function Empty({ text }: { text: string }) {
  return <div className="maint-empty"><History size={22}/><span>{text}</span></div>
}
