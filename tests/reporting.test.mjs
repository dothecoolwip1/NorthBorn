import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, financialSummary, inDateRange } from '../src/reporting.ts'
test('reports do not combine currencies or count draft/void invoices',()=>{
 const invoice={status:'issued',currency_code:'CAD',total:100,amount_paid:20,balance_due:80}
 assert.deepEqual(financialSummary([invoice,{...invoice,currency_code:'USD'},{...invoice,status:'void'}]),[{currency:'CAD',revenue:100,paid:20,credits:0,outstanding:80},{currency:'USD',revenue:100,paid:20,credits:0,outstanding:80}])
})
test('CSV quotes embedded delimiters and prevents formula execution',()=>{
 assert.equal(csvCell('a,"b"'),'"a,""b"""')
 assert.equal(csvCell(' =HYPERLINK("x")'),'"\' =HYPERLINK(""x"")"')
 assert.equal(inDateRange('2026-09-29T12:00:00Z','2026-09-29','2026-09-29'),true)
 assert.equal(inDateRange(null,'',''),false)
})
