import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Loader2, Navigation, Radio, Truck } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isTestMode, readTestLabData, writeTestLabData } from './test-lab'
import { DISPATCH_STAGES, dispatchStageLabel, nextOperatorStage, operatorStageAction, stageIndex, type DispatchStage } from './job-operations'
import './operator-dispatch-progress.css'

const db=supabase as any
type Job={id:string;dispatch_stage?:string|null;status:string}
type Props={job:Job;organizationId:string;onChanged:()=>Promise<unknown>}

export default function OperatorDispatchProgress({job,organizationId,onChanged}:Props){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const stage=(job.dispatch_stage||'unassigned') as DispatchStage
  const next=nextOperatorStage(stage)
  const action=operatorStageAction(stage)
  const visible=useMemo(()=>DISPATCH_STAGES.slice(2),[])
  const current=stageIndex(stage)

  const advance=async()=>{
    if(!next)return
    setBusy(true);setError('')
    try{
      if(isTestMode()){
        const data=readTestLabData()
        const now=new Date().toISOString()
        writeTestLabData({...data,jobs:data.jobs.map(item=>item.id===job.id?{...item,dispatch_stage:next,status:next==='work_started'?'active':item.status,dispatch_acknowledged_at:next==='acknowledged'?now:(item as any).dispatch_acknowledged_at,en_route_at:next==='en_route'?now:(item as any).en_route_at,onsite_at:next==='onsite'?now:(item as any).onsite_at,work_started_at:next==='work_started'?now:(item as any).work_started_at}:item) as any})
      }else{
        const result=await db.rpc('set_my_assigned_job_dispatch_stage',{_organization_id:organizationId,_job_id:job.id,_stage:next})
        if(result.error)throw result.error
      }
      await onChanged()
    }catch(e){setError(e instanceof Error?e.message:String((e as any)?.message||e||'Unable to update dispatch.'))}
    finally{setBusy(false)}
  }

  return <section className="operator-dispatch-progress">
    <div className="operator-dispatch-progress-head"><div><span>FIELD PROGRESS</span><strong>{dispatchStageLabel(stage)}</strong></div><Radio size={20}/></div>
    <div className="operator-stage-track">{visible.map(item=>{const index=stageIndex(item),done=current>index,active=current===index;return <div className={active?'active':done?'done':''} key={item}>{done?<CheckCircle2/>:<Circle/>}<span>{dispatchStageLabel(item)}</span></div>})}</div>
    {error&&<div className="operator-stage-error">{error}</div>}
    {action&&<button className="operator-stage-action" type="button" onClick={()=>void advance()} disabled={busy}>{busy?<Loader2 className="spin" size={18}/>:next==='en_route'?<Navigation size={18}/>:next==='onsite'?<Truck size={18}/>:<CheckCircle2 size={18}/>} {busy?'Updating…':action}</button>}
    {!action&&stage==='work_started'&&<div className="operator-stage-note">Work is underway. Complete the job from the completion section below when field work is finished.</div>}
    {stage==='work_completed'&&<div className="operator-stage-note complete">Field work completed.</div>}
  </section>
}
