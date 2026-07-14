import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { createDemoTherapists } from '../../src/data/demo/fixtures'
import { getIdentityAge } from '../../src/features/auth/identity'

test('@a11y entrance and therapist Today have no serious axe violations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/')
  await expect(page.getByRole('heading', { name: /step into your aura/i })).toBeVisible()
  let results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([])

  await page.getByRole('link', { name: /i am a therapist/i }).click()
  results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([])

  const therapist = createDemoTherapists()[0]
  if (!therapist) throw new Error('The primary synthetic therapist fixture is missing.')
  const age = getIdentityAge({
    id: therapist.id,
    name: therapist.displayName,
    dateOfBirth: therapist.dateOfBirth,
  })
  await page
    .getByLabel(/your full name/i)
    .fill(therapist.displayName.replace(' — fictional demo', ''))
  await page.getByLabel(/your age/i).fill(String(age))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([])

  await page.getByRole('button', { name: /enter pratana.*team demo/i }).click()
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
