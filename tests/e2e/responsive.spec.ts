import { expect, test, type Page } from '@playwright/test'
import { createDemoClients, createDemoTherapists } from '../../src/data/demo/fixtures'
import { getIdentityAge } from '../../src/features/auth/identity'

const phoneViewport = { width: 390, height: 844 }

function ageFor(dateOfBirth: string) {
  return String(getIdentityAge({ id: 'responsive-audit', name: 'Responsive audit', dateOfBirth }))
}

async function enterTherapist(page: Page) {
  const therapist = createDemoTherapists().find((item) => item.preferredName === 'Pratana')
  if (!therapist) throw new Error('Pratana demo fixture is missing.')
  await page.goto('/AURA/#/login/therapist')
  await page.getByRole('textbox', { name: 'Your full name' }).fill('Pratana Halstrick')
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(ageFor(therapist.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  await page.getByRole('button', { name: /enter pratana.*team demo/i }).click()
  await expect(page.getByRole('heading', { name: /a clear view.*of today/i })).toBeVisible()
}

async function enterClient(page: Page) {
  const client = createDemoClients().find((item) => item.preferredName === 'Mira')
  if (!client) throw new Error('Mira demo fixture is missing.')
  await page.goto('/AURA/#/login/client')
  await page.getByRole('textbox', { name: 'Your full name' }).fill(client.preferredName)
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(ageFor(client.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  await page.getByRole('button', { name: /enter mira.*client demo/i }).click()
  await expect(page.getByRole('heading', { name: /welcome, mira/i })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const audit = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const selectors = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '.card',
      '.status-strip',
      '.page-header__actions',
      '.modal__content',
    ].join(',')
    const offenders = Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          (rect.left < -1 || rect.right > viewportWidth + 1)
        )
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .slice(0, 12)
    return {
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    }
  })

  expect(audit.scrollWidth, `${label}: ${JSON.stringify(audit.offenders)}`).toBeLessThanOrEqual(
    audit.viewportWidth + 1,
  )
  expect(audit.offenders, label).toEqual([])
}

test('therapist portal controls stay inside an iPhone-width viewport', async ({ page }) => {
  await page.setViewportSize(phoneViewport)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enterTherapist(page)

  const routes = [
    '/AURA/#/therapist/today',
    '/AURA/#/therapist/clients',
    '/AURA/#/therapist/clients/demo-client-mira',
    '/AURA/#/therapist/calendar',
    '/AURA/#/therapist/settings',
  ]

  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('#main-content h1').first()).toBeVisible()
    await expectNoHorizontalOverflow(page, route)
  }

  await page.goto('/AURA/#/therapist/today')
  await page.getByRole('button', { name: /open all navigation/i }).click()
  await expect(page.getByRole('dialog', { name: /all portal navigation/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'therapist all-navigation menu')
  await page.getByRole('button', { name: /close menu/i }).click()

  await page.goto('/AURA/#/therapist/today')
  await page.getByRole('button', { name: /new appointment/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'therapist appointment modal')
})

test('client portal controls stay inside an iPhone-width viewport', async ({ page }) => {
  await page.setViewportSize(phoneViewport)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await enterClient(page)

  const routes = [
    '/AURA/#/client/home',
    '/AURA/#/client/progress',
    '/AURA/#/client/appointments',
    '/AURA/#/client/history',
    '/AURA/#/client/consents',
    '/AURA/#/client/settings',
  ]

  for (const route of routes) {
    await page.goto(route)
    await expect(page.locator('#main-content h1').first()).toBeVisible()
    await expectNoHorizontalOverflow(page, route)
  }

  await page.goto('/AURA/#/client/home')
  await page.getByRole('button', { name: /open all navigation/i }).click()
  await expect(page.getByRole('dialog', { name: /all portal navigation/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'History' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Consent' })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'client all-navigation menu')
  await page.getByRole('button', { name: /close menu/i }).click()

  await page.goto('/AURA/#/client/appointments')
  await page.getByRole('button', { name: /request appointment/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'client booking modal')
})
