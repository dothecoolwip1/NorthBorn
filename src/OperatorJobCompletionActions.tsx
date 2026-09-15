import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, ReceiptText, Save, Trash2, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-job-completion.css'

const db = supabase as any
const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_INVOICE_KEY = 'northborn_test_invoices_v1'
const TEST_TABLE_PREFIX='northborn_test_table_v1_'

const PRESETS = ['Hydrovac','Combo Vac','Straight Vac','Steamer','Water Truck','Swamper','Disposal','Overtime','Crew Truck','Other']
const UNITS = ['hour','day','each','km','kg','tonne','load','flat']

type Job = {id:string;customer_id:string;job_number:string;title:string;site_name:string|null;site_address:string|null;status:string;notes:string|null}
type Props = {job:Job;organizationId:string;organizationName:string;onCompleted:()=>Promise<unknown>}
type Line = { id:string; category:string; description:string; quantity:string; unit:string; rate:string }
type PriceItem={price_item_id:string;name:string;category:string;unit:string;effective_rate:number|string;sort_order?:number}
type Form = {purchase_order:string;afe_number:string;project:string;location:string;area:string;job_description:string;authorization_date:string;authorized_by_name:string;authorization_contact:string;authorization_email:string;tax_rate:string;notes:string}

const uid=()=>crypto.randomUUID()
const readError=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e||'Something went wrong.')
const asNumber=(value:string|number)=>Number(value||0)
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
const money=(value:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(value)
function categoryFor(description:string){if(description==='Swamper')return 'labour';if(description==='Disposal')return 'disposal';if(description==='Overtime')return 'overtime';if(description==='Crew Truck')return 'transport';if(description==='Other')return 'other';return 'equipment'}
function newLine(description='',unit='hour',rate='',category?:string):Line{return {id:uid(),category:category||categoryFor(description),description:description==='Other'?'':description,quantity:'1',unit,rate}}
function defaultForm(job:Job):Form{return {purchase_order:'',afe_number:'',project:job.title,location:job.site_address||job.site_name||'',area:'',job_description:job.title,authorization_date:'',authorized_by_name:'',authorization_contact:'',authorization_email:'',tax_rate:'5',notes:''}}
function testPriceSheet(customerId:string):PriceItem[]{
  try{
    const items=JSON.parse(localStorage.getItem(`${TEST_TABLE_PREFIX}price_sheet_items`)||'[]') as any[]
    const overrides=JSON.parse(localStorage.getItem(`${TEST_TABLE_PREFIX}customer_price_overrides`)||'[]') as any[]
    return items.filter(i=>i.is_active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||String(a.name).localeCompare(String(b.name))).map(item=>{const override=overrides.find(o=>o.customer_id===customerId&&o.price_item_id===item.id);return {price_item_id:item.id,name:item.name,category:item.category||'other',unit:item.unit||'hour',effective_rate:override?override.rate:item.default_rate||0,sort_order:item.sort_order||0}})
  }catch{return[]}
}

export default function OperatorJobCompletionActions({job,organizationId,organizationName,onCompleted}:Props){
  const [confirming,setConfirming]=useState(false)
  const [invoiceOpen,setInvoiceOpen]=useState(false)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [invoiceNumber,setInvoiceNumber]=useState('')
  const [form,setForm]=useState<Form>(()=>defaultForm(job))
  const [lines,setLines]=useState<Line[]>([newLine()])
  const [priceItems,setPriceItems]=useState<PriceItem[]>([])
  const testMode=localStorage.getItem(TEST_MODE_KEY)==='1'
  const completed=job.status==='completed'

  const totals=useMemo(()=>{const subtotal=lines.reduce((sum,line)=>sum+asNumber(line.quantity)*asNumber(line.rate),0);const tax=subtotal*(asNumber(form.tax_rate)/100);return {subtotal,tax,total:subtotal+tax}},[form.tax_rate,lines])

  const completeJob=async()=>{
    setBusy(true);setError('');setNotice('')
    try{
      if(testMode){const data=JSON.parse(localStorage.getItem(TEST_DATA_KEY)||'{}') as {jobs?:Array<Record<string,unknown>>};const jobs=(data.jobs||[]).map(item=>item.id===job.id?{...item,status:'completed',completed_at:new Date().toISOString(),completed_by:'test-operator'}:item);localStorage.setItem(TEST_DATA_KEY,JSON.stringify({...data,jobs}));window.dispatchEvent(new Event('northborn-test-data-changed'))}
      else{const result=await db.rpc('complete_my_assigned_job',{_organization_id:organizationId,_job_id:job.id});if(result.error)throw result.error}
      setConfirming(false);await onCompleted();await openInvoice()
    }catch(e){setError(readError(e))}finally{setBusy(false)}
  }

  const openInvoice=async()=>{
    setInvoiceOpen(true);setLoading(true);setError('');setNotice('')
    try{
      if(testMode){
        setPriceItems(testPriceSheet(job.customer_id))
        const invoices=JSON.parse(localStorage.getItem(TEST_INVOICE_KEY)||'[]') as any[]
        const existing=invoices.find(item=>item.job_id===job.id&&item.status==='draft')
        if(existing){setInvoiceNumber(existing.invoice_number||'');setForm({purchase_order:existing.purchase_order||'',afe_number:existing.afe_number||'',project:existing.project||job.title,location:existing.location||job.site_address||job.site_name||'',area:existing.area||'',job_description:existing.job_description||job.title,authorization_date:existing.authorization_date||'',authorized_by_name:existing.authorized_by_name||'',authorization_contact:existing.authorization_contact||'',authorization_email:existing.authorization_email||'',tax_rate:String(existing.tax_rate??5),notes:existing.notes||''});setLines((existing.line_items||[]).map((line:any)=>({id:line.id||uid(),category:line.category||'other',description:line.description||'',quantity:String(line.quantity??1),unit:line.unit||'hour',rate:String(line.rate??0)})))}
        else{setInvoiceNumber('');setForm(defaultForm(job));setLines([newLine()])}
      }else{
        const [result,pricing]=await Promise.all([
          db.rpc('get_my_assigned_job_invoice_draft',{_organization_id:organizationId,_job_id:job.id}),
          db.rpc('get_my_assigned_job_price_sheet',{_organization_id:organizationId,_job_id:job.id}),
        ])
        if(result.error)throw result.error
        if(pricing.error)throw pricing.error
        setPriceItems((pricing.data||[]) as PriceItem[])
        const invoice=result.data?.invoice
        if(invoice){setInvoiceNumber(invoice.invoice_number||'');setForm({purchase_order:invoice.purchase_order||'',afe_number:invoice.afe_number||'',project:invoice.project||job.title,location:invoice.location||job.site_address||job.site_name||'',area:invoice.area||'',job_description:invoice.job_description||job.title,authorization_date:invoice.authorization_date||'',authorized_by_name:invoice.authorized_by_name||'',authorization_contact:invoice.authorization_contact||'',authorization_email:invoice.authorization_email||'',tax_rate:String(invoice.tax_rate??5),notes:invoice.notes||''});setLines((result.data?.line_items||[]).map((line:any)=>({id:line.id||uid(),category:line.category||'other',description:line.description||'',quantity:String(line.quantity??1),unit:line.unit||'hour',rate:String(line.rate??0)})))}
        else{setInvoiceNumber('');setForm(defaultForm(job));setLines([newLine()])}
      }
    }catch(e){setError(readError(e))}finally{setLoading(false)}
  }

  const saveDraft=async()=>{
    setBusy(true);setError('');setNotice('')
    try{
      const clean=lines.filter(line=>line.description.trim())
      if(!clean.length)throw new Error('Add at least one invoice line item.')
      if(clean.some(line=>asNumber(line.quantity)<0||asNumber(line.rate)<0))throw new Error('Quantity and rate cannot be negative.')
      if(testMode){
        const testData=JSON.parse(localStorage.getItem(TEST_DATA_KEY)||'{}') as {customers?:any[]}
        const customer=(testData.customers||[]).find(item=>item.id===job.customer_id)
        const invoices=JSON.parse(localStorage.getItem(TEST_INVOICE_KEY)||'[]') as any[]
        const index=invoices.findIndex(item=>item.job_id===job.id&&item.status==='draft')
        const old=index>=0?invoices[index]:null
        const number=old?.invoice_number||`INV-TEST-${String(Date.now()).slice(-6)}`
        const record={...(old||{}),id:old?.id||uid(),organization_id:organizationId,customer_id:job.customer_id,job_id:job.id,invoice_number:number,status:'draft',invoice_date:old?.invoice_date||today(),due_date:old?.due_date||'',purchase_order:form.purchase_order||null,afe_number:form.afe_number||null,project:form.project||job.title,location:form.location||job.site_address||job.site_name||null,area:form.area||null,job_description:form.job_description||job.title,authorization_date:form.authorization_date||null,authorized_by_name:form.authorized_by_name||null,authorization_contact:form.authorization_contact||null,authorization_email:form.authorization_email||null,billed_to_name:customer?.name||'Northborn Test Client Company',billed_to_address:customer?.address||null,billed_to_email:customer?.billing_email||null,seller_name:organizationName,seller_address:null,seller_phone:null,seller_email:null,gst_number:null,permit_number:null,wcb_number:null,currency_code:'CAD',tax_rate:asNumber(form.tax_rate),subtotal:totals.subtotal,tax_total:totals.tax,total:totals.total,amount_paid:0,balance_due:totals.total,notes:form.notes||null,terms:null,created_at:old?.created_at||new Date().toISOString(),line_items:clean.map((line,i)=>({...line,id:line.id||uid(),quantity:asNumber(line.quantity),rate:asNumber(line.rate),sort_order:i}))}
        if(index>=0)invoices[index]=record;else invoices.unshift(record)
        localStorage.setItem(TEST_INVOICE_KEY,JSON.stringify(invoices));setInvoiceNumber(number);window.dispatchEvent(new Event('northborn-test-data-changed'))
      }else{
        const result=await db.rpc('save_my_assigned_job_invoice_draft',{_organization_id:organizationId,_job_id:job.id,_invoice:{...form,tax_rate:asNumber(form.tax_rate)},_line_items:clean.map(line=>({category:line.category,description:line.description.trim(),quantity:asNumber(line.quantity),unit:line.unit,rate:asNumber(line.rate)}))})
        if(result.error)throw result.error
        const refreshed=await db.rpc('get_my_assigned_job_invoice_draft',{_organization_id:organizationId,_job_id:job.id})
        if(!refreshed.error)setInvoiceNumber(refreshed.data?.invoice?.invoice_number||'')
      }
      setNotice('Invoice draft saved. Manager or accounting can review and issue it.')
      setInvoiceOpen(false)
      await onCompleted()
    }catch(e){setError(readError(e))}finally{setBusy(false)}
  }

  const addPriceItem=(item:PriceItem)=>setLines([...lines,newLine(item.name,item.unit,String(item.effective_rate??0),item.category)])

  if(job.status==='cancelled')return null

  return <div className="operator-completion-actions">
    {!completed&&!confirming&&<button className="operator-complete-button" type="button" onClick={()=>setConfirming(true)}><CheckCircle2 size={18}/>Complete job</button>}
    {!completed&&confirming&&<div className="operator-complete-confirm"><div><strong>Mark this job completed?</strong><span>This moves it into job history and unlocks the invoice draft.</span></div><div><button type="button" onClick={()=>setConfirming(false)} disabled={busy}>Cancel</button><button type="button" className="confirm" onClick={()=>void completeJob()} disabled={busy}>{busy?'Completing…':'Yes, complete job'}</button></div></div>}
    {completed&&<button className="operator-invoice-button" type="button" onClick={()=>void openInvoice()}><ReceiptText size={18}/>Start or continue invoice</button>}
    {error&&!invoiceOpen&&<div className="operator-action-error">{error}</div>}
    {notice&&!invoiceOpen&&<div className="operator-action-success">{notice}</div>}

    {invoiceOpen&&<div className="operator-invoice-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setInvoiceOpen(false)}}><section className="operator-invoice-modal" role="dialog" aria-modal="true">
      <header><div><span>JOB COMPLETE · INVOICE DRAFT</span><h2>{job.job_number} · {job.title}</h2><p>{invoiceNumber?`Draft ${invoiceNumber}`:'New invoice draft'}</p></div><button type="button" onClick={()=>setInvoiceOpen(false)} disabled={busy}><X size={20}/></button></header>
      {loading?<div className="operator-invoice-loading">Loading invoice draft…</div>:<>
        <div className="operator-invoice-note"><ReceiptText size={18}/><div><strong>Operator draft</strong><span>Enter what was billed in the field. This remains a draft until a manager or accounting issues it.</span></div></div>
        {error&&<div className="operator-action-error">{error}</div>}
        <div className="operator-invoice-grid"><label><span>P.O. #</span><input value={form.purchase_order} onChange={e=>setForm({...form,purchase_order:e.target.value})}/></label><label><span>A.F.E. #</span><input value={form.afe_number} onChange={e=>setForm({...form,afe_number:e.target.value})}/></label><label><span>Project</span><input value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/></label><label><span>Area</span><input value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label><label className="wide"><span>Location</span><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label><label className="wide"><span>Work completed</span><textarea value={form.job_description} onChange={e=>setForm({...form,job_description:e.target.value})}/></label></div>
        <div className="operator-invoice-section"><div className="operator-invoice-section-head"><div><strong>Billable items</strong><span>{priceItems.length?'Rates below come from the company price sheet and include this client’s overrides.':'Add equipment, labour, disposal and other charges.'}</span></div><button type="button" onClick={()=>setLines([...lines,newLine()])}><Plus size={16}/>Line</button></div><div className="operator-preset-row">{priceItems.length?priceItems.map(item=><button type="button" key={item.price_item_id} onClick={()=>addPriceItem(item)}>{item.name} · {money(asNumber(item.effective_rate))}/{item.unit}</button>):PRESETS.map(preset=><button type="button" key={preset} onClick={()=>setLines([...lines,newLine(preset)])}>{preset}</button>)}</div><div className="operator-line-list">{lines.map((line,index)=><div className="operator-line" key={line.id}><input className="description" placeholder="Description" value={line.description} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,description:e.target.value}:item))}/><input type="number" min="0" step="0.01" placeholder="Qty" value={line.quantity} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/><select value={line.unit} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,unit:e.target.value}:item))}>{UNITS.map(unit=><option value={unit} key={unit}>{unit}</option>)}</select><input type="number" min="0" step="0.01" placeholder="Rate" value={line.rate} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,rate:e.target.value}:item))}/><strong>{money(asNumber(line.quantity)*asNumber(line.rate))}</strong><button type="button" className="delete" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}</div></div>
        <div className="operator-invoice-section"><strong>Customer authorization</strong><div className="operator-invoice-grid authorization"><label><span>Date</span><input type="date" value={form.authorization_date} onChange={e=>setForm({...form,authorization_date:e.target.value})}/></label><label><span>Print name</span><input value={form.authorized_by_name} onChange={e=>setForm({...form,authorized_by_name:e.target.value})}/></label><label><span>Contact #</span><input value={form.authorization_contact} onChange={e=>setForm({...form,authorization_contact:e.target.value})}/></label><label><span>Email</span><input type="email" value={form.authorization_email} onChange={e=>setForm({...form,authorization_email:e.target.value})}/></label></div></div>
        <label className="operator-invoice-notes"><span>Invoice notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="operator-invoice-footer"><div className="operator-invoice-totals"><span>Subtotal <b>{money(totals.subtotal)}</b></span><span>GST <input aria-label="GST rate" type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e=>setForm({...form,tax_rate:e.target.value})}/>% <b>{money(totals.tax)}</b></span><strong>Total <b>{money(totals.total)}</b></strong></div><div className="operator-invoice-buttons"><button type="button" onClick={()=>setInvoiceOpen(false)} disabled={busy}>Close</button><button type="button" className="save" onClick={()=>void saveDraft()} disabled={busy}><Save size={17}/>{busy?'Saving…':'Save invoice draft'}</button></div></div>
      </>}
    </section></div>}
  </div>
}
