import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import ManagerFleetPage from './ManagerFleetPage'
import OperatorFleetPage from './OperatorFleetPage'
import { supabase } from './lib/supabase'
import './manager-fleet-v2.css'

const TEST_MODE_KEY='northborn_test_mode'
type OperatorContext={organizationId:string;organizationName:string}

export default function FleetRoutePage(){
  const [session,setSession]=useState<Session|null>(null),[operator,setOperator]=useState<OperatorContext|null>(null),[loading,setLoading]=useState(true),[manager,setManager]=useState(false)
  useEffect(()=>{
    let active=true
    const load=async()=>{
      if(localStorage.getItem(TEST_MODE_KEY)==='1'){if(active){setManager(true);setLoading(false)};return}
      const {data}=await supabase.auth.getSession();if(!active)return;const current=data.session;setSession(current)
      if(!current){setLoading(false);return}
      const membership=await supabase.from('organization_members').select('id,organization_id,organization:organizations(name)').eq('user_id',current.user.id).eq('status','active').limit(1).maybeSingle();if(!active)return
      if(membership.error||!membership.data?.id){setLoading(false);return}
      const roles=await supabase.from('membership_roles').select('role:roles(key)').eq('membership_id',membership.data.id);if(!active)return
      const roleKey=((roles.data?.[0]?.role as unknown as {key?:string}|null)?.key)||''
      if(roleKey==='operator'){
        const organization=membership.data.organization as unknown as {name?:string}|null
        setOperator({organizationId:membership.data.organization_id,organizationName:organization?.name||'Northborn company'})
      }else setManager(true)
      setLoading(false)
    }
    void load();return()=>{active=false}
  },[])
  if(loading)return <div className="center-screen">Loading fleet…</div>
  if(operator&&session)return <OperatorFleetPage userId={session.user.id} organizationId={operator.organizationId} organizationName={operator.organizationName}/>
  if(manager)return <ManagerFleetPage/>
  return <Navigate to="/" replace/>
}
