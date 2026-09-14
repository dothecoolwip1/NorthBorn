import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-access.css'

const db = supabase as any
const PRODUCTION_URL = 'https://northborn.vercel.app'

type InviteDetails = {
  organization_name: string
  role_name: string
  invite_status: string
  invite_expires_at: string
}

function readError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Something went wrong')
  }
  return String(error || 'Something went wrong')
}

function authRedirect(path: string) {
  const base = window.location.hostname.endsWith('vercel.app') ? PRODUCTION_URL : window.location.origin
  return `${base}${path}`
}

function namesFromSession(session: Session) {
  const metadata = session.user.user_metadata || {}
  let firstName = String(metadata.given_name || metadata.first_name || '').trim()
  let lastName = String(metadata.family_name || metadata.last_name || '').trim()
  const fullName = String(metadata.full_name || metadata.name || '').trim()

  if ((!firstName || !lastName) && fullName) {
    const pieces = fullName.split(/\s+/).filter(Boolean)
    if (!firstName) firstName = pieces.shift() || ''
    if (!lastName) lastName = pieces.join(' ')
  }

  return { firstName, lastName }
}

export default function JoinOrganizationPage() {
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
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')

  const joinPath = `/join?invite=${encodeURIComponent(token)}`

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!token) {
        setMessage('This invite link is missing its invite code.')
        setLoading(false)
        return
      }

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
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [token])

  useEffect(() => {
    if (!session) return
    const names = namesFromSession(session)
    if (!firstName && names.firstName) setFirstName(names.firstName)
    if (!lastName && names.lastName) setLastName(names.lastName)
    if (!phone) {
      const savedPhone = String(session.user.phone || session.user.user_metadata?.phone || '').trim()
      if (savedPhone) setPhone(savedPhone)
    }
    if (!position && details?.role_name) setPosition(details.role_name)
  }, [session, details, firstName, lastName, phone, position])

  const emailAuth = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: authRedirect(joinPath) },
          })

      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) {
        setMessage('Check your email to confirm your account, then the invitation will bring you back here to finish your employee profile.')
      }
    } catch (err) {
      setMessage(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const googleAuth = async () => {
    setBusy(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect(joinPath) },
    })
    if (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  const accept = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const { error } = await db.rpc('accept_organization_invite_with_profile', {
        _token: token,
        _first_name: firstName.trim(),
        _last_name: lastName.trim(),
        _phone: phone.trim(),
        _position: position.trim(),
      })
      if (error) throw error
      window.location.href = '/'
    } catch (err) {
      setMessage(readError(err))
      setBusy(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setMessage('')
  }

  const expired = details ? new Date(details.invite_expires_at).getTime() <= Date.now() : false
  const inactive = details && (details.invite_status !== 'pending' || expired)

  if (loading) return <div className="team-page team-center">Loading invitation…</div>

  return (
    <div className="team-page team-center join-page">
      <div className="team-card join-card">
        <div className="join-icon"><UserPlus size={30}/></div>
        <div className="team-eyebrow">NORTHBORN INVITATION</div>
        <h1>{details?.organization_name ? `Join ${details.organization_name}` : 'Join a Northborn company'}</h1>
        {details && <p>You have been invited as <strong>{details.role_name}</strong>.</p>}

        {inactive && <div className="team-error">This invitation is {expired ? 'expired' : details?.invite_status}.</div>}
        {message && <div className="team-message">{message}</div>}
        {!details && !message && <div className="team-error">Invite not found.</div>}

        {details && !inactive && !session && (
          <>
            <button className="google-join" disabled={busy} onClick={() => void googleAuth()}><span>G</span>Continue with Google</button>
            <div className="join-divider"><span>or</span></div>
            <form className="team-form" onSubmit={emailAuth}>
              <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required/></label>
              <label>Password<div className="join-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'signup' ? 8 : 1} required/><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
              <button className="team-primary" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </form>
            <button className="join-switch" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('') }}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button>
          </>
        )}

        {details && !inactive && session && (
          <form className="team-form accept-box" onSubmit={accept}>
            <ShieldCheck size={30}/>
            <div>
              <strong>Complete your employee profile</strong>
              <p>These details create your employee record in {details.organization_name}.</p>
            </div>
            <label>Email<input value={session.user.email || ''} disabled/></label>
            <label>First name<input value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" required maxLength={80}/></label>
            <label>Last name<input value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" required maxLength={80}/></label>
            <label>Phone number<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" placeholder="403-555-0123" required minLength={7} maxLength={40}/></label>
            <label>Position / job title<input value={position} onChange={event => setPosition(event.target.value)} placeholder={details.role_name} required maxLength={120}/></label>
            <p className="team-help">Your company administrators will be able to see this information in Employees. You can update it later.</p>
            <button className="team-primary" disabled={busy}>{busy ? 'Creating employee profile…' : `Join ${details.organization_name}`}</button>
            <button type="button" className="join-signout" onClick={() => void signOut()}><LogOut size={16}/>Use a different account</button>
          </form>
        )}

        <a className="join-home" href="/">Return to Northborn</a>
      </div>
    </div>
  )
}
