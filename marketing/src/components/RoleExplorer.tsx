import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'

type RoleKey = 'manager' | 'operator' | 'client'

const roles: Array<{
  key: RoleKey
  label: string
  eyebrow: string
  headline: string
  copy: string
}> = [
  {
    key: 'manager',
    label: 'Manager',
    eyebrow: 'COMMAND CENTRE',
    headline: 'See the whole day before it becomes a dozen phone calls.',
    copy: 'Dispatch gaps, crews, equipment, paperwork, billing and maintenance surface in one operating picture.',
  },
  {
    key: 'operator',
    label: 'Operator',
    eyebrow: 'FIELD APP',
    headline: 'The next job, the right forms and nothing the crew does not need.',
    copy: 'Operators get assigned work, directions, safety, tickets and time in a phone-first view built for the truck.',
  },
  {
    key: 'client',
    label: 'Client',
    eyebrow: 'CLIENT PORTAL',
    headline: 'Give customers visibility without exposing the back office.',
    copy: 'Clients can see their jobs, signed field tickets and invoices without internal notes, staffing or operational noise.',
  },
]

function ManagerScreen() {
  return <div className="nb-screen nb-manager">
    <div className="nb-screen-top"><b>N</b><span>COMMAND CENTRE</span><i>LIVE</i></div>
    <div className="nb-manager-title"><div><small>MONDAY · 06:42</small><strong>Good morning. Here’s the day.</strong></div><button>Open dispatch</button></div>
    <div className="nb-start"><div>01</div><section><small>START HERE</small><strong>2 jobs need resources</strong><span>Crew or unit assignments are incomplete.</span></section><b>→</b></div>
    <div className="nb-flow">
      <div><small>NEEDS RESOURCES</small><strong>2</strong></div>
      <div><small>READY TO SEND</small><strong>3</strong></div>
      <div><small>AWAITING REPLY</small><strong>1</strong></div>
      <div className="is-live"><small>ACTIVE IN FIELD</small><strong>6</strong></div>
    </div>
    <div className="nb-work">
      <header><b>TODAY’S WORK</b><span>12 jobs</span></header>
      <div><time>07:00</time><section><strong>Hydrovac daylighting</strong><span>Red Deer County · Unit 214</span></section><em>ON SITE</em></div>
      <div><time>09:30</time><section><strong>Tank cleanout</strong><span>Lacombe · Combo 318</span></section><em>READY</em></div>
      <div><time>11:00</time><section><strong>Water haul</strong><span>Blackfalds · Crew pending</span></section><em className="warn">ASSIGN</em></div>
    </div>
  </div>
}

function OperatorScreen() {
  return <div className="nb-phone">
    <div className="nb-phone-notch" />
    <div className="nb-phone-inner">
      <div className="nb-phone-top"><b>N</b><strong>Today</strong><span>GR</span></div>
      <div className="nb-phone-day"><small>MONDAY, SEP 29</small><strong>3 jobs assigned</strong><span>Everything you need for today.</span></div>
      <article className="nb-phone-job active">
        <div><small>07:00 · IN PROGRESS</small><em>ON SITE</em></div>
        <h4>Hydrovac daylighting</h4>
        <p>Red Deer County · Site 12-24</p>
        <section><span>UNIT 214</span><span>07:00</span></section>
        <button>Open job <b>→</b></button>
      </article>
      <article className="nb-phone-job">
        <div><small>11:00</small><em>UP NEXT</em></div>
        <h4>Water haul</h4>
        <p>Blackfalds · Plant 4</p>
      </article>
      <div className="nb-phone-tools"><span>Safety</span><span>Tickets</span><span>Time</span></div>
    </div>
  </div>
}

function ClientScreen() {
  return <div className="nb-phone">
    <div className="nb-phone-notch" />
    <div className="nb-phone-inner">
      <div className="nb-phone-top"><b>N</b><strong>Client Portal</strong><span>AC</span></div>
      <div className="nb-phone-day"><small>ACME ENERGY</small><strong>Your work with Northborn</strong><span>Jobs, paperwork and billing in one place.</span></div>
      <div className="nb-client-stats"><div><b>3</b><span>Active jobs</span></div><div><b>2</b><span>Open invoices</span></div></div>
      <article className="nb-client-card">
        <div><small>JOB #NB-1048</small><em>COMPLETE</em></div>
        <h4>Hydrovac daylighting</h4>
        <p>Completed Sep 28 · Red Deer County</p>
        <button>✓ Signed field ticket</button>
      </article>
      <div className="nb-invoice"><span>INV-2026-1001</span><strong>$4,286.50</strong><small>DUE OCT 15</small></div>
    </div>
  </div>
}

export default function RoleExplorer() {
  const [active, setActive] = useState<RoleKey>('manager')
  const role = useMemo(() => roles.find(item => item.key === active) ?? roles[0], [active])

  return <div className="role-explorer">
    <div className="role-tabs" role="tablist" aria-label="Northborn role views">
      {roles.map(item => <button
        key={item.key}
        type="button"
        role="tab"
        aria-selected={item.key === active}
        className={item.key === active ? 'active' : ''}
        onClick={() => setActive(item.key)}
      >{item.label}</button>)}
    </div>

    <div className="role-stage">
      <AnimatePresence mode="wait">
        <motion.div
          className="role-copy"
          key={role.key + '-copy'}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
        >
          <span>{role.eyebrow}</span>
          <h3>{role.headline}</h3>
          <p>{role.copy}</p>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          className={'role-product ' + active}
          key={active}
          initial={{ opacity: 0, scale: .975, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: .985, y: -8 }}
          transition={{ duration: .36, ease: [0.22, 1, 0.36, 1] }}
        >
          {active === 'manager' && <ManagerScreen />}
          {active === 'operator' && <OperatorScreen />}
          {active === 'client' && <ClientScreen />}
        </motion.div>
      </AnimatePresence>
    </div>
  </div>
}
