import { useEffect, useState } from 'react'
import { Navigate, NavLink } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Users } from 'lucide-react'
import ManagerFleetPage from './ManagerFleetPage'
import OperatorFleetPage from './OperatorFleetPage'
import { supabase } from './lib/supabase'
import { getTestPersona, isTestMode, TEST_ORG, TEST_USERS } from './test-lab'
import './manager-fleet-v2.css'
import './employee-fleet-access.css'

type OperatorContext={organizationId:string;organizationName:string}

export default function FleetRoutePage(){
  const testMode=isTestMode()
  const testPersona=getTestPersona()
  const [session,setSession]=useState<Session|null>(null),[operator,setOperator]=useState<OperatorContext|null>(null),[loading,setLoading]=useState(!testMode),[manager,setManager]=useState(testMode&&testPersona==='manager'),[roleKey,setRoleKey]=useState(testMode&&testPersona==='manager'?'owner':'')

  useEffect(()=>{
    if(testMode)return
    let active=true
    const load=async()=>{
      const {data}=await supabase.auth.getSession();if(!active)return;const current=data.session;setSession(current)
      if(!current){setLoading(false);return}
      const membership=await supabase.from('organization_members').select('id,organization_id,organization:organizations(name)').eq('user_id',current.user.id).eq('status','active').limit(1).maybeSingle();if(!active)return
      if(membership.error||!membership.data?.id){setLoading(false);return}
      const roles=await supabase.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id);if(!active)return
      const role=((roles.data?.[0]?.role as unknown as {key?:string}|null)?.key)||'';setRoleKey(role)
      if(role==='operator'){
        const organization=membership.data.organization as unknown as {name?:string}|null
        setOperator({organizationId:membership.data.organization_id,organizationName:organization?.name||'Northborn company'})
      }else setManager(true)
      setLoading(false)
    }
    void load();return()=>{active=false}
  },[testMode])

  if(testMode&&testPersona==='operator')return <OperatorFleetPage userId={TEST_USERS.operator.id} organizationId={TEST_ORG.id} organizationName={TEST_ORG.name}/>
  if(loading)return <div className="center-screen">Loading fleet…</div>
  if(operator&&session)return <OperatorFleetPage userId={session.user.id} organizationId={operator.organizationId} organizationName={operator.organizationName}/>
  if(manager)return <><ManagerFleetPage/>{['owner','admin','supervisor'].includes(roleKey)&&<NavLink className="manager-fleet-access-shortcut" to="/fleet-access"><Users size={16}/>Employee truck access</NavLink>}</>
  return <Navigate to="/" replace/>
}
