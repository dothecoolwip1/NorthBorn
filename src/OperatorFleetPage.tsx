import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ClipboardCheck, Gauge, History, ShieldCheck, Truck, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-fleet.css'

const db = supabase as any

type Props = { userId: string; organizationId: string; organizationName: string }
type Employee = { id: string; first_name: string; last_name: string }
type Assignment = { job_id: string; employee_id: string | null; vehicle_id: string | null }
type Job = { id:string; shop_time:string|null; scheduled_start:string|null; status:string }
type Vehicle = { id: string; unit_number: string; name: string | null; vehicle_type: string; status: string; odometer_km: number | null; engine_hours: number | null }
type Defect = { id: string; vehicle_id: string; title: string; severity: string; status: string; out_of_service: boolean; reported_at: string; report_count:number }
type Inspection = { id: string; vehicle_id: string; inspection_type: string; result: string; inspected_at: string; notes: string | null }
type Duplicate = { defect_id:string; title:string; description:string|null; severity:string; out_of_service:boolean; report_count:number; similarity_score:number }

const label = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())
const formatDate = (value: string) => new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))
const readError = (error: unknown) => error instanceof Error ? error.message : String((error as {message?:string})?.message || error || 'Something went wrong.')
const numberOrNull = (value: string) => value.trim()==='' ? null : Number(value)
const clean = (value:string) => value.replace(/^[-•*\s]+/,'').replace(/^(noticed|found|issue|defect|problem)\s*[:\-]?\s*/i,'').trim()
const noIssue = /^(ok|okay|good|all good|passed|pass|fine|none|nil|no issues?|no defects?|nothing wrong)$/i
const issueWords = /(leak|low|flat|crack|broken|damage|damaged|out|not work|won't|wont|noise|noisy|loose|worn|warning|light|tire|tyre|brake|mirror|glass|hose|pump|vac|hydraulic|oil|fluid|coolant|battery|belt|door|latch|steer|steering|vibration|smoke|heat|overheat|pressure|gauge|alarm|fault|code|missing|stuck|hard to|soft)/i

function extractDefects(text:string){
  const raw=text.trim();if(!raw||noIssue.test(raw))return []
  const first=raw.replace(/\r/g,'\n').split(/\n+|;+/).flatMap(part=>part.split(/(?<=[.!?])\s+/))
  const parts:string[]=[]
  for(const item of first){
    const c=clean(item.replace(/[.!?]+$/,''));if(!c||noIssue.test(c))continue
    if(c.length>75||(/\b(and|also|plus)\b/i.test(c)&&issueWords.test(c))){
      for(const bit of c.split(/\s+(?:and|also|plus)\s+|,\s*(?=(?:left|right|front|rear|driver|passenger|oil|fluid|tire|tyre|brake|light|mirror|hose|pump|vac|hydraulic|battery|belt|door|latch|warning|gauge))/i)){const x=clean(bit);if(x&&!noIssue.test(x))parts.push(x)}
    }else parts.push(c)
  }
  const candidates=parts.filter(p=>p.length>1&&(p.split(/\s+/).length<=3||issueWords.test(p)))
  const seen=new Set<string>();return candidates.filter(p=>{const key=p.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key))return false;seen.add(key);return true}).slice(0,8)
}
function defectTitle(text:string){const value=clean(text).replace(/^there(?:'s| is)\s+/i,'').trim();return value.length>90?`${value.slice(0,87)}…`:value}

async function findDuplicate(organizationId:string,vehicleId:string,title:string,description:string|null){
  const r=await db.rpc('find_similar_fleet_defect',{_organization_id:organizationId,_vehicle_id:vehicleId,_title:title,_description:description})
  if(r.error)throw r.error
  return (r.data?.[0]||null) as Duplicate|null
}
async function reportDefect(args:{organizationId:string;vehicle:Vehicle;title:string;description:string|null;severity:string;outOfService:boolean;sourceInspectionId?:string|null;existingDefectId?:string|null}){
  const r=await db.rpc('report_fleet_defect',{_organization_id:args.organizationId,_vehicle_id:args.vehicle.id,_title:args.title,_description:args.description,_severity:args.severity,_out_of_service:args.outOfService,_odometer_km:args.vehicle.odometer_km,_engine_hours:args.vehicle.engine_hours,_source_inspection_id:args.sourceInspectionId||null,_existing_defect_id:args.existingDefectId||null})
  if(r.error)throw r.error
  return r.data as string
}

export default function OperatorFleetPage({userId,organizationId,organizationName}:Props){
  const [employee,setEmployee]=useState<Employee|null>(null),[vehicles,setVehicles]=useState<Vehicle[]>([]),[defects,setDefects]=useState<Defect[]>([]),[inspections,setInspections]=useState<Inspection[]>([]),[jobs,setJobs]=useState<Job[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[defectVehicle,setDefectVehicle]=useState<Vehicle|null>(null),[inspectionVehicle,setInspectionVehicle]=useState<Vehicle|null>(null)
  const load=useCallback(async()=>{
    setError('')
    const employeeResult=await db.from('employees').select('id,first_name,last_name').eq('organization_id',organizationId).eq('user_id',userId).maybeSingle()
    if(employeeResult.error||!employeeResult.data){setError(employeeResult.error?.message||'Your employee profile is not linked.');setLoading(false);return}
    const currentEmployee=employeeResult.data as Employee
    const [assignmentResult,jobResult,vehicleResult]=await Promise.all([
      db.from('dispatch_assignments').select('job_id,employee_id,vehicle_id').eq('organization_id',organizationId),
      db.from('jobs').select('id,shop_time,scheduled_start,status').eq('organization_id',organizationId),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status,odometer_km,engine_hours').eq('organization_id',organizationId).neq('status','archived').order('unit_number'),
    ])
    const first=assignmentResult.error||jobResult.error||vehicleResult.error;if(first){setError(first.message);setLoading(false);return}
    const authorizedVehicles=(vehicleResult.data||[]) as Vehicle[];const ids=authorizedVehicles.map(v=>v.id)
    const [defectResult,inspectionResult]=ids.length?await Promise.all([
      db.from('fleet_defects').select('id,vehicle_id,title,severity,status,out_of_service,reported_at,report_count').eq('organization_id',organizationId).in('vehicle_id',ids).order('last_reported_at',{ascending:false}),
      db.from('fleet_inspections').select('id,vehicle_id,inspection_type,result,inspected_at,notes').eq('organization_id',organizationId).in('vehicle_id',ids).order('inspected_at',{ascending:false}).limit(50),
    ]):[{data:[],error:null},{data:[],error:null}]
    const second=(defectResult as any).error||(inspectionResult as any).error;if(second)setError(second.message)
    setEmployee(currentEmployee);setVehicles(authorizedVehicles);setAssignments((assignmentResult.data||[]) as Assignment[]);setJobs((jobResult.data||[]) as Job[]);setDefects(((defectResult as any).data||[]) as Defect[]);setInspections(((inspectionResult as any).data||[]) as Inspection[]);setLoading(false)
  },[organizationId,userId])
  useEffect(()=>{void load()},[load])
  const preTripReady=useMemo(()=>{const result=new Set<string>();if(!employee)return result;const ownJobs=new Set(assignments.filter(a=>a.employee_id===employee.id).map(a=>a.job_id));for(const a of assignments){if(!a.vehicle_id||!ownJobs.has(a.job_id))continue;const job=jobs.find(j=>j.id===a.job_id);if(!job||['completed','cancelled'].includes(job.status))continue;const at=job.shop_time||job.scheduled_start;if(at&&new Date(at).getTime()<=Date.now())result.add(a.vehicle_id)}return result},[assignments,jobs,employee])
  if(loading)return <div className="opfleet-loading">Loading fleet access…</div>
  return <div className="opfleet-shell"><header><NavLink to="/"><ArrowLeft size={18}/></NavLink><div><span>FIELD FLEET</span><strong>{organizationName}</strong></div></header><main><div className="opfleet-hero"><span>MY EQUIPMENT ACCESS</span><h1>{employee?`${employee.first_name}'s units`:'Fleet access'}</h1><p>Report equipment problems anytime. Pre-trip inspections unlock once you are assigned to the job and the shop time has arrived.</p></div>{error&&<div className="opfleet-message">{error}</div>}{vehicles.length?<div className="opfleet-units">{vehicles.map(vehicle=>{const openDefects=defects.filter(d=>d.vehicle_id===vehicle.id&&!['resolved','dismissed'].includes(d.status));const recent=inspections.filter(i=>i.vehicle_id===vehicle.id).slice(0,3);const ready=preTripReady.has(vehicle.id);return <article className="opfleet-unit" key={vehicle.id}><div className="opfleet-unit-head"><div className="opfleet-icon"><Truck size={23}/></div><div><span>UNIT {vehicle.unit_number}</span><strong>{vehicle.name||vehicle.vehicle_type}</strong></div><em className={`status-${vehicle.status}`}>{label(vehicle.status)}</em></div><div className="opfleet-meters"><div><Gauge size={16}/><span>{vehicle.odometer_km!==null?`${vehicle.odometer_km.toLocaleString()} km`:'Odometer not set'}</span></div><div><History size={16}/><span>{vehicle.engine_hours!==null?`${vehicle.engine_hours.toLocaleString()} h`:'Hours not set'}</span></div></div><div className="opfleet-actions"><button onClick={()=>setInspectionVehicle(vehicle)} title={ready?'Pre-trip available':'Pre-trip unlocks after assigned job shop time'}><ClipboardCheck size={17}/>{ready?'Pre-trip / inspection':'Inspection'}</button><button className="danger" onClick={()=>setDefectVehicle(vehicle)}><AlertTriangle size={17}/>Report problem</button></div>{!ready&&<div className="opfleet-empty">Pre-trip is not available yet for this unit. It unlocks after the shop time on a job you are assigned to.</div>}{openDefects.length>0&&<section><div className="opfleet-section-title"><AlertTriangle size={15}/>Open defects</div>{openDefects.map(d=><div className="opfleet-row" key={d.id}><div><strong>{d.title}</strong><span>{label(d.severity)} · {label(d.status)}{d.report_count>1?` · ${d.report_count} reports`:''}</span></div>{d.out_of_service&&<em>OUT OF SERVICE</em>}</div>)}</section>}<section><div className="opfleet-section-title"><ShieldCheck size={15}/>Recent inspections</div>{recent.length?recent.map(i=><div className="opfleet-row" key={i.id}><div><strong>{label(i.inspection_type)}</strong><span>{formatDate(i.inspected_at)}</span></div><em className={`result-${i.result}`}>{label(i.result)}</em></div>):<div className="opfleet-empty">No inspections recorded for this unit.</div>}</section></article>})}</div>:<div className="opfleet-no-units"><Truck size={32}/><strong>No fleet access configured</strong><span>Your manager can give you access to all trucks or specific units.</span></div>}</main>{defectVehicle&&<DefectForm vehicle={defectVehicle} organizationId={organizationId} onClose={()=>setDefectVehicle(null)} onSaved={async()=>{setDefectVehicle(null);await load()}}/>}{inspectionVehicle&&<InspectionForm vehicle={inspectionVehicle} organizationId={organizationId} userId={userId} preTripReady={preTripReady.has(inspectionVehicle.id)} onClose={()=>setInspectionVehicle(null)} onSaved={async()=>{setInspectionVehicle(null);await load()}}/>}</div>
}

function DefectForm({vehicle,organizationId,onClose,onSaved}:{vehicle:Vehicle;organizationId:string;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [form,setForm]=useState({title:'',description:'',severity:'medium',out_of_service:false}),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{
    const title=defectTitle(form.title);const duplicate=await findDuplicate(organizationId,vehicle.id,title,form.description.trim()||null)
    let existing:string|null=null
    if(duplicate){const again=window.confirm(`This looks like an existing open defect: “${duplicate.title}”${duplicate.report_count>0?` (${duplicate.report_count} report${duplicate.report_count===1?'':'s'})`:''}.\n\nDo you still want to report it? If yes, Northborn will add your report to the existing defect instead of creating a duplicate.`);if(!again){setBusy(false);return}existing=duplicate.defect_id}
    await reportDefect({organizationId,vehicle,title,description:form.description.trim()||null,severity:form.severity,outOfService:form.out_of_service,existingDefectId:existing});await onSaved()
  }catch(err){setError(readError(err))}finally{setBusy(false)}}
  return <Modal title={`Report problem · Unit ${vehicle.unit_number}`} onClose={onClose}><form onSubmit={submit}>{error&&<div className="opfleet-message">{error}</div>}<label>Problem<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Vac pump making noise" required/></label><label>What did you notice?<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe what happened, where the leak is, warning lights, noises, etc."/></label><label>Severity<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label className="opfleet-check"><input type="checkbox" checked={form.out_of_service} onChange={e=>setForm({...form,out_of_service:e.target.checked})}/><span>This unit should not be operated until repaired</span></label><div className="opfleet-form-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Checking…':'Report defect'}</button></div></form></Modal>
}

function InspectionForm({vehicle,organizationId,userId,preTripReady,onClose,onSaved}:{vehicle:Vehicle;organizationId:string;userId:string;preTripReady:boolean;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [form,setForm]=useState({inspection_type:preTripReady?'pre_trip':'post_trip',result:'pass',odometer_km:vehicle.odometer_km?.toString()||'',engine_hours:vehicle.engine_hours?.toString()||'',notes:''}),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{
    if(form.inspection_type==='pre_trip'&&!preTripReady)throw new Error('Pre-trip is not available until you are assigned to the job and its shop time has arrived.')
    const inspection=await db.from('fleet_inspections').insert({organization_id:organizationId,vehicle_id:vehicle.id,inspection_type:form.inspection_type,inspector_user_id:userId,odometer_km:numberOrNull(form.odometer_km),engine_hours:numberOrNull(form.engine_hours),result:form.result,notes:form.notes.trim()||null,checklist:[]}).select('id').single();if(inspection.error)throw inspection.error
    if(form.inspection_type==='pre_trip'){
      const parsed=extractDefects(form.notes)
      for(const phrase of parsed){
        const title=defectTitle(phrase);if(!title)continue
        const duplicate=await findDuplicate(organizationId,vehicle.id,title,phrase);let existing:string|null=null
        if(duplicate){const again=window.confirm(`Northborn found a similar open defect while reading your pre-trip notes:\n\n“${duplicate.title}”${duplicate.report_count>0?` · already reported ${duplicate.report_count} time${duplicate.report_count===1?'':'s'}`:''}\n\nYour note: “${title}”\n\nDo you still want to report it? If yes, your report will be added to the existing defect.`);if(!again)continue;existing=duplicate.defect_id}
        await reportDefect({organizationId,vehicle,title,description:phrase,severity:form.result==='fail'?'high':'medium',outOfService:form.result==='fail',sourceInspectionId:inspection.data.id,existingDefectId:existing})
      }
      if(form.result==='fail'&&!parsed.length){
        const fallback='Failed pre-trip inspection';const duplicate=await findDuplicate(organizationId,vehicle.id,fallback,form.notes.trim()||null);let existing:string|null=null
        if(duplicate){const again=window.confirm(`A similar open defect already exists: “${duplicate.title}”. Do you still want to report this failed pre-trip against it?`);if(again)existing=duplicate.defect_id;else{await onSaved();return}}
        await reportDefect({organizationId,vehicle,title:fallback,description:form.notes.trim()||null,severity:'high',outOfService:true,sourceInspectionId:inspection.data.id,existingDefectId:existing})
      }
    }
    await onSaved()
  }catch(err){setError(readError(err))}finally{setBusy(false)}}
  return <Modal title={`Inspection · Unit ${vehicle.unit_number}`} onClose={onClose}><form onSubmit={submit}>{error&&<div className="opfleet-message">{error}</div>}<div className="opfleet-two"><label>Inspection<select value={form.inspection_type} onChange={e=>setForm({...form,inspection_type:e.target.value})}><option value="pre_trip" disabled={!preTripReady}>Pre-trip{!preTripReady?' · locked until shop time':''}</option><option value="post_trip">Post-trip</option></select></label><label>Result<select value={form.result} onChange={e=>setForm({...form,result:e.target.value})}><option value="pass">Pass</option><option value="pass_with_defects">Pass with defects</option><option value="fail">Fail</option></select></label></div><div className="opfleet-two"><label>Odometer km<input type="number" min="0" value={form.odometer_km} onChange={e=>setForm({...form,odometer_km:e.target.value})}/></label><label>Engine hours<input type="number" min="0" step="0.1" value={form.engine_hours} onChange={e=>setForm({...form,engine_hours:e.target.value})}/></label></div><label>Inspection notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Write normally. Example: left headlight out, oil leak under pump and passenger mirror cracked. Northborn will split defect notes into repair items."/></label>{form.inspection_type==='pre_trip'&&form.notes.trim()&&<div className="opfleet-message">Detected defect notes: {extractDefects(form.notes).length?extractDefects(form.notes).map(x=>`“${defectTitle(x)}”`).join(', '):'none yet'}</div>}<div className="opfleet-form-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Analyzing…':'Save inspection'}</button></div></form></Modal>
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="opfleet-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="opfleet-modal"><div className="opfleet-modal-head"><div><span>FIELD FLEET</span><h2>{title}</h2></div><button onClick={onClose}><X size={19}/></button></div>{children}</section></div>}
