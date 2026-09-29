import { test, expect } from '@playwright/test'

test('Northborn marketing site works on a 390px phone', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /THE FIELD/i }).first()).toBeVisible()
  await expect(page.locator('.mobile-dock')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Manager' })).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)

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
