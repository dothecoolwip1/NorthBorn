import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileWarning,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import './operator-field-forms.css'

const db = supabase as any

type Props = {
  organizationId: string
  organizationName: string
  userId: string
}

type Employee = {
  id: string
  user_id: string | null
  first_name: string
  last_name: string
  position: string | null
}

type Job = {
  id: string
  customer_id: string | null
  job_number: string
  title: string
  site_name: string | null
  site_address: string | null
  status: string
  onsite_time: string | null
  scheduled_start: string | null
}

type Customer = { id: string; name: string }
type Assignment = { id: string; job_id: string; employee_id: string | null; vehicle_id: string | null; role: string | null }
type Vehicle = { id: string; unit_number: string; name: string | null; vehicle_type: string; status: string }
type Submission = { id:string; form_type:string; title:string; status:string; submitted_at:string|null; created_at:string; answers:Record<string,unknown> }

type Mode = 'home' | 'pretrip' | 'equipment' | 'incident' | 'near_miss'
type CheckResult = 'pass' | 'defect' | 'na' | ''
type DefectSeverity = 'Minor' | 'Major' | 'Critical'

type InspectionItem = {
  key: string
  label: string
  result: CheckResult
  description: string
  severity: DefectSeverity
  removeFromService: boolean
  photo: File | null
}

const PRETRIP_ITEMS = [
  ['lights', 'Lights, signals and reflectors'],
  ['tires', 'Tires, wheels and lug nuts'],
  ['brakes', 'Brakes, air system and warning devices'],
  ['steering', 'Steering and suspension'],
  ['glass', 'Mirrors, windshield and wipers'],
  ['horn', 'Horn, backup alarm and beacon'],
  ['leaks', 'Fluid, air, hydraulic and water leaks'],
  ['pto', 'PTO, driveline, hoses and guards'],
  ['vac_system', 'Vacuum, water and pressure systems'],
  ['boom', 'Boom, hose, reel and securement'],
  ['emergency', 'Fire extinguisher, triangles and emergency gear'],
  ['load', 'Tools, load and loose-item securement'],
] as const

function localDateTime() {
  const date = new Date()
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(parsed)
}

function safeFileName(name:string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'attachment'
}

function freshInspection(): InspectionItem[] {
  return PRETRIP_ITEMS.map(([key,label]) => ({ key, label, result:'', description:'', severity:'Minor', removeFromService:false, photo:null }))
}

function formLabel(value:string) {
  if (value === 'vehicle_equipment_inspection') return 'Inspection'
  if (value === 'incident_report') return 'Incident'
  if (value === 'near_miss') return 'Near Miss'
  return value.replaceAll('_',' ').replace(/\b\w/g, character => character.toUpperCase())
}

export default function OperatorFieldFormsPage({ organizationId, organizationName, userId }: Props) {
  const [searchParams] = useSearchParams()
  const requestedJobId = searchParams.get('job') || ''
  const [employee,setEmployee] = useState<Employee|null>(null)
  const [jobs,setJobs] = useState<Job[]>([])
  const [customers,setCustomers] = useState<Customer[]>([])
  const [assignments,setAssignments] = useState<Assignment[]>([])
  const [vehicles,setVehicles] = useState<Vehicle[]>([])
  const [submissions,setSubmissions] = useState<Submission[]>([])
  const [jobId,setJobId] = useState('')
  const [mode,setMode] = useState<Mode>('home')
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [employeeResult,jobsResult,customersResult,assignmentsResult,vehiclesResult,submissionsResult] = await Promise.all([
      db.from('employees').select('id,user_id,first_name,last_name,position').eq('organization_id',organizationId).eq('user_id',userId).limit(1).maybeSingle(),
      db.from('jobs').select('id,customer_id,job_number,title,site_name,site_address,status,onsite_time,scheduled_start').eq('organization_id',organizationId).neq('status','cancelled').order('onsite_time',{ascending:true,nullsFirst:false}),
      db.from('customers').select('id,name').eq('organization_id',organizationId).eq('status','active').order('name'),
      db.from('dispatch_assignments').select('id,job_id,employee_id,vehicle_id,role').eq('organization_id',organizationId),
      db.from('fleet_vehicles').select('id,unit_number,name,vehicle_type,status').eq('organization_id',organizationId).neq('status','archived').order('unit_number'),
      db.from('safety_form_submissions').select('id,form_type,title,status,submitted_at,created_at,answers,employee_id').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(40),
    ])
    const firstError = employeeResult.error || jobsResult.error || customersResult.error || assignmentsResult.error || vehiclesResult.error || submissionsResult.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    const ownEmployee = employeeResult.data as Employee|null
    const assignmentRows = (assignmentsResult.data || []) as Assignment[]
    const ownJobIds = new Set(assignmentRows.filter(item => item.employee_id === ownEmployee?.id).map(item => item.job_id))
    const ownJobs = ((jobsResult.data || []) as Job[]).filter(job => ownJobIds.has(job.id))
    setEmployee(ownEmployee)
    setJobs(ownJobs)
    setCustomers((customersResult.data || []) as Customer[])
    setAssignments(assignmentRows.filter(item => ownJobIds.has(item.job_id)))
    setVehicles((vehiclesResult.data || []) as Vehicle[])
    setSubmissions(((submissionsResult.data || []) as Array<Submission & { employee_id?:string|null }>).filter(item => !ownEmployee || item.employee_id === ownEmployee.id).slice(0,12))
    setLoading(false)
  }, [organizationId,userId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (loading || !jobs.length || jobId) return
    const requested = jobs.find(job => job.id === requestedJobId)
    const active = jobs.find(job => !['completed','cancelled'].includes(job.status))
    setJobId(requested?.id || active?.id || jobs[0]?.id || '')
  }, [loading,jobs,requestedJobId,jobId])

  const selectedJob = useMemo(() => jobs.find(job => job.id === jobId) || null,[jobs,jobId])
  const selectedCustomer = useMemo(() => customers.find(customer => customer.id === selectedJob?.customer_id) || null,[customers,selectedJob])
  const assignedVehicles = useMemo(() => {
    const ids = new Set(assignments.filter(item => item.job_id === jobId && item.vehicle_id).map(item => item.vehicle_id as string))
    return vehicles.filter(vehicle => ids.has(vehicle.id))
  },[assignments,vehicles,jobId])

  const submit = async (formType:string,title:string,answers:Record<string,unknown>,files:File[] = []) => {
    if (!employee) {
      setError('Your login is not linked to an employee record yet.')
      return false
    }
    setBusy(true)
    setError('')
    setSuccess('')
    const now = new Date().toISOString()
    const context = selectedJob ? {
      job_id:selectedJob.id,
      job_number:selectedJob.job_number,
      title:selectedJob.title,
      customer_id:selectedJob.customer_id,
      customer_name:selectedCustomer?.name || null,
      site_name:selectedJob.site_name,
      site_address:selectedJob.site_address,
      assigned_units:assignedVehicles.map(vehicle => ({ id:vehicle.id, unit_number:vehicle.unit_number, name:vehicle.name, vehicle_type:vehicle.vehicle_type })),
    } : null
    const row = {
      organization_id:organizationId,
      employee_id:employee.id,
      job_id:selectedJob?.id || null,
      form_type:formType,
      title,
      answers:{
        ...answers,
        field_context:{
          organization_name:organizationName,
          operator:{ id:employee.id, name:`${employee.first_name} ${employee.last_name}`, position:employee.position },
          captured_at:now,
          job:context,
        },
      },
      status:'submitted',
      submitted_by:userId,
      submitted_at:now,
      reviewed_by:null,
      reviewed_at:null,
      review_notes:null,
    }
    const inserted = await db.from('safety_form_submissions').insert(row).select('id').single()
    if (inserted.error) {
      setBusy(false)
      setError(inserted.error.message)
      return false
    }
    const uploaded:string[] = []
    try {
      for (const file of files.slice(0,8)) {
        const path = `${organizationId}/forms/${inserted.data.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
        const upload = await supabase.storage.from('safety-files').upload(path,file,{contentType:file.type || undefined})
        if (upload.error) throw upload.error
        uploaded.push(path)
        const meta = await db.from('safety_form_attachments').insert({
          organization_id:organizationId,
          submission_id:inserted.data.id,
          file_name:file.name,
          storage_path:path,
          mime_type:file.type || null,
          file_size:file.size,
          created_by:userId,
        })
        if (meta.error) throw meta.error
      }
    } catch (caught:any) {
      for (const path of uploaded) await supabase.storage.from('safety-files').remove([path])
      await db.from('safety_form_submissions').delete().eq('id',inserted.data.id).eq('organization_id',organizationId)
      setBusy(false)
      setError(caught?.message || String(caught))
      return false
    }
    setBusy(false)
    setSuccess(`${title} submitted.`)
    setMode('home')
    await load()
    window.scrollTo({top:0,behavior:'smooth'})
    return true
  }

  if (loading) return <div className="operator-field-loading">Loading field forms…</div>
  if (!employee) return <section className="operator-field-page"><div className="operator-field-message error"><AlertTriangle/><span>Your login is not linked to an employee record yet.</span></div></section>

  if (mode === 'incident') {
    return <QuickReport
      kind="incident"
      title="Incident report"
      job={selectedJob}
      busy={busy}
      onBack={() => setMode('home')}
      onSubmit={(answers,files) => submit('incident_report',`Incident${selectedJob ? ` · ${selectedJob.job_number}` : ''}`,answers,files)}
    />
  }

  if (mode === 'near_miss') {
    return <QuickReport
      kind="near_miss"
      title="Near miss"
      job={selectedJob}
      busy={busy}
      onBack={() => setMode('home')}
      onSubmit={(answers,files) => submit('near_miss',`Near Miss${selectedJob ? ` · ${selectedJob.job_number}` : ''}`,answers,files)}
    />
  }

  if (mode === 'pretrip' || mode === 'equipment') {
    return <InspectionForm
      mode={mode}
      job={selectedJob}
      vehicles={assignedVehicles.length ? assignedVehicles : vehicles.filter(vehicle => vehicle.status === 'active')}
      busy={busy}
      onBack={() => setMode('home')}
      onSubmit={async (answers,files) => {
        const short = mode === 'pretrip' ? 'Pre-trip' : 'Equipment Inspection'
        return submit('vehicle_equipment_inspection',`${short}${selectedJob ? ` · ${selectedJob.job_number}` : ''}`,answers,files)
      }}
    />
  }

  const flhaHref = jobId ? `/safety/flha?job=${encodeURIComponent(jobId)}` : '/safety/flha'

  return <section className="operator-field-page">
    <header className="operator-field-hero">
      <div><span>FIELD FORMS</span><h1>Paperwork that starts with the job.</h1><p>Northborn fills in the context it already knows so you can focus on the inspection, event or safety decision.</p></div>
      <button type="button" onClick={() => void load()}><RefreshCw size={17}/>Refresh</button>
    </header>

    {error && <div className="operator-field-message error"><AlertTriangle/><span>{error}</span></div>}
    {success && <div className="operator-field-message success"><CheckCircle2/><span>{success}</span></div>}

    <section className="operator-field-context">
      <div className="operator-field-context-head"><div><span>JOB CONTEXT</span><strong>{selectedJob ? selectedJob.job_number : 'No assigned job selected'}</strong></div><ClipboardList size={20}/></div>
      {jobs.length ? <label>Assigned job<select value={jobId} onChange={event => setJobId(event.target.value)}>{jobs.map(job => <option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>)}</select></label> : <div className="operator-field-no-job">No assigned jobs are available. Incident and equipment forms can still be completed without a job.</div>}
      {selectedJob && <div className="operator-field-context-grid">
        <div><MapPin/><span><small>SITE</small><strong>{selectedJob.site_name || selectedJob.site_address || 'Site not set'}</strong>{selectedJob.site_name && selectedJob.site_address && <em>{selectedJob.site_address}</em>}</span></div>
        <div><UserRound/><span><small>OPERATOR</small><strong>{employee.first_name} {employee.last_name}</strong><em>{employee.position || 'Operator'}</em></span></div>
        <div><Truck/><span><small>UNIT</small><strong>{assignedVehicles.length ? assignedVehicles.map(vehicle => `#${vehicle.unit_number}`).join(', ') : 'No assigned unit'}</strong><em>{selectedCustomer?.name || 'Customer not set'}</em></span></div>
        <div><Clock3/><span><small>SCHEDULE</small><strong>{formatDateTime(selectedJob.onsite_time || selectedJob.scheduled_start)}</strong><em>Current job context</em></span></div>
      </div>}
    </section>

    <section className="operator-field-launchers" aria-label="Field forms">
      <button type="button" onClick={() => setMode('pretrip')}><Truck/><span><strong>Pre-trip</strong><small>Tap through Pass, Defect or N/A</small></span><ChevronRight/></button>
      <NavLink to={flhaHref}><ShieldCheck/><span><strong>FLHA</strong><small>Hazards, controls and crew review</small></span><ChevronRight/></NavLink>
      <button type="button" onClick={() => setMode('incident')}><FileWarning/><span><strong>Incident</strong><small>Record what happened while details are fresh</small></span><ChevronRight/></button>
      <button type="button" onClick={() => setMode('near_miss')}><ShieldAlert/><span><strong>Near miss</strong><small>Capture what almost happened and the fix</small></span><ChevronRight/></button>
      <button type="button" onClick={() => setMode('equipment')}><Wrench/><span><strong>Equipment inspection</strong><small>Inspection with defect escalation</small></span><ChevronRight/></button>
    </section>

    <section className="operator-field-recent">
      <div><span>RECENT</span><h2>My submitted forms</h2></div>
      {submissions.length ? submissions.map(item => <article key={item.id}><div><strong>{item.title}</strong><span>{formLabel(item.form_type)} · {formatDateTime(item.submitted_at || item.created_at)}</span></div><em>{item.status}</em></article>) : <div className="operator-field-empty">No field forms submitted yet.</div>}
    </section>
  </section>
}

function QuickReport({ kind, title, job, busy, onBack, onSubmit }: {
  kind:'incident'|'near_miss'
  title:string
  job:Job|null
  busy:boolean
  onBack:()=>void
  onSubmit:(answers:Record<string,unknown>,files:File[])=>Promise<boolean>
}) {
  const [occurredAt,setOccurredAt] = useState(localDateTime())
  const [location,setLocation] = useState(job?.site_name || job?.site_address || '')
  const [description,setDescription] = useState('')
  const [people,setPeople] = useState('')
  const [impact,setImpact] = useState('')
  const [action,setAction] = useState('')
  const [reportedTo,setReportedTo] = useState('')
  const [potential,setPotential] = useState('')
  const [files,setFiles] = useState<File[]>([])
  const [error,setError] = useState('')

  const send = async (event:React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!description.trim() || !location.trim()) return setError('Add the location and a clear description before submitting.')
    const answers = kind === 'incident'
      ? {
          incident_at:occurredAt,
          location:location.trim(),
          people_involved:people.trim(),
          description:description.trim(),
          injury_damage:impact.trim(),
          immediate_actions:action.trim(),
          reported_to:reportedTo.trim(),
        }
      : {
          occurred_at:occurredAt,
          location:location.trim(),
          description:description.trim(),
          potential_consequence:potential.trim(),
          corrective_action:action.trim(),
        }
    await onSubmit(answers,files)
  }

  return <section className="operator-field-page operator-field-form-page">
    <header className="operator-field-form-header"><button type="button" onClick={onBack}><ChevronLeft/>Forms</button><div><span>{kind === 'incident' ? 'SAFETY EVENT' : 'LEARNING EVENT'}</span><h1>{title}</h1><p>{job ? `${job.job_number} · ${job.title}` : 'No job linked'}</p></div></header>
    {error && <div className="operator-field-message error"><AlertTriangle/><span>{error}</span></div>}
    <form className="operator-quick-report" onSubmit={event => void send(event)}>
      <label>Date and time<input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} required/></label>
      <label>Location<input value={location} onChange={event => setLocation(event.target.value)} required placeholder="Site, road, shop or work area"/></label>
      {kind === 'incident' && <label>People involved or witnesses<input value={people} onChange={event => setPeople(event.target.value)} placeholder="Names or crew roles"/></label>}
      <label>{kind === 'incident' ? 'What happened?' : 'What almost happened?'}<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} required placeholder="Short, factual description"/></label>
      {kind === 'incident'
        ? <label>Injury, damage, spill or loss<textarea rows={3} value={impact} onChange={event => setImpact(event.target.value)} placeholder="What was affected?"/></label>
        : <label>Potential consequence<textarea rows={3} value={potential} onChange={event => setPotential(event.target.value)} placeholder="What could have happened?"/></label>}
      <label>{kind === 'incident' ? 'Immediate actions taken' : 'What was corrected or changed?'}<textarea rows={4} value={action} onChange={event => setAction(event.target.value)} required placeholder="Isolation, cleanup, stop work, barricade, repair, coaching…"/></label>
      {kind === 'incident' && <label>Who was notified?<input value={reportedTo} onChange={event => setReportedTo(event.target.value)} placeholder="Supervisor, client, emergency services…"/></label>}
      <label className="operator-field-photo"><Camera/><span><strong>{files.length ? `${files.length} photo/file${files.length===1?'':'s'} selected` : 'Add photos'}</strong><small>Optional · up to 8 photos or PDFs</small></span><input type="file" multiple accept=".pdf,image/*" capture="environment" onChange={event => setFiles(Array.from(event.target.files || []).slice(0,8))}/></label>
      <button className="operator-field-submit" type="submit" disabled={busy}>{busy ? 'Submitting…' : `Submit ${title.toLowerCase()}`}<CheckCircle2/></button>
    </form>
  </section>
}

function InspectionForm({ mode, job, vehicles, busy, onBack, onSubmit }: {
  mode:'pretrip'|'equipment'
  job:Job|null
  vehicles:Vehicle[]
  busy:boolean
  onBack:()=>void
  onSubmit:(answers:Record<string,unknown>,files:File[])=>Promise<boolean>
}) {
  const [vehicleId,setVehicleId] = useState(vehicles[0]?.id || '')
  const [inspectionType,setInspectionType] = useState(mode === 'pretrip' ? 'Pre-use' : 'Weekly')
  const [meter,setMeter] = useState('')
  const [items,setItems] = useState<InspectionItem[]>(freshInspection())
  const [correctiveAction,setCorrectiveAction] = useState('')
  const [error,setError] = useState('')

  const vehicle = vehicles.find(item => item.id === vehicleId) || null
  const completed = items.filter(item => item.result).length
  const defects = items.filter(item => item.result === 'defect')
  const updateItem = (key:string,patch:Partial<InspectionItem>) => setItems(current => current.map(item => item.key === key ? {...item,...patch} : item))

  const send = async (event:React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!vehicle) return setError('Choose the unit or equipment being inspected.')
    if (completed !== items.length) return setError(`Complete all ${items.length} inspection checks before submitting.`)
    const incompleteDefect = defects.find(item => !item.description.trim())
    if (incompleteDefect) return setError(`Describe the defect for ${incompleteDefect.label}.`)
    const outOfService = defects.some(item => item.removeFromService)
    const result = outOfService ? 'Fail / remove from service' : defects.length ? 'Pass with defects' : 'Pass'
    const files = defects.map(item => item.photo).filter(Boolean) as File[]
    const defectSummary = defects.map(item => `${item.label}: ${item.description.trim()} [${item.severity}]${item.removeFromService ? ' REMOVE FROM SERVICE' : ''}`).join('\n')
    const answers = {
      unit_equipment:`Unit ${vehicle.unit_number} · ${vehicle.name || vehicle.vehicle_type}`,
      inspection_type:inspectionType,
      result,
      meter_reading:meter.trim(),
      items_checked:`${items.filter(item => item.result === 'pass').length} pass · ${defects.length} defect · ${items.filter(item => item.result === 'na').length} N/A`,
      defects:defectSummary,
      corrective_action:correctiveAction.trim(),
      inspection_items:items.map(item => ({
        key:item.key,
        label:item.label,
        result:item.result,
        defect:item.result === 'defect' ? {
          description:item.description.trim(),
          severity:item.severity,
          remove_from_service:item.removeFromService,
          photo_name:item.photo?.name || null,
        } : null,
      })),
      inspection_context:{
        inspected_at:new Date().toISOString(),
        job_id:job?.id || null,
        vehicle_id:vehicle.id,
        unit_number:vehicle.unit_number,
      },
    }
    await onSubmit(answers,files)
  }

  return <section className="operator-field-page operator-field-form-page">
    <header className="operator-field-form-header"><button type="button" onClick={onBack}><ChevronLeft/>Forms</button><div><span>{mode === 'pretrip' ? 'PRE-TRIP' : 'EQUIPMENT'}</span><h1>{mode === 'pretrip' ? 'Pre-trip inspection' : 'Equipment inspection'}</h1><p>{job ? `${job.job_number} · ${job.title}` : 'No job linked'}</p></div></header>
    {error && <div className="operator-field-message error"><AlertTriangle/><span>{error}</span></div>}

    <form className="operator-inspection" onSubmit={event => void send(event)}>
      <section className="operator-inspection-setup">
        <label>Unit / equipment<select value={vehicleId} onChange={event => setVehicleId(event.target.value)} required><option value="">Choose unit</option>{vehicles.map(item => <option key={item.id} value={item.id}>Unit {item.unit_number} · {item.name || item.vehicle_type}</option>)}</select></label>
        {mode === 'equipment' && <label>Inspection type<select value={inspectionType} onChange={event => setInspectionType(event.target.value)}><option>Pre-use</option><option>Post-use</option><option>Weekly</option><option>Monthly</option><option>Shop</option><option>Other</option></select></label>}
        <label>Km / hours <span>Optional</span><input inputMode="decimal" value={meter} onChange={event => setMeter(event.target.value)} placeholder="Current meter reading"/></label>
      </section>

      <div className="operator-inspection-progress"><div><strong>{completed}/{items.length}</strong><span>checks completed</span></div><div className="operator-inspection-progress-track"><i style={{width:`${Math.round(completed/items.length*100)}%`}}/></div></div>

      <section className="operator-inspection-list">
        {items.map((item,index) => <article className={item.result === 'defect' ? 'defect' : item.result ? 'complete' : ''} key={item.key}>
          <div className="operator-inspection-item-head"><span>{String(index+1).padStart(2,'0')}</span><strong>{item.label}</strong>{item.result === 'pass' && <Check size={18}/>}</div>
          <div className="operator-inspection-choices" role="group" aria-label={item.label}>
            <button type="button" className={item.result === 'pass' ? 'selected pass' : ''} onClick={() => updateItem(item.key,{result:'pass',description:'',removeFromService:false,photo:null})}><Check/>Pass</button>
            <button type="button" className={item.result === 'defect' ? 'selected defect' : ''} onClick={() => updateItem(item.key,{result:'defect'})}><AlertTriangle/>Defect</button>
            <button type="button" className={item.result === 'na' ? 'selected na' : ''} onClick={() => updateItem(item.key,{result:'na',description:'',removeFromService:false,photo:null})}><X/>N/A</button>
          </div>
          {item.result === 'defect' && <div className="operator-defect-detail">
            <label>Describe the defect<textarea rows={3} required value={item.description} onChange={event => updateItem(item.key,{description:event.target.value})} placeholder="What is wrong, where is it, and what did you observe?"/></label>
            <label>Severity<select value={item.severity} onChange={event => updateItem(item.key,{severity:event.target.value as DefectSeverity})}><option>Minor</option><option>Major</option><option>Critical</option></select></label>
            <label className="operator-remove-service"><input type="checkbox" checked={item.removeFromService} onChange={event => updateItem(item.key,{removeFromService:event.target.checked})}/><span><strong>Remove from service</strong><small>Unit/equipment should not be operated until corrected.</small></span></label>
            <label className="operator-field-photo compact"><Camera/><span><strong>{item.photo ? item.photo.name : 'Add defect photo'}</strong><small>Optional, but recommended for defects</small></span><input type="file" accept="image/*" capture="environment" onChange={event => updateItem(item.key,{photo:event.target.files?.[0] || null})}/></label>
          </div>}
        </article>)}
      </section>

      {defects.length > 0 && <label className="operator-inspection-corrective">Corrective action / repair request<textarea rows={4} value={correctiveAction} onChange={event => setCorrectiveAction(event.target.value)} placeholder="What was fixed now, or what needs follow-up?"/></label>}

      <button className="operator-field-submit" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit inspection'}<ClipboardCheck/></button>
    </form>
  </section>
}
