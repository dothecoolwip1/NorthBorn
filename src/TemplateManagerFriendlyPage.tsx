import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Eye,
  FileCheck2,
  FileCog,
  FilePlus2,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import {
  DOCUMENT_TYPE_OPTIONS,
  FIELD_TYPE_OPTIONS,
  NORTHBORN_BINDINGS,
  analyzePdfFile,
  documentTypeLabel,
  fieldsFromPdfAnalysis,
  makeTemplateField,
  presetFields,
  type TemplateDocumentType,
  type TemplateField,
  type TemplateFieldType,
  type TemplateRow,
  type TemplateSourceKind,
  type TemplateStatus,
} from './template-manager-data'
import './template-manager.css'
import './template-manager-friendly.css'

const db = supabase as any
const LOCAL_KEY = 'northborn_template_manager_v1'
const MANAGER_ROLES = new Set(['owner', 'admin'])

const EMPTY_DRAFT = {
  id: '',
  name: '',
  documentType: 'invoice' as TemplateDocumentType,
  sourceKind: 'northborn_builder' as TemplateSourceKind,
  description: '',
  fields: presetFields('invoice'),
  status: 'draft' as TemplateStatus,
  isDefault: true,
  version: 1,
  filePath: '',
  originalFileName: '',
  pageCount: null as number | null,
  settings: {} as Record<string, unknown>,
}

type Draft = typeof EMPTY_DRAFT

type Context = {
  organizationId: string
  organizationName: string
  roleKey: string
  userId: string
}

type EditorMode = 'new' | 'edit' | 'duplicate'

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'template.pdf'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed)
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readLocal(organizationId: string): TemplateRow[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`${LOCAL_KEY}:${organizationId}`) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function writeLocal(organizationId: string, rows: TemplateRow[]) {
  localStorage.setItem(`${LOCAL_KEY}:${organizationId}`, JSON.stringify(rows))
}

function sourceLabel(value: TemplateSourceKind) {
  return value === 'fillable_pdf' ? 'Uploaded PDF' : 'Built in Northborn'
}

function statusLabel(value: TemplateStatus) {
  if (value === 'active') return 'Ready to use'
  if (value === 'archived') return 'Archived'
  return 'Not finished'
}

function templateSnapshot(row: Partial<TemplateRow>) {
  return {
    name: row.name,
    document_type: row.document_type,
    source_kind: row.source_kind,
    description: row.description,
    status: row.status,
    is_default: row.is_default,
    version: row.version,
    original_file_name: row.original_file_name,
    page_count: row.page_count,
    fields: row.fields,
    settings: row.settings,
  }
}

function FieldPreview({ field }: { field: TemplateField }) {
  if (field.type === 'table') return <div className="template-preview-table"><div/><div/><div/><div/><div/><div/></div>
  if (field.type === 'checkbox') return <div className="template-preview-check"><span/> Yes <span/> No</div>
  if (field.type === 'signature') return <div className="template-preview-signature">Signature</div>
  if (field.type === 'textarea') return <div className="template-preview-line tall"/>
  return <div className="template-preview-line"/>
}

function TemplatePreview({ draft, fileUrl }: { draft: Draft; fileUrl: string }) {
  if (draft.sourceKind === 'fillable_pdf' && fileUrl) {
    return <div className="template-pdf-preview"><iframe src={fileUrl} title={`${draft.name || 'PDF'} preview`}/></div>
  }

  return <div className="template-paper-preview">
    <div className="template-paper-header"><div className="template-paper-logo">N</div><div><strong>{draft.name || documentTypeLabel(draft.documentType)}</strong><span>{documentTypeLabel(draft.documentType)}</span></div></div>
    <div className="template-paper-rule"/>
    <div className="template-paper-fields">{draft.fields.slice(0, 18).map(field => <div key={field.id} className={`template-paper-field ${field.type === 'textarea' || field.type === 'table' ? 'wide' : ''}`}><label>{field.label}{field.required ? ' *' : ''}</label><FieldPreview field={field}/></div>)}</div>
    {!draft.fields.length && <div className="template-paper-empty">Northborn will show the form here after it is ready.</div>}
  </div>
}

export default function TemplateManagerFriendlyPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [localMode, setLocalMode] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('new')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, fields: presetFields('invoice') })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [previewRow, setPreviewRow] = useState<TemplateRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TemplateRow | null>(null)

  useEffect(() => {
    let active = true
    const resolve = async (next: Session | null) => {
      if (!active) return
      setSession(next)
      setContext(null)
      if (!next) { setLoading(false); return }
      setLoading(true)
      const membership = await db.from('organization_members')
        .select('id,organization_id,organization:organizations(name)')
        .eq('user_id', next.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (membership.error || !membership.data?.id) {
        setError(membership.error?.message || 'This account is not connected to a Northborn company workspace.')
        setLoading(false)
        return
      }
      const roleResult = await db.from('membership_roles').select('role:roles(key)').eq('membership_id', membership.data.id).limit(1).maybeSingle()
      if (!active) return
      const organization = membership.data.organization as { name?: string } | null
      setContext({
        organizationId: membership.data.organization_id,
        organizationName: organization?.name || 'Northborn company',
        roleKey: roleResult.data?.role?.key || '',
        userId: next.user.id,
      })
      setLoading(false)
    }
    void supabase.auth.getSession().then(({ data }) => void resolve(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { void resolve(next) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!context || !MANAGER_ROLES.has(context.roleKey)) return
    void loadTemplates(context)
  }, [context?.organizationId, context?.roleKey])

  useEffect(() => () => {
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
  }, [fileUrl])

  const loadTemplates = async (ctx = context) => {
    if (!ctx) return
    setLoading(true)
    setError('')
    const result = await db.from('document_templates').select('*').eq('organization_id', ctx.organizationId).order('updated_at', { ascending: false })
    if (result.error) {
      const unavailable = /document_templates|schema cache|relation .* does not exist/i.test(result.error.message)
      if (unavailable) {
        setLocalMode(true)
        setRows(readLocal(ctx.organizationId))
        setError('Northborn could not reach your shared template library, so changes on this screen are temporarily staying on this device.')
      } else setError(result.error.message)
      setLoading(false)
      return
    }
    setLocalMode(false)
    setRows((result.data || []) as TemplateRow[])
    setLoading(false)
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(row => {
      if (typeFilter !== 'all' && row.document_type !== typeFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return `${row.name} ${row.description || ''} ${row.document_type} ${row.original_file_name || ''}`.toLowerCase().includes(query)
    })
  }, [rows, search, statusFilter, typeFilter])

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(row => row.status === 'active').length,
    pdf: rows.filter(row => row.source_kind === 'fillable_pdf').length,
    defaults: rows.filter(row => row.is_default && row.status === 'active').length,
  }), [rows])

  const mappedCount = useMemo(() => draft.fields.filter(field => field.binding).length, [draft.fields])
  const needsHelpCount = useMemo(() => draft.fields.filter(field => !field.binding).length, [draft.fields])

  const showSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 3500)
  }

  const resetEditorFile = () => {
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
    setSelectedFile(null)
    setFileUrl('')
  }

  const openNew = (documentType: TemplateDocumentType = 'invoice', sourceKind: TemplateSourceKind = 'northborn_builder') => {
    resetEditorFile()
    setEditorMode('new')
    setShowAdvanced(false)
    setDraft({ ...EMPTY_DRAFT, id: newId(), documentType, sourceKind, fields: sourceKind === 'northborn_builder' ? presetFields(documentType) : [], version: 1, isDefault: true })
    setEditorOpen(true)
    setError('')
  }

  const rowToDraft = (row: TemplateRow, duplicate = false): Draft => ({
    id: duplicate ? newId() : row.id,
    name: duplicate ? `${row.name} copy` : row.name,
    documentType: row.document_type,
    sourceKind: row.source_kind,
    description: row.description || '',
    fields: (row.fields || []).map(field => ({ ...field, id: duplicate ? newId() : field.id || newId() })),
    status: duplicate ? 'draft' : row.status,
    isDefault: duplicate ? false : row.is_default,
    version: duplicate ? 1 : row.version,
    filePath: duplicate ? '' : row.file_path || '',
    originalFileName: row.original_file_name || '',
    pageCount: row.page_count,
    settings: { ...(row.settings || {}) },
  })

  const openEdit = (row: TemplateRow) => {
    resetEditorFile()
    setEditorMode('edit')
    setShowAdvanced(false)
    setDraft(rowToDraft(row))
    setEditorOpen(true)
    setError('')
  }

  const duplicateTemplate = (row: TemplateRow) => {
    resetEditorFile()
    setEditorMode('duplicate')
    setShowAdvanced(false)
    setDraft(rowToDraft(row, true))
    setEditorOpen(true)
    setError('')
  }

  const closeEditor = () => {
    if (busy) return
    resetEditorFile()
    setEditorOpen(false)
    setShowAdvanced(false)
  }

  const changeDocumentType = (value: TemplateDocumentType) => {
    setDraft(current => ({
      ...current,
      documentType: value,
      fields: current.sourceKind === 'northborn_builder' ? presetFields(value) : current.fields,
    }))
  }

  const changeSourceKind = (value: TemplateSourceKind) => {
    resetEditorFile()
    setDraft(current => ({
      ...current,
      sourceKind: value,
      filePath: value === 'northborn_builder' ? '' : current.filePath,
      originalFileName: value === 'northborn_builder' ? '' : current.originalFileName,
      pageCount: value === 'northborn_builder' ? null : current.pageCount,
      fields: value === 'northborn_builder' ? presetFields(current.documentType) : [],
    }))
  }

  const choosePdf = async (file: File | null) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('That PDF is too large. Please use a file smaller than 25 MB.')
      return
    }
    setPdfBusy(true)
    setError('')
    try {
      const analysis = await analyzePdfFile(file, draft.documentType)
      if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
      const nextUrl = URL.createObjectURL(file)
      const suggestedName = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim()
      setSelectedFile(file)
      setFileUrl(nextUrl)
      setDraft(current => ({
        ...current,
        name: current.name.trim() ? current.name : suggestedName,
        originalFileName: file.name,
        pageCount: analysis.pageCount,
        fields: fieldsFromPdfAnalysis(analysis, current.documentType),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Northborn could not read that PDF. Try another file.')
    } finally {
      setPdfBusy(false)
    }
  }

  const addField = () => setDraft(current => ({ ...current, fields: [...current.fields, makeTemplateField('New field', '', 'text', false, 'custom')] }))

  const updateField = (index: number, patch: Partial<TemplateField>) => setDraft(current => ({
    ...current,
    fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field),
  }))

  const removeField = (index: number) => setDraft(current => ({ ...current, fields: current.fields.filter((_field, fieldIndex) => fieldIndex !== index) }))

  const uploadPdf = async (templateId: string, version: number) => {
    if (!selectedFile || !context) return draft.filePath
    if (localMode) return `local-preview/${templateId}/v${version}/${safeFileName(selectedFile.name)}`
    const path = `${context.organizationId}/${templateId}/v${version}/${Date.now()}-${safeFileName(selectedFile.name)}`
    const result = await supabase.storage.from('document-templates').upload(path, selectedFile, { contentType: 'application/pdf', upsert: false })
    if (result.error) throw result.error
    return result.data.path
  }

  const clearOtherDefault = async (documentType: TemplateDocumentType, exceptId: string) => {
    if (!context || localMode) return
    const result = await db.from('document_templates')
      .update({ is_default: false, updated_by: context.userId })
      .eq('organization_id', context.organizationId)
      .eq('document_type', documentType)
      .neq('id', exceptId)
      .eq('is_default', true)
    if (result.error) throw result.error
  }

  const saveTemplate = async (publish: boolean) => {
    if (!context) return
    const name = draft.name.trim()
    if (name.length < 2) return setError('Please give this form a name.')
    if (draft.sourceKind === 'fillable_pdf' && !selectedFile && !draft.filePath) return setError('Please choose the PDF you want Northborn to use.')
    if (!draft.fields.length) return setError(draft.sourceKind === 'fillable_pdf' ? 'Northborn could not find usable fillable boxes in this PDF. Try a fillable PDF, or choose “Build a form in Northborn.”' : 'This form needs at least one field before it can be used.')

    const duplicatedKeys = draft.fields.map(field => field.key.trim()).filter((key, index, all) => key && all.indexOf(key) !== index)
    if (duplicatedKeys.length) return setError('Two fields have the same internal name. Open Advanced settings and rename one of them.')

    setBusy(true)
    setError('')
    let uploadedPath = ''
    try {
      const isNew = editorMode !== 'edit'
      const nextVersion = isNew ? 1 : draft.version + 1
      uploadedPath = await uploadPdf(draft.id, nextVersion)
      const now = new Date().toISOString()
      const hasExistingDefault = rows.some(row => row.document_type === draft.documentType && row.status === 'active' && row.is_default && row.id !== draft.id)
      const shouldBeDefault = publish && (draft.isDefault || !hasExistingDefault)
      if (shouldBeDefault) await clearOtherDefault(draft.documentType, draft.id)

      const payload: TemplateRow = {
        id: draft.id,
        organization_id: context.organizationId,
        name,
        document_type: draft.documentType,
        source_kind: draft.sourceKind,
        description: draft.description.trim() || null,
        status: publish ? 'active' : 'draft',
        is_default: shouldBeDefault,
        version: nextVersion,
        file_path: uploadedPath || draft.filePath || null,
        original_file_name: draft.sourceKind === 'fillable_pdf' ? (selectedFile?.name || draft.originalFileName || null) : null,
        page_count: draft.sourceKind === 'fillable_pdf' ? draft.pageCount : null,
        fields: draft.fields,
        settings: draft.settings,
        created_by: context.userId,
        updated_by: context.userId,
        published_at: publish ? now : null,
        created_at: isNew ? now : rows.find(row => row.id === draft.id)?.created_at || now,
        updated_at: now,
      }

      if (localMode) {
        const base = rows
          .filter(row => row.id !== draft.id)
          .map(row => shouldBeDefault && row.document_type === draft.documentType ? { ...row, is_default: false } : row)
        const next = [payload, ...base].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        setRows(next)
        writeLocal(context.organizationId, next)
      } else {
        if (isNew) {
          const templateResult = await db.from('document_templates').insert(payload)
          if (templateResult.error) throw templateResult.error
        } else {
          const updatePayload = {
            name: payload.name,
            document_type: payload.document_type,
            source_kind: payload.source_kind,
            description: payload.description,
            status: payload.status,
            is_default: payload.is_default,
            version: payload.version,
            file_path: payload.file_path,
            original_file_name: payload.original_file_name,
            page_count: payload.page_count,
            fields: payload.fields,
            settings: payload.settings,
            updated_by: payload.updated_by,
            published_at: payload.published_at,
            updated_at: payload.updated_at,
          }
          const templateResult = await db.from('document_templates').update(updatePayload).eq('id', draft.id).eq('organization_id', context.organizationId)
          if (templateResult.error) throw templateResult.error
        }
        const versionResult = await db.from('document_template_versions').insert({
          organization_id: context.organizationId,
          template_id: draft.id,
          version: nextVersion,
          snapshot: templateSnapshot(payload),
          file_path: payload.file_path,
          created_by: context.userId,
        })
        if (versionResult.error) throw versionResult.error
        await loadTemplates(context)
      }

      resetEditorFile()
      setEditorOpen(false)
      setShowAdvanced(false)
      showSuccess(publish ? `${name} is ready to use.` : `${name} was saved for later.`)
    } catch (caught) {
      if (uploadedPath && !localMode) await supabase.storage.from('document-templates').remove([uploadedPath])
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const updateRowState = async (row: TemplateRow, patch: Partial<TemplateRow>, message: string) => {
    if (!context) return
    setBusy(true)
    setError('')
    try {
      if (patch.is_default) await clearOtherDefault(row.document_type, row.id)
      if (localMode) {
        const next = rows.map(item => {
          if (patch.is_default && item.document_type === row.document_type && item.id !== row.id) return { ...item, is_default: false }
          return item.id === row.id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item
        })
        setRows(next)
        writeLocal(context.organizationId, next)
      } else {
        const result = await db.from('document_templates').update({ ...patch, updated_by: context.userId }).eq('id', row.id).eq('organization_id', context.organizationId)
        if (result.error) throw result.error
        await loadTemplates(context)
      }
      showSuccess(message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const removeTemplate = async (row: TemplateRow) => {
    if (!context) return
    setBusy(true)
    setError('')
    try {
      if (localMode) {
        const next = rows.filter(item => item.id !== row.id)
        setRows(next)
        writeLocal(context.organizationId, next)
      } else {
        const result = await db.from('document_templates').delete().eq('id', row.id).eq('organization_id', context.organizationId)
        if (result.error) throw result.error
        if (row.file_path) await supabase.storage.from('document-templates').remove([row.file_path])
        await loadTemplates(context)
      }
      setConfirmDelete(null)
      showSuccess('Template deleted.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const previewTemplate = async (row: TemplateRow) => {
    setPreviewRow(row)
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
    setFileUrl('')
    if (row.source_kind !== 'fillable_pdf' || !row.file_path || row.file_path.startsWith('local-preview/')) return
    const result = await supabase.storage.from('document-templates').createSignedUrl(row.file_path, 300)
    if (result.error) setError(result.error.message)
    else setFileUrl(result.data?.signedUrl || '')
  }

  if (loading && !context) return <div className="center-screen">Opening your templates…</div>
  if (!session) return <div className="center-screen"><div className="template-access-card"><FileCog size={36}/><h1>Sign in required</h1><p>Sign in to manage your company forms.</p><button onClick={() => navigate('/')}>Back to Northborn</button></div></div>
  if (context && !MANAGER_ROLES.has(context.roleKey)) return <div className="center-screen"><div className="template-access-card"><FileCog size={36}/><h1>Company forms</h1><p>Only company owners and administrators can change company forms.</p><button onClick={() => navigate('/')}>Back to dashboard</button></div></div>
  if (!context) return <div className="center-screen"><div className="template-access-card"><AlertTriangle size={36}/><h1>Company forms unavailable</h1><p>{error || 'Northborn could not open your company workspace.'}</p><button onClick={() => navigate('/')}>Back to Northborn</button></div></div>

  return <section className="template-page">
    <div className="template-hero friendly-hero">
      <div><span className="template-eyebrow">COMPANY FORMS</span><h1>Templates</h1><p>Choose a form, upload your PDF or let Northborn build one, check the preview, and use it. Northborn handles the technical setup for you.</p></div>
      <div className="template-hero-actions"><button className="secondary" type="button" onClick={() => void loadTemplates()}><RefreshCw size={17}/>Refresh</button><button className="primary" type="button" onClick={() => openNew()}><FilePlus2 size={18}/>Add a form</button></div>
    </div>

    {localMode && <div className="template-mode-banner"><AlertTriangle size={18}/><div><strong>Temporary device mode</strong><span>Northborn cannot reach the shared form library right now. You can keep working here, but these changes will only be on this device until the connection is restored.</span></div></div>}
    {error && <div className="template-message error"><AlertTriangle size={18}/><span>{error}</span><button type="button" onClick={() => setError('')}><X size={16}/></button></div>}
    {success && <div className="template-message success"><CheckCircle2 size={18}/><span>{success}</span></div>}

    <div className="template-stat-grid friendly-stats">
      <div className="template-stat"><FileText/><span>Forms</span><strong>{stats.total}</strong><small>saved in your company</small></div>
      <div className="template-stat"><BadgeCheck/><span>Ready</span><strong>{stats.active}</strong><small>available to use now</small></div>
      <div className="template-stat"><Upload/><span>Your PDFs</span><strong>{stats.pdf}</strong><small>forms you uploaded</small></div>
      <div className="template-stat"><Star/><span>Automatic</span><strong>{stats.defaults}</strong><small>chosen automatically</small></div>
    </div>

    <section className="template-panel template-start-panel friendly-start">
      <div className="template-section-heading"><div><span className="template-eyebrow">START HERE</span><h2>What kind of form do you want to add?</h2><p className="friendly-subtext">Pick one. Northborn will do the setup and you can change it later.</p></div></div>
      <div className="template-starter-grid">
        {(['invoice', 'flha', 'pre_trip', 'field_ticket'] as TemplateDocumentType[]).map(type => <button type="button" key={type} onClick={() => openNew(type, 'fillable_pdf')}><FileCheck2/><span><strong>{documentTypeLabel(type)}</strong><small>{DOCUMENT_TYPE_OPTIONS.find(option => option.value === type)?.description}</small></span><Plus/></button>)}
      </div>
      <button className="friendly-other-form" type="button" onClick={() => openNew('custom', 'fillable_pdf')}><Plus size={17}/>Something else</button>
    </section>

    <section className="template-panel">
      <div className="template-library-heading"><div><span className="template-eyebrow">YOUR FORMS</span><h2>Saved templates</h2></div><button className="primary compact" type="button" onClick={() => openNew()}><Plus size={17}/>Add form</button></div>
      <div className="template-toolbar">
        <label className="template-search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a form…"/></label>
        <label><Filter size={16}/><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All form types</option>{DOCUMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><Filter size={16}/><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Everything</option><option value="active">Ready to use</option><option value="draft">Not finished</option><option value="archived">Archived</option></select></label>
      </div>

      {loading ? <div className="template-loading"><Loader2 className="spin"/>Opening forms…</div> : filteredRows.length ? <div className="template-card-grid">{filteredRows.map(row => <article className={`template-card status-${row.status}`} key={row.id}>
        <div className="template-card-top"><div className="template-card-icon">{row.source_kind === 'fillable_pdf' ? <FileText/> : <FileCog/>}</div><div className="template-card-badges"><span className={`template-status ${row.status}`}>{statusLabel(row.status)}</span>{row.is_default && <span className="template-default"><Star size={12}/>Automatic choice</span>}</div></div>
        <div className="template-card-title"><strong>{row.name}</strong><span>{documentTypeLabel(row.document_type)} · {sourceLabel(row.source_kind)}</span></div>
        {row.description && <p>{row.description}</p>}
        <div className="template-card-meta friendly-card-meta"><span><b>{row.fields?.length || 0}</b> recognized items</span><span><b>{formatDate(row.updated_at)}</b> last changed</span></div>
        {row.original_file_name && <div className="template-file-name"><FileText size={15}/>{row.original_file_name}</div>}
        <div className="template-card-actions"><button type="button" onClick={() => void previewTemplate(row)}><Eye size={16}/>View</button><button type="button" onClick={() => openEdit(row)}><Pencil size={16}/>Change</button><button type="button" onClick={() => duplicateTemplate(row)}><Copy size={16}/>Copy</button></div>
        <div className="template-card-menu">
          {row.status !== 'active' && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { status: 'active', published_at: new Date().toISOString() }, 'This form is ready to use.')}><BadgeCheck size={15}/>Use this form</button>}
          {row.status === 'active' && !row.is_default && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { is_default: true }, `${row.name} will now be chosen automatically.`)}><Star size={15}/>Choose automatically</button>}
          {row.status !== 'archived' && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { status: 'archived', is_default: false }, 'Form moved to archive.')}><Archive size={15}/>Archive</button>}
          <button type="button" className="danger" disabled={busy} onClick={() => setConfirmDelete(row)}><Trash2 size={15}/>Delete</button>
        </div>
      </article>)}</div> : <div className="template-empty"><FileCog/><h3>No forms here yet</h3><p>Pick a form above or add your own PDF.</p><button className="primary" type="button" onClick={() => openNew()}><Plus size={17}/>Add your first form</button></div>}
    </section>

    {editorOpen && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Close form setup" onClick={closeEditor}/><div className="template-editor friendly-editor" role="dialog" aria-modal="true" aria-label="Set up a company form">
      <div className="template-editor-header friendly-editor-header"><div><span className="template-eyebrow">{editorMode === 'edit' ? 'CHANGE A FORM' : 'ADD A FORM'}</span><h2>{editorMode === 'edit' ? 'Make changes' : 'Set up your form'}</h2><p>Just follow the numbered steps. Northborn handles the technical parts.</p></div><button type="button" aria-label="Close" onClick={closeEditor}><X/></button></div>

      <div className="friendly-progress" aria-label="Setup progress">
        <div className="done"><span>1</span><strong>Form type</strong></div>
        <div className={draft.sourceKind === 'northborn_builder' || selectedFile || draft.filePath ? 'done' : ''}><span>2</span><strong>Add form</strong></div>
        <div className={draft.fields.length ? 'done' : ''}><span>3</span><strong>Check it</strong></div>
        <div><span>4</span><strong>Use it</strong></div>
      </div>

      <div className="template-editor-body friendly-editor-body">
        <div className="template-editor-config">
          <section className="template-editor-section friendly-step"><div className="friendly-step-title"><span>1</span><div><h3>What is this form?</h3><p>Pick the closest match. You do not need to know anything technical.</p></div></div><div className="template-form-grid">
            <label><span>Form type</span><select value={draft.documentType} onChange={event => changeDocumentType(event.target.value as TemplateDocumentType)}>{DOCUMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Name</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder={`Example: Company ${documentTypeLabel(draft.documentType)}`}/></label>
          </div></section>

          <section className="template-editor-section friendly-step"><div className="friendly-step-title"><span>2</span><div><h3>How do you want to add it?</h3><p>Most companies can simply upload the PDF they already use.</p></div></div><div className="template-source-choice friendly-source-choice">
            <button type="button" className={draft.sourceKind === 'fillable_pdf' ? 'active' : ''} onClick={() => changeSourceKind('fillable_pdf')}><Upload/><span><strong>I already have a PDF</strong><small>Choose the file. Northborn will inspect it automatically.</small></span></button>
            <button type="button" className={draft.sourceKind === 'northborn_builder' ? 'active' : ''} onClick={() => changeSourceKind('northborn_builder')}><FileCog/><span><strong>Build one for me</strong><small>Northborn starts with a ready made form you can use right away.</small></span></button>
          </div>
          {draft.sourceKind === 'fillable_pdf' && <div className="template-upload-area friendly-upload"><label className={pdfBusy ? 'busy' : ''}><input type="file" accept="application/pdf,.pdf" onChange={event => void choosePdf(event.target.files?.[0] || null)}/>{pdfBusy ? <Loader2 className="spin"/> : <Upload/>}<strong>{pdfBusy ? 'Northborn is checking your PDF…' : selectedFile ? 'Choose a different PDF' : draft.originalFileName ? 'Choose a different PDF' : 'Tap here to choose your PDF'}</strong><span>That is all you need to do. Maximum file size is 25 MB.</span></label>{(selectedFile || draft.originalFileName) && <div className="template-upload-result friendly-upload-result"><CheckCircle2/><div><strong>{selectedFile?.name || draft.originalFileName}</strong><span>{draft.pageCount ? `${draft.pageCount} page${draft.pageCount === 1 ? '' : 's'}` : 'PDF loaded'} · Northborn found {draft.fields.length} item{draft.fields.length === 1 ? '' : 's'}</span></div></div>}</div>}
          </section>

          <section className="template-editor-section friendly-step"><div className="friendly-step-title"><span>3</span><div><h3>Northborn checked your form</h3><p>Look at the preview. If it looks right, you can use it. You do not need to edit the items below.</p></div></div>
            {draft.sourceKind === 'fillable_pdf' && !selectedFile && !draft.filePath && <div className="friendly-check waiting"><Upload/><div><strong>Choose your PDF first</strong><span>Northborn will check it automatically after you upload it.</span></div></div>}
            {draft.sourceKind === 'fillable_pdf' && (selectedFile || draft.filePath) && draft.fields.length > 0 && <div className="friendly-check good"><CheckCircle2/><div><strong>Your form is ready to review</strong><span>Northborn recognized {draft.fields.length} item{draft.fields.length === 1 ? '' : 's'} and matched {mappedCount} automatically.{needsHelpCount > 0 ? ` ${needsHelpCount} can be entered by a person when the form is used.` : ' Everything it recognized is connected.'}</span></div></div>}
            {draft.sourceKind === 'fillable_pdf' && (selectedFile || draft.filePath) && draft.fields.length === 0 && <div className="friendly-check warning"><AlertTriangle/><div><strong>This PDF needs a little help</strong><span>Northborn could not find fillable boxes in it. Try a fillable copy of the PDF, or choose “Build one for me.”</span></div></div>}
            {draft.sourceKind === 'northborn_builder' && <div className="friendly-check good"><CheckCircle2/><div><strong>Northborn built the starting form</strong><span>It has {draft.fields.length} common items for a {documentTypeLabel(draft.documentType)}. You can use it now or change it later.</span></div></div>}

            <button type="button" className="friendly-advanced-toggle" onClick={() => setShowAdvanced(value => !value)}><Settings2 size={17}/>{showAdvanced ? 'Hide advanced settings' : 'Advanced settings'}<small>Only use this if you need to change what Northborn recognized.</small></button>

            {showAdvanced && <div className="friendly-advanced-panel">
              <div className="template-form-grid friendly-advanced-top">
                <label className="wide"><span>Notes about this form</span><textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Optional"/></label>
                <label><span>Choose this automatically</span><select value={draft.isDefault ? 'yes' : 'no'} onChange={event => setDraft(current => ({ ...current, isDefault: event.target.value === 'yes' }))}><option value="yes">Yes</option><option value="no">No</option></select></label>
              </div>
              <div className="template-fields-heading"><div><h3>Recognized items</h3><p>Change these only when Northborn guessed something incorrectly.</p></div><button type="button" onClick={addField}><Plus size={16}/>Add item</button></div>
              <div className="template-field-list">{draft.fields.map((field, index) => <div className="template-field-row friendly-field-row" key={field.id}>
                <label><span>What the user sees</span><input value={field.label} onChange={event => updateField(index, { label: event.target.value })}/></label>
                <label><span>Kind of answer</span><select value={field.type} onChange={event => updateField(index, { type: event.target.value as TemplateFieldType })}>{FIELD_TYPE_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label className="binding"><span>Fill automatically from</span><select value={field.binding} onChange={event => updateField(index, { binding: event.target.value })}>{NORTHBORN_BINDINGS.map(option => <option value={option.value} key={`${option.group}-${option.value}`}>{option.value ? `${option.group} · ${option.label}` : option.label}</option>)}</select></label>
                {draft.sourceKind === 'fillable_pdf' && <label><span>PDF box name</span><input value={field.pdf_field_name || ''} onChange={event => updateField(index, { pdf_field_name: event.target.value })}/></label>}
                <label className="required"><input type="checkbox" checked={field.required} onChange={event => updateField(index, { required: event.target.checked })}/><span>Must be filled out</span></label>
                <button type="button" className="template-remove-field" onClick={() => removeField(index)} aria-label={`Remove ${field.label}`}><Trash2 size={16}/></button>
              </div>)}</div>
            </div>}
          </section>
        </div>

        <aside className="template-editor-preview friendly-preview"><div className="template-preview-heading"><div><span className="template-eyebrow">CHECK YOUR FORM</span><strong>{draft.name || documentTypeLabel(draft.documentType)}</strong></div>{draft.sourceKind === 'fillable_pdf' && <span>{draft.pageCount ? `${draft.pageCount} pages` : 'PDF'}</span>}</div><TemplatePreview draft={draft} fileUrl={fileUrl}/></aside>
      </div>

      <div className="template-editor-footer friendly-footer"><div><strong>{draft.fields.length ? 'Ready for your review' : 'Complete the steps above'}</strong><span>{draft.sourceKind === 'fillable_pdf' ? 'Northborn checks the PDF automatically' : 'Northborn built the starting form'}</span></div><div><button type="button" className="secondary" disabled={busy} onClick={closeEditor}>Cancel</button><button type="button" className="secondary friendly-save-later" disabled={busy} onClick={() => void saveTemplate(false)}>{busy ? <Loader2 className="spin"/> : <Save size={17}/>}Save for later</button><button type="button" className="primary friendly-use-template" disabled={busy || pdfBusy || !draft.fields.length} onClick={() => void saveTemplate(true)}>{busy ? <Loader2 className="spin"/> : <BadgeCheck size={18}/>}Use this template</button></div></div>
    </div></div>}

    {previewRow && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Close preview" onClick={() => { setPreviewRow(null); if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl); setFileUrl('') }}/><div className="template-preview-modal"><div className="template-editor-header"><div><span className="template-eyebrow">FORM PREVIEW</span><h2>{previewRow.name}</h2></div><button type="button" onClick={() => { setPreviewRow(null); setFileUrl('') }}><X/></button></div><div className="template-preview-modal-body"><TemplatePreview draft={rowToDraft(previewRow)} fileUrl={fileUrl}/>{previewRow.source_kind === 'fillable_pdf' && !fileUrl && <div className="template-preview-file-note"><AlertTriangle/><p>{localMode ? 'This PDF is only saved on the device used to add it.' : 'Northborn could not open the stored PDF preview.'}</p></div>}</div></div></div>}

    {confirmDelete && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Cancel deletion" onClick={() => setConfirmDelete(null)}/><div className="template-confirm-dialog"><AlertTriangle/><h2>Delete {confirmDelete.name}?</h2><p>This removes the template from your company. Documents that were already completed will not be changed.</p><div><button type="button" className="secondary" onClick={() => setConfirmDelete(null)}>Keep it</button><button type="button" className="danger-button" disabled={busy} onClick={() => void removeTemplate(confirmDelete)}>{busy ? 'Deleting…' : 'Delete form'}</button></div></div></div>}
  </section>
}
