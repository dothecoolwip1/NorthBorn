import { spawnSync } from 'node:child_process'

const npx=process.platform==='win32'?'npx.cmd':'npx'
const file='tests/e2e/production-smoke.spec.mjs'
const common=['playwright','test',file,'--workers=1','--reporter=line','--timeout=120000']
const groups=[
  {name:'core-workspaces',grep:'guest and login routes are healthy|manager routes and core actions are healthy|operator routes, role isolation, and job access are healthy|client routes and role isolation are healthy'},
  {name:'pack2-operations',grep:'Pack 2 job flows from manager creation through field completion|Pack 2 calendar and dashboard controls are healthy'},
  {name:'pack3-customers',grep:'Pack 3 customers and client portal are healthy'},
  {name:'role-access',grep:'all internal manager roles receive the correct navigation contract|internal roles reject hidden direct routes and keep allowed routes available|role-restricted routes fail closed instead of leaking another workspace|functional test role switcher can change personas'},
  {name:'navigation-notifications',grep:'hamburger navigation, history, deep-link reload, and sign-out work for every persona|known notifications open their intended module|desktop sidebar pages do not duplicate navigation in the top-right'},
  {name:'mobile',grep:'manager mobile routes avoid overflow and tiny controls|operator mobile routes avoid overflow and dead ends|client mobile routes avoid overflow and dead ends'},
]

let failed=false
for(const group of groups){
  console.log(`\n=== Northborn QA group: ${group.name} ===\n`)
  const result=spawnSync(npx,[...common,'--grep',group.grep],{
    stdio:'inherit',
    env:process.env,
    timeout:10*60*1000,
  })
  if(result.error){
    failed=true
    console.error(`QA group ${group.name} could not complete: ${result.error.message}`)
    continue
  }
  if(result.status!==0){
    failed=true
    console.error(`QA group ${group.name} failed with exit code ${result.status ?? 'unknown'}.`)
  }
}

if(failed){
  console.error('\nOne or more Northborn browser QA groups failed.')
  process.exit(1)
}
console.log('\nAll Northborn browser QA groups passed.')
