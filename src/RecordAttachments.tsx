import { useCallback, useEffect, useState } from 'react'
import { Eye, FileText } from 'lucide-react'
import { supabase } from './lib/supabase'
import './record-attachments.css'

const db=supabase as any
type Row={id:string;file_name:string;storage_path:string;caption:string|null;created_at:string}

export default function RecordAttachments({organizationId,recordType,recordId,onError}:{organizationId:string;recordType:'ticket'|'timesheet';recordId:string;onError:(message:string)=>void}){
 const [rows,setRows]=useState<Row[]>([])
 const table=recordType==='ticket'?'field_ticket_attachments':'timesheet_attachments'
 const key=recordType==='ticket'?'ticket_id':'timesheet_entry_id'
 const load=useCallback(async()=>{const r=await db.from(table).select('id,file_name,storage_path,caption,created_at').eq('organization_id',organizationId).eq(key,recordId).order('created_at');if(r.error)onError(r.error.message);else setRows(r.data||[])},[key,onError,organizationId,recordId,table])
 useEffect(()=>{void load()},[load])
 const open=async(row:Row)=>{const r=await supabase.storage.from('form-attachments').createSignedUrl(row.storage_path,300);if(r.error)onError(r.error.message);else window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
 if(!rows.length)return <div className="record-attachments-empty">No attachments.</div>
 return <div className="record-attachments">{rows.map(row=><button type="button" key={row.id} onClick={()=>void open(row)}><FileText size={15}/><span><strong>{row.caption||row.file_name}</strong><small>{row.file_name}</small></span><Eye size={14}/></button>)}</div>
}
