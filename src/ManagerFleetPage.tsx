import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import {
  AlertTriangle, BriefcaseBusiness, CalendarDays, ContactRound, Gauge, HardHat,
  History, Plus, Search, ShieldCheck, SlidersHorizontal, Truck, Users, Wrench, X,
  UserRound, Pencil, CircleDollarSign, ClipboardCheck, ArrowLeft, Save,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './manager-fleet.css'

const db = supabase as any
const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_SERVICE_KEY = 'northborn_test_fleet_services_v1'
const TEST_ORG = { id: '00000000-0000-0000-0000-000000000001', name: 'Northborn Test Company' }

type Organization = { id:string; name:string }
type Employee = { id:string; first_name:string; last_name:string; position:string|null; status:string }
type Vehicle = {
  id:string; organization_id:string; unit_number:string; name:string|null; vehicle_type:string; plate:string|null; status:string
  vin:string|null; year:number|null; make:string|null; model:string|null; color:string|null
  odometer_km:number|null; engine_hours:number|null; primary_operator_id:string|null
  registration_expiry:string|null; insurance_expiry:string|null; annual_inspection_expiry:string|null
  last_service_date:string|null; next_service_date:string|null; next_service_odometer_km:number|null; next_service_engine_hours:number|null
  notes:string|null
}
type ServiceRecord = {
  id:string; organization_id:string; vehicle_id:string; service_date:string; service_type:string; summary:string
  odometer_km:number|null; engine_hours:number|null; vendor:string|null; work_order_number:string|null
  cost_cents:number|null; notes:string|null; created_at?:string
}
type Workspace = { organization:Organization|null; roleKey:string; employees:Employee[]; vehicles:Vehicle[]; services:ServiceRecord[]; testMode:boolean }

const EMPTY:Workspace={organization:null,roleKey:'',employees:[],vehicles:[],services:[],testMode:false}
const EDIT_ROLES=new Set(['owner','admin','supervisor','mechanic'])
const VIEW_ROLES=new Set(['owner','admin','supervisor','mechanic','dispatcher','safety'])
const NAV=[['Dashboard','/',Gauge],['Calendar','/calendar',CalendarDays],['Dispatch','/dispatch',CalendarDays],['Jobs','/jobs',BriefcaseBusiness],['Customers','/customers',ContactRound],['Employees','/employees',Users],['Fleet','/fleet',Truck],['Maintenance','/maintenance',Wrench],['Safety','/safety',ShieldCheck],['Timesheets','/timesheets',HardHat]] as const
const VEHICLE_TYPES=['Hydrovac','Combo Vac','Straight Vac','Semi Vac','Water Truck','Steamer','Pickup','Tractor','Trailer','Skid Steer','Other']
const SERVICE_TYPES=['Preventive Service','Oil & Filters','Repair','Inspection','Tires','Brakes','Hydraulics','Vacuum System','Boiler / Steamer','Pump','Electrical','Other']
const STATUS_OPTIONS=[['available','Available'],['assigned','Assigned'],['maintenance','Maintenance'],['out_of_service','Out of service'],['archived','Archived']] as const

const asText=(value:unknown)=>value===null||value===undefined?'':String(value)
const asNullable=(value:string)=>value.trim()||null
const asNumber=(value:string)=>value.trim()===''?null:Number(value)
const dateOnly=(value:string|null)=>value?value.slice(0,10):''
const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong.')
const label=(v:string)=>v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const money=(cents:number|null)=>cents===null?'':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100)
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'short',day:'numeric'}).format(new Date(`${value.slice(0,10)}T12:00:00`)):'Not set'
const todayKey=()=>new Date().toISOString().slice(0,10)

function normalizeVehicle(v:any):Vehicle{
  return {
    id:v.id,organization_id:v.organization_id,unit_number:v.unit_number||'',name:v.name??null,vehicle_type:v.vehicle_type||'Other',
    plate:v.plate??null,status:v.status||'available',vin:v.vin??null,year:v.year??null,make:v.make??null,model:v.model??null,color:v.color??null,
    odometer_km:v.odometer_km??null,engine_hours:v.engine_hours??null,primary_operator_id:v.primary_operator_id??null,
    registration_expiry:v.registration_expiry??null,insurance_expiry:v.insurance_expiry??null,annual_inspection_expiry:v.annual_inspection_expiry??null,
    last_service_date:v.last_service_date??null,next_service_date:v.next_service_date??null,next_service_odometer_km:v.next_service_odometer_km??null,
    next_service_engine_hours:v.next_service_engine_hours??null,notes:v.notes??null,
  }
}
function readTestData():{vehicles:Vehicle[];employees:Employee[]}{
  try{
    const raw=JSON.parse(localStorage.getItem(TEST_DATA_KEY)||'{}')
    return {vehicles:(raw.vehicles||[]).map(normalizeVehicle),employees:(raw.employees||[]).map((e:any)=>({id:e.id,first_name:e.first_name,last_name:e.last_name,position:e.position??null,status:e.status||'active'}))}
  }catch{return {vehicles:[],employees:[]}}
}
function readTestServices():ServiceRecord[]{
  try{return JSON.parse(localStorage.getItem(TEST_SERVICE_KEY)||'[]') as ServiceRecord[]}catch{return[]}
}
function writeTestVehicles(vehicles:Vehicle[]){
  try{
    const raw=JSON.parse(localStorage.getItem(TEST_DATA_KEY)||'{}')
    raw.vehicles=vehicles
    localStorage.setItem(TEST_DATA_KEY,JSON.stringify(raw))
  }catch{}
}
function vehicleForm(v?:Vehicle){
  return {
    unit_number:v?.unit_number||'',name:v?.name||'',vehicle_type:v?.vehicle_type||'Hydrovac',plate:v?.plate||'',status:v?.status||'available',
    vin:v?.vin||'',year:asText(v?.year),make:v?.make||'',model:v?.model||'',color:v?.color||'',
    odometer_km:asText(v?.odometer_km),engine_hours:asText(v?.engine_hours),primary_operator_id:v?.primary_operator_id||'',
    registration_expiry:dateOnly(v?.registration_expiry||null),insurance_expiry:dateOnly(v?.insurance_expiry||null),
    annual_inspection_expiry:dateOnly(v?.annual_inspection_expiry||null),last_service_date:dateOnly(v?.last_service_date||null),
    next_service_date:dateOnly(v?.next_service_date||null),next_service_odometer_km:asText(v?.next_service_odometer_km),
    next_service_engine_hours:asText(v?.next_service_engine_hours),notes:v?.notes||'',
  }
}
type VehicleForm = ReturnType<typeof vehicleForm>

function vehiclePayload(f:VehicleForm){
  return {
    unit_number:f.unit_number.trim(),name:asNullable(f.name),vehicle_type:f.vehicle_type,plate:asNullable(f.plate),status:f.status,
    vin:asNullable(f.vin),year:asNumber(f.year),make:asNullable(f.make),model:asNullable(f.model),color:asNullable(f.color),
    odometer_km:asNumber(f.odometer_km),engine_hours:asNumber(f.engine_hours),primary_operator_id:asNullable(f.primary_operator_id),
    registration_expiry:asNullable(f.registration_expiry),insurance_expiry:asNullable(f.insurance_expiry),
    annual_inspection_expiry:asNullable(f.annual_inspection_expiry),last_service_date:asNullable(f.last_service_date),
    next_service_date:asNullable(f.next_service_date),next_service_odometer_km:asNumber(f.next_service_odometer_km),
    next_service_engine_hours:asNumber(f.next_service_engine_hours),notes:asNullable(f.notes),
  }
}
function daysUntil(value:string|null){
  if(!value)return null
  const t=new Date(`${todayKey()}T12:00:00`).getTime()
  const d=new Date(`${value.slice(0,10)}T12:00:00`).getTime()
  return Math.ceil((d-t)/86400000)
}
function attentionItems(v:Vehicle){
  const items:{tone:'danger'|'warn';label:string}[]=[]
  if(v.status==='out_of_service')items.push({tone:'danger',label:'Out of service'})
  if(v.status==='maintenance')items.push({tone:'warn',label:'In maintenance'})
  const dates:[string,string|null][]=[['Registration',v.registration_expiry],['Insurance',v.insurance_expiry],['Inspection',v.annual_inspection_expiry],['Service',v.next_service_date]]
  dates.forEach(([name,value])=>{const d=daysUntil(value);if(d!==null&&d<0)items.push({tone:'danger',label:`${name} overdue`});else if(d!==null&&d<=30)items.push({tone:'warn',label:`${name} due in ${d}d`})})
  if(v.odometer_km!==null&&v.next_service_odometer_km!==null){
    const left=v.next_service_odometer_km-v.odometer_km
    if(left<=0)items.push({tone:'danger',label:'Service km overdue'});else if(left<=1000)items.push({tone:'warn',label:`Service in ${left.toLocaleString()} km`})
  }
  if(v.engine_hours!==null&&v.next_service_engine_hours!==null){
    const left=v.next_service_engine_hours-v.engine_hours
    if(left<=0)items.push({tone:'danger',label:'Service hours overdue'});else if(left<=25)items.push({tone:'warn',label:`Service in ${left.toLocaleString()} h`})
  }
  return items
}

export default function ManagerFleetPage(){
  const [ws,setWs]=useState<Workspace>(EMPTY)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('all')
  const [selected,setSelected]=useState<string|null>(null)
  const [adding,setAdding]=useState(false)

  const load=useCallback(async()=>{
    setError('')
    const testMode=localStorage.getItem(TEST_MODE_KEY)==='1'
    if(testMode){
      const t=readTestData()
      setWs({organization:TEST_ORG,roleKey:'owner',employees:t.employees,vehicles:t.vehicles,services:readTestServices(),testMode:true})
      setLoading(false)
      return
    }
    const {data:s}=await supabase.auth.getSession()
    const user=s.session?.user
    if(!user){setWs(EMPTY);setLoading(false);return}
    const m=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(m.error||!m.data?.id){setLoading(false);return}
    const org=m.data.organization as Organization
    const rr=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',m.data.id)
    const roleKey=rr.data?.[0]?.role?.key||''
    if(roleKey==='operator'){setWs({...EMPTY,organization:org,roleKey});setLoading(false);return}
    const [v,e,sr]=await Promise.all([
      db.from('fleet_vehicles').select('*').eq('organization_id',org.id).order('unit_number'),
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id',org.id).neq('status','archived').order('last_name'),
      db.from('fleet_service_records').select('*').eq('organization_id',org.id).order('service_date',{ascending:false}).order('created_at',{ascending:false}),
    ])
    const er=v.error||e.error||sr.error
    if(er)setError(er.message)
    setWs({organization:org,roleKey,vehicles:(v.data??[]).map(normalizeVehicle),employees:e.data??[],services:sr.data??[],testMode:false})
    setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return ws.vehicles.filter(v=>{
      const matchesText=!q||`${v.unit_number} ${v.name||''} ${v.vehicle_type} ${v.plate||''} ${v.vin||''} ${v.year||''} ${v.make||''} ${v.model||''}`.toLowerCase().includes(q)
      const matchesFilter=filter==='all'||(filter==='attention'?attentionItems(v).length>0:v.status===filter)
      return matchesText&&matchesFilter
    })
  },[ws.vehicles,query,filter])

  if(loading)return <div className="fleet-loading">Loading fleet…</div>
  if(!ws.organization)return <Navigate to="/" replace/>
  if(!ws.testMode&&!VIEW_ROLES.has(ws.roleKey))return <Navigate to="/" replace/>

  const canEdit=ws.testMode||EDIT_ROLES.has(ws.roleKey)
  const selectedVehicle=selected?ws.vehicles.find(v=>v.id===selected)||null:null
  const attention=ws.vehicles.filter(v=>attentionItems(v).length>0).length
  const active=ws.vehicles.filter(v=>v.status!=='archived')

  return <div className="fleet-shell">
    <aside className="fleet-sidebar">
      <div className="fleet-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{ws.organization.name}</small></span></div>
      <nav>{NAV.map(([n,p,I])=><NavLink key={p} to={p} end={p==='/' }><I size={18}/><span>{n}</span></NavLink>)}</nav>
    </aside>
    <main className="fleet-main">
      <header className="fleet-header">
        <NavLink className="fleet-mobile-home" to="/"><ArrowLeft size={17}/></NavLink>
        <div><span className="fleet-eyebrow">FLEET</span><strong>Fleet control</strong></div>
        {canEdit&&<button className="fleet-primary fleet-header-add" onClick={()=>setAdding(true)}><Plus size={16}/>Add unit</button>}
      </header>
      <section className="fleet-page">
        <div className="fleet-hero">
          <div><span className="fleet-eyebrow">FLEET OVERVIEW</span><h1>Know every unit at a glance.</h1><p>Status, service intervals, inspections, registration and the details your shop needs in one place.</p></div>
          {canEdit&&<button className="fleet-primary" onClick={()=>setAdding(true)}><Plus size={17}/>Add fleet unit</button>}
        </div>
        {error&&<div className="fleet-message">{error}</div>}
        <div className="fleet-metrics">
          <Metric icon={<Truck/>} value={active.length} label="Active units"/>
          <Metric icon={<ClipboardCheck/>} value={active.filter(v=>v.status==='available').length} label="Available"/>
          <Metric icon={<BriefcaseBusiness/>} value={active.filter(v=>v.status==='assigned').length} label="On jobs"/>
          <Metric icon={<AlertTriangle/>} value={attention} label="Needs attention" attention={attention>0}/>
        </div>
        <div className="fleet-toolbar">
          <div className="fleet-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search unit, VIN, plate, make or model…"/></div>
          <div className="fleet-filters"><SlidersHorizontal size={16}/>{[['all','All'],['available','Available'],['assigned','Assigned'],['maintenance','Maintenance'],['out_of_service','Out of service'],['attention','Attention']].map(([k,n])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{n}</button>)}</div>
        </div>
        <div className="fleet-grid">
          {filtered.map(v=><VehicleCard key={v.id} vehicle={v} employees={ws.employees} onOpen={()=>setSelected(v.id)}/>) }
        </div>
        {!filtered.length&&<div className="fleet-empty"><Truck size={28}/><strong>{ws.vehicles.length?'No units match this view':'No fleet units yet'}</strong><span>{ws.vehicles.length?'Try another search or filter.':'Add your first truck, trailer or piece of equipment.'}</span></div>}
      </section>
    </main>
    {selectedVehicle&&<VehicleDrawer vehicle={selectedVehicle} ws={ws} canEdit={canEdit} onClose={()=>setSelected(null)} onChanged={load}/>} 
    {adding&&<VehicleEditor ws={ws} onClose={()=>setAdding(false)} onSaved={async()=>{setAdding(false);await load()}}/>}
  </div>
}

function Metric({icon,value,label,attention=false}:{icon:ReactNode;value:number;label:string;attention?:boolean}){
  return <div className={`fleet-metric${attention?' attention':''}`}><div>{icon}</div><span>{label}</span><strong>{value}</strong></div>
}
function VehicleCard({vehicle,employees,onOpen}:{vehicle:Vehicle;employees:Employee[];onOpen:()=>void}){
  const a=attentionItems(vehicle)
  const operator=employees.find(e=>e.id===vehicle.primary_operator_id)
  const descriptor=[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')
  return <button className="fleet-card" onClick={onOpen}>
    <div className="fleet-card-top"><div className="fleet-unit-icon"><Truck size={22}/></div><div className="fleet-unit-title"><span>UNIT</span><strong>{vehicle.unit_number}</strong></div><Status status={vehicle.status}/></div>
    <h3>{vehicle.name||descriptor||vehicle.vehicle_type}</h3>
    <p>{descriptor||vehicle.vehicle_type}{vehicle.plate?` · ${vehicle.plate}`:''}</p>
    <div className="fleet-card-stats">
      <span><small>Odometer</small><strong>{vehicle.odometer_km===null?'Not set':`${vehicle.odometer_km.toLocaleString()} km`}</strong></span>
      <span><small>Engine</small><strong>{vehicle.engine_hours===null?'Not set':`${vehicle.engine_hours.toLocaleString()} h`}</strong></span>
    </div>
    <div className="fleet-card-footer"><span><UserRound size={14}/>{operator?`${operator.first_name} ${operator.last_name}`:'No primary operator'}</span>{a.length?<span className={`fleet-attention ${a.some(x=>x.tone==='danger')?'danger':''}`}><AlertTriangle size={14}/>{a.length} alert{a.length===1?'':'s'}</span>:<span className="fleet-clear"><ShieldCheck size={14}/>No alerts</span>}</div>
  </button>
}
function Status({status}:{status:string}){return <span className={`fleet-status status-${status}`}>{label(status)}</span>}

function VehicleDrawer({vehicle,ws,canEdit,onClose,onChanged}:{vehicle:Vehicle;ws:Workspace;canEdit:boolean;onClose:()=>void;onChanged:()=>Promise<void>}){
  const [tab,setTab]=useState<'details'|'maintenance'>('details')
  const [editing,setEditing]=useState(false)
  const [serviceOpen,setServiceOpen]=useState(false)
  const a=attentionItems(vehicle)
  const services=ws.services.filter(s=>s.vehicle_id===vehicle.id)
  const operator=ws.employees.find(e=>e.id===vehicle.primary_operator_id)
  const serviceDateDays=daysUntil(vehicle.next_service_date)
  return <div className="fleet-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <aside className="fleet-drawer">
      <div className="fleet-drawer-head">
        <div><span className="fleet-eyebrow">UNIT PROFILE</span><h2>Unit {vehicle.unit_number}</h2><p>{vehicle.name||[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')||vehicle.vehicle_type}</p></div>
        <button className="fleet-icon-button" onClick={onClose}><X size={20}/></button>
      </div>
      <div className="fleet-drawer-summary"><Status status={vehicle.status}/><span>{vehicle.vehicle_type}</span>{vehicle.plate&&<span>Plate {vehicle.plate}</span>}{operator&&<span>{operator.first_name} {operator.last_name}</span>}</div>
      {a.length>0&&<div className="fleet-alert-list">{a.map((x,i)=><span key={`${x.label}-${i}`} className={x.tone}><AlertTriangle size={14}/>{x.label}</span>)}</div>}
      <div className="fleet-tabs"><button className={tab==='details'?'active':''} onClick={()=>setTab('details')}>Unit details</button><button className={tab==='maintenance'?'active':''} onClick={()=>setTab('maintenance')}>Maintenance <span>{services.length}</span></button></div>
      {tab==='details'&&<>
        {editing?<VehicleEditor ws={ws} existing={vehicle} embedded onClose={()=>setEditing(false)} onSaved={async()=>{setEditing(false);await onChanged()}}/>:<VehicleDetails vehicle={vehicle} employees={ws.employees}/>} 
        {!editing&&canEdit&&<div className="fleet-drawer-actions"><button className="fleet-secondary" onClick={()=>setEditing(true)}><Pencil size={15}/>Edit unit</button></div>}
      </>}
      {tab==='maintenance'&&<section className="fleet-maintenance">
        <div className="fleet-section-head"><div><strong>Service history</strong><span>Repairs, inspections and preventive maintenance</span></div>{canEdit&&<button className="fleet-primary" onClick={()=>setServiceOpen(true)}><Plus size={15}/>Add service</button>}</div>
        <div className="fleet-service-targets">
          <DueCard label="Next date" value={vehicle.next_service_date?formatDate(vehicle.next_service_date):'Not set'} alert={serviceDateDays!==null&&serviceDateDays<=30}/>
          <DueCard label="Next odometer" value={vehicle.next_service_odometer_km===null?'Not set':`${vehicle.next_service_odometer_km.toLocaleString()} km`} alert={vehicle.odometer_km!==null&&vehicle.next_service_odometer_km!==null&&vehicle.next_service_odometer_km-vehicle.odometer_km<=1000}/>
          <DueCard label="Next engine hours" value={vehicle.next_service_engine_hours===null?'Not set':`${vehicle.next_service_engine_hours.toLocaleString()} h`} alert={vehicle.engine_hours!==null&&vehicle.next_service_engine_hours!==null&&vehicle.next_service_engine_hours-vehicle.engine_hours<=25}/>
        </div>
        <div className="fleet-service-list">{services.map(s=><ServiceRow key={s.id} service={s}/>)}</div>
        {!services.length&&<div className="fleet-empty compact"><History size={24}/><strong>No maintenance history yet</strong><span>Add the first service or repair record for this unit.</span></div>}
      </section>}
      {serviceOpen&&<ServiceEditor vehicle={vehicle} ws={ws} onClose={()=>setServiceOpen(false)} onSaved={async()=>{setServiceOpen(false);await onChanged()}}/>}
    </aside>
  </div>
}
function DueCard({label:caption,value,alert}:{label:string;value:string;alert:boolean}){return <div className={`fleet-due-card${alert?' alert':''}`}><small>{caption}</small><strong>{value}</strong></div>}

function VehicleDetails({vehicle,employees}:{vehicle:Vehicle;employees:Employee[]}){
  const operator=employees.find(e=>e.id===vehicle.primary_operator_id)
  return <div className="fleet-detail-stack">
    <DetailSection title="Identity">
      <Detail label="Type" value={vehicle.vehicle_type}/><Detail label="Year / make / model" value={[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')||'Not set'}/>
      <Detail label="VIN" value={vehicle.vin||'Not set'} mono/><Detail label="Plate" value={vehicle.plate||'Not set'}/><Detail label="Colour" value={vehicle.color||'Not set'}/><Detail label="Primary operator" value={operator?`${operator.first_name} ${operator.last_name}`:'Not assigned'}/>
    </DetailSection>
    <DetailSection title="Current meters">
      <Detail label="Odometer" value={vehicle.odometer_km===null?'Not set':`${vehicle.odometer_km.toLocaleString()} km`}/><Detail label="Engine hours" value={vehicle.engine_hours===null?'Not set':`${vehicle.engine_hours.toLocaleString()} h`}/>
    </DetailSection>
    <DetailSection title="Compliance">
      <ComplianceDetail label="Registration" date={vehicle.registration_expiry}/><ComplianceDetail label="Insurance" date={vehicle.insurance_expiry}/><ComplianceDetail label="Annual inspection" date={vehicle.annual_inspection_expiry}/>
    </DetailSection>
    <DetailSection title="Service targets">
      <Detail label="Last service" value={formatDate(vehicle.last_service_date)}/><ComplianceDetail label="Next service date" date={vehicle.next_service_date}/>
      <Detail label="Next service km" value={vehicle.next_service_odometer_km===null?'Not set':`${vehicle.next_service_odometer_km.toLocaleString()} km`}/><Detail label="Next service hours" value={vehicle.next_service_engine_hours===null?'Not set':`${vehicle.next_service_engine_hours.toLocaleString()} h`}/>
    </DetailSection>
    <section className="fleet-detail-section"><div className="fleet-section-title">Notes</div><p className="fleet-notes">{vehicle.notes||'No unit notes.'}</p></section>
  </div>
}
function DetailSection({title,children}:{title:string;children:ReactNode}){return <section className="fleet-detail-section"><div className="fleet-section-title">{title}</div><div className="fleet-detail-grid">{children}</div></section>}
function Detail({label:caption,value,mono=false}:{label:string;value:string;mono?:boolean}){return <div className="fleet-detail"><small>{caption}</small><strong className={mono?'mono':''}>{value}</strong></div>}
function ComplianceDetail({label:caption,date}:{label:string;date:string|null}){const d=daysUntil(date);const tone=d===null?'':d<0?'danger':d<=30?'warn':'';return <div className={`fleet-detail ${tone}`}><small>{caption}</small><strong>{formatDate(date)}</strong>{d!==null&&<span>{d<0?`${Math.abs(d)} days overdue`:d===0?'Due today':`${d} days remaining`}</span>}</div>}

function VehicleEditor({ws,existing,embedded=false,onClose,onSaved}:{ws:Workspace;existing?:Vehicle;embedded?:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [f,setF]=useState<VehicleForm>(()=>vehicleForm(existing))
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const save=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('')
    try{
      if(!f.unit_number.trim())throw new Error('Unit number is required.')
      const payload=vehiclePayload(f)
      if(ws.testMode){
        let vehicles=readTestData().vehicles
        if(existing)vehicles=vehicles.map(v=>v.id===existing.id?{...v,...payload}:v)
        else vehicles=[...vehicles,{...normalizeVehicle({...payload,id:crypto.randomUUID(),organization_id:TEST_ORG.id}),status:payload.status||'available'}]
        writeTestVehicles(vehicles)
      }else{
        const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required.')
        const r=existing
          ?await db.from('fleet_vehicles').update(payload).eq('id',existing.id).eq('organization_id',ws.organization!.id)
          :await db.from('fleet_vehicles').insert({...payload,organization_id:ws.organization!.id,created_by:u.user.id})
        if(r.error)throw r.error
      }
      await onSaved()
    }catch(err){setError(readError(err))}finally{setBusy(false)}
  }
  const content=<form className={`fleet-editor${embedded?' embedded':''}`} onSubmit={save}>
    {!embedded&&<div className="fleet-editor-head"><div><span className="fleet-eyebrow">{existing?'EDIT UNIT':'NEW UNIT'}</span><h2>{existing?`Unit ${existing.unit_number}`:'Add fleet unit'}</h2></div><button type="button" className="fleet-icon-button" onClick={onClose}><X size={19}/></button></div>}
    {error&&<div className="fleet-message">{error}</div>}
    <EditorSection title="Unit identity">
      <Field label="Unit number"><input value={f.unit_number} onChange={e=>setF({...f,unit_number:e.target.value})} required/></Field>
      <Field label="Unit name"><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="e.g. Tridem Hydrovac"/></Field>
      <Field label="Type"><select value={f.vehicle_type} onChange={e=>setF({...f,vehicle_type:e.target.value})}>{VEHICLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="Status"><select value={f.status} onChange={e=>setF({...f,status:e.target.value})}>{STATUS_OPTIONS.map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></Field>
      <Field label="Year"><input type="number" min="1900" max="2100" value={f.year} onChange={e=>setF({...f,year:e.target.value})}/></Field>
      <Field label="Make"><input value={f.make} onChange={e=>setF({...f,make:e.target.value})}/></Field>
      <Field label="Model"><input value={f.model} onChange={e=>setF({...f,model:e.target.value})}/></Field>
      <Field label="Colour"><input value={f.color} onChange={e=>setF({...f,color:e.target.value})}/></Field>
      <Field label="VIN" wide><input value={f.vin} onChange={e=>setF({...f,vin:e.target.value.toUpperCase()})} maxLength={40}/></Field>
      <Field label="Plate"><input value={f.plate} onChange={e=>setF({...f,plate:e.target.value.toUpperCase()})}/></Field>
      <Field label="Primary operator"><select value={f.primary_operator_id} onChange={e=>setF({...f,primary_operator_id:e.target.value})}><option value="">Not assigned</option>{ws.employees.filter(e=>e.status==='active').map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.position?` · ${e.position}`:''}</option>)}</select></Field>
    </EditorSection>
    <EditorSection title="Meters">
      <Field label="Odometer (km)"><input type="number" min="0" step="1" value={f.odometer_km} onChange={e=>setF({...f,odometer_km:e.target.value})}/></Field>
      <Field label="Engine hours"><input type="number" min="0" step=".1" value={f.engine_hours} onChange={e=>setF({...f,engine_hours:e.target.value})}/></Field>
    </EditorSection>
    <EditorSection title="Compliance dates">
      <Field label="Registration expiry"><input type="date" value={f.registration_expiry} onChange={e=>setF({...f,registration_expiry:e.target.value})}/></Field>
      <Field label="Insurance expiry"><input type="date" value={f.insurance_expiry} onChange={e=>setF({...f,insurance_expiry:e.target.value})}/></Field>
      <Field label="Annual inspection expiry"><input type="date" value={f.annual_inspection_expiry} onChange={e=>setF({...f,annual_inspection_expiry:e.target.value})}/></Field>
    </EditorSection>
    <EditorSection title="Service schedule">
      <Field label="Last service"><input type="date" value={f.last_service_date} onChange={e=>setF({...f,last_service_date:e.target.value})}/></Field>
      <Field label="Next service date"><input type="date" value={f.next_service_date} onChange={e=>setF({...f,next_service_date:e.target.value})}/></Field>
      <Field label="Next service odometer (km)"><input type="number" min="0" value={f.next_service_odometer_km} onChange={e=>setF({...f,next_service_odometer_km:e.target.value})}/></Field>
      <Field label="Next service engine hours"><input type="number" min="0" step=".1" value={f.next_service_engine_hours} onChange={e=>setF({...f,next_service_engine_hours:e.target.value})}/></Field>
    </EditorSection>
    <div className="fleet-editor-section"><div className="fleet-section-title">Notes</div><Field label="Unit notes" wide><textarea rows={4} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="Known issues, equipment configuration, reminders…"/></Field></div>
    <div className="fleet-editor-actions"><button type="button" className="fleet-secondary" onClick={onClose}>Cancel</button><button className="fleet-primary" disabled={busy}><Save size={15}/>{busy?'Saving…':'Save unit'}</button></div>
  </form>
  if(embedded)return content
  return <div className="fleet-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="fleet-editor-modal">{content}</div></div>
}
function EditorSection({title,children}:{title:string;children:ReactNode}){return <div className="fleet-editor-section"><div className="fleet-section-title">{title}</div><div className="fleet-form-grid">{children}</div></div>}
function Field({label:caption,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={`fleet-field${wide?' wide':''}`}><span>{caption}</span>{children}</label>}

function ServiceRow({service}:{service:ServiceRecord}){
  return <article className="fleet-service-row">
    <div className="fleet-service-date"><History size={16}/><span>{formatDate(service.service_date)}</span></div>
    <div className="fleet-service-main"><strong>{service.summary}</strong><span>{service.service_type}{service.vendor?` · ${service.vendor}`:''}</span><small>{[service.odometer_km!==null?`${service.odometer_km.toLocaleString()} km`:null,service.engine_hours!==null?`${service.engine_hours.toLocaleString()} h`:null,service.work_order_number?`WO ${service.work_order_number}`:null].filter(Boolean).join(' · ')||'No meter or work order recorded'}</small>{service.notes&&<p>{service.notes}</p>}</div>
    {service.cost_cents!==null&&<div className="fleet-service-cost"><CircleDollarSign size={15}/><strong>{money(service.cost_cents)}</strong></div>}
  </article>
}
function ServiceEditor({vehicle,ws,onClose,onSaved}:{vehicle:Vehicle;ws:Workspace;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [f,setF]=useState({service_date:todayKey(),service_type:'Preventive Service',summary:'',odometer_km:asText(vehicle.odometer_km),engine_hours:asText(vehicle.engine_hours),vendor:'',work_order_number:'',cost:'',notes:''})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const save=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('')
    try{
      if(!f.summary.trim())throw new Error('Service summary is required.')
      const row:Omit<ServiceRecord,'id'|'organization_id'|'vehicle_id'>={service_date:f.service_date,service_type:f.service_type,summary:f.summary.trim(),odometer_km:asNumber(f.odometer_km),engine_hours:asNumber(f.engine_hours),vendor:asNullable(f.vendor),work_order_number:asNullable(f.work_order_number),cost_cents:f.cost.trim()===''?null:Math.round(Number(f.cost)*100),notes:asNullable(f.notes)}
      const vehicleUpdates:any={last_service_date:f.service_date}
      const odo=asNumber(f.odometer_km),hours=asNumber(f.engine_hours)
      if(odo!==null&&(vehicle.odometer_km===null||odo>=vehicle.odometer_km))vehicleUpdates.odometer_km=odo
      if(hours!==null&&(vehicle.engine_hours===null||hours>=vehicle.engine_hours))vehicleUpdates.engine_hours=hours
      if(ws.testMode){
        const records=readTestServices()
        localStorage.setItem(TEST_SERVICE_KEY,JSON.stringify([{...row,id:crypto.randomUUID(),organization_id:TEST_ORG.id,vehicle_id:vehicle.id,created_at:new Date().toISOString()},...records]))
        const vehicles=readTestData().vehicles.map(v=>v.id===vehicle.id?{...v,...vehicleUpdates}:v);writeTestVehicles(vehicles)
      }else{
        const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required.')
        const r=await db.from('fleet_service_records').insert({...row,organization_id:ws.organization!.id,vehicle_id:vehicle.id,created_by:u.user.id})
        if(r.error)throw r.error
        const vr=await db.from('fleet_vehicles').update(vehicleUpdates).eq('id',vehicle.id).eq('organization_id',ws.organization!.id)
        if(vr.error)throw vr.error
      }
      await onSaved()
    }catch(err){setError(readError(err))}finally{setBusy(false)}
  }
  return <div className="fleet-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="fleet-service-editor" onSubmit={save}>
    <div className="fleet-editor-head"><div><span className="fleet-eyebrow">MAINTENANCE</span><h2>Add service record</h2><p>Unit {vehicle.unit_number}</p></div><button type="button" className="fleet-icon-button" onClick={onClose}><X size={19}/></button></div>
    {error&&<div className="fleet-message">{error}</div>}
    <div className="fleet-form-grid">
      <Field label="Service date"><input type="date" value={f.service_date} onChange={e=>setF({...f,service_date:e.target.value})} required/></Field>
      <Field label="Service type"><select value={f.service_type} onChange={e=>setF({...f,service_type:e.target.value})}>{SERVICE_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="Summary" wide><input value={f.summary} onChange={e=>setF({...f,summary:e.target.value})} placeholder="e.g. 500 hour service and oil change" required/></Field>
      <Field label="Odometer (km)"><input type="number" min="0" value={f.odometer_km} onChange={e=>setF({...f,odometer_km:e.target.value})}/></Field>
      <Field label="Engine hours"><input type="number" min="0" step=".1" value={f.engine_hours} onChange={e=>setF({...f,engine_hours:e.target.value})}/></Field>
      <Field label="Vendor / shop"><input value={f.vendor} onChange={e=>setF({...f,vendor:e.target.value})}/></Field>
      <Field label="Work order"><input value={f.work_order_number} onChange={e=>setF({...f,work_order_number:e.target.value})}/></Field>
      <Field label="Cost (CAD)"><input type="number" min="0" step=".01" value={f.cost} onChange={e=>setF({...f,cost:e.target.value})}/></Field>
      <Field label="Notes" wide><textarea rows={4} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
    </div>
    <div className="fleet-editor-actions"><button type="button" className="fleet-secondary" onClick={onClose}>Cancel</button><button className="fleet-primary" disabled={busy}><Save size={15}/>{busy?'Saving…':'Save service'}</button></div>
  </form></div>
}
