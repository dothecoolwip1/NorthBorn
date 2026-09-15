import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import RoleAwareApp from './RoleAwareApp'
import AuthEnhancements from './AuthEnhancements'
import TeamAccessPage from './TeamAccessPage'
import JoinOrganizationPage from './JoinOrganizationPage'
import ClientJoinPage from './ClientJoinPage'
import ManagerDispatchPage from './ManagerDispatchPage'
import OperationsCalendarPage from './OperationsCalendarPage'
import ManagerClientsPage from './ManagerClientsPage'
import ManagerJobsPage from './ManagerJobsPage'
import FleetRoutePage from './FleetRoutePage'
import ManagerMaintenancePage from './ManagerMaintenancePage'
import ManagerInvoicesPageV2 from './ManagerInvoicesPageV2'
import ManagerPricingPage from './ManagerPricingPage'
import EmployeeFleetAccessPage from './EmployeeFleetAccessPage'
import SafetyRoutePage from './SafetyRoutePage'
import GlobalAccountMenu from './GlobalAccountMenu'
import LogoutPage from './LogoutPage'
import AppErrorBoundary from './AppErrorBoundary'
import './styles.css'
import './contact-hierarchy.css'
import './mobile-first.css'

const RETIRED_TEST_KEYS = [
  'northborn_test_mode',
  'northborn_test_persona',
]

for (const key of RETIRED_TEST_KEYS) localStorage.removeItem(key)

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
  if (normalizedPath === '/invoices') return <ManagerInvoicesPageV2 />
  if (normalizedPath === '/pricing') return <ManagerPricingPage />
  if (normalizedPath === '/safety' || normalizedPath.startsWith('/safety/')) return <SafetyRoutePage />
  return <><RoleAwareApp /><AuthEnhancements /></>
}

function NorthbornRouter() {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(location.search)
  const hasInvite = params.has('invite')
  return <ProductionRoutes normalizedPath={normalizedPath} hasInvite={hasInvite} />
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
