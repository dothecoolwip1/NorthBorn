export const INTERNAL_ROLE_PATHS: Record<string, readonly string[]> = {
  owner: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access'],
  admin: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access'],
  supervisor: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  dispatcher: ['/', '/calendar', '/dispatch', '/jobs', '/customers', '/employees', '/fleet', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  safety: ['/', '/calendar', '/jobs', '/customers', '/employees', '/fleet', '/maintenance', '/safety', '/tickets', '/ticket-print', '/timesheets', '/reports'],
  mechanic: ['/', '/calendar', '/jobs', '/employees', '/fleet', '/maintenance', '/safety', '/timesheets'],
  accounting: ['/', '/customers', '/employees', '/tickets', '/ticket-print', '/timesheets', '/invoices', '/billing', '/pricing', '/reports'],
}

export function normalizeInternalRoute(pathname: string) {
  if (pathname.startsWith('/ticket-print/')) return '/ticket-print'
  if (pathname.startsWith('/safety/')) return '/safety'
  return pathname
}

export function canAccessInternalRoute(roleKey: string, pathname: string) {
  const allowed = INTERNAL_ROLE_PATHS[roleKey] || ['/']
  return allowed.includes(normalizeInternalRoute(pathname))
}
