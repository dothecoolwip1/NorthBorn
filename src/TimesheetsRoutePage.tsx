import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Clock3, FileClock, Filter, Plus, RefreshCw, Send, Trash2, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './timesheets.css'

const db=supabase as any

type Organization={id:string;name:string}
type Employee={id:string;user_id:string|null;first_name:string;last_name:string;position:string|null;status:string}
type Job={id:string;job_number:string;title:string;status:string}
type Entry={id:string;organization_id:string;employee_id:string;job_id:string|null;work_date:string;start_time:string|null;end_time:string|null;break_minutes:number;regular_hours:number|string;overtime_hours:number|string;notes:string|null;status:'draft'|'submitted'|'approved'|'rejected';submitted_at:string|null;reviewed_at:string|null;reviewed_by:string|null;review_note:string|null;created_by:string;created_at:string;updated_at:string}
type Form={id:string|null;employee_id:string;job_id:string;work_date:string;start_time:string;end_time:string;break_minutes:string;regular_hours:string;overtime_hours:string;notes:string}

const MANAGE_ROLES=new Set(['owner','admin','supervisor','accounting'])
const SUBMIT_ROLES=new Set(['owner','admin','supervisor','mechanic','operator'])
const pad=(value:number)=>String(value).padStart(2,'0')
const localDate=(date=new Date())=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${value}T12:00:00`))
const number=(value:unknown)=>Number(value||0)
const hours=(value:number)=>`${value.toFixed(value%1===0?0:2)} h`
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Something went wrong.')

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
function emptyForm(employeeId=''):Form{return {id:null,employee_id:employeeId,job_id:'',work_date:localDate(),start_time:'',end_time:'',break_minutes:'0',regular_hours:'0',overtime_hours:'0',notes:''}}

export default function TimesheetsRoutePage(){
  const [organization,setOrganization]=useState<Organization|null>(null)
  const [roleKey,setRoleKey]=useState('')
  const [userId,setUserId]=useState('')
  const [employees,setEmployees]=useState<Employee[]>([])
  const [jobs,setJobs]=useState<Job[]>([])
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

  const canManage=MANAGE_ROLES.has(roleKey)
  const canSubmit=SUBMIT_ROLES.has(roleKey)
  const range=useMemo(()=>weekRange(weekOffset),[weekOffset])

  const load=useCallback(async()=>{
    setError('')
    const {data:sessionData}=await supabase.auth.getSession();const user=sessionData.session?.user
    if(!user){setLoading(false);return}setUserId(user.id)
    const membership=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(membership.error||!membership.data?.id){setError(membership.error?.message||'No active Northborn company was found.');setLoading(false);return}
    const roleResult=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id)
    const resolvedRole=roleResult.data?.[0]?.role?.key||'';setRoleKey(resolvedRole)
    const org=membership.data.organization as Organization;setOrganization(org)
    const [employeeResult,jobResult]=await Promise.all([
      db.from('employees').select('id,user_id,first_name,last_name,position,status').eq('organization_id',org.id).neq('status','archived').order('last_name').order('first_name'),
      db.from('jobs').select('id,job_number,title,status').eq('organization_id',org.id).neq('status','cancelled').order('created_at',{ascending:false}).limit(250),
    ])
    if(employeeResult.error||jobResult.error){setError(employeeResult.error?.message||jobResult.error?.message||'Unable to load timesheet setup.');setLoading(false);return}
    const employeeRows=(employeeResult.data||[]) as Employee[];setEmployees(employeeRows);setJobs((jobResult.data||[]) as Job[])
    const own=employeeRows.find(employee=>employee.user_id===user.id);setOwnEmployeeId(own?.id||'')
    setLoading(false)
  },[])

  const loadEntries=useCallback(async()=>{
    if(!organization)return
    const result=await db.from('timesheet_entries').select('id,organization_id,employee_id,job_id,work_date,start_time,end_time,break_minutes,regular_hours,overtime_hours,notes,status,submitted_at,reviewed_at,reviewed_by,review_note,created_by,created_at,updated_at').eq('organization_id',organization.id).gte('work_date',range.start).lte('work_date',range.end).order('work_date',{ascending:false}).order('created_at',{ascending:false})
    if(result.error)setError(result.error.message);else setEntries((result.data||[]) as Entry[])
  },[organization,range.start,range.end])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(organization)void loadEntries()},[organization,loadEntries])

  const visible=useMemo(()=>entries.filter(entry=>(employeeFilter==='all'||entry.employee_id===employeeFilter)&&(statusFilter==='all'||entry.status===statusFilter)),[entries,employeeFilter,statusFilter])
  const weekHours=useMemo(()=>visible.reduce((sum,entry)=>sum+number(entry.regular_hours)+number(entry.overtime_hours),0),[visible])
  const submittedCount=entries.filter(entry=>entry.status==='submitted').length
  const approvedHours=entries.filter(entry=>entry.status==='approved').reduce((sum,entry)=>sum+number(entry.regular_hours)+number(entry.overtime_hours),0)

  const openNew=()=>{
    const target=canManage?(employeeFilter!=='all'?employeeFilter:ownEmployeeId||employees[0]?.id||''):ownEmployeeId
    if(!target){setError('Your login is not linked to an employee record yet.');return}
    setForm(emptyForm(target));setError('');setNotice('')
  }
  const editEntry=(entry:Entry)=>setForm({id:entry.id,employee_id:entry.employee_id,job_id:entry.job_id||'',work_date:entry.work_date,start_time:entry.start_time?.slice(0,5)||'',end_time:entry.end_time?.slice(0,5)||'',break_minutes:String(entry.break_minutes||0),regular_hours:String(entry.regular_hours||0),overtime_hours:String(entry.overtime_hours||0),notes:entry.notes||''})
  const applyShift=()=>{if(!form)return;const calc=calculateShift(form.start_time,form.end_time,form.break_minutes);if(calc)setForm({...form,regular_hours:String(calc.regular),overtime_hours:String(calc.overtime)})}

  const save=async(submit:boolean)=>{
    if(!organization||!form)return
    setBusy(true);setError('');setNotice('')
    try{
      if(!form.employee_id)throw new Error('Choose an employee.')
      const regular=Math.max(0,Number(form.regular_hours)||0),overtime=Math.max(0,Number(form.overtime_hours)||0)
      if(regular+overtime<=0)throw new Error('Enter at least some worked hours.')
      if(regular+overtime>24)throw new Error('A single timesheet entry cannot exceed 24 hours.')
      const status=submit?'submitted':'draft'
      const payload={employee_id:form.employee_id,job_id:form.job_id||null,work_date:form.work_date,start_time:form.start_time||null,end_time:form.end_time||null,break_minutes:Math.max(0,Number(form.break_minutes)||0),regular_hours:regular,overtime_hours:overtime,notes:form.notes.trim()||null,status,submitted_at:submit?new Date().toISOString():null,reviewed_at:null,reviewed_by:null,review_note:null}
      if(form.id){const result=await db.from('timesheet_entries').update(payload).eq('id',form.id).eq('organization_id',organization.id);if(result.error)throw result.error}
      else {const result=await db.from('timesheet_entries').insert({...payload,organization_id:organization.id,created_by:userId});if(result.error)throw result.error}
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
      <div className="timesheet-filters"><Filter size={15}/>{employees.length>1&&<select value={employeeFilter} onChange={event=>setEmployeeFilter(event.target.value)}><option value="all">All employees</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select>}<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><button type="button" onClick={()=>void loadEntries()}><RefreshCw size={15}/>Refresh</button></div>
    </section>

    <section className="timesheet-metrics"><Metric label="Hours in view" value={hours(weekHours)}/><Metric label="Waiting review" value={String(submittedCount)}/><Metric label="Approved hours" value={hours(approvedHours)}/><Metric label="Entries" value={String(visible.length)}/></section>

    <section className="timesheet-list">
      {visible.map(entry=>{
        const employee=employees.find(item=>item.id===entry.employee_id),job=jobs.find(item=>item.id===entry.job_id),editable=(entry.status==='draft'||entry.status==='rejected')&&(canManage||entry.employee_id===ownEmployeeId)
        return <article className={`timesheet-entry status-${entry.status}`} key={entry.id}>
          <div className="timesheet-date"><strong>{dateLabel(entry.work_date)}</strong><span>{entry.start_time&&entry.end_time?`${entry.start_time.slice(0,5)} – ${entry.end_time.slice(0,5)}`:'Hours only'}</span></div>
          <div className="timesheet-entry-main"><div><UserRound size={15}/><strong>{employee?`${employee.first_name} ${employee.last_name}`:'Employee'}</strong>{job&&<span>{job.job_number} · {job.title}</span>}</div>{entry.notes&&<p>{entry.notes}</p>}{entry.review_note&&<small className="timesheet-review-note">Returned: {entry.review_note}</small>}</div>
          <div className="timesheet-hours"><strong>{hours(number(entry.regular_hours)+number(entry.overtime_hours))}</strong><span>{hours(number(entry.regular_hours))} regular{number(entry.overtime_hours)>0?` · ${hours(number(entry.overtime_hours))} OT`:''}</span></div>
          <div className="timesheet-state"><span>{entry.status}</span>{entry.break_minutes>0&&<small>{entry.break_minutes} min break</small>}</div>
          <div className="timesheet-actions">{canManage&&entry.status==='submitted'&&<><button type="button" className="approve" disabled={busy} onClick={()=>void review(entry,'approved')}><Check size={15}/>Approve</button><button type="button" className="reject" disabled={busy} onClick={()=>void review(entry,'rejected')}><X size={15}/>Return</button></>}{editable&&<><button type="button" disabled={busy} onClick={()=>editEntry(entry)}>Edit</button><button type="button" className="delete" disabled={busy} onClick={()=>void remove(entry)}><Trash2 size={15}/></button></>}</div>
        </article>})}
      {!visible.length&&<div className="timesheet-empty"><FileClock size={30}/><strong>No time entered for this view</strong><span>{canSubmit?'Add time to start the week.':'Nothing matches the current filters.'}</span></div>}
    </section>

    {form&&<div className="timesheet-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setForm(null)}}><section className="timesheet-modal"><header><div><span>{form.id?'EDIT TIME':'NEW TIME ENTRY'}</span><h2>{form.id?'Update timesheet':'Add worked time'}</h2></div><button type="button" disabled={busy} onClick={()=>setForm(null)}><X size={19}/></button></header><div className="timesheet-form">
      {canManage&&<label>Employee<select value={form.employee_id} onChange={event=>setForm({...form,employee_id:event.target.value})}>{employees.filter(employee=>employee.status==='active').map(employee=><option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label>}
      <label>Work date<input type="date" value={form.work_date} max={localDate()} onChange={event=>setForm({...form,work_date:event.target.value})}/></label>
      <label className="wide">Job<select value={form.job_id} onChange={event=>setForm({...form,job_id:event.target.value})}><option value="">General / no job</option>{jobs.map(job=><option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>)}</select></label>
      <label>Start time<input type="time" value={form.start_time} onChange={event=>setForm({...form,start_time:event.target.value})}/></label><label>End time<input type="time" value={form.end_time} onChange={event=>setForm({...form,end_time:event.target.value})}/></label>
      <label>Break minutes<input type="number" min="0" max="1440" step="5" value={form.break_minutes} onChange={event=>setForm({...form,break_minutes:event.target.value})}/></label><div className="timesheet-calc"><button type="button" onClick={applyShift} disabled={!calculateShift(form.start_time,form.end_time,form.break_minutes)}><Clock3 size={15}/>Calculate hours</button>{calculateShift(form.start_time,form.end_time,form.break_minutes)&&<span>{hours(calculateShift(form.start_time,form.end_time,form.break_minutes)!.total)} after break</span>}</div>
      <label>Regular hours<input type="number" min="0" max="24" step="0.25" value={form.regular_hours} onChange={event=>setForm({...form,regular_hours:event.target.value})}/></label><label>Overtime hours<input type="number" min="0" max="24" step="0.25" value={form.overtime_hours} onChange={event=>setForm({...form,overtime_hours:event.target.value})}/></label>
      <label className="wide">Notes<textarea rows={4} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="Work performed, delays, travel or anything payroll should know."/></label>
    </div><footer><button type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</button><button type="button" disabled={busy} onClick={()=>void save(false)}>Save draft</button><button type="button" className="timesheet-primary" disabled={busy} onClick={()=>void save(true)}><Send size={16}/>{busy?'Saving…':'Submit time'}</button></footer></section></div>}
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div className="timesheet-metric"><span>{label}</span><strong>{value}</strong></div>}
