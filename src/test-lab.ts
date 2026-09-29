import { createRichCoreSeed, createRichDemoBundle } from './rich-demo-seed'
export const TEST_MODE_KEY = 'northborn_test_mode'
export const TEST_PERSONA_KEY = 'northborn_test_persona'
export const TEST_DATA_KEY = 'northborn_test_data_v3'
export const TEST_SCHEMA_VERSION_KEY = 'northborn_test_schema_version'
export const TEST_CLIENT_REQUESTS_KEY = 'northborn_test_client_requests_v1'
export const TEST_CLIENT_CONTACTS_KEY = 'northborn_test_client_contacts_v1'
export const TEST_CLIENT_JOB_META_KEY = 'northborn_test_client_job_meta_v1'

const CURRENT_TEST_SCHEMA_VERSION = '4'

export type TestPersona = 'manager' | 'operator' | 'client'

export const TEST_ORG = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Northborn Test Company',
}

export const TEST_USERS = {
  manager: { id: 'test-manager', email: 'Manager@test.com', label: 'Manager' },
  operator: { id: 'test-operator', email: 'Operator@test.com', label: 'Operator' },
  client: { id: 'test-client', email: 'Client@test.com', label: 'Client' },
} as const

type TestCustomer = { id:string; organization_id:string; name:string; billing_email:string|null; phone:string|null; address:string|null; notes:string|null; status:string }
type TestEmployee = { id:string; organization_id:string; user_id?:string|null; first_name:string; last_name:string; email:string|null; phone:string|null; position:string|null; status:string }
type TestVehicle = { id:string; organization_id:string; unit_number:string; name:string|null; vehicle_type:string; plate:string|null; status:string; odometer_km?:number|null; engine_hours?:number|null; year?:number|null; make?:string|null; model?:string|null; color?:string|null; vin?:string|null; primary_operator_id?:string|null; registration_expiry?:string|null; insurance_expiry?:string|null; annual_inspection_expiry?:string|null; notes?:string|null; last_service_date?:string|null }
type TestJob = { id:string; organization_id:string; customer_id:string; job_number:string; title:string; site_name:string|null; site_address:string|null; scheduled_start:string|null; scheduled_end:string|null; status:string; dispatch_stage?:string|null; notes:string|null; shop_time?:string|null; onsite_time?:string|null; completed_at?:string|null; dispatch_acknowledged_at?:string|null; en_route_at?:string|null; onsite_at?:string|null; work_started_at?:string|null; work_completed_at?:string|null; dispatch_contact_name?:string|null; dispatch_contact_phone?:string|null; emergency_contact_name?:string|null; emergency_contact_phone?:string|null; primary_operator_employee_id?:string|null; recurrence_series_id?:string|null; recurrence_rule?:string|null; recurrence_parent_id?:string|null }
type TestAssignment = { id:string; organization_id:string; job_id:string; employee_id:string|null; vehicle_id:string|null; role:string|null }
export type TestLabData = { customers:TestCustomer[]; employees:TestEmployee[]; vehicles:TestVehicle[]; jobs:TestJob[]; assignments:TestAssignment[] }

const uid = () => crypto.randomUUID()

function seed(): TestLabData {
  return createRichCoreSeed(TEST_ORG.id, TEST_USERS.operator.id) as TestLabData
}

function normalizeTestData(value: unknown): TestLabData | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<TestLabData>
  if (![parsed.customers, parsed.employees, parsed.vehicles, parsed.jobs, parsed.assignments].every(Array.isArray)) return null

  const customers = parsed.customers!.map(customer => ({
    id: customer.id || uid(),
    organization_id: TEST_ORG.id,
    name: customer.name || 'Test Client',
    billing_email: customer.billing_email ?? null,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    notes: customer.notes ?? null,
    status: customer.status || 'active',
  }))

  const employees = parsed.employees!.map(employee => ({
    id: employee.id || uid(),
    organization_id: TEST_ORG.id,
    user_id: employee.user_id ?? null,
    first_name: employee.first_name || 'Test',
    last_name: employee.last_name || 'Employee',
    email: employee.email ?? null,
    phone: employee.phone ?? null,
    position: employee.position ?? null,
    status: employee.status || 'active',
  }))

  const operator = employees.find(employee => employee.position?.toLowerCase() === 'operator')
  if (operator) {
    operator.user_id = TEST_USERS.operator.id
    operator.email = operator.email || TEST_USERS.operator.email
  }

  const vehicles = parsed.vehicles!.map(vehicle => ({
    id: vehicle.id || uid(),
    organization_id: TEST_ORG.id,
    unit_number: vehicle.unit_number || 'TEST',
    name: vehicle.name ?? null,
    vehicle_type: vehicle.vehicle_type || 'Truck',
    plate: vehicle.plate ?? null,
    status: vehicle.status || 'available',
    odometer_km: vehicle.odometer_km ?? null,
    engine_hours: vehicle.engine_hours ?? null,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    color: vehicle.color ?? null,
    vin: vehicle.vin ?? null,
    primary_operator_id: vehicle.primary_operator_id ?? null,
    registration_expiry: vehicle.registration_expiry ?? null,
    insurance_expiry: vehicle.insurance_expiry ?? null,
    annual_inspection_expiry: vehicle.annual_inspection_expiry ?? null,
    notes: vehicle.notes ?? null,
    last_service_date: vehicle.last_service_date ?? null,
  }))

  const jobs = parsed.jobs!.map(job => ({
    id: job.id || uid(),
    organization_id: TEST_ORG.id,
    customer_id: job.customer_id || customers[0]?.id || 'test-customer',
    job_number: job.job_number || `TEST-${Date.now()}`,
    title: job.title || 'Test Job',
    site_name: job.site_name ?? null,
    site_address: job.site_address ?? null,
    scheduled_start: job.scheduled_start ?? job.onsite_time ?? null,
    scheduled_end: job.scheduled_end ?? null,
    status: job.status || 'scheduled',
    dispatch_stage: job.dispatch_stage ?? (job.status === 'completed' ? 'work_completed' : job.status === 'dispatched' ? 'dispatched' : 'unassigned'),
    notes: job.notes ?? null,
    shop_time: job.shop_time ?? null,
    onsite_time: job.onsite_time ?? job.scheduled_start ?? null,
    completed_at: job.completed_at ?? null,
    dispatch_acknowledged_at: job.dispatch_acknowledged_at ?? null,
    en_route_at: job.en_route_at ?? null,
    onsite_at: job.onsite_at ?? null,
    work_started_at: job.work_started_at ?? null,
    work_completed_at: job.work_completed_at ?? null,
    dispatch_contact_name: job.dispatch_contact_name ?? null,
    dispatch_contact_phone: job.dispatch_contact_phone ?? null,
    emergency_contact_name: job.emergency_contact_name ?? null,
    emergency_contact_phone: job.emergency_contact_phone ?? null,
    primary_operator_employee_id: job.primary_operator_employee_id ?? null,
    recurrence_series_id: job.recurrence_series_id ?? null,
    recurrence_rule: job.recurrence_rule ?? null,
    recurrence_parent_id: job.recurrence_parent_id ?? null,
  }))

  const assignments = parsed.assignments!.map(assignment => ({
    id: assignment.id || uid(),
    organization_id: TEST_ORG.id,
    job_id: assignment.job_id,
    employee_id: assignment.employee_id ?? null,
    vehicle_id: assignment.vehicle_id ?? null,
    role: assignment.role ?? null,
  })).filter(assignment => Boolean(assignment.job_id))

  return { customers, employees, vehicles, jobs, assignments }
}

function storeSchemaVersion() {
  try { localStorage.setItem(TEST_SCHEMA_VERSION_KEY, CURRENT_TEST_SCHEMA_VERSION) } catch {}
}

const GENERIC_PREFIX = 'northborn_test_table_v1_'
const TEST_INVOICES_KEY = 'northborn_test_invoices_v1'
const TEST_MAINTENANCE_KEY = 'northborn_test_fleet_v2'

function seedRichTables(data: TestLabData, force = false) {
  const bundle = createRichDemoBundle(data, TEST_ORG.id, TEST_USERS)
  for (const [table, rows] of Object.entries(bundle.generic)) {
    const key = GENERIC_PREFIX + table
    if (force || !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(rows))
  }
  if (force || !localStorage.getItem(TEST_INVOICES_KEY)) localStorage.setItem(TEST_INVOICES_KEY, JSON.stringify(bundle.invoices))
  if (force || !localStorage.getItem(TEST_MAINTENANCE_KEY)) localStorage.setItem(TEST_MAINTENANCE_KEY, JSON.stringify(bundle.maintenance))
  if (force || !localStorage.getItem(TEST_CLIENT_REQUESTS_KEY)) localStorage.setItem(TEST_CLIENT_REQUESTS_KEY, JSON.stringify(bundle.clientRequests))
  if (force || !localStorage.getItem(TEST_CLIENT_CONTACTS_KEY)) localStorage.setItem(TEST_CLIENT_CONTACTS_KEY, JSON.stringify(bundle.portalContacts))
}

export function isTestMode() { return localStorage.getItem(TEST_MODE_KEY) === '1' }
export function getTestPersona(): TestPersona {
  const value = localStorage.getItem(TEST_PERSONA_KEY)
  return value === 'operator' || value === 'client' ? value : 'manager'
}
export function setTestPersona(persona: TestPersona) {
  localStorage.setItem(TEST_PERSONA_KEY, persona)
  window.dispatchEvent(new CustomEvent('northborn-test-persona-changed', { detail: persona }))
}
export function clearTestLab() {
  localStorage.removeItem(TEST_MODE_KEY)
  localStorage.removeItem(TEST_PERSONA_KEY)
  window.dispatchEvent(new Event('northborn-auth-changed'))
}
export function readTestLabData(): TestLabData {
  try {
    const raw = localStorage.getItem(TEST_DATA_KEY)
    const currentVersion = localStorage.getItem(TEST_SCHEMA_VERSION_KEY)
    if (raw && currentVersion === CURRENT_TEST_SCHEMA_VERSION) {
      const normalized = normalizeTestData(JSON.parse(raw))
      if (normalized) {
        seedRichTables(normalized, false)
        return normalized
      }
    }
  } catch {}
  const fresh = seed()
  writeTestLabData(fresh)
  seedRichTables(fresh, true)
  return fresh
}
export function writeTestLabData(data: TestLabData) {
  const normalized = normalizeTestData(data) || seed()
  localStorage.setItem(TEST_DATA_KEY, JSON.stringify(normalized))
  storeSchemaVersion()
  window.dispatchEvent(new Event('northborn-test-data-changed'))
}
export function resetTestLabData() {
  const fresh = seed()
  writeTestLabData(fresh)
  seedRichTables(fresh, true)
  return fresh
}

export function testClientContext() {
  const data = readTestLabData()
  const customer = data.customers[0]
  return {
    portal_user_id: 'test-client-portal-user',
    organization_id: TEST_ORG.id,
    organization_name: TEST_ORG.name,
    customer_id: customer?.id || 'test-customer',
    customer_name: customer?.name || 'Northborn Test Client Company',
    customer_phone: customer?.phone || null,
    customer_address: customer?.address || null,
    billing_email: customer?.billing_email || 'Client@test.com',
    portal_role: 'admin',
  }
}

export type TestClientContact = { id:string; name:string; title:string|null; phone:string|null; email:string|null; contact_type:string; status:string; updated_at:string }
export function readTestClientContacts(): TestClientContact[] {
  try {
    const raw = localStorage.getItem(TEST_CLIENT_CONTACTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as TestClientContact[]
    }
  } catch {}
  const contacts: TestClientContact[] = [
    { id:uid(), name:'Site Contact', title:'Field Supervisor', phone:'403-555-0199', email:'site@test.com', contact_type:'field', status:'active', updated_at:new Date().toISOString() },
    { id:uid(), name:'Billing Contact', title:'Accounts Payable', phone:'403-555-0188', email:'billing@test.com', contact_type:'billing', status:'active', updated_at:new Date().toISOString() },
  ]
  writeTestClientContacts(contacts)
  return contacts
}
export function writeTestClientContacts(contacts: TestClientContact[]) {
  localStorage.setItem(TEST_CLIENT_CONTACTS_KEY, JSON.stringify(Array.isArray(contacts) ? contacts : []))
  window.dispatchEvent(new Event('northborn-test-data-changed'))
}
