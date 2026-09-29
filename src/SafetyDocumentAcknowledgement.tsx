import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Users } from 'lucide-react'
import { supabase } from './lib/supabase'
import './safety-pack6.css'

const db=supabase as any

export default function SafetyDocumentAcknowledgement({organizationId,documentId,userId,required,onError}:{organizationId:string;documentId:string;userId:string;required:boolean;onError:(message:string)=>void}){
 const [mine,setMine]=useState(false),[count,setCount]=useState(0),[busy,setBusy]=useState(false)
 const load=useCallback(async()=>{
  if(!required){setMine(false);setCount(0);return}
  const [my,all]=await Promise.all([
    db.from('safety_document_acknowledgements').select('id').eq('organization_id',organizationId).eq('document_id',documentId).eq('user_id',userId).maybeSingle(),
    db.from('safety_document_acknowledgements').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).eq('document_id',documentId)
  ])
  if(my.error){onError(my.error.message);return}
  setMine(Boolean(my.data));setCount(all.count||0)
 },[documentId,organizationId,required,userId,onError])
 useEffect(()=>{void load()},[load])
 const acknowledge=async()=>{if(mine||!required)return;setBusy(true);const r=await db.from('safety_document_acknowledgements').insert({organization_id:organizationId,document_id:documentId,user_id:userId});if(r.error)onError(r.error.message);else await load();setBusy(false)}
 if(!required)return null
 return <div className="pack6-ack"><button type="button" className={mine?'done':''} onClick={()=>void acknowledge()} disabled={mine||busy}>{mine?<><CheckCircle2 size={14}/>Acknowledged</>:<>Acknowledge document</>}</button><span><Users size={13}/>{count} acknowledgement{count===1?'':'s'}</span></div>
}
