import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess } from './workspace-access'
import { billingRole } from './billing-role'
import { csvDocument, financialSummary, inDateRange, localDate } from './reporting'
import './manager-reports.css'

const db=supabase as any
type Job={id:string;customer_id:string;job_number:string;title:string;status:string;scheduled_start:string|null;created_at:string}
type Invoice={id:string;job_id:string|null;customer_id:string;invoice_number:string;invoice_date:string;status:string;currency_code:string;total:number|string;amount_paid:number|string;credit_total?:number|string;balance_due:number|string}
type Named={id:string;name:string}
type Vehicle={id:string;unit_number:string;status:string}
type Employee={id:string;first_name:string;last_name:string;status:string}
type Assignment={id:string;job_id:string;employee_id:string|null;vehicle_id:string|null}
type Timesheet={id:string;employee_id:string;job_id:string|null;work_date:string;regular_hours:number|string;overtime_hours:number|string;status:string}
type WorkOrder={id:string;vehicle_id:string;completed_at:string|null;labour_cost_cents:number;parts_cost_cents:number;external_cost_cents:number;downtime_minutes:number;status:string}
type Credential={id:string;status:string;expires_on:string|null}
type Safety={id:string;job_id:string|null;created_at:string;status:string;form_type:string}
type Data={jobs:Job[];invoices:Invoice[];customers:Named[];vehicles:Vehicle[];employees:Employee[];assignments:Assignment[];timesheets:Timesheet[];workOrders:WorkOrder[];safety:Safety[];credentials:Credential[]}
const empty:Data={jobs:[],invoices:[],customers:[],vehicles:[],employees:[],assignments:[],timesheets:[],workOrders:[],safety:[],credentials:[]}
const money=(n:number,currency='CAD')=>new Intl.NumberFormat('en-CA',{style:'currency',currency}).format(n)

// Stable ID ordering and pagination avoid silently truncating a growing company at the API row limit.
async function allRows(table:string,columns:string,organizationId:string){
 const rows:any[]=[]
 for(let start=0;;start+=500){
  const result=await db.from(table).select(columns).eq('organization_id',organizationId).order('id').range(start,start+499)
  if(result.error)throw new Error(`${table}: ${result.error.message}`)
  rows.push(...result.data)
  if(result.data.length<500)return rows
 }
}
export default function ManagerReportsPage(){
 const [data,setData]=useState<Data>(empty),[name,setName]=useState('Northborn'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [canFinance,setCanFinance]=useState(false)
 const [start,setStart]=useState(()=>`${new Date().getFullYear()}-01-01`),[end,setEnd]=useState(()=>localDate()),[customer,setCustomer]=useState(''),[vehicle,setVehicle]=useState('')
 useEffect(()=>{
  let active=true
  async function load(){
   setLoading(true);setError('')
   try{
    const {data:session,error:sessionError}=await supabase.auth.getSession()
    if(sessionError)throw sessionError
    if(!session.session)throw new Error('Sign in to view reports.')
    const access=await resolveWorkspaceAccess(session.session.user.id)
    if(access.kind!=='internal')throw new Error('Company access required.')
    const finance=Boolean(billingRole(access.roleKeys.map(key=>({role:{key}}))))
    const org=access.organizationId
    const [jobs,invoices,customers,vehicles,employees,assignments,timesheets,workOrders,safety,credentials]=await Promise.all([
     allRows('jobs','id,customer_id,job_number,title,status,scheduled_start,created_at',org),
     finance?allRows('invoices','id,job_id,customer_id,invoice_number,invoice_date,status,currency_code,total,amount_paid,credit_total,balance_due',org):Promise.resolve([]),
     allRows('customers','id,name',org),allRows('fleet_vehicles','id,unit_number,status',org),
     allRows('employees','id,first_name,last_name,status',org),allRows('dispatch_assignments','id,job_id,employee_id,vehicle_id',org),
     allRows('timesheet_entries','id,employee_id,job_id,work_date,regular_hours,overtime_hours,status',org),
     allRows('fleet_work_orders','id,vehicle_id,completed_at,labour_cost_cents,parts_cost_cents,external_cost_cents,downtime_minutes,status',org),
     allRows('safety_form_submissions','id,job_id,created_at,status,form_type',org),allRows('safety_credentials','id,status,expires_on',org)
    ])
    if(active){setData({jobs,invoices,customers,vehicles,employees,assignments,timesheets,workOrders,safety,credentials});setName(access.organizationName);setCanFinance(finance)}
   }catch(e){if(active){setData(empty);setError(e instanceof Error?e.message:String(e))}}
   finally{if(active)setLoading(false)}
  }
  void load();return()=>{active=false}
 },[revision])
 const selected=useMemo(()=>{
  const vehicleJobs=new Set(data.assignments.filter(a=>a.vehicle_id===vehicle).map(a=>a.job_id))
  const matchJob=(job:Job)=>(!customer||job.customer_id===customer)&&(!vehicle||vehicleJobs.has(job.id))
  const relatedJobs=new Set(data.jobs.filter(matchJob).map(j=>j.id))
  const jobs=data.jobs.filter(j=>matchJob(j)&&inDateRange(j.scheduled_start||j.created_at,start,end))
  const invoices=data.invoices.filter(i=>inDateRange(i.invoice_date,start,end)&&(!customer||i.customer_id===customer)&&(!vehicle||Boolean(i.job_id&&vehicleJobs.has(i.job_id))))
  const timesheets=data.timesheets.filter(t=>inDateRange(t.work_date,start,end)&&(!customer&&!vehicle||Boolean(t.job_id&&relatedJobs.has(t.job_id))))
  const safety=data.safety.filter(s=>inDateRange(s.created_at,start,end)&&(!customer&&!vehicle||Boolean(s.job_id&&relatedJobs.has(s.job_id))))
  const workOrders=data.workOrders.filter(w=>w.status==='completed'&&inDateRange(w.completed_at,start,end)&&(!vehicle||w.vehicle_id===vehicle))
  const jobIds=new Set(jobs.map(j=>j.id)),assignments=data.assignments.filter(a=>jobIds.has(a.job_id)&&(!vehicle||a.vehicle_id===vehicle))
  return {jobs,invoices,timesheets,safety,workOrders,assignments}
 },[data,start,end,customer,vehicle])
 const finances=financialSummary(selected.invoices)
 const approvedHours=selected.timesheets.filter(t=>t.status==='approved').reduce((sum,t)=>sum+Number(t.regular_hours)+Number(t.overtime_hours),0)
 const maintenance=selected.workOrders.reduce((sum,w)=>sum+Number(w.labour_cost_cents)+Number(w.parts_cost_cents)+Number(w.external_cost_cents),0)/100
 const validRange=!start||!end||start<=end
 const exportRows=()=>{
  const rows:unknown[][]=[['Northborn report',name],['From',start,'Through',end],['Customer',data.customers.find(c=>c.id===customer)?.name||'All'],['Unit',data.vehicles.find(v=>v.id===vehicle)?.unit_number||'All'],[],['Metric','Value'],['Jobs',selected.jobs.length],['Approved hours',approvedHours],['Safety submissions',selected.safety.length]]
  if(!customer)rows.push(['Completed maintenance cost CAD',maintenance])
  rows.push([],['Currency','Invoiced','Payments against selected invoices','Credits','Outstanding'])
  for(const f of finances)rows.push([f.currency,f.revenue,f.paid,f.credits,f.outstanding])
  rows.push([],['Invoice','Date','Currency','Status','Total','Paid','Credits','Balance'])
  for(const i of selected.invoices)rows.push([i.invoice_number,i.invoice_date,i.currency_code,i.status,i.total,i.amount_paid,i.credit_total||0,i.balance_due])
  const url=URL.createObjectURL(new Blob([csvDocument(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`northborn-report-${start||'all'}-${end||'all'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 if(loading)return <div className="center-screen" role="status">Building your operations report…</div>
 return <main className="reports-page">
  <header className="reports-hero"><div><span>REPORTS</span><h1>{name}</h1><p>Activity for the selected period. Results include only records your account can access.</p></div><button onClick={()=>setRevision(n=>n+1)}>Refresh</button></header>
  {error?<div className="reports-error" role="alert">{error}<p>Report unavailable. Refresh to retry; incomplete totals are not shown.</p></div>:<>
  <section className="reports-filters" aria-label="Report filters">
   <label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Through<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   <label>Customer<select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">All customers</option>{data.customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label>Unit<select value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">All units</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.unit_number}</option>)}</select></label>
   <button disabled={!validRange} onClick={exportRows}>Export CSV</button><button disabled={!validRange} onClick={()=>window.print()}>Print / Save PDF</button>
  </section>
  {!validRange?<p role="alert">The start date must be before the end date.</p>:<>
  <section className="reports-kpis">
   <Metric title="Jobs" value={selected.jobs.length} detail={`${selected.jobs.filter(j=>j.status==='completed').length} completed; grouped by scheduled start, or creation date when unscheduled`}/>
   <Metric title="Approved hours" value={approvedHours.toFixed(2)} detail={`${selected.timesheets.filter(t=>t.status==='submitted').length} timesheets awaiting review`}/>
   <Metric title="Units used" value={new Set(selected.assignments.map(a=>a.vehicle_id).filter(Boolean)).size} detail="Distinct units assigned to jobs starting in this period"/>
   <Metric title="Employees assigned" value={new Set(selected.assignments.map(a=>a.employee_id).filter(Boolean)).size} detail="Distinct employees assigned to selected jobs"/>
   <Metric title="Safety submissions" value={selected.safety.length} detail={`${selected.safety.filter(s=>s.status==='reviewed').length} reviewed`}/>
   {!customer&&<Metric title="Completed maintenance" value={money(maintenance)} detail={`${(selected.workOrders.reduce((s,w)=>s+Number(w.downtime_minutes),0)/60).toFixed(1)} hours recorded downtime; CAD costs`}/>}
  </section>
  {canFinance&&<section className="reports-card"><h2>Billing by currency</h2><p>Invoice-date basis. Payments are amounts applied to these invoices, not cash received during this date range. Drafts and voids excluded.</p>{finances.length?finances.map(f=><div className="reports-status-list" key={f.currency}><h3>{f.currency}</h3><div><span>Invoiced</span><strong>{money(f.revenue,f.currency)}</strong></div><div><span>Payments applied</span><strong>{money(f.paid,f.currency)}</strong></div><div><span>Credits applied</span><strong>{money(f.credits,f.currency)}</strong></div><div><span>Outstanding</span><strong>{money(f.outstanding,f.currency)}</strong></div></div>):<p>No issued invoices match these filters.</p>}</section>}
  <section className="reports-card"><h2>Customer activity</h2><div className="reports-table-wrap"><table><thead><tr><th>Customer</th><th>Jobs</th><th>Completed</th></tr></thead><tbody>{data.customers.filter(c=>!customer||c.id===customer).map(c=>{const jobs=selected.jobs.filter(j=>j.customer_id===c.id);return jobs.length?<tr key={c.id}><td>{c.name}</td><td>{jobs.length}</td><td>{jobs.filter(j=>j.status==='completed').length}</td></tr>:null})}</tbody></table></div></section>
  <section className="reports-card"><h2>Employee hours</h2><p>Approved timesheets in the selected period.</p><div className="reports-table-wrap"><table><thead><tr><th>Employee</th><th>Regular hours</th><th>Overtime hours</th></tr></thead><tbody>{data.employees.map(employee=>{const entries=selected.timesheets.filter(t=>t.employee_id===employee.id&&t.status==='approved');return entries.length?<tr key={employee.id}><td>{employee.first_name} {employee.last_name}</td><td>{entries.reduce((sum,t)=>sum+Number(t.regular_hours),0).toFixed(2)}</td><td>{entries.reduce((sum,t)=>sum+Number(t.overtime_hours),0).toFixed(2)}</td></tr>:null})}</tbody></table></div></section>
  <section className="reports-card"><h2>Current operational health</h2><p>Current status, independent of the date filter.</p><div className="reports-status-list"><div><span>Available units</span><strong>{data.vehicles.filter(v=>v.status==='available'&&(!vehicle||v.id===vehicle)).length}</strong></div><div><span>Active employees</span><strong>{data.employees.filter(e=>e.status==='active').length}</strong></div><div><span>Expired safety credentials</span><strong>{data.credentials.filter(c=>c.status==='expired'||Boolean(c.expires_on&&c.expires_on<localDate())).length}</strong></div></div></section>
  {customer&&<p>Maintenance costs are not allocated to customers because work orders have no customer cost allocation.</p>}
  </>}
  </>}
 </main>
}
function Metric({title,value,detail}:{title:string;value:string|number;detail:string}){return <article className="reports-kpi"><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>}
