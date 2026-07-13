import { expect, test } from '@playwright/test'
import { createDemoClients, createDemoTherapists } from '../../src/data/demo/fixtures'
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

test('client chooses a therapist while progress remains one continuous record', async ({
  page,
}) => {
  await enterClient(page, 'Noa')
  await page.getByRole('link', { name: 'Appointments' }).click()
  await page.getByRole('button', { name: /request appointment/i }).click()
  const soraChoice = page.locator('label.therapist-choice').filter({ hasText: 'Sora Bell' })
  await soraChoice.click()
  await expect(page.getByLabel(/Sora Bell.*Therapeutic massage practitioner/i)).toBeChecked()
  await page.getByRole('button', { name: /send request/i }).click()
  await expect(page.getByText(/preferred time with Sora/i)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: /your progress stays with you/i })).toBeVisible()
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Amara')
  await expect(page.getByLabel(/your assigned care team/i)).toContainText('Sora')
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
