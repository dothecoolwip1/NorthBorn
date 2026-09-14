import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import OperatorApp from './OperatorApp'
import { supabase } from './lib/supabase'

type OperatorContext = {
  organizationId: string
  organizationName: string
}

export default function RoleAwareApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [operatorContext, setOperatorContext] = useState<OperatorContext | null>(null)
  const [checkingRole, setCheckingRole] = useState(true)

  useEffect(() => {
    let active = true

    const resolve = async (nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      setCheckingRole(true)
      setOperatorContext(null)

      if (!nextSession) {
        setCheckingRole(false)
        return
      }

      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('id,organization_id,organization:organizations(name)')
        .eq('user_id', nextSession.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      if (!active) return
      if (membershipError || !membership?.id) {
        setCheckingRole(false)
        return
      }

      const { data: roleRows } = await supabase
        .from('membership_roles')
        .select('role:roles(key)')
        .eq('membership_id', membership.id)

      if (!active) return
      const roleKey = ((roleRows?.[0]?.role as unknown as { key?: string } | null)?.key) || ''
      if (roleKey === 'operator') {
        const organization = membership.organization as unknown as { name?: string } | null
        setOperatorContext({
          organizationId: membership.organization_id,
          organizationName: organization?.name || 'Northborn company',
        })
      }
      setCheckingRole(false)
    }

    void supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void resolve(nextSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (checkingRole) return <div className="center-screen">Loading your Northborn workspace…</div>

  if (session && operatorContext) {
    return (
      <OperatorApp
        userId={session.user.id}
        organizationId={operatorContext.organizationId}
        organizationName={operatorContext.organizationName}
      />
    )
  }

  return <App />
}
