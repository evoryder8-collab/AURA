import type { MouseEvent } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { LivingSky } from '@/components/sky/LivingSky'
import { env } from '@/config/env'
import { AppStatus } from '@/components/feedback/AppStatus'
import { Spinner } from '@/components/design-system/Spinner'
import { useDemoStore } from '@/data/demo/store'

export function RootLayout() {
  // Screens wait for the saved demo record, so nothing renders (or is saved) against fresh fixtures first.
  const hydrated = useDemoStore((state) => state.hydrated)
  const { pathname } = useLocation()
  const entrance = pathname === '/' || pathname.startsWith('/login')
  const sessionMode = /^\/therapist\/session\/[^/]+$/.test(pathname)
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const main = document.getElementById('main-content')
    if (!main) return
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    main.focus()
  }

  return (
    <div className={env.isProduction ? 'app-root' : 'app-root app-root--test'}>
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Skip to content
      </a>
      {/* The entrance paints its own pool-light scene; everywhere else the aurora moves behind the glass. */}
      {entrance ? null : <LivingSky calm={sessionMode} />}
      <AppStatus />
      {env.demoMode && !hydrated ? <Spinner label="Opening AURA" fullPage /> : <Outlet />}
    </div>
  )
}
