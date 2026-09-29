import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Gauge, MapPin, Search, Truck, UserRound } from 'lucide-react'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess } from './workspace-access'
import { dispatchStageLabel, localDayKey } from './job-operations'
import './operations-calendar.css'

const db=supabase as any
const DISPATCH_ROLES=new Set(['owner','admin','supervisor','dispatcher'])
type Organization={id:string;name:string}
type Customer={id:string;name:string}
type Job={id:string;customer_id:string;job_number:string;title:string;site_name:string|null;site_address:string|null;shop_time:string|null;onsite_time:string|null;scheduled_start:string|null;scheduled_end:string|null;status:string;dispatch_stage:string}
type Assignment={job_id:string;employee_id:string|null;vehicle_id:string|null}
type Employee={id:string;first_name:string;last_name:string}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string}

function startOfWeek(date:Date){const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-d.getDay());return d}
function startOfMonth(date:Date){const d=new Date(date.getFullYear(),date.getMonth(),1);d.setHours(0,0,0,0);return d}
function addDays(date:Date,n:number){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function addMonths(date:Date,n:number){return new Date(date.getFullYear(),date.getMonth()+n,1)}
function jobDate(job:Job){return job.onsite_time||job.scheduled_start||job.shop_time}
function time(v:string|null){return v?new Intl.DateTimeFormat('en-CA',{hour:'numeric',minute:'2-digit'}).format(new Date(v)):'—'}

export default function OperationsCalendarPage(){
  const navigate=useNavigate()
  const [loading,setLoading]=useState(true),[org,setOrg]=useState<Organization|null>(null),[role,setRole]=useState(''),[customers,setCustomers]=useState<Customer[]>([]),[jobs,setJobs]=useState<Job[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[vehicles,setVehicles]=useState<Vehicle[]>([]),[cursor,setCursor]=useState(()=>new Date()),[view,setView]=useState<'week'|'month'>('week'),[stageFilter,setStageFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('active'),[customerFilter,setCustomerFilter]=useState('all'),[search,setSearch]=useState(''),[error,setError]=useState('')
  const load=useCallback(async()=>{setError('');try{const {data:s,error:se}=await supabase.auth.getSession();if(se)throw se;const user=s.session?.user;if(!user){setLoading(false);return}const access=await resolveWorkspaceAccess(user.id);if(access.kind!=='internal'){setLoading(false);return}const organization={id:access.organizationId,name:access.organizationName};setOrg(organization);setRole(access.roleKey);if(access.roleKey==='operator'){setLoading(false);return}
    const [c,j,a,e,v]=await Promise.all([
      db.from('customers').select('id,name').eq('organization_id',organization.id).neq('status','archived').order('name'),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status,dispatch_stage').eq('organization_id',organization.id).neq('status','cancelled'),
      db.from('dispatch_assignments').select('job_id,employee_id,vehicle_id').eq('organization_id',organization.id),
      db.from('employees').select('id,first_name,last_name').eq('organization_id',organization.id).neq('status','archived'),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type').eq('organization_id',organization.id).neq('status','archived'),
    ]);const er=c.error||j.error||a.error||e.error||v.error;if(er)setError(er.message);setCustomers(c.data||[]);setJobs(j.data||[]);setAssignments(a.data||[]);setEmployees(e.data||[]);setVehicles(v.data||[])
  }catch(e){setError(e instanceof Error?e.message:String((e as any)?.message||e))}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])

  const canDispatch=DISPATCH_ROLES.has(role)
  const filtered=useMemo(()=>{const needle=search.trim().toLowerCase();return jobs.filter(job=>{
    if(stageFilter!=='all'&&job.dispatch_stage!==stageFilter)return false
    if(statusFilter==='active'&&['completed','cancelled'].includes(job.status))return false
    if(statusFilter==='completed'&&job.status!=='completed')return false
    if(customerFilter!=='all'&&job.customer_id!==customerFilter)return false
    if(!needle)return true
    const customer=customers.find(item=>item.id===job.customer_id)?.name||''
    const rows=assignments.filter(item=>item.job_id===job.id)
    const crew=rows.map(item=>employees.find(employee=>employee.id===item.employee_id)).filter(Boolean).map(employee=>`${employee!.first_name} ${employee!.last_name}`).join(' ')
    const units=rows.map(item=>vehicles.find(vehicle=>vehicle.id===item.vehicle_id)).filter(Boolean).map(vehicle=>`${vehicle!.unit_number} ${vehicle!.name||vehicle!.vehicle_type}`).join(' ')
    return [job.job_number,job.title,job.site_name,job.site_address,customer,crew,units].filter(Boolean).join(' ').toLowerCase().includes(needle)
  })},[assignments,customerFilter,customers,employees,jobs,search,stageFilter,statusFilter,vehicles])
  const unscheduled=useMemo(()=>filtered.filter(j=>!jobDate(j)&&!['completed','cancelled'].includes(j.status)),[filtered])
  const weekStart=useMemo(()=>startOfWeek(cursor),[cursor]),weekDays=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart])
  const monthStart=useMemo(()=>startOfMonth(cursor),[cursor]),monthGridStart=useMemo(()=>startOfWeek(monthStart),[monthStart]),monthDays=useMemo(()=>Array.from({length:42},(_,i)=>addDays(monthGridStart,i)),[monthGridStart])
  const label=view==='week'?new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric'}).format(weekDays[0])+' – '+new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(weekDays[6]):new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric'}).format(cursor)
  const move=(dir:number)=>setCursor(view==='week'?addDays(cursor,dir*7):addMonths(cursor,dir))
  const jobsFor=(day:Date)=>filtered.filter(j=>{const value=jobDate(j);return value&&localDayKey(value)===localDayKey(day)}).sort((a,b)=>String(jobDate(a)).localeCompare(String(jobDate(b))))
  const openJob=(id:string)=>navigate(canDispatch?'/dispatch?job='+encodeURIComponent(id):'/jobs')
  if(loading)return <div className="calendar-loading">Loading calendar…</div>
  if(!org)return <Navigate to="/" replace/>
  if(role==='operator')return <Navigate to="/" replace/>

  return <div className="ops-calendar-shell"><aside className="ops-calendar-sidebar"><div className="ops-calendar-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{org.name}</small></span></div><nav><NavLink to="/"><Gauge size={18}/>Dashboard</NavLink><NavLink to="/calendar" className="active"><CalendarDays size={18}/>Calendar</NavLink>{canDispatch&&<NavLink to="/dispatch"><CalendarDays size={18}/>Dispatch</NavLink>}<NavLink to="/jobs"><BriefcaseBusiness size={18}/>Jobs</NavLink></nav></aside>
    <main className="ops-calendar-main"><header className="ops-calendar-header"><div className="ops-calendar-title"><CalendarDays size={22}/><div><h1>Operations Calendar</h1><span>{org.name}</span></div></div><div className="ops-calendar-controls"><button onClick={()=>setCursor(new Date())}>Today</button><button aria-label="Previous period" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><button aria-label="Next period" onClick={()=>move(1)}><ChevronRight size={18}/></button><strong>{label}</strong></div></header>
      <section className="calendar-toolbar">
        <div className="calendar-view-toggle"><button className={view==='week'?'active':''} onClick={()=>setView('week')}>Week</button><button className={view==='month'?'active':''} onClick={()=>setView('month')}>Month</button></div>
        <label className="calendar-search"><Search size={15}/><span>Search</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Job, site, crew or unit"/></label>
        <label><Filter size={15}/><span>Stage</span><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">All stages</option>{['unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed'].map(stage=><option key={stage} value={stage}>{dispatchStageLabel(stage)}</option>)}</select></label>
        <label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="active">Active work</option><option value="completed">Completed</option><option value="all">All work</option></select></label>
        <label><span>Customer</span><select value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}><option value="all">All customers</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <div className="calendar-unscheduled-count"><strong>{unscheduled.length}</strong><span>Unscheduled</span></div>
      </section>
      {error&&<div className="calendar-error">{error}</div>}
      {view==='week'?<section className="ops-week-grid responsive">{weekDays.map(day=><DayColumn key={localDayKey(day)} day={day} jobs={jobsFor(day)} today={localDayKey(day)===localDayKey(new Date())} customers={customers} assignments={assignments} employees={employees} vehicles={vehicles} onOpen={openJob}/>)}</section>
      :<section className="ops-month-grid">{monthDays.map(day=>{const dayJobs=jobsFor(day),outside=day.getMonth()!==cursor.getMonth(),today=localDayKey(day)===localDayKey(new Date());return <div className={'ops-month-day'+(outside?' outside':'')+(today?' today':'')} key={localDayKey(day)}><header><span>{new Intl.DateTimeFormat('en-CA',{weekday:'short'}).format(day)}</span><strong>{day.getDate()}</strong></header><div>{dayJobs.slice(0,4).map(job=><button key={job.id} onClick={()=>openJob(job.id)} className={'month-event stage-'+job.dispatch_stage}><span>{time(job.onsite_time||job.scheduled_start||job.shop_time)}</span><strong>{job.title}</strong><small>{customers.find(c=>c.id===job.customer_id)?.name||'Customer'}</small></button>)}{dayJobs.length>4&&<button className="month-more" onClick={()=>{setCursor(day);setView('week')}}>+{dayJobs.length-4} more</button>}</div></div>})}</section>}
      {unscheduled.length>0&&<section className="calendar-unscheduled"><div><span>UNSCHEDULED</span><h2>Work without a date</h2><p>These jobs cannot appear in the calendar until a shop or on-site time is added.</p></div><div>{unscheduled.map(job=><button key={job.id} onClick={()=>openJob(job.id)}><span>{job.job_number}</span><strong>{job.title}</strong><small>{customers.find(c=>c.id===job.customer_id)?.name||'Customer'} · {dispatchStageLabel(job.dispatch_stage)}</small></button>)}</div></section>}
    </main>
  </div>
}

function DayColumn({day,jobs,today,customers,assignments,employees,vehicles,onOpen}:{day:Date;jobs:Job[];today:boolean;customers:Customer[];assignments:Assignment[];employees:Employee[];vehicles:Vehicle[];onOpen:(id:string)=>void}){
  return <div className={today?'ops-day today':'ops-day'}><div className="ops-day-head"><span>{new Intl.DateTimeFormat('en-CA',{weekday:'short'}).format(day)}</span><strong>{day.getDate()}</strong></div><div className="ops-day-events">{jobs.map(job=>{const rows=assignments.filter(a=>a.job_id===job.id),crew=rows.map(a=>employees.find(e=>e.id===a.employee_id)).filter(Boolean) as Employee[],units=rows.map(a=>vehicles.find(v=>v.id===a.vehicle_id)).filter(Boolean) as Vehicle[];return <button className={'ops-event stage-'+job.dispatch_stage} key={job.id} onClick={()=>onOpen(job.id)}><div className="ops-event-time"><span><Clock3 size={13}/>Shop {time(job.shop_time)}</span><span><MapPin size={13}/>Site {time(job.onsite_time||job.scheduled_start)}</span></div><strong>{job.title}</strong><small>{customers.find(c=>c.id===job.customer_id)?.name||'Unknown customer'}</small><em>{dispatchStageLabel(job.dispatch_stage)}</em><div className="ops-event-meta">{crew.length>0&&<span><UserRound size={12}/>{crew.map(e=>e.first_name).join(', ')}</span>}{units.length>0&&<span><Truck size={12}/>{units.map(v=>'#'+v.unit_number).join(', ')}</span>}</div></button>})}{!jobs.length&&<div className="ops-no-events">No jobs</div>}</div></div>
}
