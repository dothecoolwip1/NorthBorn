import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch2,
  X,
} from 'lucide-react'
import type {
  DocumentFieldKey,
  ExtractedDocumentField,
  ParsedLabDocument,
  ParsedLabLine,
} from './mallardDocumentEngine'

export type ReviewedDocumentField = ExtractedDocumentField & {
  apply: boolean
  original_value: string
}

export type ReviewedLabLine = ParsedLabLine & {
  apply: boolean
  original: ParsedLabLine
}

export type MallardDocumentReviewResult = {
  fields: ReviewedDocumentField[]
  rows: ReviewedLabLine[]
  corrected: boolean
}

type Props = {
  attachmentName: string
  document: ParsedLabDocument
  busy: boolean
  onCancel: () => void
  onApply: (result: MallardDocumentReviewResult) => void | Promise<void>
}

const APPLYABLE_FIELDS = new Set<DocumentFieldKey>([
  'sample_type',
  'collected_by',
  'collection_date',
  'collection_time',
  'location',
  'work_description',
  'field_observations',
  'suspected_contents',
  'lab_name',
  'lab_number',
  'received_date',
  'received_by',
])

const FIELD_NOTES: Partial<Record<DocumentFieldKey, string>> = {
  sample_id: 'Source reference only. Mallard will not change the permanent bottle ID.',
  category: 'Reference only. Mallard classification codes stay controlled by the sample record.',
  status: 'Reference only. Workflow status is changed using Mallard controls.',
  job: 'Captured with the source document but not mapped to a sample field yet.',
  container: 'Preserved in the source extraction for review and future use.',
  quantity: 'Preserved in the source extraction for review and future use.',
  field_label: 'Preserved in the source extraction for review and future use.',
  seal: 'Preserved in the source extraction for review and future use.',
  storage: 'Preserved in the source extraction for review and future use.',
  preservation: 'Preserved in the source extraction for review and future use.',
  accepted_date: 'Preserved in the source extraction for review and future use.',
  transfer_date_time: 'Preserved in the source extraction for review and future use.',
  released_by: 'Preserved in the source extraction for review and future use.',
  condition: 'Preserved in the source extraction for review and future use.',
  temperature: 'Preserved in the source extraction for review and future use.',
  client: 'Preserved in the source extraction for review and future use.',
  project: 'Preserved in the source extraction for review and future use.',
  reason_taken: 'Preserved in the source extraction for review and future use.',
}

function typeLabel(value: ParsedLabDocument['document_type']) {
  const labels: Record<ParsedLabDocument['document_type'], string> = {
    sample_submission: 'Sample submission',
    chain_of_custody: 'Chain of custody',
    lab_certificate: 'Certificate of analysis',
    lab_report: 'Laboratory report',
    disposal_document: 'Disposal document',
    unknown: 'Unknown document',
  }
  return labels[value]
}

function methodLabel(value: ParsedLabDocument['method']) {
  return value === 'pdf_layout' ? 'Native PDF layout' : 'OCR layout'
}

function confidenceClass(value: number) {
  if (value >= 0.9) return 'high'
  if (value >= 0.75) return 'medium'
  return 'low'
}

function Confidence({ value }: { value: number }) {
  return <span className={`review-confidence ${confidenceClass(value)}`}>{Math.round(value * 100)}%</span>
}

function fieldChanged(field: ReviewedDocumentField) {
  return field.value.trim() !== field.original_value.trim()
}

function rowChanged(row: ReviewedLabLine) {
  const keys: Array<keyof ParsedLabLine> = [
    'test_name',
    'result_value',
    'unit',
    'qualifier',
    'method',
    'reporting_limit',
    'detection_limit',
    'flag',
    'notes',
  ]
  return keys.some((key) => String(row[key] ?? '').trim() !== String(row.original[key] ?? '').trim())
}

export default function MallardDocumentReview({
  attachmentName,
  document,
  busy,
  onCancel,
  onApply,
}: Props) {
  const [fields, setFields] = React.useState<ReviewedDocumentField[]>(() =>
    document.fields.map((field) => ({
      ...field,
      apply: APPLYABLE_FIELDS.has(field.key) && field.confidence >= 0.72,
      original_value: field.value,
    })),
  )
  const [rows, setRows] = React.useState<ReviewedLabLine[]>(() =>
    document.rows.map((row) => ({
      ...row,
      apply: row.confidence >= 0.72,
      original: { ...row },
    })),
  )

  const selectedFieldCount = fields.filter((field) => field.apply).length
  const selectedRowCount = rows.filter((row) => row.apply).length
  const corrected = fields.some(fieldChanged) || rows.some(rowChanged)
  const lowConfidenceCount =
    fields.filter((field) => field.confidence < 0.75).length +
    rows.filter((row) => row.confidence < 0.75).length

  const updateField = (index: number, patch: Partial<ReviewedDocumentField>) => {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  }

  const updateRow = (index: number, patch: Partial<ReviewedLabLine>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }

  React.useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  return (
    <div className="mallard-document-review-backdrop" role="presentation">
      <section className="mallard-document-review" role="dialog" aria-modal="true" aria-labelledby="mallard-document-review-title">
        <header className="document-review-header">
          <div>
            <span className="eyebrow"><FileSearch2 size={15} /> Document review</span>
            <h2 id="mallard-document-review-title">{attachmentName}</h2>
            <p>Nothing below changes the sample until you approve it.</p>
          </div>
          <button className="secondary square" type="button" onClick={onCancel} disabled={busy} aria-label="Close document review">
            <X size={18} />
          </button>
        </header>

        <div className="document-review-body">
        <div className="document-review-summary">
          <div><span>Document</span><strong>{typeLabel(document.document_type)}</strong><Confidence value={document.document_confidence} /></div>
          <div><span>Reader</span><strong>{methodLabel(document.method)}</strong><small>Parser {document.parser_version}</small></div>
          <div><span>Found</span><strong>{document.fields.length} fields · {document.rows.length} results</strong><small>{document.page_count} page{document.page_count === 1 ? '' : 's'}</small></div>
        </div>

        {(document.review_required || lowConfidenceCount > 0 || document.diagnostics.length > 0) && (
          <div className="document-review-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>Human review required</strong>
              <p>
                {lowConfidenceCount > 0
                  ? `${lowConfidenceCount} item${lowConfidenceCount === 1 ? '' : 's'} need extra attention. `
                  : ''}
                Confirm the source before applying extracted information.
              </p>
              {document.diagnostics.length > 0 && <ul>{document.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul>}
            </div>
          </div>
        )}

        {document.requested_analyses.length > 0 && (
          <section className="document-review-section">
            <div className="document-review-section-heading">
              <div><span className="eyebrow">Requested analysis</span><h3>Tests requested on the source</h3></div>
            </div>
            <div className="document-analysis-chips">
              {document.requested_analyses.map((item) => (
                <span key={`${item.name}-${item.source_page}`}><CheckCircle2 size={14} />{item.name}</span>
              ))}
            </div>
          </section>
        )}

        <section className="document-review-section">
          <div className="document-review-section-heading">
            <div><span className="eyebrow">Fields</span><h3>Information Mallard found</h3></div>
            <span>{selectedFieldCount} selected</span>
          </div>

          {fields.length === 0 ? (
            <div className="empty small">No labelled fields were confidently identified.</div>
          ) : (
            <div className="document-field-review-list">
              {fields.map((field, index) => {
                const canApply = APPLYABLE_FIELDS.has(field.key)
                return (
                  <div className={`document-field-review ${field.confidence < 0.75 ? 'attention' : ''}`} key={`${field.key}-${index}`}>
                    <div className="document-review-select">
                      <input
                        type="checkbox"
                        checked={field.apply}
                        disabled={!canApply || busy}
                        onChange={(event) => updateField(index, { apply: event.target.checked })}
                        aria-label={canApply ? `Apply ${field.label}` : `${field.label} is reference only`}
                      />
                    </div>
                    <div className="document-field-review-main">
                      <div className="document-field-review-label">
                        <strong>{field.label}</strong>
                        <Confidence value={field.confidence} />
                        <small>Page {field.page} · read from “{field.evidence.raw_label}”</small>
                      </div>
                      <textarea
                        rows={field.value.length > 90 ? 3 : 1}
                        value={field.value}
                        disabled={!canApply || busy}
                        onChange={(event) => updateField(index, { value: event.target.value })}
                      />
                      {FIELD_NOTES[field.key] && <small className="document-field-note">{FIELD_NOTES[field.key]}</small>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="document-review-section">
          <div className="document-review-section-heading">
            <div><span className="eyebrow">Laboratory results</span><h3>Result rows</h3></div>
            <span>{selectedRowCount} selected</span>
          </div>

          {rows.length === 0 ? (
            <div className="empty small">No analytical result rows were found. This is normal for field or submission forms without completed lab results.</div>
          ) : (
            <div className="document-result-review-list">
              {rows.map((row, index) => (
                <div className={`document-result-review ${row.confidence < 0.75 ? 'attention' : ''}`} key={`${row.test_name}-${index}`}>
                  <div className="document-result-review-head">
                    <label>
                      <input type="checkbox" checked={row.apply} disabled={busy} onChange={(event) => updateRow(index, { apply: event.target.checked })} />
                      <span>Import result</span>
                    </label>
                    <Confidence value={row.confidence} />
                    {row.source_page && <small>Page {row.source_page}</small>}
                  </div>
                  <div className="document-result-grid main">
                    <label><span>Analyte / test</span><input value={row.test_name} disabled={busy} onChange={(event) => updateRow(index, { test_name: event.target.value })} /></label>
                    <label><span>Result</span><input value={row.result_value} disabled={busy} onChange={(event) => updateRow(index, { result_value: event.target.value })} /></label>
                    <label><span>Unit</span><input value={row.unit} disabled={busy} onChange={(event) => updateRow(index, { unit: event.target.value })} /></label>
                    <label><span>Qualifier</span><input value={row.qualifier} disabled={busy} onChange={(event) => updateRow(index, { qualifier: event.target.value })} /></label>
                  </div>
                  <div className="document-result-grid details">
                    <label><span>Method</span><input value={row.method} disabled={busy} onChange={(event) => updateRow(index, { method: event.target.value })} /></label>
                    <label><span>Reporting limit</span><input value={row.reporting_limit} disabled={busy} onChange={(event) => updateRow(index, { reporting_limit: event.target.value })} /></label>
                    <label><span>Detection limit</span><input value={row.detection_limit} disabled={busy} onChange={(event) => updateRow(index, { detection_limit: event.target.value })} /></label>
                    <label><span>Flag</span><input value={row.flag} disabled={busy} onChange={(event) => updateRow(index, { flag: event.target.value })} /></label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        </div>

        <footer className="document-review-actions">
          <div>
            <strong>{corrected ? 'Corrections detected' : 'Ready for review'}</strong>
            <span>{selectedFieldCount} fields and {selectedRowCount} results will be applied.</span>
          </div>
          <button className="secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() => void onApply({ fields, rows, corrected })}
          >
            <ClipboardCheck size={17} />
            {busy ? 'Applying…' : 'Approve & apply'}
          </button>
        </footer>
      </section>
    </div>
  )
}
