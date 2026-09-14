import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BriefcaseBusiness, Gauge, LogOut, ReceiptText, Truck, UserRound, Wrench } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './global-account-menu.css'

const TEST_MODE_KEY = 'northborn_test_mode'

export default function GlobalAccountMenu() {
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)
  const [testMode, setTestMode] = useState(() => localStorage.getItem(TEST_MODE_KEY) === '1')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const syncTestMode = () => {
      if (active) setTestMode(localStorage.getItem(TEST_MODE_KEY) === '1')
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })
    const timer = window.setInterval(syncTestMode, 600)
    window.addEventListener('storage', syncTestMode)
    window.addEventListener('northborn-auth-changed', syncTestMode)

    return () => {
      active = false
      listener.subscription.unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('storage', syncTestMode)
      window.removeEventListener('northborn-auth-changed', syncTestMode)
    }
  }, [])

  if (!session && !testMode) return null

  const signOut = async () => {
    setBusy(true)
    localStorage.removeItem(TEST_MODE_KEY)
    if (session) await supabase.auth.signOut()
    window.dispatchEvent(new Event('northborn-auth-changed'))
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    window.location.replace(home)
  }

  const testPersona = location.pathname.startsWith('/test/operator')
    ? 'operator'
    : location.pathname.startsWith('/test/client')
      ? 'client'
      : 'manager'

  const testLinks = testPersona === 'operator'
    ? [
        ['/test/operator','Operator dashboard',Gauge],
        ['/test/operator/jobs','My jobs',BriefcaseBusiness],
        ['/test/operator/fleet','My fleet',Truck],
      ] as const
    : testPersona === 'client'
      ? [
          ['/test/client','Client dashboard',Gauge],
          ['/test/client/jobs','Jobs',BriefcaseBusiness],
          ['/test/client/invoices','Invoices',ReceiptText],
        ] as const
      : [
          ['/','Manager dashboard',Gauge],
          ['/jobs','Jobs',BriefcaseBusiness],
          ['/fleet','Fleet',Truck],
          ['/maintenance','Maintenance',Wrench],
          ['/invoices','Invoices',ReceiptText],
        ] as const

  return <div className="northborn-account-menu">
    {open && <div className="northborn-account-popover">
      <div className="northborn-account-heading">
        <UserRound size={18}/>
        <div>
          <strong>{testMode ? `${testPersona[0].toUpperCase()}${testPersona.slice(1)} test view` : 'Northborn account'}</strong>
          <span>{testMode ? 'admin / admin' : session?.user.email}</span>
        </div>
      </div>
      {testMode && <>
        <p className="northborn-account-note">You stay in the selected test persona until you deliberately choose Manager, Operator or Client from the role switcher.</p>
        <div className="northborn-account-links">
          {testLinks.map(([path,label,Icon])=><NavLink key={path} to={path} onClick={() => setOpen(false)}><Icon size={16}/>{label}</NavLink>)}
        </div>
      </>}
      <button className="northborn-account-signout" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16}/>{busy ? 'Signing out…' : 'Sign out'}</button>
    </div>}
    <button className="northborn-account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Open account menu"><UserRound size={17}/><span>{testMode ? `TEST ${testPersona}` : 'Account'}</span></button>
  </div>
}
