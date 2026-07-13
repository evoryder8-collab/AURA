import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode
  tone?: 'neutral' | 'favourable' | 'attention' | 'concern' | 'caution' | 'pending' | 'gold'
  icon?: ReactNode
}) {
  return (
    <span className={clsx('badge', `badge--${tone}`)}>
      {icon}
      {children}
    </span>
  )
}
