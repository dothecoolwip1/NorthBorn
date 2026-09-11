import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ContactRound,
  Gauge,
  HardHat,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
  Truck,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type Organization = {
  id: string
  name: string
}

const modules = [
  ['Dashboard', '/', Gauge],
  ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness],
  ['Customers', '/customers', ContactRound],
  ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck],
  ['Maintenance', '/maintenance', Wrench],
  ['Safety', '/safety', ShieldCheck],
  ['Tickets', '/tickets', ClipboardCheck],
  ['Timesheets', '/timesheets', HardHat],
  ['Invoices', '/invoices', ReceiptText],
  ['Reports', '/reports', Activity],
] as const

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setOrganization(null)
      return
    }

    supabase
      .from('organization_members')
      .select('organization:organizations(id,name)')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Unable to load Northborn organization', error)
          return
        }

        const org = data?.organization as unknown as Organization | null
        setOrganization(org ?? null)
      })
  }, [session])

  if (loading) {
    return <div className="center-screen">Loading Northborn…</div>
  }

  if (!session) {
    return <AuthScreen />
  }

  if (!organization) {
    return <OrganizationSetup userId={session.user.id} onCreated={setOrganization} />
  }

  return (
    <div className="app-shell">
      <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NORTHBORN</strong>
            <span>{organization.name}</span>
          </div>
        </div>

        <nav>
          {modules.map(([label, path, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="signout" onClick={() => supabase.auth.signOut()}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      <main className="content">
        <header>
          <button
            className="menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu />
          </button>

          <div className={online ? 'connection online' : 'connection offline'}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? 'Online' : 'Offline'}
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard organization={organization} />} />
          {modules.slice(1).map(([label, path]) => (
            <Route key={path} path={path} element={<ModulePage name={label} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
            },
          })

    setSubmitting(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Check your email to confirm your Northborn account.')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">N</div>
        <h1>Northborn</h1>
        <p>Field operations, built for the work.</p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>

          {message && <div className="message">{message}</div>}

          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          className="link-button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setMessage('')
          }}
        >
          {mode === 'signin'
            ? 'New to Northborn? Create an account'
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

function OrganizationSetup({
  userId,
  onCreated,
}: {
  userId: string
  onCreated: (organization: Organization) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: name.trim(), created_by: userId })
      .select('id,name')
      .single()

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    onCreated(data)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Building2 size={42} />
        <h1>Create your company</h1>
        <p>This becomes your private Northborn workspace.</p>

        <form onSubmit={submit}>
          <label>
            Company name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </label>

          {error && <div className="message">{error}</div>}

          <button className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create company'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Dashboard({ organization }: { organization: Organization }) {
  return (
    <section className="page">
      <div className="eyebrow">OPERATIONS</div>
      <h1>{organization.name}</h1>
      <p className="subtitle">Your Northborn command centre.</p>

      <div className="metric-grid">
        <Metric title="Jobs today" value="0" detail="No active jobs yet" />
        <Metric title="Available trucks" value="0" detail="Fleet setup is next" />
        <Metric title="Field staff" value="0" detail="Employees not added yet" />
        <Metric title="Open tickets" value="0" detail="Nothing waiting" />
      </div>

      <div className="panel">
        <h2>Foundation 0.1</h2>
        <p>
          The secure multi-company foundation is connected. Dispatch, Jobs, Fleet,
          Safety and billing modules can now be built on top of the same organization
          and permissions system.
        </p>
      </div>
    </section>
  )
}

function Metric({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ModulePage({ name }: { name: string }) {
  return (
    <section className="page">
      <div className="eyebrow">NORTHBORN MODULE</div>
      <h1>{name}</h1>
      <p className="subtitle">
        The foundation for this module is ready. The operational workflow will be built here.
      </p>

      <div className="panel empty">
        <div className="empty-icon">N</div>
        <h2>{name} is ready to build</h2>
        <p>
          This screen is intentionally empty while we establish Northborn's shared
          technical foundation.
        </p>
      </div>
    </section>
  )
}
