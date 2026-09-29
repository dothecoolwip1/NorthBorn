import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const menu=fs.readFileSync(new URL('../src/GlobalAccountMenu.tsx',import.meta.url),'utf8')
const shell=fs.readFileSync(new URL('../src/mobile-app-shell.css',import.meta.url),'utf8')
const model=fs.readFileSync(new URL('../src/navigation-model.ts',import.meta.url),'utf8')
const overrides=fs.readFileSync(new URL('../src/menu-shell-overrides.css',import.meta.url),'utf8')

test('phone shell has persistent role-specific primary navigation',()=>{
  assert.match(menu,/mobileNavigationForRole/)
  assert.match(model,/label:'Today',path:'\/'/)
  assert.match(model,/label:'Time',path:'\/timesheets'/)
  assert.match(model,/label:'Invoices',path:'\/#client-invoices'/)
  assert.match(model,/owner:\['\/','\/calendar','\/dispatch','\/jobs'\]/)
  assert.match(menu,/aria-label="Primary navigation"/)
  assert.match(menu,/aria-label="More navigation"/)
})

test('mobile navigation is fixed to the safe-area bottom and reserves content space',()=>{
  assert.match(shell,/position:fixed/)
  assert.match(shell,/bottom:0/)
  assert.match(shell,/env\(safe-area-inset-bottom\)/)
  assert.match(shell,/padding-bottom:calc\(var\(--nb-mobile-nav-height\)/)
})

test('more opens a mobile sheet and old hamburger is no longer primary mobile navigation',()=>{
  assert.match(shell,/\.northborn-account-popover\{/)
  assert.match(shell,/bottom:calc\(var\(--nb-mobile-nav-height\)/)
  assert.match(shell,/\.northborn-navigation-links button\[data-mobile-primary="true"\]\{display:none\}/)
  assert.doesNotMatch(overrides,/fixed hamburger is the mobile navigation control/i)
})

test('full-screen editors temporarily hide primary navigation',()=>{
  assert.match(shell,/body:has\(\[class\*="-backdrop"\]\) \.northborn-mobile-tabs/)
  assert.match(shell,/pointer-events:none/)
})
