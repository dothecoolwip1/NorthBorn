import { supabase } from './lib/supabase'

const db = supabase as any

export type ClientPortalContext = {
  portal_user_id: string
  organization_id: string
  organization_name: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  billing_email: string | null
  portal_role: string
}

export type WorkspaceAccess =
  | { kind: 'internal'; organizationId: string; organizationName: string; roleKey: string }
  | { kind: 'client'; context: ClientPortalContext }
  | { kind: 'unconnected' }

function errorMessage(prefix: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message || '')
  return detail ? `${prefix}: ${detail}` : prefix
}

export async function resolveWorkspaceAccess(userId: string): Promise<WorkspaceAccess> {
  const membership = await db.from('organization_members')
    .select('id,organization_id,organization:organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (membership.error) throw new Error(errorMessage('Unable to verify company membership', membership.error))

  if (membership.data?.id) {
    const roles = await db.from('membership_roles')
      .select('role:roles(key)')
      .eq('membership_id', membership.data.id)

    if (roles.error) throw new Error(errorMessage('Unable to verify workspace role', roles.error))

    const roleKey = roles.data?.[0]?.role?.key || ''
    if (!roleKey) throw new Error('Your active Northborn membership does not have an assigned role.')

    const organization = membership.data.organization as { name?: string } | null
    return {
      kind: 'internal',
      organizationId: membership.data.organization_id,
      organizationName: organization?.name || 'Northborn company',
      roleKey,
    }
  }

  const portal = await db.rpc('get_my_customer_portal_context')
  if (portal.error) throw new Error(errorMessage('Unable to verify client portal access', portal.error))
  if (portal.data?.length) return { kind: 'client', context: portal.data[0] as ClientPortalContext }

  return { kind: 'unconnected' }
}
