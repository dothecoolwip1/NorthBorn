import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Truck, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './fleet-repair-notifications.css'

const db=supabase as any
type Row={id:string;title:string;message:string|null;entity_id:string|null;payload:Record<string,unknown>;created_at:string;read_at:string|null;notification_type:string}

export default function OperatorFleetRepairNotifications({userId,organizationId}:{userId:string;organizationId:string}){
  const [rows,setRows]=useState<Row[]>([])
  const load=useCallback(async()=>{const r=await db.from('user_notifications').select('id,title,message,entity_id,payload,created_at,read_at,notification_type').eq('recipient_user_id',userId).eq('organization_id',organizationId).eq('notification_type','fleet_defect_repaired').is('read_at',null).order('created_at',{ascending:false}).limit(20);if(!r.error)setRows(r.data||[])},[userId,organizationId])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{const channel=supabase.channel(`fleet-repair-notices-${userId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'user_notifications',filter:`recipient_user_id=eq.${userId}`},payload=>{const row=payload.new as Row;if(row.notification_type==='fleet_defect_repaired')setRows(current=>[row,...current.filter(x=>x.id!==row.id)])}).subscribe();return()=>{void supabase.removeChannel(channel)}},[userId])
  const current=useMemo(()=>rows[0]||null,[rows])
  const dismiss=async()=>{if(!current)return;await db.from('user_notifications').update({read_at:new Date().toISOString()}).eq('id',current.id).eq('recipient_user_id',userId);setRows(x=>x.filter(r=>r.id!==current.id))}
  if(!current)return null
  return <div className="repair-notice" role="alert" aria-live="polite"><div className="repair-notice-icon"><CheckCircle2 size={23}/></div><div><span>REPAIR COMPLETE</span><strong>{current.title}</strong><p>{current.message||'A reported fleet defect has been repaired.'}</p><a href="/fleet"><Truck size={14}/>View unit</a></div><button aria-label="Dismiss" onClick={()=>void dismiss()}><X size={17}/></button></div>
}
