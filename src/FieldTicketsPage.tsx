import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, CheckCircle2, ClipboardCheck, Clock3, FileSignature, Filter, MapPin, Plus,
  RefreshCw, Search, Send, Trash2, Truck, UserRound, X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './field-tickets.css'

const db=supabase as any
const MANAGE_ROLES=new Set(['owner','admin','supervisor','dispatcher','accounting'])
const SUBMIT_ROLES=new Set(['owner','admin','supervisor','dispatcher','operator'])
const TICKET_TYPES=[['field','Field service'],['hydrovac','Hydrovac'],['vacuum','Vacuum'],['water','Water'],['disposal','Disposal'],['other','Other']] as const
const UNITS=['hour','day','each','km','kg','tonne','m³','L','load','flat']

type Organization={id:string;name:string}
type Customer={id:string;name:string}
type Employee={id:string;user_id:string|null;first_name:string;last_name:string;position:string|null;status:string}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string;status:string}
type Job={id:string;customer_id:string;job_number:string;title:string;site_name:string|null;site_address:string|null;status:string}
type Ticket={id:string;organization_id:string;job_id:string|null;customer_id:string;primary_employee_id:string|null;vehicle_id:string|null;invoice_id:string|null;ticket_number:string;ticket_type:string;work_date:string;site_name:string|null;site_address:string|null;purchase_order:string|null;afe_number:string|null;start_time:string|null;end_time:string|null;travel_hours:number|string;work_hours:number|string;standby_hours:number|string;quantity:number|string|null;quantity_unit:string|null;disposal_location:string|null;disposal_manifest:string|null;work_description:string|null;operator_notes:string|null;customer_signed_by:string|null;customer_signature_data:string|null;customer_signed_at:string|null;status:'draft'|'submitted'|'approved'|'rejected';submitted_at:string|null;reviewed_at:string|null;reviewed_by:string|null;review_note:string|null;created_by:string;created_at:string;updated_at:string}
type Item={id:string;ticket_id:string;price_item_id:string|null;category:string;description:string;quantity:number|string;unit:string;rate_snapshot:number|string|null;sort_order:number;notes:string|null}
type DraftItem={id:string;category:string;description:string;quantity:string;unit:string;notes:string}
type Form={id:string|null;job_id:string;customer_id:string;primary_employee_id:string;vehicle_id:string;ticket_type:string;work_date:string;site_name:string;site_address:string;purchase_order:string;afe_number:string;start_time:string;end_time:string;travel_hours:string;work_hours:string;standby_hours:string;quantity:string;quantity_unit:string;disposal_location:string;disposal_manifest:string;work_description:string;operator_notes:string;customer_signed_by:string;customer_signature_data:string;customer_signed_at:string;items:DraftItem[]}

const uid=()=>crypto.randomUUID()
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
const num=(value:unknown)=>Number(value||0)
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`))
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Something went wrong.')
const blankItem=():DraftItem=>({id:uid(),category:'equipment',description:'',quantity:'1',unit:'hour',notes:''})
const blankForm=(employeeId=''):Form=>({id:null,job_id:'',customer_id:'',primary_employee_id:employeeId,vehicle_id:'',ticket_type:'field',work_date:today(),site_name:'',site_address:'',purchase_order:'',afe_number:'',start_time:'',end_time:'',travel_hours:'0',work_hours:'0',standby_hours:'0',quantity:'',quantity_unit:'',disposal_location:'',disposal_manifest:'',work_description:'',operator_notes:'',customer_signed_by:'',customer_signature_data:'',customer_signed_at:'',items:[blankItem()]})

export default function FieldTicketsPage(){
  const [organization,setOrganization]=useState<Organization|null>(null)
  const [roleKey,setRoleKey]=useState('')
  const [userId,setUserId]=useState('')
  const [customers,setCustomers]=useState<Customer[]>([])
  const [employees,setEmployees]=useState<Employee[]>([])
  const [vehicles,setVehicles]=useState<Vehicle[]>([])
  const [jobs,setJobs]=useState<Job[]>([])
  const [tickets,setTickets]=useState<Ticket[]>([])
  const [items,setItems]=useState<Item[]>([])
  const [ownEmployeeId,setOwnEmployeeId]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('all')
  const [typeFilter,setTypeFilter]=useState('all')
  const [form,setForm]=useState<Form|null>(null)
  const [viewing,setViewing]=useState<Ticket|null>(null)

  const canManage=MANAGE_ROLES.has(roleKey)
  const canSubmit=SUBMIT_ROLES.has(roleKey)

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data:sessionData}=await supabase.auth.getSession();const user=sessionData.session?.user
    if(!user){setLoading(false);return}setUserId(user.id)
    const membership=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(membership.error||!membership.data?.id){setError(membership.error?.message||'No active Northborn company was found.');setLoading(false);return}
    const roles=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id)
    const role=roles.data?.[0]?.role?.key||'';setRoleKey(role)
    const org=membership.data.organization as Organization;setOrganization(org)
    const [customerResult,employeeResult,vehicleResult,jobResult,ticketResult,itemResult]=await Promise.all([
      db.from('customers').select('id,name').eq('organization_id',org.id).eq('status','active').order('name'),
      db.from('employees').select('id,user_id,first_name,last_name,position,status').eq('organization_id',org.id).neq('status','archived').order('last_name'),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id',org.id).neq('status','archived').order('unit_number'),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,status').eq('organization_id',org.id).neq('status','cancelled').order('created_at',{ascending:false}).limit(300),
      db.from('field_tickets').select('*').eq('organization_id',org.id).order('work_date',{ascending:false}).order('created_at',{ascending:false}).limit(500),
      db.from('field_ticket_items').select('id,ticket_id,price_item_id,category,description,quantity,unit,rate_snapshot,sort_order,notes').eq('organization_id',org.id).order('sort_order'),
    ])
    const firstError=[customerResult,employeeResult,vehicleResult,jobResult,ticketResult,itemResult].find(result=>result.error)?.error
    if(firstError)setError(firstError.message)
    const employeeRows=(employeeResult.data||[]) as Employee[]
    setCustomers((customerResult.data||[]) as Customer[]);setEmployees(employeeRows);setVehicles((vehicleResult.data||[]) as Vehicle[]);setJobs((jobResult.data||[]) as Job[]);setTickets((ticketResult.data||[]) as Ticket[]);setItems((itemResult.data||[]) as Item[])
    setOwnEmployeeId(employeeRows.find(employee=>employee.user_id===user.id)?.id||'')
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const shown=useMemo(()=>tickets.filter(ticket=>{
    const customer=customers.find(item=>item.id===ticket.customer_id),job=jobs.find(item=>item.id===ticket.job_id),employee=employees.find(item=>item.id===ticket.primary_employee_id),vehicle=vehicles.find(item=>item.id===ticket.vehicle_id)
    const haystack=`${ticket.ticket_number} ${ticket.work_description||''} ${ticket.site_name||''} ${customer?.name||''} ${job?.job_number||''} ${job?.title||''} ${employee?.first_name||''} ${employee?.last_name||''} ${vehicle?.unit_number||''}`.toLowerCase()
    const q=query.trim().toLowerCase()
    return (!q||haystack.includes(q))&&(statusFilter==='all'||ticket.status===statusFilter)&&(typeFilter==='all'||ticket.ticket_type===typeFilter)
  }),[tickets,customers,jobs,employees,vehicles,query,statusFilter,typeFilter])

  const submitted=tickets.filter(ticket=>ticket.status==='submitted').length
  const approved=tickets.filter(ticket=>ticket.status==='approved').length
  const unsigned=tickets.filter(ticket=>ticket.status==='submitted'&&!ticket.customer_signed_at).length

  const openNew=()=>{
    if(!canSubmit){setError('Your role cannot create field tickets.');return}
    if(!canManage&&!ownEmployeeId){setError('Your login is not linked to an employee record yet.');return}
    setNotice('');setError('');setForm(blankForm(canManage?'':ownEmployeeId))
  }

  const openEdit=(ticket:Ticket)=>{
    const ticketItems=items.filter(item=>item.ticket_id===ticket.id).map(item=>({id:item.id,category:item.category,description:item.description,quantity:String(item.quantity),unit:item.unit,notes:item.notes||''}))
    setForm({id:ticket.id,job_id:ticket.job_id||'',customer_id:ticket.customer_id,primary_employee_id:ticket.primary_employee_id||'',vehicle_id:ticket.vehicle_id||'',ticket_type:ticket.ticket_type,work_date:ticket.work_date,site_name:ticket.site_name||'',site_address:ticket.site_address||'',purchase_order:ticket.purchase_order||'',afe_number:ticket.afe_number||'',start_time:ticket.start_time?.slice(0,5)||'',end_time:ticket.end_time?.slice(0,5)||'',travel_hours:String(ticket.travel_hours||0),work_hours:String(ticket.work_hours||0),standby_hours:String(ticket.standby_hours||0),quantity:ticket.quantity===null?'':String(ticket.quantity),quantity_unit:ticket.quantity_unit||'',disposal_location:ticket.disposal_location||'',disposal_manifest:ticket.disposal_manifest||'',work_description:ticket.work_description||'',operator_notes:ticket.operator_notes||'',customer_signed_by:ticket.customer_signed_by||'',customer_signature_data:ticket.customer_signature_data||'',customer_signed_at:ticket.customer_signed_at||'',items:ticketItems.length?ticketItems:[blankItem()]})
    setViewing(null);setError('');setNotice('')
  }

  const chooseJob=(jobId:string)=>{
    if(!form)return
    const job=jobs.find(item=>item.id===jobId)
    setForm({...form,job_id:jobId,customer_id:job?.customer_id||form.customer_id,site_name:job?.site_name||form.site_name,site_address:job?.site_address||form.site_address})
  }

  const save=async(submit:boolean)=>{
    if(!organization||!form)return
    setBusy(true);setError('');setNotice('')
    try{
      if(!form.customer_id)throw new Error('Choose a customer or job.')
      if(!canManage&&!form.job_id)throw new Error('Operator tickets must be linked to an assigned job.')
      if(!form.work_description.trim())throw new Error('Describe the work completed.')
      const totalHours=num(form.travel_hours)+num(form.work_hours)+num(form.standby_hours)
      if(totalHours>24)throw new Error('Travel, work and standby hours cannot total more than 24 hours.')
      const ticketPayload={job_id:form.job_id||null,customer_id:form.customer_id,primary_employee_id:form.primary_employee_id||null,vehicle_id:form.vehicle_id||null,ticket_type:form.ticket_type,work_date:form.work_date,site_name:form.site_name.trim()||null,site_address:form.site_address.trim()||null,purchase_order:form.purchase_order.trim()||null,afe_number:form.afe_number.trim()||null,start_time:form.start_time||null,end_time:form.end_time||null,travel_hours:num(form.travel_hours),work_hours:num(form.work_hours),standby_hours:num(form.standby_hours),quantity:form.quantity.trim()===''?null:num(form.quantity),quantity_unit:form.quantity_unit||null,disposal_location:form.disposal_location.trim()||null,disposal_manifest:form.disposal_manifest.trim()||null,work_description:form.work_description.trim(),operator_notes:form.operator_notes.trim()||null,customer_signed_by:form.customer_signed_by.trim()||null,customer_signature_data:form.customer_signature_data||null,customer_signed_at:form.customer_signature_data?(form.customer_signed_at||new Date().toISOString()):null,status:'draft',submitted_at:null,reviewed_at:null,reviewed_by:null,review_note:null}
      let ticketId=form.id
      if(ticketId){const update=await db.from('field_tickets').update(ticketPayload).eq('id',ticketId).eq('organization_id',organization.id);if(update.error)throw update.error}
      else {const insert=await db.from('field_tickets').insert({...ticketPayload,organization_id:organization.id,created_by:userId}).select('id,ticket_number').single();if(insert.error)throw insert.error;ticketId=insert.data.id}
      const removeItems=await db.from('field_ticket_items').delete().eq('organization_id',organization.id).eq('ticket_id',ticketId);if(removeItems.error)throw removeItems.error
      const cleanItems=form.items.filter(item=>item.description.trim())
      if(cleanItems.length){const insertItems=await db.from('field_ticket_items').insert(cleanItems.map((item,index)=>({organization_id:organization.id,ticket_id:ticketId,category:item.category,description:item.description.trim(),quantity:Math.max(0,num(item.quantity)),unit:item.unit,sort_order:index,notes:item.notes.trim()||null,created_by:userId})));if(insertItems.error)throw insertItems.error}
      if(submit){const submittedAt=new Date().toISOString();const submitResult=await db.from('field_tickets').update({status:'submitted',submitted_at:submittedAt,reviewed_at:null,reviewed_by:null,review_note:null}).eq('id',ticketId).eq('organization_id',organization.id);if(submitResult.error)throw submitResult.error}
      setForm(null);setNotice(submit?'Field ticket submitted for review.':'Draft ticket saved.');await load()
    }catch(caught){setError(readError(caught))}finally{setBusy(false)}
  }

  const review=async(ticket:Ticket,decision:'approved'|'rejected')=>{
    if(!organization||!canManage)return
    const reviewNote=decision==='rejected'?(window.prompt('Why is this ticket being returned?')||'').trim():''
    if(decision==='rejected'&&!reviewNote)return
    setBusy(true);setError('');setNotice('')
    const result=await db.from('field_tickets').update({status:decision,reviewed_at:new Date().toISOString(),reviewed_by:userId,review_note:reviewNote||null}).eq('id',ticket.id).eq('organization_id',organization.id).eq('status','submitted')
    if(result.error)setError(result.error.message);else{setNotice(decision==='approved'?`${ticket.ticket_number} approved.`:`${ticket.ticket_number} returned for changes.`);setViewing(null);await load()}setBusy(false)
  }

  const remove=async(ticket:Ticket)=>{
    if(!organization||!window.confirm(`Delete ${ticket.ticket_number}?`))return
    setBusy(true);setError('');const result=await db.from('field_tickets').delete().eq('id',ticket.id).eq('organization_id',organization.id);if(result.error)setError(result.error.message);else{setViewing(null);setNotice('Ticket deleted.');await load()}setBusy(false)
  }

  if(loading)return <div className="ticket-loading">Loading field tickets…</div>
  if(!organization)return <div className="ticket-loading">Field tickets are not available for this account.</div>

  return <main className="ticket-page">
    <section className="ticket-hero"><div><span>FIELD TICKETS</span><h1>From the truck to the office.</h1><p>Capture the work, hours, unit, quantities, disposal information and customer sign-off while the job is still fresh.</p></div>{canSubmit&&<button className="ticket-primary" type="button" onClick={openNew}><Plus size={17}/>New ticket</button>}</section>
    {error&&<div className="ticket-message error">{error}</div>}{notice&&<div className="ticket-message success"><CheckCircle2 size={17}/>{notice}</div>}

    <section className="ticket-metrics"><Metric label="All tickets" value={String(tickets.length)}/><Metric label="Waiting review" value={String(submitted)} attention={submitted>0}/><Metric label="Approved" value={String(approved)}/><Metric label="Unsigned submitted" value={String(unsigned)} attention={unsigned>0}/></section>

    <section className="ticket-toolbar"><div className="ticket-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search ticket, job, customer, operator or unit…"/></div><div className="ticket-filters"><Filter size={15}/><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Returned</option></select><select value={typeFilter} onChange={event=>setTypeFilter(event.target.value)}><option value="all">All types</option>{TICKET_TYPES.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select><button type="button" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button></div></section>

    <section className="ticket-grid">{shown.map(ticket=>{
      const customer=customers.find(item=>item.id===ticket.customer_id),job=jobs.find(item=>item.id===ticket.job_id),employee=employees.find(item=>item.id===ticket.primary_employee_id),vehicle=vehicles.find(item=>item.id===ticket.vehicle_id)
      return <button type="button" className={`ticket-card status-${ticket.status}`} key={ticket.id} onClick={()=>setViewing(ticket)}><div className="ticket-card-top"><span>{ticket.ticket_number}</span><em>{ticket.status}</em></div><h2>{ticket.work_description||label(ticket.ticket_type)}</h2><p>{customer?.name||'Customer'}{job?` · ${job.job_number}`:''}</p><div className="ticket-card-details"><span><ClipboardCheck size={14}/>{dateLabel(ticket.work_date)}</span>{vehicle&&<span><Truck size={14}/>Unit {vehicle.unit_number}</span>}{employee&&<span><UserRound size={14}/>{employee.first_name} {employee.last_name}</span>}{ticket.site_name&&<span><MapPin size={14}/>{ticket.site_name}</span>}</div><div className="ticket-card-bottom"><span>{label(ticket.ticket_type)}</span><strong>{num(ticket.travel_hours)+num(ticket.work_hours)+num(ticket.standby_hours)} h</strong>{ticket.customer_signed_at?<span className="signed"><FileSignature size={14}/>Signed</span>:<span>Not signed</span>}</div></button>})}</section>
    {!shown.length&&<div className="ticket-empty"><ClipboardCheck size={31}/><strong>No tickets match this view</strong><span>{canSubmit?'Create the first field ticket or change your filters.':'Change the filters to see more tickets.'}</span></div>}

    {viewing&&<TicketDetail ticket={viewing} items={items.filter(item=>item.ticket_id===viewing.id)} customers={customers} jobs={jobs} employees={employees} vehicles={vehicles} canManage={canManage} ownEmployeeId={ownEmployeeId} busy={busy} onClose={()=>setViewing(null)} onEdit={()=>openEdit(viewing)} onReview={review} onDelete={remove}/>} 
    {form&&<TicketEditor form={form} setForm={setForm} customers={customers} jobs={jobs} employees={employees} vehicles={vehicles} canManage={canManage} busy={busy} onClose={()=>setForm(null)} onChooseJob={chooseJob} onSave={save}/>} 
  </main>
}

function Metric({label,value,attention=false}:{label:string;value:string;attention?:boolean}){return <div className={attention?'ticket-metric attention':'ticket-metric'}><span>{label}</span><strong>{value}</strong></div>}

function TicketDetail({ticket,items,customers,jobs,employees,vehicles,canManage,ownEmployeeId,busy,onClose,onEdit,onReview,onDelete}:{ticket:Ticket;items:Item[];customers:Customer[];jobs:Job[];employees:Employee[];vehicles:Vehicle[];canManage:boolean;ownEmployeeId:string;busy:boolean;onClose:()=>void;onEdit:()=>void;onReview:(ticket:Ticket,decision:'approved'|'rejected')=>Promise<void>;onDelete:(ticket:Ticket)=>Promise<void>}){
  const customer=customers.find(item=>item.id===ticket.customer_id),job=jobs.find(item=>item.id===ticket.job_id),employee=employees.find(item=>item.id===ticket.primary_employee_id),vehicle=vehicles.find(item=>item.id===ticket.vehicle_id)
  const editable=(ticket.status==='draft'||ticket.status==='rejected')&&(canManage||ticket.primary_employee_id===ownEmployeeId)
  return <div className="ticket-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><section className="ticket-detail"><header><div><span>{label(ticket.ticket_type)} · {ticket.status}</span><h2>{ticket.ticket_number}</h2></div><button type="button" onClick={onClose}><X size={19}/></button></header><div className="ticket-detail-body"><div className="ticket-summary"><Info label="Customer" value={customer?.name||'Unknown'}/><Info label="Job" value={job?`${job.job_number} · ${job.title}`:'Not linked'}/><Info label="Work date" value={dateLabel(ticket.work_date)}/><Info label="Unit" value={vehicle?`Unit ${vehicle.unit_number} · ${vehicle.name||vehicle.vehicle_type}`:'Not set'}/><Info label="Operator" value={employee?`${employee.first_name} ${employee.last_name}`:'Not set'}/><Info label="PO / AFE" value={[ticket.purchase_order,ticket.afe_number].filter(Boolean).join(' · ')||'Not set'}/></div><section><h3>Work performed</h3><p>{ticket.work_description||'No description.'}</p>{ticket.operator_notes&&<small>{ticket.operator_notes}</small>}</section><section><h3>Time & quantity</h3><div className="ticket-summary"><Info label="Shift" value={ticket.start_time&&ticket.end_time?`${ticket.start_time.slice(0,5)} – ${ticket.end_time.slice(0,5)}`:'Not set'}/><Info label="Travel" value={`${num(ticket.travel_hours)} h`}/><Info label="Work" value={`${num(ticket.work_hours)} h`}/><Info label="Standby" value={`${num(ticket.standby_hours)} h`}/><Info label="Quantity" value={ticket.quantity!==null?`${ticket.quantity} ${ticket.quantity_unit||''}`:'Not set'}/><Info label="Disposal" value={[ticket.disposal_location,ticket.disposal_manifest].filter(Boolean).join(' · ')||'Not set'}/></div></section><section><h3>Service items</h3>{items.length?<div className="ticket-item-readonly">{items.map(item=><div key={item.id}><strong>{item.description}</strong><span>{item.quantity} {item.unit}{item.notes?` · ${item.notes}`:''}</span></div>)}</div>:<p>No service items recorded.</p>}</section><section><h3>Customer sign-off</h3>{ticket.customer_signature_data?<div className="ticket-signature-view"><img src={ticket.customer_signature_data} alt={`Signature from ${ticket.customer_signed_by||'customer'}`}/><div><strong>{ticket.customer_signed_by||'Customer'}</strong><span>{ticket.customer_signed_at?new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(ticket.customer_signed_at)):'Signed'}</span></div></div>:<p>No customer signature captured.</p>}</section>{ticket.review_note&&<div className="ticket-review-return"><strong>Returned for changes</strong><span>{ticket.review_note}</span></div>}</div><footer>{editable&&<><button type="button" onClick={onEdit}>Edit ticket</button><button type="button" className="danger" onClick={()=>void onDelete(ticket)}><Trash2 size={15}/>Delete</button></>}{canManage&&ticket.status==='submitted'&&<><button type="button" className="danger" disabled={busy} onClick={()=>void onReview(ticket,'rejected')}><X size={15}/>Return</button><button type="button" className="ticket-primary" disabled={busy} onClick={()=>void onReview(ticket,'approved')}><Check size={15}/>Approve</button></>}</footer></section></div>
}

function TicketEditor({form,setForm,customers,jobs,employees,vehicles,canManage,busy,onClose,onChooseJob,onSave}:{form:Form;setForm:(form:Form)=>void;customers:Customer[];jobs:Job[];employees:Employee[];vehicles:Vehicle[];canManage:boolean;busy:boolean;onClose:()=>void;onChooseJob:(jobId:string)=>void;onSave:(submit:boolean)=>Promise<void>}){
  const setItem=(id:string,patch:Partial<DraftItem>)=>setForm({...form,items:form.items.map(item=>item.id===id?{...item,...patch}:item)})
  const customerJobs=form.customer_id?jobs.filter(job=>job.customer_id===form.customer_id):jobs
  return <div className="ticket-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><section className="ticket-editor"><header><div><span>{form.id?'EDIT FIELD TICKET':'NEW FIELD TICKET'}</span><h2>{form.id?'Update ticket':'Capture field work'}</h2></div><button type="button" onClick={onClose} disabled={busy}><X size={19}/></button></header><div className="ticket-editor-body"><div className="ticket-form-grid">
    <Field label="Ticket type"><select value={form.ticket_type} onChange={event=>setForm({...form,ticket_type:event.target.value})}>{TICKET_TYPES.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></Field><Field label="Work date"><input type="date" max={today()} value={form.work_date} onChange={event=>setForm({...form,work_date:event.target.value})}/></Field>
    {canManage&&<Field label="Customer"><select value={form.customer_id} onChange={event=>setForm({...form,customer_id:event.target.value,job_id:''})}><option value="">Choose customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>}
    <Field label="Job"><select value={form.job_id} onChange={event=>onChooseJob(event.target.value)}><option value="">{canManage?'No linked job':'Choose assigned job'}</option>{customerJobs.map(job=><option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>)}</select></Field>
    {canManage&&<Field label="Primary operator"><select value={form.primary_employee_id} onChange={event=>setForm({...form,primary_employee_id:event.target.value})}><option value="">Not set</option>{employees.filter(employee=>employee.status==='active').map(employee=><option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></Field>}
    <Field label="Unit"><select value={form.vehicle_id} onChange={event=>setForm({...form,vehicle_id:event.target.value})}><option value="">Not set</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>Unit {vehicle.unit_number} · {vehicle.name||vehicle.vehicle_type}</option>)}</select></Field>
    <Field label="PO number"><input value={form.purchase_order} onChange={event=>setForm({...form,purchase_order:event.target.value})}/></Field><Field label="AFE number"><input value={form.afe_number} onChange={event=>setForm({...form,afe_number:event.target.value})}/></Field>
    <Field label="Site name"><input value={form.site_name} onChange={event=>setForm({...form,site_name:event.target.value})}/></Field><Field label="Site address"><input value={form.site_address} onChange={event=>setForm({...form,site_address:event.target.value})}/></Field>
  </div><div className="ticket-section"><h3>Work and time</h3><div className="ticket-form-grid"><Field label="Start time"><input type="time" value={form.start_time} onChange={event=>setForm({...form,start_time:event.target.value})}/></Field><Field label="End time"><input type="time" value={form.end_time} onChange={event=>setForm({...form,end_time:event.target.value})}/></Field><Field label="Travel hours"><input type="number" min="0" max="24" step="0.25" value={form.travel_hours} onChange={event=>setForm({...form,travel_hours:event.target.value})}/></Field><Field label="Work hours"><input type="number" min="0" max="24" step="0.25" value={form.work_hours} onChange={event=>setForm({...form,work_hours:event.target.value})}/></Field><Field label="Standby hours"><input type="number" min="0" max="24" step="0.25" value={form.standby_hours} onChange={event=>setForm({...form,standby_hours:event.target.value})}/></Field><Field label="Quantity"><div className="ticket-quantity"><input type="number" min="0" step="0.001" value={form.quantity} onChange={event=>setForm({...form,quantity:event.target.value})}/><select value={form.quantity_unit} onChange={event=>setForm({...form,quantity_unit:event.target.value})}><option value="">Unit</option>{UNITS.map(unit=><option key={unit}>{unit}</option>)}</select></div></Field></div><Field label="Work completed"><textarea rows={4} required value={form.work_description} onChange={event=>setForm({...form,work_description:event.target.value})} placeholder="Describe what was completed on site."/></Field><Field label="Operator notes"><textarea rows={3} value={form.operator_notes} onChange={event=>setForm({...form,operator_notes:event.target.value})} placeholder="Delays, site conditions, special instructions or billing notes."/></Field></div>
  <div className="ticket-section"><h3>Service items</h3><div className="ticket-items-editor">{form.items.map((item,index)=><div className="ticket-item-row" key={item.id}><select value={item.category} onChange={event=>setItem(item.id,{category:event.target.value})}><option value="equipment">Equipment</option><option value="labour">Labour</option><option value="disposal">Disposal</option><option value="material">Material</option><option value="transport">Transport</option><option value="other">Other</option></select><input className="description" value={item.description} onChange={event=>setItem(item.id,{description:event.target.value})} placeholder="Service or item"/><input type="number" min="0" step="0.25" value={item.quantity} onChange={event=>setItem(item.id,{quantity:event.target.value})}/><select value={item.unit} onChange={event=>setItem(item.id,{unit:event.target.value})}>{UNITS.map(unit=><option key={unit}>{unit}</option>)}</select><button type="button" aria-label={`Remove item ${index+1}`} onClick={()=>setForm({...form,items:form.items.filter(row=>row.id!==item.id)})}><Trash2 size={15}/></button></div>)}</div><button type="button" className="ticket-add-item" onClick={()=>setForm({...form,items:[...form.items,blankItem()]})}><Plus size={15}/>Add service item</button></div>
  {(form.ticket_type==='disposal'||form.ticket_type==='vacuum'||form.ticket_type==='hydrovac')&&<div className="ticket-section"><h3>Disposal</h3><div className="ticket-form-grid"><Field label="Disposal location"><input value={form.disposal_location} onChange={event=>setForm({...form,disposal_location:event.target.value})}/></Field><Field label="Manifest / disposal ticket"><input value={form.disposal_manifest} onChange={event=>setForm({...form,disposal_manifest:event.target.value})}/></Field></div></div>}
  <div className="ticket-section"><h3>Customer sign-off</h3><Field label="Customer name"><input value={form.customer_signed_by} onChange={event=>setForm({...form,customer_signed_by:event.target.value})} placeholder="Name of person approving the work"/></Field><SignaturePad value={form.customer_signature_data} onChange={data=>setForm({...form,customer_signature_data:data,customer_signed_at:data?new Date().toISOString():''})}/></div>
  </div><footer><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" onClick={()=>void onSave(false)} disabled={busy}>Save draft</button><button type="button" className="ticket-primary" onClick={()=>void onSave(true)} disabled={busy}><Send size={16}/>{busy?'Saving…':'Submit ticket'}</button></footer></section></div>
}

function SignaturePad({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const canvasRef=useRef<HTMLCanvasElement|null>(null),drawing=useRef(false)
  const point=(event:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=canvasRef.current!;const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*(canvas.width/rect.width),y:(event.clientY-rect.top)*(canvas.height/rect.height)}}
  const start=(event:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=canvasRef.current!;canvas.setPointerCapture(event.pointerId);const ctx=canvas.getContext('2d')!;const p=point(event);ctx.beginPath();ctx.moveTo(p.x,p.y);drawing.current=true}
  const move=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const ctx=canvasRef.current!.getContext('2d')!;const p=point(event);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#101820';ctx.lineTo(p.x,p.y);ctx.stroke()}
  const finish=()=>{if(!drawing.current)return;drawing.current=false;onChange(canvasRef.current!.toDataURL('image/png'))}
  const clear=()=>{const canvas=canvasRef.current!;canvas.getContext('2d')!.clearRect(0,0,canvas.width,canvas.height);onChange('')}
  useEffect(()=>{if(!value||!canvasRef.current)return;const image=new Image();image.onload=()=>{const canvas=canvasRef.current;if(canvas)canvas.getContext('2d')?.drawImage(image,0,0,canvas.width,canvas.height)};image.src=value},[value])
  return <div className="signature-pad"><div className="signature-canvas-wrap"><canvas ref={canvasRef} width={800} height={220} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/><span>Sign here</span></div><button type="button" onClick={clear}>Clear signature</button></div>
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="ticket-field"><span>{label}</span>{children}</label>}
function Info({label,value}:{label:string;value:string}){return <div className="ticket-info"><span>{label}</span><strong>{value}</strong></div>}
