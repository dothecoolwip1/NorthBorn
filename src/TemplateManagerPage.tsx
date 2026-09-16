import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
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
  Sparkles,
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
  type PdfAnalysis,
  type TemplateDocumentType,
  type TemplateField,
  type TemplateFieldType,
  type TemplateRow,
  type TemplateSourceKind,
  type TemplateStatus,
} from './template-manager-data'
import './template-manager.css'

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
  isDefault: false,
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
  testAccount: boolean
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

function sourceLabel(value: TemplateSourceKind) {
  return value === 'fillable_pdf' ? 'Uploaded PDF' : 'Northborn builder'
}

function statusLabel(value: TemplateStatus) {
  if (value === 'active') return 'Active'
  if (value === 'archived') return 'Archived'
  return 'Draft'
}

function FieldPreview({ field }: { field: TemplateField }) {
  if (field.type === 'table') {
    return <div className="template-preview-table"><div/><div/><div/><div/><div/><div/></div>
  }
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
    {!draft.fields.length && <div className="template-paper-empty">Add fields to build this document.</div>}
  </div>
}

export default function TemplateManagerPage() {
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
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, fields: presetFields('invoice') })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null)
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
      const roleKey = roleResult.data?.role?.key || ''
      const organization = membership.data.organization as { name?: string } | null
      setContext({
        organizationId: membership.data.organization_id,
        organizationName: organization?.name || 'Northborn company',
        roleKey,
        userId: next.user.id,
        testAccount: Boolean(next.user.app_metadata?.northborn_test),
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
    if (ctx.testAccount) {
      setLocalMode(true)
      setRows(readLocal(ctx.organizationId))
      setLoading(false)
      return
    }
    const result = await db.from('document_templates').select('*').eq('organization_id', ctx.organizationId).order('updated_at', { ascending: false })
    if (result.error) {
      const unavailable = /document_templates|schema cache|relation .* does not exist/i.test(result.error.message)
      if (unavailable) {
        setLocalMode(true)
        setRows(readLocal(ctx.organizationId))
        setError('The template database migration is not active in this workspace yet. Northborn is using local preview storage on this device so you can still test the manager.')
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

  const showSuccess = (message: string) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(''), 3500)
  }

  const resetEditorFile = () => {
    if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
    setSelectedFile(null)
    setPdfAnalysis(null)
    setFileUrl('')
  }

  const openNew = (documentType: TemplateDocumentType = 'invoice', sourceKind: TemplateSourceKind = 'northborn_builder') => {
    resetEditorFile()
    setEditorMode('new')
    setDraft({ ...EMPTY_DRAFT, id: newId(), documentType, sourceKind, fields: sourceKind === 'northborn_builder' ? presetFields(documentType) : [], version: 1 })
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
    setDraft(rowToDraft(row))
    setEditorOpen(true)
    setError('')
  }

  const duplicateTemplate = (row: TemplateRow) => {
    resetEditorFile()
    setEditorMode('duplicate')
    setDraft(rowToDraft(row, true))
    setEditorOpen(true)
    setError('')
  }

  const closeEditor = () => {
    if (busy) return
    resetEditorFile()
    setEditorOpen(false)
  }

  const changeDocumentType = (value: TemplateDocumentType) => {
    setDraft(current => ({
      ...current,
      documentType: value,
      fields: current.sourceKind === 'northborn_builder' && (editorMode === 'new' || !current.fields.length) ? presetFields(value) : current.fields,
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
      setError('Template uploads must be PDF files.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('PDF templates must be 25 MB or smaller.')
      return
    }
    setPdfBusy(true)
    setError('')
    try {
      const analysis = await analyzePdfFile(file, draft.documentType)
      if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl)
      const nextUrl = URL.createObjectURL(file)
      setSelectedFile(file)
      setFileUrl(nextUrl)
      setPdfAnalysis(analysis)
      setDraft(current => ({
        ...current,
        originalFileName: file.name,
        pageCount: analysis.pageCount,
        fields: fieldsFromPdfAnalysis(analysis, current.documentType),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Northborn could not inspect that PDF.')
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

  const moveField = (index: number, direction: -1 | 1) => setDraft(current => {
    const target = index + direction
    if (target < 0 || target >= current.fields.length) return current
    const fields = [...current.fields]
    const [item] = fields.splice(index, 1)
    fields.splice(target, 0, item)
    return { ...current, fields }
  })

  const uploadPdf = async (templateId: string, version: number) => {
    if (!selectedFile || !context) return draft.filePath
    if (localMode) return `local-preview/${templateId}/v${version}/${safeFileName(selectedFile.name)}`
    const path = `${context.organizationId}/${templateId}/v${version}/${Date.now()}-${safeFileName(selectedFile.name)}`
    const result = await supabase.storage.from('document-templates').upload(path, selectedFile, { contentType: 'application/pdf', upsert: false })
    if (result.error) throw result.error
    return result.data.path
  }

  const clearOtherDefault = async (documentType: TemplateDocumentType, exceptId: string) => {
    if (!context) return
    if (localMode) {
      const next = rows.map(row => row.document_type === documentType && row.id !== exceptId ? { ...row, is_default: false } : row)
      setRows(next)
      writeLocal(context.organizationId, next)
      return
    }
    const result = await db.from('document_templates')
      .update({ is_default: false, updated_by: context.userId })
      .eq('organization_id', context.organizationId)
      .eq('document_type', documentType)
      .neq('id', exceptId)
      .eq('is_default', true)
    if (result.error) throw result.error
  }

  const saveDraft = async (publish: boolean) => {
    if (!context) return
    const name = draft.name.trim()
    if (name.length < 2) return setError('Give the template a name before saving it.')
    if (draft.sourceKind === 'fillable_pdf' && !selectedFile && !draft.filePath) return setError('Choose a PDF before saving this uploaded template.')
    if (!draft.fields.length) return setError('Add at least one field before saving the template.')
    const duplicatedKeys = draft.fields.map(field => field.key.trim()).filter((key, index, all) => key && all.indexOf(key) !== index)
    if (duplicatedKeys.length) return setError(`Field keys must be unique. Duplicate: ${duplicatedKeys[0]}`)

    setBusy(true)
    setError('')
    let uploadedPath = ''
    try {
      const isNew = editorMode !== 'edit'
      const nextVersion = isNew ? 1 : draft.version + 1
      uploadedPath = await uploadPdf(draft.id, nextVersion)
      const now = new Date().toISOString()
      const status: TemplateStatus = publish ? 'active' : draft.status === 'archived' ? 'draft' : draft.status
      const isDefault = publish ? draft.isDefault : false
      if (isDefault) await clearOtherDefault(draft.documentType, draft.id)

      const payload = {
        id: draft.id,
        organization_id: context.organizationId,
        name,
        document_type: draft.documentType,
        source_kind: draft.sourceKind,
        description: draft.description.trim() || null,
        status,
        is_default: isDefault,
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
      } satisfies TemplateRow

      if (localMode) {
        const next = [payload as TemplateRow, ...rows.filter(row => row.id !== draft.id)].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        setRows(next)
        writeLocal(context.organizationId, next)
      } else {
        const templateResult = isNew
          ? await db.from('document_templates').insert(payload)
          : await db.from('document_templates').update({ ...payload, id: undefined, organization_id: undefined, created_by: undefined, created_at: undefined }).eq('id', draft.id).eq('organization_id', context.organizationId)
        if (templateResult.error) throw templateResult.error
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

      closeEditor()
      showSuccess(publish ? 'Template published and ready to use.' : 'Template saved.')
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
        const next = rows.map(item => item.id === row.id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item)
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

  if (loading && !context) return <div className="center-screen">Loading Template Manager…</div>
  if (!session) return <div className="center-screen"><div className="template-access-card"><FileCog size={36}/><h1>Sign in required</h1><p>Sign in to manage Northborn document templates.</p><button onClick={() => navigate('/')}>Back to Northborn</button></div></div>
  if (context && !MANAGER_ROLES.has(context.roleKey)) return <div className="center-screen"><div className="template-access-card"><FileCog size={36}/><h1>Template Manager</h1><p>Only company owners and administrators can change document templates.</p><button onClick={() => navigate('/')}>Back to dashboard</button></div></div>
  if (!context) return <div className="center-screen"><div className="template-access-card"><AlertTriangle size={36}/><h1>Template Manager unavailable</h1><p>{error || 'Northborn could not resolve your company workspace.'}</p><button onClick={() => navigate('/')}>Back to Northborn</button></div></div>

  return <section className="template-page">
    <div className="template-hero">
      <div><span className="template-eyebrow">DOCUMENT ENGINE</span><h1>Template Manager</h1><p>Create Northborn forms or bring your own PDF. Map fields once, then reuse the template across jobs, safety, fleet and billing.</p></div>
      <div className="template-hero-actions"><button className="secondary" type="button" onClick={() => void loadTemplates()}><RefreshCw size={17}/>Refresh</button><button className="primary" type="button" onClick={() => openNew()}><FilePlus2 size={18}/>New template</button></div>
    </div>

    {localMode && <div className="template-mode-banner"><Sparkles size={18}/><div><strong>Local preview mode</strong><span>Template records are being saved on this device because the document template database is not available to this workspace yet. Uploaded PDF file contents are not permanently stored in local preview mode.</span></div></div>}
    {error && <div className="template-message error"><AlertTriangle size={18}/><span>{error}</span><button type="button" onClick={() => setError('')}><X size={16}/></button></div>}
    {success && <div className="template-message success"><CheckCircle2 size={18}/><span>{success}</span></div>}

    <div className="template-stat-grid">
      <div className="template-stat"><FileText/><span>Templates</span><strong>{stats.total}</strong><small>all document types</small></div>
      <div className="template-stat"><BadgeCheck/><span>Active</span><strong>{stats.active}</strong><small>ready for workflows</small></div>
      <div className="template-stat"><Upload/><span>PDF templates</span><strong>{stats.pdf}</strong><small>uploaded company forms</small></div>
      <div className="template-stat"><Star/><span>Defaults</span><strong>{stats.defaults}</strong><small>automatic selections</small></div>
    </div>

    <section className="template-panel template-start-panel">
      <div className="template-section-heading"><div><span className="template-eyebrow">START FAST</span><h2>Common templates</h2></div></div>
      <div className="template-starter-grid">
        {(['invoice', 'flha', 'pre_trip', 'field_ticket'] as TemplateDocumentType[]).map(type => <button type="button" key={type} onClick={() => openNew(type)}><FileCheck2/><span><strong>{documentTypeLabel(type)}</strong><small>{DOCUMENT_TYPE_OPTIONS.find(option => option.value === type)?.description}</small></span><Plus/></button>)}
      </div>
    </section>

    <section className="template-panel">
      <div className="template-library-heading"><div><span className="template-eyebrow">LIBRARY</span><h2>Your templates</h2></div><button className="primary compact" type="button" onClick={() => openNew()}><Plus size={17}/>Add</button></div>
      <div className="template-toolbar">
        <label className="template-search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates or file names…"/></label>
        <label><Filter size={16}/><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All types</option>{DOCUMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><Filter size={16}/><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
      </div>

      {loading ? <div className="template-loading"><Loader2 className="spin"/>Loading templates…</div> : filteredRows.length ? <div className="template-card-grid">{filteredRows.map(row => <article className={`template-card status-${row.status}`} key={row.id}>
        <div className="template-card-top"><div className="template-card-icon">{row.source_kind === 'fillable_pdf' ? <FileText/> : <FileCog/>}</div><div className="template-card-badges"><span className={`template-status ${row.status}`}>{statusLabel(row.status)}</span>{row.is_default && <span className="template-default"><Star size={12}/>Default</span>}</div></div>
        <div className="template-card-title"><strong>{row.name}</strong><span>{documentTypeLabel(row.document_type)} · {sourceLabel(row.source_kind)}</span></div>
        {row.description && <p>{row.description}</p>}
        <div className="template-card-meta"><span><b>v{row.version}</b> version</span><span><b>{row.fields?.length || 0}</b> fields</span><span><b>{formatDate(row.updated_at)}</b> updated</span></div>
        {row.original_file_name && <div className="template-file-name"><FileText size={15}/>{row.original_file_name}</div>}
        <div className="template-card-actions"><button type="button" onClick={() => void previewTemplate(row)}><Eye size={16}/>Preview</button><button type="button" onClick={() => openEdit(row)}><Pencil size={16}/>Edit</button><button type="button" onClick={() => duplicateTemplate(row)}><Copy size={16}/>Copy</button></div>
        <div className="template-card-menu">
          {row.status !== 'active' && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { status: 'active', published_at: new Date().toISOString() }, 'Template activated.')}><BadgeCheck size={15}/>Activate</button>}
          {row.status === 'active' && !row.is_default && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { is_default: true }, `${row.name} is now the default ${documentTypeLabel(row.document_type)} template.`)}><Star size={15}/>Make default</button>}
          {row.status !== 'archived' && <button type="button" disabled={busy} onClick={() => void updateRowState(row, { status: 'archived', is_default: false }, 'Template archived.')}><Archive size={15}/>Archive</button>}
          <button type="button" className="danger" disabled={busy} onClick={() => setConfirmDelete(row)}><Trash2 size={15}/>Delete</button>
        </div>
      </article>)}</div> : <div className="template-empty"><FileCog/><h3>No templates match this view</h3><p>Create the first template or clear your filters.</p><button className="primary" type="button" onClick={() => openNew()}><Plus size={17}/>Create template</button></div>}
    </section>

    {editorOpen && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Close template editor" onClick={closeEditor}/><div className="template-editor" role="dialog" aria-modal="true" aria-label="Template editor">
      <div className="template-editor-header"><div><span className="template-eyebrow">{editorMode === 'edit' ? `VERSION ${draft.version + 1}` : editorMode === 'duplicate' ? 'NEW COPY' : 'NEW TEMPLATE'}</span><h2>{editorMode === 'edit' ? 'Edit template' : 'Build a template'}</h2></div><button type="button" aria-label="Close" onClick={closeEditor}><X/></button></div>
      <div className="template-editor-body">
        <div className="template-editor-config">
          <section className="template-editor-section"><h3>1. Template details</h3><div className="template-form-grid">
            <label className="wide"><span>Name</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Example: Tuff standard invoice"/></label>
            <label><span>Document type</span><select value={draft.documentType} onChange={event => changeDocumentType(event.target.value as TemplateDocumentType)}>{DOCUMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Default template</span><select value={draft.isDefault ? 'yes' : 'no'} onChange={event => setDraft(current => ({ ...current, isDefault: event.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes, use automatically</option></select></label>
            <label className="wide"><span>Description</span><textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="What this template is used for…"/></label>
          </div></section>

          <section className="template-editor-section"><h3>2. Choose the template source</h3><div className="template-source-choice">
            <button type="button" className={draft.sourceKind === 'northborn_builder' ? 'active' : ''} onClick={() => changeSourceKind('northborn_builder')}><FileCog/><span><strong>Build in Northborn</strong><small>Start with smart fields for this document type and customize them.</small></span></button>
            <button type="button" className={draft.sourceKind === 'fillable_pdf' ? 'active' : ''} onClick={() => changeSourceKind('fillable_pdf')}><Upload/><span><strong>Upload company PDF</strong><small>Keep your existing form and map its fields to Northborn data.</small></span></button>
          </div>
          {draft.sourceKind === 'fillable_pdf' && <div className="template-upload-area"><label className={pdfBusy ? 'busy' : ''}><input type="file" accept="application/pdf,.pdf" onChange={event => void choosePdf(event.target.files?.[0] || null)}/>{pdfBusy ? <Loader2 className="spin"/> : <Upload/>}<strong>{pdfBusy ? 'Inspecting PDF…' : selectedFile ? 'Replace PDF' : draft.originalFileName ? 'Replace existing PDF' : 'Choose PDF'}</strong><span>PDF only · maximum 25 MB</span></label>{(selectedFile || draft.originalFileName) && <div className="template-upload-result"><FileText/><div><strong>{selectedFile?.name || draft.originalFileName}</strong><span>{draft.pageCount ? `${draft.pageCount} page${draft.pageCount === 1 ? '' : 's'}` : 'Page count unavailable'} · {draft.fields.length} mapped fields</span></div></div>}{pdfAnalysis && <div className={`template-analysis-note ${pdfAnalysis.detected.length ? 'good' : 'warning'}`}><Sparkles size={17}/><span>{pdfAnalysis.note}</span></div>}</div>}
          </section>

          <section className="template-editor-section"><div className="template-fields-heading"><div><h3>3. Map document fields</h3><p>Every field can be filled manually or connected to data Northborn already knows.</p></div><button type="button" onClick={addField}><Plus size={16}/>Field</button></div>
            <div className="template-field-list">{draft.fields.map((field, index) => <div className="template-field-row" key={field.id}>
              <div className="template-field-order"><button type="button" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label="Move field up"><ArrowUp size={15}/></button><button type="button" disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)} aria-label="Move field down"><ArrowDown size={15}/></button></div>
              <label><span>Label</span><input value={field.label} onChange={event => updateField(index, { label: event.target.value })}/></label>
              <label><span>Field type</span><select value={field.type} onChange={event => updateField(index, { type: event.target.value as TemplateFieldType })}>{FIELD_TYPE_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
              <label className="binding"><span>Northborn data</span><select value={field.binding} onChange={event => updateField(index, { binding: event.target.value })}>{NORTHBORN_BINDINGS.map(option => <option value={option.value} key={`${option.group}-${option.value}`}>{option.group} · {option.label}</option>)}</select></label>
              {draft.sourceKind === 'fillable_pdf' && <label><span>PDF field name</span><input value={field.pdf_field_name || ''} onChange={event => updateField(index, { pdf_field_name: event.target.value })} placeholder="Exact PDF field name"/></label>}
              <label className="required"><input type="checkbox" checked={field.required} onChange={event => updateField(index, { required: event.target.checked })}/><span>Required</span></label>
              <button type="button" className="template-remove-field" onClick={() => removeField(index)} aria-label={`Remove ${field.label}`}><Trash2 size={16}/></button>
            </div>)}</div>
            {!draft.fields.length && <div className="template-field-empty"><FilePlus2/><span>No fields yet. Add one or choose a Northborn preset.</span></div>}
          </section>
        </div>

        <aside className="template-editor-preview"><div className="template-preview-heading"><div><span className="template-eyebrow">LIVE PREVIEW</span><strong>{draft.name || documentTypeLabel(draft.documentType)}</strong></div>{draft.sourceKind === 'fillable_pdf' && <span>{draft.pageCount ? `${draft.pageCount} pages` : 'PDF'}</span>}</div><TemplatePreview draft={draft} fileUrl={fileUrl}/></aside>
      </div>
      <div className="template-editor-footer"><div><strong>{draft.fields.length} fields</strong><span>{draft.sourceKind === 'fillable_pdf' ? 'PDF mapping' : 'Northborn form'}</span></div><div><button type="button" className="secondary" disabled={busy} onClick={closeEditor}>Cancel</button><button type="button" className="secondary" disabled={busy} onClick={() => void saveDraft(false)}>{busy ? <Loader2 className="spin"/> : <Save size={17}/>}Save draft</button><button type="button" className="primary" disabled={busy} onClick={() => void saveDraft(true)}>{busy ? <Loader2 className="spin"/> : <BadgeCheck size={17}/>}Publish</button></div></div>
    </div></div>}

    {previewRow && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Close preview" onClick={() => { setPreviewRow(null); if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl); setFileUrl('') }}/><div className="template-preview-modal"><div className="template-editor-header"><div><span className="template-eyebrow">PREVIEW · VERSION {previewRow.version}</span><h2>{previewRow.name}</h2></div><button type="button" onClick={() => { setPreviewRow(null); setFileUrl('') }}><X/></button></div><div className="template-preview-modal-body"><TemplatePreview draft={rowToDraft(previewRow)} fileUrl={fileUrl}/>{previewRow.source_kind === 'fillable_pdf' && !fileUrl && <div className="template-preview-file-note"><AlertTriangle/><p>{localMode ? 'The PDF binary is not stored in local preview mode. Open Edit and choose the PDF again to preview it.' : 'Northborn could not open the stored PDF preview.'}</p></div>}</div></div></div>}

    {confirmDelete && <div className="template-modal-layer"><button className="template-modal-scrim" aria-label="Cancel deletion" onClick={() => setConfirmDelete(null)}/><div className="template-confirm-dialog"><AlertTriangle/><h2>Delete {confirmDelete.name}?</h2><p>This removes the template from the company library. Existing completed documents are not changed.</p><div><button type="button" className="secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button type="button" className="danger-button" disabled={busy} onClick={() => void removeTemplate(confirmDelete)}>{busy ? 'Deleting…' : 'Delete template'}</button></div></div></div>}
  </section>
}
