import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ContactRound,
  Gauge,
  HardHat,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import RoleAwareApp from './RoleAwareApp'
import { supabase } from './lib/supabase'
import './manager-invoices.css'

const db = supabase as any
const TEST_MODE_KEY = 'northborn_test_mode'
const TEST_DATA_KEY = 'northborn_test_data_v3'
const TEST_INVOICE_KEY = 'northborn_test_invoices_v1'
const TEST_ORG: Organization = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Northborn Test Company',
  settings: {},
}

const NAV = [
  ['Dashboard', '/', Gauge],
  ['Calendar', '/calendar', CalendarDays],
  ['Dispatch', '/dispatch', CalendarDays],
  ['Jobs', '/jobs', BriefcaseBusiness],
  ['Customers', '/customers', ContactRound],
  ['Employees', '/employees', Users],
  ['Fleet', '/fleet', Truck],
  ['Maintenance', '/maintenance', Wrench],
  ['Safety', '/safety', ShieldCheck],
  ['Timesheets', '/timesheets', HardHat],
  ['Invoices', '/invoices', ReceiptText],
] as const

const PRESETS = [
  'Tri-Vac',
  'Reg-Vac',
  'Combo',
  'Steamer',
  'Water Truck',
  'Monitor',
  'Heater',
  'Degreaser',
  'Swamper',
  'Disposal',
  'Overtime',
  'Crew Truck',
  'Other',
]

const UNITS = ['hour', 'day', 'each', 'km', 'kg', 'tonne', 'load', 'flat']

type Organization = {
  id: string
  name: string
  settings?: Record<string, unknown>
}

type Customer = {
  id: string
  name: string
  billing_email: string | null
  phone: string | null
  address: string | null
}

type Job = {
  id: string
  customer_id: string
  job_number: string
  title: string
  site_name: string | null
  site_address: string | null
  status: string
  notes: string | null
}

type EditorLine = {
  id: string
  category: string
  description: string
  quantity: string
  unit: string
  rate: string
}

type Invoice = {
  id: string
  customer_id: string
  job_id: string | null
  invoice_number: string
  status: string
  invoice_date: string
  due_date: string | null
  purchase_order: string | null
  afe_number: string | null
  project: string | null
  location: string | null
  area: string | null
  job_description: string | null
  authorization_date: string | null
  authorized_by_name: string | null
  authorization_contact: string | null
  authorization_email: string | null
  billed_to_name: string | null
  billed_to_address: string | null
  billed_to_email: string | null
  seller_name: string | null
  seller_address: string | null
  seller_phone: string | null
  seller_email: string | null
  gst_number: string | null
  permit_number: string | null
  wcb_number: string | null
  currency_code: string
  tax_rate: number | string
  subtotal: number | string
  tax_total: number | string
  total: number | string
  amount_paid: number | string
  balance_due: number | string
  notes: string | null
  terms: string | null
  created_at: string
  line_items?: EditorLine[]
}

type InvoiceForm = {
  id: string | null
  invoice_number: string
  customer_id: string
  job_id: string
  status: string
  invoice_date: string
  due_date: string
  purchase_order: string
  afe_number: string
  project: string
  location: string
  area: string
  job_description: string
  authorization_date: string
  authorized_by_name: string
  authorization_contact: string
  authorization_email: string
  billed_to_name: string
  billed_to_address: string
  billed_to_email: string
  seller_name: string
  seller_address: string
  seller_phone: string
  seller_email: string
  gst_number: string
  permit_number: string
  wcb_number: string
  currency_code: string
  tax_rate: string
  amount_paid: string
  notes: string
  terms: string
}

type InvoiceTotals = {
  subtotal: number
  tax: number
  total: number
}

const readError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as { message?: string })?.message || error || 'Something went wrong.')

const money = (value: number | string | null | undefined, currency = 'CAD') =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value || 0))

const statusLabel = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())

const today = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const plusDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const makeId = () => crypto.randomUUID()
const asNumber = (value: string | number) => Number(value || 0)

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

function invoiceSetting(organization: Organization, key: string, fallback = '') {
  const raw = organization.settings?.[key]
  if (raw === null || raw === undefined) return fallback
  return String(raw)
}

function emptyLine(description = ''): EditorLine {
  let category = 'other'
  if (description === 'Swamper') category = 'labour'
  else if (description === 'Disposal') category = 'disposal'
  else if (description === 'Overtime') category = 'overtime'
  else if (description === 'Crew Truck') category = 'transport'
  else if (description && description !== 'Other') category = 'equipment'

  return {
    id: makeId(),
    category,
    description: description === 'Other' ? '' : description,
    quantity: '1',
    unit: 'hour',
    rate: '',
  }
}

function emptyForm(organization: Organization, customer?: Customer): InvoiceForm {
  const invoiceDate = today()
  return {
    id: null,
    invoice_number: '',
    customer_id: customer?.id || '',
    job_id: '',
    status: 'draft',
    invoice_date: invoiceDate,
    due_date: plusDays(invoiceDate, 30),
    purchase_order: '',
    afe_number: '',
    project: '',
    location: '',
    area: '',
    job_description: '',
    authorization_date: '',
    authorized_by_name: '',
    authorization_contact: '',
    authorization_email: '',
    billed_to_name: customer?.name || '',
    billed_to_address: customer?.address || '',
    billed_to_email: customer?.billing_email || '',
    seller_name: invoiceSetting(organization, 'invoice_company_name', organization.name),
    seller_address: invoiceSetting(organization, 'invoice_address'),
    seller_phone: invoiceSetting(organization, 'invoice_phone'),
    seller_email: invoiceSetting(organization, 'invoice_email'),
    gst_number: invoiceSetting(organization, 'gst_number'),
    permit_number: invoiceSetting(organization, 'permit_number'),
    wcb_number: invoiceSetting(organization, 'wcb_number'),
    currency_code: 'CAD',
    tax_rate: invoiceSetting(organization, 'invoice_tax_rate', '5'),
    amount_paid: '0',
    notes: '',
    terms: invoiceSetting(organization, 'invoice_terms'),
  }
}

function formFromInvoice(invoice: Invoice): InvoiceForm {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    customer_id: invoice.customer_id,
    job_id: invoice.job_id || '',
    status: invoice.status,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date || '',
    purchase_order: invoice.purchase_order || '',
    afe_number: invoice.afe_number || '',
    project: invoice.project || '',
    location: invoice.location || '',
    area: invoice.area || '',
    job_description: invoice.job_description || '',
    authorization_date: invoice.authorization_date || '',
    authorized_by_name: invoice.authorized_by_name || '',
    authorization_contact: invoice.authorization_contact || '',
    authorization_email: invoice.authorization_email || '',
    billed_to_name: invoice.billed_to_name || '',
    billed_to_address: invoice.billed_to_address || '',
    billed_to_email: invoice.billed_to_email || '',
    seller_name: invoice.seller_name || '',
    seller_address: invoice.seller_address || '',
    seller_phone: invoice.seller_phone || '',
    seller_email: invoice.seller_email || '',
    gst_number: invoice.gst_number || '',
    permit_number: invoice.permit_number || '',
    wcb_number: invoice.wcb_number || '',
    currency_code: invoice.currency_code || 'CAD',
    tax_rate: String(invoice.tax_rate ?? 5),
    amount_paid: String(invoice.amount_paid ?? 0),
    notes: invoice.notes || '',
    terms: invoice.terms || '',
  }
}

export default function ManagerInvoicesPage() {
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [roleKey, setRoleKey] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<InvoiceForm | null>(null)
  const [lines, setLines] = useState<EditorLine[]>([])
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'draft' | 'open' | 'paid'>('all')
  const testMode = localStorage.getItem(TEST_MODE_KEY) === '1'

  const load = useCallback(async () => {
    setError('')

    if (testMode) {
      try {
        const raw = JSON.parse(localStorage.getItem(TEST_DATA_KEY) || '{}') as {
          customers?: Customer[]
          jobs?: Job[]
        }
        setOrganization(TEST_ORG)
        setRoleKey('owner')
        setCustomers(raw.customers || [])
        setJobs(raw.jobs || [])
        setInvoices(JSON.parse(localStorage.getItem(TEST_INVOICE_KEY) || '[]') as Invoice[])
      } catch (loadError) {
        setError(readError(loadError))
      }
      setLoading(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) {
      setLoading(false)
      return
    }

    const membership = await db
      .from('organization_members')
      .select('id,organization_id,organization:organizations(id,name,settings)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (membership.error || !membership.data?.id) {
      setLoading(false)
      return
    }

    const roleResult = await db
      .from('membership_roles')
      .select('role:roles(key)')
      .eq('membership_id', membership.data.id)

    const role = roleResult.data?.[0]?.role?.key || ''
    setRoleKey(role)
    if (role === 'operator') {
      setLoading(false)
      return
    }

    const org = membership.data.organization as Organization
    setOrganization(org)

    const [customerResult, jobResult, invoiceResult] = await Promise.all([
      db
        .from('customers')
        .select('id,name,billing_email,phone,address')
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('name'),
      db
        .from('jobs')
        .select('id,customer_id,job_number,title,site_name,site_address,status,notes')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false }),
      db
        .from('invoices')
        .select('id,customer_id,job_id,invoice_number,status,invoice_date,due_date,purchase_order,afe_number,project,location,area,job_description,authorization_date,authorized_by_name,authorization_contact,authorization_email,billed_to_name,billed_to_address,billed_to_email,seller_name,seller_address,seller_phone,seller_email,gst_number,permit_number,wcb_number,currency_code,tax_rate,subtotal,tax_total,total,amount_paid,balance_due,notes,terms,created_at')
        .eq('organization_id', org.id)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    const queryError = customerResult.error || jobResult.error || invoiceResult.error
    if (queryError) setError(queryError.message)
    setCustomers(customerResult.data || [])
    setJobs(jobResult.data || [])
    setInvoices(invoiceResult.data || [])
    setLoading(false)
  }, [testMode])

  useEffect(() => {
    void load()
  }, [load])

  const shownInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (filter === 'all') return true
      if (filter === 'draft') return invoice.status === 'draft'
      if (filter === 'open') return ['issued', 'partially_paid', 'overdue'].includes(invoice.status)
      return invoice.status === 'paid'
    })
  }, [filter, invoices])

  const outstanding = useMemo(
    () =>
      invoices
        .filter((invoice) => ['issued', 'partially_paid', 'overdue'].includes(invoice.status))
        .reduce((sum, invoice) => sum + asNumber(invoice.balance_due), 0),
    [invoices],
  )

  const paidYtd = useMemo(() => {
    const year = String(new Date().getFullYear())
    return invoices
      .filter((invoice) => invoice.invoice_date?.startsWith(year))
      .reduce((sum, invoice) => sum + asNumber(invoice.amount_paid), 0)
  }, [invoices])

  const draftCount = invoices.filter((invoice) => invoice.status === 'draft').length
  const openCount = invoices.filter((invoice) =>
    ['issued', 'partially_paid', 'overdue'].includes(invoice.status),
  ).length
  const paidCount = invoices.filter((invoice) => invoice.status === 'paid').length
  const canManage = ['owner', 'admin', 'accounting'].includes(roleKey) || testMode

  const totals = useMemo<InvoiceTotals>(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + asNumber(line.quantity) * asNumber(line.rate),
      0,
    )
    const tax = (subtotal * asNumber(form?.tax_rate || 0)) / 100
    return { subtotal, tax, total: subtotal + tax }
  }, [form?.tax_rate, lines])

  const openNew = () => {
    if (!organization) return
    const customer = customers[0]
    setForm(emptyForm(organization, customer))
    setLines([emptyLine()])
    setEditorOpen(true)
  }

  const openExisting = async (invoice: Invoice) => {
    if (!organization) return
    setBusy(true)
    setError('')
    try {
      let loadedLines: EditorLine[] = []
      if (testMode) {
        loadedLines = invoice.line_items || []
      } else {
        const result = await db
          .from('invoice_line_items')
          .select('id,category,description,quantity,unit,rate')
          .eq('invoice_id', invoice.id)
          .eq('organization_id', organization.id)
          .order('sort_order')
        if (result.error) throw result.error
        loadedLines = (result.data || []).map((line: any) => ({
          id: line.id,
          category: line.category,
          description: line.description,
          quantity: String(line.quantity),
          unit: line.unit,
          rate: String(line.rate),
        }))
      }
      setForm(formFromInvoice(invoice))
      setLines(loadedLines.length ? loadedLines : [emptyLine()])
      setEditorOpen(true)
    } catch (openError) {
      setError(readError(openError))
    } finally {
      setBusy(false)
    }
  }

  const chooseCustomer = (customerId: string) => {
    if (!form) return
    const customer = customers.find((item) => item.id === customerId)
    const currentJob = jobs.find((job) => job.id === form.job_id)
    setForm({
      ...form,
      customer_id: customerId,
      job_id: currentJob?.customer_id === customerId ? form.job_id : '',
      billed_to_name: customer?.name || '',
      billed_to_address: customer?.address || '',
      billed_to_email: customer?.billing_email || '',
    })
  }

  const chooseJob = (jobId: string) => {
    if (!form) return
    if (!jobId) {
      setForm({ ...form, job_id: '' })
      return
    }

    const job = jobs.find((item) => item.id === jobId)
    if (!job) return
    const customer = customers.find((item) => item.id === job.customer_id)
    setForm({
      ...form,
      job_id: job.id,
      customer_id: job.customer_id,
      billed_to_name: customer?.name || form.billed_to_name,
      billed_to_address: customer?.address || form.billed_to_address,
      billed_to_email: customer?.billing_email || form.billed_to_email,
      project: form.project || job.title,
      location: form.location || job.site_address || job.site_name || '',
      job_description: form.job_description || job.title,
    })
  }

  const save = async (requestedStatus?: string) => {
    if (!organization || !form) return
    setBusy(true)
    setError('')

    try {
      if (!form.customer_id) throw new Error('Choose a client before saving the invoice.')

      const status = requestedStatus || form.status || 'draft'
      const cleanLines = lines.filter(
        (line) =>
          line.description.trim() && asNumber(line.quantity) >= 0 && asNumber(line.rate) >= 0,
      )
      if (!cleanLines.length) throw new Error('Add at least one invoice line item.')

      if (testMode) {
        const existing = invoices.find((invoice) => invoice.id === form.id)
        const amountPaid = status === 'paid' ? totals.total : asNumber(form.amount_paid)
        const row: Invoice = {
          id: form.id || makeId(),
          customer_id: form.customer_id,
          job_id: form.job_id || null,
          invoice_number:
            form.invoice_number.trim() ||
            `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`,
          status,
          invoice_date: form.invoice_date,
          due_date: form.due_date || null,
          purchase_order: form.purchase_order || null,
          afe_number: form.afe_number || null,
          project: form.project || null,
          location: form.location || null,
          area: form.area || null,
          job_description: form.job_description || null,
          authorization_date: form.authorization_date || null,
          authorized_by_name: form.authorized_by_name || null,
          authorization_contact: form.authorization_contact || null,
          authorization_email: form.authorization_email || null,
          billed_to_name: form.billed_to_name || null,
          billed_to_address: form.billed_to_address || null,
          billed_to_email: form.billed_to_email || null,
          seller_name: form.seller_name || null,
          seller_address: form.seller_address || null,
          seller_phone: form.seller_phone || null,
          seller_email: form.seller_email || null,
          gst_number: form.gst_number || null,
          permit_number: form.permit_number || null,
          wcb_number: form.wcb_number || null,
          currency_code: form.currency_code,
          tax_rate: asNumber(form.tax_rate),
          subtotal: totals.subtotal,
          tax_total: totals.tax,
          total: totals.total,
          amount_paid: amountPaid,
          balance_due: Math.max(totals.total - amountPaid, 0),
          notes: form.notes || null,
          terms: form.terms || null,
          created_at: existing?.created_at || new Date().toISOString(),
          line_items: cleanLines,
        }
        const nextInvoices = existing
          ? invoices.map((invoice) => (invoice.id === row.id ? row : invoice))
          : [row, ...invoices]
        localStorage.setItem(TEST_INVOICE_KEY, JSON.stringify(nextInvoices))
        setInvoices(nextInvoices)
        setEditorOpen(false)
        setForm(null)
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Sign in required')

      const payload = {
        organization_id: organization.id,
        customer_id: form.customer_id,
        job_id: form.job_id || null,
        invoice_number: form.invoice_number.trim(),
        status,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        purchase_order: form.purchase_order.trim() || null,
        afe_number: form.afe_number.trim() || null,
        project: form.project.trim() || null,
        location: form.location.trim() || null,
        area: form.area.trim() || null,
        job_description: form.job_description.trim() || null,
        authorization_date: form.authorization_date || null,
        authorized_by_name: form.authorized_by_name.trim() || null,
        authorization_contact: form.authorization_contact.trim() || null,
        authorization_email: form.authorization_email.trim() || null,
        billed_to_name: form.billed_to_name.trim() || null,
        billed_to_address: form.billed_to_address.trim() || null,
        billed_to_email: form.billed_to_email.trim() || null,
        seller_name: form.seller_name.trim() || null,
        seller_address: form.seller_address.trim() || null,
        seller_phone: form.seller_phone.trim() || null,
        seller_email: form.seller_email.trim() || null,
        gst_number: form.gst_number.trim() || null,
        permit_number: form.permit_number.trim() || null,
        wcb_number: form.wcb_number.trim() || null,
        currency_code: form.currency_code,
        tax_rate: asNumber(form.tax_rate),
        amount_paid: status === 'paid' ? totals.total : asNumber(form.amount_paid),
        notes: form.notes.trim() || null,
        terms: form.terms.trim() || null,
      }

      let invoiceId = form.id
      if (invoiceId) {
        const updateResult = await db
          .from('invoices')
          .update(payload)
          .eq('id', invoiceId)
          .eq('organization_id', organization.id)
        if (updateResult.error) throw updateResult.error

        const deleteResult = await db
          .from('invoice_line_items')
          .delete()
          .eq('invoice_id', invoiceId)
          .eq('organization_id', organization.id)
        if (deleteResult.error) throw deleteResult.error
      } else {
        const insertResult = await db
          .from('invoices')
          .insert({ ...payload, created_by: userData.user.id })
          .select('id,invoice_number')
          .single()
        if (insertResult.error) throw insertResult.error
        invoiceId = insertResult.data.id
      }

      const lineRows = cleanLines.map((line, index) => ({
        organization_id: organization.id,
        invoice_id: invoiceId,
        category: line.category,
        description: line.description.trim(),
        quantity: asNumber(line.quantity),
        unit: line.unit,
        rate: asNumber(line.rate),
        sort_order: index,
        created_by: userData.user.id,
      }))

      const lineResult = await db.from('invoice_line_items').insert(lineRows)
      if (lineResult.error) throw lineResult.error

      setEditorOpen(false)
      setForm(null)
      await load()
    } catch (saveError) {
      setError(readError(saveError))
    } finally {
      setBusy(false)
    }
  }

  const quickStatus = async (invoice: Invoice, status: string) => {
    if (!organization) return
    setBusy(true)
    setError('')
    try {
      if (testMode) {
        const nextInvoices = invoices.map((item) =>
          item.id === invoice.id
            ? {
                ...item,
                status,
                amount_paid: status === 'paid' ? asNumber(item.total) : item.amount_paid,
                balance_due: status === 'paid' ? 0 : item.balance_due,
              }
            : item,
        )
        localStorage.setItem(TEST_INVOICE_KEY, JSON.stringify(nextInvoices))
        setInvoices(nextInvoices)
        return
      }

      const values: { status: string; amount_paid?: number } = { status }
      if (status === 'paid') values.amount_paid = asNumber(invoice.total)
      const result = await db
        .from('invoices')
        .update(values)
        .eq('id', invoice.id)
        .eq('organization_id', organization.id)
      if (result.error) throw result.error
      await load()
    } catch (statusError) {
      setError(readError(statusError))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="manager-invoices-loading">Loading invoices…</div>
  if (!organization || roleKey === 'operator') return <RoleAwareApp />

  return (
    <div className="manager-invoices-shell">
      <aside className="manager-invoices-sidebar">
        <div className="manager-invoices-brand">
          <div>N</div>
          <span>
            <strong>NORTHBORN</strong>
            <small>{organization.name}</small>
          </span>
        </div>
        <nav>
          {NAV.map(([name, path, Icon]) => (
            <NavLink key={path} to={path} end={path === '/'}>
              <Icon size={18} />
              <span>{name}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="manager-invoices-main">
        <header className="manager-invoices-header">
          <div>
            <span className="manager-invoices-eyebrow">BILLING</span>
            <strong>Invoices</strong>
          </div>
          {canManage && (
            <button className="manager-invoices-primary" onClick={openNew} disabled={!customers.length}>
              <Plus size={17} />
              New invoice
            </button>
          )}
        </header>

        <section className="manager-invoices-page">
          <div className="manager-invoices-hero">
            <span className="manager-invoices-eyebrow">ACCOUNTS RECEIVABLE</span>
            <h1>Job linked invoicing</h1>
            <p>
              Build invoices from completed work, keep the familiar field details from the paper invoice,
              and give clients a clean digital billing record.
            </p>
          </div>

          {error && <div className="manager-invoices-message">{error}</div>}
          {!customers.length && (
            <div className="manager-invoices-notice">
              Add a client before creating an invoice. <NavLink to="/customers">Open Clients</NavLink>
            </div>
          )}

          <div className="invoice-metrics">
            <div>
              <Banknote />
              <span>
                <b>{money(outstanding)}</b>
                <small>Outstanding</small>
              </span>
            </div>
            <div>
              <CheckCircle2 />
              <span>
                <b>{money(paidYtd)}</b>
                <small>Paid this year</small>
              </span>
            </div>
            <div>
              <ReceiptText />
              <span>
                <b>{draftCount}</b>
                <small>Draft invoices</small>
              </span>
            </div>
          </div>

          <div className="invoice-tabs">
            {(['all', 'draft', 'open', 'paid'] as const).map((tab) => {
              const count =
                tab === 'all'
                  ? invoices.length
                  : tab === 'draft'
                    ? draftCount
                    : tab === 'open'
                      ? openCount
                      : paidCount
              return (
                <button key={tab} className={filter === tab ? 'active' : ''} onClick={() => setFilter(tab)}>
                  {statusLabel(tab)}
                  <span>{count}</span>
                </button>
              )
            })}
          </div>

          <div className="invoice-list">
            {shownInvoices.map((invoice) => {
              const customer = customers.find((item) => item.id === invoice.customer_id)
              const job = jobs.find((item) => item.id === invoice.job_id)
              return (
                <article className="invoice-card" key={invoice.id}>
                  <div className="invoice-card-main">
                    <span className="invoice-number">{invoice.invoice_number}</span>
                    <h2>{customer?.name || invoice.billed_to_name || 'Client'}</h2>
                    <p>{job ? `${job.job_number} · ${job.title}` : invoice.project || 'No job linked'}</p>
                  </div>
                  <div className="invoice-card-dates">
                    <span>
                      <b>Invoice</b>
                      {invoice.invoice_date}
                    </span>
                    <span>
                      <b>Due</b>
                      {invoice.due_date || 'Not set'}
                    </span>
                  </div>
                  <div className="invoice-card-total">
                    <b>{money(invoice.total, invoice.currency_code)}</b>
                    <small>{money(invoice.balance_due, invoice.currency_code)} due</small>
                  </div>
                  <span className={`invoice-status status-${invoice.status}`}>
                    {statusLabel(invoice.status)}
                  </span>
                  <div className="invoice-card-actions">
                    <button title="Edit invoice" onClick={() => void openExisting(invoice)} disabled={busy}>
                      <Pencil size={16} />
                    </button>
                    {invoice.status === 'draft' && canManage && (
                      <button title="Issue invoice" onClick={() => void quickStatus(invoice, 'issued')} disabled={busy}>
                        <Send size={16} />
                      </button>
                    )}
                    {['issued', 'partially_paid', 'overdue'].includes(invoice.status) && canManage && (
                      <button title="Mark paid" onClick={() => void quickStatus(invoice, 'paid')} disabled={busy}>
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
            {!shownInvoices.length && <div className="invoice-empty">No invoices in this view yet.</div>}
          </div>
        </section>
      </main>

      {editorOpen && form && (
        <InvoiceEditor
          organization={organization}
          customers={customers}
          jobs={jobs}
          form={form}
          setForm={setForm}
          lines={lines}
          setLines={setLines}
          totals={totals}
          busy={busy}
          canManage={canManage}
          onCustomer={chooseCustomer}
          onJob={chooseJob}
          onSave={save}
          onClose={() => {
            if (!busy) {
              setEditorOpen(false)
              setForm(null)
            }
          }}
        />
      )}
    </div>
  )
}

type InvoiceEditorProps = {
  organization: Organization
  customers: Customer[]
  jobs: Job[]
  form: InvoiceForm
  setForm: (form: InvoiceForm) => void
  lines: EditorLine[]
  setLines: (lines: EditorLine[]) => void
  totals: InvoiceTotals
  busy: boolean
  canManage: boolean
  onCustomer: (customerId: string) => void
  onJob: (jobId: string) => void
  onSave: (status?: string) => Promise<void>
  onClose: () => void
}

function InvoiceEditor({
  organization,
  customers,
  jobs,
  form,
  setForm,
  lines,
  setLines,
  totals,
  busy,
  canManage,
  onCustomer,
  onJob,
  onSave,
  onClose,
}: InvoiceEditorProps) {
  const customerJobs = jobs.filter((job) => job.customer_id === form.customer_id)

  const updateLine = (lineId: string, patch: Partial<EditorLine>) => {
    setLines(lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)))
  }

  const addPreset = (preset: string) => setLines([...lines, emptyLine(preset)])

  const removeLine = (lineId: string) => {
    setLines(lines.length === 1 ? [emptyLine()] : lines.filter((line) => line.id !== lineId))
  }

  return (
    <div className="invoice-editor-backdrop">
      <section className="invoice-editor">
        <div className="invoice-editor-head">
          <div>
            <span className="manager-invoices-eyebrow">{form.id ? 'EDIT INVOICE' : 'NEW INVOICE'}</span>
            <h2>{form.invoice_number || 'Draft invoice'}</h2>
          </div>
          <div>
            <button type="button" onClick={() => printInvoice(organization, form, lines, totals)}>
              <Printer size={17} />
              Print preview
            </button>
            <button className="close" type="button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="invoice-editor-body">
          <div className="invoice-section">
            <div className="invoice-section-title">
              <strong>Invoice details</strong>
              <span>Based on the field invoice layout</span>
            </div>
            <div className="invoice-form-grid">
              <label>
                Client
                <select value={form.customer_id} onChange={(event) => onCustomer(event.target.value)} disabled={!canManage}>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Linked job
                <select value={form.job_id} onChange={(event) => onJob(event.target.value)} disabled={!canManage}>
                  <option value="">No job linked</option>
                  {customerJobs.map((job) => (
                    <option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Invoice number
                <input value={form.invoice_number} onChange={(event) => setForm({ ...form, invoice_number: event.target.value })} placeholder="Auto assigned if blank" disabled={!canManage} />
              </label>
              <label>
                Invoice date
                <input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Due date
                <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                PO #
                <input value={form.purchase_order} onChange={(event) => setForm({ ...form, purchase_order: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                AFE #
                <input value={form.afe_number} onChange={(event) => setForm({ ...form, afe_number: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Project
                <input value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Location
                <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Area
                <input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} disabled={!canManage} />
              </label>
              <label className="wide">
                Job description
                <textarea value={form.job_description} onChange={(event) => setForm({ ...form, job_description: event.target.value })} disabled={!canManage} />
              </label>
            </div>
          </div>

          <div className="invoice-section">
            <div className="invoice-section-title">
              <strong>Authorization</strong>
              <span>Optional customer authorization details</span>
            </div>
            <div className="invoice-form-grid">
              <label>
                Authorization date
                <input type="date" value={form.authorization_date} onChange={(event) => setForm({ ...form, authorization_date: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Print name
                <input value={form.authorized_by_name} onChange={(event) => setForm({ ...form, authorized_by_name: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Contact #
                <input value={form.authorization_contact} onChange={(event) => setForm({ ...form, authorization_contact: event.target.value })} disabled={!canManage} />
              </label>
              <label>
                Email
                <input type="email" value={form.authorization_email} onChange={(event) => setForm({ ...form, authorization_email: event.target.value })} disabled={!canManage} />
              </label>
            </div>
          </div>

          <div className="invoice-section">
            <div className="invoice-section-title row">
              <div>
                <strong>Charges</strong>
                <span>Add equipment, labour, disposal and other billable items.</span>
              </div>
              {canManage && (
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) {
                      addPreset(event.target.value)
                      event.currentTarget.value = ''
                    }
                  }}
                >
                  <option value="" disabled>Add common service…</option>
                  {PRESETS.map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                </select>
              )}
            </div>

            <div className="invoice-lines">
              <div className="invoice-line invoice-line-head">
                <span>Description</span><span>Category</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span><span />
              </div>
              {lines.map((line) => (
                <div className="invoice-line" key={line.id}>
                  <input list="invoice-service-presets" value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} placeholder="Service or item" disabled={!canManage} />
                  <select value={line.category} onChange={(event) => updateLine(line.id, { category: event.target.value })} disabled={!canManage}>
                    <option value="equipment">Equipment</option>
                    <option value="labour">Labour</option>
                    <option value="material">Material</option>
                    <option value="disposal">Disposal</option>
                    <option value="overtime">Overtime</option>
                    <option value="transport">Transport</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} disabled={!canManage} />
                  <select value={line.unit} onChange={(event) => updateLine(line.id, { unit: event.target.value })} disabled={!canManage}>
                    {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={line.rate} onChange={(event) => updateLine(line.id, { rate: event.target.value })} placeholder="0.00" disabled={!canManage} />
                  <strong>{money(asNumber(line.quantity) * asNumber(line.rate), form.currency_code)}</strong>
                  {canManage && (
                    <button type="button" onClick={() => removeLine(line.id)}><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
              <datalist id="invoice-service-presets">
                {PRESETS.map((preset) => <option value={preset} key={preset} />)}
              </datalist>
              {canManage && (
                <button className="add-line" type="button" onClick={() => setLines([...lines, emptyLine()])}>
                  <Plus size={15} /> Add line item
                </button>
              )}
            </div>

            <div className="invoice-total-grid">
              <label>
                Tax rate %
                <input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(event) => setForm({ ...form, tax_rate: event.target.value })} disabled={!canManage} />
              </label>
              <div><span>Subtotal</span><b>{money(totals.subtotal, form.currency_code)}</b></div>
              <div><span>GST / tax</span><b>{money(totals.tax, form.currency_code)}</b></div>
              <div className="grand"><span>Total</span><b>{money(totals.total, form.currency_code)}</b></div>
            </div>
          </div>

          <details className="invoice-section invoice-details">
            <summary>Company invoice details</summary>
            <div className="invoice-form-grid">
              <label>Company / seller<input value={form.seller_name} onChange={(event) => setForm({ ...form, seller_name: event.target.value })} disabled={!canManage} /></label>
              <label>Phone<input value={form.seller_phone} onChange={(event) => setForm({ ...form, seller_phone: event.target.value })} disabled={!canManage} /></label>
              <label>Email<input type="email" value={form.seller_email} onChange={(event) => setForm({ ...form, seller_email: event.target.value })} disabled={!canManage} /></label>
              <label>GST #<input value={form.gst_number} onChange={(event) => setForm({ ...form, gst_number: event.target.value })} disabled={!canManage} /></label>
              <label>Permit #<input value={form.permit_number} onChange={(event) => setForm({ ...form, permit_number: event.target.value })} disabled={!canManage} /></label>
              <label>WCB #<input value={form.wcb_number} onChange={(event) => setForm({ ...form, wcb_number: event.target.value })} disabled={!canManage} /></label>
              <label className="wide">Company address<textarea value={form.seller_address} onChange={(event) => setForm({ ...form, seller_address: event.target.value })} disabled={!canManage} /></label>
              <label className="wide">Bill to address<textarea value={form.billed_to_address} onChange={(event) => setForm({ ...form, billed_to_address: event.target.value })} disabled={!canManage} /></label>
              <label>Bill to name<input value={form.billed_to_name} onChange={(event) => setForm({ ...form, billed_to_name: event.target.value })} disabled={!canManage} /></label>
              <label>Bill to email<input type="email" value={form.billed_to_email} onChange={(event) => setForm({ ...form, billed_to_email: event.target.value })} disabled={!canManage} /></label>
            </div>
          </details>

          <div className="invoice-section">
            <div className="invoice-form-grid">
              <label className="wide">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} disabled={!canManage} /></label>
              <label className="wide">Terms<textarea value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} placeholder="Example: Payment due within 30 days." disabled={!canManage} /></label>
            </div>
          </div>
        </div>

        <footer className="invoice-editor-footer">
          <div>
            <span>Status</span>
            <strong>{statusLabel(form.status)}</strong>
          </div>
          <div>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            {canManage && (
              <>
                <button type="button" className="secondary" disabled={busy} onClick={() => void onSave(form.status)}>
                  <Save size={16} /> {busy ? 'Saving…' : 'Save'}
                </button>
                {form.status === 'draft' && (
                  <button type="button" className="manager-invoices-primary" disabled={busy} onClick={() => void onSave('issued')}>
                    <Send size={16} /> Save & issue
                  </button>
                )}
                {['issued', 'partially_paid', 'overdue'].includes(form.status) && (
                  <button type="button" className="manager-invoices-primary" disabled={busy} onClick={() => void onSave('paid')}>
                    <CheckCircle2 size={16} /> Mark paid
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}

function printInvoice(
  organization: Organization,
  form: InvoiceForm,
  lines: EditorLine[],
  totals: InvoiceTotals,
) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000')
  if (!printWindow) return

  const lineRows = lines
    .filter((line) => line.description.trim())
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td class="num">${escapeHtml(line.quantity)} ${escapeHtml(line.unit)}</td><td class="num">${money(asNumber(line.rate), form.currency_code)}</td><td class="num">${money(asNumber(line.quantity) * asNumber(line.rate), form.currency_code)}</td></tr>`,
    )
    .join('')

  const identifiers = [
    form.gst_number ? `GST ${escapeHtml(form.gst_number)}` : '',
    form.permit_number ? `Permit ${escapeHtml(form.permit_number)}` : '',
    form.wcb_number ? `WCB ${escapeHtml(form.wcb_number)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const authorization =
    form.authorized_by_name || form.authorization_contact || form.authorization_email
      ? `<div class="authorization"><b>Authorization</b><div class="authorization-grid"><span>Date: ${escapeHtml(form.authorization_date)}</span><span>Name: ${escapeHtml(form.authorized_by_name)}</span><span>Contact: ${escapeHtml(form.authorization_contact)}</span><span>Email: ${escapeHtml(form.authorization_email)}</span></div></div>`
      : ''

  const sellerContact = [form.seller_phone, form.seller_email].filter(Boolean).map(escapeHtml).join(' · ')
  const terms = form.terms ? `<br><br><b>Terms:</b> ${escapeHtml(form.terms).replace(/\n/g, '<br>')}` : ''

  const html = `<!doctype html>
<html>
<head>
  <title>${escapeHtml(form.invoice_number || 'Draft Invoice')}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;margin:38px;font-size:12px}
    .top{display:flex;justify-content:space-between;gap:28px;border-bottom:4px solid #111;padding-bottom:14px}
    .top h1{margin:0 0 4px;font-size:25px}
    .invoice-number{text-align:right}.invoice-number b{font-size:24px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:18px 0}
    .box{border:1px solid #777}.row{display:grid;grid-template-columns:140px 1fr;border-bottom:1px solid #ccc;min-height:28px}
    .row:last-child{border-bottom:0}.row b,.row span{padding:7px}.row b{background:#f4f4f4}
    .description{border:1px solid #777;min-height:90px;padding:10px;margin:18px 0}.description b{display:block;margin-bottom:6px}
    table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #ccc;padding:8px;text-align:left}
    th{border-top:2px solid #111;border-bottom:2px solid #111}.num{text-align:right}
    .totals{width:320px;margin:18px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:7px;border-bottom:1px solid #ddd}
    .totals .grand{font-size:18px;font-weight:bold;border-top:2px solid #111;border-bottom:3px double #111}
    .authorization{margin-top:18px;border:1px solid #aaa;padding:10px}.authorization-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .footer{margin-top:28px;border-top:1px solid #aaa;padding-top:10px;color:#555}.muted{color:#666}
    @media print{body{margin:14mm}}
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${escapeHtml(form.seller_name || organization.name)}</h1>
      <div>${escapeHtml(form.seller_address).replace(/\n/g, '<br>')}</div>
      <div>${sellerContact}</div>
      <div class="muted">${identifiers}</div>
    </div>
    <div class="invoice-number"><span>OFFICIAL INVOICE</span><br><b>${escapeHtml(form.invoice_number || 'DRAFT')}</b></div>
  </div>
  <div class="meta">
    <div class="box">
      <div class="row"><b>Date</b><span>${escapeHtml(form.invoice_date)}</span></div>
      <div class="row"><b>PO / AFE</b><span>${escapeHtml([form.purchase_order, form.afe_number].filter(Boolean).join(' / '))}</span></div>
      <div class="row"><b>Project</b><span>${escapeHtml(form.project)}</span></div>
      <div class="row"><b>Location</b><span>${escapeHtml(form.location)}</span></div>
      <div class="row"><b>Area</b><span>${escapeHtml(form.area)}</span></div>
    </div>
    <div class="box">
      <div class="row"><b>Bill to</b><span>${escapeHtml(form.billed_to_name)}</span></div>
      <div class="row"><b>Address</b><span>${escapeHtml(form.billed_to_address)}</span></div>
      <div class="row"><b>Email</b><span>${escapeHtml(form.billed_to_email)}</span></div>
      <div class="row"><b>Due date</b><span>${escapeHtml(form.due_date)}</span></div>
    </div>
  </div>
  <div class="description"><b>JOB DESCRIPTION</b>${escapeHtml(form.job_description).replace(/\n/g, '<br>')}</div>
  <table>
    <thead><tr><th>Equipment / Service</th><th class="num">Qty / Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><b>${money(totals.subtotal, form.currency_code)}</b></div>
    <div><span>GST / Tax ${escapeHtml(form.tax_rate)}%</span><b>${money(totals.tax, form.currency_code)}</b></div>
    <div class="grand"><span>TOTAL</span><b>${money(totals.total, form.currency_code)}</b></div>
  </div>
  ${authorization}
  <div class="footer">${escapeHtml(form.notes).replace(/\n/g, '<br>')}${terms}</div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`

  printWindow.document.write(html)
  printWindow.document.close()
}
