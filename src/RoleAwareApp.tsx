import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink } from 'react-router-dom'
import { Building2, KeyRound, LogOut, Truck } from 'lucide-react'
import App from './App'
import OperatorAppV2 from './OperatorAppV2'
import EmployeeProfileSetup from './EmployeeProfileSetup'
import ClientPortalApp from './ClientPortalApp'
import ManagerCompletionNotifications from './ManagerCompletionNotifications'
import { supabase } from './lib/supabase'
import './operator-app-v2.css'
import './operator-fleet.css'

const db = supabase as any

type OperatorContext = { organizationId:string; organizationName:string; hasEmployeeProfile:boolean }
type InternalContext = { organizationId:string; organizationName:string; roleKey:string }
type ClientContext = { portal_user_id:string; organization_id:string; organization_name:string; customer_id:string; customer_name:string; customer_phone:string|null; customer_address:string|null; billing_email:string|null; portal_role:string }

export default function RoleAwareApp() {
  const [session,setSession]=useState<Session|null>(null)
  const [operatorContext,setOperatorContext]=useState<OperatorContext|null>(null)
  const [internalContext,setInternalContext]=useState<InternalContext|null>(null)
  const [clientContext,setClientContext]=useState<ClientContext|null>(null)
  const [checkingRole,setCheckingRole]=useState(true)
  const [showCompanySetup,setShowCompanySetup]=useState(false)

  useEffect(()=>{
    let active=true
    const resolve=async(nextSession:Session|null)=>{
      if(!active)return
      setSession(nextSession);setCheckingRole(true);setOperatorContext(null);setInternalContext(null);setClientContext(null);setShowCompanySetup(false)
      if(!nextSession){setCheckingRole(false);return}

      const {data:membership,error:membershipError}=await supabase.from('organization_members').select('id,organization_id,organization:organizations(name)').eq('user_id',nextSession.user.id).eq('status','active').limit(1).maybeSingle()
      if(!active)return

      if(!membershipError&&membership?.id){
        const {data:roleRows}=await supabase.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.id)
        if(!active)return
        const roleKey=((roleRows?.[0]?.role as unknown as {key?:string}|null)?.key)||''
        const organization=membership.organization as unknown as {name?:string}|null
        const organizationName=organization?.name||'Northborn company'
        if(roleKey==='operator'){
          const {data:employee}=await supabase.from('employees').select('id').eq('organization_id',membership.organization_id).eq('user_id',nextSession.user.id).limit(1).maybeSingle()
          if(!active)return
          setOperatorContext({organizationId:membership.organization_id,organizationName,hasEmployeeProfile:Boolean(employee?.id)})
        } else {
          setInternalContext({organizationId:membership.organization_id,organizationName,roleKey})
        }
        setCheckingRole(false)
        return
      }

      const portal=await db.rpc('get_my_customer_portal_context')
      if(!active)return
      if(!portal.error&&portal.data?.length)setClientContext(portal.data[0] as ClientContext)
      setCheckingRole(false)
    }

    void supabase.auth.getSession().then(({data})=>resolve(data.session))
    const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{void resolve(next)})
    return()=>{active=false;listener.subscription.unsubscribe()}
  },[])

  if(checkingRole)return <div className="center-screen">Loading your Northborn workspace…</div>
  if(session&&clientContext)return <ClientPortalApp initialContext={clientContext}/>
  if(session&&operatorContext){
    if(!operatorContext.hasEmployeeProfile)return <EmployeeProfileSetup session={session} organizationId={operatorContext.organizationId} organizationName={operatorContext.organizationName}/>
    return <><OperatorAppV2 userId={session.user.id} organizationId={operatorContext.organizationId} organizationName={operatorContext.organizationName}/><NavLink className="operator-fleet-shortcut" to="/fleet"><Truck size={16}/>My unit</NavLink></>
  }
  if(session&&internalContext)return <><App resolvedSession={session} authResolved/>{['owner','admin'].includes(internalContext.roleKey)&&<ManagerCompletionNotifications userId={session.user.id} organizationId={internalContext.organizationId}/>}</>
  if(session&&!showCompanySetup)return <UnconnectedAccount session={session} onCreateCompany={()=>setShowCompanySetup(true)}/>
  return <App resolvedSession={session} authResolved/>
}

function UnconnectedAccount({session,onCreateCompany}:{session:Session;onCreateCompany:()=>void}){
  const [signingOut,setSigningOut]=useState(false)
  const signOut=async()=>{
    setSigningOut(true)
    await supabase.auth.signOut()
    window.location.href='/'
  }

  return <div className="auth-page"><div className="auth-card account-choice-card">
    <div className="auth-logo">N</div>
    <h1>Choose how to continue</h1>
    <p>Signed in as <strong>{session.user.email}</strong>, but this account is not connected to a Northborn workspace yet.</p>
    <div className="account-choice-actions">
      <a className="primary account-choice-link" href="/client-join"><KeyRound size={18}/>Use a client access code</a>
      <button className="secondary" type="button" onClick={onCreateCompany}><Building2 size={18}/>Create a new company</button>
      <button className="link-button account-signout" type="button" disabled={signingOut} onClick={()=>void signOut()}><LogOut size={17}/>{signingOut?'Signing out…':'Sign out and use another account'}</button>
    </div>
  </div></div>
}
