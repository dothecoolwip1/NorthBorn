import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { supabase } from './lib/supabase'
import './fleet-pack5.css'

const db=supabase as any
type Row={id:string;service_date:string;service_type:string;summary:string;odometer_km:number|null;engine_hours:number|null;vendor:string|null;work_order_number:string|null;cost_cents:number|null;labour_cost_cents:number;parts_cost_cents:number;external_cost_cents:number;downtime_minutes:number;notes:string|null}
const money=(c:number|null)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format((c||0)/100)
export default function FleetServiceHistoryPanel({organizationId,vehicleId,onError}:{organizationId:string;vehicleId:string;onError:(message:string)=>void}){
 const [rows,setRows]=useState<Row[]>([])
 const load=useCallback(async()=>{const r=await db.from('fleet_service_records').select('id,service_date,service_type,summary,odometer_km,engine_hours,vendor,work_order_number,cost_cents,labour_cost_cents,parts_cost_cents,external_cost_cents,downtime_minutes,notes').eq('organization_id',organizationId).eq('vehicle_id',vehicleId).order('service_date',{ascending:false}).limit(30);if(r.error)onError(r.error.message);else setRows(r.data||[])},[organizationId,vehicleId,onError])
 useEffect(()=>{void load()},[load])
 return <section className="pack5-history"><div className="pack5-section-heading"><div><strong>Service history</strong><span>Completed repairs and scheduled maintenance stay with the unit.</span></div><History size={18}/></div><div className="pack5-history-list">{rows.map(row=><article key={row.id}><div><strong>{row.service_type}</strong><span>{row.summary}</span><small>{new Date(row.service_date+'T12:00:00').toLocaleDateString('en-CA')}{row.work_order_number?' · '+row.work_order_number:''}{row.vendor?' · '+row.vendor:''}</small></div><div><b>{money(row.cost_cents)}</b><small>{row.odometer_km!==null?row.odometer_km.toLocaleString()+' km':''}{row.engine_hours!==null?' · '+row.engine_hours.toLocaleString()+' h':''}</small><small>{row.downtime_minutes?Math.round(row.downtime_minutes/6)/10+' h downtime':''}</small></div></article>)}{!rows.length&&<div className="pack5-empty">No completed service history yet.</div>}</div></section>
}