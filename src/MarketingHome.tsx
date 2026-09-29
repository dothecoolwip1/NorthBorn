import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowRight, Banknote, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ClipboardCheck, Clock3, FileCheck2, FileText, Gauge, HardHat,
  MapPin, ReceiptText, ShieldCheck, Smartphone, Truck, Users, WifiOff, Wrench,
} from 'lucide-react'
import './marketing-home.css'

type PreviewKey = 'manager' | 'operator' | 'client'

const previewTabs: Array<{ key: PreviewKey; label: string; eyebrow: string; title: string; text: string }> = [
  {
    key: 'manager',
    label: 'Manager',
    eyebrow: 'COMMAND CENTRE',
    title: 'See the day before it gets away from you.',
    text: 'Dispatch gaps, field progress, paperwork, fleet issues and billing attention in one operating view.',
  },
  {
    key: 'operator',
    label: 'Operator',
    eyebrow: 'FIELD APP',
    title: 'Give the crew what they need. Nothing they do not.',
    text: 'Assigned work, site details, safety forms, field tickets and timesheets built around the phone in the truck.',
  },
  {
    key: 'client',
    label: 'Client',
    eyebrow: 'CUSTOMER PORTAL',
    title: 'A professional window into the work.',
    text: 'Clients see their jobs, signed tickets and invoices without seeing your internal notes, staffing or operations.',
  },
]

const platformAreas = [
  { icon: CalendarDays, title: 'Dispatch', text: 'Schedule work, assign crews and units, release jobs and see what is actually moving.' },
  { icon: BriefcaseBusiness, title: 'Jobs', text: 'Customer, site, crew, equipment, status and paperwork tied to one job record.' },
  { icon: Truck, title: 'Fleet', text: 'Availability, defects, inspections, maintenance, service history and downtime.' },
  { icon: ShieldCheck, title: 'Safety', text: 'FLHAs, forms, incidents, orientations, SOPs and the documents crews need.' },
  { icon: ReceiptText, title: 'Billing', text: 'Move approved field work into pricing, invoicing, delivery and payment tracking.' },
  { icon: Users, title: 'People', text: 'Role-aware access for managers, dispatch, operators, safety, mechanics and accounting.' },
] as const

const conditions = [
  ['Built for phones', 'Large controls, clear hierarchy and field workflows designed for one-handed use.', Smartphone],
  ['Works through weak service', 'Offline-capable field workflows keep important work moving when coverage does not.', WifiOff],
  ['Different view by role', 'Managers, operators and clients do not get the same crowded dashboard.', Users],
  ['One operating record', 'The job connects naturally to the customer, crew, unit, paperwork, invoice and history.', FileText],
] as const

function ManagerPreview() {
  return <div className="showcase-screen manager-screen">
    <div className="showcase-screen-bar"><div><span>N</span><strong>NORTHBORN</strong></div><small><i/> LIVE</small></div>
    <div className="showcase-manager-heading"><div><small>MONDAY · 6:42 AM</small><strong>Good morning. Here’s the day.</strong></div><button>Open dispatch</button></div>
    <div className="showcase-alert"><div><Users size={18}/></div><section><small>START HERE</small><strong>2 jobs still need resources</strong><span>Crew or unit assignments are incomplete.</span></section><ArrowRight size={18}/></div>
    <div className="showcase-flow">
      <div><span>NEEDS RESOURCES</span><b>2</b></div>
      <div><span>READY TO SEND</span><b>3</b></div>
      <div><span>AWAITING REPLY</span><b>1</b></div>
      <div className="good"><span>ACTIVE IN FIELD</span><b>6</b></div>
    </div>
    <div className="showcase-list">
      <header><strong>TODAY’S WORK</strong><span>12 jobs</span></header>
      <div><time>07:00</time><section><strong>Hydrovac daylighting</strong><span><MapPin size={12}/> Red Deer County · Unit 214</span></section><em>ON SITE</em></div>
      <div><time>09:30</time><section><strong>Tank cleanout</strong><span><MapPin size={12}/> Lacombe · Combo 318</span></section><em>READY</em></div>
      <div><time>11:00</time><section><strong>Water haul</strong><span><MapPin size={12}/> Blackfalds · Crew pending</span></section><em className="warn">ASSIGN</em></div>
    </div>
  </div>
}

function OperatorPreview() {
  return <div className="showcase-phone-shell">
    <div className="showcase-phone-speaker"/>
    <div className="showcase-phone-content operator-screen">
      <div className="phone-app-header"><div><span>N</span><strong>Today</strong></div><small>GR</small></div>
      <div className="operator-date"><small>MONDAY, SEPT 29</small><strong>3 jobs assigned</strong><span>Everything you need for today.</span></div>
      <article className="operator-job active">
        <header><span>07:00 · IN PROGRESS</span><em>ON SITE</em></header>
        <h4>Hydrovac daylighting</h4>
        <p>Red Deer County · Site 12-24</p>
        <div className="operator-job-meta"><span><Truck size={14}/> Unit 214</span><span><Clock3 size={14}/> 07:00</span></div>
        <button>Open job <ArrowRight size={16}/></button>
      </article>
      <article className="operator-job">
        <header><span>11:00</span><em>UP NEXT</em></header>
        <h4>Water haul</h4>
        <p>Blackfalds · Plant 4</p>
      </article>
      <div className="operator-shortcuts"><span><ShieldCheck/>Safety</span><span><FileCheck2/>Tickets</span><span><Clock3/>Time</span></div>
    </div>
  </div>
}

function ClientPreview() {
  return <div className="showcase-phone-shell">
    <div className="showcase-phone-speaker"/>
    <div className="showcase-phone-content client-screen">
      <div className="phone-app-header"><div><span>N</span><strong>Client Portal</strong></div><small>ACME</small></div>
      <div className="client-welcome"><small>ACME ENERGY</small><strong>Your work with Northborn</strong><span>Jobs, paperwork and billing in one place.</span></div>
      <div className="client-stat-row"><div><b>3</b><span>Active jobs</span></div><div><b>2</b><span>Open invoices</span></div></div>
      <article className="client-job-card"><header><span>JOB #NB-1048</span><em>COMPLETE</em></header><h4>Hydrovac daylighting</h4><p>Completed Sep 28 · Red Deer County</p><button><FileCheck2 size={16}/> Signed field ticket</button></article>
      <article className="client-invoice-card"><div><ReceiptText size={20}/><section><small>INV-2026-1001</small><strong>$4,286.50</strong><span>Due Oct 15</span></section></div><em>VIEW</em></article>
    </div>
  </div>
}

export default function MarketingHome() {
  const [activePreview, setActivePreview] = useState<PreviewKey>('manager')
  const preview = previewTabs.find(item => item.key === activePreview) ?? previewTabs[0]

  return <main className="marketing-home">
    <header className="marketing-nav">
      <a className="marketing-brand" href="#top" aria-label="Northborn home">
        <span>N</span>
        <div><strong>NORTHBORN</strong><small>FIELD OPERATIONS</small></div>
      </a>

      <nav aria-label="Public navigation">
        <a href="#showcase">Product</a>
        <a href="#workflow">Workflow</a>
        <a href="#platform">Platform</a>
        <a href="#built-for">Built for</a>
      </nav>

      <div className="marketing-nav-actions">
        <NavLink className="marketing-client-link" to="/client-join">Client portal</NavLink>
        <NavLink className="marketing-signin" to="/login">Sign in <ArrowRight size={17}/></NavLink>
      </div>
    </header>

    <section className="marketing-hero" id="top">
      <div className="marketing-hero-copy">
        <div className="marketing-kicker"><span/>BUILT FOR FIELD OPERATIONS</div>
        <h1>Your whole operation.<br/><em>In your pocket.</em></h1>
        <p className="marketing-hero-lead">Dispatch the work. Send it to the field. Capture the paperwork. Bill the job. Northborn keeps the entire day connected without making your crew live in software.</p>

        <div className="marketing-hero-actions">
          <NavLink className="marketing-primary" to="/login">Open Northborn <ArrowRight size={19}/></NavLink>
          <a className="marketing-secondary" href="#showcase">See it in action</a>
        </div>

        <div className="marketing-proof">
          <span><CheckCircle2 size={17}/>Built from field experience</span>
          <span><CheckCircle2 size={17}/>Phone, tablet & desktop</span>
          <span><CheckCircle2 size={17}/>Role-aware by design</span>
        </div>
      </div>

      <div className="hero-product-composition" aria-label="Northborn running on desktop and mobile">
        <div className="hero-grid-lines"/>
        <div className="hero-desktop-frame">
          <div className="hero-browser-bar"><span/><span/><span/><small>northborn · operations</small></div>
          <ManagerPreview/>
        </div>
        <div className="hero-phone-frame">
          <div className="hero-phone-notch"/>
          <div className="hero-phone-inner">
            <div className="hero-phone-header"><span>N</span><strong>Today</strong><small>GR</small></div>
            <div className="hero-phone-greeting"><small>YOUR DAY</small><strong>Monday, Sep 29</strong><span>3 jobs assigned</span></div>
            <div className="hero-phone-job"><span>07:00 · ON SITE</span><strong>Hydrovac daylighting</strong><small>Red Deer County · Unit 214</small><button>Open job <ArrowRight size={15}/></button></div>
            <div className="hero-phone-next"><small>UP NEXT · 11:00</small><strong>Water haul · Blackfalds</strong></div>
          </div>
        </div>
        <div className="hero-field-stamp"><HardHat size={18}/><span>BUILT<br/>FROM THE FIELD</span></div>
      </div>
    </section>

    <section className="marketing-replaces" aria-label="What Northborn replaces">
      <p>One place instead of six.</p>
      <div><span>Whiteboards</span><b>+</b><span>Group texts</span><b>+</b><span>Paper tickets</span><b>+</b><span>Spreadsheets</span><b>+</b><span>Shared drives</span></div>
    </section>

    <section className="marketing-showcase" id="showcase">
      <div className="marketing-section-heading centered">
        <span>SEE THE PRODUCT</span>
        <h2>Same operation. The right view for each person.</h2>
        <p>Northborn does not force the manager, the operator and the customer through the same interface.</p>
      </div>

      <div className="showcase-tabs" role="tablist" aria-label="Northborn role previews">
        {previewTabs.map(item => <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={activePreview === item.key}
          className={activePreview === item.key ? 'active' : ''}
          onClick={() => setActivePreview(item.key)}
        >{item.label}</button>)}
      </div>

      <div className="showcase-stage">
        <div className="showcase-copy">
          <span>{preview.eyebrow}</span>
          <h3>{preview.title}</h3>
          <p>{preview.text}</p>
          <a href="#workflow">See how the job moves <ArrowRight size={17}/></a>
        </div>
        <div className={`showcase-product ${activePreview}`}>
          {activePreview === 'manager' && <ManagerPreview/>}
          {activePreview === 'operator' && <OperatorPreview/>}
          {activePreview === 'client' && <ClientPreview/>}
        </div>
      </div>
    </section>

    <section className="marketing-workflow" id="workflow">
      <div className="marketing-section-heading">
        <span>FROM REQUEST TO REVENUE</span>
        <h2>One job. One connected path.</h2>
        <p>Stop re-entering the same information every time the job changes hands.</p>
      </div>

      <div className="marketing-workflow-rail">
        <article><div><Building2 size={22}/><b>01</b></div><small>REQUEST</small><strong>Create the job once</strong><p>Customer, site, contacts, scope and requirements start together.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><CalendarDays size={22}/><b>02</b></div><small>DISPATCH</small><strong>Build the day</strong><p>Schedule the work, assign people and equipment, then release it.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><ClipboardCheck size={22}/><b>03</b></div><small>FIELD</small><strong>Complete the work</strong><p>The operator gets the job, forms, tickets and time in one field view.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><Banknote size={22}/><b>04</b></div><small>BILLING</small><strong>Close the loop</strong><p>Approved field work moves into invoicing and payment tracking.</p></article>
      </div>
      <div className="marketing-swipe-hint">Swipe to follow the job <ArrowRight size={15}/></div>
    </section>

    <section className="marketing-platform" id="platform">
      <div className="marketing-section-heading">
        <span>THE WORK, CONNECTED</span>
        <h2>Not another pile of separate tools.</h2>
        <p>Each part of Northborn connects back to the same operation, so information follows the work instead of getting copied between systems.</p>
      </div>

      <div className="marketing-module-grid">
        {platformAreas.map(({icon:Icon,title,text})=><article key={title}><div><Icon size={21}/></div><h3>{title}</h3><p>{text}</p><span>Connected to the job <ArrowRight size={14}/></span></article>)}
      </div>
    </section>

    <section className="marketing-field" id="built-for">
      <div className="marketing-field-intro">
        <span>BUILT FOR THE REAL CONDITIONS</span>
        <h2>The office is not where all the work happens.</h2>
        <p>Northborn is being built for the shop, the truck, the field and the office. That changes what “good software” needs to feel like.</p>
        <div className="marketing-industries">
          <span>Hydrovac</span><span>Vacuum</span><span>Steaming</span><span>Water hauling</span><span>Trucking</span><span>Environmental</span><span>Construction</span><span>Oilfield</span><span>Industrial</span>
        </div>
      </div>

      <div className="marketing-condition-grid">
        {conditions.map(([title,text,Icon])=><article key={title}><Icon size={22}/><div><h3>{title}</h3><p>{text}</p></div></article>)}
      </div>
    </section>

    <section className="marketing-principle">
      <div className="principle-mark"><Wrench size={24}/></div>
      <div><span>WHY NORTHBORN EXISTS</span><h2>Software should fit the operation. Not the other way around.</h2></div>
      <p>Northborn grew out of real industrial field operations, where dispatch changes, equipment problems, safety paperwork, customer calls, job tickets and billing can all collide in the same morning.</p>
    </section>

    <section className="marketing-cta">
      <div><span>NORTHBORN</span><h2>Run the work from one place.</h2><p>Open your workspace, create a company account, or enter through your customer portal.</p></div>
      <div className="marketing-cta-actions"><NavLink className="marketing-primary" to="/login">Sign in or create account <ArrowRight size={18}/></NavLink><NavLink className="marketing-secondary" to="/client-join">Client portal</NavLink></div>
    </section>

    <footer className="marketing-footer">
      <div className="marketing-brand"><span>N</span><div><strong>NORTHBORN</strong><small>FIELD OPERATIONS</small></div></div>
      <p>Field operations, built from the field.</p>
      <div><a href="#showcase">Product</a><a href="#workflow">Workflow</a><a href="#platform">Platform</a><NavLink to="/login">Sign in</NavLink></div>
    </footer>

    <div className="marketing-mobile-dock">
      <div><strong>Northborn</strong><span>Field operations</span></div>
      <NavLink to="/login">Open <ArrowRight size={17}/></NavLink>
    </div>
  </main>
}
