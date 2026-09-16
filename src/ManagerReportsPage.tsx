import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BriefcaseBusiness, CheckCircle2, CircleDollarSign, Clock3, RefreshCw, ShieldCheck, Truck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './manager-reports.css'

const db = supabase as any

type Job = { id:string; status:string; scheduled_start:string|null; created_at:string }
type Invoice = { id:string; status:string; invoice_date:string; total:number|string; balance_due:number|string }
type Vehicle = { id:string; status:string }
type Employee = { id:string; status:string }
type Credential = { id:string; status:string; expires_on:string|null }
type Assignment = { job_id:string }

type ReportData = {
  organizationName:string
  jobs:Job[]
  invoices:Invoice[]
  vehicles:Vehicle[]
  employees:Employee[]
  credentials:Credential[]
  assignments:Assignment[]
}

const EMPTY:ReportData = { organizationName:'Northborn', jobs:[], invoices:[], vehicles:[], employees:[], credentials:[], assignments:[] }
const money = (value:number) => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(value)
const label = (value:string) => value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())

export default function ManagerReportsPage(){
  const [data,setData]=useState<ReportData>(EMPTY)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data:sessionData}=await supabase.auth.getSession()
    const userId=sessionData.session?.user.id
    if(!userId){setError('Sign in to view reports.');setLoading(false);return}

    const membership=await db.from('organization_members').select('organization_id,organization:organizations(name)').eq('user_id',userId).eq('status','active').limit(1).maybeSingle()
    if(membership.error||!membership.data?.organization_id){setError(membership.error?.message||'No active organization was found.');setLoading(false);return}
    const organizationId=membership.data.organization_id
    const organizationName=membership.data.organization?.name||'Northborn'

    const [jobs,invoices,vehicles,employees,credentials,assignments]=await Promise.all([
      db.from('jobs').select('id,status,scheduled_start,created_at').eq('organization_id',organizationId),
      db.from('invoices').select('id,status,invoice_date,total,balance_due').eq('organization_id',organizationId),
      db.from('fleet_vehicles').select('id,status').eq('organization_id',organizationId),
      db.from('employees').select('id,status').eq('organization_id',organizationId),
      db.from('safety_credentials').select('id,status,expires_on').eq('organization_id',organizationId),
      db.from('dispatch_assignments').select('job_id').eq('organization_id',organizationId),
    ])
    const firstError=[jobs,invoices,vehicles,employees,credentials,assignments].find(result=>result.error)?.error
    if(firstError){setError(firstError.message);setLoading(false);return}
    setData({organizationName,jobs:jobs.data||[],invoices:invoices.data||[],vehicles:vehicles.data||[],employees:employees.data||[],credentials:credentials.data||[],assignments:assignments.data||[]})
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const metrics=useMemo(()=>{
    const now=Date.now(), thirtyDays=now+30*24*60*60*1000
    const activeJobs=data.jobs.filter(job=>!['completed','cancelled'].includes(job.status))
    const assignedJobs=new Set(data.assignments.map(item=>item.job_id))
    const needsDispatch=activeJobs.filter(job=>!assignedJobs.has(job.id)).length
    const issued=data.invoices.filter(invoice=>!['draft','void'].includes(invoice.status))
    const totalRevenue=issued.reduce((sum,invoice)=>sum+Number(invoice.total||0),0)
    const outstanding=issued.reduce((sum,invoice)=>sum+Number(invoice.balance_due||0),0)
    const paid=data.invoices.filter(invoice=>invoice.status==='paid').reduce((sum,invoice)=>sum+Number(invoice.total||0),0)
    const availableUnits=data.vehicles.filter(vehicle=>vehicle.status==='available').length
    const maintenanceUnits=data.vehicles.filter(vehicle=>['maintenance','out_of_service'].includes(vehicle.status)).length
    const activeStaff=data.employees.filter(employee=>employee.status==='active').length
    const expiring=data.credentials.filter(item=>item.expires_on&&new Date(item.expires_on).getTime()>=now&&new Date(item.expires_on).getTime()<=thirtyDays).length
    const expired=data.credentials.filter(item=>item.status==='expired'||(item.expires_on&&new Date(item.expires_on).getTime()<now)).length
    return {activeJobs,needsDispatch,totalRevenue,outstanding,paid,availableUnits,maintenanceUnits,activeStaff,expiring,expired}
  },[data])

  const monthly=useMemo(()=>{
    const now=new Date()
    return Array.from({length:6},(_,index)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(5-index),1)
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const total=data.invoices.filter(invoice=>invoice.invoice_date?.startsWith(key)&&!['draft','void'].includes(invoice.status)).reduce((sum,invoice)=>sum+Number(invoice.total||0),0)
      return {key,label:new Intl.DateTimeFormat('en-CA',{month:'short'}).format(d),total}
    })
  },[data.invoices])
  const maxMonth=Math.max(...monthly.map(item=>item.total),1)

  const statuses=useMemo(()=>{
    const values=new Map<string,number>()
    data.jobs.forEach(job=>values.set(job.status,(values.get(job.status)||0)+1))
    return [...values.entries()].sort((a,b)=>b[1]-a[1])
  },[data.jobs])

  if(loading)return <div className="center-screen">Building your operations report…</div>

  return <section className="reports-page">
    <div className="reports-hero"><div><span>REPORTS</span><h1>{data.organizationName}</h1><p>A fast operational snapshot of work, revenue, fleet, people and safety.</p></div><button type="button" onClick={()=>void load()}><RefreshCw size={17}/>Refresh</button></div>
    {error&&<div className="reports-error">{error}</div>}

    <div className="reports-kpis">
      <ReportKpi icon={<BriefcaseBusiness/>} label="Active jobs" value={String(metrics.activeJobs.length)} detail={`${metrics.needsDispatch} need dispatch`} to="/jobs"/>
      <ReportKpi icon={<CircleDollarSign/>} label="Issued revenue" value={money(metrics.totalRevenue)} detail={`${money(metrics.outstanding)} outstanding`} to="/invoices"/>
      <ReportKpi icon={<CheckCircle2/>} label="Paid" value={money(metrics.paid)} detail="Paid invoices" to="/invoices"/>
      <ReportKpi icon={<Truck/>} label="Available units" value={String(metrics.availableUnits)} detail={`${metrics.maintenanceUnits} unavailable`} to="/fleet"/>
      <ReportKpi icon={<Users/>} label="Active staff" value={String(metrics.activeStaff)} detail={`${data.employees.length} employee records`} to="/employees"/>
      <ReportKpi icon={<ShieldCheck/>} label="Safety attention" value={String(metrics.expired+metrics.expiring)} detail={`${metrics.expired} expired, ${metrics.expiring} due soon`} to="/safety"/>
    </div>

    <div className="reports-grid">
      <section className="reports-card reports-chart"><div className="reports-card-head"><div><span>LAST 6 MONTHS</span><h2>Invoice activity</h2></div><Activity size={21}/></div><div className="reports-bars">{monthly.map(item=><div className="reports-bar-col" key={item.key}><strong>{item.total?money(item.total):'$0'}</strong><div className="reports-bar-track"><i style={{height:`${Math.max(4,(item.total/maxMonth)*100)}%`}}/></div><span>{item.label}</span></div>)}</div></section>
      <section className="reports-card"><div className="reports-card-head"><div><span>WORKLOAD</span><h2>Jobs by status</h2></div><Clock3 size={21}/></div><div className="reports-status-list">{statuses.length?statuses.map(([status,count])=><div key={status}><span>{label(status)}</span><strong>{count}</strong></div>):<div className="reports-empty">No jobs yet.</div>}</div></section>
    </div>

    <section className="reports-card reports-attention"><div className="reports-card-head"><div><span>ATTENTION</span><h2>What needs a look</h2></div><AlertTriangle size={21}/></div><div className="reports-attention-grid"><NavLink to="/dispatch"><strong>{metrics.needsDispatch}</strong><span>Active jobs without a crew or unit assignment</span></NavLink><NavLink to="/maintenance"><strong>{metrics.maintenanceUnits}</strong><span>Units in maintenance or out of service</span></NavLink><NavLink to="/safety"><strong>{metrics.expired}</strong><span>Expired safety credentials requiring attention</span></NavLink><NavLink to="/invoices"><strong>{money(metrics.outstanding)}</strong><span>Outstanding invoice balance</span></NavLink></div></section>
  </section>
}

function ReportKpi({icon,label,value,detail,to}:{icon:React.ReactNode;label:string;value:string;detail:string;to:string}){
  return <NavLink className="reports-kpi" to={to}><div className="reports-kpi-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></NavLink>
}
