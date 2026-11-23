import { expect, type Page } from '@playwright/test'

export const IDS = {
  pratana: 'demo-therapist-amara',
  wassana: 'demo-therapist-sora',
  mira: 'demo-client-mira',
} as const

/** Day seven of the story: a Monday morning, the day before Mira sees Wassana. */
export const DAY_SEVEN = new Date('2026-11-23T08:30:00')

/** Signs in as a synthetic identity without the entrance animation (the entrance has its own spec). */
export async function signInAs(page: Page, role: 'client' | 'therapist', id: string, hash: string) {
  await page.evaluate(
    ([nextRole, nextId, target]) => {
      sessionStorage.setItem(
        'aura-demo-session',
        JSON.stringify({
          role: nextRole,
          clientId: nextRole === 'client' ? nextId : null,
          therapistId: nextRole === 'therapist' ? nextId : null,
        }),
      )
      // Replace the URL without notifying the router, so the reload boots straight into the target.
      history.replaceState(null, '', `#${target}`)
    },
    [role, id, hash] as const,
  )
  await page.reload()
}

/** A fresh synthetic practice at a fixed, controllable time. */
export async function freshDemo(page: Page, at: Date = DAY_SEVEN) {
  await page.clock.install({ time: at })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/AURA/#/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('aura-synthetic-demo')
        request.onsuccess = request.onerror = request.onblocked = () => resolve()
      }),
  )
  await page.reload()
}

/** Horizontal offset of a marker dot from the figure's centre: positive means right of centre. */
export async function dotOffset(page: Page, area: string) {
  const figure = page.locator('.body-stage').first()
  // Works for the live WebGL figure and for the print-render fallback alike.
  const dot = figure.locator(`.body-dot[data-area="${area}"]`)
  await expect(dot).toBeVisible({ timeout: 20_000 })
  const box = await figure.boundingBox()
  const dotBox = await dot.boundingBox()
  if (!box || !dotBox) throw new Error('No marker on the figure')
  return dotBox.x + dotBox.width / 2 - (box.x + box.width / 2)
}
