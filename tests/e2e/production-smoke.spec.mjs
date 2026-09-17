import { test, expect } from '@playwright/test'

const BASE = process.env.NORTHBORN_BASE_URL || 'https://northborn.vercel.app'
const expectedVersion = process.env.NORTHBORN_VERSION || ''

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
  await page.waitForTimeout(900)
}

async function auditPage(page, path, issues, mobile = false) {
  await settle(page)
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const fatalPhrases = [
    'Page not found',
    'Northborn could not start',
    'Something went wrong',
    'No active Northborn company was found',
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

async function loginManager(page) {
  await page.goto(absolute('/login'))
  await settle(page)
  await page.getByLabel('Email or username').fill('admin')
  await page.getByLabel('Password').fill('admin')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })
}

async function switchPersona(page, label) {
  await page.getByRole('button', { name: 'Switch test role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Test role switcher' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button').filter({ hasText: label }).click()
  await page.waitForURL(url => url.origin === new URL(BASE).origin && url.pathname === '/', { timeout: 30000 })
  await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toBeVisible({ timeout: 30000 })
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

test('guest, login, and isolated Mallard routes are healthy', async ({ page }) => {
  const issues = []
  await page.goto(absolute('/'))
  await auditPage(page, '/', issues)
  await expect(page.locator('body')).toContainText('Northborn')

  await page.goto(absolute('/login'))
  await auditPage(page, '/login', issues)
  await expect(page.getByLabel('Email or username')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()

  await page.goto(absolute('/mallard'))
  await settle(page)
  await expect(page).toHaveTitle(/Mallard/i)
  await expect(page.getByRole('button', { name: 'Open Northborn menu' })).toHaveCount(0)
  failWithIssues(issues)
})

test('manager routes and core actions are healthy', async ({ page }) => {
  const issues = []
  await loginManager(page)
  const routes = ['/', '/calendar', '/dispatch', '/customers', '/jobs', '/employees', '/fleet', '/fleet-access', '/maintenance', '/safety', '/tickets', '/timesheets', '/invoices', '/billing', '/pricing', '/templates', '/reports', '/team-access']
  await routeSweep(page, routes, issues)

  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  await expect(page.locator('body')).toContainText('Templates')
  if (expectedVersion) await expect(page.locator('body')).toContainText(`v${expectedVersion}`)

  await page.goto(absolute('/tickets'))
  const newTicket = page.getByRole('button', { name: /new ticket/i })
  if (await newTicket.count()) {
    await newTicket.first().click()
    await expect(page.locator('.ticket-editor')).toBeVisible({ timeout: 10000 })
    if (await page.locator('.ticket-template-banner').count() === 0) issues.push('/tickets: active company field ticket template was not visible after opening New ticket')
  } else issues.push('/tickets: New ticket action was not visible for manager test account')

  failWithIssues(issues)
})

test('operator routes, role isolation, and job access are healthy', async ({ page }) => {
  const issues = []
  await loginManager(page)
  await switchPersona(page, 'Operator')
  await routeSweep(page, ['/', '/jobs', '/fleet', '/tickets', '/timesheets', '/safety'], issues)

  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const text = await page.locator('body').innerText()
  if (text.includes('Templates')) issues.push('operator menu: Templates should not be visible')
  if (text.includes('Billing queue')) issues.push('operator menu: Billing queue should not be visible')
  failWithIssues(issues)
})

test('client routes and role isolation are healthy', async ({ page }) => {
  const issues = []
  await loginManager(page)
  await switchPersona(page, 'Client')
  await routeSweep(page, ['/', '/tickets', '/client-tickets'], issues)
  await page.goto(absolute('/'))
  await page.getByRole('button', { name: 'Open Northborn menu' }).click()
  const text = await page.locator('body').innerText()
  for (const forbidden of ['Templates', 'Dispatch', 'Employees', 'Billing queue']) if (text.includes(forbidden)) issues.push(`client menu: ${forbidden} should not be visible`)
  failWithIssues(issues)
})

test.describe('mobile visibility and touch flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('manager mobile routes avoid overflow and tiny controls', async ({ page }) => {
    const issues = []
    await loginManager(page)
    await routeSweep(page, ['/', '/dispatch', '/calendar', '/jobs', '/fleet', '/safety', '/tickets', '/templates'], issues, true)
    failWithIssues(issues)
  })

  test('operator and client mobile routes avoid overflow and dead ends', async ({ page }) => {
    const issues = []
    await loginManager(page)
    await switchPersona(page, 'Operator')
    await routeSweep(page, ['/', '/jobs', '/tickets', '/timesheets', '/safety', '/fleet'], issues, true)
    await switchPersona(page, 'Manager')
    await switchPersona(page, 'Client')
    await routeSweep(page, ['/', '/tickets'], issues, true)
    failWithIssues(issues)
  })
})
