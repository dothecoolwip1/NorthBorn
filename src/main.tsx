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
import ClientFieldTicketsPage from './ClientFieldTicketsPage'
import ClientTicketPrintPage from './ClientTicketPrintPage'
import ManagerDashboardV2 from './ManagerDashboardV2'
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
import FieldTicketsPage from './TemplateAwareFieldTicketsPage'
import TicketPrintPage from './TicketPrintPage'
import BillingQueuePage from './BillingQueuePage'
import EmployeeFleetAccessPage from './EmployeeFleetAccessPage'
import SafetyRoutePage from './SafetyRoutePage'
import TemplateManagerPage from './TemplateManagerPage'
import MallardRoute from './MallardRoute'
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
import './qa-final-polish.css'

const RETIRED_TEST_KEYS = ['northborn_test_mode', 'northborn_test_persona']
for (const key of RETIRED_TEST_KEYS) localStorage.removeItem(key)

type RouteRole = 'loading' | 'guest' | 'unconnected' | 'manager' | 'operator' | 'client' | 'error'
const db = supabase as any

function isMallardPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/mallard' || path.startsWith('/mallard/')
}

function StandardApp() {
  return <><RoleAwareApp /><AuthEnhancements /></>
}

function WorkspaceNotFound({ homeLabel = 'Back to dashboard' }:{ homeLabel?:string }) {
  return <div className="center-screen"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Page not found</h1><p>This Northborn page is unavailable or the link is out of date.</p><div className="account-choice-actions"><a className="primary account-choice-link" href={import.meta.env.BASE_URL}>{homeLabel}</a><button className="secondary" type="button" onClick={()=>window.history.back()}>Go back</button></div></div></div>
}

function WorkspaceLoadError() {
  return <div className="center-screen"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Workspace unavailable</h1><p>Northborn could not verify your workspace access. Your account has not been changed. Check your connection and try again.</p><div className="account-choice-actions"><button className="primary" type="button" onClick={()=>window.location.reload()}>Try again</button><a className="secondary account-choice-link" href="/logout">Sign out</a></div></div></div>
}

function RoutedWorkspace({ normalizedPath, hasInvite, routeRole }:{ normalizedPath:string; hasInvite:boolean; routeRole:RouteRole }) {
  if (isMallardPath(normalizedPath)) return <MallardRoute />
  if (normalizedPath === '/logout') return <LogoutPage />
  if (normalizedPath === '/client-join') return <ClientJoinPage />
  if (normalizedPath === '/join' || (hasInvite && normalizedPath !== '/client-join')) return <JoinOrganizationPage />
  if (routeRole === 'loading') return <div className="center-screen">Loading your Northborn workspace…</div>
  if (routeRole === 'error') return <WorkspaceLoadError />
  if (routeRole === 'guest') {
    if (normalizedPath === '/') return <MarketingHome />
    return <StandardApp />
  }
  if (routeRole === 'unconnected') return <StandardApp />
  if (routeRole === 'operator') {
    if (normalizedPath === '/' || normalizedPath === '/jobs') return <StandardApp />
    if (normalizedPath === '/fleet') return <FleetRoutePage />
    if (normalizedPath === '/tickets') return <FieldTicketsPage />
    if (normalizedPath === '/ticket-print') return <TicketPrintPage />
    if (normalizedPath === '/timesheets') return <TimesheetsRoutePage />
    if (normalizedPath === '/safety' || normalizedPath.startsWith('/safety/')) return <SafetyRoutePage />
    return <WorkspaceNotFound homeLabel="Back to my jobs" />
  }
  if (routeRole === 'client') {
    if (normalizedPath === '/') return <StandardApp />
    if (normalizedPath === '/tickets' || normalizedPath === '/client-tickets') return <ClientFieldTicketsPage />
    if (normalizedPath === '/client-ticket-print') return <ClientTicketPrintPage />
    return <WorkspaceNotFound homeLabel="Back to client portal" />
  }
  if (routeRole === 'manager') {
    if (normalizedPath === '/') return <ManagerDashboardV2 />
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
    if (normalizedPath === '/templates') return <TemplateManagerPage />
    if (normalizedPath === '/tickets') return <FieldTicketsPage />
    if (normalizedPath === '/ticket-print') return <TicketPrintPage />
    if (normalizedPath === '/timesheets') return <TimesheetsRoutePage />
    if (normalizedPath === '/safety' || normalizedPath.startsWith('/safety/')) return <SafetyRoutePage />
    return <WorkspaceNotFound />
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
    if (isMallardPath(normalizedPath)) return
    document.title = 'Northborn'
  }, [normalizedPath])

  React.useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) { setRouteRole('error'); return }
      setSession(data.session)
    }).catch(() => { if (active) setRouteRole('error') })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  React.useEffect(() => {
    if (isMallardPath(normalizedPath)) return
    let active = true
    const resolveRole = async () => {
      if (!session?.user.id) {
        if (active && routeRole !== 'error') setRouteRole('guest')
        return
      }
      setRouteRole('loading')
      try {
        const membership = await db.from('organization_members').select('id').eq('user_id', session.user.id).eq('status', 'active').limit(1).maybeSingle()
        if (!active) return
        if (membership.error) { setRouteRole('error'); return }
        if (membership.data?.id) {
          const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id)
          if (!active) return
          if (roles.error) { setRouteRole('error'); return }
          const roleKey = roles.data?.[0]?.role?.key || ''
          setRouteRole(roleKey === 'operator' ? 'operator' : 'manager')
          return
        }
        const portal = await db.rpc('get_my_customer_portal_context')
        if (!active) return
        if (portal.error) { setRouteRole('error'); return }
        if (portal.data?.length) { setRouteRole('client'); return }
        setRouteRole('unconnected')
      } catch {
        if (active) setRouteRole('error')
      }
    }
    void resolveRole()
    return () => { active = false }
  }, [normalizedPath, session?.user.id])

  return <RoutedWorkspace normalizedPath={normalizedPath} hasInvite={hasInvite} routeRole={routeRole} />
}

function NorthbornOnlyChrome() {
  const location = useLocation()

  React.useEffect(() => {
    const applyAccessibleNames = () => {
      document.querySelectorAll<HTMLAnchorElement>('.opfleet-shell > header > a').forEach(link => {
        if (!link.getAttribute('aria-label') && !(link.textContent || '').trim()) link.setAttribute('aria-label', 'Back to dashboard')
      })
    }
    applyAccessibleNames()
    const observer = new MutationObserver(applyAccessibleNames)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (isMallardPath(location.pathname)) return null
  return <><GlobalAccountMenu /><TestRoleSwitcher /><ReleaseNotes /></>
}

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')
const rootElement = document.getElementById('root')!

document.documentElement.dataset.northbornMounted = '1'
if (import.meta.env.PROD && !isMallardPath(window.location.pathname)) initializeNorthbornPwa()

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter basename={routerBase}>
        <NorthbornRouter />
        <NorthbornOnlyChrome />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
