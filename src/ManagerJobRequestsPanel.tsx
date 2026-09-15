import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Clock3, MapPin, Pencil, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isTestMode, readTestLabData, TEST_CLIENT_REQUESTS_KEY, TEST_ORG, TEST_USERS, writeTestLabData } from './test-lab'
import './manager-job-requests.css'

const db=supabase as any
const TEST_NOTIFICATION_KEY='northborn_test_table_v1_user_notifications'

type RequestRow={
  request_id:string
  customer_id:string
  customer_name:string
  requested_by:string
  requested_by_email:string
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

type Decision='approved'|'modified'|'declined'
const fmt=(value:string|null)=>value?new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'No requested time'
const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong.')
const toLocal=(value:string|null)=>{if(!value)return '';const d=new Date(value);const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}

function readTestRequests():RequestRow[]{
  try{
    const rows=JSON.parse(localStorage.getItem(TEST_CLIENT_REQUESTS_KEY)||'[]') as any[]
    const data=readTestLabData(),customer=data.customers[0]
    return rows.map(row=>({...row,customer_id:row.customer_id||customer?.id||'test-customer',customer_name:row.customer_name||customer?.name||'Test Client',requested_by:row.requested_by||TEST_USERS.client.id,requested_by_email:row.requested_by_email||TEST_USERS.client.email,decision_type:row.decision_type||null,decision_reason:row.decision_reason||null,reviewed_at:row.reviewed_at||null,status:row.status==='pending'?'submitted':row.status}))
  }catch{return[]}
}
function writeTestRequests(rows:RequestRow[]){localStorage.setItem(TEST_CLIENT_REQUESTS_KEY,JSON.stringify(rows));window.dispatchEvent(new Event('northborn-test-data-changed'))}
function addTestClientNotification(request:RequestRow,decision:Decision,reason:string,jobId:string|null){
  let rows:any[]=[];try{rows=JSON.parse(localStorage.getItem(TEST_NOTIFICATION_KEY)||'[]')}catch{}
  const title=decision==='declined'?'Job request declined':decision==='modified'?'Job request approved with changes':'Job request approved'
  const message=decision==='declined'?`${request.title} was declined. ${reason}`:decision==='modified'?`${request.title} was approved with changes. ${reason}`:`${request.title} was approved and added to the schedule.`
  rows.unshift({id:crypto.randomUUID(),organization_id:TEST_ORG.id,recipient_user_id:TEST_USERS.client.id,notification_type:`job_request_${decision}`,title,message,entity_type:'job_request',entity_id:request.request_id,payload:{decision,reason:reason||null,linked_job_id:jobId},read_at:null,created_at:new Date().toISOString()})
  localStorage.setItem(TEST_NOTIFICATION_KEY,JSON.stringify(rows));window.dispatchEvent(new Event('northborn-test-notifications-changed'))
}

export default function ManagerJobRequestsPanel({organizationId,onChanged}:{organizationId:string;onChanged:()=>Promise<unknown>}){
  const [requests,setRequests]=useState<RequestRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[review,setReview]=useState<{request:RequestRow;decision:Decision}|null>(null)
  const testMode=isTestMode()
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    if(testMode){setRequests(readTestRequests());setLoading(false);return}
    const result=await db.rpc('get_customer_job_requests_for_org',{_organization_id:organizationId})
    if(result.error)setError(result.error.message);else setRequests(result.data||[])
    setLoading(false)
  },[organizationId,testMode])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{const refresh=()=>void load();window.addEventListener('northborn-test-data-changed',refresh);return()=>window.removeEventListener('northborn-test-data-changed',refresh)},[load])
  const pending=useMemo(()=>requests.filter(r=>['submitted','reviewing'].includes(r.status)),[requests])
  const recent=useMemo(()=>requests.filter(r=>!['submitted','reviewing'].includes(r.status)).slice(0,4),[requests])

  const approve=async(request:RequestRow)=>{
    setReview({request,decision:'approved'})
  }

  return <section className="manager-request-panel"><div className="manager-request-panel-head"><div><span>CLIENT REQUESTS</span><h2>Requested jobs</h2><p>Approve, modify or decline work requested through the client portal.</p></div><b>{pending.length}</b></div>{error&&<div className="manager-request-error">{error}</div>}{loading?<div className="manager-request-empty">Loading client requests…</div>:<div className="manager-request-list">{pending.map(request=><article key={request.request_id} className="manager-request-card"><div className="manager-request-main"><span>{request.customer_name}</span><h3>{request.title}</h3><div><small><CalendarDays size={14}/>{fmt(request.requested_start)}</small><small><MapPin size={14}/>{request.site_name||request.site_address||'Site not set'}</small></div>{request.client_notes&&<p>{request.client_notes}</p>}</div><div className="manager-request-actions"><button className="approve" onClick={()=>void approve(request)}><Check size={16}/>Approve</button><button onClick={()=>setReview({request,decision:'modified'})}><Pencil size={16}/>Modify</button><button className="decline" onClick={()=>setReview({request,decision:'declined'})}><X size={16}/>Decline</button></div></article>)}{!pending.length&&<div className="manager-request-empty">No job requests waiting for review.</div>}</div>}{recent.length>0&&<details className="manager-request-history"><summary>Recent decisions</summary>{recent.map(request=><div key={request.request_id}><span><strong>{request.title}</strong><small>{request.customer_name}</small></span><em>{request.decision_type||request.status}</em>{request.decision_reason&&<p>{request.decision_reason}</p>}<ChevronRight size={15}/></div>)}</details>}{review&&<ReviewModal organizationId={organizationId} request={review.request} decision={review.decision} testMode={testMode} onClose={()=>setReview(null)} onDone={async()=>{setReview(null);await load();await onChanged()}}/>}</section>
}

function ReviewModal({organizationId,request,decision,testMode,onClose,onDone}:{organizationId:string;request:RequestRow;decision:Decision;testMode:boolean;onClose:()=>void;onDone:()=>Promise<void>}){
  const [form,setForm]=useState({title:request.title,scheduled_start:toLocal(request.requested_start),site_name:request.site_name||'',site_address:request.site_address||'',notes:request.client_notes||'',reason:''})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const needsReason=decision==='modified'||decision==='declined'
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError('')
    try{
      if(needsReason&&!form.reason.trim())throw new Error('Add a reason before sending this decision to the client.')
      if(testMode){
        const rows=readTestRequests();const index=rows.findIndex(row=>row.request_id===request.request_id);if(index<0)throw new Error('Request not found.')
        let jobId:string|null=null
        if(decision!=='declined'){
          const data=readTestLabData();jobId=crypto.randomUUID();const start=form.scheduled_start?new Date(form.scheduled_start).toISOString():request.requested_start
          data.jobs.push({id:jobId,organization_id:TEST_ORG.id,customer_id:request.customer_id,job_number:`TEST-${String(Date.now()).slice(-6)}`,title:form.title.trim()||request.title,site_name:form.site_name.trim()||null,site_address:form.site_address.trim()||null,scheduled_start:start,scheduled_end:null,shop_time:null,onsite_time:start,status:'scheduled',notes:form.notes.trim()||null,completed_at:null});writeTestLabData(data)
        }
        rows[index]={...rows[index],title:decision==='modified'?form.title:rows[index].title,requested_start:decision==='modified'&&form.scheduled_start?new Date(form.scheduled_start).toISOString():rows[index].requested_start,site_name:decision==='modified'?form.site_name:rows[index].site_name,site_address:decision==='modified'?form.site_address:rows[index].site_address,client_notes:decision==='modified'?form.notes:rows[index].client_notes,status:decision==='declined'?'declined':'approved',linked_job_id:jobId,decision_type:decision,decision_reason:form.reason.trim()||null,reviewed_at:new Date().toISOString()}
        writeTestRequests(rows);addTestClientNotification(request,decision,form.reason.trim(),jobId)
      }else{
        const result=await db.rpc('review_customer_job_request',{_organization_id:organizationId,_request_id:request.request_id,_decision:decision,_reason:form.reason.trim(),_title:form.title.trim(),_scheduled_start:form.scheduled_start?new Date(form.scheduled_start).toISOString():null,_site_name:form.site_name.trim(),_site_address:form.site_address.trim(),_notes:form.notes.trim()})
        if(result.error)throw result.error
      }
      await onDone()
    }catch(err){setError(readError(err))}finally{setBusy(false)}
  }
  const title=decision==='approved'?'Approve job request':decision==='modified'?'Modify and approve request':'Decline job request'
  return <div className="manager-request-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><form className="manager-request-modal" onSubmit={submit}><div className="manager-request-modal-head"><div><span>CLIENT REQUEST</span><h2>{title}</h2><p>{request.customer_name} · {request.title}</p></div><button type="button" onClick={onClose} disabled={busy}><X size={20}/></button></div>{error&&<div className="manager-request-error">{error}</div>}{decision!=='declined'&&<div className="manager-request-form"><label className="wide"><span>Job title</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/></label><label><span>Scheduled time</span><input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})}/></label><label><span>Site name</span><input value={form.site_name} onChange={e=>setForm({...form,site_name:e.target.value})}/></label><label className="wide"><span>Site address</span><input value={form.site_address} onChange={e=>setForm({...form,site_address:e.target.value})}/></label><label className="wide"><span>Job notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div>}{needsReason&&<label className="manager-request-reason"><span>Reason sent to client</span><textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder={decision==='declined'?'Explain why the request cannot be accepted.':'Explain what was changed from their request.'} required/></label>}<div className="manager-request-modal-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className={decision==='declined'?'decline':'approve'} disabled={busy}>{busy?'Saving…':decision==='declined'?'Decline and notify client':decision==='modified'?'Approve changes and notify':'Approve and schedule'}</button></div></form></div>
}
