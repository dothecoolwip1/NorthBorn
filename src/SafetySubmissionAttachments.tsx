import { useCallback, useEffect, useState } from 'react'
import { Eye, FileText, Printer } from 'lucide-react'
import { supabase } from './lib/supabase'
import './safety-pack6.css'

const db=supabase as any
type Attachment={id:string;file_name:string;storage_path:string;caption:string|null;mime_type:string|null;created_at:string}

export default function SafetySubmissionAttachments({organizationId,submissionId,onError}:{organizationId:string;submissionId:string;onError:(message:string)=>void}){
 const [rows,setRows]=useState<Attachment[]>([])
 const load=useCallback(async()=>{const r=await db.from('safety_form_attachments').select('id,file_name,storage_path,caption,mime_type,created_at').eq('organization_id',organizationId).eq('submission_id',submissionId).order('created_at');if(r.error)onError(r.error.message);else setRows(r.data||[])},[organizationId,submissionId,onError])
 useEffect(()=>{void load()},[load])
 const open=async(row:Attachment)=>{const r=await supabase.storage.from('safety-files').createSignedUrl(row.storage_path,300);if(r.error)onError(r.error.message);else window.open(r.data.signedUrl,'_blank','noopener,noreferrer')}
 return <div className="pack6-submission-tools"><div className="pack6-submission-tools-head"><strong>Attachments and output</strong><button type="button" onClick={()=>window.print()}><Printer size={14}/>Print / save PDF</button></div>{rows.length?<div className="pack6-attachment-list">{rows.map(row=><button type="button" key={row.id} onClick={()=>void open(row)}><FileText size={15}/><span><strong>{row.caption||row.file_name}</strong><small>{row.file_name}</small></span><Eye size={14}/></button>)}</div>:<span className="pack6-no-attachments">No attachments on this submission.</span>}</div>
}
