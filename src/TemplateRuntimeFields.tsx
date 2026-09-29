import type { TemplateField, TemplateRow } from './template-manager-data'
import './template-runtime-fields.css'

type ValueMap=Record<string,string|number|boolean|null|undefined>

function shouldShow(field:TemplateField,values:ValueMap){
  if(!field.condition_key)return true
  return String(values[field.condition_key]??'')===String(field.condition_value??'')
}

function visibleCustomFields(template:TemplateRow|null|undefined,values:ValueMap){
  if(!template)return []
  return (template.fields||[]).filter(field=>!field.binding&&shouldShow(field,values))
}

export function validateTemplateAnswers(template:TemplateRow|null|undefined,values:ValueMap){
  const missing=visibleCustomFields(template,values).filter(field=>field.required&&String(values[field.key]??'').trim()==='')
  if(!missing.length)return ''
  return 'Complete the required template field'+(missing.length===1?'':'s')+': '+missing.map(field=>field.label).join(', ')+'.'
}

export default function TemplateRuntimeFields({template,values,onChange}:{template:TemplateRow|null|undefined;values:ValueMap;onChange:(next:ValueMap)=>void}){
  if(!template)return null
  const fields=visibleCustomFields(template,values)
  if(!fields.length)return null
  const sections=new Map<string,TemplateField[]>()
  for(const field of fields){
    const section=field.section?.trim()||'Additional company form fields'
    const list=sections.get(section)||[]
    list.push(field);sections.set(section,list)
  }
  const set=(key:string,value:string|number|boolean)=>onChange({...values,[key]:value})
  return <section className="template-runtime">
    <div className="template-runtime-heading"><span>COMPANY TEMPLATE</span><strong>{template.name}</strong><small>Version {template.version}</small></div>
    {[...sections.entries()].map(([section,rows])=><div className="template-runtime-section" key={section}><h3>{section}</h3><div className="template-runtime-grid">{rows.map(field=><label className={field.type==='textarea'||field.type==='table'?'wide':''} key={field.id}><span>{field.label}{field.required?' *':''}</span>{field.type==='textarea'||field.type==='table'?<textarea value={String(values[field.key]??'')} onChange={e=>set(field.key,e.target.value)} placeholder={field.type==='table'?'Enter rows or details':'Type here'}/>:field.type==='checkbox'?<select value={String(values[field.key]??'')} onChange={e=>set(field.key,e.target.value)}><option value="">Choose one</option><option value="Yes">Yes</option><option value="No">No</option></select>:field.type==='select'?<select value={String(values[field.key]??'')} onChange={e=>set(field.key,e.target.value)}><option value="">Choose one</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</select>:field.type==='signature'?<input value={String(values[field.key]??'')} onChange={e=>set(field.key,e.target.value)} placeholder="Signature name / acknowledgement"/>:<input type={field.type==='date'?'date':field.type==='datetime'?'datetime-local':field.type==='number'||field.type==='currency'?'number':'text'} step={field.type==='currency'?'0.01':undefined} value={String(values[field.key]??'')} onChange={e=>set(field.key,e.target.value)}/>} {field.condition_key&&<small>Shown when {field.condition_key} = {field.condition_value}</small>}</label>)}</div></div>)}
  </section>
}
