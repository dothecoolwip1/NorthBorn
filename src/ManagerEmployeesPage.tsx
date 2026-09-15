import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, HardHat, Mail, Plus, RefreshCw, Send, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import RoleAwareApp from './RoleAwareApp'
import './manager-employees.css'

const db = supabase as any

const ACCESS_ROLES = [
  { key: 'operator', label: 'Operator' },
  { key: 'dispatcher', label: 'Dispatcher' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'mechanic', label: 'Mechanic' },
  { key: 'safety', label: 'Safety' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'admin', label: 'Administrator' },
]

type Organization = { id:string; name:string }
type Employee = { id:string; user_id:string|null; first_name:string; last_name:string; email:string|null; phone:string|null; position:string|null; status:string }

type Form = { first_name:string; last_name:string; email:string; phone:string; position:string; role_key:string }
const EMPTY_FORM:Form = { first_name:'', last_name:'', email:'', phone:'', position:'Operator', role_key:'operator' }

const readError = (error:unknown) => error instanceof Error ? error.message : String((error as {message?:string})?.message || error || 'Something went wrong.')

function currentBaseUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export default function ManagerEmployeesPage() {
  const [organization,setOrganization] = useState<Organization|null>(null)
  const [roleKey,setRoleKey] = useState('')
  const [employees,setEmployees] = useState<Employee[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [open,setOpen] = useState(false)
  const [form,setForm] = useState<Form>(EMPTY_FORM)

  const canManage = ['owner','admin'].includes(roleKey)

  const load = useCallback(async() => {
    setError('')
    const {data:sessionData} = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) { setLoading(false); return }
    const membership = await db.from('organization_members').select('id,organization_id,organization:organizations(id,name)').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle()
    if (membership.error || !membership.data?.id) { setLoading(false); return }
    const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id)
    const resolvedRole = roles.data?.[0]?.role?.key || ''
    setRoleKey(resolvedRole)
    if (resolvedRole === 'operator') { setLoading(false); return }
    const org = membership.data.organization as Organization
    setOrganization(org)
    const result = await db.from('employees').select('id,user_id,first_name,last_name,email,phone,position,status').eq('organization_id',org.id).order('last_name').order('first_name')
    if (result.error) setError(result.error.message)
    else setEmployees(result.data || [])
    setLoading(false)
  },[])

  useEffect(() => { void load() },[load])

  const pendingCount = useMemo(() => employees.filter(employee => !employee.user_id && employee.email).length,[employees])

  const sendAccessEmail = async(employee:Employee, role = 'operator') => {
    if (!organization || !employee.email) throw new Error('An email address is required before sending Northborn access.')
    const selectedRole = ACCESS_ROLES.find(item => item.key === role)
    const result = await supabase.functions.invoke('send-team-invite', {
      body: {
        organizationId: organization.id,
        organizationName: organization.name,
        email: employee.email.trim().toLowerCase(),
        roleKey: role,
        roleName: selectedRole?.label || role,
        appUrl: currentBaseUrl(),
      },
    })
    if (result.error) {
      let detail = result.error.message
      try {
        const response = (result.error as any).context as Response | undefined
        if (response) {
          const body = await response.clone().json()
          detail = body?.error || detail
        }
      } catch {}
      throw new Error(detail)
    }
    if (!result.data?.ok) throw new Error(result.data?.error || 'Unable to send the access email.')
    if (!result.data?.emailSent) throw new Error(result.data?.deliveryError || 'The invitation was created but the authentication email could not be sent.')
    return result.data
  }

  const addEmployee = async(event:React.FormEvent) => {
    event.preventDefault()
    if (!organization) return
    setBusy(true); setError(''); setNotice('')
    try {
      const {data:userData} = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required.')
      const email = form.email.trim().toLowerCase()
      if (!email) throw new Error('An email is required so Northborn can send account setup instructions.')
      const insert = await db.from('employees').insert({
        organization_id: organization.id,
        user_id: null,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email,
        phone: form.phone.trim() || null,
        position: form.position.trim() || ACCESS_ROLES.find(item=>item.key===form.role_key)?.label || 'Employee',
        status: 'active',
        created_by: userData.user.id,
      }).select('id,user_id,first_name,last_name,email,phone,position,status').single()
      if (insert.error) throw insert.error
      try {
        await sendAccessEmail(insert.data as Employee, form.role_key)
      } catch (inviteError) {
        await load()
        throw new Error(`Employee saved, but the account email was not sent: ${readError(inviteError)}`)
      }
      setNotice(`Employee added and authentication email sent to ${email}.`)
      setForm(EMPTY_FORM)
      setOpen(false)
      await load()
    } catch (caught) {
      setError(readError(caught))
    } finally { setBusy(false) }
  }

  const resend = async(employee:Employee) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const guessed = ACCESS_ROLES.find(item => item.label.toLowerCase() === String(employee.position || '').toLowerCase())?.key || 'operator'
      await sendAccessEmail(employee, guessed)
      setNotice(`Authentication email sent to ${employee.email}.`)
    } catch (caught) { setError(readError(caught)) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="manager-employees-loading">Loading employees…</div>
  if (!organization || roleKey === 'operator') return <RoleAwareApp />

  return <main className="manager-employees-page">
    <section className="manager-employees-hero">
      <div><span>WORKFORCE</span><h1>Employees</h1><p>Add employees and send the real Northborn authentication email they use to activate their account and finish their profile.</p></div>
      {canManage && <button type="button" onClick={()=>setOpen(true)}><Plus size={18}/>Add employee</button>}
    </section>

    {error && <div className="manager-employees-error">{error}</div>}
    {notice && <div className="manager-employees-notice"><CheckCircle2 size={17}/>{notice}</div>}

    <div className="manager-employees-summary"><HardHat size={20}/><strong>{employees.length}</strong><span>employees</span><Mail size={20}/><strong>{pendingCount}</strong><span>waiting for account setup</span></div>

    <section className="manager-employees-list">
      {employees.map(employee => <article key={employee.id} className="manager-employee-card">
        <div className="manager-employee-avatar"><UserRound size={20}/></div>
        <div className="manager-employee-copy"><strong>{employee.first_name} {employee.last_name}</strong><span>{employee.position || 'Employee'}</span><small>{employee.email || 'No email'}{employee.phone ? ` · ${employee.phone}` : ''}</small></div>
        <div className="manager-employee-state">{employee.user_id ? <span className="active">Account active</span> : <span>Setup pending</span>}</div>
        {canManage && !employee.user_id && employee.email && <button className="manager-employee-resend" type="button" disabled={busy} onClick={()=>void resend(employee)}><RefreshCw size={15}/>Send access email</button>}
      </article>)}
      {!employees.length && <div className="manager-employees-empty">No employees have been added yet.</div>}
    </section>

    {open && <div className="manager-employee-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false)}}><form className="manager-employee-modal" onSubmit={addEmployee}>
      <header><div><span>NEW EMPLOYEE</span><h2>Add employee</h2></div><button type="button" onClick={()=>setOpen(false)} disabled={busy}><X size={20}/></button></header>
      <div className="manager-employee-form">
        <label>First name<input value={form.first_name} onChange={event=>setForm({...form,first_name:event.target.value})} required/></label>
        <label>Last name<input value={form.last_name} onChange={event=>setForm({...form,last_name:event.target.value})} required/></label>
        <label className="wide">Email<input type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} required/><small>Northborn sends the account activation email here.</small></label>
        <label>Phone<input type="tel" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/></label>
        <label>Position<input value={form.position} onChange={event=>setForm({...form,position:event.target.value})}/></label>
        <label className="wide">Northborn access<select value={form.role_key} onChange={event=>setForm({...form,role_key:event.target.value})}>{ACCESS_ROLES.map(role=><option value={role.key} key={role.key}>{role.label}</option>)}</select></label>
      </div>
      <footer><button type="button" onClick={()=>setOpen(false)} disabled={busy}>Cancel</button><button className="primary" disabled={busy}><Send size={17}/>{busy?'Adding and sending…':'Add employee & send email'}</button></footer>
    </form></div>}
  </main>
}
