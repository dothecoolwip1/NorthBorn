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
import './styles.css'
import './contact-hierarchy.css'

function NorthbornRouter() {
  const location = useLocation()
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(location.search)
  const hasInvite = params.has('invite')

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
