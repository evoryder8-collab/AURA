import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { IDS, freshDemo, signInAs } from './helpers'

async function expectNoSeriousViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).exclude('canvas').analyze()
  const serious = results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')
  expect(serious.map((item) => `${name}: ${item.id} — ${item.help} (${item.nodes.length})`)).toEqual([])
}

test('@a11y client screens have no serious axe violations', async ({ page }) => {
  await freshDemo(page)
  await expectNoSeriousViolations(page, 'entrance')
  await signInAs(page, 'client', IDS.mira, '/client/home')
  await expect(page.getByRole('heading', { level: 1, name: /, Mira$/ })).toBeVisible()
  await expectNoSeriousViolations(page, 'client home')
  for (const [hash, heading] of [
    ['/client/log', 'Where do you feel it?'],
    ['/client/progress', null],
    ['/client/visits', null],
    ['/client/me', null],
  ] as const) {
    await page.goto(`/AURA/#${hash}`)
    if (heading) await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 })
    else await page.waitForLoadState('networkidle')
    await expectNoSeriousViolations(page, hash)
  }
})

test('@a11y therapist screens have no serious axe violations', async ({ page }) => {
  await freshDemo(page)
  await signInAs(page, 'therapist', IDS.wassana, '/therapist/today')
  await expect(page.locator('.next')).toBeVisible()
  await expectNoSeriousViolations(page, 'therapist today')
  for (const hash of [
    '/therapist/clients',
    `/therapist/clients/${IDS.mira}`,
    '/therapist/calendar',
    '/therapist/arrival/appointment-mira-tomorrow',
    '/therapist/session/appointment-mira-tomorrow',
    `/therapist/clients/${IDS.mira}/report`,
  ]) {
    await page.goto(`/AURA/#${hash}`)
    await page.waitForLoadState('networkidle')
    await expectNoSeriousViolations(page, hash)
  }
})

test('@a11y the log form works with the keyboard alone', async ({ page }) => {
  await freshDemo(page)
  await signInAs(page, 'client', IDS.mira, '/client/log')
  await page.getByRole('button', { name: 'Choose from a list' }).focus()
  await page.keyboard.press('Enter')
  const shoulder = page.getByRole('button', { name: 'Shoulder', exact: true })
  await shoulder.focus()
  await page.keyboard.press('Enter')
  const scale = page.getByRole('radiogroup', { name: /Pain in Left shoulder/ })
  await scale.getByRole('radio', { name: '0 out of 10', exact: true }).focus()
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowRight')
  await expect(scale.getByRole('radio', { name: '4 out of 10' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.log__saved')).toContainText('Saved to your record')
})
