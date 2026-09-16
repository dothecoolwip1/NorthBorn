import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import RoleAwareApp from './RoleAwareApp'
import AuthEnhancements from './AuthEnhancements'
import MarketingHome from './MarketingHome'
import TeamAccessPage from './TeamAccessPage'
import JoinOrganizationPage from './JoinOrganizationPage'
import ClientJoinPage from './ClientJoinPage'
import ManagerDispatchPage from './ManagerDispatchPage'
import OperationsCalendarPage from './OperationsCalendarPage'
import ManagerClientsPage from './ManagerClientsPage'
import ManagerJobsPage from './ManagerJobsPage'
import ManagerEmployeesPage from './ManagerEmployeesPage'
import FleetRoutePage from './FleetRoutePage'
import ManagerMaintenancePage from './ManagerMaintenancePage'
import ManagerInvoicesPageV2 from './ManagerInvoicesPageV2'
import ManagerPricingPage from './ManagerPricingPage'
import ManagerReportsPage from './ManagerReportsPage'
import TimesheetsRoutePage from './TimesheetsRoutePage'
import FieldTicketsPage from './FieldTicketsPage'
import TicketPrintPage from './TicketPrintPage'
import BillingQueuePage from './BillingQueuePage'
import EmployeeFleetAccessPage from './EmployeeFleetAccessPage'
import SafetyRoutePage from './SafetyRoutePage'
import GlobalAccountMenu from './GlobalAccountMenu'
import TestRoleSwitcher from './TestRoleSwitcher'
import ReleaseNotes from './ReleaseNotes'
import LogoutPage from './LogoutPage'
import AppErrorBoundary from './AppErrorBoundary'
import { supabase } from './lib/supabase'
import { initializeNorthbornPwa } from './pwa'
import './styles.css'
import './contact-hierarchy.css'
import './mobile-first.css'
import './mobile-polish.css'
import './menu-shell-overrides.css'

const RETIRED_TEST_KEYS = ['northborn_test_mode', 'northborn_test_persona']
for (const key of RETIRED_TEST_KEYS) localStorage.removeItem(key)

type RouteRole = 'loading' | 'guest' | 'unconnected' | 'manager' | 'operator' | 'client'
const db = supabase as any

function StandardApp() {
  return <><RoleAwareApp /><AuthEnhancements /></>
}

function RoutedWorkspace({ normalizedPath, hasInvite, routeRole }:{ normalizedPath:string; hasInvite:boolean; routeRole:RouteRole }) {
  if (normalizedPath === '/logout') return <LogoutPage />
  if (normalizedPath === '/client-join') return <ClientJoinPage />
  if (normalizedPath === '/join' || (hasInvite && normalizedPath !== '/client-join')) return <JoinOrganizationPage />

  if (routeRole === 'loading') return <div className="center-screen">Loading your Northborn workspace…</div>

  if (routeRole === 'guest') {
    if (normalizedPath === '/') return <MarketingHome />
    return <StandardApp />
  }

  if (routeRole === 'unconnected') return <StandardApp />

  if (routeRole === 'operator') {
    if (normalizedPath === '/fleet') return <FleetRoutePage />
    if (normalizedPath === '/tickets') return <FieldTicketsPage />
    if (normalizedPath === '/ticket-print') return <TicketPrintPage />
    if (normalizedPath === '/timesheets') return <TimesheetsRoutePage />
    if (normalizedPath === '/safety' || normalizedPath.startsWith('/safety/')) return <SafetyRoutePage />
    return <StandardApp />
  }

  if (routeRole === 'client') return <StandardApp />

  if (routeRole === 'manager') {
    if (normalizedPath === '/team-access') return <TeamAccessPage />
    if (normalizedPath === '/dispatch') return <ManagerDispatchPage />
    if (normalizedPath === '/calendar') return <OperationsCalendarPage />
    if (normalizedPath === '/customers') return <ManagerClientsPage />
    if (normalizedPath === '/jobs') return <ManagerJobsPage />
    if (normalizedPath === '/employees') return <ManagerEmployeesPage />
    if (normalizedPath === '/fleet') return <FleetRoutePage />
    if (normalizedPath === '/fleet-access') return <EmployeeFleetAccessPage />
    if (normalizedPath === '/maintenance') return <ManagerMaintenancePage />
    if (normalizedPath === '/invoices') return <ManagerInvoicesPageV2 />
    if (normalizedPath === '/billing') return <BillingQueuePage />
    if (normalizedPath === '/pricing') return <ManagerPricingPage />
    if (normalizedPath === '/reports') return <ManagerReportsPage />
    if (normalizedPath === '/tickets') return <FieldTicketsPage />
    if (normalizedPath === '/ticket-print') return <TicketPrintPage />
    if (normalizedPath === '/timesheets') return <TimesheetsRoutePage />
    if (normalizedPath === '/safety' || normalizedPath.startsWith('/safety/')) return <SafetyRoutePage />
  }

  return <StandardApp />
}

function NorthbornRouter() {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(location.search)
  const hasInvite = params.has('invite')
  const [session, setSession] = React.useState<Session | null>(null)
  const [routeRole, setRouteRole] = React.useState<RouteRole>('loading')

  React.useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  React.useEffect(() => {
    let active = true
    const resolveRole = async () => {
      if (!session?.user.id) {
        if (active) setRouteRole('guest')
        return
      }

      setRouteRole('loading')
      const membership = await db.from('organization_members')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      if (!active) return
      if (!membership.error && membership.data?.id) {
        const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id)
        if (!active) return
        const roleKey = roles.data?.[0]?.role?.key || ''
        setRouteRole(roleKey === 'operator' ? 'operator' : 'manager')
        return
      }

      const portal = await db.rpc('get_my_customer_portal_context')
      if (!active) return
      if (!portal.error && portal.data?.length) {
        setRouteRole('client')
        return
      }

      setRouteRole('unconnected')
    }

    void resolveRole()
    return () => { active = false }
  }, [session?.user.id])

  return <RoutedWorkspace normalizedPath={normalizedPath} hasInvite={hasInvite} routeRole={routeRole} />
}

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')
const rootElement = document.getElementById('root')!

document.documentElement.dataset.northbornMounted = '1'
if (import.meta.env.PROD) initializeNorthbornPwa()

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter basename={routerBase}>
        <NorthbornRouter />
        <GlobalAccountMenu />
        <TestRoleSwitcher />
        <ReleaseNotes />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
