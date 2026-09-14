import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AuthEnhancements from './AuthEnhancements'
import TeamAccessPage, { JoinOrganizationPage, TeamAccessLauncher } from './TeamAccess'
import './styles.css'

const path = window.location.pathname

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      {path === '/team-access' ? (
        <TeamAccessPage />
      ) : path === '/join' ? (
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
