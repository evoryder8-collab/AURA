import { mirrorKey } from '@/data/demo/mirror'
import { DEMO_STORAGE_KEY } from '@/data/demo/store'

/**
 * What a browser does after one tab saves: it tells every other tab the mirror changed, never the
 * tab that saved. Tests keep several stores in one page, so every store here hears it.
 */
export function announceSave() {
  const key = mirrorKey(DEMO_STORAGE_KEY)
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) }))
}
