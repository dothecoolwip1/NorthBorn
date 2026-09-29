import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './super-admin.css'

type Tab = 'dashboard' | 'organizations' | 'users' | 'plans' | 'settings' | 'audit'
type Dashboard = {
  organizations:number
  activeOrganizations:number
  authUsers:number
  activeMembers:number
  customers:number
  jobs:number
  vehicles:number
  employees:number
  recentAudit:AuditRow[]
}
type Plan = {
  id:string
  code:string
  name:string
  description:string|null
  monthly_price_cents:number
  annual_price_cents:number
  currency:string
  active:boolean
  sort_order:number
  features:unknown[]
  limits:Record<string,unknown>
}
type Organization = {
  id:string
  name:string
  legal_name:string|null
  slug:string|null
  status:string
  timezone:string
  country_code:string
  settings:Record<string,unknown>
  created_at:string
  updated_at:string
  member_count:number
  job_count:number
  subscription:any
}
type UserRow = {
  id:string
  email:string
  phone:string|null
  created_at:string
  last_sign_in_at:string|null
  email_confirmed_at:string|null
  banned_until:string|null
  profile:any
  memberships:any[]
  is_platform_admin:boolean
}
type SettingRow = {
  key:string
  label:string
  description:string|null
  category:string
  value:unknown
}
type AuditRow = {
  id:string
  organization_id:string|null
  organization_name?:string|null
  actor_user_id:string|null
  entity_type:string
  entity_id:string|null
  action:string
  metadata:Record<string,unknown>
  occurred_at:string
}

const MODULES = ['dispatch','jobs','customers','employees','fleet','maintenance','safety','tickets','timesheets','invoices','reports']
const ROLES = ['owner','admin','supervisor','dispatcher','safety','mechanic','accounting','operator']

async function adminInvoke<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const result = await supabase.functions.invoke('super-admin',{body:{action,payload}})
  if(result.error) throw result.error
  if(result.data?.error) throw new Error(result.data.error)
  return result.data?.data as T
}

function money(cents:number,currency='CAD'){
  return new Intl.NumberFormat('en-CA',{style:'currency',currency,maximumFractionDigits:2}).format((Number(cents)||0)/100)
}
function when(value?:string|null){
  if(!value)return 'Never'
  const date=new Date(value)
  return Number.isNaN(date.getTime())?'Unknown':date.toLocaleString()
}
function parseJson(text:string,fallback:unknown){
  if(!text.trim())return fallback
  return JSON.parse(text)
}
function readError(error:unknown){
  return error instanceof Error?error.message:String((error as any)?.message||error||'Something went wrong')
}

export default function SuperAdminPage(){
  const [tab,setTab]=useState<Tab>('dashboard')
  const [dashboard,setDashboard]=useState<Dashboard|null>(null)
  const [organizations,setOrganizations]=useState<Organization[]>([])
  const [users,setUsers]=useState<UserRow[]>([])
  const [plans,setPlans]=useState<Plan[]>([])
  const [settings,setSettings]=useState<SettingRow[]>([])
  const [audit,setAudit]=useState<AuditRow[]>([])
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [orgEditor,setOrgEditor]=useState<Organization|null|'new'>(null)
  const [userEditor,setUserEditor]=useState<UserRow|null|'new'>(null)
  const [planEditor,setPlanEditor]=useState<Plan|null|'new'>(null)

  const load=async(silent=false)=>{
    if(!silent)setLoading(true)
    else setRefreshing(true)
    setError('')
    try{
      const [d,o,u,p,s,a]=await Promise.all([
        adminInvoke<Dashboard>('dashboard'),
        adminInvoke<Organization[]>('list_organizations'),
        adminInvoke<UserRow[]>('list_users'),
        adminInvoke<Plan[]>('list_plans'),
        adminInvoke<SettingRow[]>('list_settings'),
        adminInvoke<AuditRow[]>('list_audit',{limit:250}),
      ])
      setDashboard(d);setOrganizations(o);setUsers(u);setPlans(p);setSettings(s);setAudit(a)
    }catch(e){setError(readError(e))}
    finally{setLoading(false);setRefreshing(false)}
  }

  useEffect(()=>{void load()},[])

  const signOut=async()=>{await supabase.auth.signOut();window.location.assign('/')}

  const filteredOrganizations=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    if(!needle)return organizations
    return organizations.filter(row=>`${row.name} ${row.legal_name||''} ${row.slug||''} ${row.status}`.toLowerCase().includes(needle))
  },[organizations,query])

  const filteredUsers=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    if(!needle)return users
    return users.filter(row=>`${row.email} ${row.profile?.display_name||''} ${row.memberships?.map(m=>m.organization?.name).join(' ')||''}`.toLowerCase().includes(needle))
  },[users,query])

  const disableUser=async(user:UserRow)=>{
    const enabled=Boolean(user.banned_until&&new Date(user.banned_until).getTime()>Date.now())
    if(!confirm(`${enabled?'Enable':'Disable'} ${user.email}?`))return
    try{await adminInvoke('set_user_enabled',{userId:user.id,enabled});await load(true)}catch(e){setError(readError(e))}
  }

  const deleteUser=async(user:UserRow)=>{
    if(!confirm(`Permanently delete ${user.email}? This can fail if operational records still reference the account.`))return
    try{await adminInvoke('delete_user',{userId:user.id});await load(true)}catch(e){setError(readError(e))}
  }

  const nav:Array<[Tab,string,typeof Gauge]>=[
    ['dashboard','Overview',Gauge],
    ['organizations','Organizations',Building2],
    ['users','Users',Users],
    ['plans','Plans',CreditCard],
    ['settings','Platform settings',Settings],
    ['audit','Audit log',Activity],
  ]

  if(loading)return <div className="sa-loading"><div className="sa-mark">N</div><strong>Opening Northborn Super Admin</strong><span>Verifying platform access and loading the system.</span></div>

  return <div className="sa-shell">
    <aside className="sa-sidebar">
      <div className="sa-brand"><div className="sa-mark">N</div><div><strong>NORTHBORN</strong><span>SUPER ADMIN</span></div></div>
      <div className="sa-security"><ShieldCheck size={17}/><span>Platform access</span></div>
      <nav>{nav.map(([key,label,Icon])=><button key={key} type="button" className={tab===key?'active':''} onClick={()=>{setTab(key);setQuery('')}}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <button className="sa-signout" type="button" onClick={()=>void signOut()}><LogOut size={18}/>Sign out</button>
    </aside>

    <main className="sa-main">
      <header className="sa-topbar">
        <div><span className="sa-kicker">Northborn control center</span><h1>{nav.find(item=>item[0]===tab)?.[1]}</h1></div>
        <div className="sa-top-actions"><button className="sa-button secondary" type="button" disabled={refreshing} onClick={()=>void load(true)}><RefreshCw size={17} className={refreshing?'spin':''}/>{refreshing?'Refreshing':'Refresh'}</button></div>
      </header>

      {error&&<div className="sa-error"><strong>Super admin action failed</strong><span>{error}</span><button type="button" onClick={()=>setError('')} aria-label="Dismiss error"><X size={17}/></button></div>}

      {tab==='dashboard'&&dashboard&&<DashboardPanel dashboard={dashboard} organizations={organizations}/>}
      {tab==='organizations'&&<section className="sa-section">
        <div className="sa-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search organizations"/><button className="sa-button primary" type="button" onClick={()=>setOrgEditor('new')}><Building2 size={17}/>New organization</button></div>
        <div className="sa-table-card"><table><thead><tr><th>Organization</th><th>Status</th><th>Plan</th><th>Members</th><th>Jobs</th><th>Updated</th><th></th></tr></thead><tbody>
          {filteredOrganizations.map(org=><tr key={org.id}><td><strong>{org.name}</strong><small>{org.legal_name||org.slug||org.id}</small></td><td><Status value={org.status}/></td><td>{org.subscription?.plan?.name||'Unassigned'}<small>{org.subscription?.status||''}</small></td><td>{org.member_count}</td><td>{org.job_count}</td><td>{when(org.updated_at)}</td><td className="sa-actions"><button type="button" onClick={()=>setOrgEditor(org)}>Manage</button></td></tr>)}
          {!filteredOrganizations.length&&<tr><td colSpan={7} className="sa-empty">No organizations match your search.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab==='users'&&<section className="sa-section">
        <div className="sa-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search users, names or companies"/><button className="sa-button primary" type="button" onClick={()=>setUserEditor('new')}><UserPlus size={17}/>Add user</button></div>
        <div className="sa-table-card"><table><thead><tr><th>User</th><th>Access</th><th>Companies</th><th>Last sign in</th><th>State</th><th></th></tr></thead><tbody>
          {filteredUsers.map(user=>{const disabled=Boolean(user.banned_until&&new Date(user.banned_until).getTime()>Date.now());return <tr key={user.id}><td><strong>{user.profile?.display_name||user.email}</strong><small>{user.email}</small></td><td>{user.is_platform_admin?<span className="sa-admin-pill"><ShieldCheck size={14}/>Super admin</span>:'Standard user'}</td><td>{user.memberships?.length||0}<small>{user.memberships?.map(m=>m.organization?.name).filter(Boolean).join(', ')||'No company'}</small></td><td>{when(user.last_sign_in_at)}</td><td><Status value={disabled?'disabled':'active'}/></td><td className="sa-actions"><button type="button" onClick={()=>setUserEditor(user)}>Edit</button><button type="button" onClick={()=>void disableUser(user)}>{disabled?'Enable':'Disable'}</button><button className="danger" type="button" onClick={()=>void deleteUser(user)}>Delete</button></td></tr>})}
          {!filteredUsers.length&&<tr><td colSpan={6} className="sa-empty">No users match your search.</td></tr>}
        </tbody></table></div>
      </section>}

      {tab==='plans'&&<section className="sa-section">
        <div className="sa-toolbar"><div><h2>Subscription plans</h2><p>Pricing here controls Northborn plan assignments. Payment processing can be connected separately.</p></div><button className="sa-button primary" type="button" onClick={()=>setPlanEditor('new')}><CreditCard size={17}/>New plan</button></div>
        <div className="sa-plan-grid">{plans.map(plan=><article key={plan.id} className="sa-plan-card"><div className="sa-plan-head"><div><span>{plan.code}</span><h3>{plan.name}</h3></div><Status value={plan.active?'active':'disabled'}/></div><p>{plan.description||'No description.'}</p><div className="sa-price"><strong>{money(plan.monthly_price_cents,plan.currency)}</strong><span>/ month</span></div><small>{money(plan.annual_price_cents,plan.currency)} / year</small><div className="sa-feature-list">{Array.isArray(plan.features)&&plan.features.map((item,index)=><span key={index}>{String(item)}</span>)}</div><button className="sa-button secondary" type="button" onClick={()=>setPlanEditor(plan)}>Edit plan</button></article>)}</div>
      </section>}

      {tab==='settings'&&<SettingsPanel settings={settings} onReload={()=>load(true)} onError={setError}/>}
      {tab==='audit'&&<AuditPanel rows={audit}/>}
    </main>

    {orgEditor&&<OrganizationEditor organization={orgEditor==='new'?null:orgEditor} plans={plans} onClose={()=>setOrgEditor(null)} onSaved={async()=>{setOrgEditor(null);await load(true)}} onError={setError}/>}
    {userEditor&&<UserEditor user={userEditor==='new'?null:userEditor} organizations={organizations} onClose={()=>setUserEditor(null)} onSaved={async()=>{setUserEditor(null);await load(true)}} onError={setError}/>}
    {planEditor&&<PlanEditor plan={planEditor==='new'?null:planEditor} onClose={()=>setPlanEditor(null)} onSaved={async()=>{setPlanEditor(null);await load(true)}} onError={setError}/>}
  </div>
}

function DashboardPanel({dashboard,organizations}:{dashboard:Dashboard;organizations:Organization[]}){
  const cards=[
    ['Organizations',dashboard.organizations,`${dashboard.activeOrganizations} active`,Building2],
    ['Auth users',dashboard.authUsers,`${dashboard.activeMembers} active memberships`,Users],
    ['Customers',dashboard.customers,'Across every company',Users],
    ['Jobs',dashboard.jobs,'All recorded jobs',Activity],
    ['Fleet units',dashboard.vehicles,'All organizations',Building2],
    ['Employees',dashboard.employees,'Active employee records',Users],
  ] as const
  return <section className="sa-section"><div className="sa-stats">{cards.map(([label,value,detail,Icon])=><article key={label}><div className="sa-stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{detail}</small></article>)}</div><div className="sa-dashboard-grid"><article className="sa-panel"><div className="sa-panel-title"><div><span>Organizations</span><h2>Recent company activity</h2></div></div><div className="sa-mini-list">{organizations.slice(0,8).map(org=><div key={org.id}><div><strong>{org.name}</strong><span>{org.subscription?.plan?.name||'No plan'} · {org.member_count} members</span></div><Status value={org.status}/></div>)}</div></article><article className="sa-panel"><div className="sa-panel-title"><div><span>Audit</span><h2>Latest platform activity</h2></div></div><div className="sa-mini-list">{dashboard.recentAudit.slice(0,8).map(row=><div key={row.id}><div><strong>{row.action.replaceAll('_',' ')}</strong><span>{row.entity_type} · {when(row.occurred_at)}</span></div></div>)}</div></article></div></section>
}

function SearchBox({value,onChange,placeholder}:{value:string;onChange:(value:string)=>void;placeholder:string}){
  return <label className="sa-search"><Search size={18}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>
}

function Status({value}:{value:string}){
  const normalized=(value||'unknown').toLowerCase()
  return <span className={`sa-status ${normalized}`}>{normalized.replaceAll('_',' ')}</span>
}

function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}){
  return <div className="sa-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sa-modal"><header><div><span className="sa-kicker">{subtitle}</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20}/></button></header>{children}</section></div>
}

function OrganizationEditor({organization,plans,onClose,onSaved,onError}:{organization:Organization|null;plans:Plan[];onClose:()=>void;onSaved:()=>Promise<void>;onError:(message:string)=>void}){
  const [name,setName]=useState(organization?.name||'')
  const [legalName,setLegalName]=useState(organization?.legal_name||'')
  const [slug,setSlug]=useState(organization?.slug||'')
  const [status,setStatus]=useState(organization?.status||'active')
  const [timezone,setTimezone]=useState(organization?.timezone||'America/Edmonton')
  const [countryCode,setCountryCode]=useState(organization?.country_code||'CA')
  const [settingsText,setSettingsText]=useState(JSON.stringify(organization?.settings||{},null,2))
  const [planCode,setPlanCode]=useState(organization?.subscription?.plan?.code||'free')
  const [billingStatus,setBillingStatus]=useState(organization?.subscription?.status||'active')
  const [billingInterval,setBillingInterval]=useState(organization?.subscription?.billing_interval||'monthly')
  const [seats,setSeats]=useState(String(organization?.subscription?.seats||1))
  const [modules,setModules]=useState<Record<string,boolean>>(Object.fromEntries(MODULES.map(key=>[key,true])))
  const [busy,setBusy]=useState(false)

  useEffect(()=>{
    if(!organization)return
    void adminInvoke<any>('get_organization',{organizationId:organization.id}).then(details=>{
      setPlanCode(details.subscription?.plan?.code||planCode)
      setBillingStatus(details.subscription?.status||billingStatus)
      setBillingInterval(details.subscription?.billing_interval||billingInterval)
      setSeats(String(details.subscription?.seats||seats))
      const moduleMap={...modules}
      for(const row of details.modules||[])moduleMap[row.module_key]=row.enabled!==false
      setModules(moduleMap)
    }).catch(e=>onError(readError(e)))
  },[])

  const save=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true)
    try{
      const settings=parseJson(settingsText,{})
      const result=organization
        ? await adminInvoke<any>('update_organization',{organizationId:organization.id,name,legalName,slug,status,timezone,countryCode,settings})
        : await adminInvoke<any>('create_organization',{name,legalName,slug,status,timezone,countryCode,settings})
      const organizationId=organization?.id||result.id
      await adminInvoke('assign_plan',{organizationId,planCode,status:billingStatus,billingInterval,seats:Number(seats)||1})
      await Promise.all(MODULES.map(moduleKey=>adminInvoke('set_module',{organizationId,moduleKey,enabled:modules[moduleKey]!==false})))
      await onSaved()
    }catch(e){onError(readError(e))}finally{setBusy(false)}
  }

  return <Modal title={organization?'Manage organization':'Create organization'} subtitle="Company control" onClose={onClose}><form onSubmit={save} className="sa-form"><div className="sa-form-grid"><label><span>Company name</span><input required value={name} onChange={e=>setName(e.target.value)}/></label><label><span>Legal name</span><input value={legalName} onChange={e=>setLegalName(e.target.value)}/></label><label><span>Slug</span><input value={slug} onChange={e=>setSlug(e.target.value)}/></label><label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label><label><span>Timezone</span><input value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><label><span>Country</span><input maxLength={2} value={countryCode} onChange={e=>setCountryCode(e.target.value.toUpperCase())}/></label></div><label><span>Organization settings JSON</span><textarea rows={5} value={settingsText} onChange={e=>setSettingsText(e.target.value)}/></label><div className="sa-subsection"><h3>Subscription</h3><div className="sa-form-grid"><label><span>Plan</span><select value={planCode} onChange={e=>setPlanCode(e.target.value)}>{plans.map(plan=><option key={plan.id} value={plan.code}>{plan.name}{plan.active?'':' (inactive)'}</option>)}</select></label><label><span>Billing state</span><select value={billingStatus} onChange={e=>setBillingStatus(e.target.value)}><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label><label><span>Interval</span><select value={billingInterval} onChange={e=>setBillingInterval(e.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="custom">Custom</option></select></label><label><span>Seats</span><input min={1} type="number" value={seats} onChange={e=>setSeats(e.target.value)}/></label></div></div><div className="sa-subsection"><h3>Modules</h3><div className="sa-module-grid">{MODULES.map(module=><label key={module} className="sa-check"><input type="checkbox" checked={modules[module]!==false} onChange={e=>setModules(current=>({...current,[module]:e.target.checked}))}/><span>{module.replaceAll('_',' ')}</span></label>)}</div></div><div className="sa-modal-actions"><button className="sa-button secondary" type="button" onClick={onClose}>Cancel</button><button className="sa-button primary" disabled={busy}>{busy?'Saving':'Save organization'}</button></div></form></Modal>
}

function UserEditor({user,organizations,onClose,onSaved,onError}:{user:UserRow|null;organizations:Organization[];onClose:()=>void;onSaved:()=>Promise<void>;onError:(message:string)=>void}){
  const [email,setEmail]=useState(user?.email||'')
  const [displayName,setDisplayName]=useState(user?.profile?.display_name||'')
  const [password,setPassword]=useState('')
  const [organizationId,setOrganizationId]=useState(user?.memberships?.[0]?.organization_id||'')
  const [roleKey,setRoleKey]=useState(user?.memberships?.[0]?.roles?.[0]?.key||'operator')
  const [platformAdmin,setPlatformAdmin]=useState(Boolean(user?.is_platform_admin))
  const [busy,setBusy]=useState(false)

  const save=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true)
    try{
      let userId=user?.id
      if(userId)await adminInvoke('update_user',{userId,email,displayName,password:password||undefined,organizationId:organizationId||undefined,roleKeys:organizationId?[roleKey]:undefined})
      else{
        const result=await adminInvoke<{id:string}>('create_user',{email,displayName,password:password||undefined,organizationId:organizationId||undefined,roleKeys:organizationId?[roleKey]:undefined})
        userId=result.id
      }
      await adminInvoke('set_platform_admin',{userId,email,displayName,enabled:platformAdmin})
      await onSaved()
    }catch(e){onError(readError(e))}finally{setBusy(false)}
  }

  return <Modal title={user?'Edit user':'Add user'} subtitle="Account administration" onClose={onClose}><form onSubmit={save} className="sa-form"><div className="sa-form-grid"><label><span>Email</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label><span>Display name</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label><span>{user?'New password':'Temporary password'}</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={user?'Leave blank to keep current password':'Leave blank to email an invite'}/></label><label><span>Company</span><select value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">No company membership</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label><span>Primary role</span><select value={roleKey} disabled={!organizationId} onChange={e=>setRoleKey(e.target.value)}>{ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select></label><label className="sa-check sa-check-wide"><input type="checkbox" checked={platformAdmin} onChange={e=>setPlatformAdmin(e.target.checked)}/><span>Platform super admin</span></label></div><p className="sa-help">Passwords are sent only to Supabase Auth from the server function and are never written to the repository or audit log.</p><div className="sa-modal-actions"><button className="sa-button secondary" type="button" onClick={onClose}>Cancel</button><button className="sa-button primary" disabled={busy}>{busy?'Saving':'Save user'}</button></div></form></Modal>
}

function PlanEditor({plan,onClose,onSaved,onError}:{plan:Plan|null;onClose:()=>void;onSaved:()=>Promise<void>;onError:(message:string)=>void}){
  const [code,setCode]=useState(plan?.code||'')
  const [name,setName]=useState(plan?.name||'')
  const [description,setDescription]=useState(plan?.description||'')
  const [monthly,setMonthly]=useState(String((plan?.monthly_price_cents||0)/100))
  const [annual,setAnnual]=useState(String((plan?.annual_price_cents||0)/100))
  const [currency,setCurrency]=useState(plan?.currency||'CAD')
  const [active,setActive]=useState(plan?.active??true)
  const [features,setFeatures]=useState(Array.isArray(plan?.features)?plan!.features.map(String).join('\n'):'')
  const [limits,setLimits]=useState(JSON.stringify(plan?.limits||{},null,2))
  const [busy,setBusy]=useState(false)
  const save=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);try{await adminInvoke('upsert_plan',{id:plan?.id,code,name,description,monthlyPriceCents:Math.round((Number(monthly)||0)*100),annualPriceCents:Math.round((Number(annual)||0)*100),currency,active,features:features.split('\n').map(v=>v.trim()).filter(Boolean),limits:parseJson(limits,{})});await onSaved()}catch(e){onError(readError(e))}finally{setBusy(false)}}
  return <Modal title={plan?'Edit plan':'Create plan'} subtitle="Subscription catalog" onClose={onClose}><form onSubmit={save} className="sa-form"><div className="sa-form-grid"><label><span>Plan code</span><input required value={code} onChange={e=>setCode(e.target.value)} /></label><label><span>Name</span><input required value={name} onChange={e=>setName(e.target.value)}/></label><label><span>Monthly price</span><input type="number" min="0" step="0.01" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label><label><span>Annual price</span><input type="number" min="0" step="0.01" value={annual} onChange={e=>setAnnual(e.target.value)}/></label><label><span>Currency</span><input maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label><label className="sa-check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/><span>Plan active</span></label></div><label><span>Description</span><textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label><label><span>Features, one per line</span><textarea rows={5} value={features} onChange={e=>setFeatures(e.target.value)}/></label><label><span>Limits JSON</span><textarea rows={5} value={limits} onChange={e=>setLimits(e.target.value)}/></label><div className="sa-modal-actions"><button className="sa-button secondary" type="button" onClick={onClose}>Cancel</button><button className="sa-button primary" disabled={busy}>{busy?'Saving':'Save plan'}</button></div></form></Modal>
}

function SettingsPanel({settings,onReload,onError}:{settings:SettingRow[];onReload:()=>Promise<void>;onError:(message:string)=>void}){
  const [drafts,setDrafts]=useState<Record<string,string>>(()=>Object.fromEntries(settings.map(row=>[row.key,JSON.stringify(row.value,null,2)])))
  useEffect(()=>setDrafts(Object.fromEntries(settings.map(row=>[row.key,JSON.stringify(row.value,null,2)]))),[settings])
  const save=async(row:SettingRow)=>{try{await adminInvoke('set_setting',{key:row.key,label:row.label,description:row.description,category:row.category,value:parseJson(drafts[row.key],row.value)});await onReload()}catch(e){onError(readError(e))}}
  return <section className="sa-section"><div className="sa-settings-grid">{settings.map(row=><article key={row.key} className="sa-setting-card"><div><span>{row.category}</span><h3>{row.label}</h3><p>{row.description||row.key}</p></div><textarea rows={4} value={drafts[row.key]??''} onChange={e=>setDrafts(current=>({...current,[row.key]:e.target.value}))}/><button className="sa-button secondary" type="button" onClick={()=>void save(row)}>Save setting</button></article>)}</div></section>
}

function AuditPanel({rows}:{rows:AuditRow[]}){
  const [query,setQuery]=useState('')
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();if(!needle)return rows;return rows.filter(row=>`${row.action} ${row.entity_type} ${row.organization_name||''} ${row.actor_user_id||''}`.toLowerCase().includes(needle))},[rows,query])
  return <section className="sa-section"><div className="sa-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search audit activity"/></div><div className="sa-table-card"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Organization</th><th>Actor</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td>{when(row.occurred_at)}</td><td><strong>{row.action.replaceAll('_',' ')}</strong></td><td>{row.entity_type}<small>{row.entity_id||''}</small></td><td>{row.organization_name||'Platform'}</td><td><small>{row.actor_user_id||'System'}</small></td></tr>)}</tbody></table></div></section>
}
