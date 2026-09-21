import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, useSearchParams } from 'react-router-dom'
import {
  BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3,
  ContactRound, Copy, Gauge, GripVertical, HardHat, History, MapPin, Phone, Plus,
  RotateCcw, ShieldCheck, Star, Truck, UserRound, Users, Wrench, X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess } from './workspace-access'
import NorthbornDateTimePicker from './NorthbornDateTimePicker'
import { ACTIVE_BOARD_STAGES, dispatchStageLabel, statusLabel, type DispatchStage } from './job-operations'
import './manager-dispatch.css'

const db=supabase as any
type Organization={id:string;name:string}
type Customer={id:string;name:string;address:string|null;phone:string|null}
type Employee={id:string;first_name:string;last_name:string;position:string|null;phone:string|null;status:string}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string;status:string}
type Job={
  id:string;customer_id:string;job_number:string;title:string;site_name:string|null;site_address:string|null;
  shop_time:string|null;onsite_time:string|null;scheduled_start:string|null;scheduled_end:string|null;
  status:string;dispatch_stage:string;notes:string|null;
  dispatch_contact_name:string|null;dispatch_contact_phone:string|null;emergency_contact_name:string|null;emergency_contact_phone:string|null;
  primary_operator_employee_id:string|null;recurrence_series_id:string|null;recurrence_rule:string|null;recurrence_parent_id:string|null;
}
type Assignment={id:string;job_id:string;employee_id:string|null;vehicle_id:string|null;role:string|null}
type Contact={id:string;customer_id:string;name:string;title:string|null;phone:string|null;email:string|null;contact_type:string;status:string}
type JobContact={id:string;job_id:string;contact_id:string;is_primary:boolean}
type EventRow={id:string;job_id:string;event_type:string;from_value:string|null;to_value:string|null;details:Record<string,unknown>;created_at:string}
type Workspace={organization:Organization|null;roleKey:string;customers:Customer[];employees:Employee[];vehicles:Vehicle[];jobs:Job[];assignments:Assignment[];contacts:Contact[];jobContacts:JobContact[];events:EventRow[]}
const EMPTY:Workspace={organization:null,roleKey:'',customers:[],employees:[],vehicles:[],jobs:[],assignments:[],contacts:[],jobContacts:[],events:[]}
const NAV=[['Dashboard','/',Gauge],['Calendar','/calendar',CalendarDays],['Dispatch','/dispatch',CalendarDays],['Jobs','/jobs',BriefcaseBusiness],['Customers','/customers',ContactRound],['Employees','/employees',Users],['Fleet','/fleet',Truck],['Maintenance','/maintenance',Wrench],['Safety','/safety',ShieldCheck],['Timesheets','/timesheets',HardHat]] as const
const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong.')
const toIso=(v:string)=>v?new Date(v).toISOString():null
const localValue=(v:string|null)=>{if(!v)return'';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
const time=(v:string|null)=>v?new Intl.DateTimeFormat('en-CA',{hour:'numeric',minute:'2-digit'}).format(new Date(v)):'Not set'
const dateTime=(v:string|null)=>v?new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v)):'Not set'
const dayKey=(v:string|null)=>{if(!v)return'';const d=new Date(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
const todayKey=()=>dayKey(new Date().toISOString())
const jobTime=(j:Job)=>j.onsite_time||j.scheduled_start||j.shop_time
const eventLabel=(value:string)=>({job_created:'Job created',status_changed:'Lifecycle changed',dispatch_stage_changed:'Dispatch progress',schedule_changed:'Schedule changed',operations_contacts_changed:'Operations contacts changed',crew_assigned:'Crew assigned',crew_unassigned:'Crew removed',unit_assigned:'Unit assigned',unit_unassigned:'Unit removed',assignment_changed:'Assignment changed'} as Record<string,string>)[value]||statusLabel(value)

export default function ManagerDispatchPage(){
  const [ws,setWs]=useState<Workspace>(EMPTY),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<string|null>(null),[scope,setScope]=useState<'today'|'upcoming'|'all'>('today'),[moving,setMoving]=useState<string|null>(null)
  const [params,setParams]=useSearchParams()
  const load=useCallback(async()=>{
    setError('')
    try{
      const {data:s,error:se}=await supabase.auth.getSession();if(se)throw se;const user=s.session?.user;if(!user){setWs(EMPTY);return}
      const access=await resolveWorkspaceAccess(user.id);if(access.kind!=='internal'){setWs(EMPTY);return}
      const org={id:access.organizationId,name:access.organizationName}
      const [customers,employees,vehicles,jobs,assignments,contacts,jobContacts,events]=await Promise.all([
        db.from('customers').select('id,name,address,phone').eq('organization_id',org.id).neq('status','archived').order('name'),
        db.from('employees').select('id,first_name,last_name,position,phone,status').eq('organization_id',org.id).neq('status','archived').order('last_name'),
        db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id',org.id).neq('status','archived').order('unit_number'),
        db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,shop_time,onsite_time,scheduled_start,scheduled_end,status,dispatch_stage,notes,dispatch_contact_name,dispatch_contact_phone,emergency_contact_name,emergency_contact_phone,primary_operator_employee_id,recurrence_series_id,recurrence_rule,recurrence_parent_id').eq('organization_id',org.id).order('onsite_time',{ascending:true,nullsFirst:false}),
        db.from('dispatch_assignments').select('id,job_id,employee_id,vehicle_id,role').eq('organization_id',org.id),
        db.from('customer_contacts').select('id,customer_id,name,title,phone,email,contact_type,status').eq('organization_id',org.id).neq('status','archived').order('name'),
        db.from('job_contacts').select('id,job_id,contact_id,is_primary').eq('organization_id',org.id),
        db.from('job_operation_events').select('id,job_id,event_type,from_value,to_value,details,created_at').eq('organization_id',org.id).order('created_at',{ascending:false}).limit(1000),
      ])
      const result=[customers,employees,vehicles,jobs,assignments,contacts,jobContacts,events].find(x=>x.error)
      if(result?.error)setError(result.error.message)
      setWs({organization:org,roleKey:access.roleKey,customers:customers.data||[],employees:employees.data||[],vehicles:vehicles.data||[],jobs:jobs.data||[],assignments:assignments.data||[],contacts:contacts.data||[],jobContacts:jobContacts.data||[],events:events.data||[]})
    }catch(e){setError(readError(e))}finally{setLoading(false)}
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{const id=params.get('job');if(id&&ws.jobs.some(j=>j.id===id))setSelected(id)},[params,ws.jobs])

  const active=useMemo(()=>ws.jobs.filter(j=>!['completed','cancelled'].includes(j.status)),[ws.jobs])
  const scoped=useMemo(()=>{const today=todayKey();return active.filter(j=>{const key=dayKey(jobTime(j));if(scope==='today')return key===today;if(scope==='upcoming')return !key||key>today;return true})},[active,scope])
  const close=()=>{setSelected(null);if(params.has('job')){const n=new URLSearchParams(params);n.delete('job');setParams(n,{replace:true})}}
  const resources=(job:Job)=>{const rows=ws.assignments.filter(a=>a.job_id===job.id);return {crew:rows.filter(a=>a.employee_id),units:rows.filter(a=>a.vehicle_id)}}
  const moveStage=async(job:Job,stage:DispatchStage)=>{
    if(!ws.organization)return
    const {crew,units}=resources(job)
    if(['ready','dispatched'].includes(stage)&&(!crew.length||!units.length)){setError('Assign at least one crew member and one unit before moving this job to Ready or Dispatched.');return}
    setMoving(job.id);setError('')
    const r=await db.rpc('set_internal_job_dispatch_stage',{_organization_id:ws.organization.id,_job_id:job.id,_stage:stage})
    if(r.error)setError(r.error.message);else await load()
    setMoving(null)
  }
  if(loading)return <div className="dispatch-v2-loading">Loading Dispatch…</div>
  if(!ws.organization)return <Navigate to="/" replace/>

  const selectedJob=selected?ws.jobs.find(j=>j.id===selected)||null:null
  return <div className="dispatch-v2-shell">
    <aside className="dispatch-v2-sidebar"><div className="dispatch-v2-brand"><div>N</div><span><strong>NORTHBORN</strong><small>{ws.organization.name}</small></span></div><nav>{NAV.map(([n,p,I])=><NavLink key={p} to={p} end={p==='/' }><I size={18}/><span>{n}</span></NavLink>)}</nav></aside>
    <main className="dispatch-v2-main">
      <header className="dispatch-v2-header"><div><span className="eyebrow">LIVE OPERATIONS</span><strong>Dispatch</strong></div><div className="dispatch-v2-header-actions"><NavLink className="secondary" to="/calendar"><CalendarDays size={17}/>Calendar</NavLink><NavLink className="primary compact" to="/jobs"><Plus size={17}/>New job</NavLink></div></header>
      <section className="dispatch-v2-page">
        <div className="dispatch-v2-hero"><div><span className="eyebrow">DISPATCH BOARD</span><h1>Move the day forward.</h1><p>Assign the crew and unit, send the job, then follow acknowledgement through field completion.</p></div><div className="dispatch-v2-summary"><span><strong>{active.length}</strong> active</span><span><strong>{active.filter(j=>j.dispatch_stage==='unassigned').length}</strong> unassigned</span><span><strong>{active.filter(j=>['en_route','onsite','work_started'].includes(j.dispatch_stage)).length}</strong> field</span></div></div>
        <div className="dispatch-scope-tabs">{(['today','upcoming','all'] as const).map(v=><button key={v} className={scope===v?'active':''} onClick={()=>setScope(v)}>{v==='today'?'Today':v==='upcoming'?'Upcoming / unscheduled':'All active'}</button>)}</div>
        {error&&<div className="message">{error}</div>}
        <div className="dispatch-kanban" aria-label="Dispatch workflow board">
          {ACTIVE_BOARD_STAGES.map(stage=>{const jobs=scoped.filter(j=>(j.dispatch_stage||'unassigned')===stage);return <section className="dispatch-stage-column" key={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/job-id');const job=ws.jobs.find(j=>j.id===id);if(job)void moveStage(job,stage)}}>
            <header><div><strong>{dispatchStageLabel(stage)}</strong><small>{jobs.length}</small></div><span>{stage==='unassigned'?'Needs crew/unit':stage==='ready'?'Ready to send':stage==='dispatched'?'Waiting on operator':stage==='acknowledged'?'Crew confirmed':stage==='en_route'?'Travelling':stage==='onsite'?'Arrived':'Work underway'}</span></header>
            <div className="dispatch-stage-list">{jobs.map(job=><DispatchCard key={job.id} job={job} ws={ws} busy={moving===job.id} onOpen={()=>setSelected(job.id)} onMove={stage=>void moveStage(job,stage)}/>)}
              {!jobs.length&&<div className="dispatch-stage-empty">Drop a job here</div>}
            </div>
          </section>})}
        </div>
      </section>
    </main>
    {selectedJob&&<JobManagementModal key={selectedJob.id+`-${selectedJob.dispatch_stage}`} job={selectedJob} ws={ws} onClose={close} onChanged={load} onMove={stage=>moveStage(selectedJob,stage)}/>}
  </div>
}

function DispatchCard({job,ws,busy,onOpen,onMove}:{job:Job;ws:Workspace;busy:boolean;onOpen:()=>void;onMove:(stage:DispatchStage)=>void}){
  const customer=ws.customers.find(c=>c.id===job.customer_id),rows=ws.assignments.filter(a=>a.job_id===job.id),crew=rows.map(a=>ws.employees.find(e=>e.id===a.employee_id)).filter(Boolean) as Employee[],units=rows.map(a=>ws.vehicles.find(v=>v.id===a.vehicle_id)).filter(Boolean) as Vehicle[]
  return <article className="dispatch-kanban-card" draggable={!busy} onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/job-id',job.id)}}>
    <button className="dispatch-card-open" onClick={onOpen}><div className="dispatch-card-grip"><GripVertical size={16}/></div><div className="dispatch-card-main"><span>{job.job_number}</span><strong>{job.title}</strong><small>{customer?.name||'Unknown customer'} · {job.site_name||job.site_address||'Site not set'}</small></div><ChevronRight size={17}/></button>
    <div className="dispatch-card-times"><span><Clock3 size={13}/>{time(job.shop_time)}</span><span><MapPin size={13}/>{time(job.onsite_time||job.scheduled_start)}</span></div>
    <div className="dispatch-card-resources"><span className={crew.length?'':'missing'}><UserRound size={13}/>{crew.length?crew.map(e=>e.first_name).join(', '):'No crew'}</span><span className={units.length?'':'missing'}><Truck size={13}/>{units.length?units.map(v=>`#${v.unit_number}`).join(', '):'No unit'}</span></div>
    <label className="dispatch-stage-select"><span>Move</span><select value={job.dispatch_stage||'unassigned'} disabled={busy} onChange={e=>onMove(e.target.value as DispatchStage)}>{ACTIVE_BOARD_STAGES.map(s=><option key={s} value={s}>{dispatchStageLabel(s)}</option>)}</select></label>
  </article>
}

function JobManagementModal({job,ws,onClose,onChanged,onMove}:{job:Job;ws:Workspace;onClose:()=>void;onChanged:()=>Promise<void>;onMove:(stage:DispatchStage)=>Promise<void>}){
  const [form,setForm]=useState({customer_id:job.customer_id,job_number:job.job_number,title:job.title,site_name:job.site_name||'',site_address:job.site_address||'',shop_time:localValue(job.shop_time),onsite_time:localValue(job.onsite_time||job.scheduled_start),scheduled_end:localValue(job.scheduled_end),notes:job.notes||'',dispatch_contact_name:job.dispatch_contact_name||'',dispatch_contact_phone:job.dispatch_contact_phone||'',emergency_contact_name:job.emergency_contact_name||'',emergency_contact_phone:job.emergency_contact_phone||'',primary_operator_employee_id:job.primary_operator_employee_id||''})
  const [employees,setEmployees]=useState<string[]>([]),[vehicles,setVehicles]=useState<string[]>([]),[contactOpen,setContactOpen]=useState(false),[contact,setContact]=useState({name:'',title:'',phone:'',email:'',contact_type:'field'}),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const assignments=ws.assignments.filter(a=>a.job_id===job.id),crew=assignments.filter(a=>a.employee_id),units=assignments.filter(a=>a.vehicle_id),customer=ws.customers.find(c=>c.id===form.customer_id),customerContacts=ws.contacts.filter(c=>c.customer_id===form.customer_id),links=ws.jobContacts.filter(c=>c.job_id===job.id),selectedContacts=new Set(links.map(l=>l.contact_id)),events=ws.events.filter(e=>e.job_id===job.id).slice(0,30)
  const crewEmployees=crew.map(a=>ws.employees.find(e=>e.id===a.employee_id)).filter(Boolean) as Employee[]

  const save=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');const onsite=toIso(form.onsite_time);const r=await db.from('jobs').update({customer_id:form.customer_id,job_number:form.job_number.trim(),title:form.title.trim(),site_name:form.site_name.trim()||null,site_address:form.site_address.trim()||null,shop_time:toIso(form.shop_time),onsite_time:onsite,scheduled_start:onsite,scheduled_end:toIso(form.scheduled_end),notes:form.notes.trim()||null,dispatch_contact_name:form.dispatch_contact_name.trim()||null,dispatch_contact_phone:form.dispatch_contact_phone.trim()||null,emergency_contact_name:form.emergency_contact_name.trim()||null,emergency_contact_phone:form.emergency_contact_phone.trim()||null,primary_operator_employee_id:form.primary_operator_employee_id||null}).eq('id',job.id).eq('organization_id',ws.organization!.id);if(r.error)setError(r.error.message);else await onChanged();setBusy(false)}
  const addAssignments=async()=>{if(!employees.length&&!vehicles.length)return;setBusy(true);setError('');try{const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required');const rows=[...employees.filter(id=>!crew.some(a=>a.employee_id===id)).map(id=>({organization_id:ws.organization!.id,job_id:job.id,employee_id:id,vehicle_id:null,role:'crew',created_by:u.user.id})),...vehicles.filter(id=>!units.some(a=>a.vehicle_id===id)).map(id=>({organization_id:ws.organization!.id,job_id:job.id,employee_id:null,vehicle_id:id,role:'unit',created_by:u.user.id}))];if(rows.length){const r=await db.from('dispatch_assignments').insert(rows);if(r.error)throw r.error}if(vehicles.length)await db.from('fleet_vehicles').update({status:'assigned'}).in('id',vehicles).eq('organization_id',ws.organization!.id);setEmployees([]);setVehicles([]);await onChanged()}catch(e){setError(readError(e))}finally{setBusy(false)}}
  const removeAssignment=async(a:Assignment)=>{setBusy(true);const r=await db.from('dispatch_assignments').delete().eq('id',a.id).eq('organization_id',ws.organization!.id);if(r.error)setError(r.error.message);else{if(a.vehicle_id){const remaining=await db.from('dispatch_assignments').select('id').eq('organization_id',ws.organization!.id).eq('vehicle_id',a.vehicle_id).limit(1);if(!remaining.error&&!remaining.data?.length)await db.from('fleet_vehicles').update({status:'available'}).eq('id',a.vehicle_id).eq('organization_id',ws.organization!.id)}await onChanged()}setBusy(false)}
  const toggleContact=async(id:string)=>{setBusy(true);const existing=links.find(l=>l.contact_id===id);if(existing){const r=await db.from('job_contacts').delete().eq('id',existing.id);if(r.error)setError(r.error.message)}else{const {data:u}=await supabase.auth.getUser();const r=await db.from('job_contacts').insert({organization_id:ws.organization!.id,job_id:job.id,contact_id:id,is_primary:links.length===0,created_by:u.user!.id});if(r.error)setError(r.error.message)}await onChanged();setBusy(false)}
  const primaryContact=async(id:string)=>{setBusy(true);await db.from('job_contacts').update({is_primary:false}).eq('organization_id',ws.organization!.id).eq('job_id',job.id);const r=await db.from('job_contacts').update({is_primary:true}).eq('organization_id',ws.organization!.id).eq('job_id',job.id).eq('contact_id',id);if(r.error)setError(r.error.message);await onChanged();setBusy(false)}
  const addContact=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);try{const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required');const r=await db.from('customer_contacts').insert({organization_id:ws.organization!.id,customer_id:form.customer_id,name:contact.name.trim(),title:contact.title.trim()||null,phone:contact.phone.trim()||null,email:contact.email.trim()||null,contact_type:contact.contact_type,created_by:u.user.id}).select('id').single();if(r.error)throw r.error;const link=await db.from('job_contacts').insert({organization_id:ws.organization!.id,job_id:job.id,contact_id:r.data.id,is_primary:links.length===0,created_by:u.user.id});if(link.error)throw link.error;setContactOpen(false);setContact({name:'',title:'',phone:'',email:'',contact_type:'field'});await onChanged()}catch(e2){setError(readError(e2))}finally{setBusy(false)}}
  const lifecycle=async(status:string)=>{setBusy(true);setError('');if(status==='completed'){await onMove('work_completed')}else{const r=await db.from('jobs').update({status,dispatch_stage:status==='cancelled'?'unassigned':job.dispatch_stage}).eq('id',job.id).eq('organization_id',ws.organization!.id);if(r.error)setError(r.error.message);else await onChanged()}setBusy(false)}
  const duplicate=async()=>{setBusy(true);setError('');try{const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required');const suffix=new Date().toISOString().replace(/\D/g,'').slice(4,12);const r=await db.from('jobs').insert({organization_id:ws.organization!.id,customer_id:job.customer_id,job_number:`${job.job_number}-COPY-${suffix}`,title:job.title,site_name:job.site_name,site_address:job.site_address,shop_time:null,onsite_time:null,scheduled_start:null,scheduled_end:null,status:'draft',dispatch_stage:'unassigned',notes:job.notes,dispatch_contact_name:job.dispatch_contact_name,dispatch_contact_phone:job.dispatch_contact_phone,emergency_contact_name:job.emergency_contact_name,emergency_contact_phone:job.emergency_contact_phone,recurrence_parent_id:job.id,recurrence_series_id:job.recurrence_series_id,recurrence_rule:job.recurrence_rule,created_by:u.user.id}).select('id').single();if(r.error)throw r.error;if(links.length){const {data:u2}=await supabase.auth.getUser();await db.from('job_contacts').insert(links.map(l=>({organization_id:ws.organization!.id,job_id:r.data.id,contact_id:l.contact_id,is_primary:l.is_primary,created_by:u2.user!.id})))}await onChanged()}catch(e){setError(readError(e))}finally{setBusy(false)}}
  const toggle=(list:string[],set:(v:string[])=>void,id:string)=>set(list.includes(id)?list.filter(x=>x!==id):[...list,id])

  return <div className="dispatch-v2-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="dispatch-v2-modal" role="dialog" aria-modal="true" aria-label="Manage job">
    <div className="dispatch-v2-modal-head"><div><span className="eyebrow">JOB MANAGEMENT</span><h2>{job.title}</h2><p>{job.job_number} · {dispatchStageLabel(job.dispatch_stage)}</p></div><div className="dispatch-modal-head-actions"><button type="button" onClick={()=>void duplicate()} title="Duplicate job"><Copy size={18}/></button><button type="button" className="dispatch-v2-close" onClick={onClose}><X size={21}/></button></div></div>
    {error&&<div className="message">{error}</div>}
    <form className="dispatch-v2-edit-form" onSubmit={save}>
      <div className="dispatch-v2-section-title"><span>Job details</span><small>Edit the schedule, site and operational contacts without rebuilding the dispatch.</small></div>
      <div className="dispatch-v2-form-grid">
        <label><span>Customer</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}>{ws.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span>Job number</span><input value={form.job_number} onChange={e=>setForm({...form,job_number:e.target.value})}/></label>
        <label className="wide"><span>Job title</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/></label>
        <label><span>Site name</span><input value={form.site_name} onChange={e=>setForm({...form,site_name:e.target.value})}/></label>
        <label><span>Site address</span><input value={form.site_address} onChange={e=>setForm({...form,site_address:e.target.value})}/></label>
        <label><span>Be at shop</span><NorthbornDateTimePicker value={form.shop_time} onChange={v=>setForm({...form,shop_time:v})}/></label>
        <label><span>On site</span><NorthbornDateTimePicker value={form.onsite_time} onChange={v=>setForm({...form,onsite_time:v})}/></label>
        <label><span>Expected finish</span><NorthbornDateTimePicker value={form.scheduled_end} onChange={v=>setForm({...form,scheduled_end:v})} min={form.onsite_time}/></label>
        <label><span>Dispatch contact name</span><input value={form.dispatch_contact_name} onChange={e=>setForm({...form,dispatch_contact_name:e.target.value})}/></label>
        <label><span>Dispatch contact phone</span><input value={form.dispatch_contact_phone} onChange={e=>setForm({...form,dispatch_contact_phone:e.target.value})}/></label>
        <label><span>Emergency contact name</span><input value={form.emergency_contact_name} onChange={e=>setForm({...form,emergency_contact_name:e.target.value})}/></label>
        <label><span>Emergency contact phone</span><input value={form.emergency_contact_phone} onChange={e=>setForm({...form,emergency_contact_phone:e.target.value})}/></label>
        <label><span>Primary operator</span><select value={form.primary_operator_employee_id} onChange={e=>setForm({...form,primary_operator_employee_id:e.target.value})}><option value="">Not selected</option>{crewEmployees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.phone?` · ${e.phone}`:''}</option>)}</select></label>
        <label className="wide"><span>Notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </div><div className="dispatch-v2-save-row"><button className="primary" disabled={busy}>Save job details</button></div>
    </form>

    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>Client & field contacts</span><small>{customer?.phone?`Company: ${customer.phone}`:'No company phone entered.'}</small></div><div className="dispatch-v2-client-summary"><span><Building2 size={17}/><strong>{customer?.name||'Unknown customer'}</strong></span>{customer?.phone&&<a href={`tel:${customer.phone}`}><Phone size={16}/>{customer.phone}</a>}</div><div className="dispatch-v2-contact-list">{customerContacts.map(c=>{const on=selectedContacts.has(c.id),primary=links.find(l=>l.contact_id===c.id)?.is_primary;return <div className={on?'dispatch-v2-contact active':'dispatch-v2-contact'} key={c.id}><button type="button" onClick={()=>void toggleContact(c.id)} disabled={busy}><span className="dispatch-v2-check">{on&&<Check size={14}/>}</span><span><strong>{c.name}</strong><small>{c.title||statusLabel(c.contact_type)}{c.phone?` · ${c.phone}`:''}</small></span></button>{on&&<button type="button" className={primary?'dispatch-v2-star active':'dispatch-v2-star'} onClick={()=>void primaryContact(c.id)}><Star size={16} fill={primary?'currentColor':'none'}/></button>}</div>})}{!customerContacts.length&&<div className="dispatch-v2-inline-empty">No customer contacts yet.</div>}</div><button type="button" className="secondary dispatch-v2-add-contact" onClick={()=>setContactOpen(v=>!v)}><Plus size={16}/>Add customer contact</button>{contactOpen&&<form className="dispatch-v2-contact-form" onSubmit={addContact}><input placeholder="Name" value={contact.name} onChange={e=>setContact({...contact,name:e.target.value})} required/><input placeholder="Role / title" value={contact.title} onChange={e=>setContact({...contact,title:e.target.value})}/><input placeholder="Phone" value={contact.phone} onChange={e=>setContact({...contact,phone:e.target.value})}/><input type="email" placeholder="Email" value={contact.email} onChange={e=>setContact({...contact,email:e.target.value})}/><select value={contact.contact_type} onChange={e=>setContact({...contact,contact_type:e.target.value})}><option value="field">Field operator</option><option value="supervisor">Supervisor</option><option value="dispatch">Dispatch</option><option value="office">Office</option><option value="other">Other</option></select><button className="primary">Save & use</button></form>}</section>

    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>Crew</span><small>Assign multiple people, remove them, or move them to another job.</small></div><div className="dispatch-v2-assigned-list">{crew.map(a=>{const e=ws.employees.find(x=>x.id===a.employee_id);return e?<div className="dispatch-v2-assigned-row" key={a.id}><span><UserRound size={16}/><strong>{e.first_name} {e.last_name}</strong><small>{e.position||'Employee'}{job.primary_operator_employee_id===e.id?' · Primary operator':''}</small></span><button type="button" onClick={()=>void removeAssignment(a)}><X size={16}/>Unassign</button></div>:null})}{!crew.length&&<div className="dispatch-v2-inline-empty">No crew assigned.</div>}</div><div className="dispatch-v2-picker">{ws.employees.filter(e=>e.status==='active'&&!crew.some(a=>a.employee_id===e.id)).map(e=><button type="button" className={employees.includes(e.id)?'active':''} key={e.id} onClick={()=>toggle(employees,setEmployees,e.id)}><UserRound size={15}/>{e.first_name} {e.last_name}</button>)}</div></section>
    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>Units</span><small>Only available units can be newly assigned.</small></div><div className="dispatch-v2-assigned-list">{units.map(a=>{const v=ws.vehicles.find(x=>x.id===a.vehicle_id);return v?<div className="dispatch-v2-assigned-row" key={a.id}><span><Truck size={16}/><strong>Unit {v.unit_number}</strong><small>{v.name||v.vehicle_type}</small></span><button type="button" onClick={()=>void removeAssignment(a)}><X size={16}/>Unassign</button></div>:null})}{!units.length&&<div className="dispatch-v2-inline-empty">No units assigned.</div>}</div><div className="dispatch-v2-picker">{ws.vehicles.filter(v=>v.status==='available'&&!units.some(a=>a.vehicle_id===v.id)).map(v=><button type="button" className={vehicles.includes(v.id)?'active':''} key={v.id} onClick={()=>toggle(vehicles,setVehicles,v.id)}><Truck size={15}/>#{v.unit_number} {v.name||v.vehicle_type}</button>)}</div></section>
    {(employees.length||vehicles.length)?<div className="dispatch-v2-sticky-assign"><span>{employees.length+vehicles.length} selected</span><button className="primary" onClick={()=>void addAssignments()}>Assign selected</button></div>:null}

    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>Dispatch progress</span><small>Drag cards on desktop or use these controls on any device.</small></div><div className="dispatch-progress-grid">{ACTIVE_BOARD_STAGES.map(stage=><button type="button" key={stage} className={job.dispatch_stage===stage?'active':''} onClick={()=>void onMove(stage)} disabled={busy}>{dispatchStageLabel(stage)}</button>)}</div></section>
    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>Job lifecycle</span><small>Separate from field progress so office status stays clear.</small></div><div className="dispatch-v2-status-actions">{['draft','scheduled','active','completed','cancelled'].map(status=><button type="button" key={status} className={status==='completed'?'complete':status==='cancelled'?'cancel':''} onClick={()=>void lifecycle(status)} disabled={busy}>{status==='completed'&&<CheckCircle2 size={16}/>} {statusLabel(status)}</button>)}</div></section>
    <section className="dispatch-v2-section"><div className="dispatch-v2-section-title"><span>History</span><small>Every dispatch, schedule and assignment change stays attached to this job.</small></div><div className="dispatch-history">{events.map(e=><div key={e.id}><History size={15}/><span><strong>{eventLabel(e.event_type)}</strong><small>{e.from_value||e.to_value?`${e.from_value?statusLabel(e.from_value):''}${e.from_value&&e.to_value?' → ':''}${e.to_value?statusLabel(e.to_value):''}`:''}</small></span><time>{dateTime(e.created_at)}</time></div>)}{!events.length&&<div className="dispatch-v2-inline-empty">No history entries yet.</div>}</div></section>
    <button className="dispatch-modal-done" onClick={onClose}>Done</button>
  </section></div>
}
