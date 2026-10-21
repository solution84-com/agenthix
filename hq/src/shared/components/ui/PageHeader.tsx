import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {typeof title === 'string' ? (
          <h1 className="text-h1 font-semibold text-text-primary">{title}</h1>
        ) : (
          title
        )}
        {subtitle && <p className="text-body text-text-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
