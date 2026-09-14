import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BriefcaseBusiness, CalendarDays, CheckCircle2, ContactRound, Gauge, HardHat,
  ReceiptText, ShieldCheck, Truck, UserRound, Users, Wrench, Plus, Clock3, MapPin,
  Building2, ChevronRight, ClipboardCheck, Activity, Eye,
} from 'lucide-react'
import './test-workspace.css'

const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_INVOICES_KEY = 'northborn_test_invoices_v1'

type Customer = { id:string; organization_id:string; name:string; billing_email:string|null; phone:string|null; address:string|null; notes:string|null; status:string }
type Employee = { id:string; organization_id:string; user_id?:string|null; first_name:string; last_name:string; email:string|null; phone:string|null; position:string|null; status:string }
type Vehicle = { id:string; organization_id:string; unit_number:string; name:string|null; vehicle_type:string; plate:string|null; status:string }
type Job = { id:string; organization_id:string; customer_id:string; job_number:string; title:string; site_name:string|null; site_address:string|null; scheduled_start:string|null; scheduled_end:string|null; status:string; notes:string|null; shop_time?:string|null; onsite_time?:string|null; completed_at?:string|null }
type Assignment = { id:string; organization_id:string; job_id:string; employee_id:string|null; vehicle_id:string|null; role:string|null }
type TestData = { customers:Customer[]; employees:Employee[]; vehicles:Vehicle[]; jobs:Job[]; assignments:Assignment[] }
type Section = 'home'|'jobs'|'dispatch'|'calendar'|'customers'|'operator'|'client'

type Invoice = { id:string; invoice_number:string; status:string; total:number; balance_due?:number; customer_id?:string; invoice_date?:string; due_date?:string }

const ORG_ID = '00000000-0000-0000-0000-000000000001'
const uid = () => crypto.randomUUID()

function seedData(): TestData {
  const customer = uid(), employee = uid(), swamper = uid(), vehicle = uid(), spare = uid(), job = uid()
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000)
  return {
    customers: [{ id:customer, organization_id:ORG_ID, name:'Demo Energy Services', billing_email:'billing@demoenergy.ca', phone:'403-555-0100', address:'Red Deer, AB', notes:'Northborn test client', status:'active' }],
    employees: [
      { id:employee, organization_id:ORG_ID, user_id:'test-admin', first_name:'Garrett', last_name:'Tester', email:'admin@northborn.test', phone:'403-555-0111', position:'Operator', status:'active' },
      { id:swamper, organization_id:ORG_ID, user_id:null, first_name:'Test', last_name:'Swamper', email:null, phone:null, position:'Swamper', status:'active' },
    ],
    vehicles: [
      { id:vehicle, organization_id:ORG_ID, unit_number:'101', name:'Hydrovac 101', vehicle_type:'Hydrovac', plate:'TEST101', status:'assigned' },
      { id:spare, organization_id:ORG_ID, unit_number:'202', name:'Combo Vac 202', vehicle_type:'Combo Vac', plate:'TEST202', status:'available' },
    ],
    jobs: [{ id:job, organization_id:ORG_ID, customer_id:customer, job_number:`JOB-${String(new Date().getFullYear()).slice(-2)}001`, title:'Hydrovac daylighting demo job', site_name:'North Site', site_address:'Red Deer County, AB', scheduled_start:start.toISOString(), scheduled_end:end.toISOString(), shop_time:new Date(start.getTime() - 60 * 60 * 1000).toISOString(), onsite_time:start.toISOString(), status:'dispatched', notes:'Use this job to test the current Northborn workflow.' }],
    assignments: [
      { id:uid(), organization_id:ORG_ID, job_id:job, employee_id:employee, vehicle_id:null, role:'operator' },
      { id:uid(), organization_id:ORG_ID, job_id:job, employee_id:swamper, vehicle_id:null, role:'swamper' },
      { id:uid(), organization_id:ORG_ID, job_id:job, employee_id:null, vehicle_id:vehicle, role:'unit' },
    ],
  }
}

function readData(): TestData {
  try {
    const raw = localStorage.getItem(TEST_DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TestData>
      if (parsed.customers?.length && parsed.jobs && parsed.employees && parsed.vehicles && parsed.assignments) return parsed as TestData
    }
  } catch {}
  const seeded = seedData()
  localStorage.setItem(TEST_DATA_KEY, JSON.stringify(seeded))
  return seeded
}

function readInvoices(): Invoice[] {
  try { return JSON.parse(localStorage.getItem(TEST_INVOICES_KEY) || '[]') as Invoice[] } catch { return [] }
}

const nav = [
  ['Dashboard','/',Gauge], ['Calendar','/calendar',CalendarDays], ['Dispatch','/dispatch',CalendarDays],
  ['Jobs','/jobs',BriefcaseBusiness], ['Customers','/customers',ContactRound], ['Employees','/employees',Users],
  ['Fleet','/fleet',Truck], ['Fleet access','/fleet-access',ShieldCheck], ['Maintenance','/maintenance',Wrench],
  ['Safety','/safety',ClipboardCheck], ['Timesheets','/timesheets',HardHat], ['Invoices','/invoices',ReceiptText], ['Reports','/reports',Activity],
] as const

const fmt = (value:string|null|undefined) => value ? new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)) : 'Not set'
const money = (value:number) => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(value || 0)
const label = (value:string) => value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())

export default function TestWorkspacePage({ section='home' }:{ section?:Section }) {
  const [data,setData] = useState<TestData>(()=>readData())
  const [showAddJob,setShowAddJob] = useState(false)
  const [showAddClient,setShowAddClient] = useState(false)
  const [jobTitle,setJobTitle] = useState('')
  const [clientName,setClientName] = useState('')
  const [selectedEmployee,setSelectedEmployee] = useState<Record<string,string>>({})
  const [selectedVehicle,setSelectedVehicle] = useState<Record<string,string>>({})
  const invoices = useMemo(()=>readInvoices(),[data])

  const save = (next:TestData) => { localStorage.setItem(TEST_DATA_KEY,JSON.stringify(next)); setData(next) }
  const activeJobs = data.jobs.filter(j=>!['completed','cancelled'].includes(j.status))
  const completedJobs = data.jobs.filter(j=>j.status==='completed')
  const availableVehicles = data.vehicles.filter(v=>v.status==='available')

  const addJob = () => {
    if (!jobTitle.trim() || !data.customers.length) return
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const next:Job = { id:uid(), organization_id:ORG_ID, customer_id:data.customers[0].id, job_number:`JOB-${String(new Date().getFullYear()).slice(-2)}${String(data.jobs.length+1).padStart(3,'0')}`, title:jobTitle.trim(), site_name:'Demo Site', site_address:'Central Alberta', scheduled_start:start.toISOString(), scheduled_end:new Date(start.getTime()+8*60*60*1000).toISOString(), shop_time:new Date(start.getTime()-60*60*1000).toISOString(), onsite_time:start.toISOString(), status:'scheduled', notes:'Created from the universal admin test account.' }
    save({...data,jobs:[...data.jobs,next]});setJobTitle('');setShowAddJob(false)
  }

  const addClient = () => {
    if (!clientName.trim()) return
    const next:Customer = { id:uid(),organization_id:ORG_ID,name:clientName.trim(),billing_email:null,phone:null,address:null,notes:'Test client',status:'active' }
    save({...data,customers:[...data.customers,next]});setClientName('');setShowAddClient(false)
  }

  const completeJob = (jobId:string) => {
    const vehicleIds = data.assignments.filter(a=>a.job_id===jobId&&a.vehicle_id).map(a=>a.vehicle_id!)
    save({...data,jobs:data.jobs.map(j=>j.id===jobId?{...j,status:'completed',completed_at:new Date().toISOString()}:j),vehicles:data.vehicles.map(v=>vehicleIds.includes(v.id)?{...v,status:'available'}:v)})
  }

  const assign = (jobId:string) => {
    const employeeId = selectedEmployee[jobId]
    const vehicleId = selectedVehicle[jobId]
    const additions:Assignment[] = []
    if (employeeId && !data.assignments.some(a=>a.job_id===jobId&&a.employee_id===employeeId)) additions.push({id:uid(),organization_id:ORG_ID,job_id:jobId,employee_id:employeeId,vehicle_id:null,role:'crew'})
    if (vehicleId && !data.assignments.some(a=>a.job_id===jobId&&a.vehicle_id===vehicleId)) additions.push({id:uid(),organization_id:ORG_ID,job_id:jobId,employee_id:null,vehicle_id:vehicleId,role:'unit'})
    if (!additions.length) return
    save({...data,assignments:[...data.assignments,...additions],jobs:data.jobs.map(j=>j.id===jobId?{...j,status:'dispatched'}:j),vehicles:data.vehicles.map(v=>v.id===vehicleId?{...v,status:'assigned'}:v)})
  }

  return <div className="testws-shell">
    <aside className="testws-sidebar">
      <div className="testws-brand"><div>N</div><span><strong>NORTHBORN</strong><small>Universal test account</small></span></div>
      <div className="testws-badge">ADMIN TEST WORKSPACE</div>
      <nav>{nav.map(([name,path,Icon])=><NavLink key={path} to={path} end={path==='/' && section==='home'}><Icon size={18}/><span>{name}</span></NavLink>)}</nav>
    </aside>
    <main className="testws-main">
      <header className="testws-topbar"><div><span>TESTING</span><strong>{sectionTitle(section)}</strong></div><div className="testws-personas"><NavLink to="/test/manager">Manager</NavLink><NavLink to="/test/operator">Operator</NavLink><NavLink to="/test/client">Client</NavLink></div></header>
      {section==='home'&&<Home data={data} invoices={invoices} activeJobs={activeJobs.length} availableVehicles={availableVehicles.length}/>} 
      {section==='jobs'&&<Jobs data={data} activeJobs={activeJobs} completedJobs={completedJobs} showAddJob={showAddJob} setShowAddJob={setShowAddJob} jobTitle={jobTitle} setJobTitle={setJobTitle} addJob={addJob}/>} 
      {section==='dispatch'&&<Dispatch data={data} jobs={activeJobs} selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle} assign={assign} completeJob={completeJob}/>} 
      {section==='calendar'&&<Calendar data={data}/>} 
      {section==='customers'&&<Customers data={data} showAddClient={showAddClient} setShowAddClient={setShowAddClient} clientName={clientName} setClientName={setClientName} addClient={addClient}/>} 
      {section==='operator'&&<OperatorPreview data={data}/>} 
      {section==='client'&&<ClientPreview data={data} invoices={invoices}/>} 
    </main>
  </div>
}

function sectionTitle(section:Section){return({home:'Northborn Test HQ',jobs:'Jobs',dispatch:'Dispatch',calendar:'Operations Calendar',customers:'Customers',operator:'Operator Preview',client:'Client Preview'})[section]}

function Home({data,invoices,activeJobs,availableVehicles}:{data:TestData;invoices:Invoice[];activeJobs:number;availableVehicles:number}){
  const cards=[
    ['Dispatch','/dispatch','Live jobs, crews and units',CalendarDays],['Jobs','/jobs','Active and completed work',BriefcaseBusiness],['Customers','/customers','CRM and client records',ContactRound],['Fleet','/fleet','Units, inspections and defects',Truck],['Maintenance','/maintenance','Schedules and work orders',Wrench],['Invoices','/invoices','Billing and invoice workflow',ReceiptText],['Employee fleet access','/fleet-access','Truck access by employee',ShieldCheck],['Operator preview','/test/operator','Current employee-facing view',UserRound],['Client preview','/test/client','Jobs and billing from the client side',Building2],
  ] as const
  return <section className="testws-page"><div className="testws-hero"><div><span>ONE ACCOUNT, EVERY VIEW</span><h1>Everything we build should show up here.</h1><p>The admin test account is now the permanent Northborn testing hub. New manager features are linked here, with Operator and Client previews available without signing into another account.</p></div><Eye size={42}/></div>
    <div className="testws-metrics"><article><span>Active jobs</span><strong>{activeJobs}</strong></article><article><span>Clients</span><strong>{data.customers.length}</strong></article><article><span>Available units</span><strong>{availableVehicles}</strong></article><article><span>Invoices</span><strong>{invoices.length}</strong></article></div>
    <div className="testws-feature-grid">{cards.map(([name,path,desc,Icon])=><NavLink key={path} to={path}><div className="testws-feature-icon"><Icon size={20}/></div><div><strong>{name}</strong><span>{desc}</span></div><ChevronRight size={18}/></NavLink>)}</div>
    <div className="testws-rule"><CheckCircle2 size={18}/><div><strong>Testing rule going forward</strong><span>A Northborn feature is not considered finished until the admin test account can open it.</span></div></div>
  </section>
}

function Jobs({data,activeJobs,completedJobs,showAddJob,setShowAddJob,jobTitle,setJobTitle,addJob}:{data:TestData;activeJobs:Job[];completedJobs:Job[];showAddJob:boolean;setShowAddJob:(v:boolean)=>void;jobTitle:string;setJobTitle:(v:string)=>void;addJob:()=>void}){
  return <section className="testws-page"><div className="testws-page-head"><div><span>JOB BOARD</span><h1>Scheduled and completed work</h1></div><button className="testws-primary" onClick={()=>setShowAddJob(!showAddJob)}><Plus size={16}/>New test job</button></div>{showAddJob&&<div className="testws-inline-form"><input value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="Job title"/><button onClick={addJob}>Create</button></div>}<h2 className="testws-section-title">Active</h2><div className="testws-list">{activeJobs.map(job=><JobRow key={job.id} job={job} data={data}/>)}</div><h2 className="testws-section-title">Completed</h2><div className="testws-list">{completedJobs.map(job=><JobRow key={job.id} job={job} data={data}/>)}</div></section>
}

function JobRow({job,data}:{job:Job;data:TestData}){const customer=data.customers.find(c=>c.id===job.customer_id);return <article className="testws-job"><div><span>{job.job_number}</span><strong>{job.title}</strong><small>{customer?.name||'Unknown client'} · {job.site_name||job.site_address||'Site not set'}</small></div><div><span><Clock3 size={14}/>Shop {fmt(job.shop_time)}</span><span><MapPin size={14}/>Site {fmt(job.onsite_time||job.scheduled_start)}</span></div><em>{label(job.status)}</em></article>}

function Dispatch({data,jobs,selectedEmployee,setSelectedEmployee,selectedVehicle,setSelectedVehicle,assign,completeJob}:{data:TestData;jobs:Job[];selectedEmployee:Record<string,string>;setSelectedEmployee:(v:Record<string,string>)=>void;selectedVehicle:Record<string,string>;setSelectedVehicle:(v:Record<string,string>)=>void;assign:(id:string)=>void;completeJob:(id:string)=>void}){
  return <section className="testws-page"><div className="testws-page-head"><div><span>LIVE OPERATIONS</span><h1>Dispatch board</h1><p>Assign crew and units from the same admin test account.</p></div><NavLink className="testws-primary" to="/jobs"><Plus size={16}/>New job</NavLink></div><div className="testws-dispatch-grid">{jobs.map(job=>{const assignments=data.assignments.filter(a=>a.job_id===job.id);const crew=assignments.flatMap(a=>data.employees.filter(e=>e.id===a.employee_id));const units=assignments.flatMap(a=>data.vehicles.filter(v=>v.id===a.vehicle_id));return <article className="testws-dispatch-card" key={job.id}><div className="testws-dispatch-top"><div><span>{job.job_number}</span><h2>{job.title}</h2></div><em>{label(job.status)}</em></div><div className="testws-dispatch-meta"><span><UserRound size={15}/>{crew.length?crew.map(e=>e.first_name).join(', '):'No crew'}</span><span><Truck size={15}/>{units.length?units.map(v=>`#${v.unit_number}`).join(', '):'No unit'}</span></div><div className="testws-assign"><select value={selectedEmployee[job.id]||''} onChange={e=>setSelectedEmployee({...selectedEmployee,[job.id]:e.target.value})}><option value="">Add crew</option>{data.employees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select><select value={selectedVehicle[job.id]||''} onChange={e=>setSelectedVehicle({...selectedVehicle,[job.id]:e.target.value})}><option value="">Add unit</option>{data.vehicles.map(v=><option key={v.id} value={v.id}>#{v.unit_number} {v.name||v.vehicle_type}</option>)}</select><button onClick={()=>assign(job.id)}>Assign</button></div><button className="testws-complete" onClick={()=>completeJob(job.id)}><CheckCircle2 size={15}/>Mark completed</button></article>})}</div></section>
}

function Calendar({data}:{data:TestData}){
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+i);return d})
  return <section className="testws-page"><div className="testws-page-head"><div><span>OPERATIONS CALENDAR</span><h1>Next seven days</h1></div></div><div className="testws-calendar">{days.map(day=>{const key=day.toISOString().slice(0,10);const jobs=data.jobs.filter(j=>String(j.onsite_time||j.scheduled_start||'').slice(0,10)===key);return <article key={key}><header><span>{new Intl.DateTimeFormat('en-CA',{weekday:'short'}).format(day)}</span><strong>{day.getDate()}</strong></header>{jobs.map(j=><div className="testws-calendar-job" key={j.id}><b>{j.title}</b><small>{fmt(j.onsite_time||j.scheduled_start)}</small></div>)}{!jobs.length&&<small className="testws-muted">No jobs</small>}</article>})}</div></section>
}

function Customers({data,showAddClient,setShowAddClient,clientName,setClientName,addClient}:{data:TestData;showAddClient:boolean;setShowAddClient:(v:boolean)=>void;clientName:string;setClientName:(v:string)=>void;addClient:()=>void}){
  return <section className="testws-page"><div className="testws-page-head"><div><span>CRM</span><h1>Clients</h1><p>Current client records available to the universal test account.</p></div><button className="testws-primary" onClick={()=>setShowAddClient(!showAddClient)}><Plus size={16}/>Add test client</button></div>{showAddClient&&<div className="testws-inline-form"><input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Company name"/><button onClick={addClient}>Add</button></div>}<div className="testws-customer-grid">{data.customers.map(c=><article key={c.id}><Building2 size={20}/><div><strong>{c.name}</strong><span>{c.phone||'No main phone'}</span><small>{c.billing_email||'No billing email'}</small></div></article>)}</div></section>
}

function OperatorPreview({data}:{data:TestData}){
  const employee=data.employees[0];const assignment=data.assignments.find(a=>a.employee_id===employee?.id);const job=data.jobs.find(j=>j.id===assignment?.job_id);const unitAssignment=job?data.assignments.find(a=>a.job_id===job.id&&a.vehicle_id):null;const unit=data.vehicles.find(v=>v.id===unitAssignment?.vehicle_id)
  return <section className="testws-page"><div className="testws-role-banner"><UserRound size={26}/><div><span>PREVIEWING AS OPERATOR</span><h1>{employee?`${employee.first_name} ${employee.last_name}`:'Test Operator'}</h1></div></div><div className="testws-role-grid"><article><span>Current job</span><strong>{job?.title||'No assigned job'}</strong><small>{job?.site_name||job?.site_address||'No site'}</small></article><article><span>Assigned unit</span><strong>{unit?`Unit ${unit.unit_number}`:'No unit assigned'}</strong><small>{unit?.name||unit?.vehicle_type||''}</small></article><article><span>On site</span><strong>{fmt(job?.onsite_time||job?.scheduled_start)}</strong><small>Operator only sees the work and equipment they need.</small></article></div><div className="testws-feature-grid"><NavLink to="/fleet"><Truck size={20}/><div><strong>My unit</strong><span>Inspections, defects and fleet reporting</span></div><ChevronRight size={18}/></NavLink><NavLink to="/"><Gauge size={20}/><div><strong>Back to manager</strong><span>Return to the admin testing hub</span></div><ChevronRight size={18}/></NavLink></div></section>
}

function ClientPreview({data,invoices}:{data:TestData;invoices:Invoice[]}){
  const customer=data.customers[0];const jobs=data.jobs.filter(j=>j.customer_id===customer?.id);const now=Date.now();const future=jobs.filter(j=>new Date(j.onsite_time||j.scheduled_start||0).getTime()>now&&!['completed','cancelled'].includes(j.status));const active=jobs.filter(j=>['dispatched','in_progress'].includes(j.status));const past=jobs.filter(j=>j.status==='completed');const outstanding=invoices.reduce((sum,i)=>sum+Number(i.balance_due??(i.status==='paid'?0:i.total||0)),0)
  return <section className="testws-page"><div className="testws-role-banner"><Building2 size={26}/><div><span>PREVIEWING AS CLIENT</span><h1>{customer?.name||'Demo Client'}</h1></div></div><div className="testws-metrics"><article><span>Active jobs</span><strong>{active.length}</strong></article><article><span>Future jobs</span><strong>{future.length}</strong></article><article><span>Past jobs</span><strong>{past.length}</strong></article><article><span>Outstanding</span><strong>{money(outstanding)}</strong></article></div><h2 className="testws-section-title">Jobs visible to client</h2><div className="testws-list">{jobs.map(j=><article className="testws-client-job" key={j.id}><div><strong>{j.title}</strong><span>{j.site_name||j.site_address||'Site not set'}</span></div><em>{label(j.status)}</em><small>On-site contact and client notes belong here. Internal work descriptions and swamper details stay hidden.</small></article>)}</div><div className="testws-rule"><ReceiptText size={18}/><div><strong>Client invoice area</strong><span>{invoices.length?`${invoices.length} test invoice${invoices.length===1?'':'s'} available.`:'Invoice access is being connected to the client portal next.'}</span></div></div></section>
}
