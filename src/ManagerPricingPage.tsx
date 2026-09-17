import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { ArrowLeft, DollarSign, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import RoleAwareApp from './RoleAwareApp'
import { supabase } from './lib/supabase'
import './manager-pricing.css'

const db=supabase as any
const CATEGORIES=['equipment','labour','material','disposal','overtime','transport','other']
const UNITS=['hour','day','each','km','kg','tonne','load','flat']
const COMMON=['Hydrovac','Combo Vac','Straight Vac','Steamer','Water Truck','Swamper','Disposal','Overtime','Crew Truck']

type Organization={id:string;name:string}
type Customer={id:string;name:string}
type PriceItem={id:string;organization_id:string;name:string;category:string;unit:string;default_rate:number|string;is_active:boolean;sort_order:number}
type Override={id:string;organization_id:string;customer_id:string;price_item_id:string;rate:number|string}

type RowDraft={name:string;category:string;unit:string;rate:string}
const money=(v:number|string)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(v||0))
const label=(v:string)=>v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const errText=(e:unknown)=>e instanceof Error?e.message:String((e as any)?.message||e||'Something went wrong.')

export default function ManagerPricingPage(){
  const [params,setParams]=useSearchParams()
  const customerId=params.get('customer')||''
  const [organization,setOrganization]=useState<Organization|null>(null)
  const [role,setRole]=useState('')
  const [customers,setCustomers]=useState<Customer[]>([])
  const [items,setItems]=useState<PriceItem[]>([])
  const [overrides,setOverrides]=useState<Override[]>([])
  const [drafts,setDrafts]=useState<Record<string,RowDraft>>({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [newItem,setNewItem]=useState({name:'',category:'equipment',unit:'hour',rate:''})

  const load=useCallback(async()=>{
    setError('')
    const {data:s}=await supabase.auth.getSession()
    const user=s.session?.user
    if(!user){setLoading(false);return}
    const m=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if(m.error||!m.data?.id){setLoading(false);return}
    const rr=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',m.data.id)
    const roleKey=rr.data?.[0]?.role?.key||''
    setRole(roleKey)
    if(roleKey==='operator'){setLoading(false);return}
    const org=m.data.organization as Organization
    setOrganization(org)
    const [c,p,o]=await Promise.all([
      db.from('customers').select('id,name').eq('organization_id',org.id).eq('status','active').order('name'),
      db.from('price_sheet_items').select('id,organization_id,name,category,unit,default_rate,is_active,sort_order').eq('organization_id',org.id).order('sort_order').order('name'),
      db.from('customer_price_overrides').select('id,organization_id,customer_id,price_item_id,rate').eq('organization_id',org.id),
    ])
    const er=c.error||p.error||o.error
    if(er)setError(er.message)
    const nextItems=(p.data||[]) as PriceItem[]
    setCustomers(c.data||[]);setItems(nextItems);setOverrides(o.data||[])
    const nextDrafts:Record<string,RowDraft>={}
    for(const item of nextItems)nextDrafts[item.id]={name:item.name,category:item.category,unit:item.unit,rate:String(item.default_rate??0)}
    setDrafts(nextDrafts)
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const selectedCustomer=customers.find(c=>c.id===customerId)||null
  const canManage=['owner','admin','accounting'].includes(role)||localStorage.getItem('northborn_test_mode')==='1'
  const overrideMap=useMemo(()=>new Map(overrides.filter(o=>o.customer_id===customerId).map(o=>[o.price_item_id,o])),[overrides,customerId])

  const chooseCustomer=(value:string)=>{
    const next=new URLSearchParams(params)
    if(value)next.set('customer',value);else next.delete('customer')
    setParams(next,{replace:true})
  }

  const saveItem=async(item:PriceItem)=>{
    if(!organization||!canManage)return
    const d=drafts[item.id]
    if(!d?.name.trim())return setError('Item name is required.')
    setBusy(true);setError('');setMessage('')
    try{
      const r=await db.from('price_sheet_items').update({name:d.name.trim(),category:d.category,unit:d.unit,default_rate:Number(d.rate||0)}).eq('id',item.id).eq('organization_id',organization.id)
      if(r.error)throw r.error
      setMessage(`${d.name.trim()} saved.`);await load()
    }catch(e){setError(errText(e))}finally{setBusy(false)}
  }

  const saveOverride=async(item:PriceItem,value:string)=>{
    if(!organization||!selectedCustomer||!canManage)return
    setBusy(true);setError('');setMessage('')
    try{
      const existing=overrideMap.get(item.id)
      if(value.trim()===''){
        if(existing){const r=await db.from('customer_price_overrides').delete().eq('id',existing.id).eq('organization_id',organization.id);if(r.error)throw r.error}
        setMessage(`${selectedCustomer.name} now uses the standard ${item.name} rate.`)
      }else{
        const rate=Number(value)
        if(!Number.isFinite(rate)||rate<0)throw new Error('Rate must be zero or more.')
        if(existing){const r=await db.from('customer_price_overrides').update({rate}).eq('id',existing.id).eq('organization_id',organization.id);if(r.error)throw r.error}
        else{const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required');const r=await db.from('customer_price_overrides').insert({organization_id:organization.id,customer_id:selectedCustomer.id,price_item_id:item.id,rate,created_by:u.user.id});if(r.error)throw r.error}
        setMessage(`${item.name} set to ${money(rate)} for ${selectedCustomer.name}.`)
      }
      await load()
    }catch(e){setError(errText(e))}finally{setBusy(false)}
  }

  const addItem=async(e:React.FormEvent)=>{
    e.preventDefault();if(!organization||!canManage)return
    setBusy(true);setError('');setMessage('')
    try{
      if(!newItem.name.trim())throw new Error('Item name is required.')
      const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required')
      const r=await db.from('price_sheet_items').insert({organization_id:organization.id,name:newItem.name.trim(),category:newItem.category,unit:newItem.unit,default_rate:Number(newItem.rate||0),sort_order:items.length,created_by:u.user.id})
      if(r.error)throw r.error
      setNewItem({name:'',category:'equipment',unit:'hour',rate:''});setMessage('Price sheet item added.');await load()
    }catch(e2){setError(errText(e2))}finally{setBusy(false)}
  }

  const addCommon=async()=>{
    if(!organization||!canManage)return
    const existingNames=new Set(items.map(i=>i.name.toLowerCase()))
    const missing=COMMON.filter(name=>!existingNames.has(name.toLowerCase()))
    if(!missing.length){setMessage('All common items are already on the price sheet.');return}
    setBusy(true);setError('')
    try{
      const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required')
      const rows=missing.map((name,index)=>({organization_id:organization.id,name,category:name==='Swamper'?'labour':name==='Disposal'?'disposal':name==='Overtime'?'overtime':name==='Crew Truck'?'transport':'equipment',unit:'hour',default_rate:0,sort_order:items.length+index,created_by:u.user.id}))
      const r=await db.from('price_sheet_items').insert(rows);if(r.error)throw r.error
      setMessage(`${missing.length} common items added.`);await load()
    }catch(e){setError(errText(e))}finally{setBusy(false)}
  }

  const removeItem=async(item:PriceItem)=>{
    if(!organization||!canManage||!confirm(`Remove ${item.name} from the price sheet?`))return
    setBusy(true);setError('')
    const r=await db.from('price_sheet_items').delete().eq('id',item.id).eq('organization_id',organization.id)
    if(r.error)setError(r.error.message);else await load()
    setBusy(false)
  }

  if(loading)return <div className="pricing-loading">Loading price sheet…</div>
  if(!organization||role==='operator')return <RoleAwareApp/>

  return <div className="pricing-shell">
    <header className="pricing-topbar"><NavLink to="/" className="pricing-back"><ArrowLeft size={18}/>Northborn</NavLink><div><span>BILLING</span><strong>Price Sheet</strong></div></header>
    <main className="pricing-page">
      <section className="pricing-hero"><DollarSign size={26}/><div><span>RATE MANAGEMENT</span><h1>Price sheet</h1><p>Set your standard rates once, then override only the items that are different for a specific client.</p></div></section>
      {error&&<div className="pricing-message error">{error}</div>}{message&&<div className="pricing-message">{message}</div>}
      <section className="pricing-mode-card"><label><span>Pricing for</span><select aria-label="Pricing for" value={customerId} onChange={e=>chooseCustomer(e.target.value)}><option value="">Standard company price sheet</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>{selectedCustomer&&<p>You are editing client-specific rates for <strong>{selectedCustomer.name}</strong>. Blank overrides use the standard rate.</p>}</section>

      {!selectedCustomer&&canManage&&<form className="pricing-add" onSubmit={addItem}><div className="pricing-section-head"><div><strong>Add item</strong><span>Equipment, labour, disposal, material or another billable service.</span></div><button type="button" className="pricing-secondary" onClick={()=>void addCommon()} disabled={busy}>Add common items</button></div><div className="pricing-add-grid"><input aria-label="New price item name" placeholder="Item name" value={newItem.name} onChange={e=>setNewItem({...newItem,name:e.target.value})} required/><select aria-label="New price item category" value={newItem.category} onChange={e=>setNewItem({...newItem,category:e.target.value})}>{CATEGORIES.map(c=><option value={c} key={c}>{label(c)}</option>)}</select><select aria-label="New price item unit" value={newItem.unit} onChange={e=>setNewItem({...newItem,unit:e.target.value})}>{UNITS.map(u=><option value={u} key={u}>{u}</option>)}</select><input aria-label="New price item rate" type="number" min="0" step="0.01" placeholder="Rate" value={newItem.rate} onChange={e=>setNewItem({...newItem,rate:e.target.value})}/><button className="pricing-primary" disabled={busy}><Plus size={17}/>Add</button></div></form>}

      <section className="pricing-list-section"><div className="pricing-section-head"><div><strong>{selectedCustomer?'Client rates':'Standard rates'}</strong><span>{items.length} price sheet item{items.length===1?'':'s'}</span></div></div><div className="pricing-list">{items.map(item=>{const d=drafts[item.id]||{name:item.name,category:item.category,unit:item.unit,rate:String(item.default_rate)};const override=overrideMap.get(item.id);return <article className="pricing-row" key={item.id}><div className="pricing-row-title"><strong>{item.name}</strong><span>{label(item.category)} · per {item.unit}</span></div>{selectedCustomer?<><div className="pricing-standard"><small>Standard</small><b>{money(item.default_rate)}</b></div><label className="pricing-rate"><span>{selectedCustomer.name} rate</span><input aria-label={`${selectedCustomer.name} rate for ${item.name}`} key={`${item.id}-${override?.id||'std'}-${override?.rate??''}`} defaultValue={override?String(override.rate):''} placeholder={money(item.default_rate)} type="number" min="0" step="0.01" onBlur={e=>void saveOverride(item,e.currentTarget.value)}/></label>{override&&<button type="button" className="pricing-icon" title="Use standard rate" onClick={()=>void saveOverride(item,'')} disabled={busy}><RotateCcw size={17}/></button>}</>:<><div className="pricing-fields"><input aria-label={`Name for ${item.name}`} value={d.name} onChange={e=>setDrafts({...drafts,[item.id]:{...d,name:e.target.value}})}/><select aria-label={`Category for ${item.name}`} value={d.category} onChange={e=>setDrafts({...drafts,[item.id]:{...d,category:e.target.value}})}>{CATEGORIES.map(c=><option value={c} key={c}>{label(c)}</option>)}</select><select aria-label={`Unit for ${item.name}`} value={d.unit} onChange={e=>setDrafts({...drafts,[item.id]:{...d,unit:e.target.value}})}>{UNITS.map(u=><option value={u} key={u}>{u}</option>)}</select><input aria-label={`Standard rate for ${item.name}`} type="number" min="0" step="0.01" value={d.rate} onChange={e=>setDrafts({...drafts,[item.id]:{...d,rate:e.target.value}})}/></div><div className="pricing-row-actions"><button type="button" className="pricing-icon save" title="Save" onClick={()=>void saveItem(item)} disabled={busy}><Save size={17}/></button><button type="button" className="pricing-icon danger" title="Remove" onClick={()=>void removeItem(item)} disabled={busy}><Trash2 size={17}/></button></div></>}</article>})}{!items.length&&<div className="pricing-empty">No price sheet items yet. Add your first service above.</div>}</div></section>
    </main>
  </div>
}
