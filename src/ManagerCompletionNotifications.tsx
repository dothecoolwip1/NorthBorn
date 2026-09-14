import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './manager-completion-notifications.css'

const db = supabase as any
const TYPES=['job_completed','fleet_defect_reported']

type CompletionNotification = {
  id: string
  notification_type: string
  title: string
  message: string | null
  entity_id: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

function formatWhen(value: string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export default function ManagerCompletionNotifications({ userId, organizationId }: { userId: string; organizationId: string }) {
  const [notifications, setNotifications] = useState<CompletionNotification[]>([])
  const [visibleId, setVisibleId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await db
      .from('user_notifications')
      .select('id,notification_type,title,message,entity_id,payload,read_at,created_at')
      .eq('recipient_user_id', userId)
      .eq('organization_id', organizationId)
      .in('notification_type', TYPES)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(30)

    if (result.error) {
      console.error('Unable to load manager notifications', result.error)
      return
    }

    const rows = (result.data || []) as CompletionNotification[]
    setNotifications(rows)
    if (rows.length && !visibleId) setVisibleId(rows[0].id)
  }, [organizationId, userId, visibleId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`manager-notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_user_id=eq.${userId}`,
      }, payload => {
        const row = payload.new as CompletionNotification
        if (!TYPES.includes(row.notification_type)) return
        setNotifications(current => [row, ...current.filter(item => item.id !== row.id)])
        setVisibleId(row.id)
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [userId])

  const current = useMemo(
    () => notifications.find(item => item.id === visibleId) || notifications[0] || null,
    [notifications, visibleId],
  )

  const markRead = async (id: string) => {
    await db.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_user_id', userId)
    setNotifications(items => items.filter(item => item.id !== id))
    setVisibleId(null)
  }

  const openCurrent = async () => {
    if (!current) return
    await markRead(current.id)
    window.location.href = current.notification_type === 'fleet_defect_reported' ? '/maintenance?view=defects' : '/jobs?view=completed'
  }

  if (!current && !notifications.length) return null
  const defect=current?.notification_type==='fleet_defect_reported'

  return (
    <div className="completion-notification-wrap" aria-live="polite">
      {current && <div className="completion-notification-card">
        <div className="completion-notification-icon">{defect?<AlertTriangle size={22}/>:<CheckCircle2 size={22}/>}</div>
        <div className="completion-notification-copy">
          <span className="completion-notification-eyebrow">{defect?'FLEET DEFECT':'JOB COMPLETE'}</span>
          <strong>{current.title}</strong>
          <p>{current.message || (defect?'A fleet defect was reported.':'A job was marked complete.')}</p>
          <small>{formatWhen(current.created_at)}</small>
          <button type="button" onClick={() => void openCurrent()}>{defect?'View defects':'View completed jobs'} <ChevronRight size={15}/></button>
        </div>
        <button className="completion-notification-close" type="button" aria-label="Dismiss notification" onClick={() => void markRead(current.id)}><X size={17}/></button>
      </div>}
      {notifications.length > 1 && <button type="button" className="completion-notification-count" onClick={() => setVisibleId(notifications[1]?.id||notifications[0]?.id||null)}>{notifications.length} notifications waiting for review</button>}
    </div>
  )
}
