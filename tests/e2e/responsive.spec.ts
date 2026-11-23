import { expect, test, type Page } from '@playwright/test'
import { IDS, freshDemo, signInAs } from './helpers'

const SIZES = [
  { name: 'small phone', width: 320, height: 640 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet landscape', width: 1180, height: 820 },
  { name: 'laptop', width: 1440, height: 900 },
] as const

const CLIENT_PAGES = ['/client/home', '/client/log', '/client/progress', '/client/visits', '/client/visits/book', '/client/me']
const THERAPIST_PAGES = [
  '/therapist/today',
  '/therapist/clients',
  `/therapist/clients/${IDS.mira}`,
  '/therapist/calendar',
  '/therapist/arrival/appointment-mira-tomorrow',
  '/therapist/session/appointment-mira-tomorrow',
  `/therapist/clients/${IDS.mira}/report`,
  '/therapist/settings',
]

async function expectNoSideScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

for (const size of SIZES) {
  test(`no sideways scrolling on any main screen · ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await freshDemo(page)
    await expectNoSideScroll(page, 'entrance')
    await signInAs(page, 'client', IDS.mira, '/client/home')
    for (const hash of CLIENT_PAGES) {
      await page.goto(`/AURA/#${hash}`)
      await page.waitForLoadState('networkidle')
      await expectNoSideScroll(page, `${hash} @ ${size.width}`)
    }
    await signInAs(page, 'therapist', IDS.wassana, '/therapist/today')
    for (const hash of THERAPIST_PAGES) {
      await page.goto(`/AURA/#${hash}`)
      await page.waitForLoadState('networkidle')
      await expectNoSideScroll(page, `${hash} @ ${size.width}`)
    }
  })
}

test('both role choices are fully visible and tappable on a 320px phone without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await freshDemo(page)
  for (const name of [/client/i, /therapist/i]) {
    const link = page.getByRole('link', { name }).first()
    await expect(link).toBeInViewport({ ratio: 1 })
    const box = await link.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320)
  }
})

test('the check-in save button stays reachable with the on-screen keyboard open', async ({ page }) => {
  // A 390×460 viewport approximates an iPhone with its keyboard up.
  await page.setViewportSize({ width: 390, height: 460 })
  await freshDemo(page)
  await signInAs(page, 'client', IDS.mira, '/client/log')
  await page.getByRole('button', { name: 'Choose from a list' }).click()
  await page.getByRole('button', { name: 'Shoulder', exact: true }).click()
  await page.getByLabel(/Anything to add/).focus()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
})
