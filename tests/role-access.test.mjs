import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAccessInternalRoute, primaryInternalRole, hasAnyRole } from '../src/role-access.ts'
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

test('operator capability survives an accounting membership without granting admin access',()=>{
 const roles=['accounting','operator'];
 assert.equal(canAccessInternalRoute(roles,'/fleet'),true)
 assert.equal(canAccessInternalRoute(roles,'/team-access'),false)
 assert.equal(hasAnyRole(roles,new Set(['operator','supervisor'])),true)
 assert.equal(hasAnyRole(roles,new Set(['owner','admin'])),false)
})
