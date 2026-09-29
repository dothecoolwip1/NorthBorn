import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceTotals, invoiceLineCategory, nonNegativeAmount } from '../src/billing-math.ts'
test('explicit pricing categories survive invoice creation', () => {
  assert.equal(invoiceLineCategory('Gravel', 'material'), 'material')
  assert.equal(invoiceLineCategory('Disposal'), 'disposal')
  assert.equal(invoiceLineCategory('Swamper'), 'labour')
})
test('rounds each line before adding tax', () => {
  assert.deepEqual(invoiceTotals([{description:'A',quantity:1,rate:.105},{description:'B',quantity:1,rate:.105}],5),{subtotal:.22,tax:.01,total:.23})
  assert.deepEqual(invoiceTotals([{description:'Labour',quantity:1.25,rate:120}],5),{subtotal:150,tax:7.5,total:157.5})
})
test('ignores blank editor rows and rejects invalid financial input', () => {
  assert.equal(invoiceTotals([{description:'',quantity:10,rate:999}],5).total,0)
  for (const amount of [-1,Infinity,NaN,'abc']) assert.throws(()=>nonNegativeAmount(amount))
  assert.throws(()=>invoiceTotals([],101))
})
test('normalizes quantities and rates before extending lines',()=>{
 assert.deepEqual(invoiceTotals([{description:'Fractional',quantity:'1.2345',rate:'1.005'}],5),{subtotal:1.25,tax:.06,total:1.31})
})
