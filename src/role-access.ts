export const INTERNAL_ROLE_PATHS: Record<string, readonly string[]> = {
  operator: ['/', '/jobs', '/fleet', '/tickets', '/ticket-print', '/timesheets', '/safety'],
  owner: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access'],
  admin: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access'],
  supervisor: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  dispatcher: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  safety: ['/', '/calendar', '/jobs', '/customers', '/employees', '/fleet', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  mechanic: ['/', '/calendar', '/jobs', '/employees', '/fleet', '/maintenance', '/safety', '/timesheets'],
  accounting: ['/', '/customers', '/employees', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/reports'],
}

export function normalizeInternalRoute(pathname: string) {
  if (pathname.startsWith('/ticket-print/')) return '/ticket-print'
  if (pathname === '/timesheet-print' || pathname.startsWith('/timesheet-print/')) return '/timesheets'
  if (pathname.startsWith('/safety/')) return '/safety'
  return pathname
}

export function canAccessInternalRoute(roleKey: string | readonly string[], pathname: string) {
  const roles = typeof roleKey === 'string' ? [roleKey] : roleKey
  return roles.some(role => (INTERNAL_ROLE_PATHS[role] || []).includes(normalizeInternalRoute(pathname)))
}

export function primaryInternalRole(roles: readonly string[]) {
  return ['owner','admin','supervisor','dispatcher','safety','mechanic','accounting','operator'].find(role=>roles.includes(role)) || ''
}

export function hasAnyRole(roles: readonly string[], allowed: ReadonlySet<string>) {
  return roles.some(role => allowed.has(role))
}
