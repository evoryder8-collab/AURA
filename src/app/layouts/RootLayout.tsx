import type { MouseEvent } from 'react'
import { Outlet } from 'react-router-dom'
import { env } from '@/config/env'
import { AppStatus } from '@/components/feedback/AppStatus'

export function RootLayout() {
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
      <AppStatus />
      <Outlet />
    </div>
  )
}
