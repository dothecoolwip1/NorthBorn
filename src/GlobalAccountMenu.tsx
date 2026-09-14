import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BriefcaseBusiness, Gauge, LogOut, ReceiptText, Truck, UserRound, Wrench } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'
import './global-account-menu.css'

const TEST_MODE_KEY = 'northborn_test_mode'

export default function GlobalAccountMenu() {
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

  return <div className="northborn-account-menu">
    {open && <div className="northborn-account-popover">
      <div className="northborn-account-heading">
        <UserRound size={18}/>
        <div>
          <strong>{testMode ? 'Universal test account' : 'Northborn account'}</strong>
          <span>{testMode ? 'admin / admin' : session?.user.email}</span>
        </div>
      </div>
      {testMode && <>
        <p className="northborn-account-note">Use this one account to review manager features. The dashboard also includes Manager, Operator and Client preview buttons.</p>
        <div className="northborn-account-links">
          <NavLink to="/" onClick={() => setOpen(false)}><Gauge size={16}/>Dashboard / role preview</NavLink>
          <NavLink to="/jobs" onClick={() => setOpen(false)}><BriefcaseBusiness size={16}/>Jobs</NavLink>
          <NavLink to="/fleet" onClick={() => setOpen(false)}><Truck size={16}/>Fleet</NavLink>
          <NavLink to="/maintenance" onClick={() => setOpen(false)}><Wrench size={16}/>Maintenance</NavLink>
          <NavLink to="/invoices" onClick={() => setOpen(false)}><ReceiptText size={16}/>Invoices</NavLink>
        </div>
      </>}
      <button className="northborn-account-signout" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16}/>{busy ? 'Signing out…' : 'Sign out'}</button>
    </div>}
    <button className="northborn-account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Open account menu"><UserRound size={17}/><span>{testMode ? 'TEST admin' : 'Account'}</span></button>
  </div>
}
