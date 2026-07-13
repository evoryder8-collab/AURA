import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'

const icons = {
  info: Info,
  caution: ShieldAlert,
  concern: AlertTriangle,
  success: CheckCircle2,
}

export function StatusStrip({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: keyof typeof icons
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  const Icon = icons[tone]
  return (
    <div
      className={`status-strip status-strip--${tone}`}
      role={tone === 'concern' ? 'alert' : 'note'}
    >
      <Icon size={18} aria-hidden="true" />
      <div className="status-strip__copy">
        <strong>{title}</strong>
        {children && <span>{children}</span>}
      </div>
      {action && <div className="status-strip__action">{action}</div>}
    </div>
  )
}
