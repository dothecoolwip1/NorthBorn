import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import { BellRing, Building2, Check, CircleDollarSign, HardHat, LogOut, Menu, ShieldCheck, Trash2, Truck, UserRound, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { FUNCTIONAL_TEST_USERS, personaFromSession, switchFunctionalTestPersona, type FunctionalTestPersona } from './functional-test-auth'
import './global-account-menu.css'

const db = supabase as any
const personas = [
  ['manager', FUNCTIONAL_TEST_USERS.manager.email, ShieldCheck],
  ['operator', FUNCTIONAL_TEST_USERS.operator.email, HardHat],
  ['client', FUNCTIONAL_TEST_USERS.client.email, Building2],
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

const fmt = (value: string) => new Intl.DateTimeFormat('en-CA', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value))

export default function GlobalAccountMenu() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [switching, setSwitching] = useState<FunctionalTestPersona | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [roleKey, setRoleKey] = useState('')
  const previousIdentity = useRef('')

  const persona = personaFromSession(session)
  const isFunctionalTest = persona !== null
  const userId = session?.user.id || ''
  const effectiveRole = persona === 'client' ? 'client' : roleKey
  const unreadCount = useMemo(() => notifications.filter(item => !item.read_at).length, [notifications])
  const canTeam = ['owner', 'admin'].includes(effectiveRole)
  const canPricing = ['owner', 'admin', 'accounting'].includes(effectiveRole)
  const isOperator = effectiveRole === 'operator'

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

  const go = (path: string) => { setOpen(false); navigate(path) }

  return <div className="northborn-account-menu">
    {toast && <div className="northborn-notification-toast">
      <button type="button" className="northborn-toast-main" onClick={() => toast.notification ? void openNotification(toast.notification) : setOpen(true)}>
        <BellRing size={19}/><span><strong>{toast.title}</strong>{toast.message && <small>{toast.message}</small>}</span>
      </button>
      <button type="button" className="northborn-toast-close" aria-label="Dismiss notification" onClick={event => { event.stopPropagation(); setToast(null) }}><X size={18}/></button>
    </div>}

    {open && <button className="northborn-account-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)}/>} 
    {open && <div className="northborn-account-popover" role="dialog" aria-label="Northborn menu">
      <div className="northborn-account-heading"><UserRound size={18}/><div><strong>{isFunctionalTest ? 'Test account' : 'Northborn account'}</strong><span>{persona ? FUNCTIONAL_TEST_USERS[persona].email : session.user.email}</span></div></div>

      <div className="northborn-account-section-title northborn-notification-title">
        <span>Notifications {unreadCount > 0 && <b>{unreadCount}</b>}</span>
        <div>{unreadCount > 0 && <button type="button" onClick={() => void markAllRead()}><Check size={14}/>Read</button>}{notifications.length > 0 && <button type="button" className="clear" onClick={() => void clearAll()}><Trash2 size={14}/>Clear</button>}</div>
      </div>
      <div className="northborn-notification-list">
        {notifications.slice(0, 12).map(item => <button type="button" key={item.id} className={item.read_at ? 'read' : ''} onClick={() => void openNotification(item)}><BellRing size={16}/><span><strong>{item.title}</strong>{item.message && <small>{item.message}</small>}<em>{fmt(item.created_at)}</em></span>{!item.read_at && <i/>}</button>)}
        {!notifications.length && <div className="northborn-notification-empty">No notifications yet.</div>}
      </div>

      {(canTeam || canPricing || isOperator) && <><div className="northborn-account-section-title">Quick access</div><div className="northborn-menu-links">
        {canTeam && <button type="button" onClick={() => go('/team-access')}><Users size={18}/><span><strong>Team access</strong><small>Invite and manage staff</small></span></button>}
        {canPricing && <button type="button" onClick={() => go('/pricing')}><CircleDollarSign size={18}/><span><strong>Price sheet</strong><small>Standard and client rates</small></span></button>}
        {isOperator && <button type="button" onClick={() => go('/fleet')}><Truck size={18}/><span><strong>My unit</strong><small>Assigned fleet information</small></span></button>}
      </div></>}

      {isFunctionalTest && <><div className="northborn-account-section-title">Switch test account</div><div className="northborn-test-account-list">
        {personas.map(([key, email, Icon]) => <button key={key} type="button" disabled={Boolean(switching)} className={persona === key ? 'active' : ''} onClick={() => void switchPersona(key)}><Icon size={18}/><div><strong>{FUNCTIONAL_TEST_USERS[key].label}</strong><span>{email}</span></div>{persona === key ? <em>Active</em> : switching === key ? <em>Opening…</em> : null}</button>)}
      </div></>}

      <button className="northborn-account-signout" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={17}/>{busy ? 'Signing out…' : 'Sign out'}</button>
    </div>}

    <button className="northborn-account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? 'Close Northborn menu' : 'Open Northborn menu'}>{open ? <X size={22}/> : <Menu size={23}/>} {unreadCount > 0 && <span className="northborn-account-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
  </div>
}
