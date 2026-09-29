import { test, expect } from '@playwright/test'

test('Northborn marketing site works on a 390px phone', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /THE FIELD/i }).first()).toBeVisible()
  await expect(page.locator('.mobile-dock')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Manager' })).toBeVisible()

  const mobileOverflow = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    offenders: Array.from(document.querySelectorAll('*')).map(el => {
      const rect = el.getBoundingClientRect()
      let parent = el.parentElement
      let contained = false
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const overflowX = getComputedStyle(parent).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') {
          const parentRect = parent.getBoundingClientRect()
          if (rect.right > parentRect.right + 2 || rect.left < parentRect.left - 2) contained = true
          break
        }
        parent = parent.parentElement
      }
      return {
        tag: el.tagName,
        className: typeof el.className === 'string' ? el.className : '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        contained,
      }
    }).filter(item => (item.right > innerWidth + 2 || item.left < -2) && !item.contained).slice(0, 30),
    boxes: ['.site-shell','.hero','.hero-visual','.manifesto','.manifesto-line','.journey','.journey-layout','.journey-steps','.journey-sticky','.roles-section','.role-stage','.system-section','.field-section','.closing','footer'].map(selector => {
      const el = document.querySelector(selector)
      if (!el) return { selector, missing: true }
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return { selector, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: el.scrollWidth, overflowX: style.overflowX, display: style.display }
    }),
  }))
  expect(mobileOverflow, JSON.stringify(mobileOverflow, null, 2)).toMatchObject({ pageWidth: expect.any(Number), viewportWidth: 390 })
  expect(mobileOverflow.pageWidth, JSON.stringify(mobileOverflow, null, 2)).toBeLessThanOrEqual(392)

  await page.getByRole('tab', { name: 'Operator' }).click()
  await expect(page.locator('.role-product.operator')).toContainText('3 jobs assigned')

  await page.getByRole('tab', { name: 'Client' }).click()
  await expect(page.locator('.role-product.client')).toContainText('Signed field ticket')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
  expect(errors).toEqual([])
})

test('Northborn marketing site renders the desktop field experience', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  await expect(page.locator('.hero-operation')).toContainText('Hydrovac daylighting')
  await expect(page.locator('#journey-machine')).toBeVisible()
  await expect(page.locator('.field-terrain')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
  expect(errors).toEqual([])
})
