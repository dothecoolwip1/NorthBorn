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
import GlobalAccountMenu from './GlobalAccountMenu'
import TestRoleSwitcher from './TestRoleSwitcher'
import ReleaseNotes from './ReleaseNotes'
import LogoutPage from './LogoutPage'
import AppErrorBoundary from './AppErrorBoundary'
import { supabase } from './lib/supabase'
import { initializeNorthbornPwa } from './pwa'
import { resolveWorkspaceAccess } from './workspace-access'
import { canAccessInternalRoute } from './role-access'
import './styles.css'
import './contact-hierarchy.css'
import './mobile-first.css'
import './mobile-polish.css'
import './menu-shell-overrides.css'
import './qa-final-polish.css'

const RETIRED_TEST_KEYS = ['northborn_test_mode', 'northborn_test_persona']
for (const key of RETIRED_TEST_KEYS) localStorage.removeItem(key)

type RouteRole = 'loading' | 'guest' | 'unconnected' | 'manager' | 'operator' | 'client' | 'error'
function StandardApp() {
  return <><RoleAwareApp /><AuthEnhancements /></>
}

function WorkspaceNotFound({ homeLabel = 'Back to dashboard' }:{ homeLabel?:string }) {
  return <div className="center-screen"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Page not found</h1><p>This Northborn page is unavailable or the link is out of date.</p><div className="account-choice-actions"><a className="primary account-choice-link" href={import.meta.env.BASE_URL}>{homeLabel}</a><button className="secondary" type="button" onClick={()=>window.history.back()}>Go back</button></div></div></div>
}

function WorkspaceLoadError() {
  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.replace(new URL(import.meta.env.BASE_URL, window.location.origin).toString())
  }
  return <div className="center-screen"><div className="auth-card account-choice-card"><div className="auth-logo">N</div><h1>Workspace unavailable</h1><p>Northborn could not verify your workspace access. Your account has not been changed. Check your connection and try again.</p><div className="account-choice-actions"><button className="primary" type="button" onClick={()=>window.location.reload()}>Try again</button><button className="secondary" type="button" onClick={()=>void signOut()}>Sign out</button></div></div></div>
}

function RoutedWorkspace({ normalizedPath, hasInvite, routeRole, internalRoleKey }:{ normalizedPath:string; hasInvite:boolean; routeRole:RouteRole; internalRoleKey:string }) {
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
    if (!canAccessInternalRoute(internalRoleKey, normalizedPath)) return <WorkspaceNotFound homeLabel="Back to dashboard" />
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
  const [session, setSession] = React.useState<Session | null | undefined>(undefined)
  const [routeRole, setRouteRole] = React.useState<RouteRole>('loading')
  const [internalRoleKey, setInternalRoleKey] = React.useState('')
  const [authError, setAuthError] = React.useState('')

  React.useEffect(() => {
    document.title = 'Northborn'
  }, [normalizedPath])

  React.useEffect(() => {
    let active = true
    let sessionLoadFailed = false
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          sessionLoadFailed = true
          setAuthError(error.message)
          setSession(null)
          return
        }
        sessionLoadFailed = false
        setAuthError('')
        setSession(data.session)
      })
      .catch(caught => {
        if (!active) return
        sessionLoadFailed = true
        setAuthError(caught instanceof Error ? caught.message : String(caught))
        setSession(null)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return
      if (event === 'INITIAL_SESSION' && sessionLoadFailed) return
      sessionLoadFailed = false
      setAuthError('')
      setSession(next)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  React.useEffect(() => {
    let active = true

    const resolveRole = async () => {
      if (authError) {
        if (active) setRouteRole('error')
        return
      }
      if (session === undefined) {
        if (active) setRouteRole('loading')
        return
      }
      if (!session?.user.id) {
        if (active) setRouteRole('guest')
        return
      }

      setRouteRole('loading')
      try {
        const access = await resolveWorkspaceAccess(session.user.id)
        if (!active) return
        if (access.kind === 'internal') {
          setInternalRoleKey(access.roleKey)
          setRouteRole(access.roleKey === 'operator' ? 'operator' : 'manager')
          return
        }
        setInternalRoleKey('')
        if (access.kind === 'client') {
          setRouteRole('client')
          return
        }
        setRouteRole('unconnected')
      } catch {
        if (active) setRouteRole('error')
      }
    }

    void resolveRole()
    return () => { active = false }
  }, [normalizedPath, session, authError])

  return <RoutedWorkspace normalizedPath={normalizedPath} hasInvite={hasInvite} routeRole={routeRole} internalRoleKey={internalRoleKey} />
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

  return <><GlobalAccountMenu /><TestRoleSwitcher /><ReleaseNotes /></>
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
        <NorthbornOnlyChrome />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
