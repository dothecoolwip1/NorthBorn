import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { NavLink } from 'react-router-dom'
import { Building2, KeyRound, LogOut } from 'lucide-react'
import App from './App'
import OperatorAppV2 from './OperatorAppV2'
import EmployeeProfileSetup from './EmployeeProfileSetup'
import ClientPortalApp from './ClientPortalApp'
import ManagerCompletionNotifications from './ManagerCompletionNotifications'
import OperatorFleetRepairNotifications from './OperatorFleetRepairNotifications'
import { supabase } from './lib/supabase'
import { resolveWorkspaceAccess, type ClientPortalContext } from './workspace-access'
import './operator-app-v2.css'
import './operator-fleet.css'

type OperatorContext = { organizationId:string; organizationName:string; hasEmployeeProfile:boolean }
type InternalContext = { organizationId:string; organizationName:string; roleKey:string }

export default function RoleAwareApp() {
  const [session,setSession]=useState<Session|null>(null)
  const [operatorContext,setOperatorContext]=useState<OperatorContext|null>(null)
  const [internalContext,setInternalContext]=useState<InternalContext|null>(null)
  const [clientContext,setClientContext]=useState<ClientPortalContext|null>(null)
  const [checkingRole,setCheckingRole]=useState(true)
  const [showCompanySetup,setShowCompanySetup]=useState(false)
  const [workspaceError,setWorkspaceError]=useState('')

  useEffect(()=>{
    let active=true
    let sessionLoadFailed=false
    const resolve=async(nextSession:Session|null)=>{
      if(!active)return
      setSession(nextSession);setCheckingRole(true);setWorkspaceError('');setOperatorContext(null);setInternalContext(null);setClientContext(null);setShowCompanySetup(false)
      if(!nextSession){setCheckingRole(false);return}
      try{
        const access=await resolveWorkspaceAccess(nextSession.user.id)
        if(!active)return
        if(access.kind==='client'){
          setClientContext(access.context)
          setCheckingRole(false)
          return
        }
        if(access.kind==='internal'){
          if(access.roleKey==='operator'){
            const {data:employee,error:employeeError}=await supabase.from('employees').select('id').eq('organization_id',access.organizationId).eq('user_id',nextSession.user.id).limit(1).maybeSingle()
            if(!active)return
            if(employeeError)throw employeeError
            setOperatorContext({organizationId:access.organizationId,organizationName:access.organizationName,hasEmployeeProfile:Boolean(employee?.id)})
          }else{
            setInternalContext({organizationId:access.organizationId,organizationName:access.organizationName,roleKey:access.roleKey})
          }
        }
      }catch(caught){
        if(active)setWorkspaceError(caught instanceof Error?caught.message:String(caught))
      }finally{
        if(active)setCheckingRole(false)
      }
    }

    void supabase.auth.getSession()
      .then(({data,error})=>{
        if(!active)return
        if(error){sessionLoadFailed=true;setSession(null);setWorkspaceError(error.message);setCheckingRole(false);return}
        sessionLoadFailed=false;void resolve(data.session)
      })
      .catch(caught=>{
        if(!active)return
        sessionLoadFailed=true;setSession(null);setWorkspaceError(caught instanceof Error?caught.message:String(caught));setCheckingRole(false)
      })

    const {data:listener}=supabase.auth.onAuthStateChange((event,next)=>{if(event==='INITIAL_SESSION'&&sessionLoadFailed)return;sessionLoadFailed=false;void resolve(next)})
    return()=>{active=false;listener.subscription.unsubscribe()}
  },[])

  if(checkingRole)return <div className="center-screen">Loading your Northborn workspace…</div>
  if(workspaceError)return <WorkspaceAccessError message={workspaceError}/>
  if(session&&clientContext)return <ClientPortalApp initialContext={clientContext}/>
  if(session&&operatorContext){
    if(!operatorContext.hasEmployeeProfile)return <EmployeeProfileSetup session={session} organizationId={operatorContext.organizationId} organizationName={operatorContext.organizationName}/>
    return <><OperatorAppV2 userId={session.user.id} organizationId={operatorContext.organizationId} organizationName={operatorContext.organizationName}/><OperatorFleetRepairNotifications userId={session.user.id} organizationId={operatorContext.organizationId}/></>
  }
  if(session&&internalContext)return <><App resolvedSession={session} authResolved/>{['owner','admin','supervisor','mechanic','dispatcher'].includes(internalContext.roleKey)&&<ManagerCompletionNotifications userId={session.user.id} organizationId={internalContext.organizationId}/>}</>
  if(session&&!showCompanySetup)return <UnconnectedAccount session={session} onCreateCompany={()=>setShowCompanySetup(true)}/>
  return <App resolvedSession={session} authResolved/>
}

function UnconnectedAccount({session,onCreateCompany}:{session:Session;onCreateCompany:()=>void}){
  const [signingOut,setSigningOut]=useState(false)
  const signOut=async()=>{setSigningOut(true);await supabase.auth.signOut();const home=new URL(import.meta.env.BASE_URL,window.location.origin).toString();window.location.href=home}
  return <div className="auth-page"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Choose how to continue</h1><p>Signed in as <strong>{session.user.email}</strong>, but this account is not connected to a Northborn workspace yet.</p><div className="account-choice-actions"><NavLink className="primary account-choice-link" to="/client-join"><KeyRound size={18}/>Use a client access code</NavLink><button className="secondary" type="button" onClick={onCreateCompany}><Building2 size={18}/>Create a new company</button><button className="link-button account-signout" type="button" disabled={signingOut} onClick={()=>void signOut()}><LogOut size={17}/>{signingOut?'Signing out…':'Sign out and use another account'}</button></div></div></div>
}


function WorkspaceAccessError({message}:{message:string}){
  const [signingOut,setSigningOut]=useState(false)
  const signOut=async()=>{setSigningOut(true);await supabase.auth.signOut();window.location.replace(new URL(import.meta.env.BASE_URL,window.location.origin).toString())}
  return <div className="auth-page"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Workspace unavailable</h1><p>Northborn could not verify your workspace access. Check your connection and try again.</p><small className="workspace-error-detail">{message}</small><div className="account-choice-actions"><button className="primary" type="button" onClick={()=>window.location.reload()}>Try again</button><button className="secondary" type="button" disabled={signingOut} onClick={()=>void signOut()}>{signingOut?'Signing out…':'Sign out'}</button></div></div></div>
}
