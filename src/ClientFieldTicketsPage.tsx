import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ClipboardCheck, FileSignature, MapPin, Printer, Search, X } from 'lucide-react'
import { Navigate, NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './client-field-tickets.css'

const db=supabase as any

type PortalContext={portal_user_id:string;organization_id:string;organization_name:string;customer_id:string;customer_name:string;portal_role:string}
type Ticket={ticket_id:string;ticket_number:string;ticket_type:string;work_date:string;job_id:string|null;job_number:string|null;job_title:string|null;site_name:string|null;site_address:string|null;work_description:string|null;travel_hours:number|string;work_hours:number|string;standby_hours:number|string;quantity:number|string|null;quantity_unit:string|null;customer_signed_by:string|null;customer_signed_at:string|null;approved_at:string|null}
type TicketDetail={ticket:Record<string,any>;line_items:Array<{item_id:string;category:string;description:string;quantity:number|string;unit:string;sort_order:number}>}

const num=(value:unknown)=>Number(value||0)
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'short',day:'numeric'}).format(new Date(`${value}T12:00:00`))
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Unable to load field tickets.')

export default function ClientFieldTicketsPage(){
  const [context,setContext]=useState<PortalContext|null>(null)
  const [tickets,setTickets]=useState<Ticket[]>([])
  const [selected,setSelected]=useState<TicketDetail|null>(null)
  const [loading,setLoading]=useState(true)
  const [detailLoading,setDetailLoading]=useState(false)
  const [error,setError]=useState('')
  const [search,setSearch]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const ctx=await db.rpc('get_my_customer_portal_context')
      if(ctx.error)throw ctx.error
      const portal=(ctx.data||[])[0] as PortalContext|undefined
      if(!portal){setContext(null);setTickets([]);return}
      setContext(portal)
      const result=await db.rpc('get_my_customer_field_tickets',{_customer_id:portal.customer_id})
      if(result.error)throw result.error
      setTickets((result.data||[]) as Ticket[])
    }catch(caught){setError(readError(caught))}finally{setLoading(false)}
  },[])

  useEffect(()=>{void load()},[load])

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase()
    if(!q)return tickets
    return tickets.filter(ticket=>[ticket.ticket_number,ticket.ticket_type,ticket.job_number,ticket.job_title,ticket.site_name,ticket.site_address,ticket.work_description].some(value=>String(value||'').toLowerCase().includes(q)))
  },[tickets,search])

  const openTicket=async(ticket:Ticket)=>{
    if(!context)return
    setDetailLoading(true);setError('')
    try{
      const result=await db.rpc('get_my_customer_field_ticket_detail',{_customer_id:context.customer_id,_ticket_id:ticket.ticket_id})
      if(result.error)throw result.error
      setSelected(result.data as TicketDetail)
    }catch(caught){setError(readError(caught))}finally{setDetailLoading(false)}
  }

  const printTicket=(ticketId:string)=>{
    if(!context)return
    const base=new URL(import.meta.env.BASE_URL,window.location.origin)
    const url=new URL('client-ticket-print',base)
    url.searchParams.set('customer',context.customer_id)
    url.searchParams.set('ticket',ticketId)
    window.open(url.toString(),'_blank','noopener,noreferrer')
  }

  if(loading)return <div className="client-tickets-loading">Loading your field tickets…</div>
  if(!context)return <Navigate to="/" replace/>

  return <main className="client-tickets-page">
    <header className="client-tickets-header"><NavLink to="/"><ArrowLeft size={17}/>Portal home</NavLink><div><span>FIELD PAPERWORK</span><h1>Field tickets</h1><p>{context.customer_name} · Approved customer copies</p></div><div className="client-ticket-count"><ClipboardCheck size={20}/><strong>{tickets.length}</strong><span>approved</span></div></header>
    {error&&<div className="client-tickets-message">{error}</div>}
    <section className="client-tickets-toolbar"><div><Search size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search ticket, job or site"/></div></section>
    <section className="client-ticket-list">{visible.length?visible.map(ticket=>{
      const hours=num(ticket.travel_hours)+num(ticket.work_hours)+num(ticket.standby_hours)
      return <article key={ticket.ticket_id} className="client-ticket-card"><button type="button" className="client-ticket-card-main" onClick={()=>void openTicket(ticket)}><div className="client-ticket-date"><CalendarDays size={17}/><strong>{dateLabel(ticket.work_date)}</strong></div><div className="client-ticket-copy"><span>{ticket.ticket_number}</span><strong>{ticket.work_description||label(ticket.ticket_type)}</strong><small>{ticket.job_number?`${ticket.job_number}${ticket.job_title?` · ${ticket.job_title}`:''}`:'No linked job'}{ticket.site_name?` · ${ticket.site_name}`:''}</small></div><div className="client-ticket-facts">{hours>0&&<span>{hours} h</span>}{ticket.customer_signed_at&&<span className="signed"><FileSignature size={13}/>Signed</span>}</div></button><button type="button" className="client-ticket-print-button" onClick={()=>printTicket(ticket.ticket_id)} aria-label={`Print ${ticket.ticket_number}`}><Printer size={17}/></button></article>
    }):<div className="client-tickets-empty"><ClipboardCheck size={32}/><strong>{search?'No matching field tickets':'No approved field tickets yet'}</strong><span>{search?'Try a different search.':'Approved field paperwork will appear here after your service provider reviews it.'}</span></div>}</section>

    {(detailLoading||selected)&&<div className="client-ticket-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!detailLoading)setSelected(null)}}>{detailLoading?<div className="client-ticket-modal loading">Loading ticket…</div>:selected&&<TicketModal detail={selected} onClose={()=>setSelected(null)} onPrint={()=>printTicket(String(selected.ticket.ticket_id))}/>}</div>}
  </main>
}

function TicketModal({detail,onClose,onPrint}:{detail:TicketDetail;onClose:()=>void;onPrint:()=>void}){
  const ticket=detail.ticket
  const hours=num(ticket.travel_hours)+num(ticket.work_hours)+num(ticket.standby_hours)
  return <section className="client-ticket-modal"><header><div><span>APPROVED FIELD TICKET</span><h2>{ticket.ticket_number}</h2><p>{dateLabel(ticket.work_date)} · {label(ticket.ticket_type)}</p></div><button type="button" onClick={onClose}><X size={19}/></button></header><div className="client-ticket-modal-body"><div className="client-ticket-detail-grid"><Detail label="Job" value={ticket.job_number?`${ticket.job_number}${ticket.job_title?` · ${ticket.job_title}`:''}`:'Not linked'}/><Detail label="Site" value={[ticket.site_name,ticket.site_address].filter(Boolean).join(' · ')||'Not recorded'}/><Detail label="Operator" value={ticket.operator_name||'Not recorded'}/><Detail label="Unit" value={ticket.unit_number?`Unit ${ticket.unit_number}${ticket.unit_name?` · ${ticket.unit_name}`:''}`:'Not recorded'}/><Detail label="PO" value={ticket.purchase_order||'Not recorded'}/><Detail label="AFE" value={ticket.afe_number||'Not recorded'}/></div><div className="client-ticket-work"><span>WORK PERFORMED</span><p>{ticket.work_description||'No work description recorded.'}</p></div><div className="client-ticket-time-grid"><Detail label="Travel" value={`${num(ticket.travel_hours)} h`}/><Detail label="Work" value={`${num(ticket.work_hours)} h`}/><Detail label="Standby" value={`${num(ticket.standby_hours)} h`}/><Detail label="Total" value={`${hours} h`}/>{ticket.quantity!==null&&<Detail label="Quantity" value={`${ticket.quantity} ${ticket.quantity_unit||''}`}/>}</div>{detail.line_items.length>0&&<div className="client-ticket-services"><span>SERVICE ITEMS</span>{detail.line_items.map(item=><div key={item.item_id}><strong>{item.description}</strong><small>{item.quantity} {item.unit} · {label(item.category)}</small></div>)}</div>}{(ticket.disposal_location||ticket.disposal_manifest)&&<div className="client-ticket-disposal"><MapPin size={16}/><div><strong>{ticket.disposal_location||'Disposal location'}</strong><span>{ticket.disposal_manifest||'No manifest number recorded'}</span></div></div>}{ticket.customer_signature_data?<div className="client-ticket-signature"><span>CUSTOMER SIGN-OFF</span><img src={ticket.customer_signature_data} alt={`Signature from ${ticket.customer_signed_by||'customer'}`}/><div><strong>{ticket.customer_signed_by||'Customer representative'}</strong><small>{ticket.customer_signed_at?new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(ticket.customer_signed_at)):'Signed'}</small></div></div>:<div className="client-ticket-no-signature">No customer signature was captured on this ticket.</div>}</div><footer><button type="button" onClick={onClose}>Close</button><button type="button" className="primary" onClick={onPrint}><Printer size={16}/>Print / Save PDF</button></footer></section>
}

function Detail({label,value}:{label:string;value:string}){return <div className="client-ticket-detail"><span>{label}</span><strong>{value}</strong></div>}
