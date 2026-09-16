import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, BellRing, BriefcaseBusiness, Building2, CalendarDays, Check, ChevronLeft, CircleDollarSign, ClipboardCheck, ContactRound, Download, FileClock, Gauge, LogOut, Menu, ReceiptText, RefreshCw, Settings, ShieldCheck, Smartphone, Trash2, Truck, UserRound, Users, Wrench, X } from 'lucide-react'
import packageInfo from '../package.json'
import { supabase } from './lib/supabase'
import { FUNCTIONAL_TEST_USERS, personaFromSession, switchFunctionalTestPersona, type FunctionalTestPersona } from './functional-test-auth'
import { applyNorthbornUpdate, checkForNorthbornUpdate, getPwaUpdateMode, hasInstallPrompt, isNorthbornInstalled, promptNorthbornInstall, setPwaUpdateMode, type NorthbornUpdateMode } from './pwa'
import './global-account-menu.css'

const db = supabase as any
const APP_VERSION = packageInfo.version
const personas = [
  ['manager', FUNCTIONAL_TEST_USERS.manager.email, ShieldCheck],
  ['operator', FUNCTIONAL_TEST_USERS.operator.email, Building2],
  ['client', FUNCTIONAL_TEST_USERS.client.email, Building2],
] as const

const managerNavigation = [
  ['Dashboard','/',Gauge],
  ['Calendar','/calendar',CalendarDays],
  ['Dispatch','/dispatch',CalendarDays],
  ['Jobs','/jobs',BriefcaseBusiness],
  ['Customers','/customers',ContactRound],
  ['Employees','/employees',Users],
  ['Fleet','/fleet',Truck],
  ['Maintenance','/maintenance',Wrench],
  ['Safety','/safety',ShieldCheck],
  ['Tickets','/tickets',ClipboardCheck],
  ['Timesheets','/timesheets',FileClock],
  ['Invoices','/invoices',ReceiptText],
  ['Reports','/reports',Activity],
] as const

const operatorNavigation = [
  ['Home','/',Gauge],
  ['My jobs','/jobs',BriefcaseBusiness],
  ['Tickets','/tickets',ClipboardCheck],
  ['Timesheets','/timesheets',FileClock],
  ['Safety','/safety',ShieldCheck],
  ['My unit','/fleet',Truck],
] as const

const clientNavigation = [
  ['Portal home','/',Building2],
  ['Jobs','/#client-jobs',BriefcaseBusiness],
  ['Invoices','/#client-invoices',ReceiptText],
  ['Contacts','/#client-contacts',ContactRound],
  ['Company','/#client-company',Building2],
] as const

type Notification = {
  id: string
  recipient_user_id: string
  notification_type: string
  title: string
  message: string | null
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

type Toast = { title: string; message: string; notification?: Notification }
type MenuPanel = 'main' | 'settings'

const fmt = (value: string) => new Intl.DateTimeFormat('en-CA', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value))

export default function GlobalAccountMenu() {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<MenuPanel>('main')
  const [busy, setBusy] = useState(false)
  const [switching, setSwitching] = useState<FunctionalTestPersona | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [roleKey, setRoleKey] = useState('')
  const [installed, setInstalled] = useState(isNorthbornInstalled())
  const [canInstall, setCanInstall] = useState(hasInstallPrompt())
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateMode, setUpdateModeState] = useState<NorthbornUpdateMode>(getPwaUpdateMode())
  const previousIdentity = useRef('')

  const persona = personaFromSession(session)
  const isFunctionalTest = persona !== null
  const userId = session?.user.id || ''
  const effectiveRole = persona === 'client' ? 'client' : persona === 'operator' ? 'operator' : roleKey
  const unreadCount = useMemo(() => notifications.filter(item => !item.read_at).length, [notifications])
  const canTeam = ['owner', 'admin'].includes(effectiveRole)
  const canPricing = ['owner', 'admin', 'accounting'].includes(effectiveRole)
  const isOperator = effectiveRole === 'operator'
  const isClient = effectiveRole === 'client'
  const navigation = isClient ? clientNavigation : isOperator ? operatorNavigation : managerNavigation

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    const loadRole = async () => {
      if (!session?.user.id) { if (active) setRoleKey(''); return }
      if (persona === 'client') { if (active) setRoleKey('client'); return }
      const membership = await db.from('organization_members').select('id').eq('user_id', session.user.id).eq('status', 'active').limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data?.id) { setRoleKey(''); return }
      const roles = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id)
      if (!active) return
      setRoleKey(roles.data?.[0]?.role?.key || '')
    }
    void loadRole()
    return () => { active = false }
  }, [session?.user.id, persona])

  useEffect(() => {
    const syncInstallState = () => {
      setInstalled(isNorthbornInstalled())
      setCanInstall(hasInstallPrompt())
    }
    const onUpdate = () => setUpdateAvailable(true)
    window.addEventListener('northborn-install-available', syncInstallState)
    window.addEventListener('northborn-installed', syncInstallState)
    window.addEventListener('northborn-update-available', onUpdate)
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then(registration => setUpdateAvailable(Boolean(registration?.waiting)))
    }
    return () => {
      window.removeEventListener('northborn-install-available', syncInstallState)
      window.removeEventListener('northborn-installed', syncInstallState)
      window.removeEventListener('northborn-update-available', onUpdate)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadNotifications = async () => {
      if (!userId) { if (active) setNotifications([]); return }
      const result = await db.from('user_notifications')
        .select('id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload,read_at,created_at')
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (active && !result.error) setNotifications((result.data || []) as Notification[])
    }

    if (!userId) {
      setNotifications([])
      previousIdentity.current = ''
      return () => { active = false }
    }

    const changed = previousIdentity.current !== userId
    previousIdentity.current = userId
    void loadNotifications()
    if (changed) {
      const display = persona ? FUNCTIONAL_TEST_USERS[persona].email : session?.user.email || 'your account'
      setToast({ title: 'Signed in', message: `You are signed in as ${display}.` })
    }

    const channel = supabase.channel(`global-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `recipient_user_id=eq.${userId}` }, payload => {
        const row = payload.new as Notification
        setNotifications(current => [row, ...current.filter(item => item.id !== row.id)])
        setToast({ title: row.title, message: row.message || '', notification: row })
      })
      .subscribe()

    return () => { active = false; void supabase.removeChannel(channel) }
  }, [userId, persona, session?.user.email])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6500)
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!session) return null

  const markRead = async (notification: Notification) => {
    if (notification.read_at) return
    const at = new Date().toISOString()
    const result = await db.from('user_notifications').update({ read_at: at }).eq('id', notification.id).eq('recipient_user_id', userId)
    if (!result.error) setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: at } : item))
  }

  const markAllRead = async () => {
    const at = new Date().toISOString()
    const result = await db.from('user_notifications').update({ read_at: at }).eq('recipient_user_id', userId).is('read_at', null)
    if (!result.error) setNotifications(current => current.map(item => item.read_at ? item : { ...item, read_at: at }))
  }

  const clearAll = async () => {
    if (!notifications.length) return
    const result = await db.rpc('clear_my_notifications')
    if (!result.error) { setNotifications([]); setToast(null) }
  }

  const openNotification = async (notification: Notification) => {
    await markRead(notification)
    setOpen(false)
    setPanel('main')
    setToast(null)
    const type = notification.entity_type || ''
    if (type === 'invoice' || notification.notification_type.startsWith('invoice_')) {
      if (effectiveRole === 'client') {
        navigate(`/?invoice=${encodeURIComponent(notification.entity_id || '')}`)
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('northborn-open-invoice', { detail: notification.entity_id })), 80)
      } else navigate('/invoices')
      return
    }
    if (type === 'job_request' || notification.notification_type.includes('job_request')) {
      navigate(effectiveRole === 'client' ? '/' : '/jobs?requests=1')
      return
    }
    if (type === 'job' || notification.notification_type.includes('job_')) {
      navigate(effectiveRole === 'client' ? '/' : '/jobs')
      return
    }
    if (type.includes('ticket') || notification.notification_type.includes('ticket')) { navigate('/tickets'); return }
    if (type.includes('fleet') || notification.notification_type.includes('fleet')) { navigate('/fleet'); return }
    if (type.includes('safety') || notification.notification_type.includes('safety')) { navigate('/safety'); return }
  }

  const switchPersona = async (next: FunctionalTestPersona) => {
    if (next === persona) { setOpen(false); return }
    setSwitching(next)
    try {
      await switchFunctionalTestPersona(next)
      setOpen(false)
      const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      window.location.replace(home)
    } catch (caught) {
      setToast({ title: 'Unable to switch test account', message: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setSwitching(null)
    }
  }

  const signOut = async () => {
    setBusy(true)
    await supabase.auth.signOut()
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    window.location.replace(home)
  }

  const go = (path: string) => {
    setOpen(false)
    setPanel('main')
    navigate(path)
    const hash = path.includes('#') ? path.slice(path.indexOf('#') + 1) : ''
    if (hash) window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
  }

  const installApp = async () => {
    const result = await promptNorthbornInstall()
    setCanInstall(hasInstallPrompt())
    setInstalled(isNorthbornInstalled())
    if (result === 'dismissed') setToast({ title: 'Install cancelled', message: 'You can install Northborn later from Settings.' })
    if (result === 'unavailable') setToast({ title: 'Install from your browser', message: 'Use your browser menu and choose Install app or Add to Home Screen.' })
  }

  const changeUpdateMode = (mode: NorthbornUpdateMode) => {
    setPwaUpdateMode(mode)
    setUpdateModeState(mode)
    setToast({ title: mode === 'auto' ? 'Automatic updates on' : 'Update notifications on', message: mode === 'auto' ? 'Northborn will apply new versions automatically.' : 'Northborn will tell you when a new version is ready.' })
  }

  const isNavigationActive = (path: string) => {
    const [pathname, hash] = path.split('#')
    if (hash) return location.pathname === pathname && location.hash === `#${hash}`
    return location.pathname === path && !location.hash
  }

  return <div className="northborn-account-menu">
    {toast && <div className="northborn-notification-toast">
      <button type="button" className="northborn-toast-main" onClick={() => toast.notification ? void openNotification(toast.notification) : setOpen(true)}>
        <BellRing size={19}/><span><strong>{toast.title}</strong>{toast.message && <small>{toast.message}</small>}</span>
      </button>
      <button type="button" className="northborn-toast-close" aria-label="Dismiss notification" onClick={event => { event.stopPropagation(); setToast(null) }}><X size={18}/></button>
    </div>}

    {open && <button className="northborn-account-scrim" type="button" aria-label="Close menu" onClick={() => { setOpen(false); setPanel('main') }}/>} 
    {open && <div className="northborn-account-popover" role="dialog" aria-label="Northborn menu">
      {panel === 'settings' ? <>
        <div className="northborn-settings-heading">
          <button type="button" aria-label="Back to menu" onClick={() => setPanel('main')}><ChevronLeft size={20}/></button>
          <div><strong>Settings</strong><span>App, updates and version</span></div>
        </div>

        <div className="northborn-account-section-title">Install Northborn</div>
        <div className="northborn-pwa-card">
          <div className="northborn-pwa-card-copy"><Smartphone size={19}/><span><strong>{installed ? 'App installed' : 'Installable web app'}</strong><small>{installed ? 'Northborn is running as an installed app on this device.' : 'Add Northborn to your home screen or desktop for app style access.'}</small></span></div>
          {!installed && <button type="button" className="northborn-settings-action" onClick={() => void installApp()}><Download size={16}/>{canInstall ? 'Install Northborn' : 'How to install'}</button>}
        </div>

        <div className="northborn-account-section-title">Updates</div>
        <div className="northborn-update-mode">
          <button type="button" className={updateMode === 'auto' ? 'active' : ''} onClick={() => changeUpdateMode('auto')}><strong>Automatic</strong><small>Apply new versions when they are ready.</small></button>
          <button type="button" className={updateMode === 'notify' ? 'active' : ''} onClick={() => changeUpdateMode('notify')}><strong>Notify me</strong><small>Tell me first, then I choose when to update.</small></button>
        </div>
        {updateAvailable ? <button type="button" className="northborn-update-ready" onClick={() => applyNorthbornUpdate()}><RefreshCw size={16}/>Update Northborn now</button> : <button type="button" className="northborn-settings-check" onClick={() => { checkForNorthbornUpdate(); setToast({ title: 'Checking for updates', message: 'Northborn is checking for a newer version.' }) }}><RefreshCw size={16}/>Check for updates</button>}

        <div className="northborn-account-section-title">About</div>
        <div className="northborn-version-card"><div className="northborn-version-logo">N</div><div><strong>Northborn</strong><span>Version {APP_VERSION}</span></div></div>
      </> : <>
        <div className="northborn-account-heading"><UserRound size={18}/><div><strong>{isFunctionalTest ? 'Test account' : 'Northborn account'}</strong><span>{persona ? FUNCTIONAL_TEST_USERS[persona].email : session.user.email}</span></div></div>

        <div className="northborn-account-section-title">Navigation</div>
        <div className="northborn-menu-links northborn-navigation-links">
          {navigation.map(([name,path,Icon]) => <button type="button" key={path} className={isNavigationActive(path)?'active':''} onClick={()=>go(path)}><Icon size={18}/><span><strong>{name}</strong></span></button>)}
        </div>

        <button className="northborn-settings-entry" type="button" onClick={() => setPanel('settings')}><Settings size={18}/><span><strong>Settings</strong><small>Install app, updates and version {APP_VERSION}</small></span></button>

        <div className="northborn-account-section-title northborn-notification-title">
          <span>Notifications {unreadCount > 0 && <b>{unreadCount}</b>}</span>
          <div>{unreadCount > 0 && <button type="button" onClick={() => void markAllRead()}><Check size={14}/>Read</button>}{notifications.length > 0 && <button type="button" className="clear" onClick={() => void clearAll()}><Trash2 size={14}/>Clear</button>}</div>
        </div>
        <div className="northborn-notification-list">
          {notifications.slice(0, 12).map(item => <button type="button" key={item.id} className={item.read_at ? 'read' : ''} onClick={() => void openNotification(item)}><BellRing size={16}/><span><strong>{item.title}</strong>{item.message && <small>{item.message}</small>}<em>{fmt(item.created_at)}</em></span>{!item.read_at && <i/>}</button>)}
          {!notifications.length && <div className="northborn-notification-empty">No notifications yet.</div>}
        </div>

        {(canTeam || canPricing) && <><div className="northborn-account-section-title">Quick access</div><div className="northborn-menu-links">
          {canTeam && <button type="button" onClick={() => go('/team-access')}><Users size={18}/><span><strong>Team access</strong><small>Invite and manage staff</small></span></button>}
          {canPricing && <button type="button" onClick={() => go('/pricing')}><CircleDollarSign size={18}/><span><strong>Price sheet</strong><small>Standard and client rates</small></span></button>}
        </div></>}

        {isFunctionalTest && <><div className="northborn-account-section-title">Switch test account</div><div className="northborn-test-account-list">
          {personas.map(([key, email, Icon]) => <button key={key} type="button" disabled={Boolean(switching)} className={persona === key ? 'active' : ''} onClick={() => void switchPersona(key)}><Icon size={18}/><div><strong>{FUNCTIONAL_TEST_USERS[key].label}</strong><span>{email}</span></div>{persona === key ? <em>Active</em> : switching === key ? <em>Opening…</em> : null}</button>)}
        </div></>}

        <div className="northborn-menu-version">Northborn v{APP_VERSION}</div>
        <button className="northborn-account-signout" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={17}/>{busy ? 'Signing out…' : 'Sign out'}</button>
      </>}
    </div>}

    <button className="northborn-account-trigger" type="button" onClick={() => { setOpen(value => !value); if (open) setPanel('main') }} aria-expanded={open} aria-label={open ? 'Close Northborn menu' : 'Open Northborn menu'}>{open ? <X size={22}/> : <Menu size={23}/>} {unreadCount > 0 && <span className="northborn-account-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
  </div>
}