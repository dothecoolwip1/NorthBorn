import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Mail, Phone, Plus, Star, Trash2, UserRound, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Customer = {
  id: string
  organization_id: string
  name: string
}

type Contact = {
  id: string
  organization_id: string
  customer_id: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  contact_type: string
  notes: string | null
  status: string
}

type JobContact = {
  id: string
  contact_id: string
  is_primary: boolean
}

const CONTACT_TYPES = [
  ['field', 'Field operator'],
  ['dispatch', 'Dispatch'],
  ['supervisor', 'Supervisor'],
  ['billing', 'Billing'],
  ['accounting', 'Accounting'],
  ['office', 'Office'],
  ['other', 'Other'],
] as const

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: string })?.message || error || 'Something went wrong.')
}

export function CustomerContactsManager({ customer }: { customer: Customer }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emptyForm = { name: '', title: '', phone: '', email: '', contact_type: 'field', notes: '' }
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    const result = await supabase
      .from('customer_contacts')
      .select('id,organization_id,customer_id,name,title,phone,email,contact_type,notes,status')
      .eq('organization_id', customer.organization_id)
      .eq('customer_id', customer.id)
      .neq('status', 'archived')
      .order('name')
    if (result.error) return setError(result.error.message)
    setContacts((result.data ?? []) as Contact[])
  }, [customer.id, customer.organization_id])

  useEffect(() => { void load() }, [load])

  const startAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setOpen(true)
  }

  const startEdit = (contact: Contact) => {
    setEditing(contact)
    setForm({
      name: contact.name,
      title: contact.title || '',
      phone: contact.phone || '',
      email: contact.email || '',
      contact_type: contact.contact_type,
      notes: contact.notes || '',
    })
    setError('')
    setOpen(true)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id
      if (!userId) throw new Error('You must be signed in.')
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        contact_type: form.contact_type,
        notes: form.notes.trim() || null,
      }
      const result = editing
        ? await supabase.from('customer_contacts').update(payload).eq('id', editing.id).eq('organization_id', customer.organization_id)
        : await supabase.from('customer_contacts').insert({
            ...payload,
            organization_id: customer.organization_id,
            customer_id: customer.id,
            created_by: userId,
          })
      if (result.error) throw result.error
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const archive = async (contact: Contact) => {
    setError('')
    const result = await supabase
      .from('customer_contacts')
      .update({ status: 'archived' })
      .eq('id', contact.id)
      .eq('organization_id', customer.organization_id)
    if (result.error) return setError(result.error.message)
    await load()
  }

  const operational = contacts.filter(contact => !['billing', 'accounting'].includes(contact.contact_type))
  const billing = contacts.filter(contact => ['billing', 'accounting'].includes(contact.contact_type))

  const renderContacts = (items: Contact[]) => items.length ? (
    <div className="contact-list">
      {items.map(contact => (
        <div className="contact-row" key={contact.id}>
          <div className="contact-avatar"><UserRound size={17}/></div>
          <button type="button" className="contact-main" onClick={() => startEdit(contact)}>
            <strong>{contact.name}</strong>
            <span>{contact.title || CONTACT_TYPES.find(([key]) => key === contact.contact_type)?.[1] || contact.contact_type}</span>
            <small>{contact.phone || contact.email || 'No contact details yet'}</small>
          </button>
          <div className="contact-actions">
            {contact.phone && <a href={`tel:${contact.phone}`} aria-label={`Call ${contact.name}`}><Phone size={15}/></a>}
            {contact.email && <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}><Mail size={15}/></a>}
            <button type="button" className="danger-icon" onClick={() => void archive(contact)} aria-label={`Archive ${contact.name}`}><Trash2 size={15}/></button>
          </div>
        </div>
      ))}
    </div>
  ) : <div className="contact-empty">No contacts in this group yet.</div>

  return (
    <section className="customer-contacts-manager">
      <div className="contact-section-head">
        <div><span className="eyebrow">CONTACTS</span><h3>People at {customer.name}</h3></div>
        <button type="button" className="secondary" onClick={startAdd}><Plus size={16}/>Add contact</button>
      </div>
      {error && <div className="message">{error}</div>}
      <div className="contact-groups">
        <div><div className="contact-group-label">Field / operations</div>{renderContacts(operational)}</div>
        <div><div className="contact-group-label">Billing / accounting</div>{renderContacts(billing)}</div>
      </div>

      {open && (
        <div className="contact-editor">
          <div className="contact-editor-head"><strong>{editing ? 'Edit contact' : 'New contact'}</strong><button type="button" onClick={() => setOpen(false)}><X size={17}/></button></div>
          <form onSubmit={save}>
            <div className="contact-form-grid">
              <label><span>Name</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required/></label>
              <label><span>Role / title</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Field operator"/></label>
              <label><span>Contact type</span><select value={form.contact_type} onChange={e => setForm({ ...form, contact_type: e.target.value })}>{CONTACT_TYPES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>Phone</span><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label>
              <label><span>Email</span><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label>
            </div>
            <label className="contact-notes"><span>Notes</span><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
            {error && <div className="message">{error}</div>}
            <div className="contact-form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</button></div>
          </form>
        </div>
      )}
    </section>
  )
}

export function JobContactsEditor({ organizationId, customerId, jobId }: { organizationId: string; customerId: string; jobId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [assigned, setAssigned] = useState<JobContact[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [contactsResult, assignedResult] = await Promise.all([
      supabase
        .from('customer_contacts')
        .select('id,organization_id,customer_id,name,title,phone,email,contact_type,notes,status')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('job_contacts')
        .select('id,contact_id,is_primary')
        .eq('organization_id', organizationId)
        .eq('job_id', jobId),
    ])
    const firstError = contactsResult.error || assignedResult.error
    if (firstError) return setError(firstError.message)
    setContacts((contactsResult.data ?? []) as Contact[])
    setAssigned((assignedResult.data ?? []) as JobContact[])
  }, [customerId, jobId, organizationId])

  useEffect(() => { void load() }, [load])

  const assignedIds = useMemo(() => new Set(assigned.map(item => item.contact_id)), [assigned])

  const toggleContact = async (contactId: string) => {
    setBusyId(contactId)
    setError('')
    try {
      const existing = assigned.find(item => item.contact_id === contactId)
      if (existing) {
        const result = await supabase.from('job_contacts').delete().eq('id', existing.id).eq('organization_id', organizationId)
        if (result.error) throw result.error
      } else {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id
        if (!userId) throw new Error('You must be signed in.')
        const result = await supabase.from('job_contacts').insert({
          organization_id: organizationId,
          job_id: jobId,
          contact_id: contactId,
          is_primary: assigned.length === 0,
          created_by: userId,
        })
        if (result.error) throw result.error
      }
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const makePrimary = async (contactId: string) => {
    setBusyId(contactId)
    setError('')
    try {
      const clear = await supabase.from('job_contacts').update({ is_primary: false }).eq('organization_id', organizationId).eq('job_id', jobId)
      if (clear.error) throw clear.error
      const set = await supabase.from('job_contacts').update({ is_primary: true }).eq('organization_id', organizationId).eq('job_id', jobId).eq('contact_id', contactId)
      if (set.error) throw set.error
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const fieldContacts = contacts.filter(contact => !['billing', 'accounting'].includes(contact.contact_type))
  const billingContacts = contacts.filter(contact => ['billing', 'accounting'].includes(contact.contact_type))

  const group = (label: string, items: Contact[]) => (
    <div className="job-contact-group">
      <div className="picker-title">{label}</div>
      <div className="job-contact-options">
        {items.map(contact => {
          const active = assignedIds.has(contact.id)
          const primary = assigned.find(item => item.contact_id === contact.id)?.is_primary
          return (
            <div className={active ? 'job-contact-option active' : 'job-contact-option'} key={contact.id}>
              <button type="button" disabled={busyId === contact.id} onClick={() => void toggleContact(contact.id)}>
                <span className="contact-check">{active ? <Check size={14}/> : null}</span>
                <span><strong>{contact.name}</strong><small>{contact.title || contact.contact_type}{contact.phone ? ` · ${contact.phone}` : ''}</small></span>
              </button>
              {active && <button type="button" className={primary ? 'primary-star active' : 'primary-star'} title="Make primary field contact" onClick={() => void makePrimary(contact.id)}><Star size={15} fill={primary ? 'currentColor' : 'none'}/></button>}
            </div>
          )
        })}
        {!items.length && <span className="muted">No contacts available.</span>}
      </div>
    </div>
  )

  return (
    <section className="job-contacts-editor">
      <div className="assigned-label">Job contacts</div>
      <p className="job-contact-help">Choose the people the field crew should actually contact. Billing contacts stay hidden unless you deliberately assign them.</p>
      {error && <div className="message">{error}</div>}
      {group('Field / operations', fieldContacts)}
      {billingContacts.length > 0 && group('Billing / accounting', billingContacts)}
    </section>
  )
}
