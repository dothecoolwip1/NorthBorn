import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync(new URL('../src/navigation-model.ts',import.meta.url),'utf8')

test('owner and admin mobile navigation prioritizes the working day',()=>{
  assert.match(source,/owner:\['\/','\/calendar','\/dispatch','\/jobs'\]/)
  assert.match(source,/admin:\['\/','\/calendar','\/dispatch','\/jobs'\]/)
})

test('specialist manager roles receive permission-safe primary navigation',()=>{
  assert.match(source,/accounting:\['\/','\/customers','\/invoices','\/billing'\]/)
  assert.match(source,/mechanic:\['\/','\/jobs','\/fleet','\/maintenance'\]/)
  assert.match(source,/safety:\['\/','\/safety','\/jobs','\/fleet'\]/)
  assert.match(source,/fullNavigationForRole\('manager',roleKeys\)/)
})

test('operator and client mobile navigation stays focused',()=>{
  assert.match(source,/label:'Today',path:'\/'/)
  assert.match(source,/label:'Time',path:'\/timesheets'/)
  assert.match(source,/label:'Safety',path:'\/safety'/)
  assert.match(source,/label:'Home',path:'\/'/)
  assert.match(source,/label:'Invoices',path:'\/#client-invoices'/)
})
