import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-member-access-manager.css'
const db=supabase as any
const ORDER=['owner','admin','supervisor','dispatcher','safety','mechanic','accounting','operator']
export default function PermissionMatrixPanel(){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState('')
 useEffect(()=>{void (async()=>{const [r,p]=await Promise.all([db.from('roles').select('id,key,name').is('organization_id',null),db.from('role_permissions').select('role_id,permission_key')]);if(r.error||p.error){setError((r.error||p.error).message);return}const by=new Map<string,string[]>();for(const x of p.data||[]){const role=(r.data||[]).find((z:any)=>z.id===x.role_id);if(role){const a=by.get(role.key)||[];a.push(x.permission_key);by.set(role.key,a)}}setRows((r.data||[]).sort((a:any,b:any)=>ORDER.indexOf(a.key)-ORDER.indexOf(b.key)).map((x:any)=>({...x,permissions:(by.get(x.key)||[]).sort()})))})()},[])
 return <section className="team-card permission-matrix"><div className="team-section-heading"><div><span className="team-eyebrow">PERMISSIONS</span><h2>Role permission audit</h2></div><ShieldCheck size={23}/></div>{error&&<div className="team-error">{error}</div>}<p className="permission-help">This is the effective system permission set for each standard Northborn role. Employees with multiple roles receive the combined permissions.</p><div className="permission-role-grid">{rows.map(r=><details key={r.id}><summary><strong>{r.name}</strong><span>{r.permissions.length} permissions</span></summary><div>{r.permissions.map((p:string)=><code key={p}>{p}</code>)}</div></details>)}</div></section>
}