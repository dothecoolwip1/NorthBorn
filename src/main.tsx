import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AuthEnhancements from './AuthEnhancements'
import { JoinOrganizationPage, TeamAccessLauncher } from './TeamAccess'
import TeamAccessPage from './TeamAccessPage'
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
      ) : (
        <>
          <App />
          <AuthEnhancements />
          <TeamAccessLauncher />
        </>
      )}
    </BrowserRouter>
  </React.StrictMode>,
)
