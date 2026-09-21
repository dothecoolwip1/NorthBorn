import { test, expect } from '@playwright/test'

const BASE = process.env.NORTHBORN_BASE_URL || 'https://northborn.vercel.app'
const expectedVersion = process.env.NORTHBORN_VERSION || ''
const TEST_PASSWORD = 'Adminadmin2026!'
const TEST_USERS = {
  manager: 'manager@test.com',
  operator: 'operator@test.com',
  client: 'client@test.com',
}

const PERSONA_MARKERS = {
  manager: 'COMMAND CENTRE',
  operator: 'FIELD WORKSPACE',
  client: 'CLIENT PORTAL',
}

const INTERNAL_ROLE_MENUS = {
  owner: { label: 'Owner', present: ['Dispatch','Customers','Employees','Fleet','Maintenance','Safety','Tickets','Timesheets','Invoices','Billing queue','Templates','Reports'], absent: [] },
  admin: { label: 'Admin', present: ['Dispatch','Customers','Employees','Fleet','Maintenance','Safety','Tickets','Timesheets','Invoices','Billing queue','Templates','Reports'], absent: [] },
  supervisor: { label: 'Supervisor', present: ['Dispatch','Customers','Employees','Fleet','Maintenance','Safety','Tickets','Timesheets','Reports'], absent: ['Invoices','Billing queue','Templates'] },
  dispatcher: { label: 'Dispatcher', present: ['Dispatch','Customers','Employees','Fleet','Maintenance','Safety','Tickets','Timesheets','Reports'], absent: ['Invoices','Billing queue','Templates'] },
  safety: { label: 'Safety', present: ['Calendar','Jobs','Customers','Employees','Fleet','Maintenance','Safety','Tickets','Timesheets','Reports'], absent: ['Dispatch','Invoices','Billing queue','Templates'] },
  mechanic: { label: 'Mechanic', present: ['Calendar','Jobs','Employees','Fleet','Maintenance','Safety','Timesheets'], absent: ['Dispatch','Customers','Tickets','Invoices','Billing queue','Templates','Reports'] },
  accounting: { label: 'Accounting', present: ['Customers','Employees','Tickets','Timesheets','Invoices','Billing queue','Reports'], absent: ['Dispatch','Fleet','Maintenance','Safety','Templates'] },
}

function absolute(path) { return new URL(path, BASE).toString() }

function monitor(page) {
  const pageErrors = []
  const serverErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`)
  })
  return { pageErrors, serverErrors }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1100)
}

async function auditPage(page, path, issues, mobile = false) {
  await settle(page)
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const fatalPhrases = [
    'Page not found',
    'Northborn could not start',
    'Something went wrong',
    'No active Northborn company was found',
    'Choose how to continue',
    'Workspace unavailable',
    'is not available for this account',
  ]
  for (const phrase of fatalPhrases) if (body.includes(phrase)) issues.push(`${path}: showed "${phrase}"`)

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  if (mobile && layout.scroll > layout.viewport + 4) issues.push(`${path}: horizontal overflow ${layout.scroll}px on ${layout.viewport}px viewport`)

  const controls = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0
    }
    const named = element => {
      if (element.matches('input[type="hidden"]')) return true
      if ((element.getAttribute('aria-label') || '').trim()) return true
      if ((element.getAttribute('title') || '').trim()) return true
      if ((element.textContent || '').trim()) return true
      if ((element.getAttribute('placeholder') || '').trim()) return true
      if (element.closest('label')?.textContent?.trim()) return true
      const id = element.getAttribute('id')
      if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true
      return false
    }
    const unnamed = Array.from(document.querySelectorAll('button,a[href],input,select,textarea'))
      .filter(visible).filter(element => !named(element)).slice(0, 12)
      .map(element => `${element.tagName.toLowerCase()}.${element.className || ''}`)
    const tiny = Array.from(document.querySelectorAll('button,input,select,textarea,a[href]'))
      .filter(visible)
      .filter(element => !element.classList.contains('northborn-test-role-scrim') && !element.classList.contains('ticket-template-mobile-scrim'))
      .map(element => { const rect = element.getBoundingClientRect(); return { tag: element.tagName.toLowerCase(), text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 50), w: Math.round(rect.width), h: Math.round(rect.height) } })
      .filter(item => item.w < 32 || item.h < 32)
      .slice(0, 12)
    const tinyText = Array.from(document.querySelectorAll('body *')).filter(visible).map(element => {
      const text = (element.textContent || '').trim()
      if (!text || element.children.length) return null
      return { text: text.slice(0, 50), size: parseFloat(getComputedStyle(element).fontSize) }
    }).filter(Boolean).filter(item => item.size < 10).slice(0, 12)
    return { unnamed, tiny, tinyText }
  })
  if (controls.unnamed.length) issues.push(`${path}: unnamed controls: ${controls.unnamed.join(', ')}`)
  if (mobile && controls.tiny.length) issues.push(`${path}: controls smaller than 32px: ${controls.tiny.map(item => `${item.tag} ${item.text || '(icon)'} ${item.w}x${item.h}`).join('; ')}`)
  if (controls.tinyText.length) issues.push(`${path}: text smaller than 10px: ${controls.tinyText.map(item => `${item.text} (${item.size}px)`).join('; ')}`)
}

async function expectPersonaReady(page, persona) {
  await expect(page.locator('body')).toContainText(PERSONA_MARKERS[persona], { timeout: 30000 })
  const body = await page.locator('body').innerText()
  expect(body).not.toContain('Choose how to continue')
  expect(body).not.toContain('Workspace unavailable')
}

async function dismissTransientUi(page) {
  for (const name of ['Dismiss release notes', 'Dismiss notification']) {
    const button = page.getByRole('button', { name, exact: true }).last()
    if (await button.isVisible().catch(() => false)) await button.click()
  }
  const menu = page.getByRole('dialog', { name: 'Northborn menu' })
  if (await menu.isVisible().catch(() => false)) {
    const close = page.getByRole('button', { name: 'Close menu', exact: true })
    if (await close.isVisible().catch(() => false)) await close.click()
  }
}

async function loginAs(page, persona) {
  await page.goto(absolute('/login'))
  await settle(page)
  await page.getByLabel('Email or username', { exact: true }).fill(TEST_USERS[persona])
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname === '/', { timeout: 30000 })
  await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })
  await expectPersonaReady(page, persona)
  await page.waitForTimeout(900)
  await dismissTransientUi(page)
}

async function setManagerInternalRole(page, roleKey) {
  const config = INTERNAL_ROLE_MENUS[roleKey]
  await page.goto(absolute('/'))
  await expect(page.getByRole('button', { name: 'Switch test role' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Switch test role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Test role switcher' })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId(`test-role-${roleKey}`).click()
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname === '/', { timeout: 30000 })
  await expect(page.locator('body')).toContainText(`${config.label} workspace`, { timeout: 30000 })
}

async function routeSweep(page, routes, issues, mobile = false) {
  const monitorState = monitor(page)
  for (const path of routes) {
    const pageErrorStart = monitorState.pageErrors.length
    const serverErrorStart = monitorState.serverErrors.length
    await page.goto(absolute(path))
    await auditPage(page, path, issues, mobile)
    for (const message of monitorState.pageErrors.slice(pageErrorStart)) issues.push(`${path}: page error: ${message}`)
    for (const message of monitorState.serverErrors.slice(serverErrorStart)) issues.push(`${path}: server error: ${message}`)
  }
}

function failWithIssues(issues) {
  if (issues.length) throw new Error(`Northborn production QA found ${issues.length} issue(s):\n${issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}`)
}

test('guest and login routes are healthy', async ({ page }) => {
  const issues = []
  await page.goto(absolute('/'))
  await auditPage(page, '/', issues)
  await expect(page.locator('body')).toContainText('Northborn')

  await page.goto(absolute('/login'))
  await auditPage(page, '/login', issues)
  await expect(page.getByLabel('Email or username', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

  failWithIssues(issues)
})

test('manager routes and core actions are healthy', async ({ page }) => {
  const issues = []
  await loginAs(page, 'manager')
  const routes = ['/', '/calendar', '/dispatch', '/customers', '/jobs', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access']
  await routeSweep(page, routes, issues)

  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  await expect(page.locator('body')).toContainText('Templates')
  if (expectedVersion) await expect(page.locator('body')).toContainText(`v${expectedVersion}`)

  await page.goto(absolute('/jobs'))
  const newJob = page.getByRole('button', { name: /new job/i })
  await expect(newJob).toBeVisible({ timeout: 15000 })
  await newJob.click()
  await expect(page.locator('.manager-job-modal')).toBeVisible({ timeout: 10000 })
  await expect(page.getByLabel('Repeat', { exact: true })).toBeVisible()
  await page.getByLabel('Repeat', { exact: true }).selectOption('weekly')
  await expect(page.getByLabel('Occurrences', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.goto(absolute('/tickets'))
  const newTicket = page.getByRole('button', { name: /new ticket/i })
  await expect(newTicket).toBeVisible({ timeout: 15000 })
  await newTicket.click()
  await expect(page.locator('.ticket-editor')).toBeVisible({ timeout: 10000 })
  await page.locator('.ticket-editor header button').first().click()

  failWithIssues(issues)
})

test('Pack 2 job flows from manager creation through field completion', async ({ page }) => {
  const stamp = Date.now()
  const jobNumber = `PACK2-${stamp}`
  const title = 'Pack 2 workflow QA'
  const customerName = `Pack 2 QA Customer ${stamp}`

  await loginAs(page, 'manager')
  await page.goto(absolute('/jobs'))
  await page.getByRole('button', { name: /new job/i }).click()
  const modal = page.locator('.manager-job-modal')
  await expect(modal).toBeVisible()

  await modal.getByRole('button', { name: 'Quick add client', exact: true }).click()
  await modal.getByPlaceholder('Company name').fill(customerName)
  await modal.getByRole('button', { name: 'Add client', exact: true }).click()
  await expect(modal.getByRole('option', { name: customerName })).toBeAttached()

  await modal.getByLabel('Job number', { exact: true }).fill(jobNumber)
  await modal.getByLabel('Job title', { exact: true }).fill(title)
  await modal.getByLabel('Lifecycle state', { exact: true }).selectOption('scheduled')
  await modal.getByRole('button', { name: 'On-site time', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Choose date and time' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await modal.getByRole('button', { name: 'Create job', exact: true }).click()

  const jobCard = page.locator('.manager-job-card').filter({ hasText: jobNumber }).first()
  await expect(jobCard).toBeVisible({ timeout: 20000 })
  await jobCard.locator('a.manager-job-card-link').click()
  await expect(page.locator('.dispatch-v2-modal')).toBeVisible({ timeout: 20000 })

  const manage = page.locator('.dispatch-v2-modal')
  await manage.getByRole('button', { name: /Operator Test/ }).click()
  await manage.getByRole('button', { name: /TEST-101/ }).click()
  await manage.getByRole('button', { name: 'Assign selected', exact: true }).click()
  await expect(manage).toContainText('Ready', { timeout: 20000 })

  await manage.getByLabel('Primary operator', { exact: true }).selectOption({ label: /Operator Test/ })
  await manage.getByLabel('Dispatch contact name', { exact: true }).fill('Pack 2 Dispatch')
  await manage.getByLabel('Dispatch contact phone', { exact: true }).fill('403-555-0202')
  await manage.getByLabel('Emergency contact name', { exact: true }).fill('Pack 2 Emergency')
  await manage.getByLabel('Emergency contact phone', { exact: true }).fill('403-555-0911')
  await manage.getByRole('button', { name: 'Save job details', exact: true }).click()

  await manage.getByRole('button', { name: 'Dispatched', exact: true }).click()
  await expect(manage).toContainText('Dispatched', { timeout: 20000 })
  await manage.getByRole('button', { name: 'Done', exact: true }).click()

  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  await page.getByRole('dialog', { name: 'Northborn menu' }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await loginAs(page, 'operator')
  await page.goto(absolute('/jobs'))

  const operatorCard = page.locator('.field-job-button').filter({ hasText: jobNumber }).first()
  await expect(operatorCard).toBeVisible({ timeout: 20000 })
  await operatorCard.click()
  const operatorModal = page.locator('.field-job-modal')
  await expect(operatorModal).toContainText('403-555-0202')
  await expect(operatorModal).toContainText('403-555-0911')

  await operatorModal.getByRole('button', { name: 'Acknowledge dispatch', exact: true }).click()
  await expect(operatorModal.getByRole('button', { name: 'Start driving', exact: true })).toBeVisible({ timeout: 20000 })
  await operatorModal.getByRole('button', { name: 'Start driving', exact: true }).click()
  await expect(operatorModal.getByRole('button', { name: 'Mark on site', exact: true })).toBeVisible({ timeout: 20000 })
  await operatorModal.getByRole('button', { name: 'Mark on site', exact: true }).click()
  await expect(operatorModal.getByRole('button', { name: 'Start work', exact: true })).toBeVisible({ timeout: 20000 })
  await operatorModal.getByRole('button', { name: 'Start work', exact: true }).click()
  await expect(operatorModal).toContainText('Work is underway', { timeout: 20000 })

  await operatorModal.getByRole('button', { name: 'Complete job', exact: true }).click()
  await operatorModal.getByRole('button', { name: 'Yes, complete job', exact: true }).click()
  const invoiceModal = page.locator('.operator-invoice-modal')
  await expect(invoiceModal).toBeVisible({ timeout: 20000 })
  await invoiceModal.locator('header button').click()

  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  await page.getByRole('dialog', { name: 'Northborn menu' }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await loginAs(page, 'manager')
  await page.goto(absolute('/jobs?view=completed'))
  await page.locator('.manager-job-search input').fill(jobNumber)
  await expect(page.locator('.manager-job-card').filter({ hasText: jobNumber }).first()).toContainText('Completed', { timeout: 20000 })
})

test('operator routes, role isolation, and job access are healthy', async ({ page }) => {
  const issues = []
  await loginAs(page, 'operator')
  await routeSweep(page, ['/', '/jobs', '/fleet', '/tickets', '/timesheets', '/safety'], issues)

  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const text = await page.getByRole('dialog', { name: 'Northborn menu' }).innerText()
  if (text.includes('Templates')) issues.push('operator menu: Templates should not be visible')
  if (text.includes('Billing queue')) issues.push('operator menu: Billing queue should not be visible')
  failWithIssues(issues)
})

test('client routes and role isolation are healthy', async ({ page }) => {
  const issues = []
  await loginAs(page, 'client')
  await routeSweep(page, ['/', '/tickets', '/client-tickets'], issues)
  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const text = await page.getByRole('dialog', { name: 'Northborn menu' }).innerText()
  for (const forbidden of ['Templates', 'Dispatch', 'Employees', 'Billing queue']) if (text.includes(forbidden)) issues.push(`client menu: ${forbidden} should not be visible`)
  failWithIssues(issues)
})

test('all internal manager roles receive the correct navigation contract', async ({ page }) => {
  await loginAs(page, 'manager')
  try {
    for (const [roleKey, config] of Object.entries(INTERNAL_ROLE_MENUS)) {
      await setManagerInternalRole(page, roleKey)
      await page.getByRole('button', { name: 'Open Northborn menu' }).click()
      const navigation = page.locator('.northborn-navigation-links')
      await expect(navigation).toBeVisible()
      const text = await navigation.innerText()
      for (const item of config.present) expect(text).toContain(item)
      for (const item of config.absent) expect(text).not.toContain(item)
      await page.getByRole('button', { name: 'Close Northborn menu' }).click()
    }
  } finally {
    await setManagerInternalRole(page, 'owner')
  }
})

test('internal roles reject hidden direct routes and keep allowed routes available', async ({ page }) => {
  const cases = [
    { role: 'supervisor', allowed: '/dispatch', blocked: '/templates' },
    { role: 'dispatcher', allowed: '/dispatch', blocked: '/invoices' },
    { role: 'safety', allowed: '/safety', blocked: '/dispatch' },
    { role: 'mechanic', allowed: '/maintenance', blocked: '/customers' },
    { role: 'accounting', allowed: '/invoices', blocked: '/fleet' },
  ]

  await loginAs(page, 'manager')
  try {
    for (const entry of cases) {
      await setManagerInternalRole(page, entry.role)

      await page.goto(absolute(entry.allowed))
      await expect(page.locator('body')).not.toContainText('Page not found')
      await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })

      await page.goto(absolute(entry.blocked))
      await expect(page.locator('body')).toContainText('Page not found')
    }
  } finally {
    await setManagerInternalRole(page, 'owner')
  }
})

test('hamburger navigation, history, deep-link reload, and sign-out work for every persona', async ({ page }) => {
  const cases = [
    { persona: 'manager', menu: 'Jobs', path: '/jobs' },
    { persona: 'operator', menu: 'My jobs', path: '/jobs' },
    { persona: 'client', menu: 'Jobs', path: '/#client-jobs' },
  ]

  for (const entry of cases) {
    await loginAs(page, entry.persona)
    await page.getByRole('button', { name: 'Open Northborn menu' }).click()
    const dialog = page.getByRole('dialog', { name: 'Northborn menu' })
    await dialog.locator('.northborn-navigation-links').getByRole('button', { name: entry.menu, exact: true }).click()
    await expect(page).toHaveURL(absolute(entry.path))

    await page.reload()
    await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })
    const bodyAfterReload = await page.locator('body').innerText()
    expect(bodyAfterReload).not.toContain('Choose how to continue')
    expect(bodyAfterReload).not.toContain('Workspace unavailable')

    await page.goBack()
    await expect(page).toHaveURL(absolute('/'))
    await expectPersonaReady(page, entry.persona)

    await page.getByRole('button', { name: 'Open Northborn menu' }).click()
    await page.getByRole('dialog', { name: 'Northborn menu' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('link', { name: /Sign in/ }).first()).toBeVisible({ timeout: 30000 })
  }
})

test('role-restricted routes fail closed instead of leaking another workspace', async ({ page }) => {
  await loginAs(page, 'operator')
  await page.goto(absolute('/templates'))
  await expect(page.locator('body')).toContainText('Page not found')
  await expect(page.locator('body')).not.toContainText('Template Manager')

  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  await page.getByRole('dialog', { name: 'Northborn menu' }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('link', { name: /Sign in/ }).first()).toBeVisible({ timeout: 30000 })

  await loginAs(page, 'client')
  await page.goto(absolute('/dispatch'))
  await expect(page.locator('body')).toContainText('Page not found')
  await expect(page.locator('body')).not.toContainText('Dispatch board')
})

test('known notifications open their intended module', async ({ page }) => {
  await loginAs(page, 'manager')
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Northborn menu' })
  const fleetNotice = dialog.locator('.northborn-notification-list button').filter({ hasText: 'Fleet defect' }).first()
  const jobNotice = dialog.locator('.northborn-notification-list button').filter({ hasText: /job request|Job completed/i }).first()

  if (await fleetNotice.count()) {
    await fleetNotice.click()
    await expect(page).toHaveURL(/\/fleet(?:\?|$)/)
  } else if (await jobNotice.count()) {
    await jobNotice.click()
    await expect(page).toHaveURL(/\/jobs(?:\?|$)/)
  }
})

test('functional test role switcher can change personas', async ({ page }) => {
  await loginAs(page, 'manager')
  await page.getByRole('button', { name: 'Switch test role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Test role switcher' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Operator')
  await expect(dialog).toContainText('Client')
  await dialog.getByRole('button').filter({ hasText: 'Operator' }).click()
  await expect(page.getByRole('link', { name: 'All my jobs' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const menuText = await page.locator('body').innerText()
  expect(menuText).not.toContain('Templates')
})

test.describe('mobile visibility and touch flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('manager mobile routes avoid overflow and tiny controls', async ({ page }) => {
    const issues = []
    await loginAs(page, 'manager')
    await routeSweep(page, ['/', '/dispatch', '/calendar', '/jobs', '/fleet', '/safety', '/tickets', '/templates'], issues, true)
    failWithIssues(issues)
  })

  test('operator mobile routes avoid overflow and dead ends', async ({ page }) => {
    const issues = []
    await loginAs(page, 'operator')
    await routeSweep(page, ['/', '/jobs', '/tickets', '/timesheets', '/safety', '/fleet'], issues, true)
    failWithIssues(issues)
  })

  test('client mobile routes avoid overflow and dead ends', async ({ page }) => {
    const issues = []
    await loginAs(page, 'client')
    await routeSweep(page, ['/', '/tickets', '/client-tickets'], issues, true)
    failWithIssues(issues)
  })
})
