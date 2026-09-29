import { hasAnyRole } from './role-access'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Clock3, FileClock, Filter, Plus, RefreshCw, Send, Trash2, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import TemplateRuntimeFields, { validateTemplateAnswers } from './TemplateRuntimeFields'
import FormSignaturePad from './FormSignaturePad'
import RecordAttachments from './RecordAttachments'
import NorthbornSelect from './NorthbornSelect'
import type { TemplateRow } from './template-manager-data'
import './timesheets.css'

const db=supabase as any

type Organization={id:string;name:string}
type Employee={id:string;user_id:string|null;first_name:string;last_name:string;position:string|null;status:string}
type Job={id:string;job_number:string;title:string;status:string}
type Assignment={id:string;job_id:string;employee_id:string|null;role:string|null}
type Entry={id:string;organization_id:string;employee_id:string;job_id:string|null;reference_number?:string|null;work_date:string;start_time:string|null;end_time:string|null;break_minutes:number;regular_hours:number|string;overtime_hours:number|string;notes:string|null;status:'draft'|'submitted'|'approved'|'rejected';submitted_at:string|null;reviewed_at:string|null;reviewed_by:string|null;review_note:string|null;created_by:string;created_at:string;updated_at:string;template_id?:string|null;template_version?:number|null;custom_answers?:Record<string,unknown>;employee_signature_data?:string|null;employee_signed_at?:string|null}
type Form={id:string|null;employee_id:string;job_id:string;reference_number:string;work_date:string;start_time:string;end_time:string;break_minutes:string;regular_hours:string;overtime_hours:string;notes:string;template_id:string;template_version:number|null;custom_answers:Record<string,string|number|boolean|null|undefined>;employee_signature_data:string;employee_signed_at:string;pending_files:File[]}

const MANAGE_ROLES=new Set(['owner','admin','supervisor','accounting'])
const SUBMIT_ROLES=new Set(['owner','admin','supervisor','mechanic','operator'])
const pad=(value:number)=>String(value).padStart(2,'0')
const localDate=(date=new Date())=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${value}T12:00:00`))
const number=(value:unknown)=>Number(value||0)
const hours=(value:number)=>`${value.toFixed(value%1===0?0:2)} h`
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Something went wrong.')
const safeFileName=(name:string)=>name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'attachment'

function startOfWeek(date=new Date()){
  const copy=new Date(date);const day=copy.getDay();const diff=day===0?-6:1-day;copy.setDate(copy.getDate()+diff);copy.setHours(12,0,0,0);return copy
}
function weekRange(offset:number){const start=startOfWeek();start.setDate(start.getDate()+offset*7);const end=new Date(start);end.setDate(start.getDate()+6);return {start:localDate(start),end:localDate(end),label:`${new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric'}).format(start)} – ${new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(end)}`}}
function calculateShift(start:string,end:string,breakMinutes:string){
  if(!start||!end)return null
  const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number)
  let minutes=(eh*60+em)-(sh*60+sm);if(minutes<0)minutes+=1440
  minutes=Math.max(0,minutes-Math.max(0,Number(breakMinutes)||0));const total=Math.round(minutes/60*100)/100
  return {total,regular:Math.min(8,total),overtime:Math.max(0,Math.round((total-8)*100)/100)}
}
function emptyForm(employeeId='',template?:TemplateRow|null):Form{return {id:null,employee_id:employeeId,job_id:'',reference_number:'',work_date:localDate(),start_time:'',end_time:'',break_minutes:'0',regular_hours:'0',overtime_hours:'0',notes:'',template_id:template?.id||'',template_version:template?.version||null,custom_answers:{},employee_signature_data:'',employee_signed_at:'',pending_files:[]}}

export default function TimesheetsRoutePage(){
  const [searchParams] = useSearchParams()
  const requestedJobId = searchParams.get('job') || ''
  const requestedNew = searchParams.get('new') === '1'
  const deepLinkHandled = useRef(false)
  const [organization,setOrganization]=useState<Organization|null>(null)
  const [assignedRoles,setAssignedRoles]=useState<string[]>([])
  const [userId,setUserId]=useState('')
  const [employees,setEmployees]=useState<Employee[]>([])
  const [jobs,setJobs]=useState<Job[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [entries,setEntries]=useState<Entry[]>([])
  const [ownEmployeeId,setOwnEmployeeId]=useState('')
  const [weekOffset,setWeekOffset]=useState(0)
  const [employeeFilter,setEmployeeFilter]=useState('all')
  const [statusFilter,setStatusFilter]=useState('all')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [form,setForm]=useState<Form|null>(null)
  const [activeTemplate,setActiveTemplate]=useState<TemplateRow|null>(null)

  const canManage=hasAnyRole(assignedRoles,MANAGE_ROLES)
  const canSubmit=hasAnyRole(assignedRoles,SUBMIT_ROLES)
  const range=useMemo(()=>weekRange(weekOffset),[weekOffset])

  const load=useCallback(async()=>{
    setError('')
    const {data:sessionData}=await supabase.auth.getSession();const user=sessionData.session?.user
    if(!user){setLoading(false);return}setUserId(user.id)
    const membership=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(membership.error||!membership.data?.id){setError(membership.error?.message||'No active Northborn company was found.');setLoading(false);return}
    const roleResult=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id)
    const roleKeys=(roleResult.data||[]).map((row:any)=>row.role?.key).filter(Boolean)
    setAssignedRoles(roleKeys)
    const org=membership.data.organization as Organization;setOrganization(org)
    const [employeeResult,jobResult,assignmentResult,templateResult]=await Promise.all([
      db.from('employees').select('id,user_id,first_name,last_name,position,status').eq('organization_id',org.id).neq('status','archived').order('last_name').order('first_name'),
      db.from('jobs').select('id,job_number,title,status').eq('organization_id',org.id).neq('status','cancelled').order('created_at',{ascending:false}).limit(250),
      db.from('dispatch_assignments').select('id,job_id,employee_id,role').eq('organization_id',org.id),
      db.from('document_templates').select('*').eq('organization_id',org.id).eq('document_type','timesheet').eq('status','active').order('is_default',{ascending:false}).order('updated_at',{ascending:false}).limit(1).maybeSingle(),
    ])
    if(employeeResult.error||jobResult.error||assignmentResult.error){setError(employeeResult.error?.message||jobResult.error?.message||assignmentResult.error?.message||'Unable to load timesheet setup.');setLoading(false);return}
    const employeeRows=(employeeResult.data||[]) as Employee[];const own=employeeRows.find(employee=>employee.user_id===user.id);const managesTimesheets=hasAnyRole(roleKeys,MANAGE_ROLES);setEmployees(managesTimesheets?employeeRows:(own?[own]:[]));setJobs((jobResult.data||[]) as Job[]);setAssignments((assignmentResult.data||[]) as Assignment[]);setActiveTemplate((templateResult.data||null) as TemplateRow|null)
    setOwnEmployeeId(own?.id||'')
    setLoading(false)
  },[])

  const loadEntries=useCallback(async()=>{
    if(!organization)return
    if(!canManage&&!ownEmployeeId){setEntries([]);return}
    let query=db.from('timesheet_entries').select('*').eq('organization_id',organization.id).gte('work_date',range.start).lte('work_date',range.end)
    if(!canManage)query=query.eq('employee_id',ownEmployeeId)
    const result=await query.order('work_date',{ascending:false}).order('created_at',{ascending:false})
    if(result.error)setError(result.error.message);else setEntries((result.data||[]) as Entry[])
  },[organization,range.start,range.end,canManage,ownEmployeeId])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(loading||deepLinkHandled.current||!requestedNew)return
    const target=canManage?(employeeFilter!=='all'?employeeFilter:ownEmployeeId||employees[0]?.id||''):ownEmployeeId
    if(!target)return
    deepLinkHandled.current=true
    const base=emptyForm(target,activeTemplate)
    if(requestedJobId){
      const assigned=assignments.some(assignment=>assignment.job_id===requestedJobId&&assignment.employee_id===target)
      if(assigned)setForm({...base,job_id:requestedJobId})
      else {setForm(base);setError('That job is not assigned to this employee. Use the manual reference field for outside work.')}
    }else setForm(base)
  },[loading,requestedNew,requestedJobId,canManage,employeeFilter,ownEmployeeId,employees,activeTemplate,assignments])
  useEffect(()=>{if(organization)void loadEntries()},[organization,loadEntries])

  const scopedEntries=useMemo(()=>canManage?entries:entries.filter(entry=>entry.employee_id===ownEmployeeId),[entries,canManage,ownEmployeeId])
  const visible=useMemo(()=>scopedEntries.filter(entry=>(canManage?(employeeFilter==='all'||entry.employee_id===employeeFilter):true)&&(statusFilter==='all'||entry.status===statusFilter)),[scopedEntries,canManage,employeeFilter,statusFilter])
  const weekHours=useMemo(()=>visible.reduce((sum,entry)=>sum+number(entry.regular_hours)+number(entry.overtime_hours),0),[visible])
  const submittedCount=scopedEntries.filter(entry=>entry.status==='submitted').length
  const approvedHours=scopedEntries.filter(entry=>entry.status==='approved').reduce((sum,entry)=>sum+number(entry.regular_hours)+number(entry.overtime_hours),0)

  const openNew=()=>{
    const target=canManage?(employeeFilter!=='all'?employeeFilter:ownEmployeeId||employees[0]?.id||''):ownEmployeeId
    if(!target){setError('Your login is not linked to an employee record yet.');return}
    setForm(emptyForm(target,activeTemplate));setError('');setNotice('')
  }
  const editEntry=(entry:Entry)=>setForm({id:entry.id,employee_id:entry.employee_id,job_id:entry.job_id||'',reference_number:entry.reference_number||'',work_date:entry.work_date,start_time:entry.start_time?.slice(0,5)||'',end_time:entry.end_time?.slice(0,5)||'',break_minutes:String(entry.break_minutes||0),regular_hours:String(entry.regular_hours||0),overtime_hours:String(entry.overtime_hours||0),notes:entry.notes||'',template_id:entry.template_id||activeTemplate?.id||'',template_version:entry.template_version||activeTemplate?.version||null,custom_answers:(entry.custom_answers||{}) as Record<string,string|number|boolean|null|undefined>,employee_signature_data:entry.employee_signature_data||'',employee_signed_at:entry.employee_signed_at||'',pending_files:[]})
  const applyShift=()=>{if(!form)return;const calc=calculateShift(form.start_time,form.end_time,form.break_minutes);if(calc)setForm({...form,regular_hours:String(calc.regular),overtime_hours:String(calc.overtime)})}

  const save=async(submit:boolean)=>{
    if(!organization||!form)return
    setBusy(true);setError('');setNotice('')
    try{
      if(!form.employee_id)throw new Error('Choose an employee.')
      const regular=Math.max(0,Number(form.regular_hours)||0),overtime=Math.max(0,Number(form.overtime_hours)||0)
      if(regular+overtime<=0)throw new Error('Enter at least some worked hours.')
      if(regular+overtime>24)throw new Error('A single timesheet entry cannot exceed 24 hours.')
      const templateValidation=validateTemplateAnswers(form.template_id===activeTemplate?.id?activeTemplate:null,form.custom_answers)
      if(templateValidation)throw new Error(templateValidation)
      if(submit&&!form.employee_signature_data)throw new Error('Sign the timesheet before submitting it.')
      if(form.job_id&&!assignments.some(assignment=>assignment.job_id===form.job_id&&assignment.employee_id===form.employee_id))throw new Error('That job is not assigned to this employee. Choose an assigned job or enter a manual job / invoice reference instead.')
      const status=submit?'submitted':'draft'
      const payload={employee_id:form.employee_id,job_id:form.job_id||null,reference_number:form.reference_number.trim()||null,work_date:form.work_date,start_time:form.start_time||null,end_time:form.end_time||null,break_minutes:Math.max(0,Number(form.break_minutes)||0),regular_hours:regular,overtime_hours:overtime,notes:form.notes.trim()||null,template_id:form.template_id||null,template_version:form.template_id?form.template_version:null,custom_answers:form.custom_answers,employee_signature_data:form.employee_signature_data||null,employee_signed_at:form.employee_signature_data?(form.employee_signed_at||new Date().toISOString()):null,status,submitted_at:submit?new Date().toISOString():null,reviewed_at:null,reviewed_by:null,review_note:null}
      let entryId=form.id
      if(entryId){const result=await db.from('timesheet_entries').update(payload).eq('id',entryId).eq('organization_id',organization.id);if(result.error)throw result.error}
      else {const result=await db.from('timesheet_entries').insert({...payload,organization_id:organization.id,created_by:userId}).select('id').single();if(result.error)throw result.error;entryId=result.data.id}
      for(const file of form.pending_files){
        const path=organization.id+'/timesheets/'+entryId+'/'+crypto.randomUUID()+'-'+safeFileName(file.name)
        const upload=await supabase.storage.from('form-attachments').upload(path,file,{contentType:file.type||undefined})
        if(upload.error)throw upload.error
        const meta=await db.from('timesheet_attachments').insert({organization_id:organization.id,timesheet_entry_id:entryId,file_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size,created_by:userId})
        if(meta.error){await supabase.storage.from('form-attachments').remove([path]);throw meta.error}
      }
      setNotice(submit?'Timesheet entry submitted for review.':'Draft timesheet saved.');setForm(null);await loadEntries()
    }catch(caught){setError(readError(caught))}finally{setBusy(false)}
  }

  const review=async(entry:Entry,decision:'approved'|'rejected')=>{
    if(!organization||!canManage)return
    const note=decision==='rejected'?(window.prompt('Reason for rejecting this timesheet entry:')||'').trim():''
    if(decision==='rejected'&&!note)return
    setBusy(true);setError('');setNotice('')
    const result=await db.from('timesheet_entries').update({status:decision,reviewed_at:new Date().toISOString(),reviewed_by:userId,review_note:note||null}).eq('id',entry.id).eq('organization_id',organization.id).eq('status','submitted')
    if(result.error)setError(result.error.message);else{setNotice(decision==='approved'?'Timesheet approved.':'Timesheet returned to the employee.');await loadEntries()}setBusy(false)
  }

  const remove=async(entry:Entry)=>{
    if(!organization||!window.confirm('Delete this timesheet entry?'))return
    setBusy(true);setError('');const result=await db.from('timesheet_entries').delete().eq('id',entry.id).eq('organization_id',organization.id);if(result.error)setError(result.error.message);else{setNotice('Timesheet entry deleted.');await loadEntries()}setBusy(false)
  }

  if(loading)return <div className="timesheet-loading">Loading timesheets…</div>
  if(!organization)return <div className="timesheet-loading">Timesheets are not available for this account.</div>

  return <main className="timesheet-page">
    <section className="timesheet-hero"><div><span>TIMESHEETS</span><h1>{canManage?'Hours ready for review.':'Your hours, without the paper trail.'}</h1><p>{canManage?'Review submitted time, check job allocation and keep weekly hours organized.':'Enter your shift, connect it to a job and submit it when the day is complete.'}</p></div>{canSubmit&&<button type="button" className="timesheet-primary" onClick={openNew}><Plus size={17}/>Add time</button>}</section>

    {error&&<div className="timesheet-message error">{error}</div>}{notice&&<div className="timesheet-message success"><Check size={16}/>{notice}</div>}

    <section className="timesheet-controls">
      <div className="timesheet-week"><button type="button" aria-label="Previous week" onClick={()=>setWeekOffset(value=>value-1)}><ChevronLeft size={18}/></button><div><small>WORK WEEK</small><strong>{range.label}</strong></div><button type="button" aria-label="Next week" disabled={weekOffset>=0} onClick={()=>setWeekOffset(value=>Math.min(0,value+1))}><ChevronRight size={18}/></button></div>
      <div className="timesheet-filters"><Filter size={15}/>{canManage&&employees.length>1&&<NorthbornSelect ariaLabel="Filter by employee" className="compact" value={employeeFilter} onChange={setEmployeeFilter} options={[{value:'all',label:'All employees'},...employees.map(employee=>({value:employee.id,label:`${employee.first_name} ${employee.last_name}`,detail:employee.position||undefined}))]}/>}<NorthbornSelect ariaLabel="Filter by status" className="compact" value={statusFilter} onChange={setStatusFilter} options={[{value:'all',label:'All statuses'},{value:'draft',label:'Draft'},{value:'submitted',label:'Submitted'},{value:'approved',label:'Approved'},{value:'rejected',label:'Rejected'}]}/><button type="button" onClick={()=>void loadEntries()}><RefreshCw size={15}/>Refresh</button></div>
    </section>

    <section className="timesheet-metrics"><Metric label="Hours in view" value={hours(weekHours)}/><Metric label="Waiting review" value={String(submittedCount)}/><Metric label="Approved hours" value={hours(approvedHours)}/><Metric label="Entries" value={String(visible.length)}/></section>

    <section className="timesheet-list">
      {visible.map(entry=>{
        const employee=employees.find(item=>item.id===entry.employee_id),job=jobs.find(item=>item.id===entry.job_id),editable=(entry.status==='draft'||entry.status==='rejected')&&(canManage||entry.employee_id===ownEmployeeId)
        return <article className={`timesheet-entry status-${entry.status}`} key={entry.id}>
          <div className="timesheet-date"><strong>{dateLabel(entry.work_date)}</strong><span>{entry.start_time&&entry.end_time?`${entry.start_time.slice(0,5)} – ${entry.end_time.slice(0,5)}`:'Hours only'}</span></div>
          <div className="timesheet-entry-main"><div><UserRound size={15}/><strong>{employee?`${employee.first_name} ${employee.last_name}`:'Employee'}</strong>{job&&<span>{job.job_number} · {job.title}</span>}{entry.reference_number&&<span className="timesheet-reference">Ref: {entry.reference_number}</span>}</div>{entry.notes&&<p>{entry.notes}</p>}{entry.review_note&&<small className="timesheet-review-note">Returned: {entry.review_note}</small>}{entry.employee_signed_at&&<small>Signed {new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(entry.employee_signed_at))}</small>}{entry.custom_answers&&Object.keys(entry.custom_answers).length>0&&<div className="timesheet-template-summary">{Object.entries(entry.custom_answers).map(([key,value])=><small key={key}>{key.replaceAll('_',' ')}: {String(value??'')}</small>)}</div>}<RecordAttachments organizationId={entry.organization_id} recordType="timesheet" recordId={entry.id} onError={setError}/></div>
          <div className="timesheet-hours"><strong>{hours(number(entry.regular_hours)+number(entry.overtime_hours))}</strong><span>{hours(number(entry.regular_hours))} regular{number(entry.overtime_hours)>0?` · ${hours(number(entry.overtime_hours))} OT`:''}</span></div>
          <div className="timesheet-state"><span>{entry.status}</span>{entry.break_minutes>0&&<small>{entry.break_minutes} min break</small>}</div>
          <div className="timesheet-actions"><button type="button" onClick={()=>{const base=new URL(import.meta.env.BASE_URL,window.location.origin);const url=new URL('timesheet-print',base);url.searchParams.set('entry',entry.id);window.open(url.toString(),'_blank','noopener,noreferrer')}}>Print</button>{canManage&&entry.status==='submitted'&&<><button type="button" className="approve" disabled={busy} onClick={()=>void review(entry,'approved')}><Check size={15}/>Approve</button><button type="button" className="reject" disabled={busy} onClick={()=>void review(entry,'rejected')}><X size={15}/>Return</button></>}{editable&&<><button type="button" disabled={busy} onClick={()=>editEntry(entry)}>Edit</button><button type="button" className="delete" disabled={busy} onClick={()=>void remove(entry)}><Trash2 size={15}/></button></>}</div>
        </article>})}
      {!visible.length&&<div className="timesheet-empty"><FileClock size={30}/><strong>No time entered for this view</strong><span>{canSubmit?'Add time to start the week.':'Nothing matches the current filters.'}</span></div>}
    </section>

    {form&&<div className="timesheet-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setForm(null)}}><section className="timesheet-modal"><header><div><span>{form.id?'EDIT TIME':'NEW TIME ENTRY'}</span><h2>{form.id?'Update timesheet':'Add worked time'}</h2></div><button type="button" disabled={busy} onClick={()=>setForm(null)}><X size={19}/></button></header><div className="timesheet-form">
      {canManage&&<label>Employee<NorthbornSelect ariaLabel="Timesheet employee" value={form.employee_id} onChange={employeeId=>setForm({...form,employee_id:employeeId,job_id:assignments.some(assignment=>assignment.employee_id===employeeId&&assignment.job_id===form.job_id)?form.job_id:''})} options={employees.filter(employee=>employee.status==='active').map(employee=>({value:employee.id,label:`${employee.first_name} ${employee.last_name}`,detail:employee.position||undefined}))}/></label>}
      <label>Work date<input type="date" value={form.work_date} max={localDate()} onChange={event=>setForm({...form,work_date:event.target.value})}/></label>
      <label className="wide">Assigned Northborn job<NorthbornSelect ariaLabel="Assigned job" value={form.job_id} onChange={jobId=>setForm({...form,job_id:jobId})} placeholder="General / no linked Northborn job" options={[{value:'',label:'General / no linked Northborn job',detail:'Use the manual reference below for outside or unmatched work.'},...jobs.map(job=>{const assigned=assignments.some(assignment=>assignment.job_id===job.id&&assignment.employee_id===form.employee_id);return {value:job.id,label:`${job.job_number} · ${job.title}`,detail:assigned?'Assigned to this employee':'Not assigned to this employee',disabled:!assigned}})]}/><small className="timesheet-field-help">Only jobs assigned through Dispatch can be linked. Unassigned jobs stay visible but cannot be selected.</small></label>
      <label className="wide">Job / invoice / reference number<input type="text" maxLength={120} value={form.reference_number} onChange={event=>setForm({...form,reference_number:event.target.value})} placeholder="e.g. CLIENT-4472, INV-2026-1001, PO-7784"/><small className="timesheet-field-help">Use this when the work does not have a Northborn job assignment, or when payroll needs an outside job, invoice or PO reference.</small></label>
      <label>Start time<input type="time" value={form.start_time} onChange={event=>setForm({...form,start_time:event.target.value})}/></label><label>End time<input type="time" value={form.end_time} onChange={event=>setForm({...form,end_time:event.target.value})}/></label>
      <label>Break minutes<input type="number" min="0" max="1440" step="5" value={form.break_minutes} onChange={event=>setForm({...form,break_minutes:event.target.value})}/></label><div className="timesheet-calc"><button type="button" onClick={applyShift} disabled={!calculateShift(form.start_time,form.end_time,form.break_minutes)}><Clock3 size={15}/>Calculate hours</button>{calculateShift(form.start_time,form.end_time,form.break_minutes)&&<span>{hours(calculateShift(form.start_time,form.end_time,form.break_minutes)!.total)} after break</span>}</div>
      <label>Regular hours<input type="number" min="0" max="24" step="0.25" value={form.regular_hours} onChange={event=>setForm({...form,regular_hours:event.target.value})}/></label><label>Overtime hours<input type="number" min="0" max="24" step="0.25" value={form.overtime_hours} onChange={event=>setForm({...form,overtime_hours:event.target.value})}/></label>
      <label className="wide">Notes<textarea rows={4} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="Work performed, delays, travel or anything payroll should know."/></label>{form.template_id===activeTemplate?.id&&<div className="wide"><TemplateRuntimeFields template={activeTemplate} values={form.custom_answers} onChange={values=>setForm({...form,custom_answers:values})}/></div>}<label className="wide">Attachments<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={event=>setForm({...form,pending_files:Array.from(event.target.files||[])})}/>{form.pending_files.length>0&&<small>{form.pending_files.length} file{form.pending_files.length===1?'':'s'} will upload when saved.</small>}</label><div className="wide"><FormSignaturePad value={form.employee_signature_data} onChange={data=>setForm({...form,employee_signature_data:data,employee_signed_at:data?new Date().toISOString():''})} label="Employee signature"/></div>
    </div><footer><button type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</button><button type="button" disabled={busy} onClick={()=>void save(false)}>Save draft</button><button type="button" className="timesheet-primary" disabled={busy} onClick={()=>void save(true)}><Send size={16}/>{busy?'Saving…':'Submit time'}</button></footer></section></div>}
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div className="timesheet-metric"><span>{label}</span><strong>{value}</strong></div>}
