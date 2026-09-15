import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, HardHat, LogOut, Menu, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { clearTestLab, getTestPersona, isTestMode, setTestPersona, TEST_USERS, type TestPersona } from './test-lab'
import './global-account-menu.css'

const personas = [
  ['manager', TEST_USERS.manager.email, ShieldCheck],
  ['operator', TEST_USERS.operator.email, HardHat],
  ['client', TEST_USERS.client.email, Building2],
] as const

export default function GlobalAccountMenu() {
  const [session, setSession] = useState<Session | null>(null)
  const [testMode, setTestMode] = useState(() => isTestMode())
  const [persona, setPersonaState] = useState<TestPersona>(() => getTestPersona())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const sync = () => {
      if (!active) return
      setTestMode(isTestMode())
      setPersonaState(getTestPersona())
    }
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next) })
    const timer = window.setInterval(sync, 500)
    window.addEventListener('storage', sync)
    window.addEventListener('northborn-auth-changed', sync)
    window.addEventListener('northborn-test-persona-changed', sync)
    return () => {
      active = false
      listener.subscription.unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('storage', sync)
      window.removeEventListener('northborn-auth-changed', sync)
      window.removeEventListener('northborn-test-persona-changed', sync)
    }
  }, [])

  if (!session && !testMode) return null

  const switchPersona = (next:TestPersona) => {
    setTestPersona(next)
    setPersonaState(next)
    setOpen(false)
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    window.location.assign(home)
  }

  const signOut = async () => {
    setBusy(true)
    if (testMode) clearTestLab()
    if (session) await supabase.auth.signOut()
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    window.location.replace(home)
  }

  const activeUser = TEST_USERS[persona]

  return <div className="northborn-account-menu">
    {open && <button className="northborn-account-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />}
    {open && <div className="northborn-account-popover" role="dialog" aria-label="Northborn menu">
      <div className="northborn-account-heading">
        <UserRound size={18}/>
        <div>
          <strong>{testMode ? 'Test account' : 'Northborn account'}</strong>
          <span>{testMode ? activeUser.email : session?.user.email}</span>
        </div>
      </div>

      {testMode && <>
        <div className="northborn-account-section-title">Switch workspace</div>
        <div className="northborn-test-account-list">
          {personas.map(([key,email,Icon]) => <button key={key} type="button" className={persona===key?'active':''} onClick={()=>switchPersona(key)}>
            <Icon size={18}/><div><strong>{key[0].toUpperCase()+key.slice(1)}</strong><span>{email}</span></div>{persona===key&&<em>Active</em>}
          </button>)}
        </div>
      </>}

      <button className="northborn-account-signout" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={17}/>{busy ? 'Signing out…' : 'Sign out'}</button>
    </div>}
    <button className="northborn-account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? 'Close Northborn menu' : 'Open Northborn menu'}>
      <span className="northborn-account-mobile-icon">{open ? <X size={22}/> : <Menu size={23}/>}</span>
      <span className="northborn-account-desktop-icon"><UserRound size={17}/></span>
      <span className="northborn-account-trigger-label">{testMode ? activeUser.email : 'Account'}</span>
    </button>
  </div>
}
