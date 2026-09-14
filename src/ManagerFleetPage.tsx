import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import {
  AlertTriangle, BriefcaseBusiness, CalendarDays, ClipboardCheck, ContactRound, Gauge,
  HardHat, Plus, Search, ShieldCheck, SlidersHorizontal, Truck, UserRound, Users,
  Wrench, X, CircleDollarSign, Clock3, FileText, History,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './manager-fleet.css'

const db = supabase as any
const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_V2_KEY = 'northborn_test_fleet_v2'
const TEST_ORG = { id: '00000000-0000-0000-0000-000000000001', name: 'Northborn Test Company' }
const EDIT_ROLES = new Set(['owner', 'admin', 'supervisor', 'mechanic'])
const VIEW_ROLES = new Set(['owner', 'admin', 'supervisor', 'mechanic', 'dispatcher', 'safety'])
const NAV = [
  ['Dashboard', '/', Gauge], ['Calendar', '/calendar', CalendarDays], ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness], ['Customers', '/customers', ContactRound], ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck], ['Maintenance', '/maintenance', Wrench], ['Safety', '/safety', ShieldCheck], ['Timesheets', '/timesheets', HardHat],
] as const
const VEHICLE_TYPES = ['Hydrovac', 'Combo Vac', 'Straight Vac', 'Semi Vac', 'Water Truck', 'Steamer', 'Pickup', 'Tractor', 'Trailer', 'Skid Steer', 'Other']
const STATUS_OPTIONS = [['available','Available'],['assigned','Assigned'],['maintenance','Maintenance'],['out_of_service','Out of service'],['archived','Archived']] as const

type Organization = { id: string; name: string }
type Employee = { id: string; first_name: string; last_name: string; position: string | null; status: string }
type Vehicle = {
  id: string; organization_id: string; unit_number: string; name: string | null; vehicle_type: string; plate: string | null; status: string
  vin: string | null; year: number | null; make: string | null; model: string | null; color: string | null
  odometer_km: number | null; engine_hours: number | null; primary_operator_id: string | null
  registration_expiry: string | null; insurance_expiry: string | null; annual_inspection_expiry: string | null
  last_service_date: string | null; notes: string | null
}
type Program = { id: string; name: string; service_type: string; interval_km: number | null; interval_engine_hours: number | null; interval_days: number | null; warning_km: number; warning_engine_hours: number; warning_days: number; active: boolean }
type MaintenanceAssignment = { id: string; program_id: string; vehicle_id: string; active: boolean; last_completed_date: string | null; next_due_date: string | null; next_due_odometer_km: number | null; next_due_engine_hours: number | null }
type Defect = { id: string; vehicle_id: string; title: string; severity: string; status: string; out_of_service: boolean }
type Inspection = { id: string; vehicle_id: string; inspection_type: string; result: string; inspected_at: string }
type WorkOrder = { id: string; vehicle_id: string; status: string; completed_at: string | null; labour_cost_cents: number; parts_cost_cents: number; external_cost_cents: number; downtime_minutes: number; completed_odometer_km: number | null; completed_engine_hours: number | null }
type DocumentRow = { id: string; vehicle_id: string; expiry_date: string | null }
type Workspace = { organization: Organization | null; roleKey: string; vehicles: Vehicle[]; employees: Employee[]; programs: Program[]; assignments: MaintenanceAssignment[]; defects: Defect[]; inspections: Inspection[]; workOrders: WorkOrder[]; documents: DocumentRow[]; testMode: boolean }
const EMPTY: Workspace = { organization: null, roleKey: '', vehicles: [], employees: [], programs: [], assignments: [], defects: [], inspections: [], workOrders: [], documents: [], testMode: false }

const dateOnly = (value: string | null | undefined) => value ? value.slice(0, 10) : ''
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'short',day:'numeric'}).format(new Date(`${value.slice(0,10)}T12:00:00`)) : 'Not set'
const readError = (error: unknown) => error instanceof Error ? error.message : String((error as {message?: string})?.message || error || 'Something went wrong.')
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value)
const textOrNull = (value: string) => value.trim() || null
const money = (cents: number) => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents / 100)
const today = () => new Date().toISOString().slice(0, 10)

function normalizeVehicle(raw: any): Vehicle {
  return {
    id: raw.id, organization_id: raw.organization_id, unit_number: raw.unit_number || '', name: raw.name ?? null,
    vehicle_type: raw.vehicle_type || 'Other', plate: raw.plate ?? null, status: raw.status || 'available', vin: raw.vin ?? null,
    year: raw.year ?? null, make: raw.make ?? null, model: raw.model ?? null, color: raw.color ?? null,
    odometer_km: raw.odometer_km ?? null, engine_hours: raw.engine_hours ?? null, primary_operator_id: raw.primary_operator_id ?? null,
    registration_expiry: raw.registration_expiry ?? null, insurance_expiry: raw.insurance_expiry ?? null,
    annual_inspection_expiry: raw.annual_inspection_expiry ?? null, last_service_date: raw.last_service_date ?? null, notes: raw.notes ?? null,
  }
}

function readTestBase() {
  try {
    const raw = JSON.parse(localStorage.getItem(TEST_DATA_KEY) || '{}')
    return { vehicles: (raw.vehicles || []).map(normalizeVehicle), employees: (raw.employees || []) as Employee[] }
  } catch { return { vehicles: [] as Vehicle[], employees: [] as Employee[] } }
}
function writeTestVehicles(vehicles: Vehicle[]) {
  try { const raw = JSON.parse(localStorage.getItem(TEST_DATA_KEY) || '{}'); raw.vehicles = vehicles; localStorage.setItem(TEST_DATA_KEY, JSON.stringify(raw)) } catch {}
}
function readTestV2() {
  try { return JSON.parse(localStorage.getItem(TEST_V2_KEY) || '{}') } catch { return {} }
}
function daysUntil(value: string | null) {
  if (!value) return null
  return Math.ceil((new Date(`${value.slice(0,10)}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000)
}
function intervalText(program: Program) {
  const values: string[] = []
  if (program.interval_engine_hours) values.push(`${program.interval_engine_hours.toLocaleString()} h`)
  if (program.interval_km) values.push(`${program.interval_km.toLocaleString()} km`)
  if (program.interval_days) values.push(`${program.interval_days} days`)
  return values.join(' or ')
}
function scheduleState(vehicle: Vehicle, program: Program, assignment: MaintenanceAssignment) {
  const overdue: string[] = [], warning: string[] = []
  if (assignment.next_due_date) { const d = daysUntil(assignment.next_due_date); if (d !== null && d <= 0) overdue.push(d === 0 ? 'due today' : `${Math.abs(d)}d overdue`); else if (d !== null && d <= program.warning_days) warning.push(`${d}d`) }
  if (assignment.next_due_odometer_km !== null && vehicle.odometer_km !== null) { const d = assignment.next_due_odometer_km - vehicle.odometer_km; if (d <= 0) overdue.push(`${Math.abs(d).toLocaleString()} km overdue`); else if (d <= program.warning_km) warning.push(`${d.toLocaleString()} km`) }
  if (assignment.next_due_engine_hours !== null && vehicle.engine_hours !== null) { const d = assignment.next_due_engine_hours - vehicle.engine_hours; if (d <= 0) overdue.push(`${Math.abs(d).toLocaleString()} h overdue`); else if (d <= program.warning_engine_hours) warning.push(`${d.toLocaleString()} h`) }
  if (overdue.length) return { tone: 'danger', text: overdue.join(' · ') }
  if (warning.length) return { tone: 'warn', text: `Due in ${warning.join(' / ')}` }
  return { tone: 'ok', text: [assignment.next_due_date ? formatDate(assignment.next_due_date) : '', assignment.next_due_odometer_km !== null ? `${assignment.next_due_odometer_km.toLocaleString()} km` : '', assignment.next_due_engine_hours !== null ? `${assignment.next_due_engine_hours.toLocaleString()} h` : ''].filter(Boolean).join(' / ') || 'Waiting for meter baseline' }
}
function vehicleForm(vehicle?: Vehicle) {
  return {
    unit_number: vehicle?.unit_number || '', name: vehicle?.name || '', vehicle_type: vehicle?.vehicle_type || 'Hydrovac', plate: vehicle?.plate || '', status: vehicle?.status || 'available',
    vin: vehicle?.vin || '', year: vehicle?.year?.toString() || '', make: vehicle?.make || '', model: vehicle?.model || '', color: vehicle?.color || '',
    odometer_km: vehicle?.odometer_km?.toString() || '', engine_hours: vehicle?.engine_hours?.toString() || '', primary_operator_id: vehicle?.primary_operator_id || '',
    registration_expiry: dateOnly(vehicle?.registration_expiry), insurance_expiry: dateOnly(vehicle?.insurance_expiry), annual_inspection_expiry: dateOnly(vehicle?.annual_inspection_expiry), notes: vehicle?.notes || '',
  }
}
type VehicleForm = ReturnType<typeof vehicleForm>
function vehiclePayload(form: VehicleForm) {
  return {
    unit_number: form.unit_number.trim(), name: textOrNull(form.name), vehicle_type: form.vehicle_type, plate: textOrNull(form.plate), status: form.status,
    vin: textOrNull(form.vin), year: numberOrNull(form.year), make: textOrNull(form.make), model: textOrNull(form.model), color: textOrNull(form.color),
    odometer_km: numberOrNull(form.odometer_km), engine_hours: numberOrNull(form.engine_hours), primary_operator_id: textOrNull(form.primary_operator_id),
    registration_expiry: textOrNull(form.registration_expiry), insurance_expiry: textOrNull(form.insurance_expiry), annual_inspection_expiry: textOrNull(form.annual_inspection_expiry), notes: textOrNull(form.notes),
  }
}

export default function ManagerFleetPage() {
  const [ws,setWs] = useState<Workspace>(EMPTY), [loading,setLoading] = useState(true), [error,setError] = useState(''), [query,setQuery] = useState(''), [filter,setFilter] = useState('all'), [selected,setSelected] = useState<string|null>(null), [adding,setAdding] = useState(false)
  const load = useCallback(async () => {
    setError('')
    const testMode = localStorage.getItem(TEST_MODE_KEY) === '1'
    if (testMode) {
      const base = readTestBase(), v2 = readTestV2()
      setWs({ organization: TEST_ORG, roleKey: 'owner', vehicles: base.vehicles, employees: base.employees, programs: v2.programs || [], assignments: v2.assignments || [], defects: v2.defects || [], inspections: v2.inspections || [], workOrders: v2.workOrders || [], documents: v2.documents || [], testMode: true })
      setLoading(false); return
    }
    const {data:s} = await supabase.auth.getSession(); const user = s.session?.user
    if (!user) { setWs(EMPTY); setLoading(false); return }
    const membership = await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if (membership.error || !membership.data?.id) { setLoading(false); return }
    const organization = membership.data.organization as Organization
    const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id); const roleKey = roles.data?.[0]?.role?.key || ''
    if (roleKey === 'operator') { setWs({...EMPTY,organization,roleKey}); setLoading(false); return }
    const [vehicles,employees,programs,assignments,defects,inspections,workOrders,documents] = await Promise.all([
      db.from('fleet_vehicles').select('*').eq('organization_id',organization.id).order('unit_number'),
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id',organization.id).neq('status','archived').order('last_name'),
      db.from('fleet_maintenance_programs').select('*').eq('organization_id',organization.id).order('name'),
      db.from('fleet_maintenance_assignments').select('*').eq('organization_id',organization.id),
      db.from('fleet_defects').select('id,vehicle_id,title,severity,status,out_of_service').eq('organization_id',organization.id),
      db.from('fleet_inspections').select('id,vehicle_id,inspection_type,result,inspected_at').eq('organization_id',organization.id).order('inspected_at',{ascending:false}),
      db.from('fleet_work_orders').select('id,vehicle_id,status,completed_at,labour_cost_cents,parts_cost_cents,external_cost_cents,downtime_minutes,completed_odometer_km,completed_engine_hours').eq('organization_id',organization.id),
      db.from('fleet_documents').select('id,vehicle_id,expiry_date').eq('organization_id',organization.id),
    ])
    const firstError = vehicles.error || employees.error || programs.error || assignments.error || defects.error || inspections.error || workOrders.error || documents.error
    if (firstError) setError(firstError.message)
    setWs({ organization, roleKey, vehicles: (vehicles.data || []).map(normalizeVehicle), employees: employees.data || [], programs: programs.data || [], assignments: assignments.data || [], defects: defects.data || [], inspections: inspections.data || [], workOrders: workOrders.data || [], documents: documents.data || [], testMode: false })
    setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  const attentionFor = (vehicle: Vehicle) => {
    let count = ws.defects.filter(d=>d.vehicle_id===vehicle.id&&!['resolved','dismissed'].includes(d.status)).length
    for (const assignment of ws.assignments.filter(a=>a.vehicle_id===vehicle.id&&a.active)) { const program=ws.programs.find(p=>p.id===assignment.program_id); if(program&&scheduleState(vehicle,program,assignment).tone!=='ok') count++ }
    for (const expiry of [vehicle.registration_expiry,vehicle.insurance_expiry,vehicle.annual_inspection_expiry]) { const days=daysUntil(expiry); if(days!==null&&days<=30)count++ }
    return count
  }
  const filtered = useMemo(()=>ws.vehicles.filter(vehicle=>{const q=query.trim().toLowerCase();const text=`${vehicle.unit_number} ${vehicle.name||''} ${vehicle.vehicle_type} ${vehicle.plate||''} ${vehicle.vin||''} ${vehicle.make||''} ${vehicle.model||''}`.toLowerCase();return (!q||text.includes(q))&&(filter==='all'||filter==='attention'?filter==='all'||attentionFor(vehicle)>0:vehicle.status===filter)}),[ws,query,filter])
  if(loading)return <div className="fleet-loading">Loading fleet…</div>
  if(!ws.organization)return <Navigate to="/" replace/>
  if(!ws.testMode&&!VIEW_ROLES.has(ws.roleKey))return <Navigate to="/" replace/>
  const canEdit=ws.testMode||EDIT_ROLES.has(ws.roleKey), selectedVehicle=selected?ws.vehicles.find(v=>v.id===selected)||null:null, active=ws.vehicles.filter(v=>v.status!=='archived'), attention=active.filter(v=>attentionFor(v)>0).length
  return <div className="fleet-shell"><aside className="fleet-sidebar"><div className="fleet-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{ws.organization.name}</small></span></div><nav>{NAV.map(([n,p,I])=><NavLink key={p} to={p} end={p==='/' }><I size={18}/><span>{n}</span></NavLink>)}</nav></aside><main className="fleet-main"><header className="fleet-header"><div><span className="fleet-eyebrow">FLEET</span><strong>Fleet control</strong></div>{canEdit&&<button className="fleet-primary" onClick={()=>setAdding(true)}><Plus size={15}/>Add unit</button>}</header><section className="fleet-page"><div className="fleet-hero"><div><span className="fleet-eyebrow">FLEET OVERVIEW</span><h1>Units, compliance and maintenance.</h1><p>Maintenance due points now come from company schedules. Managers set the recurring interval once and Northborn advances it automatically when the work is completed.</p></div><NavLink className="fleet-secondary" to="/maintenance"><Wrench size={16}/>Maintenance control</NavLink></div>{error&&<div className="fleet-message">{error}</div>}<div className="fleet-metrics"><Metric icon={<Truck/>} value={active.length} text="Active units"/><Metric icon={<ClipboardCheck/>} value={active.filter(v=>v.status==='available').length} text="Available"/><Metric icon={<BriefcaseBusiness/>} value={active.filter(v=>v.status==='assigned').length} text="On jobs"/><Metric icon={<AlertTriangle/>} value={attention} text="Needs attention" danger={attention>0}/></div><div className="fleet-toolbar"><div className="fleet-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search unit, VIN, plate, make or model…"/></div><div className="fleet-filters"><SlidersHorizontal size={15}/>{[['all','All'],['available','Available'],['assigned','Assigned'],['maintenance','Maintenance'],['out_of_service','Out of service'],['attention','Attention']].map(([k,n])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{n}</button>)}</div></div><div className="fleet-grid">{filtered.map(vehicle=><VehicleCard key={vehicle.id} vehicle={vehicle} ws={ws} attention={attentionFor(vehicle)} onOpen={()=>setSelected(vehicle.id)}/>)}</div>{!filtered.length&&<div className="fleet-empty"><Truck size={27}/><strong>No units match this view</strong><span>Add a unit or change the filter.</span></div>}</section></main>{selectedVehicle&&<VehicleDrawer vehicle={selectedVehicle} ws={ws} canEdit={canEdit} onClose={()=>setSelected(null)} onSaved={async()=>{await load();setSelected(selectedVehicle.id)}}/>}{adding&&<VehicleEditor ws={ws} onClose={()=>setAdding(false)} onSaved={async()=>{await load();setAdding(false)}}/>}</div>
}

function Metric({icon,value,text,danger=false}:{icon:React.ReactNode;value:number;text:string;danger?:boolean}){return <div className={danger?'fleet-metric danger':'fleet-metric'}><span>{icon}</span><strong>{value}</strong><small>{text}</small></div>}
function VehicleCard({vehicle,ws,attention,onOpen}:{vehicle:Vehicle;ws:Workspace;attention:number;onOpen:()=>void}){const operator=ws.employees.find(e=>e.id===vehicle.primary_operator_id), schedules=ws.assignments.filter(a=>a.vehicle_id===vehicle.id&&a.active).length;return <button className="fleet-card" onClick={onOpen}><div className="fleet-card-top"><div className="fleet-card-icon"><Truck size={22}/></div><Status value={vehicle.status}/></div><strong>Unit {vehicle.unit_number}</strong><span>{vehicle.name||`${vehicle.year||''} ${vehicle.make||''} ${vehicle.model||vehicle.vehicle_type}`.trim()}</span><div className="fleet-card-meta"><small>{vehicle.odometer_km!==null?`${vehicle.odometer_km.toLocaleString()} km`:'No odometer'}</small><small>{vehicle.engine_hours!==null?`${vehicle.engine_hours.toLocaleString()} h`:'No hours'}</small></div><div className="fleet-card-bottom"><span>{operator?<><UserRound size={13}/>{operator.first_name} {operator.last_name}</>:`${schedules} maintenance schedule${schedules===1?'':'s'}`}</span>{attention>0&&<em><AlertTriangle size={13}/>{attention}</em>}</div></button>}

function VehicleDrawer({vehicle,ws,canEdit,onClose,onSaved}:{vehicle:Vehicle;ws:Workspace;canEdit:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){const [editing,setEditing]=useState(false);const schedules=ws.assignments.filter(a=>a.vehicle_id===vehicle.id&&a.active).map(a=>({assignment:a,program:ws.programs.find(p=>p.id===a.program_id)})).filter(x=>x.program) as {assignment:MaintenanceAssignment;program:Program}[];const defects=ws.defects.filter(d=>d.vehicle_id===vehicle.id&&!['resolved','dismissed'].includes(d.status));const inspections=ws.inspections.filter(i=>i.vehicle_id===vehicle.id).slice(0,4);const documents=ws.documents.filter(d=>d.vehicle_id===vehicle.id);const workOrders=ws.workOrders.filter(w=>w.vehicle_id===vehicle.id);const completed=workOrders.filter(w=>w.status==='completed');const totalCost=completed.reduce((s,w)=>s+w.labour_cost_cents+w.parts_cost_cents+w.external_cost_cents,0),downtime=completed.reduce((s,w)=>s+w.downtime_minutes,0);const kmReadings=completed.map(w=>w.completed_odometer_km).filter((x):x is number=>x!==null).sort((a,b)=>a-b),hourReadings=completed.map(w=>w.completed_engine_hours).filter((x):x is number=>x!==null).sort((a,b)=>a-b);const kmSpan=kmReadings.length>1?kmReadings[kmReadings.length-1]-kmReadings[0]:0,hourSpan=hourReadings.length>1?hourReadings[hourReadings.length-1]-hourReadings[0]:0;return <div className="fleet-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="fleet-drawer"><div className="fleet-drawer-head"><div><span className="fleet-eyebrow">UNIT PROFILE</span><h2>Unit {vehicle.unit_number}</h2><p>{vehicle.name||vehicle.vehicle_type}</p></div><div>{canEdit&&<button onClick={()=>setEditing(true)}>Edit</button>}<button onClick={onClose}><X size={18}/></button></div></div><div className="fleet-profile-stats"><Info label="Status" value={vehicle.status.replaceAll('_',' ')}/><Info label="Odometer" value={vehicle.odometer_km!==null?`${vehicle.odometer_km.toLocaleString()} km`:'Not set'}/><Info label="Engine hours" value={vehicle.engine_hours!==null?`${vehicle.engine_hours.toLocaleString()} h`:'Not set'}/><Info label="Last service" value={formatDate(vehicle.last_service_date)}/></div><section className="fleet-section"><div className="fleet-section-head"><div><strong>Automatic maintenance schedules</strong><span>Read only here. Company intervals are managed in Maintenance.</span></div><NavLink to="/maintenance"><Wrench size={14}/>Manage</NavLink></div><div className="fleet-schedule-list">{schedules.map(({assignment,program})=>{const state=scheduleState(vehicle,program,assignment);return <div className={`fleet-schedule ${state.tone}`} key={assignment.id}><div><strong>{program.name}</strong><span>{intervalText(program)}</span></div><div><em>{state.text}</em><small>Last completed {formatDate(assignment.last_completed_date)}</small></div></div>})}{!schedules.length&&<Empty text="No company maintenance schedules assigned to this unit."/>}</div></section><section className="fleet-section"><div className="fleet-section-head"><div><strong>Maintenance cost and downtime</strong><span>Completed work orders for this unit.</span></div></div><div className="fleet-cost-grid"><Info label="Total maintenance" value={money(totalCost)}/><Info label="Downtime" value={`${Math.round(downtime/60*10)/10} h`}/><Info label="Cost per recorded km" value={kmSpan>0?money(Math.round(totalCost/kmSpan)):'Need more meter history'}/><Info label="Cost per recorded hour" value={hourSpan>0?money(Math.round(totalCost/hourSpan)):'Need more meter history'}/></div></section><section className="fleet-section"><div className="fleet-section-head"><div><strong>Compliance</strong><span>Expiry dates stored on the unit.</span></div></div><div className="fleet-cost-grid"><Expiry label="Registration" value={vehicle.registration_expiry}/><Expiry label="Insurance" value={vehicle.insurance_expiry}/><Expiry label="Annual / CVIP" value={vehicle.annual_inspection_expiry}/><Info label="Documents" value={String(documents.length)}/></div></section><section className="fleet-section"><div className="fleet-section-head"><div><strong>Open defects</strong><span>Problems still requiring attention.</span></div><NavLink to="/maintenance">Open maintenance</NavLink></div>{defects.length?<div className="fleet-mini-list">{defects.map(d=><div key={d.id}><strong>{d.title}</strong><span>{d.severity} · {d.status.replaceAll('_',' ')}</span></div>)}</div>:<Empty text="No open defects."/>}</section><section className="fleet-section"><div className="fleet-section-head"><div><strong>Recent inspections</strong><span>Latest recorded checks.</span></div></div>{inspections.length?<div className="fleet-mini-list">{inspections.map(i=><div key={i.id}><strong>{i.inspection_type.replaceAll('_',' ')}</strong><span>{formatDate(i.inspected_at)} · {i.result.replaceAll('_',' ')}</span></div>)}</div>:<Empty text="No inspections recorded."/>}</section><section className="fleet-section"><div className="fleet-section-head"><div><strong>Unit information</strong></div></div><div className="fleet-cost-grid"><Info label="VIN" value={vehicle.vin||'Not set'}/><Info label="Plate" value={vehicle.plate||'Not set'}/><Info label="Year / make / model" value={[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')||'Not set'}/><Info label="Colour" value={vehicle.color||'Not set'}/></div>{vehicle.notes&&<p className="fleet-notes">{vehicle.notes}</p>}</section>{editing&&<VehicleEditor ws={ws} vehicle={vehicle} onClose={()=>setEditing(false)} onSaved={async()=>{await onSaved();setEditing(false)}}/>}</aside></div>}

function VehicleEditor({ws,vehicle,onClose,onSaved}:{ws:Workspace;vehicle?:Vehicle;onClose:()=>void;onSaved:()=>Promise<void>}){const [form,setForm]=useState(vehicleForm(vehicle)),[busy,setBusy]=useState(false),[error,setError]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const payload=vehiclePayload(form);if(ws.testMode){const row=normalizeVehicle({id:vehicle?.id||crypto.randomUUID(),organization_id:ws.organization!.id,last_service_date:vehicle?.last_service_date||null,...payload});writeTestVehicles(vehicle?ws.vehicles.map(v=>v.id===vehicle.id?row:v):[...ws.vehicles,row]);await onSaved();onClose();return}const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required.');const result=vehicle?await db.from('fleet_vehicles').update(payload).eq('id',vehicle.id).eq('organization_id',ws.organization!.id):await db.from('fleet_vehicles').insert({...payload,organization_id:ws.organization!.id,created_by:u.user.id});if(result.error)throw result.error;await onSaved();onClose()}catch(err){setError(readError(err))}finally{setBusy(false)}};return <div className="fleet-editor-backdrop"><form className="fleet-editor" onSubmit={submit}><div className="fleet-editor-head"><div><span className="fleet-eyebrow">{vehicle?'EDIT UNIT':'NEW UNIT'}</span><h2>{vehicle?`Unit ${vehicle.unit_number}`:'Add fleet unit'}</h2><p>Maintenance intervals are not entered here. They come from the company maintenance schedule.</p></div><button type="button" onClick={onClose}><X size={18}/></button></div>{error&&<div className="fleet-message">{error}</div>}<div className="fleet-form-grid"><Field label="Unit number"><input value={form.unit_number} onChange={e=>setForm({...form,unit_number:e.target.value})} required/></Field><Field label="Unit name"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Type"><select value={form.vehicle_type} onChange={e=>setForm({...form,vehicle_type:e.target.value})}>{VEHICLE_TYPES.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUS_OPTIONS.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></Field><Field label="Year"><input type="number" min="1900" max="2100" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/></Field><Field label="Make"><input value={form.make} onChange={e=>setForm({...form,make:e.target.value})}/></Field><Field label="Model"><input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></Field><Field label="Colour"><input value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></Field><Field label="VIN"><input value={form.vin} onChange={e=>setForm({...form,vin:e.target.value})}/></Field><Field label="Plate"><input value={form.plate} onChange={e=>setForm({...form,plate:e.target.value})}/></Field><Field label="Odometer km"><input type="number" min="0" value={form.odometer_km} onChange={e=>setForm({...form,odometer_km:e.target.value})}/></Field><Field label="Engine hours"><input type="number" min="0" step="0.1" value={form.engine_hours} onChange={e=>setForm({...form,engine_hours:e.target.value})}/></Field><Field label="Primary operator"><select value={form.primary_operator_id} onChange={e=>setForm({...form,primary_operator_id:e.target.value})}><option value="">Unassigned</option>{ws.employees.filter(e=>e.status==='active').map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></Field><Field label="Registration expiry"><input type="date" value={form.registration_expiry} onChange={e=>setForm({...form,registration_expiry:e.target.value})}/></Field><Field label="Insurance expiry"><input type="date" value={form.insurance_expiry} onChange={e=>setForm({...form,insurance_expiry:e.target.value})}/></Field><Field label="Annual / CVIP expiry"><input type="date" value={form.annual_inspection_expiry} onChange={e=>setForm({...form,annual_inspection_expiry:e.target.value})}/></Field></div><Field label="Notes"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><div className="fleet-editor-actions"><button type="button" className="fleet-secondary" onClick={onClose}>Cancel</button><button className="fleet-primary" disabled={busy}>{busy?'Saving…':'Save unit'}</button></div></form></div>}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="fleet-field"><span>{label}</span>{children}</label>}
function Info({label,value}:{label:string;value:string}){return <div className="fleet-info"><span>{label}</span><strong>{value}</strong></div>}
function Expiry({label,value}:{label:string;value:string|null}){const days=daysUntil(value);return <div className={`fleet-info ${days!==null&&days<0?'danger':days!==null&&days<=30?'warn':''}`}><span>{label}</span><strong>{formatDate(value)}</strong>{days!==null&&days<=30&&<small>{days<0?`${Math.abs(days)} days overdue`:`${days} days left`}</small>}</div>}
function Status({value}:{value:string}){return <span className={`fleet-status status-${value}`}>{value.replaceAll('_',' ')}</span>}
function Empty({text}:{text:string}){return <div className="fleet-mini-empty"><History size={17}/><span>{text}</span></div>}
