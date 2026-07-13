import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('@a11y entrance and therapist Today have no serious axe violations', async ({ page }) => {
  await page.goto('/AURA/#/')
  await expect(page.getByRole('heading', { name: /how are you.*entering today/i })).toBeVisible()
  let results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([])

  await page.getByRole('link', { name: /i am a therapist/i }).click()
  await page.getByRole('button', { name: /enter therapist demo/i }).click()
  await expect(page.getByRole('heading', { name: /a clear view.*of today/i })).toBeVisible()
  const skipLink = page.getByRole('link', { name: 'Skip to content' })
  await skipLink.focus()
  await skipLink.press('Enter')
  await expect(page).toHaveURL(/#\/therapist\/today$/)
  await expect(page.locator('#main-content')).toBeFocused()
  results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([])
})
