import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  tone?: 'default' | 'dark' | 'soft' | 'gold' | 'concern'
  interactive?: boolean
  eyebrow?: string
  title?: string
  action?: ReactNode
}

export function Card({
  as: Element = 'article',
  tone = 'default',
  interactive,
  eyebrow,
  title,
  action,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Element
      className={clsx('card', `card--${tone}`, interactive && 'card--interactive', className)}
      {...props}
    >
      {(eyebrow || title || action) && (
        <header className="card__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2 className="card__title">{title}</h2>}
          </div>
          {action && <div className="card__action">{action}</div>}
        </header>
      )}
      {children}
    </Element>
  )
}
