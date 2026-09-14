import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import RoleAwareApp from './RoleAwareApp'
import AuthEnhancements from './AuthEnhancements'
import { TeamAccessLauncher } from './TeamAccess'
import TeamAccessPage from './TeamAccessPage'
import JoinOrganizationPage from './JoinOrganizationPage'
import ManagerDispatchPage from './ManagerDispatchPage'
import OperationsCalendarPage from './OperationsCalendarPage'
import './styles.css'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const params = new URLSearchParams(window.location.search)
const isInviteRoute = normalizedPath === '/join' || params.has('invite')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {normalizedPath === '/team-access' ? (
        <TeamAccessPage />
      ) : isInviteRoute ? (
        <JoinOrganizationPage />
      ) : normalizedPath === '/dispatch' ? (
        <ManagerDispatchPage />
      ) : normalizedPath === '/calendar' ? (
        <OperationsCalendarPage />
      ) : (
        <>
          <RoleAwareApp />
          <AuthEnhancements />
          <TeamAccessLauncher />
        </>
      )}
    </BrowserRouter>
  </React.StrictMode>,
)
