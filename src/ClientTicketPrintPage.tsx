import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './client-ticket-print.css'

const db=supabase as any

type PortalContext={customer_id:string;customer_name:string;organization_name:string}
type TicketDetail={ticket:Record<string,any>;line_items:Array<{item_id:string;category:string;description:string;quantity:number|string;unit:string;sort_order:number}>}
const num=(value:unknown)=>Number(value||0)
const clean=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():''
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'long',day:'numeric'}).format(new Date(`${value}T12:00:00`))
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Unable to load field ticket.')

export default function ClientTicketPrintPage(){
  const params=new URLSearchParams(window.location.search)
  const customerId=params.get('customer')||''
  const ticketId=params.get('ticket')||''
  const [context,setContext]=useState<PortalContext|null>(null)
  const [detail,setDetail]=useState<TicketDetail|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let active=true
    const load=async()=>{
      setLoading(true);setError('')
      try{
        if(!customerId||!ticketId)throw new Error('No field ticket was selected.')
        const ctx=await db.rpc('get_my_customer_portal_context')
        if(ctx.error)throw ctx.error
        const portal=(ctx.data||[]).find((row:PortalContext)=>row.customer_id===customerId) as PortalContext|undefined
        if(!portal)throw new Error('You do not have access to this customer account.')
        const result=await db.rpc('get_my_customer_field_ticket_detail',{_customer_id:customerId,_ticket_id:ticketId})
        if(result.error)throw result.error
        if(active){setContext(portal);setDetail(result.data as TicketDetail)}
      }catch(caught){if(active)setError(readError(caught))}finally{if(active)setLoading(false)}
    }
    void load();return()=>{active=false}
  },[customerId,ticketId])

  const company=useMemo(()=>{
    const ticket=detail?.ticket||{}
    return {name:clean(ticket.seller_name)||clean(ticket.organization_name)||context?.organization_name||'Service provider',address:clean(ticket.seller_address),phone:clean(ticket.seller_phone),email:clean(ticket.seller_email)}
  },[detail,context])

  if(loading)return <main className="client-print-loading">Preparing customer ticket copy…</main>
  if(!context&&error.includes('access'))return <Navigate to="/" replace/>
  if(error||!detail)return <main className="client-print-loading"><div><strong>Ticket unavailable</strong><p>{error||'Unable to load this ticket.'}</p><button type="button" onClick={()=>window.close()}>Close</button></div></main>
  if(!context)return <Navigate to="/" replace/>

  const ticket=detail.ticket
  const totalHours=num(ticket.travel_hours)+num(ticket.work_hours)+num(ticket.standby_hours)
  return <main className="client-print-page"><div className="client-print-toolbar"><button type="button" onClick={()=>window.close()}><ArrowLeft size={17}/>Close</button><div><strong>{ticket.ticket_number}</strong><span>Approved customer copy</span></div><button type="button" className="primary" onClick={()=>window.print()}><Printer size={17}/>Print / Save PDF</button></div><article className="client-print-sheet">
    <header className="client-print-header"><div><div className="client-print-brand">N</div><div><span>FIELD SERVICE TICKET</span><h1>{company.name}</h1>{company.address&&<p>{company.address}</p>}<p>{[company.phone,company.email].filter(Boolean).join(' · ')}</p></div></div><div className="client-print-number"><span>Ticket</span><strong>{ticket.ticket_number}</strong><em>Approved</em></div></header>
    <section className="client-print-meta"><Info label="Work date" value={dateLabel(ticket.work_date)}/><Info label="Customer" value={ticket.customer_name||context.customer_name}/><Info label="Job" value={ticket.job_number?`${ticket.job_number}${ticket.job_title?` · ${ticket.job_title}`:''}`:'Not linked'}/><Info label="Ticket type" value={label(ticket.ticket_type)}/><Info label="PO number" value={ticket.purchase_order||'Not recorded'}/><Info label="AFE number" value={ticket.afe_number||'Not recorded'}/><Info label="Site" value={ticket.site_name||'Not recorded'}/><Info label="Site address" value={ticket.site_address||'Not recorded'}/><Info label="Operator" value={ticket.operator_name||'Not recorded'}/><Info label="Unit" value={ticket.unit_number?`Unit ${ticket.unit_number}${ticket.unit_name?` · ${ticket.unit_name}`:''}`:'Not recorded'}/></section>
    <Section number="01" title="Work performed"><p className="client-print-description">{ticket.work_description||'No work description recorded.'}</p></Section>
    <Section number="02" title="Time & quantities"><div className="client-print-hours"><Info label="Start" value={ticket.start_time?String(ticket.start_time).slice(0,5):'Not recorded'}/><Info label="End" value={ticket.end_time?String(ticket.end_time).slice(0,5):'Not recorded'}/><Info label="Travel" value={`${num(ticket.travel_hours)} h`}/><Info label="Work" value={`${num(ticket.work_hours)} h`}/><Info label="Standby" value={`${num(ticket.standby_hours)} h`}/><Info label="Total recorded" value={`${totalHours} h`}/>{ticket.quantity!==null&&<Info label="Quantity" value={`${ticket.quantity} ${ticket.quantity_unit||''}`}/>}</div></Section>
    <Section number="03" title="Service items">{detail.line_items.length?<table className="client-print-table"><thead><tr><th>Category</th><th>Description</th><th>Quantity</th></tr></thead><tbody>{detail.line_items.map(item=><tr key={item.item_id}><td>{label(item.category)}</td><td>{item.description}</td><td>{item.quantity} {item.unit}</td></tr>)}</tbody></table>:<p className="client-print-muted">No service items recorded.</p>}</Section>
    {(ticket.disposal_location||ticket.disposal_manifest)&&<Section number="04" title="Disposal"><div className="client-print-hours"><Info label="Disposal location" value={ticket.disposal_location||'Not recorded'}/><Info label="Manifest / disposal ticket" value={ticket.disposal_manifest||'Not recorded'}/></div></Section>}
    <Section number={ticket.disposal_location||ticket.disposal_manifest?'05':'04'} title="Customer sign-off">{ticket.customer_signature_data?<div className="client-print-signature"><img src={ticket.customer_signature_data} alt={`Signature from ${ticket.customer_signed_by||'customer'}`}/><div><strong>{ticket.customer_signed_by||'Customer representative'}</strong><span>{ticket.customer_signed_at?new Intl.DateTimeFormat('en-CA',{dateStyle:'long',timeStyle:'short'}).format(new Date(ticket.customer_signed_at)):'Signed'}</span></div></div>:<div className="client-print-unsigned">No customer signature was captured on this ticket.</div>}</Section>
    <footer className="client-print-footer"><span>Generated by Northborn</span><span>{ticket.ticket_number} · {dateLabel(ticket.work_date)}</span></footer>
  </article></main>
}

function Info({label,value}:{label:string;value:string}){return <div className="client-print-info"><span>{label}</span><strong>{value}</strong></div>}
function Section({number,title,children}:{number:string;title:string;children:React.ReactNode}){return <section className="client-print-section"><div className="client-print-section-title"><span>{number}</span><h2>{title}</h2></div>{children}</section>}
