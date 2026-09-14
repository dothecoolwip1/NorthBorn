import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HardHat, LogOut } from 'lucide-react'
import { supabase } from './lib/supabase'
import './team-access.css'

const db = supabase as any

type Props = {
  session: Session
  organizationId: string
  organizationName: string
}

function readError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Something went wrong')
  }
  return String(error || 'Something went wrong')
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

export default function EmployeeProfileSetup({ session, organizationId, organizationName }: Props) {
  const initialNames = namesFromSession(session)
  const [firstName, setFirstName] = useState(initialNames.firstName)
  const [lastName, setLastName] = useState(initialNames.lastName)
  const [phone, setPhone] = useState(String(session.user.phone || session.user.user_metadata?.phone || '').trim())
  const [position, setPosition] = useState('Operator')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const metadataPhone = String(session.user.phone || session.user.user_metadata?.phone || '').trim()
    if (!phone && metadataPhone) setPhone(metadataPhone)
  }, [session, phone])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const { error: rpcError } = await db.rpc('complete_employee_profile', {
        _organization_id: organizationId,
        _first_name: firstName.trim(),
        _last_name: lastName.trim(),
        _phone: phone.trim(),
        _position: position.trim(),
      })
      if (rpcError) throw rpcError
      window.location.reload()
    } catch (err) {
      setError(readError(err))
      setBusy(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="team-page team-center join-page">
      <div className="team-card join-card">
        <div className="join-icon"><HardHat size={30}/></div>
        <div className="team-eyebrow">EMPLOYEE SETUP</div>
        <h1>Finish your profile</h1>
        <p>Complete your employee information for <strong>{organizationName}</strong> before entering your field workspace.</p>

        {error && <div className="team-error">{error}</div>}

        <form className="team-form accept-box" onSubmit={submit}>
          <label>Email<input value={session.user.email || ''} disabled/></label>
          <label>First name<input value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" required maxLength={80}/></label>
          <label>Last name<input value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" required maxLength={80}/></label>
          <label>Phone number<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" placeholder="403-555-0123" required minLength={7} maxLength={40}/></label>
          <label>Position / job title<input value={position} onChange={event => setPosition(event.target.value)} placeholder="Hydrovac Operator" required maxLength={120}/></label>
          <p className="team-help">This creates your employee record and links your Northborn login to it. Your assigned jobs, tickets, safety items, and timesheets will use this profile.</p>
          <button className="team-primary" disabled={busy}>{busy ? 'Saving profile…' : 'Finish employee setup'}</button>
          <button type="button" className="join-signout" onClick={() => void signOut()}><LogOut size={16}/>Sign out</button>
        </form>
      </div>
    </div>
  )
}
