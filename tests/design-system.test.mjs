import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css=fs.readFileSync(new URL('../src/design-system.css',import.meta.url),'utf8')
const qa=fs.readFileSync(new URL('../src/qa-final-polish.css',import.meta.url),'utf8')
const menu=fs.readFileSync(new URL('../src/menu-shell-overrides.css',import.meta.url),'utf8')

test('design system defines mobile readability and touch tokens',()=>{
  assert.match(css,/--nb-font-xs:12px/)
  assert.match(css,/--nb-font-sm:14px/)
  assert.match(css,/--nb-font-md:16px/)
  assert.match(css,/--nb-touch:48px/)
  assert.match(css,/--nb-primary-touch:52px/)
  assert.match(css,/--nb-radius-sm:8px/)
  assert.match(css,/--nb-radius-md:12px/)
  assert.match(css,/--nb-radius-lg:16px/)
})

test('production polish no longer enforces 10px metadata',()=>{
  assert.doesNotMatch(qa,/font-size:\s*10px\s*!important/)
  assert.doesNotMatch(menu,/font-size:\s*10px\s*!important/)
})

test('legacy mobile touch baselines are at least 48px',()=>{
  assert.doesNotMatch(menu,/min-height:\s*(?:32|40|42|44)px/)
})
