import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from './lib/supabase'
import './ticket-print.css'

const db=supabase as any

type Organization={id:string;name:string;settings:Record<string,unknown>|null}
type Ticket={id:string;organization_id:string;job_id:string|null;customer_id:string;primary_employee_id:string|null;vehicle_id:string|null;ticket_number:string;ticket_type:string;work_date:string;site_name:string|null;site_address:string|null;purchase_order:string|null;afe_number:string|null;start_time:string|null;end_time:string|null;travel_hours:number|string;work_hours:number|string;standby_hours:number|string;quantity:number|string|null;quantity_unit:string|null;disposal_location:string|null;disposal_manifest:string|null;work_description:string|null;operator_notes:string|null;customer_signed_by:string|null;customer_signature_data:string|null;customer_signed_at:string|null;status:string;review_note:string|null;created_at:string}
type Customer={id:string;name:string;address:string|null;phone:string|null;billing_email:string|null}
type Job={id:string;job_number:string;title:string;site_name:string|null;site_address:string|null}
type Employee={id:string;first_name:string;last_name:string;position:string|null}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string;plate:string|null}
type Item={id:string;category:string;description:string;quantity:number|string;unit:string;notes:string|null;sort_order:number}

type PrintData={organization:Organization;ticket:Ticket;customer:Customer|null;job:Job|null;employee:Employee|null;vehicle:Vehicle|null;items:Item[]}

const num=(value:unknown)=>Number(value||0)
const pretty=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateLabel=(value:string)=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'long',day:'numeric'}).format(new Date(`${value}T12:00:00`))
const timeLabel=(value:string|null)=>value?value.slice(0,5):'Not recorded'
const readError=(error:unknown)=>error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Unable to load ticket.')
const clean=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():''

export default function TicketPrintPage(){
  const ticketId=new URLSearchParams(window.location.search).get('ticket')||''
  const [data,setData]=useState<PrintData|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      if(!ticketId)throw new Error('No field ticket was selected.')
      const {data:sessionData}=await supabase.auth.getSession()
      if(!sessionData.session?.user)throw new Error('Sign in to view this field ticket.')
      const ticketResult=await db.from('field_tickets').select('*').eq('id',ticketId).maybeSingle()
      if(ticketResult.error)throw ticketResult.error
      if(!ticketResult.data)throw new Error('This field ticket could not be found or you do not have access to it.')
      const ticket=ticketResult.data as Ticket
      const [organizationResult,customerResult,jobResult,employeeResult,vehicleResult,itemResult]=await Promise.all([
        db.from('organizations').select('id,name,settings').eq('id',ticket.organization_id).maybeSingle(),
        db.from('customers').select('id,name,address,phone,billing_email').eq('id',ticket.customer_id).maybeSingle(),
        ticket.job_id?db.from('jobs').select('id,job_number,title,site_name,site_address').eq('id',ticket.job_id).maybeSingle():Promise.resolve({data:null,error:null}),
        ticket.primary_employee_id?db.from('employees').select('id,first_name,last_name,position').eq('id',ticket.primary_employee_id).maybeSingle():Promise.resolve({data:null,error:null}),
        ticket.vehicle_id?db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,plate').eq('id',ticket.vehicle_id).maybeSingle():Promise.resolve({data:null,error:null}),
        db.from('field_ticket_items').select('id,category,description,quantity,unit,notes,sort_order').eq('ticket_id',ticket.id).order('sort_order'),
      ])
      const firstError=[organizationResult,customerResult,jobResult,employeeResult,vehicleResult,itemResult].find(result=>result.error)?.error
      if(firstError)throw firstError
      if(!organizationResult.data)throw new Error('Northborn could not load the company record for this ticket.')
      setData({organization:organizationResult.data as Organization,ticket,customer:customerResult.data as Customer|null,job:jobResult.data as Job|null,employee:employeeResult.data as Employee|null,vehicle:vehicleResult.data as Vehicle|null,items:(itemResult.data||[]) as Item[]})
    }catch(caught){setError(readError(caught));setData(null)}finally{setLoading(false)}
  },[ticketId])

  useEffect(()=>{void load()},[load])

  const company=useMemo(()=>{
    const settings=data?.organization.settings||{}
    return {
      name:clean(settings.invoice_company_name)||data?.organization.name||'Northborn company',
      address:clean(settings.invoice_address),
      phone:clean(settings.invoice_phone),
      email:clean(settings.invoice_email),
    }
  },[data])

  if(loading)return <main className="ticket-print-loading">Preparing field ticket…</main>
  if(error||!data)return <main className="ticket-print-loading"><div><strong>Field ticket unavailable</strong><p>{error||'Unable to load this ticket.'}</p><button type="button" onClick={()=>window.close()}>Close</button></div></main>

  const {ticket,customer,job,employee,vehicle,items}=data
  const totalHours=num(ticket.travel_hours)+num(ticket.work_hours)+num(ticket.standby_hours)
  const site=ticket.site_name||job?.site_name||''
  const address=ticket.site_address||job?.site_address||''

  return <main className="ticket-print-page">
    <div className="ticket-print-toolbar"><button type="button" onClick={()=>window.close()}><ArrowLeft size={17}/>Close</button><div><strong>{ticket.ticket_number}</strong><span>Printable customer copy</span></div><button className="primary" type="button" onClick={()=>window.print()}><Printer size={17}/>Print / Save PDF</button></div>
    <article className="ticket-print-sheet">
      <header className="ticket-print-header"><div><div className="ticket-print-brand">N</div><div><span>FIELD SERVICE TICKET</span><h1>{company.name}</h1>{company.address&&<p>{company.address}</p>}<p>{[company.phone,company.email].filter(Boolean).join(' · ')}</p></div></div><div className="ticket-print-number"><span>Ticket</span><strong>{ticket.ticket_number}</strong><em>{pretty(ticket.status)}</em></div></header>

      <section className="ticket-print-meta"><PrintInfo label="Work date" value={dateLabel(ticket.work_date)}/><PrintInfo label="Customer" value={customer?.name||'Not recorded'}/><PrintInfo label="Job" value={job?`${job.job_number} · ${job.title}`:'Not linked'}/><PrintInfo label="Ticket type" value={pretty(ticket.ticket_type)}/><PrintInfo label="PO number" value={ticket.purchase_order||'Not recorded'}/><PrintInfo label="AFE number" value={ticket.afe_number||'Not recorded'}/><PrintInfo label="Site" value={site||'Not recorded'}/><PrintInfo label="Site address" value={address||'Not recorded'}/><PrintInfo label="Operator" value={employee?`${employee.first_name} ${employee.last_name}${employee.position?` · ${employee.position}`:''}`:'Not recorded'}/><PrintInfo label="Unit" value={vehicle?`Unit ${vehicle.unit_number}${vehicle.name?` · ${vehicle.name}`:` · ${pretty(vehicle.vehicle_type)}`}${vehicle.plate?` · ${vehicle.plate}`:''}`:'Not recorded'}/></section>

      <section className="ticket-print-section"><div className="ticket-print-section-title"><span>01</span><h2>Work performed</h2></div><p className="ticket-print-description">{ticket.work_description||'No work description recorded.'}</p>{ticket.operator_notes&&<div className="ticket-print-note"><strong>Operator notes</strong><p>{ticket.operator_notes}</p></div>}</section>

      <section className="ticket-print-section"><div className="ticket-print-section-title"><span>02</span><h2>Time & quantities</h2></div><div className="ticket-print-hours"><PrintInfo label="Start" value={timeLabel(ticket.start_time)}/><PrintInfo label="End" value={timeLabel(ticket.end_time)}/><PrintInfo label="Travel" value={`${num(ticket.travel_hours)} h`}/><PrintInfo label="Work" value={`${num(ticket.work_hours)} h`}/><PrintInfo label="Standby" value={`${num(ticket.standby_hours)} h`}/><PrintInfo label="Total recorded" value={`${totalHours} h`}/>{ticket.quantity!==null&&<PrintInfo label="Quantity" value={`${ticket.quantity} ${ticket.quantity_unit||''}`}/>}</div></section>

      <section className="ticket-print-section"><div className="ticket-print-section-title"><span>03</span><h2>Service items</h2></div>{items.length?<table className="ticket-print-table"><thead><tr><th>Category</th><th>Description</th><th>Quantity</th><th>Notes</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{pretty(item.category)}</td><td>{item.description}</td><td>{item.quantity} {item.unit}</td><td>{item.notes||''}</td></tr>)}</tbody></table>:<p className="ticket-print-muted">No service items recorded.</p>}</section>

      {(ticket.disposal_location||ticket.disposal_manifest)&&<section className="ticket-print-section"><div className="ticket-print-section-title"><span>04</span><h2>Disposal</h2></div><div className="ticket-print-hours"><PrintInfo label="Disposal location" value={ticket.disposal_location||'Not recorded'}/><PrintInfo label="Manifest / disposal ticket" value={ticket.disposal_manifest||'Not recorded'}/></div></section>}

      <section className="ticket-print-section signoff"><div className="ticket-print-section-title"><span>{ticket.disposal_location||ticket.disposal_manifest?'05':'04'}</span><h2>Customer sign-off</h2></div>{ticket.customer_signature_data?<div className="ticket-print-signature"><img src={ticket.customer_signature_data} alt={`Signature from ${ticket.customer_signed_by||'customer'}`}/><div><strong>{ticket.customer_signed_by||'Customer representative'}</strong><span>{ticket.customer_signed_at?new Intl.DateTimeFormat('en-CA',{dateStyle:'long',timeStyle:'short'}).format(new Date(ticket.customer_signed_at)):'Signed'}</span></div></div>:<div className="ticket-print-unsigned"><div/><span>No customer signature was captured on this ticket.</span></div>}</section>

      <footer className="ticket-print-footer"><span>Generated by Northborn</span><span>{ticket.ticket_number} · {dateLabel(ticket.work_date)}</span></footer>
    </article>
  </main>
}

function PrintInfo({label,value}:{label:string;value:string}){return <div className="ticket-print-info"><span>{label}</span><strong>{value}</strong></div>}
