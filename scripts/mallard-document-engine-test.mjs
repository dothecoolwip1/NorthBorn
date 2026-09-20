import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourcePath = path.resolve('src/mallardDocumentEngine.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
})

const tempPath = path.join(os.tmpdir(), `mallard-document-engine-${process.pid}.mjs`)
fs.writeFileSync(tempPath, transpiled.outputText, 'utf8')

const {
  interpretDocumentLayout,
  buildProfileLearningPayload,
} = await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`)

function token(page, text, x0, y0, width = Math.max(28, text.length * 5.6), height = 10) {
  return { page, text, x0, y0, x1: x0 + width, y1: y0 + height, confidence: null }
}

function submissionPage(valueOverrides = {}) {
  const values = {
    sampleId: '2002',
    sampleType: 'Soil',
    category: 'Oilfield / Oil & Gas',
    collector: 'Example Collector',
    date: 'September 17, 2026',
    time: '14:42',
    job: 'Oilfield maintenance cleanout',
    status: 'Awaiting lab receipt',
    location: 'Same lease beside produced water tank piping',
    work: 'Surface soil collected from visibly stained material after vac truck cleanout.',
    observations: 'Dark brown damp soil with localized staining and petroleum odour.',
    suspected: 'Petroleum hydrocarbons with possible produced water salts.',
    reason: 'Assess whether the stained soil is impacted.',
    container: 'Lab supplied soil jar',
    quantity: 'Approx. 250 g',
    ...valueOverrides,
  }

  const t = [
    token(1, 'MALLARD SAMPLE TRACKER', 20, 15, 180),
    token(1, 'Oil & Gas Environmental Sample Submission Record', 20, 30, 280),
    token(1, '1. SAMPLE IDENTIFICATION', 20, 55, 200),
    token(1, 'Sample ID', 30, 78, 70), token(1, values.sampleId, 125, 78, 55),
    token(1, 'Sample Type', 320, 78, 80), token(1, values.sampleType, 430, 78, 70),
    token(1, 'Category', 30, 96, 62), token(1, values.category, 125, 96, 150),
    token(1, 'Collected By', 320, 96, 86), token(1, values.collector, 430, 96, 110),
    token(1, 'Date', 30, 114, 42), token(1, values.date, 125, 114, 125),
    token(1, 'Time', 320, 114, 42), token(1, values.time, 430, 114, 65),
    token(1, 'Job', 30, 132, 34), token(1, values.job, 125, 132, 180),
    token(1, 'Status', 320, 132, 48), token(1, values.status, 430, 132, 130),

    token(1, '2. LOCATION & FIELD CONTEXT', 20, 160, 220),
    token(1, 'Location', 30, 183, 60), token(1, values.location, 125, 183, 300),
    token(1, 'Work Description', 30, 205, 95), token(1, values.work, 145, 205, 410),
    token(1, 'Field Observations', 30, 233, 105), token(1, values.observations, 145, 233, 420),

    token(1, '3. SUSPECTED CONTENTS & REASON FOR SAMPLE', 20, 270, 310),
    token(1, 'Suspected Contents', 30, 293, 110), token(1, values.suspected, 155, 293, 390),
    token(1, 'Reason Taken', 30, 319, 90), token(1, values.reason, 155, 319, 360),

    token(1, '4. CONTAINER & HANDLING', 20, 350, 205),
    token(1, 'Container', 30, 373, 66), token(1, values.container, 125, 373, 150),
    token(1, 'Quantity', 320, 373, 58), token(1, values.quantity, 430, 373, 95),

    token(1, '5. EXAMPLE ANALYTICAL REQUEST', 20, 410, 230),
    token(1, '[X] PHC F1 to F4 [X] BTEX [X] PAHs', 30, 432, 280),
    token(1, '[X] pH / EC [X] Chloride / salinity [X] Selected metals', 30, 450, 390),

    token(1, '7. LAB RECEIPT & RESULTS', 20, 485, 200),
    token(1, 'Parameter', 30, 510, 75),
    token(1, 'Result', 260, 510, 55),
    token(1, 'Units', 350, 510, 50),
    token(1, 'RL', 435, 510, 28),
    token(1, 'Flag', 515, 510, 40),
    token(1, 'Benzene', 30, 532, 70),
    token(1, '0.015', 260, 532, 45),
    token(1, 'mg/kg', 350, 532, 48),
    token(1, '0.005', 435, 532, 45),
    token(1, 'J', 515, 532, 18),
    token(1, 'Toluene', 30, 550, 70),
    token(1, '<0.020', 260, 550, 52),
    token(1, 'mg/kg', 350, 550, 48),
    token(1, '0.020', 435, 550, 45),
  ]

  return { page: 1, width: 612, height: 792, tokens: t }
}

try {
  const first = interpretDocumentLayout(
    [submissionPage()],
    'Mallard_Oilfield_Soil_Sample_2002.pdf',
    'pdf_layout',
    [],
  )

  const fields = new Map(first.fields.map((field) => [field.key, field.value]))
  assert.equal(first.document_type, 'sample_submission')
  assert.equal(fields.get('sample_id'), '2002')
  assert.equal(fields.get('sample_type'), 'Soil')
  assert.equal(fields.get('category'), 'Oilfield / Oil & Gas')
  assert.equal(fields.get('collected_by'), 'Example Collector')
  assert.equal(fields.get('collection_date'), 'September 17, 2026')
  assert.equal(fields.get('collection_time'), '14:42')
  assert.equal(fields.get('location'), 'Same lease beside produced water tank piping')
  assert.equal(fields.get('work_description'), 'Surface soil collected from visibly stained material after vac truck cleanout.')
  assert.equal(fields.get('field_observations'), 'Dark brown damp soil with localized staining and petroleum odour.')
  assert.equal(fields.get('suspected_contents'), 'Petroleum hydrocarbons with possible produced water salts.')
  assert.equal(fields.get('container'), 'Lab supplied soil jar')
  assert.equal(fields.get('quantity'), 'Approx. 250 g')

  assert.equal(first.requested_analyses.length, 6)
  assert.deepEqual(
    first.requested_analyses.map((row) => row.name),
    ['PHC F1 to F4', 'BTEX', 'PAHs', 'pH / EC', 'Chloride / salinity', 'Selected metals'],
  )

  assert.equal(first.rows.length, 2)
  assert.equal(first.rows[0].test_name, 'Benzene')
  assert.equal(first.rows[0].result_value, '0.015')
  assert.equal(first.rows[0].unit, 'mg/kg')
  assert.equal(first.rows[0].reporting_limit, '0.005')
  assert.equal(first.rows[0].flag, 'J')
  assert.equal(first.rows[1].test_name, 'Toluene')
  assert.equal(first.rows[1].qualifier, '<')
  assert.equal(first.rows[1].result_value, '0.020')

  const blankResultsPage = submissionPage()
  blankResultsPage.tokens = blankResultsPage.tokens.filter((item) => item.y0 < 530)
  const blankResults = interpretDocumentLayout(
    [blankResultsPage],
    'Mallard_Oilfield_Soil_Sample_2002_blank-results.pdf',
    'pdf_layout',
    [],
  )
  assert.equal(
    blankResults.rows.length,
    0,
    'Blank lab result tables must not turn sample IDs, dates, times, quantities, or requested analyses into test results.',
  )

  const changed = interpretDocumentLayout(
    [submissionPage({
      sampleId: '9999',
      collector: 'Different Collector',
      location: 'Different site location',
      suspected: 'Different suspected material',
    })],
    'different-values.pdf',
    'pdf_layout',
    [],
  )
  assert.equal(first.fingerprint, changed.fingerprint, 'Fingerprint should be based on layout and labels, not document values.')

  const learning = buildProfileLearningPayload(first)
  assert.equal(learning.fingerprint, first.fingerprint)
  assert.ok(learning.field_positions.sample_type)
  assert.ok(learning.field_aliases.sample_id.includes('Sample ID'))

  const profileRead = interpretDocumentLayout(
    [submissionPage({ sampleType: 'Water', collector: 'Profile Collector' })],
    'known-layout.pdf',
    'pdf_layout',
    [learning],
  )
  const profileFields = new Map(profileRead.fields.map((field) => [field.key, field.value]))
  assert.equal(profileFields.get('sample_type'), 'Water')
  assert.equal(profileFields.get('collected_by'), 'Profile Collector')
  assert.ok(profileRead.diagnostics.includes('Known document layout profile matched.'))

  console.log(`Mallard document engine tests passed: ${first.fields.length} fields, ${first.requested_analyses.length} requested analyses, ${first.rows.length} lab rows.`)
} finally {
  try { fs.unlinkSync(tempPath) } catch {}
}
