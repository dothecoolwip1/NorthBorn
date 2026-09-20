import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, HardHat, ShieldCheck, UsersRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { FUNCTIONAL_TEST_INTERNAL_ROLES, FUNCTIONAL_TEST_USERS, personaFromSession, switchFunctionalTestInternalRole, switchFunctionalTestPersona, type FunctionalTestInternalRole, type FunctionalTestPersona } from './functional-test-auth'
import './test-role-switcher.css'

const personas = [
  ['manager', ShieldCheck],
  ['operator', HardHat],
  ['client', Building2],
] as const

export default function TestRoleSwitcher() {
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<FunctionalTestPersona | null>(null)
  const [roleSwitching, setRoleSwitching] = useState<FunctionalTestInternalRole | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const persona = personaFromSession(session)
  if (!persona) return null

  const switchRole = async (next: FunctionalTestPersona) => {
    if (next === persona) { setOpen(false); return }
    setError('')
    setSwitching(next)
    try {
      await switchFunctionalTestPersona(next)
      const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      window.location.replace(home)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSwitching(null)
    }
  }

  const switchInternalRole = async (roleKey: FunctionalTestInternalRole) => {
    setError('')
    setRoleSwitching(roleKey)
    try {
      await switchFunctionalTestInternalRole(roleKey)
      const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      window.location.replace(home)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRoleSwitching(null)
    }
  }

  return <div className="northborn-test-role-switcher">
    {open && <button className="northborn-test-role-scrim" type="button" aria-label="Close test role switcher" onClick={() => setOpen(false)}/>} 
    {open && <div className="northborn-test-role-popover" role="dialog" aria-label="Test role switcher">
      <div className="northborn-test-role-heading"><div><strong>Test role</strong><span>Admin testing only</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18}/></button></div>
      <div className="northborn-test-role-list">
        {personas.map(([key, Icon]) => <button key={key} type="button" disabled={Boolean(switching)||Boolean(roleSwitching)} className={persona === key ? 'active' : ''} onClick={() => void switchRole(key)}><Icon size={18}/><span><strong>{FUNCTIONAL_TEST_USERS[key].label}</strong><small>{persona === key ? 'Current account' : switching === key ? 'Switching…' : 'Open this account'}</small></span></button>)}
      </div>
      {persona==='manager'&&<><div className="northborn-test-role-subheading">Internal manager roles</div><div className="northborn-test-role-list northborn-test-internal-role-list">
        {(Object.entries(FUNCTIONAL_TEST_INTERNAL_ROLES) as [FunctionalTestInternalRole,string][]).map(([key,label])=><button data-testid={`test-role-${key}`} key={key} type="button" disabled={Boolean(switching)||Boolean(roleSwitching)} onClick={()=>void switchInternalRole(key)}><ShieldCheck size={18}/><span><strong>{label}</strong><small>{roleSwitching===key?'Switching…':'Set internal role'}</small></span></button>)}
      </div></>}
      {error&&<div className="northborn-test-role-error">{error}</div>}
    </div>}
    <button className="northborn-test-role-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Switch test role"><UsersRound size={21}/><span>TEST</span></button>
  </div>
}
