import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAccessInternalRoute, primaryInternalRole } from '../src/role-access.ts'
import { billingRole } from '../src/billing-role.ts'
test('combined roles preserve both operational and billing routes',()=>{
 assert.equal(canAccessInternalRoute(['supervisor','accounting'],'/invoices'),true)
 assert.equal(canAccessInternalRoute(['supervisor','accounting'],'/dispatch'),true)
 assert.equal(canAccessInternalRoute(['supervisor'],'/invoices'),false)
 assert.equal(canAccessInternalRoute(['unknown'],'/team-access'),false)
 assert.equal(primaryInternalRole(['operator','admin']),'admin')
 assert.equal(billingRole([{role:{key:'operator'}},{role:{key:'accounting'}}]),'accounting')
 assert.equal(billingRole([{role:{key:'supervisor'}}]),'')
})
