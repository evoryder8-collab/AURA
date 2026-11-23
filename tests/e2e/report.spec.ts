import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { IDS, freshDemo, signInAs } from './helpers'

const PRIVATE = 'Private working note: guarded on rotation; check the bolster height next time.'
const FOR_DOCTOR = 'Left shoulder discomfort has stayed at 5–7/10 across both therapists for six weeks.'

test('notes stay separate, the client consents, and the PDF downloads', async ({ page }) => {
  await freshDemo(page)
  await signInAs(page, 'therapist', IDS.wassana, `/therapist/clients/${IDS.mira}`)

  // History spans both therapists.
  const sections = page.getByRole('group', { name: 'Client sections' })
  await sections.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText(/Visit with Pratana/).first()).toBeVisible()
  await expect(page.getByText(/Visit with Wassana/).first()).toBeVisible()

  // A private note and a separate doctor-facing note.
  await sections.getByRole('button', { name: 'Notes' }).click()
  await page.getByRole('button', { name: 'Private working note' }).click()
  await page.getByRole('textbox', { name: 'Note' }).fill(PRIVATE)
  await page.getByRole('button', { name: 'Save note' }).click()
  await page.getByRole('button', { name: 'For a doctor’s report' }).first().click()
  await page.getByRole('textbox', { name: 'Note' }).fill(FOR_DOCTOR)
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText(PRIVATE)).toBeVisible()
  await expect(page.getByText(FOR_DOCTOR)).toBeVisible()

  // The builder offers only the report note.
  await page.getByRole('button', { name: 'Prepare report for a doctor' }).click()
  const notes = page.getByRole('radiogroup', { name: /choose a note/i })
  await expect(notes).toContainText(FOR_DOCTOR)
  await expect(page.getByText(PRIVATE)).toHaveCount(0)
  await notes.getByRole('radio', { name: new RegExp(FOR_DOCTOR.slice(0, 30)) }).click()
  await expect(page.getByRole('checkbox', { name: /include photographs/i })).not.toBeChecked()
  await expect(page.getByRole('button', { name: /download pdf/i })).toHaveCount(0)
  await page.getByRole('button', { name: /ask mira to review/i }).click()

  // Mira reviews and agrees on the practice device.
  await page.getByRole('button', { name: /mira is here/i }).click()
  const sheet = page.getByRole('dialog', { name: /review with mira/i })
  await expect(sheet).toContainText(FOR_DOCTOR)
  await expect(sheet).not.toContainText(PRIVATE)
  await sheet.getByRole('button', { name: /i agree to share this with my family doctor/i }).click()
  await expect(sheet).toContainText('You agreed to share it')
  await sheet.getByRole('button', { name: 'Hand back to Wassana' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /download pdf/i }).first().click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^aura-report-\d{4}-\d{2}-\d{2}\.pdf$/)
  const path = await download.path()
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(50_000)

  // The client sees the shared report in her own portal.
  await signInAs(page, 'client', IDS.mira, '/client/me')
  await expect(page.getByText('Shared').first()).toBeVisible()
})
