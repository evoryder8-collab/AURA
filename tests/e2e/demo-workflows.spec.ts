import { expect, test } from '@playwright/test'
import {
  createDemoClients,
  createDemoTherapists,
  DEMO_THERAPIST_IDS,
} from '../../src/data/demo/fixtures'
import { getIdentityAge } from '../../src/features/auth/identity'

function demoAge(dateOfBirth: string) {
  return String(getIdentityAge({ id: 'e2e-identity', name: 'Synthetic identity', dateOfBirth }))
}

async function enterTherapist(page: import('@playwright/test').Page, preferredName = 'Amara') {
  const therapist = createDemoTherapists().find(
    (candidate) => candidate.preferredName === preferredName,
  )
  if (!therapist) throw new Error(`Synthetic therapist fixture ${preferredName} is missing.`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/')
  await page.getByRole('link', { name: /i am a therapist/i }).click()
  await page
    .getByLabel(/your full name/i)
    .fill(therapist.displayName.replace(' — fictional demo', ''))
  await page.getByLabel(/your age/i).fill(demoAge(therapist.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  await page
    .getByRole('button', { name: new RegExp(`enter ${preferredName}.*team demo`, 'i') })
    .click()
  await expect(page.getByRole('heading', { name: /a clear view.*of today/i })).toBeVisible()
}

async function enterClient(page: import('@playwright/test').Page, name: string) {
  const client = createDemoClients().find((candidate) => candidate.preferredName === name)
  if (!client) throw new Error(`Synthetic client fixture ${name} is missing.`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/')
  await page.getByRole('link', { name: /i am a client/i }).click()
  await page.getByLabel(/your full name/i).fill(name)
  await page.getByLabel(/your age/i).fill(demoAge(client.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  await page.getByRole('button', { name: new RegExp(`enter ${name}.*client demo`, 'i') }).click()
  await expect(
    page.getByRole('heading', { name: new RegExp(`welcome, ${name}`, 'i') }),
  ).toBeVisible()
}

test('therapist can create a pending synthetic appointment and find the client', async ({
  page,
}) => {
  await enterTherapist(page)
  await page.getByRole('button', { name: /new appointment/i }).click()
  await page.getByRole('button', { name: /new client/i }).click()
  await page.getByLabel('Preferred name').fill('Atlas Demo')
  await page.getByRole('button', { name: /create appointment/i }).click()
  await page.getByRole('link', { name: 'Clients' }).click()
  await expect(page.getByRole('heading', { name: 'Atlas Demo' })).toBeVisible()
})

test('returning client completes the fast unchanged check-in', async ({ page }) => {
  await enterClient(page, 'Mira')
  await page.getByRole('button', { name: /start returning check-in/i }).click()
  await expect(page.getByText(/about 20 seconds/i)).toBeVisible()
  await page.getByRole('button', { name: /confirm unchanged/i }).click()
  await expect(page.getByRole('heading', { name: /you’re ready.*for today/i })).toBeVisible()
})

test('switching portal routes clears an unsubmitted identity reveal', async ({ page }) => {
  await page.goto('/AURA/#/login/therapist')
  const amara = createDemoTherapists().find(
    (therapist) => therapist.id === DEMO_THERAPIST_IDS.amara,
  )!
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(amara.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(amara.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await expect(page.getByRole('region', { name: /amara vale/i })).toBeVisible()

  await page.goto('/AURA/#/login/client')

  await expect(page.getByRole('heading', { name: /let your aura take shape/i })).toBeVisible()
  await expect(page.getByRole('region', { name: /amara vale/i })).toHaveCount(0)
})

test('second therapist portrait loads through reveal, credentials, and portal identity', async ({
  page,
}) => {
  const sora = createDemoTherapists().find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)!
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/login/therapist')
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(sora.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(sora.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()

  const revealPortrait = page.getByRole('img', { name: /sora bell profile portrait/i })
  await expect(revealPortrait).toHaveAttribute('src', /wassana%20therapist%20transparent\.webp/)
  await expect
    .poll(() => revealPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  const credentialPortrait = page.locator('.credential-identity__portrait img')
  await expect(credentialPortrait).toHaveAttribute('src', /wassana%20therapist%20transparent\.webp/)
  await expect
    .poll(() => credentialPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: /enter sora.*team demo/i }).click()
  const portalPortrait = page.locator('.portal-sidebar__portrait img')
  await expect(portalPortrait).toHaveAttribute('src', /wassana%20therapist%20transparent\.webp/)
  await expect
    .poll(() => portalPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

test('portrait reveal and team chooser stay usable on a phone viewport', async ({ page }) => {
  const sora = createDemoTherapists().find((therapist) => therapist.id === DEMO_THERAPIST_IDS.sora)!
  const noa = createDemoClients().find((client) => client.preferredName === 'Noa')!
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/login/therapist')
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(sora.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(sora.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()

  const revealPortrait = page.getByRole('img', { name: /sora bell profile portrait/i })
  await expect(revealPortrait).toBeVisible()
  await expect(revealPortrait).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  await page.goto('/AURA/#/login/client')
  await page.getByRole('textbox', { name: 'Your full name' }).fill(noa.preferredName)
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(noa.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  await page.getByRole('button', { name: /enter noa.*client demo/i }).click()
  await page.getByRole('link', { name: 'Appointments' }).click()
  await page.getByRole('button', { name: /request appointment/i }).click()

  const soraChoice = page.locator('label.therapist-choice').filter({ hasText: 'Sora Bell' })
  await soraChoice.scrollIntoViewIfNeeded()
  await expect(soraChoice.locator('img')).toBeVisible()
  await expect(soraChoice).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('client chooses a therapist while progress remains one continuous record', async ({
  page,
}) => {
  await enterClient(page, 'Noa')
  await page.getByRole('link', { name: 'Appointments' }).click()
  await page.getByRole('button', { name: /request appointment/i }).click()
  const amaraChoice = page.locator('label.therapist-choice').filter({ hasText: 'Amara Vale' })
  const soraChoice = page.locator('label.therapist-choice').filter({ hasText: 'Sora Bell' })
  const amaraPortrait = amaraChoice.locator('img')
  const soraPortrait = soraChoice.locator('img')
  await expect(amaraPortrait).toHaveAttribute('src', /Pratana%20Transp%20V2\.webp/)
  await expect(soraPortrait).toHaveAttribute('src', /wassana%20therapist%20transparent\.webp/)
  await expect
    .poll(() => amaraPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await expect
    .poll(() => soraPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await soraChoice.click()
  await expect(page.getByLabel(/Sora Bell.*Therapeutic massage practitioner/i)).toBeChecked()
  await page.getByRole('button', { name: /send request/i }).click()
  await expect(page.getByText(/preferred time with Sora/i)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: /your progress stays with you/i })).toBeVisible()
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Amara')
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Sora')
  await expect(page.getByLabel(/your assigned care team/i).locator('img')).toHaveCount(2)
})

test('each therapist account sees only its assigned client list', async ({ page }) => {
  await enterTherapist(page, 'Elias')
  await page.getByRole('link', { name: 'Clients' }).click()
  await expect(page.getByRole('heading', { name: 'Noa', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sage', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mira', exact: true })).toHaveCount(0)
})

test('first-visit intake saves and resumes structured progress', async ({ page }) => {
  await enterClient(page, 'Noa')
  await page.getByRole('button', { name: /continue intake/i }).click()
  await page.getByLabel('Preferred name').fill('Noa Resume')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Relevant health profile').fill('Synthetic sensitivity for resume test')
  await page.getByRole('button', { name: /save & close/i }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: /continue intake/i }).click()
  await expect(page.getByRole('heading', { name: /2\. health profile/i })).toBeVisible()
  await expect(page.getByLabel('Relevant health profile')).toHaveValue(
    'Synthetic sensitivity for resume test',
  )
})

test('therapist can finish Session Mode and persist structured wrap-up', async ({ page }) => {
  await enterTherapist(page)
  await page.getByRole('button', { name: 'Start Massage', exact: true }).first().click()
  await expect(page).toHaveURL(/#\/therapist\/session\//)
  await expect(page.getByRole('heading', { name: 'Mira', exact: true })).toBeVisible()
  await page
    .locator('.workspace-actions-card')
    .getByRole('button', { name: 'Start Massage', exact: true })
    .click()
  await expect(page.getByText(/privacy-conscious display/i)).toBeVisible()
  await page.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(page.getByRole('heading', { name: /massage.*complete/i })).toBeVisible()
  await page.getByRole('button', { name: /continue to wrap-up/i }).click()
  await page.getByLabel('Upper back').check()
  await page.getByLabel('Client-visible aftercare').fill('Synthetic gentle movement note.')
  await page.getByRole('button', { name: /complete wrap-up/i }).click()
  await expect(page.getByRole('heading', { name: /a clear view.*of today/i })).toBeVisible()
})

test('visual therapist choice never grants a client session therapist access', async ({ page }) => {
  await enterClient(page, 'Mira')
  await page.goto('/AURA/#/therapist/today')
  await expect(page).toHaveURL(/#\/client\/home/)
  await expect(page.getByRole('heading', { name: /welcome, mira/i })).toBeVisible()
})
