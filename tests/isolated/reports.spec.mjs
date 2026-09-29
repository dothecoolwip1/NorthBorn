import { test, expect } from '@playwright/test'
const org='10000000-0000-0000-0000-000000000001',user='30000000-0000-0000-0000-000000000001'
const customer='20000000-0000-0000-0000-000000000001'
async function fixture(page,roles=['owner'],failure=false){
 const requested=[]
 await page.context().route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname==='127.0.0.1')return route.continue()
  if(!url.hostname.endsWith('.supabase.co'))return route.abort()
  const table=url.pathname.split('/').at(-1);requested.push(table)
  if(failure&&table==='jobs')return route.fulfill({status:500,json:{message:'Fixture backend unavailable'}})
  const data={
   organization_members:{id:'member',organization_id:org,organization:{id:org,name:'Fixture Company',settings:{}}},
   membership_roles:roles.map(key=>({role:{key}})),
   customers:[{id:customer,name:'Example Customer',status:'active',billing_email:'billing@example.invalid'}],
   jobs:[{id:'job',customer_id:customer,job_number:'JOB-1',title:'Service call',status:'completed',scheduled_start:'2026-09-28T12:00:00Z',created_at:'2026-09-27T12:00:00Z'}],
   invoices:[{id:'invoice',customer_id:customer,job_id:'job',invoice_number:'INV-1',invoice_date:'2026-09-28',status:'issued',currency_code:'CAD',total:105,amount_paid:25,balance_due:80,created_at:'2026-09-28',updated_at:'2026-09-28T12:00:00Z'}],
   fleet_vehicles:[{id:'unit',unit_number:'T-01',status:'available'}],employees:[{id:'employee',first_name:'Example',last_name:'Employee',status:'active'}],
   dispatch_assignments:[{id:'assignment',job_id:'job',employee_id:'employee',vehicle_id:'unit'}],
   timesheet_entries:[{id:'time',employee_id:'employee',job_id:'job',work_date:'2026-09-28',regular_hours:8,overtime_hours:2,status:'approved'}],
   fleet_work_orders:[],safety_form_submissions:[],user_notifications:[],price_sheet_items:[],customer_price_overrides:[],
  }[table]??[]
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
 })
 await page.addInitScript(({user})=>{
  const token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+btoa(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600}))+'.fixture'
  localStorage.setItem('sb-oztfcnrwrovzasftsdwa-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01'}}))
 },{user})
 return requested
}
test('report filters and currency totals work on desktop and phone without external requests',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await fixture(page)
 await page.goto('/reports')
 await expect(page.getByRole('heading',{name:'Fixture Company'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Billing by currency'})).toBeVisible()
 await expect(page.getByText('CA$105.00',{exact:true}).or(page.getByText('$105.00',{exact:true}))).toBeVisible()
 await page.getByLabel('From',{exact:true}).fill('2026-09-29')
 await expect(page.getByText('No issued invoices match these filters.')).toBeVisible()
 await page.getByLabel('From',{exact:true}).fill('2026-01-01')
 await page.setViewportSize({width:390,height:844})
 await expect(page.getByRole('button',{name:'Export CSV'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true)
 await page.screenshot({path:'test-results/reports-mobile.png',fullPage:true})
 expect(errors).toEqual([])
})
test('non-billing report roles never query invoice data',async({page})=>{
 const requested=await fixture(page,['supervisor'])
 await page.goto('/reports')
 await expect(page.getByRole('heading',{name:'Fixture Company'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Billing by currency'})).toHaveCount(0)
 expect(requested).not.toContain('invoices')
})
test('report load errors do not show partial totals',async({page})=>{
 await fixture(page,['owner'],true);await page.goto('/reports')
 await expect(page.getByRole('alert')).toContainText('Report unavailable')
 await expect(page.getByRole('button',{name:'Export CSV'})).toHaveCount(0)
})
test('secondary accounting role can open invoices',async({page})=>{
 await fixture(page,['supervisor','accounting']);await page.goto('/invoices')
 await expect(page.getByRole('button',{name:'New invoice'})).toBeVisible()
 await expect(page.getByText('INV-1',{exact:true})).toBeVisible()
})
test('payment dialog sends a typed, idempotent ledger request',async({page})=>{
 await fixture(page)
 let body
 await page.route('**/rest/v1/rpc/record_invoice_settlement',async route=>{body=route.request().postDataJSON();await route.fulfill({json:{id:'entry'}})})
 await page.goto('/invoices')
 await page.getByRole('button',{name:'Record payment / credit'}).click()
 await page.getByLabel('Amount (CAD)',{exact:true}).fill('25')
 await page.getByLabel('Note / reversal reason').fill('Bank transfer received')
 await page.getByRole('button',{name:'Record entry',exact:true}).click()
 await expect(page.getByLabel('Amount (CAD)',{exact:true})).toHaveValue('')
 expect(body._kind).toBe('payment');expect(body._amount).toBe(25)
 expect(body._organization_id).toBe(org);expect(body._request_id).toMatch(/^[0-9a-f-]{36}$/)
})
test('draft approval actions progress from submission to approved issuance',async({page})=>{
 await fixture(page)
 let approval='draft'
 await page.route('**/rest/v1/invoices?*',async route=>{
  if(route.request().method()==='PATCH'){approval=route.request().postDataJSON().approval_status;return route.fulfill({json:[{id:'invoice'}]})}
  return route.fulfill({json:[{id:'invoice',customer_id:customer,invoice_number:'INV-1',invoice_date:'2026-09-28',status:'draft',approval_status:approval,currency_code:'CAD',total:105,amount_paid:0,credit_total:0,balance_due:105,created_at:'2026-09-28',updated_at:'2026-09-28T12:00:00Z'}]})
 })
 await page.goto('/invoices')
 await page.getByRole('button',{name:'Submit for approval',exact:true}).click()
 await page.getByRole('button',{name:'Approve',exact:true}).click()
 await expect(page.getByRole('button',{name:'Issue invoice',exact:true})).toBeVisible()
 expect(approval).toBe('approved')
})

test('combined supervisor and accounting dashboard includes billing queries',async({page})=>{
 const requested=await fixture(page,['supervisor','accounting']);await page.goto('/')
 await expect(page.getByText('COMMAND CENTRE',{exact:true})).toBeVisible()
 expect(requested).toContain('invoices')
 expect(requested).toContain('jobs')
})

test('accounting plus operator preserves ticket and time submission',async({page})=>{
 await fixture(page,['accounting','operator']);await page.goto('/tickets')
 await expect(page.getByRole('button',{name:'New ticket',exact:true})).toBeVisible()
 await page.goto('/timesheets')
 await expect(page.getByRole('button',{name:'Add time',exact:true})).toBeVisible()
})

test('payment dialog traps keyboard focus and restores the opening button',async({page})=>{
 await fixture(page);await page.goto('/invoices')
 const opener=page.getByRole('button',{name:'Record payment / credit'});await opener.click()
 const dialog=page.getByRole('dialog')
 const close=dialog.getByRole('button',{name:'Close payment history'})
 await expect(close).toBeFocused()
 await page.keyboard.press('Shift+Tab')
 await expect(dialog.getByRole('button',{name:'Record entry',exact:true})).toBeFocused()
 await page.keyboard.press('Tab');await expect(close).toBeFocused()
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused()
})

test('invoice editor exposes accessible fields and supports escape',async({page})=>{
 await fixture(page);await page.goto('/invoices');await page.getByRole('button',{name:'New invoice',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Invoice editor'})
 await expect(dialog.getByLabel('Line description')).toBeVisible()
 await expect(dialog.getByLabel('Line rate')).toBeVisible()
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
})

test('internal screens render at phone and desktop widths without runtime errors',async({page})=>{
 test.setTimeout(60000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page)
 for(const path of ['/','/dispatch','/calendar','/jobs','/customers','/employees','/fleet','/maintenance','/safety','/tickets','/timesheets','/invoices','/pricing','/reports','/team-access']){
  await page.goto(path)
  await expect(page.locator('h1').first(),path+' heading').toBeVisible()
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:900})
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),path+' overflow at '+width).toBe(true)
  }
 }
 expect(errors).toEqual([])
})

test('field ticket editor has named controls and returns keyboard focus',async({page})=>{
 await fixture(page);await page.goto('/tickets')
 const opener=page.getByRole('button',{name:'New ticket',exact:true});await opener.click()
 const dialog=page.getByRole('dialog',{name:'Field ticket editor'})
 await expect(dialog.getByLabel('Service quantity')).toBeVisible()
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused()
})
