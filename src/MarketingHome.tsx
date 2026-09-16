import { NavLink } from 'react-router-dom'
import {
  ArrowRight, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2, ClipboardCheck,
  ContactRound, FileText, Gauge, HardHat, ReceiptText, ShieldCheck, Smartphone, Truck,
  Users, WifiOff, Wrench,
} from 'lucide-react'
import './marketing-home.css'

const modules = [
  { icon: CalendarDays, title: 'Dispatch & calendar', text: 'Build the day, assign crews and units, and keep everyone looking at the same schedule.' },
  { icon: BriefcaseBusiness, title: 'Jobs', text: 'Keep customer, site, contact, crew, unit and job status information together from request to completion.' },
  { icon: Truck, title: 'Fleet', text: 'Track units, operators, inspections, defects, maintenance schedules, compliance dates and downtime.' },
  { icon: ShieldCheck, title: 'Safety', text: 'Make tickets, orientations, SDS documents, SOPs and field forms easy to find instead of buried in folders.' },
  { icon: ContactRound, title: 'Customers', text: 'Keep client records, contacts, job history, portal access and pricing connected to the work they belong to.' },
  { icon: ReceiptText, title: 'Invoices', text: 'Turn completed work into professional invoices with pricing, line items, delivery tracking and client visibility.' },
  { icon: Users, title: 'Employees', text: 'Manage employee records, access, roles and the information operations actually needs.' },
  { icon: Gauge, title: 'Reports', text: 'See active work, revenue, staffing, fleet availability and safety attention without building another spreadsheet.' },
]

const fieldFeatures = [
  ['Mobile first', 'Northborn is designed around phones and tablets because that is where field work actually happens.', Smartphone],
  ['Offline capable', 'The platform is being built so important field workflows can keep moving when service is unreliable.', WifiOff],
  ['Role aware', 'Managers, operators and clients each get a workspace built around what they need to see and do.', Users],
  ['One operating record', 'Jobs, fleet, safety, customers and billing are connected instead of duplicated across separate tools.', FileText],
] as const

export default function MarketingHome() {
  return <main className="marketing-home">
    <header className="marketing-nav">
      <a className="marketing-brand" href="#top" aria-label="Northborn home">
        <span>N</span><strong>NORTHBORN</strong>
      </a>
      <nav aria-label="Public navigation">
        <a href="#platform">Platform</a>
        <a href="#story">Our story</a>
        <a href="#built-for">Built for</a>
      </nav>
      <div className="marketing-nav-actions">
        <NavLink className="marketing-client-link" to="/client-join">Client access</NavLink>
        <NavLink className="marketing-signin" to="/login">Sign in <ArrowRight size={16}/></NavLink>
      </div>
    </header>

    <section className="marketing-hero" id="top">
      <div className="marketing-hero-copy">
        <div className="marketing-kicker"><span/>FIELD OPERATIONS, BUILT FROM THE FIELD</div>
        <h1>Run the work.<br/><em>Not the paperwork.</em></h1>
        <p>Northborn is a field operations platform for hydrovac, vacuum, steaming, water hauling, trucking, environmental, construction and industrial service companies.</p>
        <div className="marketing-hero-actions">
          <NavLink className="marketing-primary" to="/login">Open Northborn <ArrowRight size={18}/></NavLink>
          <a className="marketing-secondary" href="#platform">See what it does</a>
        </div>
        <div className="marketing-proof">
          <span><CheckCircle2 size={15}/>Field focused</span>
          <span><CheckCircle2 size={15}/>Installable web app</span>
          <span><CheckCircle2 size={15}/>Manager, operator and client portals</span>
        </div>
      </div>

      <div className="marketing-hero-panel" aria-label="Northborn operations overview preview">
        <div className="marketing-panel-top"><div><small>OPERATIONS</small><strong>Today at a glance</strong></div><span>LIVE</span></div>
        <div className="marketing-panel-grid">
          <div><BriefcaseBusiness/><strong>12</strong><span>Active jobs</span></div>
          <div><Truck/><strong>8</strong><span>Units ready</span></div>
          <div><HardHat/><strong>19</strong><span>Field staff</span></div>
          <div><ShieldCheck/><strong>3</strong><span>Safety items</span></div>
        </div>
        <div className="marketing-job-card"><span className="marketing-job-time">07:00</span><div><strong>Hydrovac daylighting</strong><small>Unit 214 · 2 crew · Red Deer County</small></div><em>DISPATCHED</em></div>
        <div className="marketing-job-card"><span className="marketing-job-time">09:30</span><div><strong>Tank cleanout</strong><small>Combo Vac 318 · 2 crew · Lacombe</small></div><em>READY</em></div>
        <div className="marketing-panel-footer"><Wrench size={15}/> Fleet, jobs, safety and billing connected to the same operating record.</div>
      </div>
    </section>

    <section className="marketing-origin-strip">
      <strong>Northborn was not designed around an office workflow.</strong>
      <span>It started with the problems that show up when real crews, trucks, dispatch, safety paperwork, customer requests and billing all have to move at the same time.</span>
    </section>

    <section className="marketing-section" id="platform">
      <div className="marketing-section-heading">
        <span>ONE PLATFORM</span>
        <h2>The operation in one place.</h2>
        <p>Northborn connects the parts of field service work that normally end up split between whiteboards, texts, spreadsheets, paper forms, shared drives and disconnected apps.</p>
      </div>
      <div className="marketing-module-grid">
        {modules.map(({icon:Icon,title,text})=><article key={title}><div><Icon size={21}/></div><h3>{title}</h3><p>{text}</p></article>)}
      </div>
    </section>

    <section className="marketing-story" id="story">
      <div className="marketing-story-copy">
        <span>WHERE IT CAME FROM</span>
        <h2>Built because field service software should understand field service.</h2>
        <p>Northborn grew out of firsthand experience in industrial field operations, where a day can involve dispatch changes, equipment problems, safety requirements, customer calls, job tickets and billing before anyone gets back to the shop.</p>
        <p>The goal is simple: make the software fit the operation instead of forcing the operation to fit the software. A dispatcher should be able to understand the day quickly. An operator should get only the information they need in the field. A client should see their jobs and invoices without seeing internal notes. Safety information should be easy to find when it matters.</p>
        <p>Northborn is being built as a practical operating system for smaller and mid sized service companies that need serious capability without enterprise software becoming a second full time job.</p>
      </div>
      <div className="marketing-story-stack">
        <div><span>01</span><strong>Start with the work</strong><p>Every feature begins with a real operational problem, not a software trend.</p></div>
        <div><span>02</span><strong>Keep it understandable</strong><p>Important information should be obvious to the person who needs it, even on a busy day.</p></div>
        <div><span>03</span><strong>Connect the record</strong><p>A job should connect naturally to the client, crew, unit, safety record, invoice and history.</p></div>
        <div><span>04</span><strong>Keep building</strong><p>Northborn is designed to grow into tickets, timesheets, payments, deeper reporting and more field workflows.</p></div>
      </div>
    </section>

    <section className="marketing-field" id="built-for">
      <div className="marketing-section-heading compact">
        <span>BUILT FOR THE REAL CONDITIONS</span>
        <h2>Shop, truck, field and office.</h2>
      </div>
      <div className="marketing-feature-grid">
        {fieldFeatures.map(([title,text,Icon])=><article key={title}><Icon size={22}/><div><h3>{title}</h3><p>{text}</p></div></article>)}
      </div>
      <div className="marketing-industries">
        <span>Hydrovac</span><span>Vacuum</span><span>Steaming</span><span>Water hauling</span><span>Trucking</span><span>Environmental</span><span>Construction</span><span>Oilfield services</span><span>Industrial services</span>
      </div>
    </section>

    <section className="marketing-workflow">
      <div className="marketing-workflow-heading"><span>FROM REQUEST TO REVENUE</span><h2>One job. One connected path.</h2></div>
      <div className="marketing-workflow-line">
        <div><Building2/><strong>Client</strong><span>Request</span></div>
        <ArrowRight/>
        <div><CalendarDays/><strong>Dispatch</strong><span>Schedule</span></div>
        <ArrowRight/>
        <div><ClipboardCheck/><strong>Field</strong><span>Complete</span></div>
        <ArrowRight/>
        <div><ReceiptText/><strong>Billing</strong><span>Invoice</span></div>
      </div>
    </section>

    <section className="marketing-cta">
      <div><span>NORTHBORN</span><h2>Built for companies that have work to get done.</h2><p>Sign in to your workspace, create a company account, or use a client access code.</p></div>
      <div className="marketing-cta-actions"><NavLink className="marketing-primary" to="/login">Sign in or create account <ArrowRight size={18}/></NavLink><NavLink className="marketing-secondary" to="/client-join">Client access code</NavLink></div>
    </section>

    <footer className="marketing-footer"><div className="marketing-brand"><span>N</span><strong>NORTHBORN</strong></div><p>Field operations, built for the work.</p><div><a href="#platform">Platform</a><a href="#story">Story</a><NavLink to="/login">Sign in</NavLink></div></footer>
  </main>
}
