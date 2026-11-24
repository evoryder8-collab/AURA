import { isBodyViews, type BodyViews } from './fallback'

let views: Promise<BodyViews | null> | null = null

/** The orthographic frames of the print renders, loaded once and shared. */
export function loadBodyViews(): Promise<BodyViews | null> {
  views ??= fetch(`${import.meta.env.BASE_URL}body/views.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => (isBodyViews(value) ? value : null))
    .catch(() => null)
  return views
}
