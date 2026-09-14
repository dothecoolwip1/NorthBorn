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
import TestWorkspacePage from './TestWorkspacePage'
import './styles.css'
import './contact-hierarchy.css'

const TEST_MODE_KEY = 'northborn_test_mode'

function NorthbornRouter() {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(location.search)
  const hasInvite = params.has('invite')
  const [testMode,setTestMode] = React.useState(() => localStorage.getItem(TEST_MODE_KEY) === '1')

  React.useEffect(() => {
    const sync = () => setTestMode(localStorage.getItem(TEST_MODE_KEY) === '1')
    const timer = window.setInterval(sync, 300)
    window.addEventListener('storage', sync)
    window.addEventListener('northborn-auth-changed', sync)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', sync)
      window.removeEventListener('northborn-auth-changed', sync)
    }
  }, [])

  if (normalizedPath === '/logout') return <LogoutPage />
  if (normalizedPath === '/team-access') return <TeamAccessPage />
  if (normalizedPath === '/client-join') return <ClientJoinPage />
  if (normalizedPath === '/join' || (hasInvite && normalizedPath !== '/client-join')) return <JoinOrganizationPage />

  if (testMode) {
    if (normalizedPath === '/' || normalizedPath === '/test' || normalizedPath === '/test/manager') return <TestWorkspacePage section="home" />
    if (normalizedPath === '/test/operator') return <TestWorkspacePage section="operator" />
    if (normalizedPath === '/test/client') return <TestWorkspacePage section="client" />
    if (normalizedPath === '/dispatch') return <TestWorkspacePage section="dispatch" />
    if (normalizedPath === '/calendar') return <TestWorkspacePage section="calendar" />
    if (normalizedPath === '/customers') return <TestWorkspacePage section="customers" />
    if (normalizedPath === '/jobs') return <TestWorkspacePage section="jobs" />
  }

  if (normalizedPath === '/dispatch') return <ManagerDispatchPage />
  if (normalizedPath === '/calendar') return <OperationsCalendarPage />
  if (normalizedPath === '/customers') return <ManagerClientsPage />
  if (normalizedPath === '/jobs') return <ManagerJobsPage />
  if (normalizedPath === '/fleet') return <FleetRoutePage />
  if (normalizedPath === '/fleet-access') return <EmployeeFleetAccessPage />
  if (normalizedPath === '/maintenance') return <ManagerMaintenancePage />
  if (normalizedPath === '/invoices') return <ManagerInvoicesPage />

  return (
    <>
      <RoleAwareApp />
      <AuthEnhancements />
      <TeamAccessLauncher />
    </>
  )
}

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase}>
      <NorthbornRouter />
      <GlobalAccountMenu />
    </BrowserRouter>
  </React.StrictMode>,
)
