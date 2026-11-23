import { expect, test } from '@playwright/test'
import { DAY_SEVEN, IDS, dotOffset, freshDemo, signInAs } from './helpers'

test('a day-seven update reaches Wassana before day eight; arrival adds the calf; sides survive the flip', async ({ page }) => {
  await freshDemo(page)

  // Day seven, at home: Mira logs her left shoulder.
  await signInAs(page, 'client', IDS.mira, '/client/home')
  await expect(page.getByRole('heading', { name: 'Mira', exact: true })).toBeVisible()
  await page.locator('.log-prompt').getByRole('button', { name: 'Log how I feel' }).click()
  await page.getByRole('button', { name: 'Choose from a list' }).click()
  await page.getByRole('button', { name: 'Shoulder', exact: true }).click()
  const shoulder = page.locator('article', { has: page.getByRole('heading', { name: 'Left shoulder' }) })
  await shoulder.getByRole('radio', { name: '7 out of 10' }).click()
  await page.getByLabel(/Anything to add/).fill('Turning to look behind the car still hurts.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.log__saved')).toContainText('Wassana will see this before your visit tomorrow at 10:00.')

  // Wassana sees the dated update before arrival.
  await signInAs(page, 'therapist', IDS.wassana, '/therapist/today')
  const next = page.locator('.next')
  await expect(next).toContainText('Mira Ellison')
  await expect(next).toContainText('Tomorrow')
  await expect(next).toContainText('Today · 08:30')
  await expect(next).toContainText('Left shoulder')
  await expect(next.getByLabel('7 out of 10').first()).toBeVisible()
  await expect(next).toContainText('Turning to look behind the car still hurts.')

  // Day eight, at the practice: the update now reads "Yesterday".
  await page.clock.setSystemTime(new Date(DAY_SEVEN.getTime() + 25 * 3_600_000 + 20 * 60_000))
  await page.reload()
  await expect(next).toContainText('Yesterday · 08:30')
  await page.getByRole('link', { name: 'Begin arrival' }).click()
  await expect(page.getByText('Please hand this screen to Mira')).toBeVisible()
  const card = page.locator('article', { has: page.getByRole('heading', { name: 'Left shoulder' }) })
  await expect(card).toContainText('Yesterday · 08:30')
  await card.getByRole('button', { name: /Still accurate/ }).click()
  await page.getByText('Choose from a list instead').click()
  await page.getByRole('combobox', { name: 'Area' }).selectOption('calf')
  await page.getByRole('group', { name: 'Side' }).getByRole('button', { name: 'Right' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const calf = page.locator('article', { has: page.getByRole('heading', { name: 'Right calf' }) })
  await calf.getByRole('radio', { name: '3 out of 10' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await page.evaluate(() => localStorage.setItem('aura-table-orientation-v1', '0'))
  await page.getByRole('button', { name: 'Open Session Mode' }).click()

  // Session Mode: both regions with their own scores and sides.
  const caption = page.locator('.body-stage figcaption')
  await expect(caption).toContainText('Left shoulder, 7 out of 10')
  await expect(caption).toContainText('Right calf, 3 out of 10, on the back of the body')
  await expect(page.locator('.body-label', { hasText: 'Left shoulder' })).toContainText('confirmed')

  // Face up, head at the top: the client's left is on the viewer's right…
  expect(await dotOffset(page, 'shoulder:left')).toBeGreaterThan(0)
  expect(await dotOffset(page, 'calf:right')).toBeLessThan(0)
  // …and after turning over, on the viewer's left, with the calf now in view.
  await page.getByRole('button', { name: /Flip to face down/ }).click()
  await expect(caption).toContainText('Right calf, 3 out of 10')
  await expect(caption).not.toContainText('Right calf, 3 out of 10, on the')
  await expect(caption).toContainText('Left shoulder, 7 out of 10')
  await expect.poll(() => dotOffset(page, 'shoulder:left')).toBeLessThan(0)
  await expect.poll(() => dotOffset(page, 'calf:right')).toBeGreaterThan(0)
})
