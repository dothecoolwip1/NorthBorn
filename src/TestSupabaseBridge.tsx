import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './lib/supabase'
import {
  clearTestLab,
  getTestPersona,
  readTestClientContacts,
  readTestLabData,
  TEST_CLIENT_JOB_META_KEY,
  TEST_CLIENT_REQUESTS_KEY,
  TEST_ORG,
  TEST_USERS,
  testClientContext,
  type TestPersona,
  writeTestClientContacts,
  writeTestLabData,
} from './test-lab'

const client = supabase as any
const GENERIC_PREFIX = 'northborn_test_table_v1_'
const original = {
  from: client.from.bind(client),
  rpc: client.rpc.bind(client),
  channel: client.channel.bind(client),
  removeChannel: client.removeChannel.bind(client),
  functionsInvoke: client.functions.invoke.bind(client.functions),
  authGetSession: client.auth.getSession.bind(client.auth),
  authGetUser: client.auth.getUser.bind(client.auth),
  authOnAuthStateChange: client.auth.onAuthStateChange.bind(client.auth),
  authSignOut: client.auth.signOut.bind(client.auth),
}
let installed = false
let activePersona: TestPersona = 'manager'
const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()

function testUser() {
  const user = TEST_USERS[activePersona]
  return { id:user.id,aud:'authenticated',role:'authenticated',email:user.email,email_confirmed_at:now(),phone:'',confirmed_at:now(),last_sign_in_at:now(),app_metadata:{provider:'email',providers:['email'],northborn_test:true},user_metadata:{full_name:`${user.label} Test`,northborn_test:true},identities:[],created_at:now(),updated_at:now(),is_anonymous:false }
}
function testSession() { return {access_token:'northborn-test-token',refresh_token:'northborn-test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:testUser()} }
function readGeneric(table:string) { try { return JSON.parse(localStorage.getItem(`${GENERIC_PREFIX}${table}`) || '[]') as any[] } catch { return [] } }
function writeGeneric(table:string, rows:any[]) { localStorage.setItem(`${GENERIC_PREFIX}${table}`, JSON.stringify(rows)); window.dispatchEvent(new Event('northborn-test-data-changed')) }

function baseRows(table:string): any[] {
  const data = readTestLabData()
  const customer = data.customers[0]
  const managerMembership = { id:'test-manager-membership', organization_id:TEST_ORG.id, user_id:TEST_USERS.manager.id, status:'active', joined_at:now(), organization:{ id:TEST_ORG.id, name:TEST_ORG.name } }
  const operatorMembership = { id:'test-operator-membership', organization_id:TEST_ORG.id, user_id:TEST_USERS.operator.id, status:'active', joined_at:now(), organization:{ id:TEST_ORG.id, name:TEST_ORG.name } }
  switch(table) {
    case 'organizations': return [{ ...TEST_ORG, settings:{ test_environment:true }, status:'active' }]
    case 'organization_members': return [managerMembership, operatorMembership]
    case 'roles': return [
      { id:'test-role-owner', key:'owner', name:'Owner', organization_id:null },
      { id:'test-role-admin', key:'admin', name:'Administrator', organization_id:null },
      { id:'test-role-dispatcher', key:'dispatcher', name:'Dispatcher', organization_id:null },
      { id:'test-role-supervisor', key:'supervisor', name:'Supervisor', organization_id:null },
      { id:'test-role-operator', key:'operator', name:'Operator', organization_id:null },
      { id:'test-role-mechanic', key:'mechanic', name:'Mechanic', organization_id:null },
      { id:'test-role-safety', key:'safety', name:'Safety', organization_id:null },
      { id:'test-role-accounting', key:'accounting', name:'Accounting', organization_id:null },
    ]
    case 'membership_roles': return [
      { id:'test-membership-owner-role', membership_id:managerMembership.id, role_id:'test-role-owner', role:{ key:'owner', name:'Owner' } },
      { id:'test-membership-operator-role', membership_id:operatorMembership.id, role_id:'test-role-operator', role:{ key:'operator', name:'Operator' } },
    ]
    case 'profiles': return [
      {user_id:TEST_USERS.manager.id,display_name:'Manager Test',first_name:'Manager',last_name:'Test'},
      {user_id:TEST_USERS.operator.id,display_name:'Operator Test',first_name:'Operator',last_name:'Test'},
    ]
    case 'customers': return data.customers
    case 'employees': return data.employees
    case 'fleet_vehicles': return data.vehicles
    case 'jobs': return data.jobs
    case 'dispatch_assignments': return data.assignments
    case 'customer_contacts': return readTestClientContacts().map(c=>({ ...c, organization_id:TEST_ORG.id, customer_id:customer?.id }))
    case 'customer_portal_users': return [{ id:'test-client-portal-user', organization_id:TEST_ORG.id, customer_id:customer?.id, user_id:TEST_USERS.client.id, portal_role:'admin', status:'active' }]
    default: return readGeneric(table)
  }
}

function saveRows(table:string, rows:any[]) {
  const data = readTestLabData()
  if (table==='customers') return writeTestLabData({ ...data, customers:rows })
  if (table==='employees') return writeTestLabData({ ...data, employees:rows })
  if (table==='fleet_vehicles') return writeTestLabData({ ...data, vehicles:rows })
  if (table==='jobs') return writeTestLabData({ ...data, jobs:rows })
  if (table==='dispatch_assignments') return writeTestLabData({ ...data, assignments:rows })
  if (table==='customer_contacts') return writeTestClientContacts(rows.map(({id,name,title,phone,email,contact_type,status,updated_at}:any)=>({id,name,title,phone,email,contact_type,status,updated_at:updated_at||now()})))
  if (['organizations','organization_members','roles','membership_roles','customer_portal_users','profiles'].includes(table)) return
  writeGeneric(table, rows)
}

type Filter = { op:'eq'|'neq'|'in'|'is'; key:string; value:any }
class TestQuery implements PromiseLike<any> {
  table:string;mode:'select'|'insert'|'update'|'delete'='select';payload:any=null;filters:Filter[]=[];limitCount:number|null=null;orderKey:string|null=null;orderAscending=true
  constructor(table:string){this.table=table}
  select(_columns='*'){return this} insert(payload:any){this.mode='insert';this.payload=payload;return this} upsert(payload:any,_options?:any){this.mode='insert';this.payload=payload;return this} update(payload:any){this.mode='update';this.payload=payload;return this} delete(){this.mode='delete';return this}
  eq(key:string,value:any){this.filters.push({op:'eq',key,value});return this} neq(key:string,value:any){this.filters.push({op:'neq',key,value});return this} in(key:string,value:any[]){this.filters.push({op:'in',key,value});return this} is(key:string,value:any){this.filters.push({op:'is',key,value});return this} order(key:string,options?:{ascending?:boolean}){this.orderKey=key;this.orderAscending=options?.ascending!==false;return this} limit(value:number){this.limitCount=value;return this} maybeSingle(){return this.execute(true)} single(){return this.execute(true,true)}
  then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value:any)=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:any)=>TResult2|PromiseLike<TResult2>)|null){return this.execute(false).then(onfulfilled,onrejected)}
  private matches(row:any){return this.filters.every(f=>{const value=row?.[f.key];if(f.op==='eq')return value===f.value;if(f.op==='neq')return value!==f.value;if(f.op==='in')return f.value.includes(value);return f.value===null?value==null:value===f.value})}
  private async execute(single=false,strict=false){
    try{
      let rows=baseRows(this.table);const matched=rows.filter(r=>this.matches(r))
      if(this.mode==='insert'){const incoming=Array.isArray(this.payload)?this.payload:[this.payload];const added=incoming.map((item:any)=>({id:item.id||uid(),created_at:item.created_at||now(),updated_at:item.updated_at||now(),...item}));if(this.table==='employee_fleet_access_profiles'){for(const item of added){const index=rows.findIndex(r=>r.organization_id===item.organization_id&&r.employee_id===item.employee_id);if(index>=0)rows[index]={...rows[index],...item};else rows.push(item)}}else rows=[...rows,...added];saveRows(this.table,rows);return {data:single?(added[0]||null):added,error:null}}
      if(this.mode==='update'){rows=rows.map(row=>this.matches(row)?{...row,...this.payload,updated_at:now()}:row);saveRows(this.table,rows);const data=rows.filter(r=>this.matches(r));return {data:single?(data[0]||null):data,error:null}}
      if(this.mode==='delete'){const deleted=matched;rows=rows.filter(row=>!this.matches(row));saveRows(this.table,rows);return {data:single?(deleted[0]||null):deleted,error:null}}
      let data=[...matched];if(this.orderKey){const key=this.orderKey,dir=this.orderAscending?1:-1;data.sort((a,b)=>String(a?.[key]??'').localeCompare(String(b?.[key]??''))*dir)}if(this.limitCount!==null)data=data.slice(0,this.limitCount);if(single){if(strict&&!data.length)return {data:null,error:{message:'No rows found'}};return {data:data[0]||null,error:null}}return {data,error:null}
    }catch(error:any){return {data:single?null:[],error:{message:error?.message||String(error)}}}
  }
}

function readRequests(){try{return JSON.parse(localStorage.getItem(TEST_CLIENT_REQUESTS_KEY)||'[]') as any[]}catch{return[]}}
function writeRequests(rows:any[]){localStorage.setItem(TEST_CLIENT_REQUESTS_KEY,JSON.stringify(rows));window.dispatchEvent(new Event('northborn-test-data-changed'))}
function readJobMeta(){try{return JSON.parse(localStorage.getItem(TEST_CLIENT_JOB_META_KEY)||'{}') as Record<string,{notes?:string;contact_id?:string|null}>}catch{return{}}}
function writeJobMeta(value:Record<string,any>){localStorage.setItem(TEST_CLIENT_JOB_META_KEY,JSON.stringify(value));window.dispatchEvent(new Event('northborn-test-data-changed'))}
function operatorNameForJob(jobId:string){const data=readTestLabData();const employeeIds=data.assignments.filter(a=>a.job_id===jobId&&a.employee_id).map(a=>a.employee_id);return data.employees.find(e=>employeeIds.includes(e.id)&&e.position?.toLowerCase()==='operator')||data.employees.find(e=>employeeIds.includes(e.id))||null}
function portalJobs(customerId:string){const data=readTestLabData();const contacts=readTestClientContacts();const meta=readJobMeta();return data.jobs.filter(j=>j.customer_id===customerId).map(j=>{const operator=operatorNameForJob(j.id),m=meta[j.id]||{},contact=contacts.find(c=>c.id===m.contact_id)||null;return {job_id:j.id,job_number:j.job_number,title:j.title,site_name:j.site_name,site_address:j.site_address,scheduled_start:j.onsite_time||j.scheduled_start,scheduled_end:j.scheduled_end,status:j.status,completed_at:j.completed_at||null,onsite_contact_id:contact?.id||null,onsite_contact_name:contact?.name||null,onsite_contact_title:contact?.title||null,onsite_contact_phone:contact?.phone||null,onsite_contact_email:contact?.email||null,operator_name:operator?`${operator.first_name} ${operator.last_name}`:null,operator_phone:operator?.phone||null,dispatch_phone:'403-555-0101',emergency_phone:'403-555-0191',client_notes:m.notes||null}})}

async function fakeRpc(name:string,args:any={}){
  const ctx=testClientContext();const data=readTestLabData()
  switch(name){
    case 'get_my_customer_portal_context': return {data:[ctx],error:null}
    case 'get_my_customer_contacts': return {data:readTestClientContacts(),error:null}
    case 'get_my_customer_portal_members': return {data:[{portal_user_id:ctx.portal_user_id,user_id:TEST_USERS.client.id,email:TEST_USERS.client.email,portal_role:'admin',status:'active',created_at:now()}],error:null}
    case 'get_my_customer_portal_invites': return {data:readGeneric('customer_portal_invites'),error:null}
    case 'update_my_customer_portal_company': {const customers=data.customers.map(c=>c.id===args._customer_id?{...c,name:args._name||c.name,phone:args._phone||null,address:args._address||null,billing_email:args._billing_email||null}:c);writeTestLabData({...data,customers});return {data:true,error:null}}
    case 'upsert_my_customer_contact': {const contacts=readTestClientContacts(),id=args._contact_id||uid(),next={id,name:args._name,title:args._title||null,phone:args._phone||null,email:args._email||null,contact_type:args._contact_type,status:'active',updated_at:now()},index=contacts.findIndex(c=>c.id===id);if(index>=0)contacts[index]=next;else contacts.push(next);writeTestClientContacts(contacts);return {data:id,error:null}}
    case 'archive_my_customer_contact': {writeTestClientContacts(readTestClientContacts().map(c=>c.id===args._contact_id?{...c,status:'archived',updated_at:now()}:c));return {data:true,error:null}}
    case 'get_my_customer_jobs': return {data:portalJobs(args._customer_id),error:null}
    case 'get_my_customer_job_requests': return {data:readRequests(),error:null}
    case 'save_my_customer_job_note': {const meta=readJobMeta();meta[args._job_id]={...(meta[args._job_id]||{}),notes:args._notes||''};writeJobMeta(meta);return {data:true,error:null}}
    case 'set_my_customer_job_contact': {const meta=readJobMeta();meta[args._job_id]={...(meta[args._job_id]||{}),contact_id:args._contact_id||null};writeJobMeta(meta);return {data:true,error:null}}
    case 'create_my_customer_job_request': {const rows=readRequests();rows.unshift({request_id:uid(),title:args._title,requested_start:args._requested_start||null,site_name:args._site_name||null,site_address:args._site_address||null,onsite_contact_id:args._onsite_contact_id||null,onsite_contact_name:readTestClientContacts().find(c=>c.id===args._onsite_contact_id)?.name||null,client_notes:args._client_notes||null,status:'pending',linked_job_id:null,created_at:now()});writeRequests(rows);return {data:rows[0].request_id,error:null}}
    case 'get_my_assigned_job_contacts': {const customer=data.customers[0];return {data:data.jobs.map(j=>({job_id:j.id,customer_id:j.customer_id,customer_name:customer?.name||'Test Client',customer_phone:customer?.phone||null,contact_id:null,contact_name:null,contact_title:null,contact_phone:null,contact_email:null,contact_type:null,is_primary:false})),error:null}}
    case 'get_my_customer_invoices': return {data:JSON.parse(localStorage.getItem('northborn_test_invoices_v1')||'[]'),error:null}
    case 'get_my_customer_invoice_line_items': return {data:[],error:null}
    case 'revoke_organization_invite': {const rows=readGeneric('organization_invites').map(r=>r.id===args._invite_id?{...r,status:'revoked'}:r);writeGeneric('organization_invites',rows);return {data:true,error:null}}
    case 'find_similar_fleet_defect': {const rows=readGeneric('fleet_defects').filter(r=>r.vehicle_id===args._vehicle_id&&!['resolved','dismissed'].includes(r.status));const found=rows.find(r=>String(r.title).toLowerCase()===String(args._title).toLowerCase());return {data:found?[{defect_id:found.id,title:found.title,description:found.description||null,severity:found.severity||'medium',out_of_service:Boolean(found.out_of_service),report_count:found.report_count||1,similarity_score:1}]:[],error:null}}
    case 'report_fleet_defect': {const rows=readGeneric('fleet_defects'),existing=rows.find(r=>r.id===args._existing_defect_id);if(existing){existing.report_count=(existing.report_count||1)+1;existing.last_reported_at=now();writeGeneric('fleet_defects',rows);return {data:existing.id,error:null}}const row={id:uid(),organization_id:args._organization_id,vehicle_id:args._vehicle_id,title:args._title,description:args._description||null,severity:args._severity||'medium',status:'open',out_of_service:Boolean(args._out_of_service),reported_at:now(),last_reported_at:now(),report_count:1,odometer_km:args._odometer_km??null,engine_hours:args._engine_hours??null};rows.unshift(row);writeGeneric('fleet_defects',rows);return {data:row.id,error:null}}
    default:return {data:[],error:null}
  }
}

function install(persona:TestPersona){
  activePersona=persona
  if(installed)return
  installed=true
  client.auth.getSession=async()=>({data:{session:testSession()},error:null})
  client.auth.getUser=async()=>({data:{user:testUser()},error:null})
  client.auth.onAuthStateChange=(_cb:any)=>({data:{subscription:{unsubscribe(){}}}})
  client.auth.signOut=async()=>{clearTestLab();return{error:null}}
  client.from=(table:string)=>new TestQuery(table)
  client.rpc=(name:string,args?:any)=>fakeRpc(name,args)
  client.channel=()=>({on(){return this},subscribe(){return this},unsubscribe(){}})
  client.removeChannel=async()=>({status:'ok'})
  client.functions.invoke=async(name:string,options:any)=>{
    if(name==='send-client-invite'){
      const invites=readGeneric('customer_portal_invites'),code=Math.random().toString(36).slice(2,8).toUpperCase(),token=uid();const base=new URL(import.meta.env.BASE_URL,window.location.origin).toString();const row={invite_id:uid(),id:uid(),organization_id:TEST_ORG.id,customer_id:options?.body?.customerId||dataCustomerId(),email:options?.body?.email||'member@test.com',portal_role:options?.body?.portalRole||'viewer',invite_code:code,status:'pending',expires_at:new Date(Date.now()+7*86400000).toISOString(),delivery_status:'test'};invites.unshift(row);writeGeneric('customer_portal_invites',invites);return{data:{ok:true,emailSent:false,inviteCode:code,inviteLink:`${base}client-join?invite=${token}`,deliveryError:'Test mode does not send external email.'},error:null}
    }
    if(name==='send-team-invite'){
      const rows=readGeneric('organization_invites'),token=uid(),id=uid(),roleKey=options?.body?.roleKey||'operator',roleName=options?.body?.roleName||roleKey,base=new URL(import.meta.env.BASE_URL,window.location.origin).toString();rows.unshift({id,organization_id:TEST_ORG.id,email:options?.body?.email||'operator@test.com',status:'pending',expires_at:new Date(Date.now()+7*86400000).toISOString(),created_at:now(),invite_token:token,role:{key:roleKey,name:roleName}});writeGeneric('organization_invites',rows);return{data:{ok:true,emailSent:false,inviteLink:`${base}join?invite=${encodeURIComponent(token)}`,deliveryError:'Test mode does not send external email.'},error:null}
    }
    return original.functionsInvoke(name,options)
  }
}
function dataCustomerId(){return readTestLabData().customers[0]?.id||'test-customer'}

function restore(){if(!installed)return;installed=false;client.from=original.from;client.rpc=original.rpc;client.channel=original.channel;client.removeChannel=original.removeChannel;client.functions.invoke=original.functionsInvoke;client.auth.getSession=original.authGetSession;client.auth.getUser=original.authGetUser;client.auth.onAuthStateChange=original.authOnAuthStateChange;client.auth.signOut=original.authSignOut}

export default function TestSupabaseBridge({persona,children}:{persona:TestPersona;children:ReactNode}){activePersona=persona;install(persona);useEffect(()=>{activePersona=persona;return()=>{}},[persona]);useEffect(()=>()=>restore(),[]);return <>{children}</>}
export function currentTestPersona(){return getTestPersona()}
