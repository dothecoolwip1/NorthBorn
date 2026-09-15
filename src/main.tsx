import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import RoleAwareApp from './RoleAwareApp'
import AuthEnhancements from './AuthEnhancements'
import { TeamAccessLauncher } from './TeamAccess'
import TeamAccessPage from './TeamAccessPage'
import JoinOrganizationPage from './JoinOrganizationPage'
import ClientJoinPage from './ClientJoinPage'
import ManagerDispatchPage from './ManagerDispatchPage'
import OperationsCalendarPage from './OperationsCalendarPage'
import ManagerClientsPage from './ManagerClientsPage'
import ManagerJobsPage from './ManagerJobsPage'
import FleetRoutePage from './FleetRoutePage'
import ManagerMaintenancePage from './ManagerMaintenancePage'
import ManagerInvoicesPage from './ManagerInvoicesPage'
import EmployeeFleetAccessPage from './EmployeeFleetAccessPage'
import GlobalAccountMenu from './GlobalAccountMenu'
import LogoutPage from './LogoutPage'
import TestSupabaseBridge from './TestSupabaseBridge'
import AppErrorBoundary from './AppErrorBoundary'
import { getTestPersona, isTestMode } from './test-lab'
import './styles.css'
import './contact-hierarchy.css'
import './test-lab-overrides.css'

function ProductionRoutes({ normalizedPath, hasInvite }:{ normalizedPath:string; hasInvite:boolean }) {
  if (normalizedPath === '/logout') return <LogoutPage />
  if (normalizedPath === '/team-access') return <TeamAccessPage />
  if (normalizedPath === '/client-join') return <ClientJoinPage />
  if (normalizedPath === '/join' || (hasInvite && normalizedPath !== '/client-join')) return <JoinOrganizationPage />
  if (normalizedPath === '/dispatch') return <ManagerDispatchPage />
  if (normalizedPath === '/calendar') return <OperationsCalendarPage />
  if (normalizedPath === '/customers') return <ManagerClientsPage />
  if (normalizedPath === '/jobs') return <ManagerJobsPage />
  if (normalizedPath === '/fleet') return <FleetRoutePage />
  if (normalizedPath === '/fleet-access') return <EmployeeFleetAccessPage />
  if (normalizedPath === '/maintenance') return <ManagerMaintenancePage />
  if (normalizedPath === '/invoices') return <ManagerInvoicesPage />
  return <><RoleAwareApp /><AuthEnhancements /><TeamAccessLauncher /></>
}

function NorthbornRouter() {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(location.search)
  const hasInvite = params.has('invite')
  const [testMode,setTestMode] = React.useState(() => isTestMode())
  const [persona,setPersona] = React.useState(() => getTestPersona())

  React.useEffect(() => {
    const sync = () => { setTestMode(isTestMode()); setPersona(getTestPersona()) }
    const timer = window.setInterval(sync, 300)
    window.addEventListener('storage', sync)
    window.addEventListener('northborn-auth-changed', sync)
    window.addEventListener('northborn-test-persona-changed', sync)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', sync)
      window.removeEventListener('northborn-auth-changed', sync)
      window.removeEventListener('northborn-test-persona-changed', sync)
    }
  }, [])

  if (!testMode) return <ProductionRoutes normalizedPath={normalizedPath} hasInvite={hasInvite} />

  return <TestSupabaseBridge persona={persona}>
    {normalizedPath === '/logout'
      ? <LogoutPage />
      : persona === 'manager'
        ? <ProductionRoutes normalizedPath={normalizedPath} hasInvite={hasInvite} />
        : normalizedPath === '/fleet' && persona === 'operator'
          ? <FleetRoutePage />
          : <><RoleAwareApp /><AuthEnhancements /></>}
  </TestSupabaseBridge>
}

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter basename={routerBase}>
        <NorthbornRouter />
        <GlobalAccountMenu />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
