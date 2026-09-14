import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, Check, Copy, Link2, LogOut, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-access.css'

const db = supabase as any
const PRODUCTION_URL = 'https://northborn.vercel.app'
const TEAM_ROLES = [
  { key: 'admin', label: 'Administrator' },
  { key: 'dispatcher', label: 'Dispatcher' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'operator', label: 'Operator' },
  { key: 'mechanic', label: 'Mechanic' },
  { key: 'safety', label: 'Safety' },
  { key: 'accounting', label: 'Accounting' },
]

type Workspace = { organizationId: string; organizationName: string; membershipId: string; roleKey: string }
type Member = { id: string; userId: string; status: string; joinedAt: string; name: string; roleName: string; roleKey: string }
type Invite = { id: string; email: string; status: string; expiresAt: string; createdAt: string; roleName: string; roleKey: string }
type InviteDetails = { organization_name: string; role_name: string; invite_status: string; invite_expires_at: string }

function readError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Something went wrong')
  return String(error || 'Something went wrong')
}

function authRedirect(path: string) {
  const base = window.location.hostname.endsWith('vercel.app') ? PRODUCTION_URL : window.location.origin
  return `${base}${path}`
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

export function TeamAccessLauncher() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let active = true
    const resolve = async () => {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) return active && setShow(false)
      try {
        const workspace = await loadWorkspace(userId)
        if (active) setShow(Boolean(workspace && ['owner', 'admin'].includes(workspace.roleKey)))
      } catch {
        if (active) setShow(false)
      }
    }
    void resolve()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void resolve())
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  if (!show) return null
  return <a className="team-access-launcher" href="/team-access"><Users size={18}/>Team access</a>
}

export default function TeamAccessPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [roleKey, setRoleKey] = useState('operator')
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  const canManage = Boolean(workspace && ['owner', 'admin'].includes(workspace.roleKey))

  const refresh = useCallback(async (resolvedWorkspace?: Workspace | null) => {
    const activeWorkspace = resolvedWorkspace ?? workspace
    if (!activeWorkspace) return
    const orgId = activeWorkspace.organizationId
    const { data: memberRows, error: membersError } = await db
      .from('organization_members')
      .select('id,user_id,status,joined_at')
      .eq('organization_id', orgId)
      .order('joined_at', { ascending: true })
    if (membersError) throw membersError

    const userIds = (memberRows || []).map((row: any) => row.user_id)
    const membershipIds = (memberRows || []).map((row: any) => row.id)
    const [profilesResult, rolesResult, invitesResult] = await Promise.all([
      userIds.length ? db.from('profiles').select('user_id,display_name,first_name,last_name').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
      membershipIds.length ? db.from('membership_roles').select('membership_id,role:roles(key,name)').in('membership_id', membershipIds) : Promise.resolve({ data: [], error: null }),
      db.from('organization_invites').select('id,email,status,expires_at,created_at,role:roles(key,name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ])
    const nestedError = profilesResult.error || rolesResult.error || invitesResult.error
    if (nestedError) throw nestedError

    const profileMap = new Map((profilesResult.data || []).map((profile: any) => [profile.user_id, profile]))
    const roleMap = new Map((rolesResult.data || []).map((row: any) => [row.membership_id, row.role]))
    setMembers((memberRows || []).map((row: any) => {
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
  }, [workspace])

  useEffect(() => {
    let active = true
    const start = async () => {
      setLoading(true)
      try {
        const { data } = await supabase.auth.getSession()
        if (!active) return
        setSession(data.session)
        if (!data.session) return
        const resolved = await loadWorkspace(data.session.user.id)
        if (!active) return
        setWorkspace(resolved)
        if (resolved && ['owner', 'admin'].includes(resolved.roleKey)) await refresh(resolved)
      } catch (err) {
        if (active) setError(readError(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    void start()
    return () => { active = false }
  }, [refresh])

  const pendingInvites = useMemo(() => invites.filter(invite => invite.status === 'pending' && new Date(invite.expiresAt).getTime() > Date.now()), [invites])

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspace) return
    setBusy(true); setError(''); setInviteLink(''); setCopied(false)
    try {
      const { data, error: rpcError } = await db.rpc('create_organization_invite', {
        _organization_id: workspace.organizationId,
        _email: email.trim().toLowerCase(),
        _role_key: roleKey,
      })
      if (rpcError) throw rpcError
      const row = data?.[0]
      if (!row?.invite_token) throw new Error('Northborn created the invite but did not return a link.')
      const link = `${window.location.origin}/join?invite=${row.invite_token}`
      setInviteLink(link)
      setEmail('')
      await refresh(workspace)
    } catch (err) { setError(readError(err)) }
    finally { setBusy(false) }
  }

  const copyInvite = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const revokeInvite = async (inviteId: string) => {
    if (!workspace) return
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await db.rpc('revoke_organization_invite', { _invite_id: inviteId })
      if (rpcError) throw rpcError
      await refresh(workspace)
    } catch (err) { setError(readError(err)) }
    finally { setBusy(false) }
  }

  if (loading) return <div className="team-page team-center">Loading team access…</div>
  if (!session) return <div className="team-page team-center"><div className="team-card compact-card"><ShieldCheck size={36}/><h1>Sign in required</h1><p>Sign in to Northborn before managing company access.</p><a className="team-primary" href="/">Go to sign in</a></div></div>
  if (!workspace) return <div className="team-page team-center"><div className="team-card compact-card"><h1>No company found</h1><p>This account is not attached to a Northborn company yet.</p><a className="team-primary" href="/">Return to Northborn</a></div></div>
  if (!canManage) return <div className="team-page team-center"><div className="team-card compact-card"><ShieldCheck size={36}/><h1>Owner or admin access required</h1><p>Your current role is {workspace.roleKey}.</p><a className="team-primary" href="/">Return to Northborn</a></div></div>

  return <div className="team-page">
    <div className="team-wrap">
      <div className="team-topbar"><a href="/" className="team-back"><ArrowLeft size={18}/>Northborn</a><span>{workspace.organizationName}</span></div>
      <div className="team-hero"><div><div className="team-eyebrow">COMPANY ACCESS</div><h1>Team access</h1><p>Invite your crew and control what each person can access in Northborn.</p></div><div className="team-count"><Users size={24}/><strong>{members.length}</strong><span>active member{members.length === 1 ? '' : 's'}</span></div></div>

      {error && <div className="team-error">{error}</div>}

      <div className="team-grid">
        <section className="team-card">
          <div className="team-section-heading"><div><span className="team-eyebrow">INVITE</span><h2>Add a team member</h2></div><UserPlus size={24}/></div>
          <form onSubmit={createInvite} className="team-form">
            <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="operator@company.ca" required/></label>
            <label>Northborn role<select value={roleKey} onChange={event => setRoleKey(event.target.value)}>{TEAM_ROLES.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label>
            <button className="team-primary" disabled={busy}>{busy ? 'Creating invite…' : 'Create invite link'}</button>
          </form>
          <p className="team-help">Invite links expire after 7 days and only work for the email address entered above.</p>
          {inviteLink && <div className="invite-result"><div><Link2 size={18}/><span>{inviteLink}</span></div><button onClick={copyInvite}>{copied ? <><Check size={17}/>Copied</> : <><Copy size={17}/>Copy link</>}</button></div>}
        </section>

        <section className="team-card">
          <div className="team-section-heading"><div><span className="team-eyebrow">PEOPLE</span><h2>Current members</h2></div></div>
          <div className="team-list">{members.map(member => <div className="member-row" key={member.id}><div className="member-avatar">{member.name.slice(0,1).toUpperCase()}</div><div className="member-main"><strong>{member.name}{member.userId === session.user.id ? ' (you)' : ''}</strong><span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span></div><span className={`role-pill role-${member.roleKey}`}>{member.roleName}</span></div>)}</div>
        </section>
      </div>

      <section className="team-card team-pending">
        <div className="team-section-heading"><div><span className="team-eyebrow">PENDING</span><h2>Open invitations</h2></div><span>{pendingInvites.length} active</span></div>
        {pendingInvites.length ? <div className="team-list">{pendingInvites.map(invite => <div className="invite-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.roleName} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div><button className="team-danger" disabled={busy} onClick={() => void revokeInvite(invite.id)}><X size={16}/>Revoke</button></div>)}</div> : <div className="team-empty">No open invitations.</div>}
      </section>
    </div>
  </div>
}

export function JoinOrganizationPage() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('invite') || ''
  const [details, setDetails] = useState<InviteDetails | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const joinPath = `/join?invite=${encodeURIComponent(token)}`

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!token) { setMessage('This invite link is missing its invite code.'); setLoading(false); return }
      const [sessionResult, inviteResult] = await Promise.all([
        supabase.auth.getSession(),
        db.rpc('get_organization_invite_details', { _token: token }),
      ])
      if (!active) return
      setSession(sessionResult.data.session)
      if (inviteResult.error) setMessage(inviteResult.error.message)
      else setDetails(inviteResult.data?.[0] || null)
      setLoading(false)
    }
    void load()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [token])

  const emailAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect(joinPath) } })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account, then this invite will bring you back here.')
    } catch (err) { setMessage(readError(err)) }
    finally { setBusy(false) }
  }

  const googleAuth = async () => {
    setBusy(true); setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirect(joinPath) } })
    if (error) { setMessage(error.message); setBusy(false) }
  }

  const accept = async () => {
    setBusy(true); setMessage('')
    try {
      const { error } = await db.rpc('accept_organization_invite', { _token: token })
      if (error) throw error
      window.location.href = '/'
    } catch (err) { setMessage(readError(err)); setBusy(false) }
  }

  const signOut = async () => { await supabase.auth.signOut(); setSession(null); setMessage('') }

  const expired = details ? new Date(details.invite_expires_at).getTime() <= Date.now() : false
  const inactive = details && (details.invite_status !== 'pending' || expired)

  if (loading) return <div className="team-page team-center">Loading invitation…</div>

  return <div className="team-page team-center join-page">
    <div className="team-card join-card">
      <div className="join-icon"><UserPlus size={30}/></div>
      <div className="team-eyebrow">NORTHBORN INVITATION</div>
      <h1>{details?.organization_name ? `Join ${details.organization_name}` : 'Join a Northborn company'}</h1>
      {details && <p>You have been invited as <strong>{details.role_name}</strong>.</p>}
      {inactive && <div className="team-error">This invitation is {expired ? 'expired' : details?.invite_status}.</div>}
      {message && <div className="team-message">{message}</div>}

      {!details && !message && <div className="team-error">Invite not found.</div>}

      {details && !inactive && !session && <>
        <button className="google-join" disabled={busy} onClick={() => void googleAuth()}><span>G</span>Continue with Google</button>
        <div className="join-divider"><span>or</span></div>
        <form className="team-form" onSubmit={emailAuth}>
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required/></label>
          <label>Password<div className="join-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'signup' ? 8 : 1} required/><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          <button className="team-primary" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
        <button className="join-switch" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('') }}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button>
      </>}

      {details && !inactive && session && <div className="accept-box"><ShieldCheck size={30}/><p>Signed in as <strong>{session.user.email}</strong></p><button className="team-primary" disabled={busy} onClick={() => void accept()}>{busy ? 'Joining…' : `Join ${details.organization_name}`}</button><button className="join-signout" onClick={() => void signOut()}><LogOut size={16}/>Use a different account</button></div>}

      <a className="join-home" href="/">Return to Northborn</a>
    </div>
  </div>
}
