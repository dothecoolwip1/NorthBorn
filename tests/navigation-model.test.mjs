import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullNavigationForRole, mobileNavigationForRole } from '../src/navigation-model.ts'

const paths=items=>items.map(item=>item.path)
const labels=items=>items.map(item=>item.label)

test('owner and admin mobile navigation prioritizes the working day',()=>{
  for(const role of ['owner','admin']){
    const items=mobileNavigationForRole('manager',[role])
    assert.deepEqual(paths(items),['/','/calendar','/dispatch','/jobs'])
    assert.deepEqual(labels(items),['Home','Schedule','Dispatch','Jobs'])
  }
})

test('specialist manager roles receive useful permission-safe primary navigation',()=>{
  assert.deepEqual(paths(mobileNavigationForRole('manager',['accounting'])),['/','/customers','/invoices','/billing'])
  assert.deepEqual(paths(mobileNavigationForRole('manager',['mechanic'])),['/','/jobs','/fleet','/maintenance'])
  assert.deepEqual(paths(mobileNavigationForRole('manager',['safety'])),['/','/safety','/jobs','/fleet'])
  const accountingFull=paths(fullNavigationForRole('manager',['accounting']))
  assert.equal(accountingFull.includes('/dispatch'),false)
  assert.equal(accountingFull.includes('/invoices'),true)
})

test('operator and client mobile navigation stays focused',()=>{
  assert.deepEqual(labels(mobileNavigationForRole('operator')),['Today','Jobs','Time','Safety'])
  assert.deepEqual(paths(mobileNavigationForRole('operator')),['/','/jobs','/timesheets','/safety'])
  assert.deepEqual(labels(mobileNavigationForRole('client')),['Home','Jobs','Invoices'])
  assert.deepEqual(paths(mobileNavigationForRole('client')),['/','/#client-jobs','/#client-invoices'])
})
