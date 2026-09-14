import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import { ArrowLeft, Check, Search, ShieldCheck, Truck, Users } from 'lucide-react'
import { supabase } from './lib/supabase'
import './employee-fleet-access.css'

const db=supabase as any
const TEST_MODE_KEY='northborn_test_mode'
const TEST_ORG={id:'00000000-0000-0000-0000-000000000001',name:'Northborn Test Company'}
const TEST_KEY='northborn_test_employee_fleet_access_v1'

type Org={id:string;name:string}
type Employee={id:string;first_name:string;last_name:string;position:string|null;status:string}
type Vehicle={id:string;unit_number:string;name:string|null;vehicle_type:string;status:string}
type Profile={id?:string;employee_id:string;access_mode:'all'|'specific'}
type Grant={id?:string;employee_id:string;vehicle_id:string}
type Workspace={organization:Org|null;roleKey:string;employees:Employee[];vehicles:Vehicle[];profiles:Profile[];grants:Grant[];testMode:boolean}
const EMPTY:Workspace={organization:null,roleKey:'',employees:[],vehicles:[],profiles:[],grants:[],testMode:false}
const ALLOWED=new Set(['owner','admin','supervisor'])

function readTest(){try{return JSON.parse(localStorage.getItem(TEST_KEY)||'{"profiles":[],"grants":[]}')}catch{return{profiles:[],grants:[]}}}
function saveTest(profiles:Profile[],grants:Grant[]){localStorage.setItem(TEST_KEY,JSON.stringify({profiles,grants}))}

export default function EmployeeFleetAccessPage(){
  const [ws,setWs]=useState<Workspace>(EMPTY),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false)
  const load=useCallback(async()=>{
    setError('')
    const testMode=localStorage.getItem(TEST_MODE_KEY)==='1'
    if(testMode){
      const base=JSON.parse(localStorage.getItem('northborn_test_data_v3')||'{}'),saved=readTest()
      setWs({organization:TEST_ORG,roleKey:'owner',employees:base.employees||[],vehicles:base.vehicles||[],profiles:saved.profiles||[],grants:saved.grants||[],testMode:true});setLoading(false);return
    }
    const {data:s}=await supabase.auth.getSession();const user=s.session?.user;if(!user){setLoading(false);return}
    const m=await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();if(m.error||!m.data){setLoading(false);return}
    const rr=await db.from('membership_roles').select('role:roles(key)').eq('membership_id',m.data.id);const roleKey=rr.data?.[0]?.role?.key||'';const org=m.data.organization as Org
    if(!ALLOWED.has(roleKey)){setWs({...EMPTY,organization:org,roleKey});setLoading(false);return}
    const [e,v,p,g]=await Promise.all([
      db.from('employees').select('id,first_name,last_name,position,status').eq('organization_id',org.id).neq('status','archived').order('last_name'),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id',org.id).neq('status','archived').order('unit_number'),
      db.from('employee_fleet_access_profiles').select('id,employee_id,access_mode').eq('organization_id',org.id),
      db.from('employee_vehicle_access').select('id,employee_id,vehicle_id').eq('organization_id',org.id),
    ]);const er=e.error||v.error||p.error||g.error;if(er)setError(er.message)
    setWs({organization:org,roleKey,employees:e.data||[],vehicles:v.data||[],profiles:p.data||[],grants:g.data||[],testMode:false});setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return ws.employees.filter(e=>!q||`${e.first_name} ${e.last_name} ${e.position||''}`.toLowerCase().includes(q))},[ws.employees,query])
  if(loading)return <div className="efa-loading">Loading employee fleet access…</div>
  if(!ws.organization)return <Navigate to="/" replace/>
  if(!ws.testMode&&!ALLOWED.has(ws.roleKey))return <Navigate to="/" replace/>
  const employee=selected?ws.employees.find(e=>e.id===selected)||null:null
  const profile=employee?ws.profiles.find(p=>p.employee_id===employee.id):null
  const mode=profile?.access_mode||'specific'
  const legacy=!profile
  const selectedVehicles=employee?new Set(ws.grants.filter(g=>g.employee_id===employee.id).map(g=>g.vehicle_id)):new Set<string>()

  const saveMode=async(nextMode:'all'|'specific')=>{
    if(!employee||!ws.organization)return;setBusy(true);setError('')
    try{
      if(ws.testMode){const profiles=ws.profiles.filter(p=>p.employee_id!==employee.id);profiles.push({employee_id:employee.id,access_mode:nextMode});saveTest(profiles,ws.grants);await load();return}
      const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required')
      const r=await db.from('employee_fleet_access_profiles').upsert({organization_id:ws.organization.id,employee_id:employee.id,access_mode:nextMode,created_by:u.user.id},{onConflict:'organization_id,employee_id'});if(r.error)throw r.error;await load()
    }catch(err:any){setError(err.message||String(err))}finally{setBusy(false)}
  }
  const toggleVehicle=async(vehicleId:string)=>{
    if(!employee||!ws.organization||mode!=='specific')return;setBusy(true);setError('')
    try{
      if(legacy)await saveMode('specific')
      const exists=ws.grants.find(g=>g.employee_id===employee.id&&g.vehicle_id===vehicleId)
      if(ws.testMode){const grants=exists?ws.grants.filter(g=>!(g.employee_id===employee.id&&g.vehicle_id===vehicleId)):[...ws.grants,{employee_id:employee.id,vehicle_id:vehicleId}];saveTest(ws.profiles.some(p=>p.employee_id===employee.id)?ws.profiles:[...ws.profiles,{employee_id:employee.id,access_mode:'specific'}],grants);await load();return}
      if(exists){const r=await db.from('employee_vehicle_access').delete().eq('organization_id',ws.organization.id).eq('employee_id',employee.id).eq('vehicle_id',vehicleId);if(r.error)throw r.error}
      else{const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Sign in required');const r=await db.from('employee_vehicle_access').insert({organization_id:ws.organization.id,employee_id:employee.id,vehicle_id:vehicleId,created_by:u.user.id});if(r.error)throw r.error}
      await load()
    }catch(err:any){setError(err.message||String(err))}finally{setBusy(false)}
  }

  return <div className="efa-shell"><header><NavLink to="/fleet"><ArrowLeft size={18}/></NavLink><div><span>FLEET ACCESS</span><strong>{ws.organization.name}</strong></div></header><main><div className="efa-hero"><div><span>EMPLOYEE ACCESS</span><h1>Choose which trucks each employee can use.</h1><p>Give an employee access to every unit or only the trucks you select. Pre-trip eligibility still depends on the employee being assigned to a job and the shop time having arrived.</p></div></div>{error&&<div className="efa-message">{error}</div>}<div className="efa-layout"><section className="efa-list"><div className="efa-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employees…"/></div>{filtered.map(e=>{const p=ws.profiles.find(x=>x.employee_id===e.id);const count=ws.grants.filter(g=>g.employee_id===e.id).length;return <button key={e.id} className={selected===e.id?'active':''} onClick={()=>setSelected(e.id)}><Users size={18}/><div><strong>{e.first_name} {e.last_name}</strong><span>{e.position||'Employee'}</span></div><em>{p?.access_mode==='all'?'All trucks':p?`${count} truck${count===1?'':'s'}`:'Legacy: assigned jobs'}</em></button>})}</section><section className="efa-panel">{employee?<><div className="efa-panel-head"><div><span>EMPLOYEE</span><h2>{employee.first_name} {employee.last_name}</h2></div><ShieldCheck size={24}/></div>{legacy&&<div className="efa-note">No custom rule yet. This employee currently keeps the old behavior and only sees trucks tied to their dispatched jobs. Choose an access mode below to replace that rule.</div>}<div className="efa-mode"><button disabled={busy} className={mode==='all'&&!legacy?'selected':''} onClick={()=>void saveMode('all')}><Truck size={20}/><strong>All trucks</strong><span>Can view and report against any active unit.</span>{mode==='all'&&!legacy&&<Check size={18}/>}</button><button disabled={busy} className={mode==='specific'&&!legacy?'selected':''} onClick={()=>void saveMode('specific')}><ShieldCheck size={20}/><strong>Specific trucks</strong><span>Only units selected below are available.</span>{mode==='specific'&&!legacy&&<Check size={18}/>}</button></div>{mode==='specific'&&<div className="efa-vehicles"><h3>Allowed trucks</h3><div>{ws.vehicles.map(v=>{const checked=selectedVehicles.has(v.id);return <button disabled={busy} key={v.id} className={checked?'selected':''} onClick={()=>void toggleVehicle(v.id)}><span className="efa-check">{checked&&<Check size={14}/>}</span><div><strong>Unit {v.unit_number}</strong><small>{v.name||v.vehicle_type}</small></div><em>{v.status.replaceAll('_',' ')}</em></button>})}</div></div>}</>:<div className="efa-empty"><Users size={30}/><strong>Select an employee</strong><span>Choose someone on the left to configure truck access.</span></div>}</section></div></main></div>
}
