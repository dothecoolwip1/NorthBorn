import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSignature, ReceiptText, RefreshCw, Send, TicketCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './billing-queue.css'

const db=supabase as any
const BILLING_ROLES=new Set(['owner','admin','accounting'])

type Organization={id:string;name:string}
type Customer={id:string;name:string}
type Job={id:string;job_number:string;title:string}
type Ticket={id:string;customer_id:string;job_id:string|null;ticket_number:string;ticket_type:string;work_date:string;work_description:string|null;purchase_order:string|null;afe_number:string|null;customer_signed_by:string|null;customer_signed_at:string|null;invoice_id:string|null;approved_at?:string|null;reviewed_at:string|null;quantity:number|string|null;quantity_unit:string|null;work_hours:number|string;travel_hours:number|string;standby_hours:number|string}
type Item={id:string;ticket_id:string;description:string;quantity:number|string;unit:string;rate_snapshot:number|string|null}

const num=(value:unknown)=>Number(value||0)
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`))
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Something went wrong.')

export default function BillingQueuePage(){
  const navigate=useNavigate()
  const [organization,setOrganization]=useState<Organization|null>(null)
  const [roleKey,setRoleKey]=useState('')
  const [customers,setCustomers]=useState<Customer[]>([])
  const [jobs,setJobs]=useState<Job[]>([])
  const [tickets,setTickets]=useState<Ticket[]>([])
  const [items,setItems]=useState<Item[]>([])
  const [loading,setLoading]=useState(true)
  const [busyId,setBusyId]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data:sessionData}=await supabase.auth.getSession();const user=sessionData.session?.user
    if(!user){setLoading(false);return}
    const membership=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(membership.error||!membership.data?.id){setError(membership.error?.message||'No active company found.');setLoading(false);return}
    const roles=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id)
    const role=roles.data?.[0]?.role?.key||'';setRoleKey(role)
    const org=membership.data.organization as Organization;setOrganization(org)
    if(!BILLING_ROLES.has(role)){setLoading(false);return}
    const [ticketResult,customerResult,jobResult,itemResult]=await Promise.all([
      db.from('field_tickets').select('id,customer_id,job_id,ticket_number,ticket_type,work_date,work_description,purchase_order,afe_number,customer_signed_by,customer_signed_at,invoice_id,reviewed_at,quantity,quantity_unit,work_hours,travel_hours,standby_hours').eq('organization_id',org.id).eq('status','approved').order('work_date',{ascending:false}).limit(500),
      db.from('customers').select('id,name').eq('organization_id',org.id).order('name'),
      db.from('jobs').select('id,job_number,title').eq('organization_id',org.id).order('created_at',{ascending:false}).limit(500),
      db.from('field_ticket_items').select('id,ticket_id,description,quantity,unit,rate_snapshot').eq('organization_id',org.id),
    ])
    const firstError=[ticketResult,customerResult,jobResult,itemResult].find(result=>result.error)?.error
    if(firstError)setError(firstError.message)
    setTickets((ticketResult.data||[]) as Ticket[]);setCustomers((customerResult.data||[]) as Customer[]);setJobs((jobResult.data||[]) as Job[]);setItems((itemResult.data||[]) as Item[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const ready=useMemo(()=>tickets.filter(ticket=>!ticket.invoice_id),[tickets])
  const converted=useMemo(()=>tickets.filter(ticket=>ticket.invoice_id),[tickets])
  const unsigned=ready.filter(ticket=>!ticket.customer_signed_at).length
  const zeroRateItems=useMemo(()=>ready.reduce((count,ticket)=>count+items.filter(item=>item.ticket_id===ticket.id&&item.rate_snapshot===null).length,0),[ready,items])

  const createInvoice=async(ticket:Ticket)=>{
    if(!organization)return
    setBusyId(ticket.id);setError('');setNotice('')
    try{
      const result=await db.rpc('create_invoice_from_field_ticket',{_organization_id:organization.id,_ticket_id:ticket.id})
      if(result.error)throw result.error
      const number=String(result.data?.invoice_number||'Invoice draft')
      setNotice(`${number} created from ${ticket.ticket_number}. Review rates and billing details before issuing it.`)
      await load()
    }catch(caught){setError(readError(caught))}finally{setBusyId('')}
  }

  if(loading)return <div className="billing-loading">Loading billing queue…</div>
  if(!organization)return <Navigate to="/" replace/>
  if(!BILLING_ROLES.has(roleKey))return <Navigate to="/invoices" replace/>

  return <main className="billing-page">
    <section className="billing-hero"><div><span>BILLING QUEUE</span><h1>Approved work, ready to bill.</h1><p>Turn approved field tickets into invoice drafts without retyping the customer, job, PO/AFE, work description or service quantities.</p></div><div className="billing-hero-actions"><button type="button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button><button type="button" className="billing-primary" onClick={()=>navigate('/invoices')}><ReceiptText size={16}/>Open invoices</button></div></section>
    {error&&<div className="billing-message error">{error}</div>}{notice&&<div className="billing-message success"><CheckCircle2 size={16}/>{notice}</div>}
    <section className="billing-metrics"><Metric label="Ready to invoice" value={String(ready.length)} attention={ready.length>0}/><Metric label="Unsigned ready tickets" value={String(unsigned)} attention={unsigned>0}/><Metric label="Service rows to price" value={String(zeroRateItems)}/><Metric label="Already converted" value={String(converted.length)}/></section>

    <section className="billing-section"><div className="billing-section-head"><div><span>READY</span><h2>Approved, not yet invoiced</h2></div></div>{ready.length?<div className="billing-list">{ready.map(ticket=>{
      const customer=customers.find(item=>item.id===ticket.customer_id),job=jobs.find(item=>item.id===ticket.job_id),ticketItems=items.filter(item=>item.ticket_id===ticket.id),hours=num(ticket.work_hours)+num(ticket.travel_hours)+num(ticket.standby_hours)
      return <article className="billing-card" key={ticket.id}><div className="billing-card-icon"><TicketCheck size={21}/></div><div className="billing-card-main"><div className="billing-card-title"><span>{ticket.ticket_number}</span><strong>{ticket.work_description||label(ticket.ticket_type)}</strong></div><div className="billing-card-meta"><span>{customer?.name||'Customer'}</span>{job&&<span>{job.job_number} · {job.title}</span>}<span>{dateLabel(ticket.work_date)}</span>{hours>0&&<span>{hours} h</span>}</div><div className="billing-card-flags">{ticket.customer_signed_at?<span className="signed"><FileSignature size={13}/>Signed by {ticket.customer_signed_by||'customer'}</span>:<span className="warn">No customer signature</span>}{ticket.purchase_order&&<span>PO {ticket.purchase_order}</span>}{ticket.afe_number&&<span>AFE {ticket.afe_number}</span>}<span>{ticketItems.length} service item{ticketItems.length===1?'':'s'}</span></div></div><button type="button" className="billing-primary" disabled={busyId===ticket.id} onClick={()=>void createInvoice(ticket)}><Send size={15}/>{busyId===ticket.id?'Creating…':'Create invoice draft'}</button></article>})}</div>:<div className="billing-empty"><CheckCircle2 size={30}/><strong>Billing queue is clear</strong><span>Approved field tickets will appear here until they are converted to invoice drafts.</span></div>}</section>

    {converted.length>0&&<section className="billing-section converted"><div className="billing-section-head"><div><span>RECENTLY CONVERTED</span><h2>Already sent to invoicing</h2></div></div><div className="billing-compact-list">{converted.slice(0,20).map(ticket=>{const customer=customers.find(item=>item.id===ticket.customer_id);return <button type="button" key={ticket.id} onClick={()=>navigate('/invoices')}><div><strong>{ticket.ticket_number}</strong><span>{customer?.name||'Customer'} · {dateLabel(ticket.work_date)}</span></div><ReceiptText size={17}/></button>})}</div></section>}
  </main>
}

function Metric({label,value,attention=false}:{label:string;value:string;attention?:boolean}){return <div className={attention?'billing-metric attention':'billing-metric'}><span>{label}</span><strong>{value}</strong></div>}
