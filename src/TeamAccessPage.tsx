import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, Check, Copy, Link2, Mail, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-access.css'

const db = supabase as any

const TEAM_ROLES = [
  { key: 'admin', label: 'Administrator' },
  { key: 'dispatcher', label: 'Dispatcher' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'operator', label: 'Operator' },
  { key: 'mechanic', label: 'Mechanic' },
  { key: 'safety', label: 'Safety' },
  { key: 'accounting', label: 'Accounting' },
]

type Workspace = {
  organizationId: string
  organizationName: string
  membershipId: string
  roleKey: string
}

type Member = {
  id: string
  userId: string
  status: string
  joinedAt: string
  name: string
  roleName: string
  roleKey: string
}

type Invite = {
  id: string
  email: string
  status: string
  expiresAt: string
  createdAt: string
  roleName: string
  roleKey: string
}

function readError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Something went wrong')
  }
  return String(error || 'Something went wrong')
}

async function loadWorkspace(userId: string): Promise<Workspace | null> {
  const { data: membership, error } = await db
    .from('organization_members')
    .select('id,organization_id,organization:organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!membership) return null

  const { data: roleRows, error: roleError } = await db
    .from('membership_roles')
    .select('role:roles(key,name)')
    .eq('membership_id', membership.id)

  if (roleError) throw roleError
  const role = roleRows?.[0]?.role

  return {
    organizationId: membership.organization_id,
    organizationName: membership.organization?.name || 'Northborn company',
    membershipId: membership.id,
    roleKey: role?.key || 'operator',
  }
}

export default function TeamAccessPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [email, setEmail] = useState('')
  const [roleKey, setRoleKey] = useState('operator')
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  const canManage = Boolean(workspace && ['owner', 'admin'].includes(workspace.roleKey))

  const refresh = useCallback(async (activeWorkspace: Workspace) => {
    const orgId = activeWorkspace.organizationId

    const { data: memberRows, error: membersError } = await db
      .from('organization_members')
      .select('id,user_id,status,joined_at')
      .eq('organization_id', orgId)
      .order('joined_at', { ascending: true })

    if (membersError) throw membersError

    const rows = memberRows || []
    const userIds = rows.map((row: any) => row.user_id)
    const membershipIds = rows.map((row: any) => row.id)

    const [profilesResult, rolesResult, invitesResult] = await Promise.all([
      userIds.length
        ? db.from('profiles').select('user_id,display_name,first_name,last_name').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      membershipIds.length
        ? db.from('membership_roles').select('membership_id,role:roles(key,name)').in('membership_id', membershipIds)
        : Promise.resolve({ data: [], error: null }),
      db
        .from('organization_invites')
        .select('id,email,status,expires_at,created_at,role:roles(key,name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
    ])

    const nestedError = profilesResult.error || rolesResult.error || invitesResult.error
    if (nestedError) throw nestedError

    const profileMap = new Map((profilesResult.data || []).map((profile: any) => [profile.user_id, profile]))
    const roleMap = new Map((rolesResult.data || []).map((row: any) => [row.membership_id, row.role]))

    setMembers(rows.map((row: any) => {
      const profile: any = profileMap.get(row.user_id)
      const role: any = roleMap.get(row.id)
      const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

      return {
        id: row.id,
        userId: row.user_id,
        status: row.status,
        joinedAt: row.joined_at,
        name: fullName || profile?.display_name || 'Northborn user',
        roleName: role?.name || 'Member',
        roleKey: role?.key || 'member',
      }
    }))

    setInvites((invitesResult.data || []).map((row: any) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      roleName: row.role?.name || 'Member',
      roleKey: row.role?.key || 'member',
    })))
  }, [])

  useEffect(() => {
    let active = true

    const start = async () => {
      setLoading(true)
      setError('')

      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!active) return

        const currentSession = data.session
        setSession(currentSession)

        if (!currentSession) return

        const resolved = await loadWorkspace(currentSession.user.id)
        if (!active) return

        setWorkspace(resolved)

        if (resolved && ['owner', 'admin'].includes(resolved.roleKey)) {
          await refresh(resolved)
        }
      } catch (err) {
        if (active) setError(readError(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void start()
    return () => { active = false }
  }, [refresh])

  const pendingInvites = useMemo(
    () => invites.filter(invite => invite.status === 'pending' && new Date(invite.expiresAt).getTime() > Date.now()),
    [invites],
  )

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspace) return

    setBusy(true)
    setError('')
    setDeliveryMessage('')
    setInviteLink('')
    setCopied(false)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const selectedRole = TEAM_ROLES.find(role => role.key === roleKey)
      const { data, error: functionError } = await supabase.functions.invoke('send-team-invite', {
        body: {
          organizationId: workspace.organizationId,
          organizationName: workspace.organizationName,
          email: normalizedEmail,
          roleKey,
          roleName: selectedRole?.label || roleKey,
        },
      })

      if (functionError) throw functionError
      if (!data?.ok) throw new Error(data?.error || 'Northborn could not create the invitation.')
      if (!data?.inviteLink) throw new Error('Northborn created the invite but did not return a link.')

      setInviteLink(String(data.inviteLink))
      setDeliveryMessage(
        data.emailSent
          ? `Invitation email sent to ${normalizedEmail}.`
          : `Invitation created, but the email could not be sent yet: ${data.deliveryError || 'email delivery is not configured'}. You can still copy the invite link below.`,
      )
      setEmail('')
      await refresh(workspace)
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const copyInvite = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const revokeInvite = async (inviteId: string) => {
    if (!workspace) return

    setBusy(true)
    setError('')

    try {
      const { error: rpcError } = await db.rpc('revoke_organization_invite', { _invite_id: inviteId })
      if (rpcError) throw rpcError
      await refresh(workspace)
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="team-page team-center">Loading team access…</div>

  if (!session) {
    return <div className="team-page team-center"><div className="team-card compact-card"><ShieldCheck size={36}/><h1>Sign in required</h1><p>Sign in to Northborn before managing company access.</p><a className="team-primary" href="/">Go to sign in</a></div></div>
  }

  if (!workspace) {
    return <div className="team-page team-center"><div className="team-card compact-card"><h1>No company found</h1><p>This account is not attached to a Northborn company yet.</p><a className="team-primary" href="/">Return to Northborn</a></div></div>
  }

  if (!canManage) {
    return <div className="team-page team-center"><div className="team-card compact-card"><ShieldCheck size={36}/><h1>Owner or admin access required</h1><p>Your current role is {workspace.roleKey}.</p><a className="team-primary" href="/">Return to Northborn</a></div></div>
  }

  return <div className="team-page">
    <div className="team-wrap">
      <div className="team-topbar"><a href="/" className="team-back"><ArrowLeft size={18}/>Northborn</a><span>{workspace.organizationName}</span></div>

      <div className="team-hero">
        <div><div className="team-eyebrow">COMPANY ACCESS</div><h1>Team access</h1><p>Invite your crew and control what each person can access in Northborn.</p></div>
        <div className="team-count"><Users size={24}/><strong>{members.length}</strong><span>active member{members.length === 1 ? '' : 's'}</span></div>
      </div>

      {error && <div className="team-error">{error}</div>}
      {deliveryMessage && <div className="team-message"><Mail size={18}/>{deliveryMessage}</div>}

      <div className="team-grid">
        <section className="team-card">
          <div className="team-section-heading"><div><span className="team-eyebrow">INVITE</span><h2>Add a team member</h2></div><UserPlus size={24}/></div>
          <form onSubmit={createInvite} className="team-form">
            <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.ca" required/></label>
            <label>Northborn role<select value={roleKey} onChange={event => setRoleKey(event.target.value)}>{TEAM_ROLES.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label>
            <button className="team-primary" disabled={busy}>{busy ? 'Sending invite…' : 'Send invite'}</button>
          </form>
          <p className="team-help">Northborn will email the invitation when email delivery is configured. The secure invite link remains available as a fallback and expires after 7 days.</p>
          {inviteLink && <div className="invite-result"><div><Link2 size={18}/><span>{inviteLink}</span></div><button onClick={copyInvite}>{copied ? <><Check size={17}/>Copied</> : <><Copy size={17}/>Copy link</>}</button></div>}
        </section>

        <section className="team-card">
          <div className="team-section-heading"><div><span className="team-eyebrow">PEOPLE</span><h2>Current members</h2></div></div>
          <div className="team-list">
            {members.map(member => <div className="member-row" key={member.id}><div className="member-avatar">{member.name.slice(0,1).toUpperCase()}</div><div className="member-main"><strong>{member.name}{member.userId === session.user.id ? ' (you)' : ''}</strong><span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span></div><span className={`role-pill role-${member.roleKey}`}>{member.roleName}</span></div>)}
          </div>
        </section>
      </div>

      <section className="team-card team-pending">
        <div className="team-section-heading"><div><span className="team-eyebrow">PENDING</span><h2>Open invitations</h2></div><span>{pendingInvites.length} active</span></div>
        {pendingInvites.length
          ? <div className="team-list">{pendingInvites.map(invite => <div className="invite-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.roleName} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div><button className="team-danger" disabled={busy} onClick={() => void revokeInvite(invite.id)}><X size={16}/>Revoke</button></div>)}</div>
          : <div className="team-empty">No open invitations.</div>}
      </section>
    </div>
  </div>
}
