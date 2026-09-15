import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, NavLink } from 'react-router-dom'
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ContactRound,
  Gauge,
  HardHat,
  Home,
  LogOut,
  Menu,
  ShieldCheck,
  Truck,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react'
import SafetyPage from './SafetyPage'
import { supabase } from './lib/supabase'
import './operator-app.css'
import './safety-route.css'

const MANAGER_NAV = [
  ['Dashboard', '/', Gauge],
  ['Calendar', '/calendar', CalendarDays],
  ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness],
  ['Customers', '/customers', ContactRound],
  ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck],
  ['Maintenance', '/maintenance', Wrench],
  ['Safety', '/safety', ShieldCheck],
  ['Tickets', '/tickets', ClipboardCheck],
  ['Timesheets', '/timesheets', HardHat],
  ['Invoices', '/invoices', CircleDollarSign],
] as const

const OPERATOR_NAV = [
  ['Home', '/', Home],
  ['My Jobs', '/jobs', BriefcaseBusiness],
  ['Safety', '/safety', ShieldCheck],
  ['Tickets', '/tickets', ClipboardCheck],
  ['Timesheets', '/timesheets', HardHat],
] as const

const SAFETY_ROLES = new Set(['owner', 'admin', 'supervisor', 'safety', 'operator', 'mechanic'])

type Context = {
  organizationId: string
  organizationName: string
  roleKey: string
  userId: string
}

export default function SafetyRoutePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let active = true
    const resolve = async (nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      setContext(null)
      setError('')
      if (!nextSession) { setLoading(false); return }
      setLoading(true)
      const membership = await supabase.from('organization_members')
        .select('id,organization_id,organization:organizations(name)')
        .eq('user_id', nextSession.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (membership.error || !membership.data?.id) {
        setError(membership.error?.message || 'This account is not connected to a company workspace.')
        setLoading(false)
        return
      }
      const roleResult = await supabase.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id).limit(1).maybeSingle()
      if (!active) return
      if (roleResult.error) {
        setError(roleResult.error.message)
        setLoading(false)
        return
      }
      const roleKey = ((roleResult.data?.role as unknown as { key?: string } | null)?.key) || ''
      const organization = membership.data.organization as unknown as { name?: string } | null
      setContext({
        organizationId: membership.data.organization_id,
        organizationName: organization?.name || 'Northborn company',
        roleKey,
        userId: nextSession.user.id,
      })
      setLoading(false)
    }

    void supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, next) => { void resolve(next) })
    return () => { active = false; authListener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
  }

  if (loading) return <div className="center-screen">Loading safety workspace…</div>
  if (!session) return <Navigate to="/" replace />
  if (error) return <div className="center-screen"><div className="safety-route-error"><ShieldCheck size={36}/><strong>Safety workspace unavailable</strong><span>{error}</span><NavLink to="/">Back to Northborn</NavLink></div></div>
  if (!context || !SAFETY_ROLES.has(context.roleKey)) return <Navigate to="/" replace />

  if (context.roleKey === 'operator') {
    return <div className="field-shell">
      <aside className="field-sidebar">
        <div className="field-brand"><div className="field-brand-mark">N</div><div><strong>NORTHBORN</strong><span>{context.organizationName}</span></div></div>
        <div className="field-role-chip">Operator</div>
        <nav className="field-nav">{OPERATOR_NAV.map(([name, path, Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={19}/><span>{name}</span></NavLink>)}</nav>
        <button className="field-signout" onClick={() => void signOut()}><LogOut size={18}/>Sign out</button>
      </aside>
      <main className="field-main">
        <header className="field-topbar"><div><span className="field-top-label">FIELD WORKSPACE</span><strong>{context.organizationName}</strong></div><div className={online ? 'field-connection online' : 'field-connection offline'}>{online ? <Wifi size={15}/> : <WifiOff size={15}/>} {online ? 'Online' : 'Offline'}</div></header>
        <SafetyPage organizationId={context.organizationId} userId={context.userId} roleKey={context.roleKey} organizationName={context.organizationName}/>
      </main>
      <nav className="field-mobile-nav">{OPERATOR_NAV.map(([name, path, Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={20}/><span>{name}</span></NavLink>)}</nav>
    </div>
  }

  return <div className="app-shell safety-manager-shell">
    <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">N</div><div><strong>NORTHBORN</strong><span>{context.organizationName}</span></div></div>
      <div className="safety-role-chip">{context.roleKey}</div>
      <nav>{MANAGER_NAV.map(([name, path, Icon]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileOpen(false)}><Icon size={19}/><span>{name}</span></NavLink>)}</nav>
      <button className="signout" onClick={() => void signOut()}><LogOut size={18}/>Sign out</button>
    </aside>
    <main className="content">
      <header><button className="menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(current => !current)}><Menu/></button><div className="header-actions"><div className={online ? 'connection online' : 'connection offline'}>{online ? <Wifi size={16}/> : <WifiOff size={16}/>} {online ? 'Online' : 'Offline'}</div></div></header>
      <SafetyPage organizationId={context.organizationId} userId={context.userId} roleKey={context.roleKey} organizationName={context.organizationName}/>
    </main>
  </div>
}
