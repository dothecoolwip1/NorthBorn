import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Eye, FileText, RefreshCw, X } from 'lucide-react'
import FieldTicketsPage from './FieldTicketsPage'
import { supabase } from './lib/supabase'
import type { TemplateRow } from './template-manager-data'
import './field-ticket-template-runtime.css'

const db = supabase as any

type Mounts = {
  banner: HTMLElement | null
  side: HTMLElement | null
}

function TemplateSummary({ template, onOpen }: { template: TemplateRow; onOpen: () => void }) {
  const mapped = template.fields.filter(field => field.binding).length
  return <div className="ticket-template-banner">
    <div className="ticket-template-banner-icon"><CheckCircle2 size={22}/></div>
    <div className="ticket-template-banner-copy">
      <span>YOUR COMPANY FORM</span>
      <strong>{template.name}</strong>
      <small>{template.source_kind === 'fillable_pdf'
        ? `This ticket uses the PDF selected in Templates. Northborn recognized ${template.fields.length} items and matched ${mapped} automatically.`
        : `This ticket uses your company template with ${template.fields.length} items.`}</small>
    </div>
    {template.source_kind === 'fillable_pdf' && <button type="button" onClick={onOpen}><Eye size={16}/>View form</button>}
  </div>
}

function TemplateSide({ template, pdfUrl }: { template: TemplateRow; pdfUrl: string }) {
  return <section className="ticket-template-side">
    <header>
      <div><span>COMPANY TEMPLATE</span><strong>{template.name}</strong><small>{template.original_file_name || `Version ${template.version}`}</small></div>
    </header>
    {template.source_kind === 'fillable_pdf' ? (
      pdfUrl
        ? <iframe src={`${pdfUrl}#toolbar=0&navpanes=0`} title={`${template.name} company form`}/>
        : <div className="ticket-template-unavailable"><FileText size={34}/><strong>PDF preview unavailable</strong><span>The ticket can still be completed and saved.</span></div>
    ) : <div className="ticket-template-field-guide">
      <p>Your company chose these items for this field ticket.</p>
      {template.fields.map(field => <div key={field.id}><CheckCircle2 size={14}/><span>{field.label}</span></div>)}
    </div>}
  </section>
}

export default function TemplateAwareFieldTicketsPage() {
  const [template, setTemplate] = useState<TemplateRow | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [editor, setEditor] = useState<HTMLElement | null>(null)
  const [mounts, setMounts] = useState<Mounts>({ banner: null, side: null })
  const [mobilePreview, setMobilePreview] = useState(false)
  const [templateError, setTemplateError] = useState('')

  useEffect(() => {
    let active = true
    const loadTemplate = async () => {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) return
      const membership = await db.from('organization_members').select('organization_id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle()
      if (!active || membership.error || !membership.data?.organization_id) return
      const result = await db.from('document_templates')
        .select('*')
        .eq('organization_id', membership.data.organization_id)
        .eq('document_type', 'field_ticket')
        .eq('status', 'active')
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (result.error) {
        setTemplateError('Northborn could not load the company field ticket template. The standard ticket is being shown instead.')
        return
      }
      const row = (result.data || null) as TemplateRow | null
      setTemplate(row)
      if (row?.source_kind === 'fillable_pdf' && row.file_path) {
        const signed = await supabase.storage.from('document-templates').createSignedUrl(row.file_path, 3600)
        if (!active) return
        if (signed.error) setTemplateError('The company template is active, but its PDF preview could not be opened.')
        else setPdfUrl(signed.data?.signedUrl || '')
      }
    }
    void loadTemplate()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const findEditor = () => setEditor(document.querySelector('.ticket-editor') as HTMLElement | null)
    findEditor()
    const observer = new MutationObserver(findEditor)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!editor || !template) {
      setMounts({ banner: null, side: null })
      return
    }
    const body = editor.querySelector('.ticket-editor-body') as HTMLElement | null
    if (!body) return
    editor.classList.add('ticket-template-active')
    const banner = document.createElement('div')
    banner.className = 'ticket-template-banner-mount'
    body.prepend(banner)
    const side = document.createElement('div')
    side.className = 'ticket-template-side-mount'
    const header = editor.querySelector(':scope > header')
    if (header?.nextSibling) editor.insertBefore(side, header.nextSibling)
    else editor.appendChild(side)
    const heading = editor.querySelector(':scope > header h2') as HTMLElement | null
    const eyebrow = editor.querySelector(':scope > header span') as HTMLElement | null
    const oldHeading = heading?.textContent || ''
    const oldEyebrow = eyebrow?.textContent || ''
    if (heading) heading.textContent = template.name
    if (eyebrow) eyebrow.textContent = 'COMPANY FIELD TICKET'
    setMounts({ banner, side })
    return () => {
      editor.classList.remove('ticket-template-active')
      if (heading) heading.textContent = oldHeading
      if (eyebrow) eyebrow.textContent = oldEyebrow
      banner.remove()
      side.remove()
      setMounts({ banner: null, side: null })
      setMobilePreview(false)
    }
  }, [editor, template])

  const formDetails = useMemo(() => {
    if (!template) return null
    return `${template.name} · v${template.version}${template.page_count ? ` · ${template.page_count} page${template.page_count === 1 ? '' : 's'}` : ''}`
  }, [template])

  return <>
    <FieldTicketsPage />
    {templateError && <div className="ticket-template-runtime-message"><RefreshCw size={15}/>{templateError}</div>}
    {template && mounts.banner && createPortal(<TemplateSummary template={template} onOpen={() => setMobilePreview(true)}/>, mounts.banner)}
    {template && mounts.side && createPortal(<TemplateSide template={template} pdfUrl={pdfUrl}/>, mounts.side)}
    {template && mobilePreview && <div className="ticket-template-mobile-layer" role="dialog" aria-modal="true" aria-label="Company field ticket template">
      <button className="ticket-template-mobile-scrim" type="button" aria-label="Close company form" onClick={() => setMobilePreview(false)}/>
      <section className="ticket-template-mobile-card">
        <header><div><span>COMPANY FORM</span><strong>{formDetails}</strong></div><button type="button" onClick={() => setMobilePreview(false)}><X size={20}/></button></header>
        {pdfUrl ? <iframe src={`${pdfUrl}#toolbar=0&navpanes=0`} title={`${template.name} company form`}/> : <div className="ticket-template-unavailable"><FileText size={34}/><strong>Preview unavailable</strong><span>You can continue completing the ticket.</span></div>}
      </section>
    </div>}
  </>
}
