import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Check, ChevronRight, ClipboardCheck,
  FileCheck2, FileText, HardHat, MapPin, Menu, ReceiptText, ShieldCheck,
  Smartphone, Truck, Users, WifiOff, Wrench, X,
} from 'lucide-react'
import './marketing-home.css'

type PreviewKey = 'manager' | 'operator' | 'client'

const roles: Array<{key:PreviewKey; label:string; eyebrow:string; title:string; copy:string}> = [
  {
    key:'manager',
    label:'Manager',
    eyebrow:'Operations command centre',
    title:'Know what needs attention before the phone starts ringing.',
    copy:'Jobs, dispatch, crews, fleet, paperwork and billing stay connected around the work actually happening today.',
  },
  {
    key:'operator',
    label:'Operator',
    eyebrow:'Field workspace',
    title:'Open the job. Do the work. Finish the paperwork.',
    copy:'Operators see the work assigned to them, with the site details, safety documents, tickets and time they need in the field.',
  },
  {
    key:'client',
    label:'Client',
    eyebrow:'Customer portal',
    title:'Give customers a clean view without exposing your operation.',
    copy:'Clients can follow their work, retrieve signed tickets and view invoices through a focused portal built for them.',
  },
]

const capabilities = [
  {icon:CalendarDays,title:'Dispatch',copy:'Schedule jobs, assign crews and units, then release the day to the field.'},
  {icon:BriefcaseBusiness,title:'Jobs',copy:'Keep customer, site, scope, crew, equipment and documents on one record.'},
  {icon:Truck,title:'Fleet',copy:'Track units, defects, inspections, service, maintenance and availability.'},
  {icon:ShieldCheck,title:'Safety',copy:'Keep forms, FLHAs, incidents, SOPs and required documents close to the work.'},
  {icon:ReceiptText,title:'Billing',copy:'Turn approved field work into invoices without rebuilding the job from scratch.'},
  {icon:Users,title:'People',copy:'Give managers, dispatchers, operators, mechanics and clients the access they need.'},
] as const

function Brand() {
  return <div className="nb-brand"><span>N</span><div><strong>NORTHBORN</strong><small>FIELD OPERATIONS</small></div></div>
}

function ManagerProduct() {
  return <div className="product-window">
    <div className="product-topbar">
      <Brand/>
      <div className="product-top-actions"><span>Monday · 6:42 AM</span><b><i/> LIVE</b></div>
    </div>
    <div className="product-body">
      <aside className="product-sidebar">
        <div className="side-active"><span/><b>Overview</b></div>
        <div><span/><b>Dispatch</b></div>
        <div><span/><b>Jobs</b></div>
        <div><span/><b>Fleet</b></div>
        <div><span/><b>Billing</b></div>
      </aside>
      <section className="product-main">
        <div className="product-heading"><div><small>GOOD MORNING</small><h3>Here’s the day.</h3></div><button>Open dispatch <ArrowRight size={15}/></button></div>
        <div className="product-alert"><div><Users size={17}/></div><p><small>START HERE</small><strong>2 jobs still need resources</strong><span>Crew or unit assignments are incomplete.</span></p><ChevronRight size={18}/></div>
        <div className="product-stats">
          <article><span>NEEDS RESOURCES</span><b>2</b></article>
          <article><span>READY TO SEND</span><b>3</b></article>
          <article><span>ACTIVE IN FIELD</span><b>6</b></article>
        </div>
        <div className="product-list">
          <header><strong>TODAY'S WORK</strong><span>12 jobs</span></header>
          <div><time>07:00</time><p><strong>Hydrovac daylighting</strong><span><MapPin size={11}/> Red Deer County · Unit 214</span></p><em className="good">ON SITE</em></div>
          <div><time>09:30</time><p><strong>Tank cleanout</strong><span><MapPin size={11}/> Lacombe · Combo 318</span></p><em>READY</em></div>
          <div><time>11:00</time><p><strong>Water haul</strong><span><MapPin size={11}/> Blackfalds · Crew pending</span></p><em className="warn">ASSIGN</em></div>
        </div>
      </section>
    </div>
  </div>
}

function PhoneProduct({mode}:{mode:'operator'|'client'}) {
  if (mode === 'client') {
    return <div className="phone-shell">
      <div className="phone-island"/>
      <div className="phone-screen">
        <div className="phone-head"><span>N</span><b>Client Portal</b><small>AC</small></div>
        <div className="phone-title"><small>ACME ENERGY</small><h3>Your work with Northborn</h3><p>Jobs, paperwork and billing in one place.</p></div>
        <div className="phone-metrics"><div><b>3</b><span>Active jobs</span></div><div><b>2</b><span>Open invoices</span></div></div>
        <article className="phone-card"><small>JOB #NB-1048 · COMPLETE</small><h4>Hydrovac daylighting</h4><p>Completed Sep 28 · Red Deer County</p><button><FileCheck2 size={15}/> Signed field ticket</button></article>
        <article className="phone-invoice"><ReceiptText size={20}/><div><small>INV-2026-1001</small><b>$4,286.50</b><span>Due Oct 15</span></div><ChevronRight size={18}/></article>
      </div>
    </div>
  }

  return <div className="phone-shell">
    <div className="phone-island"/>
    <div className="phone-screen">
      <div className="phone-head"><span>N</span><b>Today</b><small>GR</small></div>
      <div className="phone-title"><small>MONDAY, SEP 29</small><h3>3 jobs assigned</h3><p>Everything you need for today.</p></div>
      <article className="phone-card active">
        <small>07:00 · IN PROGRESS</small>
        <h4>Hydrovac daylighting</h4>
        <p>Red Deer County · Site 12-24</p>
        <div className="phone-meta"><span><Truck size={13}/> Unit 214</span><span><ShieldCheck size={13}/> Cleared</span></div>
        <button>Open job <ArrowRight size={15}/></button>
      </article>
      <article className="phone-card compact"><small>UP NEXT · 11:00</small><h4>Water haul</h4><p>Blackfalds · Plant 4</p></article>
      <div className="phone-shortcuts"><span><ShieldCheck/>Safety</span><span><FileCheck2/>Tickets</span><span><FileText/>Time</span></div>
    </div>
  </div>
}

export default function MarketingHome() {
  const [activeRole,setActiveRole] = useState<PreviewKey>('manager')
  const [menuOpen,setMenuOpen] = useState(false)
  const role = roles.find(item => item.key === activeRole) ?? roles[0]

  return <main className="nb-home" id="top">
    <header className="nb-nav">
      <a href="#top" className="nb-brand-link" aria-label="Northborn home"><Brand/></a>
      <nav className={menuOpen ? 'open' : ''} aria-label="Public navigation">
        <a href="#product" onClick={()=>setMenuOpen(false)}>Product</a>
        <a href="#workflow" onClick={()=>setMenuOpen(false)}>How it works</a>
        <a href="#platform" onClick={()=>setMenuOpen(false)}>Platform</a>
        <a href="#field" onClick={()=>setMenuOpen(false)}>Built for field work</a>
        <NavLink className="mobile-client" to="/client-join">Client portal</NavLink>
      </nav>
      <div className="nb-nav-actions">
        <NavLink className="nb-client" to="/client-join">Client portal</NavLink>
        <NavLink className="nb-signin" to="/login">Sign in <ArrowRight size={16}/></NavLink>
        <button className="nb-menu" type="button" aria-label="Toggle navigation" onClick={()=>setMenuOpen(value=>!value)}>{menuOpen?<X/>:<Menu/>}</button>
      </div>
    </header>

    <section className="nb-hero">
      <div className="hero-copy">
        <div className="eyebrow"><span/> FIELD OPERATIONS, CONNECTED</div>
        <h1>Run the day.<br/><em>Not the paperwork.</em></h1>
        <p>Northborn connects dispatch, jobs, crews, fleet, field tickets, safety and billing so your operation moves as one system.</p>
        <div className="hero-actions">
          <NavLink className="btn-primary" to="/login">Open Northborn <ArrowRight size={18}/></NavLink>
          <a className="btn-quiet" href="#product">See the product <ChevronRight size={17}/></a>
        </div>
        <div className="hero-trust">
          <span><Check/>Built from field experience</span>
          <span><Check/>Phone, tablet and desktop</span>
          <span><Check/>Role aware by design</span>
        </div>
      </div>

      <div className="hero-product">
        <div className="hero-glow"/>
        <ManagerProduct/>
        <div className="hero-phone"><PhoneProduct mode="operator"/></div>
        <div className="field-note"><HardHat size={18}/><span>BUILT<br/>FROM THE FIELD</span></div>
      </div>
    </section>

    <section className="nb-strip" aria-label="Common tools Northborn replaces">
      <span>ONE OPERATING SYSTEM</span>
      <div><b>Dispatch board</b><i/> <b>Group texts</b><i/> <b>Paper tickets</b><i/> <b>Spreadsheets</b><i/> <b>Shared drives</b></div>
    </section>

    <section className="nb-section product-section" id="product">
      <div className="section-copy">
        <span className="section-label">THE RIGHT VIEW FOR THE RIGHT PERSON</span>
        <h2>One operation.<br/>Three very different jobs.</h2>
        <p>Northborn does not make a manager, an operator and a customer fight through the same crowded software.</p>
        <div className="role-tabs" role="tablist">
          {roles.map(item=><button key={item.key} type="button" role="tab" aria-selected={activeRole===item.key} className={activeRole===item.key?'active':''} onClick={()=>setActiveRole(item.key)}>{item.label}</button>)}
        </div>
        <div className="role-copy">
          <small>{role.eyebrow}</small>
          <h3>{role.title}</h3>
          <p>{role.copy}</p>
        </div>
      </div>
      <div className={"role-product "+activeRole}>
        {activeRole==='manager'?<ManagerProduct/>:<PhoneProduct mode={activeRole}/>}
      </div>
    </section>

    <section className="nb-section workflow-section" id="workflow">
      <div className="section-heading">
        <div><span className="section-label">REQUEST TO REVENUE</span><h2>The job should only be entered once.</h2></div>
        <p>Information follows the work from the first call to the final invoice instead of being copied from system to system.</p>
      </div>
      <div className="workflow-line">
        <article><span>01</span><div><BriefcaseBusiness size={22}/></div><small>REQUEST</small><h3>Create the job</h3><p>Customer, site, contacts and scope start together.</p></article>
        <article><span>02</span><div><CalendarDays size={22}/></div><small>DISPATCH</small><h3>Build the day</h3><p>Schedule it, assign people and equipment, then release it.</p></article>
        <article><span>03</span><div><ClipboardCheck size={22}/></div><small>FIELD</small><h3>Complete the work</h3><p>The crew gets the job, safety, tickets and time on their phone.</p></article>
        <article><span>04</span><div><ReceiptText size={22}/></div><small>BILLING</small><h3>Close the loop</h3><p>Approved field work flows into invoicing and payment tracking.</p></article>
      </div>
    </section>

    <section className="nb-section platform-section" id="platform">
      <div className="section-heading">
        <div><span className="section-label">THE PLATFORM</span><h2>Everything important stays attached to the work.</h2></div>
        <p>Fewer disconnected tools means less retyping, fewer missing documents and a clearer picture of what is actually happening.</p>
      </div>
      <div className="capability-grid">
        {capabilities.map(({icon:Icon,title,copy},index)=><article key={title} className={index===0||index===3?'wide':''}><div className="cap-icon"><Icon/></div><div><h3>{title}</h3><p>{copy}</p></div><ChevronRight size={18}/></article>)}
      </div>
    </section>

    <section className="field-section" id="field">
      <div className="field-copy">
        <span className="section-label">BUILT FOR THE REAL CONDITIONS</span>
        <h2>The office is only one place the work happens.</h2>
        <p>Northborn is designed around the truck, the shop, the field and the office. That means fast mobile workflows, clear role based access and room for weak service.</p>
        <div className="industry-list"><span>Hydrovac</span><span>Vacuum</span><span>Steaming</span><span>Water hauling</span><span>Trucking</span><span>Construction</span><span>Oilfield</span><span>Industrial</span></div>
      </div>
      <div className="field-features">
        <article><Smartphone/><div><h3>Made for phones</h3><p>Large controls, simple hierarchy and field focused workflows.</p></div></article>
        <article><WifiOff/><div><h3>Ready for weak service</h3><p>Offline capable workflows keep critical field tasks moving.</p></div></article>
        <article><Users/><div><h3>Different access by role</h3><p>People see what they need without exposing the rest of the operation.</p></div></article>
        <article><Wrench/><div><h3>Built around real operations</h3><p>The system follows how industrial service work actually moves.</p></div></article>
      </div>
    </section>

    <section className="nb-final">
      <div><span className="section-label">NORTHBORN</span><h2>One place to run the work.</h2><p>Bring the day together from dispatch to field completion and billing.</p></div>
      <div><NavLink className="btn-primary" to="/login">Sign in or create account <ArrowRight size={18}/></NavLink><NavLink className="btn-quiet" to="/client-join">Client portal <ChevronRight size={17}/></NavLink></div>
    </section>

    <footer className="nb-footer">
      <Brand/>
      <p>Field operations, built from the field.</p>
      <div><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#platform">Platform</a><NavLink to="/login">Sign in</NavLink></div>
    </footer>
  </main>
}
