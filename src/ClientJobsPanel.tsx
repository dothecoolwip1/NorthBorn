import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BriefcaseBusiness, CalendarDays, ChevronRight, Clock3, FilePlus2, Headphones, MapPin, Phone, StickyNote, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isTestMode, TEST_ORG, TEST_USERS } from './test-lab'
import './client-jobs.css'

const db = supabase as any
const TEST_NOTIFICATION_KEY='northborn_test_table_v1_user_notifications'

export type ClientPortalContact = {
  id:string
  name:string
  title:string|null
  phone:string|null
  email:string|null
  contact_type:string
  status:string
  updated_at:string
}

type ClientJob = {
  job_id:string
  job_number:string
  title:string
  site_name:string|null
  site_address:string|null
  scheduled_start:string|null
  scheduled_end:string|null
  status:string
  completed_at:string|null
  onsite_contact_id:string|null
  onsite_contact_name:string|null
  onsite_contact_title:string|null
  onsite_contact_phone:string|null
  onsite_contact_email:string|null
  operator_name:string|null
  operator_phone:string|null
  dispatch_phone:string|null
  emergency_phone:string|null
  client_notes:string|null
}

type ClientRequest = {
  request_id:string
  title:string
  requested_start:string|null
  site_name:string|null
  site_address:string|null
  onsite_contact_id:string|null
  onsite_contact_name:string|null
  client_notes:string|null
  status:string
  linked_job_id:string|null
  decision_type:string|null
  decision_reason:string|null
  reviewed_at:string|null
  created_at:string
}

const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong.')
const statusLabel=(v:string)=>v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const fmt=(value:string|null)=>value?new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'Not scheduled'

function addTestManagerRequestNotification(title:string,requestId:string){
  let rows:any[]=[]
  try{rows=JSON.parse(localStorage.getItem(TEST_NOTIFICATION_KEY)||'[]')}catch{}
  rows.unshift({id:crypto.randomUUID(),organization_id:TEST_ORG.id,recipient_user_id:TEST_USERS.manager.id,notification_type:'job_request_submitted',title:'New client job request',message:`Northborn Test Client Company requested: ${title}`,entity_type:'job_request',entity_id:requestId,payload:{customer_name:'Northborn Test Client Company'},read_at:null,created_at:new Date().toISOString()})
  localStorage.setItem(TEST_NOTIFICATION_KEY,JSON.stringify(rows))
  window.dispatchEvent(new Event('northborn-test-notifications-changed'))
}

export default function ClientJobsPanel({customerId,portalRole,contacts,onMessage}:{customerId:string;portalRole:string;contacts:ClientPortalContact[];onMessage:(message:string)=>void}){
  const [jobs,setJobs]=useState<ClientJob[]>([])
  const [requests,setRequests]=useState<ClientRequest[]>([])
  const [loading,setLoading]=useState(true)
  const [tab,setTab]=useState<'active'|'future'|'past'|'requests'>('active')
  const [selectedJob,setSelectedJob]=useState<ClientJob|null>(null)
  const [requestOpen,setRequestOpen]=useState(false)
  const canOperate=portalRole==='admin'||portalRole==='operations'

  const load=useCallback(async()=>{
    setLoading(true)
    const [j,r]=await Promise.all([
      db.rpc('get_my_customer_jobs',{_customer_id:customerId}),
      db.rpc('get_my_customer_job_requests',{_customer_id:customerId}),
    ])
    if(j.error)onMessage(j.error.message);else setJobs(j.data||[])
    if(r.error)onMessage(r.error.message);else setRequests((r.data||[]).map((item:any)=>({...item,decision_type:item.decision_type||null,decision_reason:item.decision_reason||null,reviewed_at:item.reviewed_at||null,status:item.status==='pending'?'submitted':item.status})))
    setLoading(false)
  },[customerId,onMessage])

  useEffect(()=>{void load()},[load])

  const groups=useMemo(()=>{
    const now=Date.now()
    const past:ClientJob[]=[]
    const future:ClientJob[]=[]
    const active:ClientJob[]=[]
    for(const job of jobs){
      if(job.status==='completed'||job.status==='cancelled'){past.push(job);continue}
      const start=job.scheduled_start?new Date(job.scheduled_start).getTime():null
      if(job.status!=='in_progress'&&start!==null&&start>now){future.push(job);continue}
      active.push(job)
    }
    active.sort((a,b)=>String(a.scheduled_start||'').localeCompare(String(b.scheduled_start||'')))
    future.sort((a,b)=>String(a.scheduled_start||'').localeCompare(String(b.scheduled_start||'')))
    past.sort((a,b)=>String(b.completed_at||b.scheduled_start||'').localeCompare(String(a.completed_at||a.scheduled_start||'')))
    return {active,future,past}
  },[jobs])

  const shown=tab==='requests'?[]:groups[tab]

  return <section className="portal-card client-jobs-card">
    <div className="client-jobs-head">
      <div className="portal-card-head client-jobs-title"><BriefcaseBusiness/><div><strong>Jobs</strong><span>Active, upcoming and past work with the details your team needs.</span></div></div>
      {canOperate&&<button className="portal-primary" onClick={()=>setRequestOpen(true)}><FilePlus2 size={16}/>Request job</button>}
    </div>

    <div className="client-job-tabs">
      <button className={tab==='active'?'active':''} onClick={()=>setTab('active')}>Active <span>{groups.active.length}</span></button>
      <button className={tab==='future'?'active':''} onClick={()=>setTab('future')}>Future <span>{groups.future.length}</span></button>
      <button className={tab==='past'?'active':''} onClick={()=>setTab('past')}>Past <span>{groups.past.length}</span></button>
      <button className={tab==='requests'?'active':''} onClick={()=>setTab('requests')}>Requests <span>{requests.length}</span></button>
    </div>

    {loading?<div className="portal-empty">Loading jobs…</div>:tab==='requests'?<RequestList requests={requests}/>:<div className="client-job-list">
      {shown.map(job=><button key={job.job_id} className="client-job-row" onClick={()=>setSelectedJob(job)}>
        <div className="client-job-main"><span className="client-job-number">{job.job_number}</span><strong>{job.title}</strong><small>{job.site_name||job.site_address||'Site not set'}</small></div>
        <div className="client-job-date"><CalendarDays size={15}/><span>{fmt(job.scheduled_start)}</span></div>
        <span className={`client-job-status status-${job.status}`}>{statusLabel(job.status)}</span>
        <ChevronRight size={18}/>
      </button>)}
      {!shown.length&&<div className="portal-empty">No {tab} jobs.</div>}
    </div>}

    {selectedJob&&<ClientJobModal customerId={customerId} job={selectedJob} contacts={contacts} canEdit={canOperate} onClose={()=>setSelectedJob(null)} onSaved={async()=>{await load();setSelectedJob(null)}} onMessage={onMessage}/>} 
    {requestOpen&&<RequestJobModal customerId={customerId} contacts={contacts} onClose={()=>setRequestOpen(false)} onCreated={async()=>{setRequestOpen(false);setTab('requests');await load()}} onMessage={onMessage}/>} 
  </section>
}

function RequestList({requests}:{requests:ClientRequest[]}){
  return <div className="client-request-list">{requests.map(request=><div className="client-request-row" key={request.request_id}>
    <div><span>{statusLabel(request.decision_type||request.status)}</span><strong>{request.title}</strong><small>{request.site_name||request.site_address||'Site not set'}</small></div>
    <div><b>Requested</b><span>{fmt(request.requested_start)}</span>{request.onsite_contact_name&&<small>Onsite: {request.onsite_contact_name}</small>}</div>
    {request.decision_reason&&<div className="client-request-decision"><b>{request.decision_type==='declined'?'Reason':'Changes from your request'}</b><span>{request.decision_reason}</span>{request.reviewed_at&&<small>Reviewed {fmt(request.reviewed_at)}</small>}</div>}
    {request.linked_job_id&&<span className="client-request-linked">Job created</span>}
  </div>)}{!requests.length&&<div className="portal-empty">No job requests yet.</div>}</div>
}

function ClientJobModal({customerId,job,contacts,canEdit,onClose,onSaved,onMessage}:{customerId:string;job:ClientJob;contacts:ClientPortalContact[];canEdit:boolean;onClose:()=>void;onSaved:()=>Promise<void>;onMessage:(message:string)=>void}){
  const [notes,setNotes]=useState(job.client_notes||'')
  const [contactId,setContactId]=useState(job.onsite_contact_id||'')
  const [busy,setBusy]=useState(false)

  const save=async()=>{
    setBusy(true)
    try{
      const [n,c]=await Promise.all([
        db.rpc('save_my_customer_job_note',{_customer_id:customerId,_job_id:job.job_id,_notes:notes}),
        db.rpc('set_my_customer_job_contact',{_customer_id:customerId,_job_id:job.job_id,_contact_id:contactId||null}),
      ])
      if(n.error)throw n.error
      if(c.error)throw c.error
      onMessage('Job information updated.')
      await onSaved()
    }catch(err){onMessage(readError(err))}finally{setBusy(false)}
  }

  return <div className="portal-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="portal-modal client-job-modal">
    <div className="portal-modal-head"><div><span className="client-job-number">{job.job_number}</span><strong>{job.title}</strong></div><button onClick={onClose}><X size={18}/></button></div>
    <div className="client-job-detail-grid">
      <div className="client-detail"><CalendarDays/><span><b>Scheduled</b>{fmt(job.scheduled_start)}</span></div>
      <div className="client-detail"><Clock3/><span><b>Expected finish</b>{fmt(job.scheduled_end)}</span></div>
      <div className="client-detail wide"><MapPin/><span><b>Site</b>{job.site_name||'Site not set'}{job.site_address&&<small>{job.site_address}</small>}</span></div>
    </div>

    <div className="client-contact-grid">
      <div className="client-contact-box"><UserRound/><div><b>Main operator</b><strong>{job.operator_name||'Not assigned yet'}</strong>{job.operator_phone&&<a href={`tel:${job.operator_phone}`}><Phone size={14}/>{job.operator_phone}</a>}</div></div>
      <div className="client-contact-box"><Headphones/><div><b>Dispatch</b>{job.dispatch_phone?<a href={`tel:${job.dispatch_phone}`}><Phone size={14}/>{job.dispatch_phone}</a>:<span>Not configured</span>}</div></div>
      <div className="client-contact-box warning"><AlertTriangle/><div><b>Emergency contact</b>{job.emergency_phone?<a href={`tel:${job.emergency_phone}`}><Phone size={14}/>{job.emergency_phone}</a>:<span>Not configured</span>}</div></div>
    </div>

    <label className="client-job-field"><span>Onsite contact</span>{canEdit?<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">No onsite contact</option>{contacts.filter(c=>c.status!=='archived').map(c=><option value={c.id} key={c.id}>{c.name}{c.title?` · ${c.title}`:''}</option>)}</select>:<div className="client-readonly-field">{job.onsite_contact_name||'No onsite contact'}{job.onsite_contact_phone&&<a href={`tel:${job.onsite_contact_phone}`}>{job.onsite_contact_phone}</a>}</div>}</label>

    <label className="client-job-field"><span><StickyNote size={14}/>Your company notes</span>{canEdit?<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add notes your team wants attached to this job."/>:<div className="client-readonly-field">{job.client_notes||'No client notes.'}</div>}</label>

    <div className="client-invoice-placeholder"><b>Invoices</b><span>Issued invoices for this work are available in the Invoices section of your client portal.</span></div>
    <div className="portal-modal-actions"><button className="portal-secondary" onClick={onClose}>Close</button>{canEdit&&<button className="portal-primary" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save changes'}</button>}</div>
  </section></div>
}

function RequestJobModal({customerId,contacts,onClose,onCreated,onMessage}:{customerId:string;contacts:ClientPortalContact[];onClose:()=>void;onCreated:()=>Promise<void>;onMessage:(message:string)=>void}){
  const [form,setForm]=useState({title:'',requested_start:'',site_name:'',site_address:'',onsite_contact_id:'',client_notes:''})
  const [busy,setBusy]=useState(false)
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true)
    try{
      const r=await db.rpc('create_my_customer_job_request',{
        _customer_id:customerId,
        _title:form.title.trim(),
        _requested_start:form.requested_start?new Date(form.requested_start).toISOString():null,
        _site_name:form.site_name.trim(),
        _site_address:form.site_address.trim(),
        _onsite_contact_id:form.onsite_contact_id||null,
        _client_notes:form.client_notes.trim(),
      })
      if(r.error)throw r.error
      if(isTestMode())addTestManagerRequestNotification(form.title.trim(),String(r.data||crypto.randomUUID()))
      onMessage('Job request submitted. Your service provider has been notified.')
      await onCreated()
    }catch(err){onMessage(readError(err))}finally{setBusy(false)}
  }
  return <div className="portal-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="portal-modal client-request-modal" onSubmit={submit}>
    <div className="portal-modal-head"><div><span className="client-job-number">NEW REQUEST</span><strong>Request a job</strong></div><button type="button" onClick={onClose}><X size={18}/></button></div>
    <label>What do you need?<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Example: Hydrovac daylighting" required/></label>
    <label>Requested date and time<input type="datetime-local" value={form.requested_start} onChange={e=>setForm({...form,requested_start:e.target.value})}/></label>
    <div className="client-request-grid"><label>Site name<input value={form.site_name} onChange={e=>setForm({...form,site_name:e.target.value})}/></label><label>Site address<input value={form.site_address} onChange={e=>setForm({...form,site_address:e.target.value})}/></label></div>
    <label>Onsite contact<select value={form.onsite_contact_id} onChange={e=>setForm({...form,onsite_contact_id:e.target.value})}><option value="">Choose later</option>{contacts.filter(c=>c.status!=='archived').map(c=><option key={c.id} value={c.id}>{c.name}{c.title?` · ${c.title}`:''}</option>)}</select></label>
    <label>Notes<textarea value={form.client_notes} onChange={e=>setForm({...form,client_notes:e.target.value})} placeholder="Anything dispatch should know about the request."/></label>
    <div className="portal-modal-actions"><button type="button" className="portal-secondary" onClick={onClose}>Cancel</button><button className="portal-primary" disabled={busy}>{busy?'Submitting…':'Submit request'}</button></div>
  </form></div>
}
