export const TEST_MODE_KEY = 'northborn_test_mode'
export const TEST_PERSONA_KEY = 'northborn_test_persona'
export const TEST_DATA_KEY = 'northborn_test_data_v3'
export const TEST_CLIENT_REQUESTS_KEY = 'northborn_test_client_requests_v1'
export const TEST_CLIENT_CONTACTS_KEY = 'northborn_test_client_contacts_v1'
export const TEST_CLIENT_JOB_META_KEY = 'northborn_test_client_job_meta_v1'

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
type TestVehicle = { id:string; organization_id:string; unit_number:string; name:string|null; vehicle_type:string; plate:string|null; status:string; odometer_km?:number|null; engine_hours?:number|null }
type TestJob = { id:string; organization_id:string; customer_id:string; job_number:string; title:string; site_name:string|null; site_address:string|null; scheduled_start:string|null; scheduled_end:string|null; status:string; notes:string|null; shop_time?:string|null; onsite_time?:string|null; completed_at?:string|null }
type TestAssignment = { id:string; organization_id:string; job_id:string; employee_id:string|null; vehicle_id:string|null; role:string|null }
export type TestLabData = { customers:TestCustomer[]; employees:TestEmployee[]; vehicles:TestVehicle[]; jobs:TestJob[]; assignments:TestAssignment[] }

const uid = () => crypto.randomUUID()

function seed(): TestLabData {
  const customerId = uid()
  const operatorId = uid()
  const swamperId = uid()
  const vehicleId = uid()
  const spareVehicleId = uid()
  const jobId = uid()
  const now = Date.now()
  const shop = new Date(now + 60 * 60 * 1000)
  const onsite = new Date(now + 2 * 60 * 60 * 1000)
  const end = new Date(now + 10 * 60 * 60 * 1000)
  return {
    customers: [{ id:customerId, organization_id:TEST_ORG.id, name:'Northborn Test Client Company', billing_email:'Client@test.com', phone:'403-555-0100', address:'Red Deer, AB', notes:'Shared functional test client.', status:'active' }],
    employees: [
      { id:operatorId, organization_id:TEST_ORG.id, user_id:TEST_USERS.operator.id, first_name:'Operator', last_name:'Test', email:'Operator@test.com', phone:'403-555-0111', position:'Operator', status:'active' },
      { id:swamperId, organization_id:TEST_ORG.id, user_id:null, first_name:'Swamper', last_name:'Test', email:'swamper@test.com', phone:'403-555-0112', position:'Swamper', status:'active' },
    ],
    vehicles: [
      { id:vehicleId, organization_id:TEST_ORG.id, unit_number:'TEST-101', name:'Test Hydrovac', vehicle_type:'Hydrovac', plate:'TEST101', status:'assigned', odometer_km:125000, engine_hours:4200 },
      { id:spareVehicleId, organization_id:TEST_ORG.id, unit_number:'TEST-202', name:'Test Combo Vac', vehicle_type:'Combo Vac', plate:'TEST202', status:'available', odometer_km:83000, engine_hours:3100 },
    ],
    jobs: [{ id:jobId, organization_id:TEST_ORG.id, customer_id:customerId, job_number:'TEST-0001', title:'Northborn live feature test job', site_name:'Test Site', site_address:'Red Deer County, AB', scheduled_start:onsite.toISOString(), scheduled_end:end.toISOString(), shop_time:shop.toISOString(), onsite_time:onsite.toISOString(), status:'dispatched', notes:'Shared test job used by Manager, Operator and Client personas.' }],
    assignments: [
      { id:uid(), organization_id:TEST_ORG.id, job_id:jobId, employee_id:operatorId, vehicle_id:null, role:'operator' },
      { id:uid(), organization_id:TEST_ORG.id, job_id:jobId, employee_id:swamperId, vehicle_id:null, role:'swamper' },
      { id:uid(), organization_id:TEST_ORG.id, job_id:jobId, employee_id:null, vehicle_id:vehicleId, role:'unit' },
    ],
  }
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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TestLabData>
      if (parsed.customers && parsed.employees && parsed.vehicles && parsed.jobs && parsed.assignments) {
        const operator = parsed.employees.find(e => e.position?.toLowerCase() === 'operator')
        if (operator && operator.user_id !== TEST_USERS.operator.id) operator.user_id = TEST_USERS.operator.id
        return parsed as TestLabData
      }
    }
  } catch {}
  const fresh = seed()
  writeTestLabData(fresh)
  return fresh
}
export function writeTestLabData(data: TestLabData) {
  localStorage.setItem(TEST_DATA_KEY, JSON.stringify(data))
  window.dispatchEvent(new Event('northborn-test-data-changed'))
}
export function resetTestLabData() {
  const fresh = seed()
  writeTestLabData(fresh)
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
    if (raw) return JSON.parse(raw) as TestClientContact[]
  } catch {}
  const contacts: TestClientContact[] = [
    { id:uid(), name:'Site Contact', title:'Field Supervisor', phone:'403-555-0199', email:'site@test.com', contact_type:'field', status:'active', updated_at:new Date().toISOString() },
    { id:uid(), name:'Billing Contact', title:'Accounts Payable', phone:'403-555-0188', email:'billing@test.com', contact_type:'billing', status:'active', updated_at:new Date().toISOString() },
  ]
  writeTestClientContacts(contacts)
  return contacts
}
export function writeTestClientContacts(contacts: TestClientContact[]) {
  localStorage.setItem(TEST_CLIENT_CONTACTS_KEY, JSON.stringify(contacts))
  window.dispatchEvent(new Event('northborn-test-data-changed'))
}
