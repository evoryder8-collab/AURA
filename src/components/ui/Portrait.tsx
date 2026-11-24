import { clsx } from 'clsx'
import { useState, type CSSProperties } from 'react'
import type { DemoPortrait } from '@/data/demo/model'
import { assetUrl, monogramGradient } from './assets'


const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('')

/**
 * A head-and-shoulders portrait in an arched window, with a monogram fallback.
 * Decorative by default: the person's name is always printed next to it.
 */
export function Portrait({
  name,
  portrait,
  size = 'md',
  className,
  glow = false,
}: {
  name: string
  portrait?: DemoPortrait | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  glow?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={clsx('portrait', `portrait--${size}`, glow && 'portrait--glow', className)}
      style={{ '--monogram': monogramGradient(name) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="portrait__monogram">{initialsOf(name)}</span>
      {portrait && !failed ? (
        <img src={assetUrl(portrait.avatar)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : null}
    </span>
  )
}
