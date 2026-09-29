import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { localDate } from './reporting'
import { nonNegativeAmount } from './billing-math'

type Entry={id:string;kind:string;amount:number|string;effective_date:string;reference:string|null;note:string;reverses_id:string|null;is_opening_balance:boolean;created_at:string}
export default function InvoiceSettlements({organizationId,invoice,onClose,onSaved}:{organizationId:string;invoice:{id:string;invoice_number:string;currency_code:string};onClose:()=>void;onSaved:()=>Promise<void>}){
 const [rows,setRows]=useState<Entry[]>([]),[kind,setKind]=useState('payment'),[amount,setAmount]=useState(''),[date,setDate]=useState(localDate),[reference,setReference]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[requestId,setRequestId]=useState(()=>crypto.randomUUID())
 const db=supabase as any
 const money=(v:number|string)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:invoice.currency_code}).format(Number(v))
 useEffect(()=>{let active=true;setLoading(true);void db.from('invoice_settlements').select('*').eq('organization_id',organizationId).eq('invoice_id',invoice.id).order('created_at',{ascending:false}).then(({data,error}:any)=>{if(!active)return;if(error)setError(error.message);else setRows(data||[]);setLoading(false)});return()=>{active=false}},[organizationId,invoice.id,revision,db])
 const save=async(reversal?:Entry)=>{
  setBusy(true);setError('')
  try{
   const value=reversal?Number(reversal.amount):nonNegativeAmount(amount)
   if(value<=0)throw new Error('Enter an amount greater than zero.')
   if(!note.trim())throw new Error('Enter a note explaining this payment, credit or reversal.')
   const result=await db.rpc('record_invoice_settlement',{_organization_id:organizationId,_invoice_id:invoice.id,_kind:reversal?`${reversal.kind}_reversal`:kind,_amount:value,_date:date,_reference:reference,_note:note.trim(),_request_id:reversal?crypto.randomUUID():requestId,_reverses_id:reversal?.id||null})
   if(result.error)throw result.error
   setRequestId(crypto.randomUUID());setAmount('');setNote('');setReference('');setRevision(n=>n+1);await onSaved()
  }catch(e){setError(e instanceof Error?e.message:String((e as {message?:string})?.message||e))}finally{setBusy(false)}
 }
 return <div className="invoice-v2-editor-backdrop"><section className="invoice-v2-editor" role="dialog" aria-modal="true" aria-labelledby="settlement-title"><header><h2 id="settlement-title">Payments and credits · {invoice.invoice_number}</h2><button type="button" aria-label="Close payment history" disabled={busy} onClick={onClose}>Close</button></header><div className="invoice-v2-editor-body">
 {error&&<p className="invoice-v2-error" role="alert">{error}</p>}
 <p>Payments record money received. Credits reduce the amount owed without recording cash. Entries stay in history; corrections use a reversal.</p>
 <form onSubmit={e=>{e.preventDefault();void save()}}><div className="invoice-v2-grid">
 <label>Entry type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="payment">Payment received</option><option value="credit">Credit adjustment</option></select></label>
 <label>Amount ({invoice.currency_code})<input autoFocus type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label>Effective date<input type="date" required max={localDate()} value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Receipt, transfer or credit reference"/></label>
 <label className="wide">Note / reversal reason<textarea required value={note} onChange={e=>setNote(e.target.value)}/></label>
 </div><button type="submit" disabled={busy||loading}>{busy?'Saving…':'Record entry'}</button></form>
 <h3>History</h3>{loading?<p role="status">Loading history…</p>:rows.length?rows.map(row=><article className="invoice-settlement-row" key={row.id}><strong>{row.kind.replaceAll('_',' ')} · {money(row.amount)}</strong><span>{row.effective_date}{row.is_opening_balance?' · Imported opening balance':''}</span><p>{row.note}</p>{row.reference&&<small>{row.reference}</small>}{['payment','credit'].includes(row.kind)&&!rows.some(r=>r.reverses_id===row.id)&&<button type="button" disabled={busy||!note.trim()} onClick={()=>void save(row)}>Reverse this entry</button>}</article>):<p>No payments or credits recorded.</p>}
 </div></section></div>
}
