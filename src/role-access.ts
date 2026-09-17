export type NorthbornEmployeeRole = 'owner' | 'admin' | 'supervisor' | 'dispatcher' | 'safety' | 'mechanic' | 'accounting'

const COMMON = ['/'] as const
const OPS_CORE = ['/calendar','/jobs','/employees','/timesheets'] as const

const ROLE_PATHS: Record<NorthbornEmployeeRole, ReadonlySet<string>> = {
  owner: new Set([
    ...COMMON,
    '/team-access','/calendar','/dispatch','/customers','/jobs','/employees','/fleet','/fleet-access',
    '/maintenance','/safety','/tickets','/ticket-print','/timesheets','/invoices','/billing','/pricing','/templates','/reports',
  ]),
  admin: new Set([
    ...COMMON,
    '/team-access','/calendar','/dispatch','/customers','/jobs','/employees','/fleet','/fleet-access',
    '/maintenance','/safety','/tickets','/ticket-print','/timesheets','/invoices','/billing','/pricing','/templates','/reports',
  ]),
  supervisor: new Set([
    ...COMMON,...OPS_CORE,
    '/dispatch','/customers','/fleet','/fleet-access','/maintenance','/safety','/tickets','/ticket-print','/reports',
  ]),
  dispatcher: new Set([
    ...COMMON,...OPS_CORE,
    '/dispatch','/customers','/fleet','/maintenance','/safety','/tickets','/ticket-print','/reports',
  ]),
  safety: new Set([
    ...COMMON,...OPS_CORE,
    '/customers','/fleet','/maintenance','/safety','/tickets','/ticket-print','/reports',
  ]),
  mechanic: new Set([
    ...COMMON,...OPS_CORE,
    '/fleet','/maintenance','/safety',
  ]),
  accounting: new Set([
    ...COMMON,
    '/customers','/employees','/tickets','/ticket-print','/timesheets','/invoices','/billing','/pricing','/reports',
  ]),
}

export function isNorthbornEmployeeRole(value: string): value is NorthbornEmployeeRole {
  return Object.prototype.hasOwnProperty.call(ROLE_PATHS, value)
}

export function canEmployeeRoleOpenPath(role: NorthbornEmployeeRole, pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path.startsWith('/safety/')) return ROLE_PATHS[role].has('/safety')
  return ROLE_PATHS[role].has(path)
}

export function routeAccessSummary(role: NorthbornEmployeeRole) {
  return Array.from(ROLE_PATHS[role])
}
