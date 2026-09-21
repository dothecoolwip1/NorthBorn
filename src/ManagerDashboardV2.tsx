import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Banknote, BriefcaseBusiness, CalendarDays, CheckCircle2,
  ClipboardCheck, Clock3, FileClock, Gauge, ReceiptText, RefreshCw, ShieldAlert, Truck,
  Users, Wrench,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess } from './workspace-access'
import './manager-dashboard-v2.css'

const db=supabase as any
const BILLING_ROLES=new Set(['owner','admin','accounting'])
const TICKET_REVIEW_ROLES=new Set(['owner','admin','supervisor','dispatcher','accounting'])
const TIMESHEET_MANAGE_ROLES=new Set(['owner','admin','supervisor','accounting'])
const OPS_ROLES=new Set(['owner','admin','supervisor','dispatcher','safety','mechanic'])
const DISPATCH_ROLES=new Set(['owner','admin','supervisor','dispatcher'])
const FLEET_ROLES=new Set(['owner','admin','supervisor','dispatcher','safety','mechanic'])

type Organization={id:string;name:string}
type Customer={id:string;name:string}
type Employee={id:string;first_name:string;last_name:string;position:string|null;status:string}
type Job={id:string;customer_id:string;job_number:string;title:string;site_name:string|null;site_address:string|null;shop_time:string|null;onsite_time:string|null;scheduled_start:string|null;scheduled_end:string|null;status:string;dispatch_stage:string}
type Assignment={id:string;job_id:string;employee_id:string|null;vehicle_id:string|null;role:string|null}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string;status:string;odometer_km:number|null;engine_hours:number|string|null}
type Ticket={id:string;ticket_number:string;job_id:string|null;customer_id:string;work_date:string;work_description:string|null;status:string;invoice_id:string|null;customer_signed_at:string|null;reviewed_at:string|null}
type Invoice={id:string;invoice_number:string;customer_id:string;status:string;invoice_date:string;due_date:string|null;total:number|string;balance_due:number|string|null}
type Timesheet={id:string;employee_id:string;work_date:string;regular_hours:number|string;overtime_hours:number|string;status:string}
type Program={id:string;name:string;active:boolean;warning_days:number;warning_km:number;warning_engine_hours:number}
type MaintenanceAssignment={id:string;program_id:string;vehicle_id:string;active:boolean;next_due_date:string|null;next_due_odometer_km:number|null;next_due_engine_hours:number|string|null}
type Defect={id:string;vehicle_id:string;title:string;severity:string;status:string;out_of_service:boolean;reported_at:string}
type WorkOrder={id:string;vehicle_id:string;work_order_number:string;title:string;priority:string;status:string;scheduled_date:string|null}

type Workspace={
  organization:Organization|null
  roleKey:string
  customers:Customer[]
  employees:Employee[]
  jobs:Job[]
  assignments:Assignment[]
  vehicles:Vehicle[]
  tickets:Ticket[]
  invoices:Invoice[]
  timesheets:Timesheet[]
  programs:Program[]
  maintenanceAssignments:MaintenanceAssignment[]
  defects:Defect[]
  workOrders:WorkOrder[]
}

const EMPTY:Workspace={organization:null,roleKey:'',customers:[],employees:[],jobs:[],assignments:[],vehicles:[],tickets:[],invoices:[],timesheets:[],programs:[],maintenanceAssignments:[],defects:[],workOrders:[]}
const num=(value:unknown)=>Number(value||0)
const currency=(value:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(value)
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const localDay=(date=new Date())=>{const copy=new Date(date.getTime()-date.getTimezoneOffset()*60000);return copy.toISOString().slice(0,10)}
const timeLabel=(value:string|null,withDate=false)=>value?new Intl.DateTimeFormat('en-CA',withDate?{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}:{hour:'numeric',minute:'2-digit'}).format(new Date(value)):'Time not set'
const valueDay=(value:string|null)=>value?localDay(new Date(value)):null
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Something went wrong.')

function maintenanceState(assignment:MaintenanceAssignment,program:Program,vehicle:Vehicle){
  if(!assignment.active||!program.active)return 'ok' as const
  const today=localDay()
  if(assignment.next_due_date&&assignment.next_due_date<=today)return 'danger' as const
  if(assignment.next_due_odometer_km!==null&&vehicle.odometer_km!==null&&vehicle.odometer_km>=assignment.next_due_odometer_km)return 'danger' as const
  if(assignment.next_due_engine_hours!==null&&vehicle.engine_hours!==null&&num(vehicle.engine_hours)>=num(assignment.next_due_engine_hours))return 'danger' as const
  if(assignment.next_due_date){const days=Math.ceil((new Date(`${assignment.next_due_date}T12:00:00`).getTime()-new Date(`${today}T12:00:00`).getTime())/86400000);if(days<=program.warning_days)return 'warn' as const}
  if(assignment.next_due_odometer_km!==null&&vehicle.odometer_km!==null&&assignment.next_due_odometer_km-vehicle.odometer_km<=program.warning_km)return 'warn' as const
  if(assignment.next_due_engine_hours!==null&&vehicle.engine_hours!==null&&num(assignment.next_due_engine_hours)-num(vehicle.engine_hours)<=program.warning_engine_hours)return 'warn' as const
  return 'ok' as const
}

export default function ManagerDashboardV2(){
  const [workspace,setWorkspace]=useState<Workspace>(EMPTY)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [refreshedAt,setRefreshedAt]=useState<Date|null>(null)

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const {data:sessionData,error:sessionError}=await supabase.auth.getSession()
      if(sessionError)throw sessionError
      const user=sessionData.session?.user
      if(!user){setWorkspace(EMPTY);setLoading(false);return}
      const access=await resolveWorkspaceAccess(user.id)
      if(access.kind!=='internal'){setWorkspace(EMPTY);setLoading(false);return}
      const roleKey=access.roleKey
      const organization:Organization={id:access.organizationId,name:access.organizationName}
      if(roleKey==='operator'){setWorkspace({...EMPTY,organization,roleKey});setLoading(false);return}

      const noQuery=()=>Promise.resolve({data:[],error:null})
      const wantsOps=OPS_ROLES.has(roleKey)
      const wantsFleet=FLEET_ROLES.has(roleKey)
      const wantsBilling=BILLING_ROLES.has(roleKey)
      const wantsTicketReview=TICKET_REVIEW_ROLES.has(roleKey)||roleKey==='safety'
      const wantsTimesheets=TIMESHEET_MANAGE_ROLES.has(roleKey)||['dispatcher','safety'].includes(roleKey)

      const [customers,employees,jobs,assignments,vehicles,tickets,invoices,timesheets,programs,maintenanceAssignments,defects,workOrders]=await Promise.all([
        db.from('customers').select('id,name').eq('organization_id',organization.id).neq('status','archived').order('name'),
        db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id',organization.id).neq('status','archived').order('last_name'),
        wantsOps?db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status,dispatch_stage').eq('organization_id',organization.id).order('scheduled_start',{ascending:true,nullsFirst:false}).limit(500):noQuery(),
        wantsOps?db.from('dispatch_assignments').select('id,job_id,employee_id,vehicle_id,role').eq('organization_id',organization.id):noQuery(),
        wantsFleet?db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status,odometer_km,engine_hours').eq('organization_id',organization.id).neq('status','archived').order('unit_number'):noQuery(),
        wantsTicketReview||wantsBilling?db.from('field_tickets').select('id,ticket_number,job_id,customer_id,work_date,work_description,status,invoice_id,customer_signed_at,reviewed_at').eq('organization_id',organization.id).order('work_date',{ascending:false}).limit(500):noQuery(),
        wantsBilling?db.from('invoices').select('id,invoice_number,customer_id,status,invoice_date,due_date,total,balance_due').eq('organization_id',organization.id).order('invoice_date',{ascending:false}).limit(500):noQuery(),
        wantsTimesheets?db.from('timesheet_entries').select('id,employee_id,work_date,regular_hours,overtime_hours,status').eq('organization_id',organization.id).order('work_date',{ascending:false}).limit(500):noQuery(),
        wantsFleet?db.from('fleet_maintenance_programs').select('id,name,active,warning_days,warning_km,warning_engine_hours').eq('organization_id',organization.id):noQuery(),
        wantsFleet?db.from('fleet_maintenance_assignments').select('id,program_id,vehicle_id,active,next_due_date,next_due_odometer_km,next_due_engine_hours').eq('organization_id',organization.id):noQuery(),
        wantsFleet?db.from('fleet_defects').select('id,vehicle_id,title,severity,status,out_of_service,reported_at').eq('organization_id',organization.id).order('reported_at',{ascending:false}).limit(250):noQuery(),
        wantsFleet?db.from('fleet_work_orders').select('id,vehicle_id,work_order_number,title,priority,status,scheduled_date').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(250):noQuery(),
      ])

      const results=[customers,employees,jobs,assignments,vehicles,tickets,invoices,timesheets,programs,maintenanceAssignments,defects,workOrders]
      const firstError=results.find(result=>result.error)?.error
      if(firstError)setError(firstError.message)
      setWorkspace({organization,roleKey,customers:(customers.data||[]) as Customer[],employees:(employees.data||[]) as Employee[],jobs:(jobs.data||[]) as Job[],assignments:(assignments.data||[]) as Assignment[],vehicles:(vehicles.data||[]) as Vehicle[],tickets:(tickets.data||[]) as Ticket[],invoices:(invoices.data||[]) as Invoice[],timesheets:(timesheets.data||[]) as Timesheet[],programs:(programs.data||[]) as Program[],maintenanceAssignments:(maintenanceAssignments.data||[]) as MaintenanceAssignment[],defects:(defects.data||[]) as Defect[],workOrders:(workOrders.data||[]) as WorkOrder[]})
      setRefreshedAt(new Date())
    }catch(caught){setError(readError(caught))}finally{setLoading(false)}
  },[])

  useEffect(()=>{void load()},[load])

  const metrics=useMemo(()=>{
    const today=localDay()
    const activeJobs=workspace.jobs.filter(job=>!['completed','cancelled'].includes(job.status))
    const todayJobs=activeJobs.filter(job=>[job.onsite_time,job.scheduled_start,job.shop_time].some(value=>valueDay(value)===today))
    const upcomingJobs=activeJobs.filter(job=>{const value=job.onsite_time||job.scheduled_start||job.shop_time;return Boolean(value&&valueDay(value)!==today&&new Date(value).getTime()>Date.now())}).sort((a,b)=>String(a.onsite_time||a.scheduled_start||a.shop_time).localeCompare(String(b.onsite_time||b.scheduled_start||b.shop_time)))
    const needsDispatch=activeJobs.filter(job=>job.dispatch_stage==='unassigned')
    const readyToSend=activeJobs.filter(job=>job.dispatch_stage==='ready')
    const waitingAcknowledgement=activeJobs.filter(job=>job.dispatch_stage==='dispatched')
    const fieldActive=activeJobs.filter(job=>['acknowledged','en_route','onsite','work_started'].includes(job.dispatch_stage))
    const unscheduledJobs=activeJobs.filter(job=>!job.onsite_time&&!job.scheduled_start&&!job.shop_time)
    const now=Date.now()
    const overdueFieldStart=activeJobs.filter(job=>{
      const start=job.onsite_time||job.scheduled_start
      return Boolean(start&&new Date(start).getTime()<now&&!['onsite','work_started','work_completed'].includes(job.dispatch_stage))
    })
    const ticketsWaiting=workspace.tickets.filter(ticket=>ticket.status==='submitted')
    const readyToBill=workspace.tickets.filter(ticket=>ticket.status==='approved'&&!ticket.invoice_id)
    const submittedTimesheets=workspace.timesheets.filter(row=>row.status==='submitted')
    const outstandingInvoices=workspace.invoices.filter(invoice=>['issued','partially_paid','overdue'].includes(invoice.status))
    const outstandingBalance=outstandingInvoices.reduce((sum,invoice)=>sum+num(invoice.balance_due),0)
    const overdueInvoices=outstandingInvoices.filter(invoice=>invoice.status==='overdue'||Boolean(invoice.due_date&&invoice.due_date<today&&num(invoice.balance_due)>0))
    const availableVehicles=workspace.vehicles.filter(vehicle=>vehicle.status==='available')
    const openDefects=workspace.defects.filter(defect=>!['resolved','dismissed'].includes(defect.status))
    const outOfService=openDefects.filter(defect=>defect.out_of_service)
    const openWorkOrders=workspace.workOrders.filter(order=>!['completed','cancelled'].includes(order.status))
    const maintenanceRows=workspace.maintenanceAssignments.flatMap(assignment=>{
      const program=workspace.programs.find(item=>item.id===assignment.program_id),vehicle=workspace.vehicles.find(item=>item.id===assignment.vehicle_id)
      if(!program||!vehicle)return []
      return [{assignment,program,vehicle,state:maintenanceState(assignment,program,vehicle)}]
    })
    const maintenanceDue=maintenanceRows.filter(row=>row.state==='danger')
    const maintenanceSoon=maintenanceRows.filter(row=>row.state==='warn')
    return {today,activeJobs,todayJobs,upcomingJobs,needsDispatch,readyToSend,waitingAcknowledgement,fieldActive,unscheduledJobs,overdueFieldStart,ticketsWaiting,readyToBill,submittedTimesheets,outstandingInvoices,outstandingBalance,overdueInvoices,availableVehicles,openDefects,outOfService,openWorkOrders,maintenanceRows,maintenanceDue,maintenanceSoon}
  },[workspace])

  if(loading)return <div className="manager-home-loading">Loading Northborn command centre…</div>
  if(error&&!workspace.organization)return <div className="manager-home-loading"><div><strong>Workspace unavailable</strong><span>Northborn could not verify your dashboard access.</span><button type="button" onClick={()=>void load()}>Try again</button></div></div>
  if(!workspace.organization)return <Navigate to="/login" replace/>
  if(workspace.roleKey==='operator')return <Navigate to="/" replace/>

  const canBilling=BILLING_ROLES.has(workspace.roleKey)
  const canTicketReview=TICKET_REVIEW_ROLES.has(workspace.roleKey)
  const canTimesheetReview=TIMESHEET_MANAGE_ROLES.has(workspace.roleKey)
  const canOps=OPS_ROLES.has(workspace.roleKey)
  const canDispatch=DISPATCH_ROLES.has(workspace.roleKey)
  const canFleet=FLEET_ROLES.has(workspace.roleKey)
  const hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
  const attention=[
    ...(canDispatch&&metrics.needsDispatch.length?[{key:'dispatch',level:'urgent' as const,icon:Users,title:`${metrics.needsDispatch.length} job${metrics.needsDispatch.length===1?'':'s'} need resources`,copy:'Crew or unit assignments are incomplete.',to:'/dispatch'}]:[]),
    ...(canDispatch&&metrics.readyToSend.length?[{key:'ready',level:'warn' as const,icon:CalendarDays,title:`${metrics.readyToSend.length} job${metrics.readyToSend.length===1?'':'s'} ready to send`,copy:'Crew and units are assigned but Dispatch has not released them yet.',to:'/dispatch'}]:[]),
    ...(canDispatch&&metrics.waitingAcknowledgement.length?[{key:'ack',level:'warn' as const,icon:Clock3,title:`${metrics.waitingAcknowledgement.length} dispatch${metrics.waitingAcknowledgement.length===1?'':'es'} waiting acknowledgement`,copy:'The field operator has not acknowledged these dispatched jobs yet.',to:'/dispatch'}]:[]),
    ...(canDispatch&&metrics.overdueFieldStart.length?[{key:'late',level:'urgent' as const,icon:AlertTriangle,title:`${metrics.overdueFieldStart.length} job${metrics.overdueFieldStart.length===1?'':'s'} past on-site time`,copy:'Scheduled on-site time has passed without an on-site or work-started update.',to:'/dispatch'}]:[]),
    ...(canTicketReview&&metrics.ticketsWaiting.length?[{key:'tickets',level:'warn' as const,icon:ClipboardCheck,title:`${metrics.ticketsWaiting.length} ticket${metrics.ticketsWaiting.length===1?'':'s'} waiting review`,copy:'Submitted field work is waiting for office approval.',to:'/tickets'}]:[]),
    ...(canBilling&&metrics.readyToBill.length?[{key:'billing',level:'warn' as const,icon:ReceiptText,title:`${metrics.readyToBill.length} approved ticket${metrics.readyToBill.length===1?'':'s'} ready to bill`,copy:'Convert signed field work into invoice drafts.',to:'/billing'}]:[]),
    ...(canBilling&&metrics.overdueInvoices.length?[{key:'ar',level:'urgent' as const,icon:Banknote,title:`${metrics.overdueInvoices.length} overdue invoice${metrics.overdueInvoices.length===1?'':'s'}`,copy:`${currency(metrics.overdueInvoices.reduce((sum,row)=>sum+num(row.balance_due),0))} currently overdue.`,to:'/invoices'}]:[]),
    ...(canTimesheetReview&&metrics.submittedTimesheets.length?[{key:'time',level:'warn' as const,icon:FileClock,title:`${metrics.submittedTimesheets.length} timesheet${metrics.submittedTimesheets.length===1?'':'s'} waiting approval`,copy:'Submitted employee hours are waiting for review.',to:'/timesheets'}]:[]),
    ...(canFleet&&metrics.outOfService.length?[{key:'oos',level:'urgent' as const,icon:ShieldAlert,title:`${metrics.outOfService.length} unit${metrics.outOfService.length===1?'':'s'} out of service`,copy:'Open defects are holding equipment out of service.',to:'/maintenance'}]:[]),
    ...(canFleet&&metrics.maintenanceDue.length?[{key:'maint',level:'warn' as const,icon:Wrench,title:`${metrics.maintenanceDue.length} maintenance item${metrics.maintenanceDue.length===1?'':'s'} overdue`,copy:`${metrics.maintenanceSoon.length} more approaching their warning window.`,to:'/maintenance'}]:[]),
  ]

  return <main className="manager-home-page">
    <section className="manager-home-top"><div><span>COMMAND CENTRE</span><h1>{greeting}.</h1><p>{workspace.organization.name} · {label(workspace.roleKey)} workspace</p></div><button type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></section>
    {error&&<div className="manager-home-message"><AlertTriangle size={16}/>{error}</div>}

    <section className="manager-home-kpis">
      {canOps&&<Kpi to={canDispatch?"/dispatch":"/calendar"} icon={CalendarDays} label="Jobs today" value={String(metrics.todayJobs.length)} detail={`${metrics.fieldActive.length} active in field`} attention={canDispatch&&(metrics.needsDispatch.length>0||metrics.overdueFieldStart.length>0)}/>} 
      {canDispatch&&<Kpi to="/dispatch" icon={Users} label="Ready to send" value={String(metrics.readyToSend.length)} detail={`${metrics.waitingAcknowledgement.length} awaiting acknowledgement`} attention={metrics.readyToSend.length>0||metrics.waitingAcknowledgement.length>0}/>} 
      {canOps&&<Kpi to="/calendar" icon={Clock3} label="Unscheduled work" value={String(metrics.unscheduledJobs.length)} detail={`${metrics.overdueFieldStart.length} past on-site time`} attention={metrics.unscheduledJobs.length>0||metrics.overdueFieldStart.length>0}/>} 
      {canTicketReview&&<Kpi to="/tickets" icon={ClipboardCheck} label="Tickets to review" value={String(metrics.ticketsWaiting.length)} detail={`${metrics.readyToBill.length} approved and unbilled`} attention={metrics.ticketsWaiting.length>0}/>} 
      {canBilling&&<Kpi to="/billing" icon={ReceiptText} label="Ready to bill" value={String(metrics.readyToBill.length)} detail="Approved field tickets" attention={metrics.readyToBill.length>0}/>} 
      {canBilling&&<Kpi to="/invoices" icon={Banknote} label="A/R outstanding" value={currency(metrics.outstandingBalance)} detail={`${metrics.overdueInvoices.length} overdue`} attention={metrics.overdueInvoices.length>0}/>} 
      {canFleet&&<Kpi to="/fleet" icon={Truck} label="Available units" value={`${metrics.availableVehicles.length}/${workspace.vehicles.length}`} detail={`${metrics.outOfService.length} out of service`} attention={metrics.outOfService.length>0}/>} 
      {canFleet&&<Kpi to="/maintenance" icon={Wrench} label="Maintenance due" value={String(metrics.maintenanceDue.length)} detail={`${metrics.openWorkOrders.length} open work orders`} attention={metrics.maintenanceDue.length>0}/>} 
      {canTimesheetReview&&<Kpi to="/timesheets" icon={FileClock} label="Hours to approve" value={String(metrics.submittedTimesheets.length)} detail="Submitted timesheets" attention={metrics.submittedTimesheets.length>0}/>} 
    </section>

    <section className="manager-home-columns">
      <div className="manager-home-panel attention-panel"><PanelHeading eyebrow="NEEDS ATTENTION" title="What should happen next"/><div className="attention-list">{attention.length?attention.map(({key,...item})=><AttentionRow key={key} {...item}/>):<div className="manager-home-clear"><CheckCircle2 size={27}/><div><strong>No urgent workflow gaps</strong><span>Northborn has nothing critical waiting in the areas available to your role.</span></div></div>}</div></div>

      {canOps&&<div className="manager-home-panel"><PanelHeading eyebrow="TODAY" title="Today's work" link={canDispatch?"/dispatch":"/calendar"}/><div className="today-job-list">{metrics.todayJobs.length?metrics.todayJobs.slice(0,8).map(job=><TodayJob key={job.id} job={job} workspace={workspace} dispatchAccess={canDispatch}/>):<EmptyBlock icon={CalendarDays} title="No jobs scheduled today" copy="Upcoming jobs will appear here once they have a shop, onsite or scheduled time."/>}</div></div>}
    </section>

    <section className="manager-home-columns lower">
      {canOps&&<div className="manager-home-panel"><PanelHeading eyebrow="UPCOMING" title="Next scheduled work" link="/calendar"/><div className="today-job-list">{metrics.upcomingJobs.length?metrics.upcomingJobs.slice(0,8).map(job=><TodayJob key={job.id} job={job} workspace={workspace} withDate dispatchAccess={canDispatch}/>):<EmptyBlock icon={CalendarDays} title="No upcoming work scheduled" copy="Future scheduled jobs will appear here as soon as a shop or on-site time is set."/>}</div></div>}
      {canBilling&&<div className="manager-home-panel"><PanelHeading eyebrow="BILLING" title="Cash & paperwork" link="/billing"/><div className="manager-home-stat-list"><StatRow label="Approved tickets ready to invoice" value={String(metrics.readyToBill.length)} tone={metrics.readyToBill.length?'warn':'normal'}/><StatRow label="Outstanding invoices" value={String(metrics.outstandingInvoices.length)}/><StatRow label="Outstanding balance" value={currency(metrics.outstandingBalance)}/><StatRow label="Overdue invoices" value={String(metrics.overdueInvoices.length)} tone={metrics.overdueInvoices.length?'danger':'normal'}/></div></div>}
      {canFleet&&<div className="manager-home-panel"><PanelHeading eyebrow="FLEET HEALTH" title="Units & maintenance" link="/maintenance"/><div className="manager-home-stat-list"><StatRow label="Available units" value={`${metrics.availableVehicles.length} of ${workspace.vehicles.length}`}/><StatRow label="Open defects" value={String(metrics.openDefects.length)} tone={metrics.openDefects.length?'warn':'normal'}/><StatRow label="Out of service" value={String(metrics.outOfService.length)} tone={metrics.outOfService.length?'danger':'normal'}/><StatRow label="Maintenance overdue" value={String(metrics.maintenanceDue.length)} tone={metrics.maintenanceDue.length?'danger':'normal'}/><StatRow label="Due soon" value={String(metrics.maintenanceSoon.length)} tone={metrics.maintenanceSoon.length?'warn':'normal'}/></div></div>}
      {!canBilling&&!canFleet&&<div className="manager-home-panel"><PanelHeading eyebrow="WORKSPACE" title="Your Northborn view"/><EmptyBlock icon={Gauge} title="Role-aware dashboard" copy="This dashboard only shows operational areas your current role is expected to work with."/></div>}
    </section>

    <section className="manager-home-shortcuts"><NavLink to="/jobs"><BriefcaseBusiness size={18}/><span><strong>Jobs</strong><small>Plan and manage work</small></span><ArrowRight size={16}/></NavLink><NavLink to="/employees"><Users size={18}/><span><strong>Employees</strong><small>People and access</small></span><ArrowRight size={16}/></NavLink>{canFleet&&<NavLink to="/fleet"><Truck size={18}/><span><strong>Fleet</strong><small>Units and availability</small></span><ArrowRight size={16}/></NavLink>}{canBilling&&<NavLink to="/invoices"><ReceiptText size={18}/><span><strong>Invoices</strong><small>Billing and collections</small></span><ArrowRight size={16}/></NavLink>}</section>

    <footer className="manager-home-footer">Last refreshed {refreshedAt?new Intl.DateTimeFormat('en-CA',{hour:'numeric',minute:'2-digit'}).format(refreshedAt):'just now'}</footer>
  </main>
}

function Kpi({to,icon:Icon,label,value,detail,attention=false}:{to:string;icon:typeof Gauge;label:string;value:string;detail:string;attention?:boolean}){return <NavLink to={to} className={attention?'manager-kpi attention':'manager-kpi'}><div><Icon size={18}/><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></NavLink>}
function PanelHeading({eyebrow,title,link}:{eyebrow:string;title:string;link?:string}){return <div className="manager-panel-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div>{link&&<NavLink to={link}>Open <ArrowRight size={14}/></NavLink>}</div>}
function AttentionRow({level,icon:Icon,title,copy,to}:{level:'urgent'|'warn';icon:typeof Gauge;title:string;copy:string;to:string}){return <NavLink to={to} className={`attention-row ${level}`}><div className="attention-row-icon"><Icon size={18}/></div><div><strong>{title}</strong><span>{copy}</span></div><ArrowRight size={16}/></NavLink>}
function TodayJob({job,workspace,withDate=false,dispatchAccess=true}:{job:Job;workspace:Workspace;withDate?:boolean;dispatchAccess?:boolean}){const customer=workspace.customers.find(item=>item.id===job.customer_id),rows=workspace.assignments.filter(row=>row.job_id===job.id),crewMembers=rows.map(row=>workspace.employees.find(employee=>employee.id===row.employee_id)).filter(Boolean) as Employee[],unitRows=rows.map(row=>workspace.vehicles.find(vehicle=>vehicle.id===row.vehicle_id)).filter(Boolean) as Vehicle[],time=job.onsite_time||job.scheduled_start||job.shop_time;return <NavLink className="today-job" to={dispatchAccess?`/dispatch?job=${encodeURIComponent(job.id)}`:"/calendar"}><div className="today-job-time"><Clock3 size={15}/><strong>{timeLabel(time,withDate)}</strong></div><div className="today-job-main"><strong>{job.job_number} · {job.title}</strong><span>{customer?.name||'Customer'}{job.site_name?` · ${job.site_name}`:''}</span></div><div className="today-job-resources"><span className={crewMembers.length?'ready':'missing'}>{crewMembers.length?crewMembers.map(member=>member.first_name).join(', '):'No crew'}</span><span className={unitRows.length?'ready':'missing'}>{unitRows.length?unitRows.map(unit=>`#${unit.unit_number}`).join(', '):'No unit'}</span><span className={job.dispatch_stage==='unassigned'?'missing':'ready'}>{job.dispatch_stage.replaceAll('_',' ')}</span></div><ArrowRight size={15}/></NavLink>}
function StatRow({label,value,tone='normal'}:{label:string;value:string;tone?:'normal'|'warn'|'danger'}){return <div className={`manager-stat-row ${tone}`}><span>{label}</span><strong>{value}</strong></div>}
function EmptyBlock({icon:Icon,title,copy}:{icon:typeof Gauge;title:string;copy:string}){return <div className="manager-empty-block"><Icon size={26}/><strong>{title}</strong><span>{copy}</span></div>}
