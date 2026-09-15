import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BellRing, Building2, Check, HardHat, LogOut, Menu, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { clearTestLab, getTestPersona, isTestMode, setTestPersona, TEST_USERS, type TestPersona } from './test-lab'
import './global-account-menu.css'

const db = supabase as any
const TEST_NOTIFICATION_KEY = 'northborn_test_table_v1_user_notifications'

const personas = [
  ['manager', TEST_USERS.manager.email, ShieldCheck],
  ['operator', TEST_USERS.operator.email, HardHat],
  ['client', TEST_USERS.client.email, Building2],
] as const

type Notification = {
  id:string
  recipient_user_id:string
  notification_type:string
  title:string
  message:string|null
  entity_type:string|null
  entity_id:string|null
  payload:Record<string,unknown>|null
  read_at:string|null
  created_at:string
}

const fmt = (value:string) => new Intl.DateTimeFormat('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))

function readTestNotifications(userId:string):Notification[]{
  try {
    const rows=JSON.parse(localStorage.getItem(TEST_NOTIFICATION_KEY)||'[]') as Notification[]
    return rows.filter(row=>row.recipient_user_id===userId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
  } catch { return [] }
}

function writeTestNotifications(rows:Notification[]){
  localStorage.setItem(TEST_NOTIFICATION_KEY,JSON.stringify(rows))
  window.dispatchEvent(new Event('northborn-test-notifications-changed'))
}

export default function GlobalAccountMenu() {
  const [session, setSession] = useState<Session | null>(null)
  const [testMode, setTestMode] = useState(() => isTestMode())
  const [persona, setPersonaState] = useState<TestPersona>(() => getTestPersona())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [toast,setToast]=useState<{title:string;message:string}|null>(null)
  const previousIdentity=useRef('')

  const activeUser = TEST_USERS[persona]
  const userId = testMode ? activeUser.id : session?.user.id || ''
  const identity = testMode ? `test:${persona}` : session?.user.id ? `real:${session.user.id}` : ''
  const unreadCount=useMemo(()=>notifications.filter(item=>!item.read_at).length,[notifications])

  const loadNotifications=async(showLatest=false)=>{
    if(!userId){setNotifications([]);return}
    if(testMode){
      const rows=readTestNotifications(userId)
      setNotifications(rows)
      const latest=rows.find(row=>!row.read_at)
      if(showLatest&&latest)setToast({title:latest.title,message:latest.message||''})
      return
    }
    const result=await db.from('user_notifications').select('id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload,read_at,created_at').eq('recipient_user_id',userId).order('created_at',{ascending:false}).limit(30)
    if(!result.error){
      const rows=(result.data||[]) as Notification[]
      setNotifications(rows)
      const latest=rows.find(row=>!row.read_at)
      if(showLatest&&latest)setToast({title:latest.title,message:latest.message||''})
    }
  }

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

  useEffect(()=>{
    if(!identity)return
    const changed=previousIdentity.current!==identity
    previousIdentity.current=identity
    void loadNotifications(changed)
    if(changed){
      const name=testMode?activeUser.email:session?.user.email||'your account'
      window.setTimeout(()=>setToast(current=>current||{title:'Signed in',message:`You are signed in as ${name}.`}),150)
    }
  },[identity])

  useEffect(()=>{
    if(!userId)return
    const refresh=()=>void loadNotifications(false)
    window.addEventListener('northborn-test-notifications-changed',refresh)
    window.addEventListener('northborn-test-data-changed',refresh)
    if(testMode)return()=>{window.removeEventListener('northborn-test-notifications-changed',refresh);window.removeEventListener('northborn-test-data-changed',refresh)}
    const channel=supabase.channel(`global-notifications-${userId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'user_notifications',filter:`recipient_user_id=eq.${userId}`},payload=>{
      const row=payload.new as Notification
      setNotifications(current=>[row,...current.filter(item=>item.id!==row.id)])
      setToast({title:row.title,message:row.message||''})
    }).subscribe()
    return()=>{window.removeEventListener('northborn-test-notifications-changed',refresh);window.removeEventListener('northborn-test-data-changed',refresh);void supabase.removeChannel(channel)}
  },[userId,testMode])

  useEffect(()=>{
    if(!toast)return
    const timer=window.setTimeout(()=>setToast(null),5500)
    return()=>window.clearTimeout(timer)
  },[toast])

  if (!session && !testMode) return null

  const markRead = async (notification:Notification) => {
    if(notification.read_at)return
    const readAt=new Date().toISOString()
    if(testMode){
      try{
        const rows=JSON.parse(localStorage.getItem(TEST_NOTIFICATION_KEY)||'[]') as Notification[]
        writeTestNotifications(rows.map(row=>row.id===notification.id?{...row,read_at:readAt}:row))
      }catch{}
    }else{
      await db.from('user_notifications').update({read_at:readAt}).eq('id',notification.id).eq('recipient_user_id',userId)
    }
    setNotifications(current=>current.map(row=>row.id===notification.id?{...row,read_at:readAt}:row))
  }

  const markAllRead=async()=>{
    const unread=notifications.filter(item=>!item.read_at)
    for(const item of unread)await markRead(item)
  }

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

  return <div className="northborn-account-menu">
    {toast&&<button type="button" className="northborn-notification-toast" onClick={()=>{setOpen(true);setToast(null)}}><BellRing size={19}/><span><strong>{toast.title}</strong>{toast.message&&<small>{toast.message}</small>}</span><X size={16}/></button>}
    {open && <button className="northborn-account-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />}
    {open && <div className="northborn-account-popover" role="dialog" aria-label="Northborn menu">
      <div className="northborn-account-heading">
        <UserRound size={18}/>
        <div>
          <strong>{testMode ? 'Test account' : 'Northborn account'}</strong>
          <span>{testMode ? activeUser.email : session?.user.email}</span>
        </div>
      </div>

      <div className="northborn-account-section-title northborn-notification-title"><span>Notifications {unreadCount>0&&<b>{unreadCount}</b>}</span>{unreadCount>0&&<button type="button" onClick={()=>void markAllRead()}><Check size={14}/>Mark read</button>}</div>
      <div className="northborn-notification-list">
        {notifications.slice(0,8).map(item=><button type="button" key={item.id} className={item.read_at?'read':''} onClick={()=>void markRead(item)}><BellRing size={16}/><span><strong>{item.title}</strong>{item.message&&<small>{item.message}</small>}<em>{fmt(item.created_at)}</em></span>{!item.read_at&&<i/>}</button>)}
        {!notifications.length&&<div className="northborn-notification-empty">No notifications yet.</div>}
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
      {open ? <X size={22}/> : <Menu size={23}/>} {unreadCount>0&&<span className="northborn-account-badge">{unreadCount>9?'9+':unreadCount}</span>}
    </button>
  </div>
}
