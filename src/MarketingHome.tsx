import { NavLink } from 'react-router-dom'
import {
  ArrowRight, Banknote, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2,
  ClipboardCheck, ContactRound, FileText, Gauge, HardHat, ReceiptText, ShieldCheck,
  Smartphone, Truck, Users, WifiOff, Wrench,
} from 'lucide-react'
import './marketing-home.css'

const platformAreas = [
  { icon: CalendarDays, title: 'Dispatch', text: 'Build the day, assign crews and units, release work, and see what is actually moving.' },
  { icon: BriefcaseBusiness, title: 'Jobs', text: 'Keep customer, site, schedule, crew, equipment and job status attached to one operating record.' },
  { icon: Truck, title: 'Fleet', text: 'Track availability, inspections, defects, maintenance, service history and downtime.' },
  { icon: ShieldCheck, title: 'Safety', text: 'Put FLHAs, inspections, incidents, orientations, SOPs and safety documents where crews can reach them.' },
  { icon: ReceiptText, title: 'Billing', text: 'Move approved field work into pricing, invoices, approvals, delivery and payment tracking.' },
  { icon: Users, title: 'People', text: 'Give managers, operators, safety, mechanics, accounting and clients the right view for their role.' },
] as const

const roles = [
  { icon: Gauge, label: 'Managers', title: 'See the whole day.', text: 'Work needing attention, dispatch movement, fleet health, paperwork and billing without hunting across systems.' },
  { icon: HardHat, label: 'Operators', title: 'See only the work that matters.', text: 'Assigned jobs, directions, units, safety forms, field tickets and timesheets in a field-first phone experience.' },
  { icon: Building2, label: 'Clients', title: 'Give customers a clean portal.', text: 'Jobs, signed field tickets, invoices and account activity without exposing internal notes or operations.' },
] as const

const conditions = [
  ['Mobile first', 'Built around phones and tablets used in trucks, shops and the field.', Smartphone],
  ['Offline capable', 'Important field workflows are designed to keep moving through unreliable service.', WifiOff],
  ['Role aware', 'Each person gets the tools and information their role actually needs.', Users],
  ['One job record', 'Operations, paperwork, fleet and billing stay connected to the same job.', FileText],
] as const

export default function MarketingHome() {
  return <main className="marketing-home">
    <header className="marketing-nav">
      <a className="marketing-brand" href="#top" aria-label="Northborn home">
        <span>N</span>
        <div><strong>NORTHBORN</strong><small>FIELD OPERATIONS</small></div>
      </a>

      <nav aria-label="Public navigation">
        <a href="#platform">Platform</a>
        <a href="#workflow">How it works</a>
        <a href="#roles">For your team</a>
        <a href="#built-for">Built for</a>
      </nav>

      <div className="marketing-nav-actions">
        <NavLink className="marketing-client-link" to="/client-join">Client portal</NavLink>
        <NavLink className="marketing-signin" to="/login">Sign in <ArrowRight size={17}/></NavLink>
      </div>
    </header>

    <section className="marketing-hero" id="top">
      <div className="marketing-hero-copy">
        <div className="marketing-kicker"><span/>FIELD OPERATIONS, WITHOUT THE CHAOS</div>
        <h1>Run the day.<br/><em>From one place.</em></h1>
        <p className="marketing-hero-lead">Northborn connects dispatch, jobs, crews, trucks, safety paperwork, field tickets, timesheets, customers and billing for companies that do real work in the field.</p>

        <div className="marketing-hero-actions">
          <NavLink className="marketing-primary" to="/login">Open Northborn <ArrowRight size={19}/></NavLink>
          <a className="marketing-secondary" href="#workflow">See the workflow</a>
        </div>

        <div className="marketing-proof">
          <span><CheckCircle2 size={17}/>Built from field experience</span>
          <span><CheckCircle2 size={17}/>Phone, tablet and desktop</span>
          <span><CheckCircle2 size={17}/>Manager, operator and client views</span>
        </div>
      </div>

      <div className="marketing-product-stage" aria-label="Northborn product preview">
        <div className="marketing-product-glow"/>
        <div className="marketing-app-window">
          <div className="marketing-app-topbar">
            <div className="marketing-mini-brand"><span>N</span><strong>NORTHBORN</strong></div>
            <div className="marketing-app-status"><i/> LIVE OPERATIONS</div>
          </div>

          <div className="marketing-app-body">
            <aside className="marketing-app-sidebar">
              <span className="active"><Gauge size={17}/>Home</span>
              <span><CalendarDays size={17}/>Dispatch</span>
              <span><BriefcaseBusiness size={17}/>Jobs</span>
              <span><Truck size={17}/>Fleet</span>
              <span><ShieldCheck size={17}/>Safety</span>
              <span><ReceiptText size={17}/>Billing</span>
            </aside>

            <div className="marketing-app-main">
              <div className="marketing-app-heading">
                <div><small>COMMAND CENTRE</small><strong>Good morning. <em>Here’s the day.</em></strong></div>
                <span>Open dispatch</span>
              </div>

              <div className="marketing-start-card">
                <div><Users size={19}/></div>
                <section><small>START HERE</small><strong>2 jobs need resources</strong><p>Crew or unit assignments are incomplete.</p></section>
                <ArrowRight size={17}/>
              </div>

              <div className="marketing-flow-preview">
                <div><small>NEEDS RESOURCES</small><strong>2</strong></div>
                <div><small>READY TO SEND</small><strong>3</strong></div>
                <div><small>AWAITING REPLY</small><strong>1</strong></div>
                <div className="active"><small>ACTIVE IN FIELD</small><strong>6</strong></div>
              </div>

              <div className="marketing-job-preview">
                <div className="marketing-job-preview-head"><span>TODAY’S WORK</span><small>12 jobs</small></div>
                <div className="marketing-job-preview-row"><time>07:00</time><section><strong>Hydrovac daylighting</strong><span>Red Deer County · Unit 214 · Cody, Mark</span></section><em>ON SITE</em></div>
                <div className="marketing-job-preview-row"><time>09:30</time><section><strong>Tank cleanout</strong><span>Lacombe · Combo 318 · Evan, Riley</span></section><em>READY</em></div>
                <div className="marketing-job-preview-row muted"><time>11:00</time><section><strong>Water haul</strong><span>Blackfalds · Unit 126 · Crew pending</span></section><em>ASSIGN</em></div>
              </div>
            </div>
          </div>
        </div>

        <div className="marketing-float-card marketing-float-mobile">
          <Smartphone size={19}/>
          <div><strong>Field ready</strong><span>Built for the phone in the truck</span></div>
        </div>
        <div className="marketing-float-card marketing-float-connected">
          <CheckCircle2 size={19}/>
          <div><strong>One operating record</strong><span>Job → field → billing</span></div>
        </div>
      </div>
    </section>

    <section className="marketing-trust-strip">
      <p>Built for field service companies that are tired of running the operation through</p>
      <div><span>Whiteboards</span><span>Texts</span><span>Paper forms</span><span>Spreadsheets</span><span>Shared drives</span><span>Disconnected apps</span></div>
    </section>

    <section className="marketing-workflow" id="workflow">
      <div className="marketing-section-heading centered">
        <span>ONE CONNECTED WORKFLOW</span>
        <h2>A job should not disappear between departments.</h2>
        <p>Northborn follows the work from the first request through dispatch, the field, paperwork and billing so everyone is working from the same record.</p>
      </div>

      <div className="marketing-workflow-rail">
        <article><div><Building2 size={21}/><b>01</b></div><small>REQUEST</small><strong>Customer & job</strong><p>Create the work once with the site, contacts and requirements attached.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><CalendarDays size={21}/><b>02</b></div><small>DISPATCH</small><strong>Crew & equipment</strong><p>Schedule the work, assign people and units, then release it to the field.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><ClipboardCheck size={21}/><b>03</b></div><small>FIELD</small><strong>Do the work</strong><p>Operators receive the job and complete the required forms and tickets.</p></article>
        <ArrowRight className="marketing-rail-arrow"/>
        <article><div><Banknote size={21}/><b>04</b></div><small>BILLING</small><strong>Close the loop</strong><p>Approved field work moves into invoice creation, delivery and payment tracking.</p></article>
      </div>
    </section>

    <section className="marketing-platform" id="platform">
      <div className="marketing-section-heading">
        <span>THE NORTHBORN PLATFORM</span>
        <h2>Everything connected to the work.</h2>
        <p>The goal is not to give you eight more dashboards. It is to make the entire operation easier to understand and easier to run.</p>
      </div>

      <div className="marketing-platform-layout">
        <article className="marketing-platform-feature">
          <div className="marketing-feature-icon"><Gauge size={25}/></div>
          <span>YOUR OPERATING PICTURE</span>
          <h3>Know what needs attention before someone has to ask.</h3>
          <p>The home screen brings together dispatch gaps, today’s work, fleet availability, paperwork waiting for review, billing and maintenance so the next action is obvious.</p>
          <div className="marketing-feature-points">
            <span><CheckCircle2/>Today-first command centre</span>
            <span><CheckCircle2/>Role-specific information</span>
            <span><CheckCircle2/>Direct links to the work needing action</span>
          </div>
        </article>

        <div className="marketing-module-grid">
          {platformAreas.map(({icon:Icon,title,text})=><article key={title}><div><Icon size={20}/></div><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </div>
    </section>

    <section className="marketing-roles" id="roles">
      <div className="marketing-section-heading centered">
        <span>ONE SYSTEM, DIFFERENT VIEWS</span>
        <h2>Northborn changes with the person using it.</h2>
        <p>A dispatcher should not see the same screen as an operator, and a client should never see internal company information.</p>
      </div>

      <div className="marketing-role-grid">
        {roles.map(({icon:Icon,label,title,text},index)=><article key={label} className={index===0?'featured':''}>
          <div className="marketing-role-top"><div><Icon size={22}/></div><span>{label}</span></div>
          <h3>{title}</h3>
          <p>{text}</p>
          <span className="marketing-role-link">Purpose-built workspace <ArrowRight size={15}/></span>
        </article>)}
      </div>
    </section>

    <section className="marketing-field" id="built-for">
      <div className="marketing-field-copy">
        <div className="marketing-section-heading">
          <span>BUILT FOR THE REAL CONDITIONS</span>
          <h2>Shop. Truck. Field. Office.</h2>
          <p>Northborn is being built around the realities of small and mid-sized industrial service companies, not around a perfect office workflow.</p>
        </div>

        <div className="marketing-industries">
          <span>Hydrovac</span><span>Vacuum</span><span>Steaming</span><span>Water hauling</span><span>Trucking</span><span>Environmental</span><span>Construction</span><span>Oilfield services</span><span>Industrial services</span>
        </div>
      </div>

      <div className="marketing-condition-grid">
        {conditions.map(([title,text,Icon])=><article key={title}><Icon size={22}/><div><h3>{title}</h3><p>{text}</p></div></article>)}
      </div>
    </section>

    <section className="marketing-story">
      <div>
        <span>WHY NORTHBORN EXISTS</span>
        <h2>Software should fit the operation. Not the other way around.</h2>
      </div>
      <div>
        <p>Northborn grew out of firsthand industrial field operations experience, where dispatch changes, equipment problems, safety paperwork, customer calls, job tickets and billing can all collide in the same morning.</p>
        <p>The aim is practical: give smaller and mid-sized service companies serious operating capability without turning the software into another full-time job.</p>
      </div>
    </section>

    <section className="marketing-cta">
      <div>
        <span>NORTHBORN</span>
        <h2>One place to run the work.</h2>
        <p>Open your workspace, create a company account, or enter through your customer portal.</p>
      </div>
      <div className="marketing-cta-actions">
        <NavLink className="marketing-primary" to="/login">Sign in or create account <ArrowRight size={18}/></NavLink>
        <NavLink className="marketing-secondary" to="/client-join">Client portal</NavLink>
      </div>
    </section>

    <footer className="marketing-footer">
      <div className="marketing-brand"><span>N</span><div><strong>NORTHBORN</strong><small>FIELD OPERATIONS</small></div></div>
      <p>Field operations, built from the field.</p>
      <div><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#roles">Roles</a><NavLink to="/login">Sign in</NavLink></div>
    </footer>
  </main>
}
