export type DispatchStage='unassigned'|'ready'|'dispatched'|'acknowledged'|'en_route'|'onsite'|'work_started'|'work_completed'

export const DISPATCH_STAGES:DispatchStage[]=['unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed']
export const ACTIVE_BOARD_STAGES:DispatchStage[]=['unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started']

export const DISPATCH_STAGE_META:Record<DispatchStage,{label:string;short:string;hint:string}>={
  unassigned:{label:'Unassigned',short:'Unassigned',hint:'Missing a crew member or unit.'},
  ready:{label:'Ready',short:'Ready',hint:'Crew and unit are assigned and ready to send.'},
  dispatched:{label:'Dispatched',short:'Sent',hint:'Dispatch has released the job to the field crew.'},
  acknowledged:{label:'Acknowledged',short:'Ack',hint:'The assigned operator has acknowledged the job.'},
  en_route:{label:'En route',short:'En route',hint:'The crew is travelling to the job.'},
  onsite:{label:'On site',short:'On site',hint:'The crew has arrived on location.'},
  work_started:{label:'Work started',short:'Working',hint:'Field work is underway.'},
  work_completed:{label:'Work completed',short:'Done',hint:'The field work has been completed.'},
}

export function dispatchStageLabel(value:string|null|undefined){
  return DISPATCH_STAGE_META[(value||'unassigned') as DispatchStage]?.label||String(value||'Unassigned').replaceAll('_',' ')
}
export function statusLabel(value:string|null|undefined){
  return String(value||'draft').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
}
export function stageIndex(value:string|null|undefined){return Math.max(0,DISPATCH_STAGES.indexOf((value||'unassigned') as DispatchStage))}
export function nextOperatorStage(value:string|null|undefined):DispatchStage|null{
  const stage=(value||'unassigned') as DispatchStage
  if(stage==='dispatched')return 'acknowledged'
  if(stage==='acknowledged')return 'en_route'
  if(stage==='en_route')return 'onsite'
  if(stage==='onsite')return 'work_started'
  return null
}
export function operatorStageAction(value:string|null|undefined){
  const next=nextOperatorStage(value)
  if(next==='acknowledged')return 'Acknowledge dispatch'
  if(next==='en_route')return 'Start driving'
  if(next==='onsite')return 'Mark on site'
  if(next==='work_started')return 'Start work'
  return null
}
export function jobDayValue(job:{onsite_time?:string|null;scheduled_start?:string|null;shop_time?:string|null}){
  return job.onsite_time||job.scheduled_start||job.shop_time||null
}
export function localDayKey(value:Date|string|number){
  const date=value instanceof Date?value:new Date(value)
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0')
  return `${y}-${m}-${d}`
}
