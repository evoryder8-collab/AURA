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

async function enterTherapist(page: import('@playwright/test').Page, preferredName = 'Pratana') {
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
  const pratana = createDemoTherapists().find(
    (therapist) => therapist.id === DEMO_THERAPIST_IDS.amara,
  )!
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(pratana.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(pratana.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()
  await expect(page.getByRole('region', { name: /pratana halstrick/i })).toBeVisible()

  await page.goto('/AURA/#/login/client')

  await expect(page.getByRole('heading', { name: /let your aura take shape/i })).toBeVisible()
  await expect(page.getByRole('region', { name: /pratana halstrick/i })).toHaveCount(0)
})

test('second therapist portrait loads through reveal, credentials, and portal identity', async ({
  page,
}) => {
  const wassana = createDemoTherapists().find(
    (therapist) => therapist.id === DEMO_THERAPIST_IDS.sora,
  )!
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/login/therapist')
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(wassana.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(wassana.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()

  const revealPortrait = page.getByRole('img', { name: /wassana schlaepfer profile portrait/i })
  await expect(revealPortrait).toHaveAttribute('src', /wassana-schlaepfer-demo\.png/)
  await expect
    .poll(() => revealPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: /continue to secure sign in/i }).click()
  const credentialPortrait = page.locator('.credential-identity__portrait img')
  await expect(credentialPortrait).toHaveAttribute('src', /wassana-schlaepfer-demo\.png/)
  await expect
    .poll(() => credentialPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)

  await page.getByRole('button', { name: /enter wassana.*team demo/i }).click()
  const portalPortrait = page.locator('.portal-sidebar__portrait img')
  await expect(portalPortrait).toHaveAttribute('src', /wassana-schlaepfer-demo\.png/)
  await expect
    .poll(() => portalPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
})

test('portrait reveal and team chooser stay usable on a phone viewport', async ({ page }) => {
  const wassana = createDemoTherapists().find(
    (therapist) => therapist.id === DEMO_THERAPIST_IDS.sora,
  )!
  const noa = createDemoClients().find((client) => client.preferredName === 'Noa')!
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/login/therapist')
  await page
    .getByRole('textbox', { name: 'Your full name' })
    .fill(wassana.displayName.replace(' — fictional demo', ''))
  await page.getByRole('spinbutton', { name: 'Your age' }).fill(demoAge(wassana.dateOfBirth))
  await page.getByRole('button', { name: /reveal my portal/i }).click()

  const revealPortrait = page.getByRole('img', { name: /wassana schlaepfer profile portrait/i })
  await expect(revealPortrait).toBeVisible()
  await expect(revealPortrait).toBeInViewport()
  const portraitStage = page.locator('.identity-reveal__hologram')
  const portraitFrame = page.locator('.identity-reveal__portrait-frame')
  expect((await portraitStage.boundingBox())?.width).toBeGreaterThan(280)
  await expect(portraitFrame).toHaveCSS('border-style', 'none')
  await expect(portraitFrame).toHaveCSS('overflow', 'visible')
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

  const wassanaChoice = page
    .locator('label.therapist-choice')
    .filter({ hasText: 'Wassana Schlaepfer' })
  await wassanaChoice.scrollIntoViewIfNeeded()
  await expect(wassanaChoice.locator('img')).toBeVisible()
  await expect(wassanaChoice).toBeInViewport()
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
  const pratanaChoice = page
    .locator('label.therapist-choice')
    .filter({ hasText: 'Pratana Halstrick' })
  const wassanaChoice = page
    .locator('label.therapist-choice')
    .filter({ hasText: 'Wassana Schlaepfer' })
  const pratanaPortrait = pratanaChoice.locator('img')
  const wassanaPortrait = wassanaChoice.locator('img')
  await expect(pratanaPortrait).toHaveAttribute('src', /pratana-halstrick-demo\.png/)
  await expect(wassanaPortrait).toHaveAttribute('src', /wassana-schlaepfer-demo\.png/)
  await expect
    .poll(() => pratanaPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await expect
    .poll(() => wassanaPortrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await wassanaChoice.click()
  await expect(
    page.getByLabel(/Wassana Schlaepfer.*Therapeutic massage practitioner/i),
  ).toBeChecked()
  await page.getByRole('button', { name: /send request/i }).click()
  await expect(page.getByText(/preferred time with Wassana/i)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: /your progress stays with you/i })).toBeVisible()
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Pratana')
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Wassana')
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

test('therapist can save a private synthetic photo through the camera fallback', async ({
  page,
}) => {
  await enterTherapist(page)
  await page.getByRole('link', { name: 'Clients' }).click()
  const miraCard = page
    .locator('.client-card')
    .filter({ has: page.getByRole('heading', { name: 'Mira' }) })
  await miraCard.getByRole('button', { name: /open dashboard/i }).click()
  await expect(page.getByRole('heading', { name: /private photo record/i })).toBeVisible()
  await expect(page.locator('.photo-placeholder')).toHaveCount(2)
  const beforeCount = await page.locator('.photo-placeholder').count()

  await page.getByRole('button', { name: /add photo/i }).click()
  await page.getByLabel(/synthetic verification phrase/i).fill('DEMO')
  await page.getByRole('button', { name: /continue securely/i }).click()
  await page.locator('input[type="file"]').setInputFiles('public/Pratana Transp V2.webp')
  await expect(page.getByRole('img', { name: /local temporary capture preview/i })).toBeVisible()
  await page.getByRole('button', { name: /save synthetic record/i }).click()

  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('.photo-placeholder')).toHaveCount(beforeCount + 1)
})

test('visual therapist choice never grants a client session therapist access', async ({ page }) => {
  await enterClient(page, 'Mira')
  await page.goto('/AURA/#/therapist/today')
  await expect(page).toHaveURL(/#\/client\/home/)
  await expect(page.getByRole('heading', { name: /welcome, mira/i })).toBeVisible()
})
