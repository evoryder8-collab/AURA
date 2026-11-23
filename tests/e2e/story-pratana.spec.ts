import { expect, test } from '@playwright/test'
import { IDS, freshDemo, signInAs } from './helpers'

const EXTRA_SENTENCE = /Pratana gave you 12\s+extra minutes today, bringing her total to 47\s+minutes across your visits\./

test('a 90-minute booking with Pratana crosses zero, finishes at 102 minutes and credits 12 extra minutes once', async ({ page }) => {
  await freshDemo(page)

  // Mira books a 90-minute visit with Pratana.
  await signInAs(page, 'client', IDS.mira, '/client/visits/book')
  await page.getByRole('button', { name: /Pratana Halstrick/ }).click()
  await page.getByRole('button', { name: /Deep restorative massage/ }).click()
  const times = page.getByRole('group', { name: /Start time/ })
  const slot = times.getByRole('button').first()
  const slotText = (await slot.textContent())?.trim() ?? ''
  await slot.click()
  await page.getByRole('button', { name: 'Book this visit' }).click()
  await expect(page.getByRole('heading', { name: /You're booked with Pratana/ })).toBeVisible()

  // She checks in on the day.
  await page.goto('/AURA/#/client/visits')
  const checkIn = page.getByRole('link', { name: /Check in for this visit/ }).first()
  const href = (await checkIn.getAttribute('href')) ?? ''
  const appointmentId = href.split('/').pop() ?? ''
  expect(appointmentId).toMatch(/^appointment-/)
  await checkIn.click()
  await page.getByRole('button', { name: 'All still accurate' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you, Mira' })).toBeVisible()

  // Pratana runs the session on a controlled clock (time keeps flowing; jumps are exact).
  const [hours, minutes] = slotText.slice(0, 5).split(':').map(Number)
  const start = new Date(2026, 10, 23, hours, minutes, 0)
  await page.clock.setSystemTime(start)
  await signInAs(page, 'therapist', IDS.pratana, `/therapist/session/${appointmentId}`)
  await expect(page.getByRole('timer')).toHaveText('90:00')
  await page.clock.setSystemTime(start)
  await page.getByRole('button', { name: 'Start session' }).click()
  await page.clock.fastForward(45 * 60_000)
  await expect(page.getByRole('timer')).toHaveText(/^(45:00|44:5\d)$/)
  await expect(page.getByText('Remaining', { exact: true })).toBeVisible()
  await page.clock.fastForward(45 * 60_000)
  await expect(page.getByText('Extra care', { exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^\+00:0\d$/)

  // A reload keeps the true elapsed time.
  await page.clock.fastForward(5 * 60_000)
  await page.reload()
  await expect(page.getByRole('timer')).toHaveText(/^\+05:\d\d$/)

  await page.clock.fastForward(7 * 60_000)
  await expect(page.getByRole('timer')).toHaveText(/^\+12:\d\d$/)
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Finish and review time' }).click()
  const time = page.getByRole('region', { name: 'Session time' })
  await expect(time).toContainText('Booked90minutes')
  await expect(time).toContainText('Actual102minutes')
  await expect(time).toContainText('Extra12minutes')
  const confirm = page.getByRole('button', { name: /Confirm 12/ })
  await confirm.click()
  await expect(page.getByText(/12\s+minutes confirmed for Mira/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/12\s+minutes confirmed for Mira/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Confirm 12/ })).toHaveCount(0)

  // Mira sees it once, attributed to Pratana, with the running total.
  await signInAs(page, 'client', IDS.mira, '/client/home')
  await expect(page.locator('.bonus')).toContainText(EXTRA_SENTENCE)
  await page.reload()
  await expect(page.locator('.bonus')).toContainText(EXTRA_SENTENCE)
  await expect(page.locator('.bonus')).toContainText(/57\s+minutes of extra care in all/)
})
